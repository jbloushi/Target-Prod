const logger = require('../../utils/logger');
const { isTerminalStatus } = require('../../constants/statusConstants');
const { compactHistory } = require('../../controllers/shipment.helpers');

let dbModule = null;
try {
    dbModule = require('../../config/database');
} catch (e) {
    dbModule = null;
}

function getPrismaClient() {
    return dbModule?.prisma || null;
}

let prismaClient = getPrismaClient();

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const trackingSyncCache = new Map(); // trackingNumber -> lastSyncTimestamp (ms)
const trackingSyncInFlight = new Set(); // trackingNumbers currently syncing

/**
 * Checks if a shipment's tracking should be synced with external carrier
 * @param {Object} shipment
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
function isTrackingSyncDue(shipment, ttlMs) {
    if (!shipment || !shipment.trackingNumber) return false;
    
    const effectiveTtl = Number.isInteger(ttlMs) 
        ? ttlMs 
        : (parseInt(process.env.TRACKING_CACHE_TTL_MS, 10) || DEFAULT_TTL_MS);

    const status = String(shipment.status || '').toLowerCase();
    // Terminal statuses and draft shipments are not due for carrier tracking
    if (['draft', 'delivered', 'cancelled', 'returned', 'rejected'].includes(status)) {
        return false;
    }

    // Non-carrier shipments don't have external tracking
    const carrierCode = String(shipment.carrierCode || shipment.carrier || '').toUpperCase();
    if (carrierCode === 'MANUAL' || carrierCode === 'INTERNAL') {
        return false;
    }

    const lastSync = trackingSyncCache.get(shipment.trackingNumber);
    if (!lastSync) return true;

    return (Date.now() - lastSync) > effectiveTtl;
}

/**
 * Records a successful tracking sync in the TTL cache
 */
function markTrackingSynced(trackingNumber) {
    if (trackingNumber) {
        trackingSyncCache.set(trackingNumber, Date.now());
    }
}

/**
 * Triggers a non-blocking background tracking refresh for a shipment
 * @param {Object} shipment
 * @param {Function} syncFn - The syncCarrierTrackingHistory function
 */
function triggerBackgroundTrackingSync(shipment, syncFn) {
    if (!shipment || !shipment.trackingNumber) return;
    const trackingNumber = shipment.trackingNumber;

    if (trackingSyncInFlight.has(trackingNumber)) {
        return; // Thundering herd protection: already in flight
    }

    trackingSyncInFlight.add(trackingNumber);
    trackingSyncCache.set(trackingNumber, Date.now()); // Mark cached to avoid duplicate triggers

    setImmediate(async () => {
        try {
            if (typeof syncFn === 'function') {
                const updates = await syncFn(shipment);
                const client = getPrismaClient() || prismaClient;

                if (updates && client && typeof client.shipment?.update === 'function') {
                    let currentStatus = shipment.status;
                    let existingDocuments = shipment.documents;
                    let existingHistory = Array.isArray(shipment.history) ? shipment.history : [];

                    if (typeof client.shipment?.findUnique === 'function') {
                        const fresh = await client.shipment.findUnique({
                            where: { id: shipment.id },
                            select: { id: true, status: true, history: true, documents: true }
                        });

                        if (!fresh) {
                            logger.info(`[trackingCache] Shipment ${trackingNumber} no longer exists, skipping background sync update`);
                            return;
                        }

                        currentStatus = fresh.status;
                        existingDocuments = fresh.documents;
                        if (Array.isArray(fresh.history)) {
                            existingHistory = fresh.history;
                        }
                    }

                    // Guard against regressing terminal statuses (delivered, cancelled, returned)
                    const targetStatus = isTerminalStatus(currentStatus)
                        ? currentStatus
                        : (updates.status || currentStatus);

                    const resolvedHistory = Array.isArray(updates.history)
                        ? (existingHistory.length > 0 ? compactHistory([...existingHistory, ...updates.history]) : updates.history)
                        : existingHistory;

                    const updateData = {
                        history: resolvedHistory,
                        status: targetStatus
                    };

                    if (updates.trackingSyncMeta) {
                        updateData.documents = {
                            ...(existingDocuments && typeof existingDocuments === 'object' ? existingDocuments : {}),
                            trackingSync: updates.trackingSyncMeta
                        };
                    }

                    if (updates.estimatedDelivery) {
                        updateData.estimatedDelivery = updates.estimatedDelivery;
                    }

                    await client.shipment.update({
                        where: { id: shipment.id },
                        data: updateData
                    });

                    logger.debug(`[trackingCache] Background sync completed for ${trackingNumber}`);
                }
            }
        } catch (error) {
            const isP2025 = error?.code === 'P2025' ||
                (error?.message && (
                    error.message.includes('P2025') ||
                    error.message.includes('Record to update not found') ||
                    error.message.includes('No record was found for an update') ||
                    error.message.includes('records that were required but not found')
                ));

            if (isP2025) {
                logger.info(`[trackingCache] Shipment ${trackingNumber} deleted during background refresh (P2025)`);
            } else {
                logger.warn(`[trackingCache] Background sync failed for ${trackingNumber}: ${error.message}`);
            }
        } finally {
            trackingSyncInFlight.delete(trackingNumber);
        }
    });
}

/**
 * Clear cache (useful for testing)
 */
function clearCache() {
    trackingSyncCache.clear();
    trackingSyncInFlight.clear();
}

module.exports = {
    isTrackingSyncDue,
    markTrackingSynced,
    triggerBackgroundTrackingSync,
    clearCache
};
