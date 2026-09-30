/**
 * On-Demand Full Carrier Tracking Sync Tool
 * 
 * Usage:
 *   node backend/scripts/sync-all-carriers.js [--carrier=ARAMEX|DGR|OTE] [--limit=100]
 *   npm run sync:carriers
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { prisma } = require('../src/config/database');
const carrierSyncCronService = require('../src/services/carrierSyncCron.service');

async function syncAllShipments() {
    const args = process.argv.slice(2);
    let limit = 200;
    let carrier = null;
    let maxDays = 7;

    for (const arg of args) {
        if (arg.startsWith('--limit=')) {
            limit = parseInt(arg.split('=')[1], 10) || 200;
        } else if (arg.startsWith('--carrier=')) {
            carrier = arg.split('=')[1].toUpperCase();
        } else if (arg.startsWith('--days=')) {
            maxDays = parseInt(arg.split('=')[1], 10) || 7;
        }
    }

    console.log('====================================================');
    console.log(`🚀 ON-DEMAND CARRIER TRACKING SYNCHRONIZATION`);
    console.log(`Carrier Filter:  ${carrier || 'ALL CARRIERS (Aramex, DHL, OTE, etc.)'}`);
    console.log(`Max Age Window:  ${maxDays} days (Older shipments strictly skipped)`);
    console.log(`Batch Limit:     ${limit}`);
    console.log(`Start Time:      ${new Date().toISOString()}`);
    console.log('====================================================\n');

    try {
        console.log('Starting sync batch...');
        const result = await carrierSyncCronService.runSyncBatch({
            limit,
            carrier,
            maxDays
        });

        console.log('\n--- Synchronization Summary ---');
        console.log(`Scanned Shipments:   ${result.scanned}`);
        console.log(`Synced with Carrier: ${result.synced}`);
        console.log(`Updated in Database: ${result.updated}`);
        console.log(`Errors Encountered:  ${result.errors}`);

        if (Array.isArray(result.results) && result.results.length > 0) {
            console.log('\nDetailed Results:');
            result.results.forEach((r, idx) => {
                const icon = r.updated ? '🟢' : '⚪';
                console.log(`  ${icon} [${idx + 1}] ${r.trackingNumber}: status=${r.newStatus || r.status} ${r.updated ? `(promoted from ${r.previousStatus})` : '(no new events)'}`);
            });
        }

        console.log('\n====================================================');
        console.log('✅ Synchronization completed successfully.');
        console.log('====================================================\n');
    } catch (err) {
        console.error('❌ Sync failed:', err.message);
    } finally {
        if (prisma && typeof prisma.$disconnect === 'function') {
            await prisma.$disconnect();
        }
    }
}

syncAllShipments();
