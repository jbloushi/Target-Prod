require('dotenv').config();
const { prisma } = require('../src/config/database');
const phenixSyncService = require('../src/services/phenixSync.service');
const { syncCarrierTrackingHistory, resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');

async function main() {
    const isDryRun = !process.argv.includes('--apply');
    const daysBack = parseInt(process.argv[2], 10) || 30; // default 30 days back
    const targetCarrier = (process.argv[3] || 'ALL').toUpperCase();

    console.log('===============================================================');
    console.log(`🔍 PHENIX & CARRIER SYNC: ${isDryRun ? 'DRY-RUN (SIMULATION ONLY)' : 'LIVE EXECUTION (--apply)'}`);
    console.log(`📅 Rolling Window: past ${daysBack} days backwards from today`);
    console.log(`🚚 Carrier Filter: ${targetCarrier}`);
    console.log('===============================================================\n');

    // 1. Preview bills from Phenix ERP
    console.log(`Step 1: Inspecting bills from Phenix ERP API (past ${daysBack} days)...`);
    let phenixReport;
    try {
        phenixReport = await phenixSyncService.previewPhenixShipments({
            daysBack,
            carrier: targetCarrier,
            onlyComplete: false
        });
        console.log(`✅ Phenix ERP response received:`);
        console.log(`   - Total bills fetched in date window: ${phenixReport.totalFetched}`);
        console.log(`   - Matched carrier filter: ${phenixReport.totalMatched}`);
        console.log(`   - Complete actionable records: ${phenixReport.completeCount}`);
        console.log(`   - Incomplete records: ${phenixReport.incompleteCount}`);
    } catch (err) {
        console.warn(`⚠️ Phenix API preview note: ${err.message}`);
    }

    // 2. Scan database shipments created in this period
    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const whereShipments = {
        createdAt: { gte: fromDate }
    };
    if (targetCarrier !== 'ALL') {
        whereShipments.OR = [
            { carrierCode: targetCarrier },
            { carrier: targetCarrier }
        ];
    }

    const dbShipments = await prisma.shipment.findMany({
        where: whereShipments,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            trackingNumber: true,
            dhlTrackingNumber: true,
            carrierCode: true,
            status: true,
            createdAt: true,
            phenixSourceKey: true
        }
    });

    console.log(`\nStep 2: Database shipments in the last ${daysBack} days: ${dbShipments.length} found.`);

    const byCarrier = {};
    let withAwbCount = 0;
    let missingAwbCount = 0;

    for (const s of dbShipments) {
        const c = s.carrierCode || 'UNKNOWN';
        byCarrier[c] = (byCarrier[c] || 0) + 1;
        const awb = resolveCarrierTrackingNumber(s);
        if (awb) withAwbCount++;
        else missingAwbCount++;
    }

    console.table(Object.entries(byCarrier).map(([carrier, count]) => ({
        Carrier: carrier,
        Consignments: count
    })));

    console.log(`\nConsignments with Tracking/AWB ready for API/Scraper sync: ${withAwbCount}`);
    console.log(`Consignments missing Tracking/AWB: ${missingAwbCount}`);

    // Sample inspection
    console.log('\nSample shipments in scope (most recent 5):');
    console.table(dbShipments.slice(0, 5).map(s => ({
        Tracking: s.trackingNumber,
        Carrier_AWB: s.dhlTrackingNumber || 'N/A',
        Carrier: s.carrierCode,
        Status: s.status,
        Date: s.createdAt.toISOString().split('T')[0],
        Phenix_Linked: Boolean(s.phenixSourceKey)
    })));

    if (isDryRun) {
        console.log('\n===============================================================');
        console.log('💡 DRY-RUN SUMMARY (NO DATABASE WRITES WERE PERFORMED)');
        console.log('   To execute live ingestion and update all shipment checkpoints:');
        console.log(`   node scripts/reconcile-backlog-carriers.js ${daysBack} ${targetCarrier} --apply`);
        console.log('===============================================================\n');
        return;
    }

    // 3. Live Apply
    console.log('\n⚡ LIVE EXECUTION: Synchronizing Phenix bills and updating live carrier checkpoints...');
    // Also repair any previously imported 29... shipments misclassified as FEDEX:
    const misclassifiedSmsa = await prisma.shipment.findMany({
        where: {
            OR: [
                { dhlTrackingNumber: { startsWith: '29' } },
                { trackingNumber: { startsWith: '29' } }
            ],
            carrierCode: { not: 'SMSA' }
        }
    });
    if (misclassifiedSmsa.length > 0) {
        console.log(`🔄 Re-classifying ${misclassifiedSmsa.length} shipments with 29... tracking from ${misclassifiedSmsa[0].carrierCode} to SMSA...`);
        await prisma.shipment.updateMany({
            where: {
                id: { in: misclassifiedSmsa.map(s => s.id) }
            },
            data: {
                carrierCode: 'SMSA',
                carrier: 'SMSA'
            }
        });
        console.log(`✅ Updated ${misclassifiedSmsa.length} shipments to SMSA!`);
    }

    const syncResult = await phenixSyncService.syncPhenixShipments({
        daysBack,
        carrier: targetCarrier,
        sendWhatsApp: false, // do not spam historical recipients
        onlyComplete: true
    });

    console.log(`\n✅ Ingestion Results:`);
    console.log(`   - New Shipments Created: ${syncResult.createdCount}`);
    console.log(`   - Existing Shipments Updated: ${syncResult.updatedCount}`);
    console.log(`   - Carrier Checkpoints Synced: ${syncResult.carrierSyncedCount}`);

    console.log('\n===============================================================');
    console.log('🎉 LIVE RECONCILIATION COMPLETE');
    console.log('===============================================================\n');
}

main()
    .catch(err => {
        console.error('Fatal error:', err);
    })
    .finally(() => prisma.$disconnect());
