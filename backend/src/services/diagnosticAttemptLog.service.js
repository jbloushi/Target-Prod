/**
 * Diagnostic Attempt Log Service
 *
 * Registers shipment & carrier lifecycle attempts (draft creation, validation failures,
 * rate quotes, carrier booking, AWB/document generation, tracking sync) into an
 * in-memory ring buffer and persists non-blockingly via prisma.carrierLog.
 *
 * Never throws or crashes caller requests.
 */

const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const MAX_RING_BUFFER_SIZE = 250;

const VALID_STATUSES = Object.freeze(['SUCCESS', 'FAILED', 'VALIDATION_ERROR']);

const SENSITIVE_KEY_PATTERN = /(password|token|secret|apikey|api_key|authorization|cookie|creditcard|cvv|pin)/i;
const BINARY_KEY_PATTERN = /(base64|pdf|labeldata|awbdata|buffer)/i;
const STRING_SECRET_PATTERNS = [
    /(\bBearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|verify[_-]?token|password|secret|authorization|session_id)=)[^&\s]+/gi,
    /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|verify[_-]?token|session_id)=)[^&\s]+/gi
];

function redactSensitiveString(input) {
    return STRING_SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, '$1[REDACTED]'), input);
}

// In-memory ring buffer (newest at index 0)
const ringBuffer = [];

/**
 * Recursively sanitize details object so secrets and large binary payloads are never stored.
 * @param {*} value
 * @param {number} [depth=0]
 * @returns {*}
 */
function sanitizeDetails(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 4) return '[Truncated]';

    if (typeof value === 'string') {
        const redacted = redactSensitiveString(value);
        if (redacted.startsWith('data:application/pdf;base64,') || redacted.length > 500) {
            return `${redacted.slice(0, 120)}... [truncated ${redacted.length} chars]`;
        }
        return redacted;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.slice(0, 25).map((item) => sanitizeDetails(item, depth + 1));
    }

    if (typeof value === 'object') {
        const sanitized = {};
        for (const [key, val] of Object.entries(value)) {
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                sanitized[key] = '[REDACTED]';
            } else if (BINARY_KEY_PATTERN.test(key) && typeof val === 'string' && val.length > 100) {
                sanitized[key] = `[BINARY_TRUNCATED:${val.length}]`;
            } else {
                sanitized[key] = sanitizeDetails(val, depth + 1);
            }
        }
        return sanitized;
    }

    return String(value);
}

/**
 * Map diagnostic status to an HTTP-like statusCode for CarrierLog storage.
 * @param {string} status
 * @returns {number}
 */
function statusToCode(status) {
    if (status === 'SUCCESS') return 200;
    if (status === 'VALIDATION_ERROR') return 400;
    return 500;
}

/**
 * Normalize status value to one of SUCCESS | FAILED | VALIDATION_ERROR.
 * @param {string} status
 * @returns {'SUCCESS'|'FAILED'|'VALIDATION_ERROR'}
 */
function normalizeStatus(status) {
    const upper = String(status || 'FAILED').trim().toUpperCase();
    return VALID_STATUSES.includes(upper) ? upper : 'FAILED';
}

/**
 * Record a shipment/carrier diagnostic attempt.
 * Non-blocking and safe: never throws.
 *
 * @param {Object} entry
 * @param {string} [entry.trackingNumber]
 * @param {string} [entry.carrierCode]
 * @param {string} entry.action - e.g. DRAFT_CREATE | VALIDATION_ERROR | RATE_QUOTE | CARRIER_BOOK | DOCUMENT_GENERATE | TRACKING_SYNC
 * @param {'SUCCESS'|'FAILED'|'VALIDATION_ERROR'} entry.status
 * @param {number} [entry.durationMs]
 * @param {string} [entry.message]
 * @param {Object} [entry.details]
 * @param {string} [entry.organizationId]
 * @returns {Object} The recorded entry
 */
function recordAttempt(entry = {}) {
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
    const status = normalizeStatus(entry.status);
    const carrierCode = String(entry.carrierCode || 'SYSTEM').trim().toUpperCase();
    const action = String(entry.action || 'UNKNOWN').trim().toUpperCase();
    const trackingNumber = entry.trackingNumber ? String(entry.trackingNumber).trim() : null;
    const durationMs = Number.isFinite(Number(entry.durationMs)) ? Math.max(0, Math.round(Number(entry.durationMs))) : null;
    const message = String(entry.message || '').slice(0, 1000);
    const details = sanitizeDetails(entry.details || {});

    const record = {
        id: entry.id || crypto.randomUUID(),
        timestamp,
        trackingNumber,
        carrierCode,
        action,
        status,
        durationMs,
        message,
        details
    };

    try {
        ringBuffer.unshift(record);
        if (ringBuffer.length > MAX_RING_BUFFER_SIZE) {
            ringBuffer.length = MAX_RING_BUFFER_SIZE;
        }
    } catch (_) {
        // Never crash caller
    }

    // Persist asynchronously via prisma.carrierLog without blocking or throwing
    try {
        if (prisma && prisma.carrierLog && typeof prisma.carrierLog.create === 'function') {
            Promise.resolve(
                prisma.carrierLog.create({
                    data: {
                        id: record.id,
                        carrierCode: record.carrierCode,
                        requestType: record.action,
                        requestPayload: {
                            action: record.action,
                            status: record.status,
                            trackingNumber: record.trackingNumber,
                            timestamp: record.timestamp,
                            details: record.details
                        },
                        responsePayload: {
                            status: record.status,
                            message: record.message,
                            durationMs: record.durationMs
                        },
                        statusCode: statusToCode(record.status),
                        durationMs: record.durationMs,
                        trackingNumber: record.trackingNumber,
                        organizationId: entry.organizationId || null
                    }
                })
            ).catch((err) => {
                logger.debug(`[DiagnosticAttemptLog] DB persist skipped: ${err?.message || 'unknown error'}`);
            });
        }
    } catch (err) {
        logger.debug(`[DiagnosticAttemptLog] DB persist error: ${err?.message || 'unknown error'}`);
    }

    return record;
}

/**
 * Retrieve recent diagnostic attempts, filtering by optional criteria.
 * Combines DB records (if available) with in-memory ring buffer fallback.
 *
 * @param {Object} [filters]
 * @param {number} [filters.limit=50]
 * @param {string} [filters.carrierCode]
 * @param {string} [filters.action]
 * @param {string} [filters.status]
 * @param {string} [filters.trackingNumber]
 * @returns {Promise<Array>}
 */
async function getRecentAttempts(filters = {}) {
    const limit = Math.min(Math.max(1, parseInt(filters.limit, 10) || 50), MAX_RING_BUFFER_SIZE);
    const carrierFilter = filters.carrierCode ? String(filters.carrierCode).trim().toUpperCase() : null;
    const actionFilter = filters.action ? String(filters.action).trim().toUpperCase() : null;
    const statusFilter = filters.status ? String(filters.status).trim().toUpperCase() : null;
    const trackingFilter = filters.trackingNumber ? String(filters.trackingNumber).trim() : null;

    let combined = [...ringBuffer];

    try {
        if (prisma && prisma.carrierLog && typeof prisma.carrierLog.findMany === 'function') {
            const where = {};
            if (carrierFilter) where.carrierCode = carrierFilter;
            if (actionFilter) where.requestType = actionFilter;
            if (trackingFilter) where.trackingNumber = trackingFilter;

            const dbRows = await prisma.carrierLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit
            });

            if (Array.isArray(dbRows) && dbRows.length > 0) {
                const seenIds = new Set(combined.map((item) => item.id));
                for (const row of dbRows) {
                    if (seenIds.has(row.id)) continue;
                    const reqPayload = row.requestPayload && typeof row.requestPayload === 'object' ? row.requestPayload : {};
                    const resPayload = row.responsePayload && typeof row.responsePayload === 'object' ? row.responsePayload : {};
                    const derivedStatus = reqPayload.status || resPayload.status || (row.statusCode === 400 ? 'VALIDATION_ERROR' : (row.statusCode >= 400 ? 'FAILED' : 'SUCCESS'));
                    combined.push({
                        id: row.id,
                        timestamp: (row.createdAt ? new Date(row.createdAt) : new Date()).toISOString(),
                        trackingNumber: row.trackingNumber || reqPayload.trackingNumber || null,
                        carrierCode: row.carrierCode,
                        action: row.requestType,
                        status: normalizeStatus(derivedStatus),
                        durationMs: row.durationMs ?? resPayload.durationMs ?? null,
                        message: resPayload.message || '',
                        details: reqPayload.details || {}
                    });
                }
            }
        }
    } catch (err) {
        logger.debug(`[DiagnosticAttemptLog] DB query fallback to ring buffer: ${err?.message || 'unknown error'}`);
    }

    const filtered = combined.filter((item) => {
        if (carrierFilter && item.carrierCode !== carrierFilter) return false;
        if (actionFilter && item.action !== actionFilter) return false;
        if (statusFilter && item.status !== statusFilter) return false;
        if (trackingFilter && item.trackingNumber !== trackingFilter) return false;
        return true;
    });

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return filtered.slice(0, limit);
}

/**
 * Clear in-memory ring buffer (for tests).
 */
function clearBuffer() {
    ringBuffer.length = 0;
}

module.exports = {
    recordAttempt,
    getRecentAttempts,
    sanitizeDetails,
    clearBuffer,
    MAX_RING_BUFFER_SIZE
};
