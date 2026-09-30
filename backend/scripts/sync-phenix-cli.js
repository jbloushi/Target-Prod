require('dotenv').config();
const phenixSyncService = require('../src/services/phenixSync.service');
const { prisma } = require('../src/config/database');

async function runCliSync() {
    const daysBack = parseInt(process.argv[2], 10) || 45;
    const carrier = (process.argv[3] || 'ALL').toUpperCase();
    // Default sendWhatsApp is false for manual CLI backlog syncs to prevent notifying historical clients
    const sendWhatsApp = process.argv.includes('--notify');

    console.log('===============================================================');
    console.log(`🚀 RUNNING COMPLETE PHENIX ERP IMPORT`);
    console.log(`📅 Days Window: ${daysBack} days | Carrier: ${carrier} | WhatsApp: ${sendWhatsApp ? 'ENABLED' : 'DISABLED (Historical Safe)'}`);
    console.log('===============================================================\n');

    try {
        const result = await phenixSyncService.syncPhenixShipments({
            daysBack,
            carrier,
            sendWhatsApp,
            onlyComplete: true
        });

        console.log('\n===============================================================');
        console.log(`✅ COMPLETE IMPORT FINISHED`);
        console.log(`===============================================================`);
        console.log(`   • Total Bills Fetched : ${result.totalFetched}`);
        console.log(`   • Matched In Window   : ${result.matchedCount}`);
        console.log(`   • Actionable Data     : ${result.completeCount}`);
        console.log(`   • Ingested / Created  : ${result.createdCount}`);
        console.log(`   • Updated Existing    : ${result.updatedCount}`);
        console.log(`   • Skipped Incomplete  : ${result.skippedIncompleteCount}`);
        console.log(`===============================================================\n`);

        const totalInDb = await prisma.shipment.count();
        const carrierCounts = await prisma.shipment.groupBy({
            by: ['carrierCode'],
            _count: { id: true }
        });

        console.log(`📊 TOTAL ACTIVE SHIPMENTS IN TARGET DATABASE: ${totalInDb}`);
        console.table(carrierCounts.map(c => ({ Carrier_Code: c.carrierCode, Total_Consignments: c._count.id })));

    } catch (err) {
        console.error('❌ Sync error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

runCliSync();
