const phenixSync = require('../src/services/phenixSync.service');
const logger = require('../src/utils/logger');

async function lookupAllPhenixCarriers() {
    console.log('===============================================================');
    console.log('🔍 COMPREHENSIVE PHENIX ERP CARRIER & COST CENTER AUDIT');
    console.log('===============================================================');

    console.log('\n1. Fetching 90-day operational bills from Phenix ERP API...');
    const report = await phenixSync.fetchPhenixReportData({ daysBack: 90 });
    const rawBills = report.rows || [];
    console.log(`✅ Received ${rawBills.length} total raw bills from Phenix ERP.`);

    const costCenters = {};
    const billTypes = {};
    const trackingPrefixes = {};

    rawBills.forEach(b => {
        const cc = String(b.Cost_Center || b.costCenter || 'UNKNOWN').trim();
        const bName = String(b.bill_name || b.billType || 'Standard Bill').trim();
        const trk = String(b.bill_detailCustomField_1 || '').trim();

        if (!costCenters[cc]) {
            costCenters[cc] = {
                count: 0,
                sampleBills: []
            };
        }
        costCenters[cc].count++;
        if (costCenters[cc].sampleBills.length < 3) {
            costCenters[cc].sampleBills.push({
                billId: b.bill_id,
                date: b.bill_date,
                tracking: trk,
                merchant: b.customer_name || b.merchant_name || 'N/A',
                destination: b.Country || b.destCountry || b.bill_detailCustomField_2 || 'N/A',
                amount: Number(b.total_amount || b.net_amount || b.bill_total || 0).toFixed(3)
            });
        }

        billTypes[bName] = (billTypes[bName] || 0) + 1;

        if (trk) {
            let prefix = 'OTHER';
            if (/^38\d+/.test(trk)) prefix = 'Aramex (38...)';
            else if (/^39\d+/.test(trk)) prefix = 'Aramex (39...)';
            else if (/^\d{10}$/.test(trk)) prefix = 'DHL Express (10 digits)';
            else if (/^\d{12}$/.test(trk)) prefix = 'FedEx Express (12 digits)';
            else if (/^FED/i.test(trk)) prefix = 'FedEx (FED...)';
            else if (/^POSTA/i.test(trk) || /^PP/i.test(trk)) prefix = 'Posta Plus';
            else if (/^TKW/i.test(trk)) prefix = 'TKW (Target Express)';
            else prefix = `Prefix: ${trk.slice(0, 4)}... (len: ${trk.length})`;

            trackingPrefixes[prefix] = (trackingPrefixes[prefix] || 0) + 1;
        } else {
            trackingPrefixes['[NO_TRACKING_ENTERED]'] = (trackingPrefixes['[NO_TRACKING_ENTERED]'] || 0) + 1;
        }
    });

    console.log('\n📊 ALL DISTINCT COST CENTERS IN PHENIX ERP:');
    const sortedCC = Object.entries(costCenters).sort((a, b) => b[1].count - a[1].count);
    console.table(sortedCC.map(([name, data]) => ({
        Cost_Center: name,
        Total_Bills: data.count,
        Sample_Tracking: data.sampleBills[0]?.tracking || '—',
        Sample_Merchant: data.sampleBills[0]?.merchant || '—',
        Sample_Dest: data.sampleBills[0]?.destination || '—'
    })));

    console.log('\n📦 ALL DISTINCT TRACKING NUMBER PATTERNS IN PHENIX:');
    const sortedTrk = Object.entries(trackingPrefixes).sort((a, b) => b[1].count - a[1].count);
    console.table(sortedTrk.map(([pattern, count]) => ({
        Tracking_Pattern: pattern,
        Total_Bills: count
    })));

    console.log('\n🧾 DETAILED BREAKDOWN PER COST CENTER:');
    sortedCC.forEach(([name, data]) => {
        console.log(`\n▶ Cost Center: "${name}" (${data.count} bills)`);
        console.table(data.sampleBills);
    });

    console.log('\n===============================================================');
    console.log('✅ AUDIT COMPLETE');
    console.log('===============================================================\n');
}

lookupAllPhenixCarriers()
    .catch(err => {
        console.error('Lookup failed:', err);
    })
    .then(() => process.exit(0));
