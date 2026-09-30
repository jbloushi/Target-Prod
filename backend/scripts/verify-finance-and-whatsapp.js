require('dotenv').config();
const { prisma } = require('../src/config/database');

async function verifyFinanceAndWhatsapp() {
    console.log('===============================================================');
    console.log(`📊 PRODUCTION FINANCIAL & WHATSAPP AUDIT REPORT`);
    console.log('===============================================================\n');

    try {
        // 1. SHIPMENT FINANCIAL SUMMARY
        const totalShipments = await prisma.shipment.count();
        const paidShipments = await prisma.shipment.count({ where: { paid: true } });
        const unpaidShipments = await prisma.shipment.count({ where: { paid: false } });

        const priceAgg = await prisma.shipment.aggregate({
            _sum: {
                price: true,
                totalPaid: true,
                remainingBalance: true
            }
        });

        console.log(`📦 SHIPMENTS OVERVIEW:`);
        console.log(`   • Total Consignments      : ${totalShipments}`);
        console.log(`   • Paid Consignments (Cash): ${paidShipments}`);
        console.log(`   • Unpaid / On Account     : ${unpaidShipments}`);
        console.log(`   • Total Billed Amount     : ${Number(priceAgg._sum.price || 0).toFixed(3)} KWD`);
        console.log(`   • Total Paid Amount       : ${Number(priceAgg._sum.totalPaid || 0).toFixed(3)} KWD`);
        console.log(`   • Outstanding Receivables : ${Number(priceAgg._sum.remainingBalance || 0).toFixed(3)} KWD\n`);

        // 2. FINANCIAL INVOICES & LEDGER
        const totalInvoices = await prisma.invoice.count();
        const paidInvoices = await prisma.invoice.count({ where: { status: 'paid' } });
        const unpaidInvoices = await prisma.invoice.count({ where: { status: { in: ['issued', 'pending', 'draft'] } } });
        const totalPayments = await prisma.payment.count();
        const totalLedgerEntries = await prisma.organizationLedger.count();

        const invoiceSums = await prisma.invoice.aggregate({
            _sum: { total: true }
        });
        const paymentSums = await prisma.payment.aggregate({
            _sum: { amount: true }
        });

        console.log(`💰 FINANCE SUBSYSTEM RECONCILIATION:`);
        console.log(`   • Total Invoices Issued   : ${totalInvoices} (${paidInvoices} Paid, ${unpaidInvoices} Outstanding)`);
        console.log(`   • Total Invoiced Amount   : ${Number(invoiceSums._sum.total || 0).toFixed(3)} KWD`);
        console.log(`   • Total Payment Receipts  : ${totalPayments} (${Number(paymentSums._sum.amount || 0).toFixed(3)} KWD total collected)`);
        console.log(`   • General Ledger Entries  : ${totalLedgerEntries} double-entry records\n`);

        // 3. SAMPLE OF RECENT INVOICES & PAYMENT METHODS
        console.log(`🧾 SAMPLE OF RECENT INVOICES & PHENIX PAYMENT METHODS:`);
        const sampleInvoices = await prisma.invoice.findMany({
            take: 8,
            orderBy: { createdAt: 'desc' },
            include: { organization: { select: { name: true } } }
        });

        const invoiceTable = sampleInvoices.map(inv => ({
            InvoiceNo: inv.invoiceNumber,
            Organization: inv.organization?.name || 'Direct Shipper',
            Amount_KWD: Number(inv.total).toFixed(3),
            Status: inv.status.toUpperCase(),
            Date: inv.periodStart ? inv.periodStart.toISOString().slice(0, 10) : '-'
        }));
        console.table(invoiceTable);

        // 4. BREAKDOWN BY PAYMENT METHOD FROM PHENIX
        const shipmentsWithDocs = await prisma.shipment.findMany({
            where: { documents: { not: null } },
            select: { documents: true, paid: true, price: true }
        });

        const methodBreakdown = {};
        for (const s of shipmentsWithDocs) {
            const method = s.documents?.paymentMethod || '(Unspecified)';
            if (!methodBreakdown[method]) {
                methodBreakdown[method] = { count: 0, totalKWD: 0, isPaidInDB: s.paid ? 'PAID' : 'ON_ACCOUNT' };
            }
            methodBreakdown[method].count += 1;
            methodBreakdown[method].totalKWD += Number(s.price || 0);
        }

        console.log(`\n💳 PHENIX ERP PAYMENT METHOD BREAKDOWN:`);
        Object.entries(methodBreakdown).forEach(([method, data]) => {
            console.log(`   • "${method.padEnd(16)}": ${String(data.count).padEnd(4)} orders (${data.totalKWD.toFixed(3)} KWD) -> Target DB: ${data.isPaidInDB}`);
        });

        // 5. WHATSAPP NOTIFICATION LOGS
        const totalLogs = await prisma.shipmentNotificationLog.count();
        const sentLogs = await prisma.shipmentNotificationLog.count({ where: { status: { in: ['SENT', 'DELIVERED', 'READ'] } } });
        const skippedLogs = await prisma.shipmentNotificationLog.count({ where: { status: 'SKIPPED' } });
        const failedLogs = await prisma.shipmentNotificationLog.count({ where: { status: 'FAILED' } });

        console.log(`\n===============================================================`);
        console.log(`📱 WHATSAPP NOTIFICATION AUDIT:`);
        console.log(`===============================================================`);
        console.log(`   • Total Notification Logs : ${totalLogs}`);
        console.log(`   • Sent / Delivered        : ${sentLogs}`);
        console.log(`   • Skipped (Dedup/Safe)    : ${skippedLogs}`);
        console.log(`   • Failed                  : ${failedLogs}\n`);

        const sampleLogs = await prisma.shipmentNotificationLog.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                trackingNumber: true,
                recipientRole: true,
                recipientPhone: true,
                templateName: true,
                status: true,
                provider: true,
                sentAt: true
            }
        });

        if (sampleLogs.length > 0) {
            console.log('📋 Recent WhatsApp Logs Sample:');
            const logsTable = sampleLogs.map(l => ({
                Tracking: l.trackingNumber,
                Role: l.recipientRole,
                Phone: l.recipientPhone,
                Template: l.templateName,
                Status: l.status,
                Provider: l.provider,
                SentAt: l.sentAt ? l.sentAt.toISOString().slice(0, 19).replace('T', ' ') : '-'
            }));
            console.table(logsTable);
        } else {
            console.log('   (No live outbound WhatsApp messages logged yet)');
        }

        console.log('===============================================================\n');

    } catch (err) {
        console.error('❌ Audit query error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

verifyFinanceAndWhatsapp();
