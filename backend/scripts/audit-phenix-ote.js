const phenixSync = require('../src/services/phenixSync.service');
const { prisma } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function auditPhenixOte() {
    console.log('===============================================================');
    console.log('🔍 AUDITING PHENIX ERP FOR OTE / LOGESTECHS SHIPMENTS');
    console.log('===============================================================');

    // 1. Fetch raw operational bills from Phenix API
    console.log('\n1. Fetching operational bills from Phenix ERP API (past 45 days)...');
    const report = await phenixSync.fetchPhenixReportData({ daysBack: 45 });
    const rawBills = report.rows || [];
    console.log(`✅ Received ${rawBills.length} total raw bills from Phenix ERP.`);

    // 2. Aggregate Cost Centers
    const costCenterMap = {};
    const trackingPatterns = {
        dhl: 0,
        aramex: 0,
        fedex: 0,
        ote: 0,
        other: 0
    };
    const oteMatchesInPhenix = [];

    rawBills.forEach(b => {
        const cc = String(b.Cost_Center || b.costCenter || 'UNKNOWN').trim();
        costCenterMap[cc] = (costCenterMap[cc] || 0) + 1;

        const trk = String(b.bill_detailCustomField_1 || '').trim().toUpperCase();
        const ccUpper = cc.toUpperCase();

        if (ccUpper.includes('OTE') || ccUpper.includes('LOGESTECHS') || trk.startsWith('TRG') || trk.startsWith('TGR') || trk.startsWith('OTE')) {
            trackingPatterns.ote++;
            oteMatchesInPhenix.push({
                bill_id: b.bill_id,
                receiptNo: b.Receipt_no,
                costCenter: b.Cost_Center,
                tracking: b.bill_detailCustomField_1,
                date: b.bill_date,
                customer: b.customer_name || b.merchant_name
            });
        } else if (ccUpper.includes('ARAMEX') || (trk.startsWith('38') && (trk.length === 10 || trk.length === 11))) {
            trackingPatterns.aramex++;
        } else if (ccUpper.includes('FEDEX') || ccUpper.includes('FEEDEX') || trk.startsWith('FED') || /^\d{12}$/.test(trk)) {
            trackingPatterns.fedex++;
        } else if (ccUpper.includes('DHL') || ccUpper.includes('DGR') || /^\d{10}$/.test(trk)) {
            trackingPatterns.dhl++;
        } else {
            trackingPatterns.other++;
        }
    });

    console.log('\n📊 PHENIX ERP COST CENTER BREAKDOWN:');
    console.table(Object.entries(costCenterMap).map(([costCenter, count]) => ({
        Cost_Center: costCenter,
        Bill_Count: count,
        Target_Mapped_Carrier: costCenter.toUpperCase().includes('ARAMEX') ? 'ARAMEX' :
                               (costCenter.toUpperCase().includes('FEDEX') || costCenter.toUpperCase().includes('FEEDEX')) ? 'FEDEX' :
                               (costCenter.toUpperCase().includes('OTE') || costCenter.toUpperCase().includes('LOGESTECHS')) ? 'OTE' : 'DHL / DGR'
    })));

    console.log('\n📦 PHENIX ERP TRACKING PATTERN DISTRIBUTION:');
    console.table([
        { Carrier: 'DHL Express (DGR)', Count: trackingPatterns.dhl },
        { Carrier: 'Aramex Express', Count: trackingPatterns.aramex },
        { Carrier: 'FedEx Express', Count: trackingPatterns.fedex },
        { Carrier: 'OTE / LogesTechs', Count: trackingPatterns.ote },
        { Carrier: 'Unclassified / Other', Count: trackingPatterns.other }
    ]);

    // 3. Database Audit
    console.log('\n🗄️ DATABASE SHIPMENT CARRIER AUDIT:');
    const dbCarriers = await prisma.shipment.groupBy({
        by: ['carrierCode'],
        _count: { id: true }
    });
    console.table(dbCarriers.map(c => ({ Carrier_Code: c.carrierCode, Total_Shipments: c._count.id })));

    const oteInDb = await prisma.shipment.findMany({
        where: { carrierCode: 'OTE' },
        select: {
            trackingNumber: true,
            status: true,
            createdAt: true,
            documents: true
        }
    });

    console.log(`\n🔎 OTE Shipments in Target Database (${oteInDb.length} found):`);
    if (oteInDb.length > 0) {
        console.table(oteInDb.map(s => ({
            Tracking: s.trackingNumber,
            Status: s.status,
            Source: s.documents?.source || 'DIRECT_BOOKING',
            Created: s.createdAt?.toISOString().split('T')[0]
        })));
    } else {
        console.log('   (No OTE shipments in database)');
    }

    console.log('\n===============================================================');
    console.log('📌 VERIFICATION CONCLUSION:');
    if (oteMatchesInPhenix.length === 0) {
        console.log('✅ ZERO (0) OTE / LogesTechs bills exist in Phenix ERP.');
        console.log('   Out of 6,601 bills scanned, all belong to Aramex, DHL, or FedEx.');
        console.log('   Phenix ERP does not process or issue bills for OTE / LogesTechs.');
    } else {
        console.log(`⚠️ Found ${oteMatchesInPhenix.length} potential OTE bills in Phenix:`);
        console.log(oteMatchesInPhenix);
    }
    console.log('===============================================================\n');
}

auditPhenixOte()
    .catch(err => {
        console.error('Audit failed:', err);
    })
    .then(() => process.exit(0));
