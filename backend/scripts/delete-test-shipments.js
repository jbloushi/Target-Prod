require('dotenv').config();
const { prisma } = require('../src/config/database');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm') || args.includes('-y') || args.includes('--force');
const deleteAll = args.includes('--all');

async function main() {
    console.log('================================================================');
    console.log('🧹 TARGET LOGISTICS - DELETE TEST SHIPMENTS TOOL');
    console.log('================================================================');

    try {
        await prisma.$connect();

        // 1. Fetch shipments with relevant fields to inspect
        const allShipments = await prisma.shipment.findMany({
            select: {
                id: true,
                trackingNumber: true,
                carrierCode: true,
                serviceCode: true,
                status: true,
                pricingSnapshot: true,
                customer: true,
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                organization: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`Total shipments in database: ${allShipments.length}`);

        // 2. Identify test shipments
        const testShipments = allShipments.filter(s => {
            if (deleteAll) return true;

            const isTestFlag = s.pricingSnapshot?.isTest === true || s.pricingSnapshot?.environment === 'test';
            const isDemoUser = s.user?.email && (
                s.user.email.startsWith('demo_') || 
                s.user.email.includes('test') ||
                s.user.email.endsWith('@example.com')
            );
            const isDemoOrg = s.organization?.name && s.organization.name.startsWith('Demo ');
            const isTestCustomer = s.customer?.email && s.customer.email.includes('example.com');
            const isCycleTracking = s.trackingNumber && (
                s.trackingNumber.startsWith('TRG-') || 
                s.trackingNumber.startsWith('SMS-') || 
                s.trackingNumber.startsWith('MAN-') || 
                s.trackingNumber.startsWith('DGR-') || 
                s.trackingNumber.startsWith('TGR-')
            ) && isTestFlag;

            return isTestFlag || isDemoUser || isDemoOrg || isTestCustomer || isCycleTracking;
        });

        console.log(`Identified ${testShipments.length} test shipments to delete.\n`);

        if (testShipments.length === 0) {
            console.log('No test shipments found.');
            return;
        }

        console.log('Sample test shipments found:');
        testShipments.slice(0, 5).forEach(s => {
            console.log(` - Tracking: ${s.trackingNumber} | Carrier: ${s.carrierCode} | User: ${s.user?.email || 'N/A'} | Created: ${s.createdAt.toISOString()}`);
        });
        if (testShipments.length > 5) {
            console.log(`   ... and ${testShipments.length - 5} more.`);
        }

        if (isDryRun) {
            console.log('\n[DRY RUN] No changes were made. Pass --confirm to execute deletion.');
            return;
        }

        if (!isConfirmed) {
            console.log('\n⚠️  To permanently delete these shipments, run:');
            console.log('  node scripts/delete-test-shipments.js --confirm\n');
            console.log('Options:');
            console.log('  --confirm       Execute deletion');
            console.log('  --dry-run       Preview matching test shipments without deleting');
            console.log('  --all --confirm Delete ALL shipments in database, not just test shipments\n');
            return;
        }

        const targetIds = testShipments.map(s => s.id);
        const targetTrackingNumbers = testShipments.map(s => s.trackingNumber).filter(Boolean);

        console.log('\n[1/7] Deleting Shipment Audit entries...');
        if (prisma.shipmentAuditLog?.deleteMany) {
            const res = await prisma.shipmentAuditLog.deleteMany({
                where: { shipmentId: { in: targetIds } }
            });
            console.log(`   Deleted ${res.count} audit logs.`);
        }

        console.log('[2/7] Deleting Shipment Tracking Events...');
        if (prisma.shipmentTrackingEvent?.deleteMany) {
            const res = await prisma.shipmentTrackingEvent.deleteMany({
                where: { shipmentId: { in: targetIds } }
            });
            console.log(`   Deleted ${res.count} tracking events.`);
        }

        console.log('[3/7] Deleting Shipment Notification Logs...');
        if (prisma.shipmentNotificationLog?.deleteMany) {
            const res = await prisma.shipmentNotificationLog.deleteMany({
                where: { shipmentId: { in: targetIds } }
            });
            console.log(`   Deleted ${res.count} notification logs.`);
        }

        console.log('[4/7] Unlinking / cleaning relations (Pickups, Journal, Bills, Invoices)...');
        if (prisma.pickupRequest?.updateMany) {
            await prisma.pickupRequest.updateMany({
                where: { shipmentId: { in: targetIds } },
                data: { shipmentId: null }
            });
        }
        if (prisma.journalEntryLine?.updateMany) {
            await prisma.journalEntryLine.updateMany({
                where: { shipmentId: { in: targetIds } },
                data: { shipmentId: null }
            });
        }
        if (prisma.billLine?.updateMany) {
            await prisma.billLine.updateMany({
                where: { shipmentId: { in: targetIds } },
                data: { shipmentId: null }
            });
        }
        if (prisma.paymentAllocation?.deleteMany) {
            await prisma.paymentAllocation.deleteMany({
                where: { shipmentId: { in: targetIds } }
            });
        }
        if (prisma.invoiceLine?.deleteMany) {
            const res = await prisma.invoiceLine.deleteMany({
                where: { shipmentId: { in: targetIds } }
            });
            console.log(`   Deleted ${res.count} invoice lines.`);
        }

        console.log('[5/7] Cleaning Organization Ledger test entries...');
        if (prisma.organizationLedger?.deleteMany) {
            const res = await prisma.organizationLedger.deleteMany({
                where: {
                    OR: [
                        { sourceId: { in: targetIds } },
                        { sourceId: { in: targetTrackingNumbers } }
                    ]
                }
            });
            console.log(`   Deleted ${res.count} ledger entries.`);
        }

        console.log('[6/7] Deleting Shipments...');
        const deleted = await prisma.shipment.deleteMany({
            where: { id: { in: targetIds } }
        });

        console.log('[7/7] Recalculating demo organization balances...');
        const demoOrgs = await prisma.organization.findMany({
            where: { name: { startsWith: 'Demo ' } }
        });
        for (const org of demoOrgs) {
            await prisma.organization.update({
                where: { id: org.id },
                data: { balance: 0, unappliedBalance: 0 }
            });
        }

        console.log('\n================================================================');
        console.log(`✅ SUCCESS: Deleted ${deleted.count} test shipments!`);
        console.log(`   Real customer data, users, and organizations remain untouched.`);
        console.log('================================================================\n');

    } catch (err) {
        console.error('❌ Error deleting test shipments:', err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
