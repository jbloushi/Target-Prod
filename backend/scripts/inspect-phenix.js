require('dotenv').config();
const phenixSyncService = require('../src/services/phenixSync.service');
const { prisma } = require('../src/config/database');

async function inspectPhenix() {
    const daysBack = parseInt(process.argv[2], 10) || 7;
    const filterCarrier = (process.argv[3] || 'ALL').toUpperCase();

    console.log('===============================================================');
    console.log(`🔍 PHENIX ERP LIVE INSPECTION & CARRIER RECONCILIATION`);
    console.log(`📅 Date Window: Last ${daysBack} days | Carrier Filter: ${filterCarrier}`);
    console.log('===============================================================\n');

    try {
        console.log(`1. Connecting to Phenix Reporting API...`);
        const { rows, from, to } = await phenixSyncService.fetchPhenixReportData({ daysBack });
        console.log(`✅ Phenix API Response: Received ${rows.length} total bills (${from.year}-${from.month}-${from.day} to ${to.year}-${to.month}-${to.day})\n`);

        const carrierBreakdown = {};
        const costCenterBreakdown = {};
        const fedexBills = [];
        const aramexBills = [];
        const dhlBills = [];
        const otherBills = [];

        for (const row of rows) {
            const billId = String(row.bill_id || '').trim();
            const receiptNo = String(row.Receipt_no || '').trim();
            const awb = String(row.bill_detailCustomField_1 || '').trim();
            const costCenter = String(row.Cost_Center || '').trim();
            const client = String(row.Client || '').trim();
            const date = String(row.Date || '').trim();
            const amount = parseFloat(row.Total || row.payment || 0) || 0;
            const receiverName = String(row.bill_detailCustomField_3 || '').trim();
            const receiverPhone = String(row.bill_detailCustomField_4 || '').trim();
            const destCountry = String(row.Mcolor || '').trim();

            const derived = phenixSyncService.deriveCarrier 
                ? phenixSyncService.deriveCarrier(costCenter, awb)
                : (costCenter.toUpperCase().includes('FEDEX') || awb.length === 12 ? 'FEDEX' : costCenter.toUpperCase().includes('ARAMEX') ? 'ARAMEX' : 'DGR');

            carrierBreakdown[derived] = (carrierBreakdown[derived] || 0) + 1;
            costCenterBreakdown[costCenter || '(Empty)'] = (costCenterBreakdown[costCenter || '(Empty)'] || 0) + 1;

            const billInfo = {
                billId,
                receiptNo,
                awb,
                costCenter,
                derived,
                client,
                date,
                amount,
                receiverName,
                receiverPhone,
                destCountry
            };

            if (derived === 'FEDEX') fedexBills.push(billInfo);
            else if (derived === 'ARAMEX') aramexBills.push(billInfo);
            else if (derived === 'DGR') dhlBills.push(billInfo);
            else otherBills.push(billInfo);
        }

        console.log(`📊 Carrier Breakdown across ${rows.length} Phenix bills:`);
        Object.entries(carrierBreakdown).forEach(([car, count]) => {
            console.log(`   • ${car.padEnd(12)}: ${count} consignments`);
        });

        console.log(`\n🏷️ Cost_Center Breakdown in Phenix ERP:`);
        Object.entries(costCenterBreakdown).forEach(([cc, count]) => {
            console.log(`   • "${cc}": ${count} bills`);
        });

        // Detailed FedEx inspection
        console.log(`\n===============================================================`);
        console.log(`📦 FEDEX SHIPMENTS FOUND IN PHENIX ERP (${fedexBills.length} total)`);
        console.log(`===============================================================`);

        if (fedexBills.length === 0) {
            console.log(`⚠️ No FedEx consignments found in Phenix report for the last ${daysBack} days.`);
            console.log(`   Tip: Try running with a larger window, e.g. "node scripts/inspect-phenix.js 30"`);
        } else {
            for (let i = 0; i < fedexBills.length; i++) {
                const b = fedexBills[i];
                // Check if in database
                let inDb = null;
                if (b.awb) {
                    inDb = await prisma.shipment.findFirst({
                        where: {
                            OR: [
                                { trackingNumber: b.awb },
                                { trackingNumber: `TRK-${b.awb}` },
                                { dhlTrackingNumber: b.awb }
                            ]
                        },
                        select: { id: true, trackingNumber: true, status: true, carrierCode: true, createdAt: true }
                    });
                }

                console.log(`\n[${i + 1}/${fedexBills.length}] Bill #${b.billId} (Receipt: ${b.receiptNo || 'N/A'}) - Date: ${b.date}`);
                console.log(`   AWB / Waybill : ${b.awb || '❌ MISSING'}`);
                console.log(`   Cost Center   : "${b.costCenter}"`);
                console.log(`   Client/Store  : ${b.client}`);
                console.log(`   Consignee     : ${b.receiverName} (${b.destCountry}) - Phone: ${b.receiverPhone}`);
                console.log(`   Amount        : ${b.amount} KWD`);
                console.log(`   Target DB     : ${inDb ? `✅ Synced in DB (${inDb.trackingNumber}) [Status: ${inDb.status}]` : `⏳ Not yet imported into Target DB`}`);
            }
        }

        // Check overall DB stats for FedEx
        const dbFedexCount = await prisma.shipment.count({
            where: {
                carrierCode: { in: ['FEDEX', 'FDX'] }
            }
        });
        const totalDbCount = await prisma.shipment.count();

        console.log(`\n===============================================================`);
        console.log(`📈 TARGET DATABASE SUMMARY`);
        console.log(`===============================================================`);
        console.log(`   • Total Shipments in DB : ${totalDbCount}`);
        console.log(`   • Total FedEx in DB     : ${dbFedexCount}`);
        console.log(`   • FedEx in Phenix (${daysBack}d) : ${fedexBills.length}`);
        console.log(`===============================================================\n`);

    } catch (err) {
        console.error(`❌ Inspection failed:`, err.message);
        if (err.response) {
            console.error('Phenix API HTTP Status:', err.response.status);
            console.error('Phenix API HTTP Data:', err.response.data);
        }
    } finally {
        await prisma.$disconnect();
    }
}

inspectPhenix();
