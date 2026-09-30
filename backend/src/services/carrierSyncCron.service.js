const logger = require('../utils/logger');
const { prisma } = require('../config/database');
const { syncCarrierTrackingHistory, resolveCarrierTrackingNumber, autoHealAllResolvedExceptions } = require('../controllers/shipment.helpers');
const { markTrackingSynced } = require('./queue/trackingCache');
const chatwootNotificationService = require('./chatwootNotificationService');

class CarrierSyncCronService {
    constructor() {
        this.cronTimer = null;
        this.isRunning = false;
        this.isSyncing = false;
        // Default interval: 15 minutes
        this.intervalMs = parseInt(process.env.CARRIER_CRON_SYNC_INTERVAL_MS, 10) || 15 * 60 * 1000;
        this.batchSize = parseInt(process.env.CARRIER_CRON_SYNC_BATCH_SIZE, 10) || 20;
        this.concurrency = 2; // Polite scraper concurrency to protect server IP
    }

    /**
     * Starts the periodic carrier tracking sync cron
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info(`[CarrierSyncCron] Started periodic carrier sync (interval: ${this.intervalMs / 1000}s)`);

        // Trigger initial run in background to heal stale records and sync active shipments on startup
        setImmediate(() => {
            this.runSyncBatch().catch(err => {
                logger.error(`[CarrierSyncCron] Error in initial startup batch: ${err.message}`);
            });
        });

        this.cronTimer = setInterval(() => {
            this.runSyncBatch().catch(err => {
                logger.error(`[CarrierSyncCron] Error in scheduled batch: ${err.message}`);
            });
        }, this.intervalMs);

        if (this.cronTimer && typeof this.cronTimer.unref === 'function') {
            this.cronTimer.unref();
        }
    }

    /**
     * Stops the periodic cron
     */
    stop() {
        this.isRunning = false;
        if (this.cronTimer) {
            clearInterval(this.cronTimer);
            this.cronTimer = null;
        }
        logger.info('[CarrierSyncCron] Stopped periodic carrier sync');
    }

    /**
     * Executes a tracking sync across active, non-terminal shipments
     * @param {Object} [options]
     * @param {number} [options.limit]
     * @param {string} [options.carrier]
     * @returns {Promise<{ scanned: number, synced: number, updated: number, errors: number, results: Array }>}
     */
    async runSyncBatch(options = {}) {
        if (this.isSyncing) {
            logger.info('[CarrierSyncCron] Sync already in progress, skipping concurrent trigger');
            return { scanned: 0, synced: 0, updated: 0, errors: 0, skipped: true };
        }

        this.isSyncing = true;
        const limit = options.limit || this.batchSize;
        const carrierFilter = options.carrier ? String(options.carrier).toUpperCase() : undefined;

        const summary = {
            scanned: 0,
            synced: 0,
            updated: 0,
            errors: 0,
            results: []
        };

        try {
            if (!prisma || typeof prisma.shipment?.findMany !== 'function') {
                logger.warn('[CarrierSyncCron] Prisma client not available');
                return summary;
            }

            // 1. Auto-heal any stale exception consignments whose carrier movement has resumed
            try {
                const healedCount = await autoHealAllResolvedExceptions(prisma);
                if (healedCount > 0) {
                    summary.healed = healedCount;
                    logger.info(`[CarrierSyncCron] Auto-healed ${healedCount} shipments with resolved exceptions`);
                }
            } catch (healErr) {
                logger.warn(`[CarrierSyncCron] Error during auto-heal pass: ${healErr.message}`);
            }

            const activeStatuses = ['created', 'pending', 'booked', 'picked_up', 'in_transit', 'out_for_delivery', 'received_at_hub', 'verified', 'exception'];
            const maxAgeDays = parseInt(options.maxDays || process.env.CARRIER_CRON_MAX_AGE_DAYS, 10) || 7;
            const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

            const whereClause = {
                status: { in: activeStatuses },
                createdAt: { gte: cutoffDate }
            };

            if (carrierFilter) {
                whereClause.AND = [
                    {
                        OR: [
                            { carrier: carrierFilter },
                            { carrierCode: carrierFilter }
                        ]
                    }
                ];
            }

            const candidates = await prisma.shipment.findMany({
                where: whereClause,
                orderBy: { updatedAt: 'asc' },
                take: limit
            });

            summary.scanned = candidates.length;
            if (candidates.length === 0) {
                logger.debug('[CarrierSyncCron] No active shipments due for sync');
                return summary;
            }

            logger.info(`[CarrierSyncCron] Processing batch of ${candidates.length} active shipments`);

            // Concurrency-limited processing
            const chunks = [];
            for (let i = 0; i < candidates.length; i += this.concurrency) {
                chunks.push(candidates.slice(i, i + this.concurrency));
            }

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const chunkPromises = chunk.map(async (shipment) => {
                    const carrierTracking = resolveCarrierTrackingNumber(shipment);
                    const carrierCode = String(shipment.carrierCode || shipment.carrier || '').toUpperCase();

                    if (!carrierTracking || carrierCode === 'MANUAL' || carrierCode === 'INTERNAL') {
                        // Touch updatedAt so internal/manual shipments rotate to back of queue
                        await prisma.shipment.update({
                            where: { id: shipment.id },
                            data: { updatedAt: new Date() }
                        }).catch(() => {});
                        return {
                            trackingNumber: shipment.trackingNumber,
                            status: shipment.status,
                            updated: false,
                            note: 'Skipped - Internal/Manual'
                        };
                    }

                    try {
                        const updates = await syncCarrierTrackingHistory(shipment);
                        summary.synced++;

                        if (updates && (
                            updates.status !== shipment.status || 
                            updates.history?.length !== shipment.history?.length ||
                            (updates.estimatedDelivery && (!shipment.estimatedDelivery || new Date(shipment.estimatedDelivery).getTime() !== new Date(updates.estimatedDelivery).getTime()))
                        )) {
                            const dataToUpdate = {
                                history: updates.history,
                                status: updates.status
                            };
                            if (updates.estimatedDelivery) {
                                dataToUpdate.estimatedDelivery = updates.estimatedDelivery;
                            }
                            if (updates.actualWeight || updates.totalPieces) {
                                dataToUpdate.pricingSnapshot = {
                                    ...(shipment.pricingSnapshot || {}),
                                    carrierWeight: updates.actualWeight || shipment.pricingSnapshot?.carrierWeight,
                                    carrierPieces: updates.totalPieces || shipment.pricingSnapshot?.carrierPieces
                                };
                            }
                            const updatedShipment = await prisma.shipment.update({
                                where: { id: shipment.id },
                                data: dataToUpdate
                            });

                            markTrackingSynced(shipment.trackingNumber);
                            summary.updated++;

                            // If status promoted, trigger notification
                            if (updates.status !== shipment.status) {
                                const eventType = chatwootNotificationService.mapStatusToNotificationEvent(updates.status);
                                if (eventType) {
                                    chatwootNotificationService.triggerShipmentNotification(eventType, updatedShipment);
                                }
                            }

                            return {
                                trackingNumber: shipment.trackingNumber,
                                previousStatus: shipment.status,
                                newStatus: updates.status,
                                updated: true
                            };
                        }

                        // Touch updatedAt so unchanged shipments rotate to back of queue
                        await prisma.shipment.update({
                            where: { id: shipment.id },
                            data: { updatedAt: new Date() }
                        }).catch(() => {});

                        markTrackingSynced(shipment.trackingNumber);
                        return {
                            trackingNumber: shipment.trackingNumber,
                            status: shipment.status,
                            updated: false
                        };
                    } catch (err) {
                        summary.errors++;
                        logger.warn(`[CarrierSyncCron] Failed sync for ${shipment.trackingNumber}: ${err.message}`);
                        return {
                            trackingNumber: shipment.trackingNumber,
                            error: err.message,
                            updated: false
                        };
                    }
                });

                const chunkResults = await Promise.all(chunkPromises);
                summary.results.push(...chunkResults);

                // Add polite delay between chunks to avoid rate limiting and bot detection
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 600));
                }
            }

            logger.info(`[CarrierSyncCron] Batch finished: scanned=${summary.scanned}, synced=${summary.synced}, updated=${summary.updated}, errors=${summary.errors}`);
            return summary;
        } finally {
            this.isSyncing = false;
        }
    }
}

const carrierSyncCronService = new CarrierSyncCronService();
module.exports = carrierSyncCronService;
