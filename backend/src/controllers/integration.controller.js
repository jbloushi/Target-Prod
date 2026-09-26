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
    if (!secret) {
        if (process.env.NODE_ENV !== 'test' || process.env.ENFORCE_WEBHOOK_SECRETS === 'true') {
            logger.warn('[logestechs-webhook] Webhook secret not configured on server - failing closed');
            return res.status(401).json({ ok: false, error: 'Webhook secret is not configured' });
        }
    } else {
        const provided = req.headers['x-logestechs-webhook-secret'] || req.headers['x-webhook-secret'] || req.query?.secret || '';
        if (!safeTimingEqual(provided, secret)) {
            logger.warn('[logestechs-webhook] invalid secret - request rejected');
            return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
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
    if (!webhookSecret) {
        if (process.env.NODE_ENV !== 'test' || process.env.ENFORCE_WEBHOOK_SECRETS === 'true') {
            logger.warn('[chatwoot-webhook] Webhook secret not configured on server - failing closed');
            return res.status(401).json({ ok: false, error: 'Webhook secret is not configured' });
        }
    } else {
        const signature = req.headers['x-chatwoot-signature'] || '';
        const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody || '').digest('hex');
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            logger.warn('[chatwoot-webhook] invalid signature — request rejected');
            return res.status(401).json({ ok: false, error: 'Invalid webhook signature' });
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
    'pickup_scheduled',
    'received_at_hub',
    'verified_and_dispatched',
    'payment_link_ready',
    'payment_confirmed',
    'on_hold_customs_issue',
    'documents_needed',
    'delivery_attempt',
    'out_for_delivery',
    'delivered',
    'rto_in_transit',
    'returned'
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

const WebhookDispatcher = require('../services/WebhookDispatcher');
const { canAccessOrganization } = require('../middleware/authorize.middleware');

const resolveUserOrgId = async (req) => {
    if (req.user.organizationId) return req.user.organizationId;
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { organizationId: true }
    });
    return user?.organizationId || req.query.orgId || req.body.orgId || null;
};

/**
 * List all webhook subscriptions for current user organization
 */
exports.listWebhooks = async (req, res) => {
    try {
        const organizationId = await resolveUserOrgId(req);
        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'No organization linked to user' });
        }
        if (!canAccessOrganization(req, organizationId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized for this organization' });
        }

        const subscriptions = await prisma.webhookSubscription.findMany({
            where: { organizationId },
            include: {
                _count: {
                    select: { deliveryEvents: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({ success: true, data: subscriptions });
    } catch (error) {
        logger.error('[integration] listWebhooks error:', error);
        res.status(500).json({ success: false, error: 'Failed to list webhook subscriptions' });
    }
};

/**
 * Create a new webhook subscription
 */
exports.createWebhook = async (req, res) => {
    try {
        const organizationId = await resolveUserOrgId(req);
        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'No organization linked to user' });
        }
        if (!canAccessOrganization(req, organizationId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized for this organization' });
        }

        const { targetUrl, events, secret } = req.body || {};
        if (!targetUrl || !targetUrl.startsWith('http')) {
            return res.status(400).json({ success: false, error: 'A valid http/https targetUrl is required' });
        }

        const eventList = Array.isArray(events) && events.length > 0 ? events : ['*'];
        const signingSecret = secret || crypto.randomBytes(24).toString('hex');

        const subscription = await prisma.webhookSubscription.create({
            data: {
                organizationId,
                targetUrl,
                events: eventList,
                secret: signingSecret,
                isActive: true
            }
        });

        res.status(201).json({ success: true, data: subscription });
    } catch (error) {
        logger.error('[integration] createWebhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to create webhook subscription' });
    }
};

/**
 * Update an existing webhook subscription
 */
exports.updateWebhook = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await prisma.webhookSubscription.findUnique({ where: { id } });
        if (!sub) {
            return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
        }
        if (!canAccessOrganization(req, sub.organizationId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const { targetUrl, events, isActive, secret } = req.body || {};
        const updateData = {};
        if (targetUrl !== undefined) {
            if (!targetUrl || !targetUrl.startsWith('http')) {
                return res.status(400).json({ success: false, error: 'Valid targetUrl required' });
            }
            updateData.targetUrl = targetUrl;
        }
        if (events !== undefined && Array.isArray(events)) {
            updateData.events = events;
        }
        if (isActive !== undefined) {
            updateData.isActive = Boolean(isActive);
        }
        if (secret !== undefined && String(secret).trim().length > 0) {
            updateData.secret = String(secret).trim();
        }

        const updated = await prisma.webhookSubscription.update({
            where: { id },
            data: updateData
        });

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        logger.error('[integration] updateWebhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to update webhook subscription' });
    }
};

/**
 * Delete a webhook subscription
 */
exports.deleteWebhook = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await prisma.webhookSubscription.findUnique({ where: { id } });
        if (!sub) {
            return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
        }
        if (!canAccessOrganization(req, sub.organizationId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        // Delete associated delivery events first
        await prisma.webhookEvent.deleteMany({ where: { subscriptionId: id } });
        await prisma.webhookSubscription.delete({ where: { id } });

        res.status(200).json({ success: true, message: 'Webhook subscription deleted successfully' });
    } catch (error) {
        logger.error('[integration] deleteWebhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete webhook subscription' });
    }
};

/**
 * List recent delivery attempt logs for a webhook subscription
 */
exports.getWebhookEvents = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await prisma.webhookSubscription.findUnique({ where: { id } });
        if (!sub) {
            return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
        }
        if (!canAccessOrganization(req, sub.organizationId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const events = await prisma.webhookEvent.findMany({
            where: { subscriptionId: id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.status(200).json({ success: true, data: events });
    } catch (error) {
        logger.error('[integration] getWebhookEvents error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch webhook logs' });
    }
};

/**
 * Test a webhook subscription by sending an immediate ping payload
 */
exports.testWebhook = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await prisma.webhookSubscription.findUnique({ where: { id } });
        if (!sub) {
            return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
        }
        if (!canAccessOrganization(req, sub.organizationId)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const testPayload = {
            event: 'ping',
            timestamp: new Date().toISOString(),
            organizationId: sub.organizationId,
            message: 'Target-Prod Webhook Test Dispatch',
            sampleData: {
                trackingNumber: 'TRK-TEST-999',
                status: 'delivered',
                originCity: 'Kuwait City',
                destinationCity: 'Hawalli'
            }
        };

        const webhookEvent = await prisma.webhookEvent.create({
            data: {
                subscriptionId: sub.id,
                event: 'ping',
                payload: testPayload,
                status: 'pending',
                attempts: 0
            }
        });

        try {
            await WebhookDispatcher._deliver(sub, webhookEvent, true);
            const deliveredEvent = await prisma.webhookEvent.findUnique({ where: { id: webhookEvent.id } });
            res.status(200).json({
                success: true,
                message: `Test ping delivered successfully to ${sub.targetUrl}`,
                event: deliveredEvent
            });
        } catch (deliveryError) {
            const failedEvent = await prisma.webhookEvent.findUnique({ where: { id: webhookEvent.id } });
            res.status(422).json({
                success: false,
                error: `Webhook delivery failed: ${deliveryError.message}`,
                event: failedEvent
            });
        }
    } catch (error) {
        logger.error('[integration] testWebhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to execute webhook test' });
    }
};

/**
 * Preview shipments available in Phenix ERP without saving to DB
 * GET /api/v1/integrations/phenix/preview
 */
exports.previewPhenixShipments = async (req, res) => {
    try {
        const phenixSyncService = require('../services/phenixSync.service');
        const carrier = req.query.carrier || 'ALL';
        const daysBack = parseInt(req.query.daysBack, 10) || 3;

        const result = await phenixSyncService.previewPhenixShipments({
            carrier,
            daysBack
        });

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('[integration] previewPhenixShipments error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch preview from Phenix ERP'
        });
    }
};

/**
 * Trigger manual or scheduled pull of shipments from Phenix ERP
 * POST /api/v1/integrations/phenix/sync
 */
exports.syncPhenixShipments = async (req, res) => {
    try {
        const phenixSyncService = require('../services/phenixSync.service');
        const { carrier = 'DHL', daysBack = 3, sendWhatsApp = false } = req.body || {};

        const userId = req.user?.id || null;
        const organizationId = req.user?.organizationId || null;

        const result = await phenixSyncService.syncPhenixShipments({
            carrier,
            daysBack: parseInt(daysBack, 10) || 3,
            sendWhatsApp: Boolean(sendWhatsApp),
            triggeredBy: req.user?.email || 'manual',
            userId,
            organizationId
        });

        res.status(200).json({
            success: true,
            message: `Successfully synchronized ${result.matchedCount} shipments (${result.createdCount} created, ${result.updatedCount} updated, ${result.carrierSyncedCount} carrier synced)`,
            data: result
        });
    } catch (error) {
        logger.error('[integration] syncPhenixShipments error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to synchronize shipments from Phenix ERP'
        });
    }
};

/**
 * 17TRACK Universal Webhook Receiver (V2.2 & V2.4)
 * POST /api/integrations/17track/webhook
 */
exports.handle17TrackWebhook = async (req, res) => {
    try {
        const body = req.body || {};
        logger.info(`[17TRACK-Webhook] Received webhook notification: event=${body.event || 'TRACKING_UPDATED'}`);

        // 17TRACK sends data either as single object or array
        const items = Array.isArray(body) ? body : (Array.isArray(body.data) ? body.data : [body.data || body]);

        for (const item of items) {
            if (!item) continue;
            const trackingNum = item.number || item.tracking_number;
            if (!trackingNum) continue;

            const cleanTracking = String(trackingNum).trim();
            const cleanNumeric = cleanTracking.replace(/^TRK-/i, '').replace(/^ARM-/i, '');

            const shipment = await prisma.shipment.findFirst({
                where: {
                    OR: [
                        { trackingNumber: cleanTracking },
                        { trackingNumber: `TRK-${cleanNumeric}` },
                        { trackingNumber: cleanNumeric },
                        { dhlTrackingNumber: cleanNumeric },
                        { carrierShipmentId: cleanNumeric }
                    ]
                }
            });

            if (!shipment) {
                logger.debug(`[17TRACK-Webhook] Shipment not found for #${cleanTracking}`);
                continue;
            }

            const trackInfo = item.track_info || item.track || item;
            
            // Extract raw events across V2.2 & V2.4
            let rawEvents = [];
            if (trackInfo.tracking?.providers?.[0]?.events) {
                rawEvents = trackInfo.tracking.providers[0].events;
            } else if (Array.isArray(trackInfo.events)) {
                rawEvents = trackInfo.events;
            } else if (Array.isArray(trackInfo.z0?.z)) {
                rawEvents = trackInfo.z0.z;
            } else if (Array.isArray(trackInfo.z1?.z)) {
                rawEvents = trackInfo.z1.z;
            }

            if (rawEvents.length === 0) continue;

            // Map events into standard checkpoint format
            const parsedEvents = rawEvents.map(evt => {
                const ts = evt.time_iso || evt.time_utc || evt.a || evt.timestamp || new Date().toISOString();
                const loc = evt.location || evt.c || evt.d || evt.address || 'Carrier Network Hub';
                const desc = evt.description || evt.z || evt.stage || 'Carrier Checkpoint';
                const stage = evt.stage || evt.statusCode || trackInfo.latest_status?.status || trackInfo.e;
                
                let mappedStatus = 'in_transit';
                const stageStr = String(stage || desc).toLowerCase();
                if (stageStr.includes('deliver') || stageStr === '40') mappedStatus = 'delivered';
                else if (stageStr.includes('out_for_delivery') || stageStr.includes('outfordelivery') || stageStr === '35') mappedStatus = 'out_for_delivery';
                else if (stageStr.includes('pickup') || stageStr.includes('picked_up') || stageStr.includes('collected') || stageStr === '20') mappedStatus = 'picked_up';
                else if (stageStr.includes('exception') || stageStr.includes('alert') || stageStr.includes('undelivered') || stageStr === '50') mappedStatus = 'exception';

                return {
                    status: mappedStatus,
                    description: desc,
                    source: 'carrier',
                    timestamp: new Date(ts),
                    location: {
                        formattedAddress: typeof loc === 'string' ? loc : (loc.city || 'Carrier Facility'),
                        city: typeof loc === 'string' ? loc : loc.city
                    }
                };
            });

            // Merge with existing history
            const existingHistory = Array.isArray(shipment.history) ? shipment.history : [];
            const mergedHistory = compactHistory([...existingHistory, ...parsedEvents]);

            // Determine latest status
            const latestEvent = parsedEvents[parsedEvents.length - 1];
            const newStatus = latestEvent?.status || shipment.status;

            const updateData = {
                history: mergedHistory,
                status: newStatus
            };

            // Update weight & pieces if available from carrier telemetry and currently missing
            const misc = trackInfo.misc_info || {};
            const carrierWeight = parseFloat(misc.weight_kg || misc.weight_raw || 0);
            if (carrierWeight > 0 && (!shipment.actualWeight || Number(shipment.actualWeight) === 0)) {
                updateData.actualWeight = carrierWeight;
            }
            const carrierPieces = parseInt(misc.item_count || misc.pieces || 0, 10);
            if (carrierPieces > 0 && (!shipment.totalPieces || Number(shipment.totalPieces) === 0)) {
                updateData.totalPieces = carrierPieces;
            }

            const updatedShipment = await prisma.shipment.update({
                where: { id: shipment.id },
                data: updateData
            });

            logger.info(`[17TRACK-Webhook] Successfully synced #${shipment.trackingNumber}: status=${newStatus}, events=${mergedHistory.length}`);

            // Trigger proactive customer notification on milestone progression
            if (newStatus !== shipment.status) {
                const eventType = chatwootNotificationService.mapStatusToNotificationEvent(newStatus);
                if (eventType) {
                    chatwootNotificationService.triggerShipmentNotification(eventType, updatedShipment);
                }
            }
        }

        // 17TRACK requires { code: 0 } or { ok: true }
        return res.status(200).json({ code: 0, message: 'success' });
    } catch (err) {
        logger.error(`[17TRACK-Webhook Error] ${err.message}`);
        return res.status(200).json({ code: 0, message: 'error_logged' });
    }
};


