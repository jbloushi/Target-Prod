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
        const body = req.body;

        // Immediately respond 200 OK to Meta to avoid retries
        res.status(200).json({ status: 'EVENT_RECEIVED' });

        if (body.object !== 'whatsapp_business_account' && body.object !== 'whatsapp_account') {
            return;
        }

        const entries = body.entry || [];
        for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
                const value = change.value || {};
                
                // Process delivery status updates (sent, delivered, read, failed)
                const statuses = value.statuses || [];
                for (const statusObj of statuses) {
                    const wamid = statusObj.id;
                    const status = (statusObj.status || '').toUpperCase(); // DELIVERED, READ, FAILED
                    const recipientId = statusObj.recipient_id;
                    const timestamp = statusObj.timestamp ? new Date(statusObj.timestamp * 1000) : new Date();

                    logger.info(`[WhatsApp Status Webhook] wamid=${wamid} status=${status} recipient=${recipientId}`);

                    const existingLog = await prisma.shipmentNotificationLog.findFirst({
                        where: { externalMessageId: wamid }
                    });

                    if (existingLog) {
                        const errorDetails = statusObj.errors?.[0] ? statusObj.errors[0].title || statusObj.errors[0].message : null;
                        
                        await prisma.shipmentNotificationLog.update({
                            where: { id: existingLog.id },
                            data: {
                                status,
                                errorMessage: errorDetails || existingLog.errorMessage,
                                responseJson: {
                                    ...(existingLog.responseJson || {}),
                                    webhookStatus: statusObj,
                                    updatedAt: timestamp.toISOString()
                                }
                            }
                        });
                    }
                }
            }
        }
    } catch (err) {
        logger.error(`[Meta Webhook POST Error] ${err.message}`);
    }
}

module.exports = {
    verifyWebhook,
    handleWebhookEvent
};
