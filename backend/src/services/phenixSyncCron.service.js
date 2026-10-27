const logger = require('../utils/logger');
const { getSystemSettings, updateSystemSettings } = require('./systemSettings.service');
const phenixSyncService = require('./phenixSync.service');
const { acquireLease, renewLease, releaseLease, AUTO_SYNC_LOCK_KEY } = require('./phenixImportRun.service');

class PhenixSyncCronService {
    constructor() {
        this.cronTimer = null;
        this.isRunning = false;
        this.isSyncing = false;
        // Periodic heartbeat: check every 60 seconds whether autoSync should run
        this.checkIntervalMs = 60 * 1000;
        this.lastRunTimestamp = 0;
    }

    /**
     * Starts the periodic background Phenix auto-sync monitor
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('[PhenixSyncCron] Started background Phenix ERP auto-sync monitor');

        this.cronTimer = setInterval(() => {
            this.checkAndRun().catch(err => {
                logger.error(`[PhenixSyncCron] Error in scheduled run: ${err.message}`);
            });
        }, this.checkIntervalMs);

        if (this.cronTimer && typeof this.cronTimer.unref === 'function') {
            this.cronTimer.unref();
        }

        // Run once on initial startup if enabled
        setTimeout(() => {
            this.checkAndRun().catch(err => {
                logger.error(`[PhenixSyncCron] Error in startup run: ${err.message}`);
            });
        }, 5000);
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
        logger.info('[PhenixSyncCron] Stopped background Phenix ERP auto-sync');
    }

    /**
     * Check settings and execute sync if due
     */
    async checkAndRun(options = {}) {
        const { force = false } = options;
        if (this.isSyncing) return;

        const settings = getSystemSettings()?.phenixSync || {};
        if (!settings.autoSyncEnabled && !force) {
            return;
        }

        const intervalMinutes = Math.max(1, parseInt(settings.intervalMinutes, 10) || 15);
        const intervalMs = intervalMinutes * 60 * 1000;
        const now = Date.now();
        const sharedLastRun = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt).getTime() : 0;
        const effectiveLastRun = Math.max(this.lastRunTimestamp, Number.isFinite(sharedLastRun) ? sharedLastRun : 0);

        if (!force && effectiveLastRun > 0 && (now - effectiveLastRun < intervalMs)) {
            return;
        }

        const lease = await acquireLease(AUTO_SYNC_LOCK_KEY);
        if (!lease.acquired) {
            logger.info('[PhenixSyncCron] Another worker owns the distributed auto-sync lease; skipping this tick');
            return;
        }

        this.isSyncing = true;
        this.lastRunTimestamp = now;
        const leaseRenewTimer = setInterval(() => {
            renewLease(lease).catch(err => {
                logger.warn(`[PhenixSyncCron] Failed to renew distributed lease: ${err.message}`);
            });
        }, 60 * 1000);
        if (typeof leaseRenewTimer.unref === 'function') leaseRenewTimer.unref();

        logger.info(`[PhenixSyncCron] Auto-pull trigger started (Carrier: ${settings.carrier || 'ALL'}, Window: ${settings.daysBack || 3} days)...`);
        try {
            const summary = await phenixSyncService.syncPhenixShipments({
                carrier: settings.carrier || 'ALL',
                daysBack: settings.daysBack || 3,
                sendWhatsApp: false,
                onlyComplete: settings.onlyComplete !== false
            });

            updateSystemSettings({
                phenixSync: {
                    ...settings,
                    lastAutoSyncAt: new Date().toISOString(),
                    lastAutoSyncStatus: summary.errors?.length ? 'PARTIAL' : 'SUCCESS',
                    lastAutoSyncSummary: {
                        matchedCount: summary.matchedCount,
                        completeCount: summary.completeCount,
                        createdCount: summary.createdCount,
                        updatedCount: summary.updatedCount,
                        carrierSyncedCount: summary.carrierSyncedCount,
                        whatsAppSentCount: summary.whatsAppSentCount,
                        errorsCount: summary.errors?.length || 0
                    }
                }
            });

            logger.info(`[PhenixSyncCron] Auto-pull completed with status ${summary.errors?.length ? 'PARTIAL' : 'SUCCESS'}: Created ${summary.createdCount}, Updated ${summary.updatedCount}, Live Carriers Synced: ${summary.carrierSyncedCount}, Errors: ${summary.errors?.length || 0}`);
        } catch (err) {
            logger.error(`[PhenixSyncCron] Auto-pull execution failed: ${err.message}`);
            updateSystemSettings({
                phenixSync: {
                    ...settings,
                    lastAutoSyncAt: new Date().toISOString(),
                    lastAutoSyncStatus: 'FAILED',
                    lastAutoSyncSummary: { error: err.message }
                }
            });
        } finally {
            clearInterval(leaseRenewTimer);
            this.isSyncing = false;
            await releaseLease(lease).catch(err => {
                logger.warn(`[PhenixSyncCron] Failed to release distributed lease: ${err.message}`);
            });
        }
    }
}

module.exports = new PhenixSyncCronService();
