const { prisma } = require('../config/database');
const whatsappService = require('../services/whatsappIntegration.service');
const chatwootNotificationService = require('../services/chatwootNotificationService');
const whatsAppConfigService = require('../services/whatsAppConfig.service');
const { canAccessShipment } = require('../middleware/authorize.middleware');
const { hasCapability } = require('../middleware/rbac.policy');
const logger = require('../utils/logger');

/**
 * GET /api/admin/whatsapp/logs
 * Query paginated WhatsApp notification history for admin audit center
 */
async function getNotificationLogs(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
        const skip = (page - 1) * limit;

        const { search, status, templateName, provider, role, dateRange } = req.query;

        const where = {};

        // Status Filter
        if (status && status !== 'ALL') {
            const s = status.toUpperCase();
            if (s === 'SENT') {
                where.status = { in: ['SENT', 'sent', 'submitted'] };
            } else if (s === 'DELIVERED') {
                where.status = { in: ['DELIVERED', 'delivered'] };
            } else if (s === 'READ') {
                where.status = { in: ['READ', 'read'] };
            } else if (s === 'FAILED') {
                where.status = { in: ['FAILED', 'failed'] };
            } else if (s === 'QUEUED' || s === 'PENDING') {
                where.status = { in: ['PENDING', 'pending', 'queued', 'QUEUED', 'SKIPPED', 'skipped'] };
            } else {
                where.status = status;
            }
        }

        // Provider Filter
        if (provider && provider !== 'ALL') {
            const p = provider.toUpperCase();
            if (p === 'SHIPMENT_WHATSAPP' || p === 'TARGET_MSG') {
                where.provider = { in: ['SHIPMENT_WHATSAPP', 'TARGET_MSG'] };
            } else if (p === 'META') {
                where.provider = 'META';
            } else if (p === 'CHATWOOT') {
                where.provider = 'chatwoot';
            } else {
                where.provider = provider;
            }
        }

        // Recipient Role Filter
        if (role && role !== 'ALL') {
            const isSender = role.toUpperCase() === 'SENDER';
            where.recipientRole = isSender 
                ? { in: ['sender', 'shipper', 'merchant'] }
                : { in: ['receiver', 'customer', 'consignee'] };
        }

        // Date Range Filter
        if (dateRange && dateRange !== 'ALL') {
            const now = new Date();
            if (dateRange === 'TODAY') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                where.createdAt = { gte: today };
            } else if (dateRange === '24H') {
                const d24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
                where.createdAt = { gte: d24 };
            } else if (dateRange === '7D') {
                const d7 = new Date();
                d7.setDate(d7.getDate() - 7);
                where.createdAt = { gte: d7 };
            } else if (dateRange === '30D') {
                const d30 = new Date();
                d30.setDate(d30.getDate() - 30);
                where.createdAt = { gte: d30 };
            }
        }

        // Template Filter
        if (templateName && templateName !== 'ALL') {
            where.templateName = templateName;
        }

        // Search Filter (Fixed: removed non-existent externalMessageId field)
        if (search) {
            const cleanSearch = search.trim();
            where.OR = [
                { trackingNumber: { contains: cleanSearch } },
                { recipientPhone: { contains: cleanSearch } },
                { recipientName: { contains: cleanSearch } },
                { chatwootMessageId: { contains: cleanSearch } },
                { templateName: { contains: cleanSearch } }
            ];
        }

        const [total, logs] = await Promise.all([
            prisma.shipmentNotificationLog.count({ where }),
            prisma.shipmentNotificationLog.findMany({
                where,
                include: {
                    shipment: {
                        select: {
                            id: true,
                            trackingNumber: true,
                            carrierCode: true,
                            carrierShipmentId: true,
                            dhlTrackingNumber: true,
                            status: true,
                            origin: true,
                            destination: true,
                            documents: true,
                            createdAt: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            })
        ]);

        // Aggregate statistics for header summary KPI cards
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [
            totalLogs,
            sentToday,
            sentLast24h,
            totalDispatched,
            totalDelivered,
            totalRead,
            totalFailed,
            totalQueued
        ] = await Promise.all([
            prisma.shipmentNotificationLog.count(),
            prisma.shipmentNotificationLog.count({
                where: {
                    createdAt: { gte: todayStart },
                    status: { in: ['SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'submitted'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    createdAt: { gte: last24h },
                    status: { in: ['SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'submitted'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'submitted'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['DELIVERED', 'delivered', 'READ', 'read'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['READ', 'read'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['FAILED', 'failed'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['PENDING', 'pending', 'queued', 'QUEUED'] },
                    recipientRole: { in: ['sender', 'shipper', 'merchant'] }
                }
            })
        ]);

        const totalAttempts = totalDispatched + totalFailed;
        const deliveryRate = totalAttempts > 0 ? Math.round(((totalDelivered || totalDispatched) / totalAttempts) * 100) : 100;

        return res.json({
            success: true,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            },
            stats: {
                totalLogs,
                totalDispatched,
                sentToday,
                sentLast24h,
                totalDelivered,
                totalRead,
                totalFailed,
                totalQueued,
                deliveryRate
            },
            logs
        });
    } catch (err) {
        logger.error(`[Admin WhatsApp Logs Error] ${err.message}`);
        return res.status(500).json({ error: 'Failed to retrieve notification logs: ' + err.message });
    }
}

/**
 * POST /api/admin/whatsapp/resend/:id
 * Resend a failed or missing notification log entry
 */
async function resendNotification(req, res) {
    try {
        const { id } = req.params;
        const force = Boolean(req.body?.force);

        const existing = await prisma.shipmentNotificationLog.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Notification log entry not found' });
        }

        if (!force) {
            const isSender = ['sender', 'shipper', 'merchant'].includes((existing.recipientRole || '').toLowerCase());
            const roleGroup = isSender ? ['sender'] : ['receiver', 'customer', 'consignee'];

            const anySent = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    trackingNumber: existing.trackingNumber,
                    recipientRole: { in: roleGroup },
                    status: { in: ['submitted', 'SUBMITTED', 'SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read'] }
                }
            });

            if (anySent || ['SUBMITTED', 'SENT', 'DELIVERED', 'READ'].includes(String(existing.status || '').toUpperCase())) {
                return res.status(400).json({ 
                    error: `A notification was already successfully delivered for shipment ${existing.trackingNumber} to ${isSender ? 'Sender' : 'Consignee'}. Resending is disabled to prevent duplicate customer messages.`,
                    alreadySent: true
                });
            }
        }

        const shipment = await prisma.shipment.findFirst({
            where: { trackingNumber: existing.trackingNumber }
        });

        if (!shipment) {
            return res.status(404).json({ error: 'Associated shipment not found' });
        }

        const role = String(existing.recipientRole || '').toLowerCase();
        let result;
        if (['sender', 'shipper', 'merchant'].includes(role) && chatwootNotificationService.isShipmentConfirmationEvent(existing.eventType)) {
            result = await chatwootNotificationService.sendShipmentNotification(existing.eventType, shipment, {
                recipientRole: 'sender',
                templateName: 'shipment_confirmation_2',
                disableProviderFallback: true,
                existingLogId: existing.id,
                force
            });
        } else {
            const recipientPhone = ['sender', 'shipper', 'merchant'].includes(role)
                ? (shipment.origin?.phone || shipment.shipperPhone || shipment.customerPhone)
                : role === 'driver'
                    ? shipment.driverPhone
                    : (shipment.destination?.phone || shipment.receiverPhone || shipment.consigneePhone);
            if (!recipientPhone) {
                return res.status(400).json({ error: 'Recipient phone cannot be resolved from the shipment' });
            }
            result = await whatsappService.sendNotification({
                shipment,
                recipientRole: ['shipper', 'merchant'].includes(role) ? 'sender' : existing.recipientRole,
                recipientPhone,
                recipientName: existing.recipientName,
                eventType: existing.eventType,
                templateName: existing.templateName,
                force,
                existingLogId: existing.id
            });
        }

        return res.json({ success: true, result });
    } catch (err) {
        logger.error(`[Admin WhatsApp Resend Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/shipments/:trackingNumber/whatsapp/send
 * Trigger WhatsApp update directly from Shipment Details page
 */
async function sendShipmentWhatsApp(req, res) {
    try {
        const { trackingNumber } = req.params;
        const { recipientRole, recipientPhone, recipientName, eventType, templateName, customMessage, force } = req.body;

        const shipment = await prisma.shipment.findFirst({
            where: { trackingNumber }
        });

        if (!shipment) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ error: 'Permission denied' });
        }

        const canCustomizeDispatch = ['BOOK_CARRIERS', 'MANAGE_USERS', 'MANAGE_SYSTEM_SETTINGS']
            .some(capability => hasCapability(req.user.role, capability));
        if (!canCustomizeDispatch && (recipientPhone || recipientName || templateName || customMessage || force)) {
            return res.status(403).json({ error: 'Custom WhatsApp dispatch requires operational permission' });
        }

        let targetPhone = recipientPhone;
        let targetCountryCode = null;

        const effectiveRole = recipientRole || 'sender';
        if (!['sender', 'receiver', 'customer', 'consignee', 'driver'].includes(effectiveRole)) {
            return res.status(400).json({ error: 'Invalid recipient role' });
        }

        if (effectiveRole === 'sender') {
            targetPhone = targetPhone || shipment.origin?.phone || shipment.shipperPhone || shipment.customerPhone;
            targetCountryCode = shipment.origin?.phoneCountryCode || shipment.shipperPhoneCountryCode;
        } else if (effectiveRole === 'driver') {
            targetPhone = targetPhone || shipment.driverPhone;
            targetCountryCode = shipment.driverPhoneCountryCode;
        } else {
            // Customer / Receiver
            targetPhone = targetPhone || shipment.destination?.phone || shipment.receiverPhone || shipment.consigneePhone;
            targetCountryCode = shipment.destination?.phoneCountryCode || shipment.receiverPhoneCountryCode || shipment.consigneePhoneCountryCode;
        }

        if (!targetPhone) {
            return res.status(400).json({ error: 'Recipient phone number is missing' });
        }

        const requestedEvent = eventType || 'out_for_delivery';
        if (effectiveRole === 'sender' && chatwootNotificationService.isShipmentConfirmationEvent(requestedEvent)) {
            if (recipientPhone || customMessage || (templateName && templateName !== 'shipment_confirmation_2')) {
                return res.status(400).json({ error: 'Shipment confirmations use the approved shipper template and shipment phone' });
            }
            const result = await chatwootNotificationService.sendShipmentNotification(requestedEvent, shipment, {
                recipientRole: 'sender',
                templateName: 'shipment_confirmation_2',
                disableProviderFallback: true,
                force: Boolean(force)
            });
            return res.json({ success: true, result });
        }

        const result = await whatsappService.sendNotification({
            shipment,
            recipientRole: effectiveRole,
            recipientPhone: targetPhone,
            recipientCountryCode: targetCountryCode,
            recipientName: recipientName || (effectiveRole === 'driver' ? shipment.driverName : (effectiveRole === 'sender' ? (shipment.origin?.contactPerson || shipment.origin?.name) : shipment.customerName)),
            eventType: requestedEvent,
            templateName,
            customMessage,
            force: Boolean(force)
        });

        return res.json({ success: true, result });
    } catch (err) {
        logger.error(`[Shipment WhatsApp Send Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/whatsapp/templates
 * Retrieve available message templates from Meta WABA
 */
async function getMetaTemplates(req, res) {
    try {
        const templates = await whatsappService.getMetaTemplates();
        return res.json({ success: true, data: templates });
    } catch (err) {
        logger.error(`[WhatsApp Get Templates Controller Error] ${err.message}`);
        return res.status(500).json({ success: false, error: 'Failed to retrieve WhatsApp templates' });
    }
}

/**
 * POST /api/admin/whatsapp/sync-telemetry
 * Pull recent delivery lifecycle telemetry (sent, delivered, read) from msg.target-kw.com
 * and sync them into Prisma shipmentNotificationLog records.
 */
async function syncMicroserviceTelemetry(req, res) {
    try {
        const { getSystemSettings } = require('../services/systemSettings.service');
        const axios = require('axios');
        const settings = getSystemSettings()?.whatsapp || {};
        const serviceUrl = String(settings.serviceUrl || 'https://msg.target-kw.com').replace(/\/+$/, '');
        const adminToken = process.env.ADMIN_TOKEN || 'target-admin-secret-token-2026';

        let microMessages = [];
        try {
            const resp = await axios.get(`${serviceUrl}/api/stats/messages`, {
                params: { limit: 500 },
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'x-admin-token': adminToken
                },
                timeout: 8000
            });
            microMessages = resp.data?.messages || [];
        } catch (fetchErr) {
            logger.warn(`[Sync Telemetry] Could not fetch messages from microservice: ${fetchErr.message}`);
            return res.status(502).json({ error: `Could not reach WhatsApp microservice: ${fetchErr.message}` });
        }

        let updatedCount = 0;
        for (const msg of microMessages) {
            if (!msg.wamid) continue;

            const targetLog = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    OR: [
                        { chatwootMessageId: msg.wamid },
                        { chatwootMessageId: msg.id }
                    ]
                }
            });

            if (!targetLog) continue;

            const microStatus = String(msg.status || '').toUpperCase();
            const currentStatus = String(targetLog.status || '').toUpperCase();

            // Status precedence: READ (3) > DELIVERED (2) > SENT (1)
            const rank = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 2 };
            const newRank = rank[microStatus] || 1;
            const curRank = rank[currentStatus] || 1;

            const existingResp = (targetLog.responseJson && typeof targetLog.responseJson === 'object') ? targetLog.responseJson : {};
            let changed = false;
            const updatedResp = { ...existingResp };

            if (msg.deliveredAt && !updatedResp.deliveredAt) {
                updatedResp.deliveredAt = new Date(msg.deliveredAt).toISOString();
                changed = true;
            }
            if (msg.readAt && !updatedResp.readAt) {
                updatedResp.readAt = new Date(msg.readAt).toISOString();
                if (!updatedResp.deliveredAt) updatedResp.deliveredAt = updatedResp.readAt;
                changed = true;
            }

            let nextStatus = currentStatus;
            if (newRank > curRank) {
                nextStatus = microStatus;
                changed = true;
            }

            if (changed) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: targetLog.id },
                    data: {
                        status: nextStatus,
                        responseJson: updatedResp
                    }
                });
                updatedCount++;
            }
        }

        return res.json({
            success: true,
            totalFromMicroservice: microMessages.length,
            updatedCount,
            message: `Successfully synchronized telemetry: ${updatedCount} records updated.`
        });
    } catch (err) {
        logger.error(`[Sync Microservice Telemetry Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/admin/whatsapp/dispatch-queued
 * Safely batch-dispatches all pending/queued notifications with strict deduplication guards.
 */
async function dispatchQueuedNotifications(req, res) {
    try {
        const limit = Math.min(300, Math.max(1, parseInt(req.body?.limit || '200', 10)));
        const queuedLogs = await prisma.shipmentNotificationLog.findMany({
            where: {
                status: { in: ['QUEUED', 'queued', 'pending', 'PENDING'] },
                recipientRole: { in: ['sender', 'shipper', 'merchant'] }
            },
            include: {
                shipment: true
            },
            take: limit,
            orderBy: { createdAt: 'asc' }
        });

        if (queuedLogs.length === 0) {
            return res.json({
                success: true,
                message: 'No queued notifications found.',
                totalQueued: 0,
                dispatched: 0,
                skipped: 0,
                failed: 0
            });
        }

        let dispatched = 0;
        let skipped = 0;
        let failed = 0;

        for (const log of queuedLogs) {
            const roleGroup = ['sender', 'shipper', 'merchant'];

            // 1. Strict Deduplication Check: Local DB
            const anySent = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    trackingNumber: log.trackingNumber,
                    eventType: log.eventType,
                    recipientRole: { in: roleGroup },
                    status: { in: ['submitted', 'SUBMITTED', 'SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read'] },
                    id: { not: log.id }
                }
            });

            if (anySent) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'SKIPPED',
                        errorMessage: `Notification already delivered for this recipient role (Log ${anySent.id})`
                    }
                });
                skipped++;
                continue;
            }

            // 2. Fetch associated shipment if not eager-loaded
            const shipment = log.shipment || await prisma.shipment.findFirst({
                where: { trackingNumber: log.trackingNumber }
            });

            if (!shipment) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: { status: 'FAILED', errorMessage: 'Associated shipment record missing' }
                });
                failed++;
                continue;
            }

            try {
                const sender = chatwootNotificationService.getNotificationTargets(log.eventType, shipment, 'sender')[0];
                if (!sender?.phone) {
                    await prisma.shipmentNotificationLog.update({
                        where: { id: log.id },
                        data: { status: 'SKIPPED', errorMessage: 'SENDER_PHONE_NOT_FOUND' }
                    });
                    skipped++;
                    continue;
                }

                let sendStatus;
                if (chatwootNotificationService.isShipmentConfirmationEvent(log.eventType)) {
                    const result = await chatwootNotificationService.sendShipmentNotification(log.eventType, shipment, {
                        recipientRole: 'sender',
                        templateName: 'shipment_confirmation_2',
                        disableProviderFallback: true,
                        existingLogId: log.id
                    });
                    sendStatus = result?.results?.[0]?.status;
                } else {
                    const result = await whatsappService.sendNotification({
                        shipment,
                        recipientRole: 'sender',
                        recipientPhone: sender.phone,
                        recipientName: sender.name,
                        eventType: log.eventType,
                        templateName: log.templateName,
                        force: false,
                        existingLogId: log.id
                    });
                    sendStatus = result?.status;
                }

                if (['submitted', 'SENT', 'sent'].includes(sendStatus)) {
                    dispatched++;
                } else {
                    skipped++;
                }
            } catch (dispatchErr) {
                logger.warn(`[Batch Dispatch] Failed for ${log.trackingNumber} (${log.recipientRole}): ${dispatchErr.message}`);
                failed++;
            }

            // Throttle 200ms between sends to protect Meta API rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        return res.json({
            success: true,
            totalQueued: queuedLogs.length,
            dispatched,
            skipped,
            failed,
            message: `Batch processed: ${dispatched} sent, ${skipped} skipped (duplicates), ${failed} failed.`
        });
    } catch (err) {
        logger.error(`[Dispatch Queued Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/settings/whatsapp
 * Admin-only: retrieve WhatsApp configuration with masked secrets and event rules
 */
async function getWhatsAppConfig(req, res) {
    try {
        const config = await whatsAppConfigService.getConfig({ internal: false });
        const rules = await whatsAppConfigService.getRules();
        return res.json({
            success: true,
            config,
            rules
        });
    } catch (err) {
        logger.error(`[getWhatsAppConfig Error] ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * PUT /api/settings/whatsapp
 * Admin-only: update WhatsApp configuration and rules, preserving existing secrets
 */
async function updateWhatsAppConfig(req, res) {
    try {
        const { config, rules } = req.body || {};
        let updatedConfig = null;
        let updatedRules = null;

        if (config && typeof config === 'object') {
            updatedConfig = await whatsAppConfigService.updateConfig(config);
        } else {
            updatedConfig = await whatsAppConfigService.getConfig({ internal: false });
        }

        if (rules && Array.isArray(rules)) {
            updatedRules = await whatsAppConfigService.updateRules(rules);
        } else {
            updatedRules = await whatsAppConfigService.getRules();
        }

        return res.json({
            success: true,
            config: updatedConfig,
            rules: updatedRules
        });
    } catch (err) {
        logger.error(`[updateWhatsAppConfig Error] ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * POST /api/shipments/:trackingNumber/whatsapp/payment-link
 * Staff/Admin: trigger manual payment link notice via WhatsApp with custom checkout URL
 */
async function sendManualPaymentLinkNotice(req, res) {
    try {
        const { trackingNumber } = req.params;
        const { customPaymentUrl, paymentUrl, amount, recipientRole, recipientPhone, currency = 'KWD' } = req.body || {};

        const effectivePaymentUrl = customPaymentUrl || paymentUrl;

        if (!effectivePaymentUrl || typeof effectivePaymentUrl !== 'string') {
            return res.status(400).json({ success: false, error: 'Payment URL is required' });
        }

        const trimmedUrl = effectivePaymentUrl.trim();
        if (!trimmedUrl) {
            return res.status(400).json({ success: false, error: 'Payment URL cannot be empty' });
        }

        if (trimmedUrl.includes('\r') || trimmedUrl.includes('\n')) {
            return res.status(400).json({ success: false, error: 'CRLF injection rejected' });
        }

        try {
            const parsed = new URL(trimmedUrl);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return res.status(400).json({ success: false, error: 'Payment URL must use secure HTTP or HTTPS protocol' });
            }
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid URL format' });
        }

        let effectiveAmount = amount;
        if (effectiveAmount !== undefined && effectiveAmount !== null && effectiveAmount !== '') {
            const n = Number(effectiveAmount);
            if (!Number.isFinite(n) || n <= 0) {
                return res.status(400).json({ success: false, error: 'Amount must be greater than zero' });
            }
            effectiveAmount = n.toFixed(3);
        }

        const shipment = await prisma.shipment.findFirst({
            where: {
                OR: [
                    { trackingNumber },
                    { id: trackingNumber }
                ]
            }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        const role = (recipientRole === 'sender' || recipientRole === 'shipper') ? 'sender' : 'receiver';
        const finalAmount = effectiveAmount || Number(shipment.remainingBalance || shipment.price || 0).toFixed(3);

        const result = await whatsappService.sendPaymentLinkNotification({
            shipment,
            recipientRole: role,
            recipientPhone,
            paymentLink: trimmedUrl,
            amount: finalAmount,
            currency: shipment.currency || currency
        });

        return res.json({
            success: true,
            message: 'Payment link notification dispatched',
            data: result
        });
    } catch (err) {
        logger.error(`[sendManualPaymentLinkNotice Error] ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    getNotificationLogs,
    resendNotification,
    sendShipmentWhatsApp,
    getMetaTemplates,
    syncMicroserviceTelemetry,
    dispatchQueuedNotifications,
    getWhatsAppConfig,
    updateWhatsAppConfig,
    sendManualPaymentLinkNotice
};
