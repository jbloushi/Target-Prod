const { getSystemSettings } = require('../services/systemSettings.service');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const whatsappService = require('../services/whatsappIntegration.service');
const supportEvents = require('../services/supportEvents');
const logger = require('../utils/logger');
const LEGACY_VERIFY_TOKENS = new Set([
    'target_logistics_meta_verify_secret_2026',
    'change-me-verify-token'
]);
const RECEIPT_STATUS_RANK = Object.freeze({
    PENDING: 0,
    QUEUED: 0,
    PROCESSING: 0,
    SUBMITTED: 1,
    SENT: 2,
    FAILED: 3,
    DELIVERED: 4,
    READ: 5
});

function normalizeReceiptStatus(rawStatus) {
    const raw = String(rawStatus || '').toUpperCase();
    if (raw.includes('READ')) return 'READ';
    if (raw.includes('DELIVER') || raw === 'DELIVERY_ACK') return 'DELIVERED';
    if (raw.includes('FAIL') || raw.includes('ERROR')) return 'FAILED';
    if (raw.includes('SENT') || raw.includes('SERVER_ACK') || raw.includes('SUBMIT')) return 'SENT';
    return null;
}

function canAdvanceReceiptStatus(currentStatus, incomingStatus) {
    const current = String(currentStatus || '').toUpperCase();
    if (current === incomingStatus) return true;
    const currentRank = RECEIPT_STATUS_RANK[current];
    const incomingRank = RECEIPT_STATUS_RANK[incomingStatus];
    if (incomingRank === undefined) return false;
    if (currentRank === undefined) return true;
    return incomingRank > currentRank;
}

function statusesThatCanAdvanceTo(incomingStatus) {
    const incomingRank = RECEIPT_STATUS_RANK[incomingStatus];
    if (incomingRank === undefined) return [];
    return Object.entries(RECEIPT_STATUS_RANK)
        .filter(([, rank]) => rank <= incomingRank)
        .flatMap(([status]) => [status, status.toLowerCase()]);
}

function constantTimeEqual(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected) return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isValidMetaSignature(req, secret) {
    if (!secret || !Buffer.isBuffer(req.rawBody)) return false;
    const provided = req.headers?.['x-hub-signature-256'];
    if (typeof provided !== 'string' || !provided.startsWith('sha256=')) return false;
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
    return constantTimeEqual(provided, expected);
}

function isValidServiceSecret(req, secret) {
    if (!secret) return false;
    const provided = req.headers?.['x-whatsapp-webhook-secret'] || req.headers?.['x-webhook-secret'];
    return constantTimeEqual(provided, secret);
}

function authenticateStatusWebhook(req, body) {
    const settings = getSystemSettings()?.whatsapp || {};
    if (body.object === 'whatsapp_business_account' || body.object === 'whatsapp_account') {
        return isValidMetaSignature(req, settings.metaAppSecret || process.env.WHATSAPP_META_APP_SECRET);
    }
    return isValidServiceSecret(req, process.env.WHATSAPP_WEBHOOK_SHARED_SECRET);
}

/**
 * GET /api/integrations/whatsapp/webhook
 * Verification endpoint for Meta Webhook setup
 */
async function verifyWebhook(req, res) {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const settings = getSystemSettings()?.whatsapp || {};
        const expectedToken = settings.webhookVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

        if (mode === 'subscribe' && !LEGACY_VERIFY_TOKENS.has(token) && constantTimeEqual(token, expectedToken)) {
            logger.info('[Meta Webhook Verified] Successfully responded to Meta hub challenge');
            return res.status(200).send(challenge);
        }

        logger.warn('[Meta Webhook Verification Failed] Invalid or unconfigured verification token');
        return res.status(403).json({ error: 'Verification token mismatch' });
    } catch (err) {
        logger.error(`[Webhook Verification Error] ${err.message}`);
        return res.status(500).json({ error: 'Internal webhook error' });
    }
}

/**
 * POST /api/whatsapp/webhook (and aliases)
 * Incoming delivery receipts, status updates, and message logs from Meta
 */
async function handleWebhookEvent(req, res) {
    try {
        const body = req.body || {};

        if (!authenticateStatusWebhook(req, body)) {
            logger.warn('[WhatsApp Status Webhook] Rejected unauthenticated receipt callback');
            return res.status(401).json({ error: 'Invalid WhatsApp webhook signature or shared secret' });
        }

        // Immediately respond 200 OK to gateway to avoid retries
        res.status(200).json({ status: 'EVENT_RECEIVED' });

        const statusUpdates = [];

        // 1. Official Meta WhatsApp Cloud API format
        if (body.object === 'whatsapp_business_account' || body.object === 'whatsapp_account') {
            const entries = body.entry || [];
            for (const entry of entries) {
                const changes = entry.changes || [];
                for (const change of changes) {
                    const value = change.value || {};
                    const statuses = value.statuses || [];
                    for (const statusObj of statuses) {
                        statusUpdates.push({
                            id: statusObj.id,
                            rawStatus: statusObj.status,
                            timestamp: statusObj.timestamp ? new Date(statusObj.timestamp * 1000) : new Date(),
                            error: statusObj.errors?.[0] ? (statusObj.errors[0].title || statusObj.errors[0].message) : null,
                            raw: statusObj
                        });
                    }
                }
            }
        } 
        // 2. Evolution API / Baileys microservice format (messages.update, message.ack)
        else if (body.event === 'messages.update' || body.event === 'message.ack' || body.event === 'messages.ack') {
            const items = Array.isArray(body.data) ? body.data : [body.data || body];
            for (const item of items) {
                const messageId = item.key?.id || item.id || item.messageId;
                let rawStatus = item.status || item.ack || '';
                // Map Evolution numeric or text status: 1 = PENDING, 2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED
                if (rawStatus === 3 || rawStatus === 'DELIVERY_ACK') rawStatus = 'delivered';
                else if (rawStatus === 4 || rawStatus === 5 || rawStatus === 'READ') rawStatus = 'read';
                else if (rawStatus === 2 || rawStatus === 'SERVER_ACK') rawStatus = 'sent';
                else if (rawStatus === 'ERROR' || rawStatus === 'FAILED') rawStatus = 'failed';

                if (messageId && rawStatus) {
                    statusUpdates.push({
                        id: messageId,
                        rawStatus,
                        timestamp: new Date(),
                        error: item.error || null,
                        raw: item
                    });
                }
            }
        }
        // 3. Direct JSON microservice receipt callback format ({ messageId, status })
        else if (body.messageId || body.wamid || body.id) {
            const messageId = body.messageId || body.wamid || body.id;
            const rawStatus = body.status || body.event;
            if (messageId && rawStatus) {
                statusUpdates.push({
                    id: messageId,
                    rawStatus,
                    timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
                    error: body.error || body.errorMessage || null,
                    raw: body
                });
            }
        }

        // Apply extracted status updates to Prisma database
        for (const update of statusUpdates) {
            const normalizedStatus = normalizeReceiptStatus(update.rawStatus);
            if (!normalizedStatus) {
                logger.info('[WhatsApp Status Webhook] Ignored unrecognized provider receipt status');
                continue;
            }

            logger.info(`[WhatsApp Status Webhook] Processing receipt: id=${update.id} status=${normalizedStatus}`);

            const existingLog = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    OR: [
                        { chatwootMessageId: update.id },
                        { id: update.id }
                    ]
                }
            });

            if (existingLog) {
                // Provider receipts may arrive out of order; never downgrade progress.
                if (!canAdvanceReceiptStatus(existingLog.status, normalizedStatus)) {
                    logger.info(`[WhatsApp Status Webhook] Ignored regressive receipt for log ${existingLog.id}`);
                    continue;
                }

                const existingResp = (existingLog.responseJson && typeof existingLog.responseJson === 'object') ? existingLog.responseJson : {};
                const nowIso = new Date().toISOString();
                const tsIso = update.timestamp ? update.timestamp.toISOString() : nowIso;

                const responseJson = {
                    ...existingResp,
                    webhookReceipt: update.raw,
                    receiptReceivedAt: nowIso
                };

                if (normalizedStatus === 'DELIVERED') {
                    responseJson.deliveredAt = responseJson.deliveredAt || tsIso;
                } else if (normalizedStatus === 'READ') {
                    responseJson.readAt = responseJson.readAt || tsIso;
                    if (!responseJson.deliveredAt) {
                        responseJson.deliveredAt = responseJson.readAt;
                    }
                }

                const updateResult = await prisma.shipmentNotificationLog.updateMany({
                    where: {
                        id: existingLog.id,
                        status: { in: statusesThatCanAdvanceTo(normalizedStatus) }
                    },
                    data: {
                        status: normalizedStatus,
                        errorMessage: update.error || existingLog.errorMessage,
                        responseJson
                    }
                });

                if (updateResult.count === 0) {
                    logger.info(`[WhatsApp Status Webhook] Ignored concurrent regressive receipt for log ${existingLog.id}`);
                    continue;
                }

                supportEvents.broadcastUnreadUpdate({
                    logId: existingLog.id,
                    trackingNumber: existingLog.trackingNumber,
                    status: normalizedStatus,
                    timestamp: tsIso
                });

                logger.info(`[WhatsApp Status Webhook] Updated log ${existingLog.id} (#${existingLog.trackingNumber}) -> ${normalizedStatus} (deliveredAt: ${responseJson.deliveredAt}, readAt: ${responseJson.readAt})`);
            }
        }

        // If received directly from Meta (not forwarded), forward to msg.target-kw.com microservice
        const isForwarded = req.headers['x-forwarded-from'];
        const settings = getSystemSettings()?.whatsapp || {};
        const serviceUrl = String(settings.serviceUrl || 'https://msg.target-kw.com').replace(/\/+$/, '');
        if (!isForwarded && serviceUrl) {
            const axios = require('axios');
            if (body.object === 'whatsapp_business_account' || body.object === 'whatsapp_account') {
                axios.post(`${serviceUrl}/api/webhook`, body, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Forwarded-From': 'target-prod'
                    },
                    timeout: 5000
                }).catch(err => logger.debug(`[WhatsApp Webhook Forward to Microservice failed] ${err.message}`));
            }

            // Also forward normalized individual status receipts to microservice sync endpoint
            for (const upd of statusUpdates) {
                const s = String(upd.rawStatus || '').toLowerCase();
                const norm = s.includes('read') ? 'read' : s.includes('deliver') ? 'delivered' : s.includes('fail') ? 'failed' : 'sent';
                axios.post(`${serviceUrl}/api/webhook/sync-receipt`, {
                    wamid: upd.id,
                    status: norm,
                    timestamp: upd.timestamp ? upd.timestamp.getTime() : Date.now(),
                    error: upd.error
                }, {
                    headers: { 'Content-Type': 'application/json', 'X-Forwarded-From': 'target-prod' },
                    timeout: 4000
                }).catch(() => {});
            }
        }
    } catch (err) {
        logger.error(`[WhatsApp Webhook Error] ${err.message}`);
    }
}

module.exports = {
    verifyWebhook,
    handleWebhookEvent
};
