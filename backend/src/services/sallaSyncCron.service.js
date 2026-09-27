const logger = require('../utils/logger');
const sallaIntegrationService = require('./sallaIntegration.service');

class SallaSyncCronService {
    constructor() {
        this.cronTimer = null;
        this.isRunning = false;
        this.isSyncing = false;
        // Run periodic sync every 15 minutes
        this.checkIntervalMs = 15 * 60 * 1000;
        this.lastRunTimestamp = 0;
    }

    /**
     * Starts the periodic background Salla stock & tracking sync
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('[SallaSyncCron] Started background Salla stock & delivery tracking sync monitor (15m interval)');

        this.cronTimer = setInterval(() => {
            this.runSync().catch(err => {
                logger.error(`[SallaSyncCron] Error in scheduled sync: ${err.message}`);
            });
        }, this.checkIntervalMs);

        if (this.cronTimer && typeof this.cronTimer.unref === 'function') {
            this.cronTimer.unref();
        }

        // Run once 10 seconds after server startup
        setTimeout(() => {
            this.runSync().catch(err => {
                logger.error(`[SallaSyncCron] Error in startup sync: ${err.message}`);
            });
        }, 10000);
    }

    /**
     * Stops the periodic background monitor
     */
    stop() {
        this.isRunning = false;
        if (this.cronTimer) {
            clearInterval(this.cronTimer);
            this.cronTimer = null;
        }
        logger.info('[SallaSyncCron] Stopped background Salla sync');
    }

    /**
     * Runs both stock sync and shipment tracking sync
     */
    async runSync() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        this.lastRunTimestamp = Date.now();

        try {
            logger.info('[SallaSyncCron] Starting scheduled 2-way sync (LogesTechs ➔ Salla)...');

            // 1. Sync Stock Quantities
            const stockResult = await sallaIntegrationService.syncStockFromLogesTechs();
            logger.info(`[SallaSyncCron] Stock sync completed: ${stockResult.updatedCount || 0} items updated.`);

            // 2. Sync Shipment Tracking & Statuses
            const trackingResult = await sallaIntegrationService.syncShipmentTrackingToSalla();
            logger.info(`[SallaSyncCron] Tracking sync completed: ${trackingResult.syncedCount || 0} orders processed.`);

        } catch (error) {
            logger.error(`[SallaSyncCron] Sync cycle encountered error: ${error.message}`);
        } finally {
            this.isSyncing = false;
        }
    }
}

module.exports = new SallaSyncCronService();
