#!/usr/bin/env node
/**
 * Retroactive Aramex Tracking History Sync Tool
 * 
 * Synchronizes official Aramex tracking history and status for October and November shipments
 * using the official Aramex ShippingAPI.V2 (with Universal Tracker fallback).
 * 
 * Usage:
 *   node backend/scripts/sync-aramex-history.js [--dry-run] [--from=2026-10-01] [--to=2026-11-30] [--limit=50] [--delay=350] [--status=all|active|delivered]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { prisma } = require('../src/config/database');
const {
    syncCarrierTrackingHistory,
    resolveCarrierTrackingNumber,
    buildTrackingSyncDocuments,
    compactHistory
} = require('../src/controllers/shipment.helpers');

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        dryRun: false,
        from: '2026-10-01',
        to: '2026-11-30',
        limit: null,
        delayMs: 350,
        statusFilter: 'all', // 'all', 'active', or 'delivered'
        includeDemo: false
    };

    for (const arg of args) {
        if (arg === '--dry-run' || arg === '-d') {
            options.dryRun = true;
        } else if (arg === '--include-demo') {
            options.includeDemo = true;
        } else if (arg.startsWith('--from=')) {
            options.from = arg.split('=')[1].trim();
        } else if (arg.startsWith('--to=')) {
            options.to = arg.split('=')[1].trim();
        } else if (arg.startsWith('--limit=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val > 0) options.limit = val;
        } else if (arg.startsWith('--delay=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val >= 0) options.delayMs = val;
        } else if (arg.startsWith('--status=')) {
            options.statusFilter = arg.split('=')[1].trim().toLowerCase();
        }
    }

    return options;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const options = parseArgs();

    console.log('\n================================================================');
    console.log('📦 ARAMEX RETROACTIVE TRACKING HISTORY SYNCHRONIZATION');
    console.log(`Mode:          ${options.dryRun ? '🔍 DRY RUN (No carrier calls / No DB writes)' : '⚡ LIVE SYNC'}`);
    console.log(`Date Window:   ${options.from} to ${options.to}`);
    console.log(`Status Filter: ${options.statusFilter.toUpperCase()}`);
    if (options.limit) console.log(`Limit:         ${options.limit} shipments`);
    console.log(`Delay:         ${options.delayMs}ms between API requests`);
    console.log('================================================================\n');

    const fromDate = new Date(`${options.from}T00:00:00.000Z`);
    const toDate = new Date(`${options.to}T23:59:59.999Z`);

    const whereClause = {
        carrierCode: 'ARAMEX',
        createdAt: {
            gte: fromDate,
            lte: toDate
        }
    };

    if (!options.includeDemo) {
        whereClause.trackingNumber = { not: { contains: 'DEMO' } };
    }

    if (options.statusFilter === 'active') {
        whereClause.status = { notIn: ['delivered', 'cancelled', 'returned'] };
    } else if (options.statusFilter === 'delivered') {
        whereClause.status = 'delivered';
    }

    const totalMatching = await prisma.shipment.count({ where: whereClause });
    console.log(`Found ${totalMatching} Aramex shipment(s) matching criteria.`);

    if (totalMatching === 0) {
        console.log('No shipments to process. Exiting.');
        return;
    }

    const shipments = await prisma.shipment.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        ...(options.limit ? { take: options.limit } : {}),
        select: {
            id: true,
            trackingNumber: true,
            dhlTrackingNumber: true,
            carrierShipmentId: true,
            carrierCode: true,
            status: true,
            createdAt: true,
            history: true,
            documents: true,
            pricingSnapshot: true,
            origin: true,
            destination: true
        }
    });

    console.log(`Selected ${shipments.length} shipment(s) for execution.\n`);

    if (options.dryRun) {
        console.log('--- Dry Run Preview (First 10 Shipments) ---');
        shipments.slice(0, 10).forEach((s, idx) => {
            const awb = resolveCarrierTrackingNumber(s) || s.dhlTrackingNumber || s.trackingNumber;
            const eventsCount = Array.isArray(s.history) ? s.history.length : 0;
            console.log(`  [${idx + 1}] ${s.trackingNumber} (AWB: ${awb}) | Status: ${s.status} | Checkpoints: ${eventsCount} | Date: ${s.createdAt.toISOString().slice(0, 10)}`);
        });
        if (shipments.length > 10) {
            console.log(`  ... and ${shipments.length - 10} more.`);
        }
        console.log('\n[DRY RUN COMPLETE] To execute live sync, re-run without --dry-run.');
        return;
    }

    const summary = {
        total: shipments.length,
        synced: 0,
        updated: 0,
        unchanged: 0,
        failed: 0
    };

    for (let i = 0; i < shipments.length; i++) {
        const s = shipments[i];
        const awb = resolveCarrierTrackingNumber(s) || s.dhlTrackingNumber || s.trackingNumber.replace(/^TRK-/i, '');
        const progress = `[${i + 1}/${shipments.length}]`;

        process.stdout.write(`${progress} #${s.trackingNumber} (AWB: ${awb})... `);

        try {
            const updates = await syncCarrierTrackingHistory(s);
            summary.synced++;

            if (!updates) {
                console.log('⚪ No carrier events returned');
                summary.unchanged++;
                continue;
            }

            const currentHistory = Array.isArray(s.history) ? s.history : [];
            const newHistory = Array.isArray(updates.history) ? updates.history : currentHistory;
            const statusChanged = Boolean(updates.status && updates.status !== s.status);
            const historyLengthChanged = newHistory.length !== currentHistory.length;

            if (statusChanged || historyLengthChanged) {
                const dataToUpdate = {
                    history: newHistory,
                    status: updates.status || s.status,
                    documents: typeof buildTrackingSyncDocuments === 'function'
                        ? buildTrackingSyncDocuments(s, updates)
                        : (s.documents || {})
                };

                if (updates.actualWeight || updates.totalPieces) {
                    dataToUpdate.pricingSnapshot = {
                        ...(s.pricingSnapshot || {}),
                        carrierWeight: updates.actualWeight || s.pricingSnapshot?.carrierWeight,
                        carrierPieces: updates.totalPieces || s.pricingSnapshot?.carrierPieces
                    };
                }

                await prisma.shipment.update({
                    where: { id: s.id },
                    data: dataToUpdate
                });

                const statusInfo = statusChanged ? ` | ${s.status} -> ${updates.status}` : ` | ${updates.status}`;
                console.log(`🟢 Updated! (${currentHistory.length} -> ${newHistory.length} checkpoints${statusInfo})`);
                summary.updated++;
            } else {
                console.log(`⚪ Up to date (${currentHistory.length} checkpoints)`);
                summary.unchanged++;
            }
        } catch (err) {
            console.log(`⚠️ Failed: ${err.message}`);
            summary.failed++;
        }

        if (options.delayMs > 0 && i < shipments.length - 1) {
            await sleep(options.delayMs);
        }
    }

    console.log('\n================================================================');
    console.log('🏁 ARAMEX TRACKING SYNCHRONIZATION SUMMARY');
    console.log('================================================================');
    console.log(`Total Scanned:      ${summary.total}`);
    console.log(`Queried Carrier:    ${summary.synced}`);
    console.log(`Updated in DB:      ${summary.updated}`);
    console.log(`Already Up to Date: ${summary.unchanged}`);
    console.log(`Errors / Failed:    ${summary.failed}`);
    console.log('================================================================\n');
}

main()
    .catch((err) => {
        console.error('Fatal sync error:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
