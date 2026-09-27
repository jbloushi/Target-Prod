const { getSystemSettings } = require('../services/systemSettings.service');
const { prisma } = require('../config/database');
const whatsappService = require('../services/whatsappIntegration.service');
const logger = require('../utils/logger');

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
        const expectedToken = settings.webhookVerifyToken || 'target_logistics_meta_verify_secret_2026';

        if (mode === 'subscribe' && token === expectedToken) {
            logger.info('[Meta Webhook Verified] Successfully responded to Meta hub challenge');
            return res.status(200).send(challenge);
        }

        logger.warn(`[Meta Webhook Verification Failed] Invalid token supplied: ${token}`);
        return res.status(403).json({ error: 'Verification token mismatch' });
    } catch (err) {
        logger.error(`[Webhook Verification Error] ${err.message}`);
        return res.status(500).json({ error: 'Internal webhook error' });
    }
}

/**
 * POST /api/integrations/whatsapp/webhook
 * Incoming delivery receipts, status updates, and message logs from Meta
 */
async function handleWebhookEvent(req, res) {
    try {
        const body = req.body || {};

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
                    timestamp: new Date(),
                    error: body.error || body.errorMessage || null,
                    raw: body
                });
            }
        }

        // Apply extracted status updates to Prisma database
        for (const update of statusUpdates) {
            const raw = String(update.rawStatus || '').toUpperCase();
            let normalizedStatus = 'SENT';
            if (raw.includes('READ')) normalizedStatus = 'READ';
            else if (raw.includes('DELIVER') || raw === 'DELIVERY_ACK') normalizedStatus = 'DELIVERED';
            else if (raw.includes('FAIL') || raw.includes('ERROR')) normalizedStatus = 'FAILED';
            else if (raw.includes('SENT') || raw.includes('SERVER_ACK') || raw.includes('SUBMIT')) normalizedStatus = 'SENT';

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
                // Do not downgrade READ back to DELIVERED or SENT
                if (existingLog.status === 'READ' && normalizedStatus !== 'READ') {
                    continue;
                }

                await prisma.shipmentNotificationLog.update({
                    where: { id: existingLog.id },
                    data: {
                        status: normalizedStatus,
                        errorMessage: update.error || existingLog.errorMessage,
                        responseJson: {
                            ...(existingLog.responseJson && typeof existingLog.responseJson === 'object' ? existingLog.responseJson : {}),
                            webhookReceipt: update.raw,
                            receiptReceivedAt: new Date().toISOString()
                        }
                    }
                });

                logger.info(`[WhatsApp Status Webhook] Successfully updated log ${existingLog.id} (#${existingLog.trackingNumber}) -> ${normalizedStatus}`);
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
