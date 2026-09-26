require('dotenv').config();
const { prisma } = require('../src/config/database');

const args = process.argv.slice(2);
const isConfirmed = args.includes('--confirm') || args.includes('-y') || args.includes('--force');

async function main() {
    console.log('================================================================');
    console.log('📦 TARGET LOGISTICS - CLEAR SHIPMENTS TOOL');
    console.log('================================================================');

    if (!isConfirmed) {
        console.error('\n⚠️  WARNING: This operation will permanently delete ALL shipments and associated tracking logs.');
        console.error('All users, organizations, chart of accounts, and system settings will remain intact.\n');
        console.error('To proceed, run:');
        console.error('  node scripts/clear-shipments.js --confirm\n');
        process.exit(1);
    }

    try {
        await prisma.$connect();

        const count = await prisma.shipment.count();
        console.log(`\nFound ${count} shipments to delete.`);

        if (count === 0) {
            console.log('Database already has 0 shipments.');
            return;
        }

        console.log('\n[1/6] Deleting Shipment Audit entries...');
        await prisma.shipmentAudit.deleteMany({});

        console.log('[2/6] Deleting Shipment Notification Logs (WhatsApp logs)...');
        await prisma.shipmentNotificationLog.deleteMany({});

        console.log('[3/6] Clearing Shipment relations from Pickups, Ledger & Bills...');
        await prisma.pickupRequest.updateMany({ data: { shipmentId: null } });
        await prisma.journalEntryLine.updateMany({ data: { shipmentId: null } });
        await prisma.carrierBillLine.updateMany({ data: { shipmentId: null } });
        await prisma.invoiceLine.deleteMany({});
        await prisma.paymentAllocation.deleteMany({});

        console.log('[4/6] Deleting all Shipments...');
        const deleted = await prisma.shipment.deleteMany({});

        console.log(`\n================================================================`);
        console.log(`✅ SUCCESS: Deleted ${deleted.count} shipments!`);
        console.log(`   Database is clean and ready for fresh Phenix ERP import.`);
        console.log(`   Users, Organizations & Settings are 100% preserved.`);
        console.log(`================================================================\n`);
    } catch (err) {
        console.error('❌ Error clearing shipments:', err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
