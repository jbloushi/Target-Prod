const logger = require('../../utils/logger');
let prismaClient;

try {
    const db = require('../../config/database');
    prismaClient = db.prisma;
} catch (e) {
    prismaClient = null;
}

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
    // Terminal statuses are immutable from carrier perspective
    if (['delivered', 'cancelled', 'returned', 'rejected'].includes(status)) {
        return false;
    }

    // Draft or non-carrier shipments don't have external tracking
    const carrierCode = String(shipment.carrierCode || shipment.carrier || '').toUpperCase();
    if (status === 'draft' || carrierCode === 'MANUAL' || carrierCode === 'INTERNAL') {
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
                if (updates && prismaClient && typeof prismaClient.shipment?.update === 'function') {
                    await prismaClient.shipment.update({
                        where: { id: shipment.id },
                        data: {
                            history: updates.history,
                            status: updates.status
                        }
                    });
                    logger.debug(`[trackingCache] Background sync completed for ${trackingNumber}`);
                }
            }
        } catch (error) {
            logger.warn(`[trackingCache] Background sync failed for ${trackingNumber}: ${error.message}`);
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
