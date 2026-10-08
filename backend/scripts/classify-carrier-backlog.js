#!/usr/bin/env node

require('dotenv').config();
const { prisma, closeDB } = require('../src/config/database');
const { getCarrierEventClassification } = require('../src/constants/statusConstants');
const { classifyNewEvent } = require('../src/services/geminiClassification.service');

const days = Math.max(1, Number(process.argv[2] || 60));
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const concurrency = Math.max(1, Number(process.env.GEMINI_BACKLOG_CONCURRENCY || 2));

async function main() {
    if (process.env.GEMINI_CLASSIFICATION_ENABLED !== 'true' || !process.env.GEMINI_API_KEY) {
        throw new Error('Set GEMINI_CLASSIFICATION_ENABLED=true and GEMINI_API_KEY before running the backlog.');
    }

    const shipments = await prisma.shipment.findMany({
        where: { createdAt: { gte: cutoff }, NOT: { status: 'cancelled' } },
        select: { trackingNumber: true, carrierCode: true, carrier: true, history: true }
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

    const summary = { shipments: shipments.length, ambiguousEvents: work.length, classified: 0, manualReview: 0, skipped: 0, errors: 0 };
    for (let i = 0; i < work.length; i += concurrency) {
        const batch = work.slice(i, i + concurrency);
        const results = await Promise.all(batch.map((event) => classifyNewEvent(event).catch((error) => ({ decision: 'error', errorMessage: error.message }))));
        for (const result of results) {
            if (result.decision === 'classified') summary.classified++;
            else if (result.decision === 'manual_review') summary.manualReview++;
            else if (result.decision === 'skipped' || result.reused) summary.skipped++;
            else summary.errors++;
        }
        if ((i + batch.length) % 50 === 0 || i + batch.length === work.length) {
            console.log(JSON.stringify({ progress: i + batch.length, total: work.length, ...summary }));
        }
    }
    console.log(JSON.stringify({ ...summary, readOnly: true, lookbackDays: days }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDB);
