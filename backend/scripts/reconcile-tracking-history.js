#!/usr/bin/env node
/**
 * Idempotent Production Tracking History & Status Reconciliation Script
 *
 * Usage:
 *   node scripts/reconcile-tracking-history.js [--dry-run] [--carrier=DGR] [--limit=500] [--batch-size=100]
 *
 * Responsibilities:
 *   1. Re-evaluates each event in `Shipment.history` using hardened `normalizeStatus` & `isNegativeOrExceptionPhrase`
 *      so false-positive `'delivered'` scans (e.g. "Consignee premises closed", "Contacted consignee", "Assigned by")
 *      are repaired.
 *   2. Compacts `Shipment.history` via `compactHistory` (collapsing consecutive duplicate carrier scans).
 *   3. Heals top-level `Shipment.status`:
 *      - Demotes false-positive `'delivered'` shipments that have no genuine delivery scan or POD.
 *      - Clears resolved `'exception'` statuses when newer movement (`in_transit`, `received_at_hub`, `out_for_delivery`)
 *        or `'delivered'` scans exist.
 *      - Promotes shipments that have a genuine `'delivered'` scan in history but are still marked in transit/exception.
 *   4. Backfills deduplicated SHA-256 `ShipmentTrackingEvent` relational rows via `persistTrackingEvents`.
 */

require('dotenv').config();
const { prisma } = require('../src/config/database');
const {
    normalizeStatus,
    isNegativeOrExceptionPhrase
} = require('../src/constants/statusConstants');
const {
    compactHistory,
    persistTrackingEvents,
    evaluateRealtimeExceptionStatus
} = require('../src/controllers/shipment.helpers');

function parseCliArgs(argv = process.argv.slice(2)) {
    const opts = {
        dryRun: false,
        carrier: null,
        limit: null,
        batchSize: 100
    };

    for (const arg of argv) {
        if (arg === '--dry-run' || arg === '-d') {
            opts.dryRun = true;
        } else if (arg === '--sync-active' || arg === '-s') {
            opts.syncActive = true;
        } else if (arg.startsWith('--carrier=')) {
            opts.carrier = arg.split('=')[1]?.trim().toUpperCase() || null;
        } else if (arg.startsWith('--limit=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val > 0) opts.limit = val;
        } else if (arg.startsWith('--batch-size=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val > 0) opts.batchSize = val;
        }
    }

    return opts;
}

/**
 * Resolve true normalized status of a single history checkpoint
 */
function evaluateHistoryCheckpointStatus(evt) {
    if (!evt) return 'in_transit';
    const rawStatus = typeof evt.status === 'object'
        ? (evt.status?.status || evt.status?.name || '')
        : String(evt.status || '');
    const desc = String(evt.description || '');
    const code = String(evt.statusCode || evt.code || '');

    if (isNegativeOrExceptionPhrase(desc) || isNegativeOrExceptionPhrase(rawStatus)) {
        return 'exception';
    }

    const normCode = code ? normalizeStatus(code) : null;
    if (normCode === 'exception') return 'exception';

    const normDesc = desc ? normalizeStatus(desc) : null;
    if (normDesc === 'exception') return 'exception';

    if (evt.pod) return 'delivered';

    // If rawStatus was previously saved as 'delivered' on a non-delivery description, repair it
    if (rawStatus.toLowerCase() === 'delivered' && desc && normDesc !== 'delivered' && normCode !== 'delivered') {
        return normDesc || 'in_transit';
    }

    if (normCode === 'delivered' || normDesc === 'delivered') return 'delivered';
    return normalizeStatus(code || desc || rawStatus || 'in_transit');
}

async function reconcileTrackingHistory(options = {}) {
    const {
        dryRun = false,
        carrier = null,
        limit = null,
        batchSize = 100,
        silent = false
    } = options;

    const summary = {
        dryRun,
        totalScanned: 0,
        historiesCompacted: 0,
        falseDeliveredHealed: 0,
        resolvedExceptionsHealed: 0,
        missingDeliveredPromoted: 0,
        relationalEventsUpserted: 0,
        errors: 0
    };

    const where = {};
    if (carrier) {
        if (['DHL', 'DGR'].includes(carrier)) {
            where.carrierCode = { in: ['DHL', 'DGR'] };
        } else if (['OTE', 'LOGESTECHS'].includes(carrier)) {
            where.carrierCode = { in: ['OTE', 'LOGESTECHS'] };
        } else {
            where.carrierCode = carrier;
        }
    }

    if (!silent) {
        console.log(`\n================================================================`);
        console.log(`  TARGET LOGISTICS — TRACKING HISTORY & STATUS RECONCILIATION`);
        console.log(`  Mode: ${dryRun ? 'DRY-RUN (No DB writes)' : 'LIVE EXECUTION'}`);
        if (carrier) console.log(`  Filter Carrier: ${carrier}`);
        if (limit) console.log(`  Limit: ${limit}`);
        console.log(`================================================================\n`);
    }

    let cursorId = null;

    while (true) {
        const remaining = limit ? (limit - summary.totalScanned) : batchSize;
        if (limit && remaining <= 0) break;
        const take = Math.min(batchSize, remaining);

        const shipments = await prisma.shipment.findMany({
            where,
            take,
            ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
            orderBy: { id: 'asc' },
            select: {
                id: true,
                trackingNumber: true,
                carrierCode: true,
                status: true,
                history: true,
                documents: true
            }
        });

        if (!shipments || shipments.length === 0) break;

        for (const shipment of shipments) {
            cursorId = shipment.id;
            summary.totalScanned += 1;

            try {
                const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
                if (rawHistory.length === 0) continue;

                // 1. Repair individual checkpoint statuses in history
                const isAramexShipment = String(shipment.carrierCode || '').toUpperCase() === 'ARAMEX'
                    || /^(?:TRK-)?38\d{9}$/i.test(String(shipment.trackingNumber || ''));
                let checkpointStatusChanged = false;
                const repairedHistory = rawHistory.map((evt) => {
                    if (!evt || typeof evt !== 'object') return evt;
                    if (evt.type === 'comment' || evt.type === 'note' || evt.source === 'staff') return evt;

                    // Aramex's 7th progress point ('Delivered') previously had stale pre-delivery banner text
                    // (e.g. "Delivered - One of our Aramex delivery champion has contacted..." or "Delivered - Shipment trip planned...")
                    // concatenated onto it by FreeWebScraperService._parseAramexHtmlEvents.
                    const rawDesc = String(evt.description || '')
                        .replace(/&#39;|&#x27;/gi, "'")
                        .replace(/&amp;/gi, '&')
                        .trim();
                    if (isAramexShipment && /^Delivered\s*-\s*/i.test(rawDesc)) {
                        const suffix = rawDesc.replace(/^Delivered\s*-\s*/i, '').trim();
                        const suffixNorm = normalizeStatus(suffix);
                        const isGenuineDeliverySuffix = suffixNorm === 'delivered' && !isNegativeOrExceptionPhrase(suffix);
                        const cleanDesc = isGenuineDeliverySuffix
                            ? `Delivered - ${suffix}`
                            : 'Delivered - The shipment has been delivered';
                        if (evt.status !== 'delivered' || evt.description !== cleanDesc) {
                            checkpointStatusChanged = true;
                            return { ...evt, status: 'delivered', description: cleanDesc };
                        }
                        return evt;
                    }

                    const trueStatus = evaluateHistoryCheckpointStatus(evt);
                    const oldStatus = typeof evt.status === 'string' ? evt.status : '';
                    if (oldStatus === 'delivered' && trueStatus !== 'delivered') {
                        checkpointStatusChanged = true;
                        return { ...evt, status: trueStatus };
                    }
                    if (trueStatus === 'exception' && oldStatus !== 'exception') {
                        checkpointStatusChanged = true;
                        return { ...evt, status: 'exception' };
                    }
                    return evt;
                });

                // 2. Compact history
                const compacted = compactHistory(repairedHistory);
                const historyChanged = checkpointStatusChanged || compacted.length !== rawHistory.length;

                // 3. Evaluate top-level Shipment.status
                const currentStatus = normalizeStatus(shipment.status);
                let nextStatus = currentStatus;

                const hasGenuineDelivered = compacted.some((evt) => evaluateHistoryCheckpointStatus(evt) === 'delivered')
                    || Boolean(shipment.documents?.pod);

                const sortedDesc = [...compacted]
                    .filter((e) => e && e.timestamp && e.type !== 'comment' && e.type !== 'note')
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const latestEvt = sortedDesc[0];
                const latestEvtStatus = latestEvt ? evaluateHistoryCheckpointStatus(latestEvt) : currentStatus;

                if (currentStatus === 'delivered' && !hasGenuineDelivered && sortedDesc.length > 0) {
                    // False-positive delivered shipment! Demote to real latest scan status
                    const evaluated = evaluateRealtimeExceptionStatus({ status: latestEvtStatus, history: sortedDesc });
                    nextStatus = (evaluated && evaluated !== 'delivered')
                        ? evaluated
                        : (latestEvtStatus === 'delivered' ? 'in_transit' : (latestEvtStatus || 'in_transit'));
                    summary.falseDeliveredHealed += 1;
                    if (!silent) {
                        console.log(`  [HEAL FALSE DELIVERED] ${shipment.trackingNumber}: delivered -> ${nextStatus} (latest: "${latestEvt?.description || ''}")`);
                    }
                } else if (currentStatus !== 'delivered' && currentStatus !== 'cancelled' && hasGenuineDelivered) {
                    nextStatus = 'delivered';
                    summary.missingDeliveredPromoted += 1;
                    if (!silent) {
                        console.log(`  [PROMOTE DELIVERED]    ${shipment.trackingNumber}: ${shipment.status} -> delivered`);
                    }
                } else if (currentStatus === 'exception' && sortedDesc.length > 0) {
                    if (latestEvtStatus && latestEvtStatus !== 'exception' && ['picked_up', 'received_at_hub', 'in_transit', 'out_for_delivery', 'delivered'].includes(latestEvtStatus)) {
                        nextStatus = latestEvtStatus;
                        summary.resolvedExceptionsHealed += 1;
                        if (!silent) {
                            console.log(`  [CLEAR RESOLVED HOLD]  ${shipment.trackingNumber}: exception -> ${nextStatus}`);
                        }
                    }
                } else if (currentStatus !== 'exception' && currentStatus !== 'delivered' && currentStatus !== 'cancelled' && latestEvtStatus === 'exception') {
                    nextStatus = 'exception';
                    summary.falseDeliveredHealed += 1;
                    if (!silent) {
                        console.log(`  [MARK EXCEPTION]       ${shipment.trackingNumber}: ${shipment.status} -> exception (latest: "${latestEvt?.description || ''}")`);
                    }
                }

                const statusChanged = nextStatus !== shipment.status;

                if (historyChanged) {
                    summary.historiesCompacted += 1;
                }

                if (!dryRun && (historyChanged || statusChanged)) {
                    await prisma.shipment.update({
                        where: { id: shipment.id },
                        data: {
                            ...(historyChanged ? { history: compacted } : {}),
                            ...(statusChanged ? { status: nextStatus } : {})
                        }
                    });
                }

                // 4. Backfill relational ShipmentTrackingEvent rows
                const trackingEvents = compacted.filter((e) => e && e.timestamp && e.type !== 'comment' && e.type !== 'note');
                if (trackingEvents.length > 0) {
                    if (!dryRun) {
                        await persistTrackingEvents(
                            prisma,
                            shipment,
                            trackingEvents.map((e) => ({
                                ...e,
                                statusCode: e.statusCode || e.code || e.status,
                                location: typeof e.location === 'object' ? (e.location?.formattedAddress || e.location?.city || '') : (e.location || '')
                            })),
                            shipment.carrierCode || 'INTERNAL'
                        );
                    }
                    summary.relationalEventsUpserted += trackingEvents.length;
                }
            } catch (err) {
                summary.errors += 1;
                if (!silent) {
                    console.error(`  [ERROR] Failed reconciling ${shipment.trackingNumber}: ${err.message}`);
                }
            }
        }
    }

    if (options.syncActive && !dryRun) {
        const carrierSyncCronService = require('../src/services/carrierSyncCron.service');
        if (!silent) {
            console.log(`  [LIVE ACTIVE SYNC] Polling carrier APIs & Web Scrapers for all active/in-transit shipments (up to 365 days)...`);
        }
        const liveRes = await carrierSyncCronService.runSyncBatch({
            limit: limit || 500,
            force: true,
            carrier: carrier || undefined
        });
        summary.liveActiveScanned = liveRes.scanned || 0;
        summary.liveActiveUpdated = liveRes.updated || 0;
        if (!silent) {
            for (const r of (liveRes.results || [])) {
                if (r.updated) {
                    console.log(`  [LIVE CARRIER UPDATE]  ${r.trackingNumber}: ${r.previousStatus} -> ${r.newStatus}`);
                }
            }
        }
    }

    if (!silent) {
        console.log(`\n================================================================`);
        console.log(`  RECONCILIATION SUMMARY (${dryRun ? 'DRY-RUN' : 'COMMITTED'})`);
        console.log(`================================================================`);
        console.log(`  Shipments Scanned          : ${summary.totalScanned}`);
        console.log(`  Histories Compacted/Fixed  : ${summary.historiesCompacted}`);
        console.log(`  False Delivered Demoted    : ${summary.falseDeliveredHealed}`);
        console.log(`  Resolved Holds Cleared     : ${summary.resolvedExceptionsHealed}`);
        console.log(`  Missing Delivered Promoted : ${summary.missingDeliveredPromoted}`);
        console.log(`  Relational Events Synced   : ${summary.relationalEventsUpserted}`);
        if (options.syncActive && !dryRun) {
            console.log(`  Live Active Polled (365d)  : ${summary.liveActiveScanned || 0}`);
            console.log(`  Live Active Updated        : ${summary.liveActiveUpdated || 0}`);
        }
        console.log(`  Errors                     : ${summary.errors}`);
        console.log(`================================================================\n`);
    }

    return summary;
}

if (require.main === module) {
    const args = parseCliArgs();
    reconcileTrackingHistory(args)
        .then(() => {
            process.exit(0);
        })
        .catch((err) => {
            console.error('Fatal error in reconcile-tracking-history:', err);
            process.exit(1);
        });
}

module.exports = {
    reconcileTrackingHistory,
    evaluateHistoryCheckpointStatus,
    parseCliArgs
};
