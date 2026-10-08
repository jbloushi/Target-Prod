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

module.exports = { classifyNewEvent, fingerprintEvent, PROMPT_VERSION };
