require('dotenv').config();
const phenixSyncService = require('../src/services/phenixSync.service');
const { prisma } = require('../src/config/database');

async function runCliSync() {
    const daysBack = parseInt(process.argv[2], 10) || 30;
    const carrier = (process.argv[3] || 'FEDEX').toUpperCase();
    // Default sendWhatsApp is false for manual CLI backlog syncs to prevent notifying historical clients
    const sendWhatsApp = process.argv.includes('--notify');

    console.log('===============================================================');
    console.log(`🚀 RUNNING PHENIX ERP MANUAL SYNC`);
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
        console.log(`✅ SYNC COMPLETE`);
        console.log(`===============================================================`);
        console.log(`   • Total Bills Fetched : ${result.totalFetched}`);
        console.log(`   • Matched Carrier     : ${result.matchedCount}`);
        console.log(`   • Complete Data       : ${result.completeCount}`);
        console.log(`   • Ingested / Created  : ${result.createdCount}`);
        console.log(`   • Updated Existing    : ${result.updatedCount}`);
        console.log(`   • Skipped Incomplete  : ${result.skippedIncompleteCount}`);
        console.log(`===============================================================\n`);

        if (result.results && result.results.length > 0) {
            console.log('📋 Ingested / Updated Consignments:');
            result.results.forEach((r, idx) => {
                console.log(`   [${idx + 1}] ${r.trackingNumber.padEnd(24)} | Carrier: ${r.carrierCode} | Receiver: ${r.receiverName} | Action: ${r.action}`);
            });
        }

    } catch (err) {
        console.error('❌ Sync error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

runCliSync();
