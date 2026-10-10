#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { prisma } = require('../src/config/database');
const CarrierFactory = require('../src/services/CarrierFactory');
const { resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');
const {
    auditShipmentRecord,
    buildAuditWhere,
    normalizeAwb,
    normalizeCountryCode
} = require('../src/services/shipmentCarrierAudit.service');

function parseArgs(argv) {
    const options = { days: 60, limit: 5000, live: true, carrier: null, carrierFile: null, overrides: [] };
    for (const arg of argv) {
        if (arg === '--no-live') options.live = false;
        else if (arg.startsWith('--days=')) options.days = Number(arg.slice(7));
        else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
        else if (arg.startsWith('--carrier=')) options.carrier = CarrierFactory.normalizeCarrierCode(arg.slice(10));
        else if (arg.startsWith('--carrier-file=')) options.carrierFile = arg.slice(15);
        else if (arg.startsWith('--carrier-destination=')) options.overrides.push(arg.slice(22));
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!Number.isInteger(options.days) || options.days < 30 || options.days > 62) throw new Error('--days must be between 30 and 62');
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 20000) throw new Error('--limit must be between 1 and 20000');
    return options;
}

function loadCarrierRecords(filename, overrides = []) {
    const rows = [];
    if (filename) {
        const resolved = path.resolve(filename);
        if (resolved.toLowerCase().endsWith('.json')) {
            const raw = fs.readFileSync(resolved, 'utf8');
            const parsed = JSON.parse(raw);
            rows.push(...(Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([awb, destinationCountryCode]) => ({ awb, destinationCountryCode }))));
        } else {
            const workbook = XLSX.readFile(resolved, { cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            rows.push(...XLSX.utils.sheet_to_json(sheet, { defval: null }));
        }
    }
    for (const override of overrides) {
        const [awb, destinationCountryCode] = override.split(':');
        rows.push({ awb, destinationCountryCode });
    }

    const records = new Map();
    for (const row of rows) {
        const awb = normalizeAwb(row.awb || row.trackingNumber || row.shipmentNumber);
        if (!awb) throw new Error(`Carrier record is missing an AWB: ${JSON.stringify(row)}`);
        const record = {
            ...row,
            destinationCountryCode: normalizeCountryCode(row.destinationCountryCode || row.countryCode || row.destination),
            carrierCode: row.carrierCode ? CarrierFactory.normalizeCarrierCode(row.carrierCode) : null
        };
        records.set(`${record.carrierCode || '*'}:${awb}`, record);
    }
    return records;
}

function findCarrierRecord(records, carrierCode, awb) {
    return records.get(`${carrierCode}:${awb}`) || records.get(`*:${awb}`) || null;
}

async function fetchLiveTracking(shipment) {
    const carrierCode = CarrierFactory.normalizeCarrierCode(shipment.carrierCode || shipment.carrier);
    const trackingNumber = resolveCarrierTrackingNumber(shipment);
    if (!trackingNumber) return { error: 'Missing carrier tracking number' };
    try {
        const isTest = shipment.pricingSnapshot?.isTest === true || shipment.pricingSnapshot?.environment === 'test';
        const adapter = CarrierFactory.getAdapter(carrierCode, { isTest, environment: isTest ? 'test' : 'production' });
        return { tracking: await adapter.getTracking(trackingNumber, shipment) };
    } catch (error) {
        return { error: error.message };
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const carrierRecords = loadCarrierRecords(options.carrierFile, options.overrides);
    const shipments = await prisma.shipment.findMany({
        where: buildAuditWhere({ days: options.days, carrierCode: options.carrier }),
        orderBy: { createdAt: 'desc' },
        take: options.limit
    });

    const findings = [];
    let trackingErrors = 0;
    for (const shipment of shipments) {
        const carrierCode = CarrierFactory.normalizeCarrierCode(shipment.carrierCode || shipment.carrier);
        const awb = normalizeAwb(resolveCarrierTrackingNumber(shipment) || shipment.trackingNumber);
        const carrierRecord = findCarrierRecord(carrierRecords, carrierCode, awb);
        const liveResult = options.live ? await fetchLiveTracking(shipment) : {};
        if (liveResult.error) trackingErrors++;
        const finding = auditShipmentRecord(shipment, { carrierRecord, liveTracking: liveResult.tracking });
        finding.trackingError = liveResult.error || null;
        if (finding.hasDiscrepancy || finding.trackingError) findings.push(finding);
    }

    const discrepancyCounts = {};
    findings.forEach((finding) => finding.discrepancies.forEach((kind) => { discrepancyCounts[kind] = (discrepancyCounts[kind] || 0) + 1; }));
    console.log(JSON.stringify({
        mode: 'read-only-audit',
        liveCarrierTracking: options.live,
        carrier: options.carrier || 'ALL_SUPPORTED_EXTERNAL_CARRIERS',
        scope: `Shipments from the last ${options.days} days, plus older non-terminal shipments`,
        scanned: shipments.length,
        authoritativeRecords: carrierRecords.size,
        findings: findings.length,
        trackingErrors,
        discrepancyCounts
    }, null, 2));
    if (findings.length) console.table(findings.map(({ discrepancies, detailComparisons, ...finding }) => ({ ...finding, discrepancies: discrepancies.join(',') })));
}

main()
    .catch((error) => {
        console.error(`Carrier shipment audit failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
