const logger = require('../utils/logger');
const { prisma } = require('../config/database');
const trytonClient = require('./tryton/trytonClient');
const auditor = require('./tryton/parityAuditor');

class TrytonShadowCronService {
    constructor() {
        this.cronTimer = null;
        this.isRunning = false;
        this.isReconciling = false;
        // Default interval: 12 hours (43,200,000 ms)
        this.intervalMs = parseInt(process.env.TRYTON_CRON_RECONCILE_INTERVAL_MS, 10) || 12 * 60 * 60 * 1000;
        this.initialDelayMs = parseInt(process.env.TRYTON_CRON_INITIAL_DELAY_MS, 10) || 15 * 1000;
        this.lastReport = null;
    }

    /**
     * Starts the continuous background reconciliation cron
     */
    start() {
        if (this.isRunning) return;
        if (process.env.TRYTON_ENABLED === 'false' || process.env.TRYTON_SHADOW_CRON_ENABLED === 'false') {
            logger.info('[TrytonShadowCron] Background reconciliation disabled by environment config');
            return;
        }

        this.isRunning = true;
        const intervalHours = (this.intervalMs / (60 * 60 * 1000)).toFixed(1);
        logger.info(`[TrytonShadowCron] Started Tryton ERP shadow parity monitor (reconciliation interval: ${intervalHours}h)`);

        // Trigger startup reconciliation after initial delay
        setTimeout(() => {
            this.runReconciliation().catch(err => {
                logger.error(`[TrytonShadowCron] Error in initial reconciliation: ${err.message}`);
            });
        }, this.initialDelayMs);

        this.cronTimer = setInterval(() => {
            this.runReconciliation().catch(err => {
                logger.error(`[TrytonShadowCron] Error in scheduled reconciliation: ${err.message}`);
            });
        }, this.intervalMs);

        if (this.cronTimer && typeof this.cronTimer.unref === 'function') {
            this.cronTimer.unref();
        }
    }

    /**
     * Stops the periodic reconciliation cron
     */
    stop() {
        this.isRunning = false;
        if (this.cronTimer) {
            clearInterval(this.cronTimer);
            this.cronTimer = null;
        }
        logger.info('[TrytonShadowCron] Stopped Tryton ERP shadow parity monitor');
    }

    /**
     * Executes idempotent parity catch-up & workflow reconciliation
     */
    async runReconciliation(options = {}) {
        if (this.isReconciling) {
            logger.warn('[TrytonShadowCron] Reconciliation already in progress. Skipping overlapping run.');
            return { skipped: true, reason: 'ALREADY_RUNNING' };
        }

        if (!trytonClient.enabled) {
            logger.debug('[TrytonShadowCron] Tryton client disabled. Skipping reconciliation.');
            return { skipped: true, reason: 'TRYTON_DISABLED' };
        }

        this.isReconciling = true;
        const startTime = Date.now();
        logger.info('[TrytonShadowCron] 🚀 Running automatic shadow reconciliation...');

        try {
            // 1. Fetch all existing carrier waybills and states from Tryton ERP
            const trytonRecords = await trytonClient.modelCall(
                'stock.shipment.out',
                'search_read',
                [],
                0,
                20000,
                null,
                ['id', 'carrier_waybill', 'state']
            );
            const trytonMap = new Map();
            for (const r of (trytonRecords || [])) {
                if (r.carrier_waybill) trytonMap.set(r.carrier_waybill, r);
            }

            // 2. Fetch all MySQL shipments
            const mysqlShipments = await prisma.shipment.findMany({
                include: { user: true, organization: true },
                orderBy: { createdAt: 'desc' }
            });

            // 3. Mirror any missing shipments (heal volume delta)
            const missing = mysqlShipments.filter(s => s.trackingNumber && !trytonMap.has(s.trackingNumber));
            let createdCount = 0;
            if (missing.length > 0) {
                logger.warn(`[TrytonShadowCron] Found ${missing.length} shipments missing in Tryton. Self-healing...`);
                for (const s of missing) {
                    try {
                        const res = await trytonClient.mirrorShipment(s);
                        if (res && res.trytonShipmentId) {
                            trytonMap.set(s.trackingNumber, { id: res.trytonShipmentId, carrier_waybill: s.trackingNumber, state: 'client_submitted' });
                            createdCount++;
                        }
                    } catch (mirrorErr) {
                        logger.debug(`[TrytonShadowCron] Could not mirror ${s.trackingNumber}: ${mirrorErr.message}`);
                    }
                }
            }

            // 4. Synchronize workflow states for any lagged records
            let advancedCount = 0;
            for (const s of mysqlShipments) {
                if (!s.trackingNumber) continue;
                const tr = trytonMap.get(s.trackingNumber);
                if (!tr) continue;

                // Check if Tryton is behind operational reality
                const realStatus = String(s.status || '').toLowerCase().trim();
                const isAdvancedState = ['booked', 'in_transit', 'out_for_delivery', 'delivered'].includes(realStatus);
                const isDelivered = realStatus === 'delivered';
                const isCancelled = realStatus === 'cancelled';

                if (tr.state === 'client_submitted' && isAdvancedState) {
                    try {
                        await trytonClient.modelCall('stock.shipment.out', 'receive_at_hub', [tr.id]);
                        await trytonClient.modelCall('stock.shipment.out', 'verify', [tr.id]);
                        await trytonClient.modelCall('stock.shipment.out', 'book_carrier', [tr.id]);
                        if (isDelivered) {
                            await trytonClient.modelCall('stock.shipment.out', 'done', [tr.id]);
                        }
                        tr.state = isDelivered ? 'done' : 'carrier_booked';
                        advancedCount++;
                    } catch (stateErr) {}
                } else if (tr.state === 'carrier_booked' && isDelivered) {
                    try {
                        await trytonClient.modelCall('stock.shipment.out', 'done', [tr.id]);
                        tr.state = 'done';
                        advancedCount++;
                    } catch (stateErr) {}
                } else if (isCancelled && tr.state !== 'cancelled') {
                    try {
                        await trytonClient.modelCall('stock.shipment.out', 'cancel', [tr.id]);
                        tr.state = 'cancelled';
                        advancedCount++;
                    } catch (stateErr) {}
                }
            }

            // 5. Run Parity Verification Audit
            const auditSample = await auditor.auditShipmentParity(100);
            const ledgerAudit = await auditor.auditLedgerInvariant();
            const trytonTotal = trytonMap.size;
            const mysqlTotal = mysqlShipments.length;
            const volumeDelta = mysqlTotal - trytonTotal;

            const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

            this.lastReport = {
                timestamp: new Date().toISOString(),
                durationSeconds: Number(durationSec),
                mysqlTotal,
                trytonTotal,
                volumeDelta,
                healedShipments: createdCount,
                advancedStates: advancedCount,
                sampleMatchRate: auditSample.matchRate,
                ledgerDriftKwd: ledgerAudit?.drift ?? 0.000,
                isLedgerBalanced: ledgerAudit?.isInvariantHold ?? true
            };

            logger.info(`[TrytonShadowCron] ✅ Reconciliation finished in ${durationSec}s: ` +
                `Tryton=${trytonTotal}/${mysqlTotal} (Δ=${volumeDelta}), ` +
                `Healed=${createdCount}, StatesAdvanced=${advancedCount}, ` +
                `MatchRate=${auditSample.matchRate}%, ` +
                `LedgerDrift=${this.lastReport.ledgerDriftKwd} KWD`);

            return this.lastReport;
        } catch (err) {
            logger.error(`[TrytonShadowCron] Reconciliation error: ${err.message}`, { stack: err.stack });
            throw err;
        } finally {
            this.isReconciling = false;
        }
    }

    /**
     * Get the latest reconciliation report
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isReconciling: this.isReconciling,
            intervalMs: this.intervalMs,
            lastReport: this.lastReport
        };
    }
}

module.exports = new TrytonShadowCronService();
