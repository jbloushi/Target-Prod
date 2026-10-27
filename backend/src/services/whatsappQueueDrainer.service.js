const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const whatsAppConfigService = require('./whatsAppConfig.service');
const shipmentWhatsAppPolicy = require('./shipmentWhatsAppPolicy.service');

const MANUAL_RETRY_TEMPLATES = ['payment_request_v1', 'location_request_v1', 'return_portal_v1', 'customer_inquiry_start'];
const QUEUED_STATUSES = ['QUEUED', 'queued', 'pending', 'PENDING'];

const SHIPMENT_LIFECYCLE_EVENTS = new Set([
    'shipment_created',
    'new_shipment_created',
    'shipment_created_backfill',
    'pickup_scheduled',
    'received_at_hub',
    'verified_and_dispatched',
    'on_hold_customs_issue',
    'documents_needed',
    'delivery_attempt',
    'out_for_delivery',
    'delivered',
    'rto_in_transit',
    'returned'
]);

class WhatsAppQueueDrainerService {
    constructor() {
        this.timer = null;
        this.isDraining = false;
        this.drainIntervalMs = 60000; // Check every 60 seconds
    }

    start() {
        if (this.timer) return;
        logger.info('[WhatsAppQueueDrainer] Background queue drainer started');
        // Initial run after 5s
        setTimeout(() => this.drainQueue().catch(() => {}), 5000);
        this.timer = setInterval(() => {
            this.drainQueue().catch(err => {
                logger.error(`[WhatsAppQueueDrainer] Drain error: ${err.message}`);
            });
        }, this.drainIntervalMs);
        if (this.timer && typeof this.timer.unref === 'function') {
            this.timer.unref();
        }
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.info('[WhatsAppQueueDrainer] Background queue drainer stopped');
        }
    }

    async drainQueue(options = { maxBatch: 50 }) {
        if (this.isDraining) return;
        this.isDraining = true;
        try {
            // Shipment lifecycle sends are manual-only. Close legacy auto-created
            // queue entries instead of replaying stale milestone notifications.
            await prisma.shipmentNotificationLog.updateMany({
                where: {
                    status: { in: QUEUED_STATUSES },
                    eventType: { in: [...SHIPMENT_LIFECYCLE_EVENTS] }
                },
                data: { status: 'SKIPPED', errorMessage: 'AUTOMATIC_SHIPMENT_MESSAGES_DISABLED' }
            });

            // These rows predate the current approved manual action contract.
            await prisma.shipmentNotificationLog.updateMany({
                where: {
                    status: { in: QUEUED_STATUSES },
                    templateName: { notIn: MANUAL_RETRY_TEMPLATES }
                },
                data: {
                    status: 'SKIPPED',
                    errorMessage: 'UNAPPROVED_QUEUED_SHIPMENT_ACTION'
                }
            });

            // 2. Check if currently quiet hours
            const isQuiet = await whatsAppConfigService.isQuietHours().catch(() => false);
            if (isQuiet) {
                logger.debug('[WhatsAppQueueDrainer] Currently in quiet hours. Deferring shipper queue drain.');
                return;
            }

            // Only explicit payment/location/return/engagement actions can be
            // retried in the background. Lifecycle confirmations are manual-only.
            const queued = await prisma.shipmentNotificationLog.findMany({
                where: {
                    status: { in: QUEUED_STATUSES },
                    templateName: { in: MANUAL_RETRY_TEMPLATES }
                },
                take: options.maxBatch || 50,
                orderBy: { createdAt: 'asc' },
                include: { shipment: true }
            });

            if (queued.length === 0) return;

            logger.info(`[WhatsAppQueueDrainer] Draining ${queued.length} queued shipper notifications via Chatwoot...`);
            const whatsappIntegration = require('./whatsappIntegration.service');
            const chatwootNotificationService = require('./chatwootNotificationService');

            for (const log of queued) {
                try {
                    const shipment = log.shipment || await prisma.shipment.findFirst({
                        where: {
                            OR: [
                                ...(log.shipmentId ? [{ id: log.shipmentId }] : []),
                                ...(log.trackingNumber ? [{ trackingNumber: log.trackingNumber }] : [])
                            ]
                        },
                        include: { user: true, organization: true }
                    });

                    if (!shipment) {
                        await prisma.shipmentNotificationLog.update({
                            where: { id: log.id },
                            data: { status: 'SKIPPED', errorMessage: 'SHIPMENT_NOT_FOUND' }
                        });
                        continue;
                    }

                    const role = ['sender', 'shipper', 'merchant'].includes(String(log.recipientRole || '').toLowerCase()) ? 'sender' : 'receiver';
                    const policyBlock = shipmentWhatsAppPolicy.terminalBlock(shipment)
                        || shipmentWhatsAppPolicy.validateManualAction({ eventType: log.eventType, templateName: log.templateName, recipientRole: role });
                    if (policyBlock) {
                        await prisma.shipmentNotificationLog.update({
                            where: { id: log.id },
                            data: { status: 'SKIPPED', errorMessage: policyBlock.code ? `${policyBlock.code}${policyBlock.status ? `:${policyBlock.status}` : ''}` : policyBlock.message }
                        });
                        continue;
                    }

                    const acceptedStatuses = ['submitted', 'SUBMITTED', 'SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read'];
                    const activeStatuses = [...acceptedStatuses, 'QUEUED', 'queued', 'PENDING', 'pending', 'PROCESSING', 'processing'];
                    const duplicate = await prisma.shipmentNotificationLog.findFirst({
                        where: {
                            shipmentId: shipment.id,
                            eventType: log.eventType,
                            templateName: log.templateName,
                            recipientRole: { in: role === 'sender' ? ['sender', 'shipper', 'merchant'] : ['receiver', 'consignee', 'customer'] },
                            status: { in: activeStatuses },
                            id: { not: log.id }
                        }
                    });
                    if (duplicate) {
                        const alreadyAccepted = acceptedStatuses.includes(duplicate.status);
                        await prisma.shipmentNotificationLog.update({
                            where: { id: log.id },
                            data: { status: 'SKIPPED', errorMessage: alreadyAccepted ? 'DUPLICATE_ALREADY_SUBMITTED' : 'DISPATCH_ALREADY_IN_FLIGHT' }
                        });
                        continue;
                    }

                    const target = chatwootNotificationService.getNotificationTargets(log.eventType, shipment, role)[0];
                    if (!target?.phone) {
                        await prisma.shipmentNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', errorMessage: 'MISSING_RECIPIENT_PHONE' } });
                        continue;
                    }
                    const result = await whatsappIntegration.sendNotification({
                        shipment,
                        recipientRole: role,
                        recipientPhone: target.phone,
                        recipientName: target.name,
                        eventType: log.eventType,
                        templateName: log.templateName,
                        force: false,
                        manualDispatch: true,
                        existingLogId: log.id,
                        provider: 'chatwoot'
                    });
                    if (!['submitted', 'sent', 'delivered', 'read'].includes(String(result?.status || '').toLowerCase())) {
                        logger.info(`[WhatsAppQueueDrainer] Notification ${log.id} ended as ${result?.status || 'unknown'} (${result?.reason || 'no reason'})`);
                    }

                    // Throttle 250ms between sends to protect API rate limits
                    await new Promise(r => setTimeout(r, 250));
                } catch (err) {
                    logger.warn(`[WhatsAppQueueDrainer] Failed to drain log ${log.id} (${log.trackingNumber}): ${err.message}`);
                    await prisma.shipmentNotificationLog.update({
                        where: { id: log.id },
                        data: {
                            status: 'FAILED',
                            errorMessage: err.message
                        }
                    }).catch(() => null);
                }
            }
        } finally {
            this.isDraining = false;
        }
    }
}

module.exports = new WhatsAppQueueDrainerService();
