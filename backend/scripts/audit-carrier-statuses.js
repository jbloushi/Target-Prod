#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { prisma, closeDB } = require('../src/config/database');
const { syncCarrierTrackingHistory, resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');

const days = Math.max(1, Number(process.argv[2] || 90));
const output = process.argv[3] || path.join(process.cwd(), `carrier-status-audit-${new Date().toISOString().slice(0, 10)}.json`);
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const normalize = (value) => String(value || '').toLowerCase();
const latestEvent = (history) => (Array.isArray(history) ? history : [])
    .filter((event) => event && event.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;

const classify = (internal, carrier, hasDeliveredEvent) => {
    if (internal === 'delivered' && carrier !== 'delivered') return 'DELIVERED_NOT_CONFIRMED';
    if (internal !== 'delivered' && carrier === 'delivered') return 'CARRIER_DELIVERED_NOT_INTERNAL';
    if (internal === 'exception' && carrier !== 'exception' && carrier) return 'EXCEPTION_CLEARED_BY_CARRIER';
    if (internal !== carrier && carrier) return 'STATUS_MISMATCH';
    if (internal === 'delivered' && !hasDeliveredEvent) return 'DELIVERED_WITHOUT_INTERNAL_SCAN';
    return 'MATCH';
};

async function main() {
    const shipments = await prisma.shipment.findMany({
        where: {
            OR: [
                { createdAt: { gte: cutoff } },
                { status: 'delivered' }
            ],
            NOT: { status: 'cancelled' }
        },
        orderBy: { updatedAt: 'asc' }
    });

    const rows = [];
    for (const shipment of shipments) {
        const carrierTrackingNumber = resolveCarrierTrackingNumber(shipment);
        const carrierCode = String(shipment.carrierCode || shipment.carrier || 'DGR').toUpperCase();
        const internalLatest = latestEvent(shipment.history);
        const row = {
            trackingNumber: shipment.trackingNumber,
            carrierCode,
            carrierTrackingNumber,
            internalStatus: normalize(shipment.status),
            internalLatestEvent: internalLatest?.description || null,
            internalLatestTimestamp: internalLatest?.timestamp || null,
            checkedAt: new Date().toISOString(),
            carrierStatus: null,
            carrierLatestEvent: null,
            carrierLatestTimestamp: null,
            mismatch: 'NOT_CHECKED',
            recommendedAction: null,
            error: null
        };

        if (!carrierTrackingNumber || ['MANUAL', 'INTERNAL'].includes(carrierCode)) {
            row.mismatch = 'NO_EXTERNAL_TRACKING';
            rows.push(row);
            continue;
        }

        try {
            const updates = await syncCarrierTrackingHistory(shipment);
            const carrierHistory = updates?.history || [];
            const carrierLatest = latestEvent(carrierHistory);
            row.carrierStatus = normalize(updates?.status || carrierLatest?.status);
            row.carrierLatestEvent = carrierLatest?.description || null;
            row.carrierLatestTimestamp = carrierLatest?.timestamp || null;
            const hasDeliveredEvent = carrierHistory.some((event) => normalize(event.status || event.description) === 'delivered');
            row.mismatch = classify(row.internalStatus, row.carrierStatus, hasDeliveredEvent);
            row.recommendedAction = row.mismatch === 'DELIVERED_NOT_CONFIRMED' ? `Review; candidate correction to ${row.carrierStatus}`
                : row.mismatch === 'CARRIER_DELIVERED_NOT_INTERNAL' ? 'Review; candidate correction to delivered'
                    : row.mismatch === 'EXCEPTION_CLEARED_BY_CARRIER' ? `Review; candidate correction to ${row.carrierStatus}` : null;
        } catch (error) {
            row.mismatch = 'PROVIDER_ERROR';
            row.error = error.message;
        }
        rows.push(row);
    }

    const summary = rows.reduce((acc, row) => {
        acc.total += 1;
        acc.byProvider[row.carrierCode] = (acc.byProvider[row.carrierCode] || 0) + 1;
        acc.byFinding[row.mismatch] = (acc.byFinding[row.mismatch] || 0) + 1;
        return acc;
    }, { total: 0, byProvider: {}, byFinding: {} });

    const report = { generatedAt: new Date().toISOString(), lookbackDays: days, readOnly: true, summary, rows };
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report written to ${output}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDB);
