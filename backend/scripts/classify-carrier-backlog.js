#!/usr/bin/env node

require('dotenv').config();
const { prisma, closeDB } = require('../src/config/database');
const { getCarrierEventClassification } = require('../src/constants/statusConstants');
const { classifyEventBatch } = require('../src/services/geminiClassification.service');

const days = Math.max(1, Number(process.argv[2] || 60));
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const batchSize = Math.max(1, Number(process.env.GEMINI_BACKLOG_BATCH_SIZE || 25));

async function main() {
    if (process.env.GEMINI_CLASSIFICATION_ENABLED !== 'true' || !process.env.GEMINI_API_KEY) {
        throw new Error('Set GEMINI_CLASSIFICATION_ENABLED=true and GEMINI_API_KEY before running the backlog.');
    }

    const shipments = await prisma.shipment.findMany({
        where: { createdAt: { gte: cutoff }, NOT: { status: 'cancelled' } },
        select: { trackingNumber: true, carrierCode: true, history: true }
    });
    const work = [];
    for (const shipment of shipments) {
        const provider = String(shipment.carrierCode || shipment.carrier || 'DGR').toUpperCase();
        for (const event of Array.isArray(shipment.history) ? shipment.history : []) {
            if (!event?.timestamp || String(event.source || '').toLowerCase() !== 'carrier') continue;
            if (new Date(event.timestamp) < cutoff) continue;
            const classification = getCarrierEventClassification({
                statusCode: event.statusCode || event.status,
                description: event.description
            });
            if (classification.normalizedStatus) continue;
            work.push({
                provider,
                trackingNumber: shipment.trackingNumber,
                rawStatus: event.statusCode || event.status || null,
                description: event.description || '',
                timestamp: event.timestamp
            });
        }
    }

    const unique = [...new Map(work.map((event) => [require('../src/services/geminiClassification.service').fingerprintEvent(event), event])).values()];
    const summary = { shipments: shipments.length, ambiguousEvents: work.length, uniqueEvents: unique.length, batches: 0, classified: 0, manualReview: 0, skipped: 0, errors: 0 };
    for (let i = 0; i < unique.length; i += batchSize) {
        const batch = unique.slice(i, i + batchSize);
        const results = await classifyEventBatch(batch);
        summary.batches++;
        for (const result of results) {
            if (result.decision === 'classified') summary.classified++;
            else if (result.decision === 'manual_review') summary.manualReview++;
            else if (result.decision === 'skipped' || result.reused) summary.skipped++;
            else summary.errors++;
        }
        if ((i + batch.length) % (batchSize * 4) === 0 || i + batch.length === unique.length) {
            console.log(JSON.stringify({ progress: i + batch.length, total: unique.length, ...summary }));
        }
    }
    console.log(JSON.stringify({ ...summary, readOnly: true, lookbackDays: days }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDB);
