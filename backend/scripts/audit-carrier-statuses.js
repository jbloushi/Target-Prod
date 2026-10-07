#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { prisma, closeDB } = require('../src/config/database');
const CarrierFactory = require('../src/services/CarrierFactory');
const { resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');
const { normalizeStatus } = require('../src/constants/statusConstants');

const days = Math.max(1, Number(process.argv[2] || 60));
const output = process.argv[3] || path.join(process.cwd(), `carrier-status-audit-${new Date().toISOString().slice(0, 10)}.json`);
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const normalize = (value) => String(value || '').toLowerCase();
const latestEvent = (history) => (Array.isArray(history) ? history : [])
    .filter((event) => event && event.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;

const classify = ({ internal, carrier, carrierTimestamp, internalTimestamp, carrierDescription }) => {
    if (!carrier) return 'CARRIER_STATUS_UNAVAILABLE';
    const carrierTime = carrierTimestamp ? new Date(carrierTimestamp).getTime() : 0;
    const internalTime = internalTimestamp ? new Date(internalTimestamp).getTime() : 0;
    const carrierIsNewer = carrierTime > 0 && (!internalTime || carrierTime > internalTime);
    const text = String(carrierDescription || '').toLowerCase();

    if (internal === carrier) return 'MATCH';
    if (carrier === 'delivered' && internal !== 'delivered') {
        return carrierIsNewer ? 'SYNC_LAG_CARRIER_NEWER' : 'CARRIER_DATA_OLDER_THAN_INTERNAL';
    }
    if (internal === 'delivered' && carrier !== 'delivered') {
        return carrierIsNewer ? 'REAL_STATUS_MISMATCH' : 'CARRIER_DATA_OLDER_THAN_INTERNAL';
    }
    if (internal === 'exception' && carrier !== 'exception') {
        return carrierIsNewer ? 'EXCEPTION_CLEARED_CARRIER_NEWER' : 'CARRIER_DATA_OLDER_THAN_INTERNAL';
    }
    if (text.includes('returned to shipper') && carrier === 'in_transit') return 'NORMAL_PROVIDER_MAPPING';
    if (internal !== carrier) return carrierIsNewer ? 'REAL_STATUS_MISMATCH' : 'CARRIER_DATA_OLDER_THAN_INTERNAL';
    return 'MATCH';
};

async function main() {
    const shipments = await prisma.shipment.findMany({
        where: {
            createdAt: { gte: cutoff },
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
            internalUpdatedAt: shipment.updatedAt || null,
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
            const isTest = shipment.pricingSnapshot?.isTest === true || shipment.pricingSnapshot?.environment === 'test';
            const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || 'production');
            const adapter = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
            const tracking = await adapter.getTracking(carrierTrackingNumber, shipment);
            const carrierEvents = Array.isArray(tracking?.events) ? tracking.events : [];
            const carrierLatest = latestEvent(carrierEvents);
            row.carrierStatus = normalizeStatus(carrierLatest?.statusCode || carrierLatest?.status || carrierLatest?.description || tracking?.status);
            row.carrierLatestEvent = carrierLatest?.description || tracking?.description || null;
            row.carrierLatestTimestamp = carrierLatest?.timestamp || null;
            const internalReferenceTimestamp = internalLatest?.timestamp || shipment.updatedAt;
            row.mismatch = classify({
                internal: row.internalStatus,
                carrier: row.carrierStatus,
                carrierTimestamp: row.carrierLatestTimestamp,
                internalTimestamp: internalReferenceTimestamp,
                carrierDescription: row.carrierLatestEvent
            });
            row.recommendedAction = ['SYNC_LAG_CARRIER_NEWER', 'EXCEPTION_CLEARED_CARRIER_NEWER', 'REAL_STATUS_MISMATCH'].includes(row.mismatch)
                ? `Review candidate correction to ${row.carrierStatus}` : null;
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
