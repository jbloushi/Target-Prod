const { prisma } = require('../config/database');
const whatsappService = require('../services/whatsappIntegration.service');
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
                    status: { in: ['PENDING', 'pending', 'queued', 'QUEUED', 'SKIPPED', 'skipped'] }
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
            const isSender = (existing.recipientRole || '').toLowerCase() === 'sender';
            const roleGroup = isSender ? ['sender'] : ['receiver', 'customer', 'consignee'];

            const anySent = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    trackingNumber: existing.trackingNumber,
                    recipientRole: { in: roleGroup },
                    status: { in: ['SENT', 'DELIVERED', 'READ'] }
                }
            });

            if (anySent || ['SENT', 'DELIVERED', 'READ'].includes(existing.status)) {
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

        const result = await whatsappService.sendNotification({
            shipment,
            recipientRole: existing.recipientRole,
            recipientPhone: existing.recipientPhone,
            recipientName: existing.recipientName,
            eventType: existing.eventType,
            templateName: existing.templateName,
            force
        });

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

        let targetPhone = recipientPhone;
        let targetCountryCode = null;

        if (recipientRole === 'sender') {
            targetPhone = targetPhone || shipment.origin?.phone || shipment.shipperPhone || shipment.customerPhone;
            targetCountryCode = shipment.origin?.phoneCountryCode || shipment.shipperPhoneCountryCode;
        } else if (recipientRole === 'driver') {
            targetPhone = targetPhone || shipment.driverPhone;
            targetCountryCode = shipment.driverPhoneCountryCode;
        } else {
            // Customer / Receiver
            targetPhone = targetPhone || shipment.destination?.phone || shipment.customerPhone || shipment.origin?.phone;
            targetCountryCode = shipment.destination?.phoneCountryCode || shipment.customerPhoneCountryCode || shipment.origin?.phoneCountryCode;
        }

        if (!targetPhone) {
            return res.status(400).json({ error: 'Recipient phone number is missing' });
        }

        const result = await whatsappService.sendNotification({
            shipment,
            recipientRole: recipientRole || 'customer',
            recipientPhone: targetPhone,
            recipientCountryCode: targetCountryCode,
            recipientName: recipientName || (recipientRole === 'driver' ? shipment.driverName : shipment.customerName),
            eventType: eventType || 'out_for_delivery',
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

module.exports = {
    getNotificationLogs,
    resendNotification,
    sendShipmentWhatsApp,
    getMetaTemplates
};
