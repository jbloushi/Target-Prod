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

        const { search, status, templateName } = req.query;

        const where = {};
        if (status && status !== 'ALL') {
            where.status = status.toUpperCase();
        }
        if (templateName) {
            where.templateName = templateName;
        }
        if (search) {
            where.OR = [
                { trackingNumber: { contains: search } },
                { recipientPhone: { contains: search } },
                { recipientName: { contains: search } },
                { externalMessageId: { contains: search } }
            ];
        }

        const [total, logs] = await Promise.all([
            prisma.shipmentNotificationLog.count({ where }),
            prisma.shipmentNotificationLog.findMany({
                where,
                orderBy: { sentAt: 'desc' },
                skip,
                take: limit
            })
        ]);

        // Aggregate statistics for header summary KPI cards
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [sentToday, totalDelivered, totalRead, totalFailed] = await Promise.all([
            prisma.shipmentNotificationLog.count({ where: { sentAt: { gte: todayStart } } }),
            prisma.shipmentNotificationLog.count({ where: { status: 'DELIVERED' } }),
            prisma.shipmentNotificationLog.count({ where: { status: 'READ' } }),
            prisma.shipmentNotificationLog.count({ where: { status: 'FAILED' } })
        ]);

        return res.json({
            success: true,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            },
            stats: {
                sentToday,
                totalDelivered,
                totalRead,
                totalFailed
            },
            logs
        });
    } catch (err) {
        logger.error(`[Admin WhatsApp Logs Error] ${err.message}`);
        return res.status(500).json({ error: 'Failed to retrieve notification logs' });
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
