const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const PROMPT_VERSION = 'carrier-status-v1';
const ALLOWED_STATUSES = new Set(['booked', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'exception']);

const fingerprintEvent = ({ provider, trackingNumber, rawStatus, description, timestamp }) => crypto
    .createHash('sha256')
    .update([provider, trackingNumber, rawStatus, description, timestamp].map((v) => String(v || '')).join('|'))
    .digest('hex');

const classifyNewEvent = async ({ provider, trackingNumber, rawStatus, description, timestamp }) => {
    const eventFingerprint = fingerprintEvent({ provider, trackingNumber, rawStatus, description, timestamp });
    const existing = await prisma.geminiClassificationLog.findUnique({ where: { eventFingerprint } });
    if (existing) return { ...existing, reused: true };

    if (process.env.GEMINI_CLASSIFICATION_ENABLED !== 'true' || !process.env.GEMINI_API_KEY) {
        return { eventFingerprint, decision: 'skipped', reason: 'Gemini classification is disabled or unconfigured' };
    }

    const base = { eventFingerprint, provider, trackingNumber, rawStatus, rawDescription: description, model: MODEL, promptVersion: PROMPT_VERSION };
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `Classify this carrier tracking event. Return JSON only with normalizedStatus, operationalFlags, confidence. Allowed statuses: ${[...ALLOWED_STATUSES].join(', ')}. Never infer delivery without explicit delivery evidence. Provider: ${provider}; raw status: ${rawStatus || ''}; description: ${description}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
        });
        if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
        const payload = await response.json();
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const result = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
        const normalizedStatus = ALLOWED_STATUSES.has(result.normalizedStatus) ? result.normalizedStatus : null;
        const confidence = Number.isFinite(Number(result.confidence)) ? Math.max(0, Math.min(1, Number(result.confidence))) : null;
        const decision = normalizedStatus && confidence !== null && confidence >= 0.8 ? 'classified' : 'manual_review';
        return await prisma.geminiClassificationLog.create({ data: { ...base, normalizedStatus, operationalFlags: Array.isArray(result.operationalFlags) ? result.operationalFlags : [], confidence, decision, responsePayload: payload } });
    } catch (error) {
        logger.warn(`[GeminiClassification] ${provider}/${trackingNumber}: ${error.message}`);
        return await prisma.geminiClassificationLog.create({ data: { ...base, decision: 'error', errorMessage: error.message } });
    }
};

const classifyEventBatch = async (events = []) => {
    if (!events.length) return [];
    const fingerprints = events.map((event) => fingerprintEvent(event));
    const existing = await prisma.geminiClassificationLog.findMany({ where: { eventFingerprint: { in: fingerprints } } });
    // Successful/manual-review records are immutable for deduplication; failed
    // records are eligible for retry after configuration/API issues are fixed.
    const existingByFingerprint = new Map(existing.filter((row) => row.decision !== 'error').map((row) => [row.eventFingerprint, row]));
    const pending = events.filter((event) => !existingByFingerprint.has(fingerprintEvent(event)));
    const results = events.map((event) => existingByFingerprint.get(fingerprintEvent(event))).filter(Boolean);
    if (!pending.length) return results;
    if (process.env.GEMINI_CLASSIFICATION_ENABLED !== 'true' || !process.env.GEMINI_API_KEY) return results;

    const items = pending.map((event) => ({
        id: fingerprintEvent(event), provider: event.provider, rawStatus: event.rawStatus || '', description: event.description || ''
    }));
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `Classify every carrier event in the JSON array. Return JSON only as {"results":[{"id":"...","normalizedStatus":"booked|in_transit|out_for_delivery|delivered|returned|exception|null","operationalFlags":[],"confidence":0}]}. Never infer delivery without explicit evidence. Confidence below 0.8 requires manual_review. Events: ${JSON.stringify(items)}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
        });
        if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
        const payload = await response.json();
        const parsed = JSON.parse((payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{"results":[]}').replace(/^```json\s*|\s*```$/g, '').trim());
        const byId = new Map((Array.isArray(parsed.results) ? parsed.results : []).map((item) => [item.id, item]));
        const created = await Promise.all(pending.map((event) => {
            const id = fingerprintEvent(event);
            const item = byId.get(id) || {};
            const normalizedStatus = ALLOWED_STATUSES.has(item.normalizedStatus) ? item.normalizedStatus : null;
            const confidence = Number.isFinite(Number(item.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : null;
            return prisma.geminiClassificationLog.upsert({ where: { eventFingerprint: id }, update: { normalizedStatus, operationalFlags: Array.isArray(item.operationalFlags) ? item.operationalFlags : [], confidence, decision: normalizedStatus && confidence !== null && confidence >= 0.8 ? 'classified' : 'manual_review', model: MODEL, promptVersion: PROMPT_VERSION, responsePayload: payload, errorMessage: null }, create: { eventFingerprint: id, provider: event.provider, trackingNumber: event.trackingNumber, rawStatus: event.rawStatus, rawDescription: event.description, normalizedStatus, operationalFlags: Array.isArray(item.operationalFlags) ? item.operationalFlags : [], confidence, decision: normalizedStatus && confidence !== null && confidence >= 0.8 ? 'classified' : 'manual_review', source: 'gemini', model: MODEL, promptVersion: PROMPT_VERSION, responsePayload: payload } });
        }));
        return [...results, ...created];
    } catch (error) {
        await Promise.all(pending.map((event) => prisma.geminiClassificationLog.upsert({ where: { eventFingerprint: fingerprintEvent(event) }, update: { decision: 'error', errorMessage: error.message, model: MODEL, promptVersion: PROMPT_VERSION }, create: { eventFingerprint: fingerprintEvent(event), provider: event.provider, trackingNumber: event.trackingNumber, rawStatus: event.rawStatus, rawDescription: event.description, decision: 'error', source: 'gemini', model: MODEL, promptVersion: PROMPT_VERSION, errorMessage: error.message } })));
        return results;
    }
};

module.exports = { classifyNewEvent, classifyEventBatch, fingerprintEvent, PROMPT_VERSION };
