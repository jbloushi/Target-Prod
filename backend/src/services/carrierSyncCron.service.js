const logger = require('../utils/logger');
const { prisma } = require('../config/database');
const { syncCarrierTrackingHistory, resolveCarrierTrackingNumber } = require('../controllers/shipment.helpers');
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
        this.concurrency = 5;
    }

    /**
     * Starts the periodic carrier tracking sync cron
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info(`[CarrierSyncCron] Started periodic carrier sync (interval: ${this.intervalMs / 1000}s)`);

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

            const activeStatuses = ['booked', 'picked_up', 'in_transit', 'out_for_delivery', 'received_at_hub', 'verified'];
            
            const whereClause = {
                status: { in: activeStatuses }
            };

            if (carrierFilter) {
                whereClause.OR = [
                    { carrier: carrierFilter },
                    { carrierCode: carrierFilter }
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

            for (const chunk of chunks) {
                const chunkPromises = chunk.map(async (shipment) => {
                    const carrierTracking = resolveCarrierTrackingNumber(shipment);
                    const carrierCode = String(shipment.carrierCode || shipment.carrier || '').toUpperCase();

                    if (!carrierTracking || carrierCode === 'MANUAL' || carrierCode === 'INTERNAL') {
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

                        if (updates && (updates.status !== shipment.status || updates.history?.length !== shipment.history?.length)) {
                            const updatedShipment = await prisma.shipment.update({
                                where: { id: shipment.id },
                                data: {
                                    history: updates.history,
                                    status: updates.status
                                }
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
