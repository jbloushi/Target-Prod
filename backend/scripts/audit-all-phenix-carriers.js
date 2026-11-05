require('dotenv').config();
const phenixSync = require('../src/services/phenixSync.service');
const { prisma } = require('../src/config/database');

async function audit() {
    console.log('===============================================================');
    console.log('🔍 PHENIX ERP TOTAL CARRIER AUDIT & DISCOVERY');
    console.log('===============================================================\n');

    const totalDays = parseInt(process.argv[2], 10) || 60;
    const CHUNK_SIZE = 60; // Max allowed by Phenix service is 62 days
    console.log(`1. Fetching operational bills from Phenix ERP API (past ${totalDays} days in chunks)...`);
    
    let rawBills = [];
    const seenBillIds = new Set();

    // Iterate in chunks of up to 60 days
    for (let offset = 0; offset < totalDays; offset += CHUNK_SIZE) {
        const chunkDays = Math.min(CHUNK_SIZE, totalDays - offset);
        const anchorDate = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
        console.log(`   Fetching chunk: days ${offset} to ${offset + chunkDays} ago...`);
        try {
            const report = await phenixSync.fetchPhenixReportData({
                date: anchorDate,
                daysBack: chunkDays
            });
            const rows = report.rows || [];
            let added = 0;
            for (const r of rows) {
                const id = r.bill_id || r.bill_detailCustomField_1;
                if (!seenBillIds.has(id)) {
                    seenBillIds.add(id);
                    rawBills.push(r);
                    added++;
                }
            }
            console.log(`   -> Found ${rows.length} rows (${added} unique added)`);
        } catch (e) {
            console.error(`   ⚠️ Failed to fetch chunk from Phenix ERP API: ${e.message}`);
            break;
        }
    }
    console.log(`✅ Total distinct bills fetched: ${rawBills.length}`);

    if (rawBills.length > 0) {
        const costCenterCounts = {};
        const costCenterExamples = {};
        const prefixCounts = {};
        const unclassifiedList = [];

        rawBills.forEach(b => {
            const cc = String(b.Cost_Center || b.costCenter || '[EMPTY_COST_CENTER]').trim();
            const trk = String(b.bill_detailCustomField_1 || '').trim();
            const client = String(b.Client || b.customer_name || '').trim();
            const dest = String(b.Mcolor || b.Country || '').trim();

            costCenterCounts[cc] = (costCenterCounts[cc] || 0) + 1;
            if (!costCenterExamples[cc]) {
                costCenterExamples[cc] = { sampleTracking: trk, client, dest };
            }

            // Pattern breakdown
            let pattern = 'NO_TRACKING';
            if (trk) {
                if (/^29\d{10}$/.test(trk) || trk.startsWith('SMSA') || trk.startsWith('29')) pattern = 'SMSA (29... / 12 digits)';
                else if (/^38\d+/.test(trk) || /^39\d+/.test(trk)) pattern = 'Aramex (38... / 39...)';
                else if (/^\d{10}$/.test(trk)) pattern = 'DHL Express (10 digits)';
                else if (/^PP/i.test(trk)) pattern = 'Posta Plus (PP...)';
                else if (/^IW/i.test(trk)) pattern = 'IW Express (IW...)';
                else if (/^TRG/i.test(trk) || /^TGR/i.test(trk) || /^OTE/i.test(trk)) pattern = 'LogesTechs / OTE (TRG...)';
                else if (/^TKW/i.test(trk)) pattern = 'Target Internal Fleet (TKW...)';
                else if (/^\d{12}$/.test(trk)) pattern = 'FedEx Express (12 digits, non-29)';
                else pattern = `Other Prefix: [${trk.slice(0, 4)}] (len: ${trk.length})`;
            }
            prefixCounts[pattern] = (prefixCounts[pattern] || 0) + 1;

            // Check if current deriveCarrier would fallback to DGR
            const derived = phenixSync.deriveCarrier ? phenixSync.deriveCarrier(cc, trk) : null;
            if (derived === 'DGR' && !cc.toUpperCase().includes('DHL') && !cc.toUpperCase().includes('DGR') && !cc.includes('جوي') && !/^\d{10}$/.test(trk)) {
                unclassifiedList.push({
                    billId: b.bill_id,
                    costCenter: cc,
                    tracking: trk,
                    client,
                    destination: dest
                });
            }
        });

        console.log('\n📊 [1] ALL DISTINCT COST CENTERS IN PHENIX ERP:');
        console.table(Object.entries(costCenterCounts).sort((a, b) => b[1] - a[1]).map(([costCenter, count]) => ({
            Cost_Center: costCenter,
            Count: count,
            Sample_Tracking: costCenterExamples[costCenter]?.sampleTracking || '—',
            Sample_Client: costCenterExamples[costCenter]?.client || '—',
            Sample_Destination: costCenterExamples[costCenter]?.dest || '—'
        })));

        console.log('\n📦 [2] TRACKING NUMBER FORMATS & IDENTIFIED CARRIERS:');
        console.table(Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).map(([pattern, count]) => ({
            Pattern: pattern,
            Count: count
        })));

        if (unclassifiedList.length > 0) {
            console.log(`\n⚠️ [3] POTENTIAL FALLBACK/UNCLASSIFIED BILLS (${unclassifiedList.length} found):`);
            console.table(unclassifiedList.slice(0, 15));
        } else {
            console.log('\n✨ [3] ZERO FALLBACK BILLS! All Phenix bills map cleanly to distinct carriers.');
        }
    }

    // Database check
    try {
        console.log('\n📊 [4] DATABASE PHENIX SHIPMENTS CARRIER DISTRIBUTION:');
        const dbCounts = await prisma.shipment.groupBy({
            by: ['carrierCode'],
            where: { phenixSourceKey: { not: null } },
            _count: { id: true }
        });
        console.table(dbCounts.map(c => ({ Carrier_Code: c.carrierCode, Total: c._count.id })));
    } catch (dbErr) {
        console.warn('DB check note:', dbErr.message);
    }

    console.log('\n===============================================================');
    console.log('✅ AUDIT COMPLETE');
    console.log('===============================================================\n');
}

audit()
    .catch(console.error)
    .finally(() => prisma.$disconnect && prisma.$disconnect());
