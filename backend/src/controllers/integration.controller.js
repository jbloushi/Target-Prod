const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const config = require('../config/config');
const chatwootNotificationService = require('../services/chatwootNotificationService');
const { compactHistory } = require('./shipment.helpers');
const { normalizeStatus } = require('../constants/statusConstants');

// Chatwoot message statuses that map to our log statuses
const CHATWOOT_STATUS_MAP = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
};

const safeTimingEqual = (left = '', right = '') => {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const normalizeLogesTechsTimestamp = (value) => {
    if (!value) return new Date();
    if (typeof value === 'number') return new Date(value);
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && String(value).trim().length >= 10) return new Date(asNumber);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const buildLogesTechsDescription = (body = {}) => {
    return body.newStatus || body.status || body.enStatus || body.message || 'LogesTechs status update';
};

const resolveLogesTechsCodStatus = (normalizedStatus, body = {}, shipment = {}) => {
    const codAmount = Number(body.cod ?? shipment.codAmount ?? 0);
    if (codAmount <= 0) return shipment.codStatus || null;
    if (normalizedStatus === 'delivered') return 'collected';
    if (['exception', 'cancelled'].includes(normalizedStatus)) return 'failed';
    return shipment.codStatus || 'pending';
};

exports.handleLogesTechsWebhook = async (req, res) => {
    const secret = config.logesTechsWebhookSecret;
    if (secret) {
        const provided = req.headers['x-logestechs-webhook-secret'] || req.headers['x-webhook-secret'] || req.query?.secret || '';
        if (!safeTimingEqual(provided, secret)) {
            logger.warn('[logestechs-webhook] invalid secret - request rejected');
            return res.status(401).json({ ok: false });
        }
    }

    const body = req.body || {};
    const barcode = body.barcode || body.packageBarcode || body.trackingNumber;
    const packageId = body.packageId != null ? String(body.packageId) : null;
    const status = body.newStatus || body.status;

    if (!barcode && !packageId) {
        logger.warn('[logestechs-webhook] missing barcode/packageId');
        return res.status(400).json({ ok: false, error: 'barcode or packageId is required' });
    }

    const lookupTerms = [barcode, packageId].filter(Boolean).map(String);
    const shipment = await prisma.shipment.findFirst({
        where: {
            carrierCode: 'OTE',
            OR: [
                { trackingNumber: { in: lookupTerms } },
                { dhlTrackingNumber: { in: lookupTerms } },
                { carrierShipmentId: { in: lookupTerms } }
            ]
        }
    });

    if (!shipment) {
        logger.warn('[logestechs-webhook] shipment not found', { barcode, packageId, status });
        return res.status(202).json({ ok: true, matched: false });
    }

    const normalizedStatus = normalizeStatus(status || shipment.status);
    const timestamp = normalizeLogesTechsTimestamp(body.time || body.timestamp || body.updatedAt);
    const history = compactHistory([
        ...(Array.isArray(shipment.history) ? shipment.history : []),
        {
            status: normalizedStatus,
            source: 'carrier',
            description: buildLogesTechsDescription(body),
            timestamp,
            location: {
                formattedAddress: body.nextDestination || body.location || body.driverName || 'LogesTechs',
                city: body.nextDestination || body.location || undefined,
                contactPerson: body.driverName || undefined,
                phone: body.driverPhone || undefined
            },
            carrierPayload: {
                packageId: body.packageId || null,
                barcode: barcode || null,
                paymentType: body.paymentType || null
            }
        }
    ]);

    const updateData = {
        history,
        status: normalizedStatus,
        codStatus: resolveLogesTechsCodStatus(normalizedStatus, body, shipment)
    };
    if (body.cod !== undefined && body.cod !== null && shipment.codAmount == null) {
        updateData.codAmount = Number(body.cod);
        updateData.codCurrency = shipment.codCurrency || 'AED';
    }

    await prisma.shipment.update({
        where: { id: shipment.id },
        data: updateData
    });

    logger.info('[logestechs-webhook] shipment status updated', {
        trackingNumber: shipment.trackingNumber,
        status: normalizedStatus,
        barcode,
        packageId
    });

    return res.status(200).json({ ok: true });
};

exports.handleChatwootWebhook = async (req, res) => {
    const webhookSecret = config.chatwoot?.webhookSecret;
    if (webhookSecret) {
        const signature = req.headers['x-chatwoot-signature'] || '';
        const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody || '').digest('hex');
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            logger.warn('[chatwoot-webhook] invalid signature — request rejected');
            return res.status(401).json({ ok: false });
        }
    }

    res.status(200).json({ ok: true });

    const body = req.body || {};
    const event = body.event;
    const messageId = body.id ? String(body.id) : null;
    const rawStatus = body.content_attributes?.status || body.status;

    logger.info(`[chatwoot-webhook] received event=${event} id=${messageId} status=${rawStatus} conv=${body.conversation?.id}`);

    if (event !== 'message_updated') {
        logger.info(`[chatwoot-webhook] ignored event type: ${event}`);
        return;
    }

    if (!messageId) {
        logger.warn('[chatwoot-webhook] message_updated missing id field');
        return;
    }

    const accountId = String(body.account?.id || '');
    const expectedAccountId = String(config.chatwoot?.accountId || '');
    if (expectedAccountId && accountId !== expectedAccountId) {
        logger.warn(`[chatwoot-webhook] account mismatch: got ${accountId}, expected ${expectedAccountId}`);
        return;
    }

    const mappedStatus = CHATWOOT_STATUS_MAP[rawStatus];
    if (!mappedStatus) {
        logger.info(`[chatwoot-webhook] unmapped status "${rawStatus}" — no update`);
        return;
    }

    try {
        const updated = await prisma.shipmentNotificationLog.updateMany({
            where: { chatwootMessageId: messageId },
            data: { status: mappedStatus, updatedAt: new Date() }
        });

        logger.info(`[chatwoot-webhook] message ${messageId} → ${mappedStatus} (matched ${updated.count} log rows)`);
        if (updated.count === 0) {
            logger.warn(`[chatwoot-webhook] no log row has chatwootMessageId=${messageId} — delivery status not tracked`);
        }
    } catch (error) {
        logger.error(`[chatwoot-webhook] db update failed for message ${messageId}: ${error.message}`);
    }
};

const VALID_EVENTS = [
    'shipment_created',
    'on_hold_customs_issue',
    'documents_needed',
    'delivery_attempt',
    'out_for_delivery'
];

exports.sendChatwootTestMessage = async (req, res) => {
    try {
        const { trackingNumber, eventType = 'shipment_created', recipientRole, force = false } = req.body || {};

        if (!trackingNumber) {
            return res.status(400).json({ success: false, error: 'trackingNumber is required' });
        }
        if (!VALID_EVENTS.includes(eventType)) {
            return res.status(400).json({ success: false, error: `Invalid eventType. Valid: ${VALID_EVENTS.join(', ')}` });
        }
        if (recipientRole && !['sender', 'receiver'].includes(recipientRole)) {
            return res.status(400).json({ success: false, error: 'recipientRole must be sender or receiver' });
        }

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        let shipmentForSend = shipment;
        if (recipientRole) {
            shipmentForSend = {
                ...shipment,
                origin: recipientRole === 'sender' ? shipment.origin : { ...(shipment.origin || {}), phone: null },
                destination: recipientRole === 'receiver' ? shipment.destination : { ...(shipment.destination || {}), phone: null }
            };
        }

        const result = await chatwootNotificationService.sendShipmentNotification(eventType, shipmentForSend, { force: Boolean(force) });
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error('[chatwoot] test message failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to send Chatwoot test message' });
    }
};

exports.previewChatwootShipmentMessage = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { eventType = 'shipment_created', recipientRole } = req.query || {};

        if (!trackingNumber) {
            return res.status(400).json({ success: false, error: 'trackingNumber is required' });
        }
        if (!VALID_EVENTS.includes(eventType)) {
            return res.status(400).json({ success: false, error: `Invalid eventType. Valid: ${VALID_EVENTS.join(', ')}` });
        }
        if (recipientRole && !['sender', 'receiver'].includes(recipientRole)) {
            return res.status(400).json({ success: false, error: 'recipientRole must be sender or receiver' });
        }

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        const previews = chatwootNotificationService.buildShipmentNotificationPreview(eventType, shipment, recipientRole || null);
        return res.status(200).json({ success: true, data: previews });
    } catch (error) {
        logger.error('[chatwoot] preview message failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to preview Chatwoot message' });
    }
};
