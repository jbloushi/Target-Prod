const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const whatsAppConfigService = require('./whatsAppConfig.service');

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
            // 1. Clean up any queued receiver records immediately — auto WhatsApp is strictly shipper-only
            await prisma.shipmentNotificationLog.updateMany({
                where: {
                    status: { in: ['QUEUED', 'queued', 'pending', 'PENDING'] },
                    recipientRole: { notIn: ['sender', 'shipper', 'merchant'] }
                },
                data: {
                    status: 'SKIPPED',
                    errorMessage: 'AUTOMATED_CONSIGNEE_SUPPRESSED'
                }
            });

            // 2. Check if currently quiet hours
            const isQuiet = await whatsAppConfigService.isQuietHours().catch(() => false);
            if (isQuiet) {
                logger.debug('[WhatsAppQueueDrainer] Currently in quiet hours. Deferring shipper queue drain.');
                return;
            }

            // 3. Find queued sender notifications
            const queued = await prisma.shipmentNotificationLog.findMany({
                where: {
                    status: { in: ['QUEUED', 'queued', 'pending', 'PENDING'] },
                    recipientRole: { in: ['sender', 'shipper', 'merchant'] }
                },
                take: options.maxBatch || 50,
                orderBy: { createdAt: 'asc' }
            });

            if (queued.length === 0) return;

            logger.info(`[WhatsAppQueueDrainer] Draining ${queued.length} queued shipper notifications via Chatwoot...`);
            const whatsappIntegration = require('./whatsappIntegration.service');
            const chatwootNotificationService = require('./chatwootNotificationService');

            for (const log of queued) {
                try {
                    const shipment = await prisma.shipment.findFirst({
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

                    if (SHIPMENT_LIFECYCLE_EVENTS.has(log.eventType)) {
                        await chatwootNotificationService.sendShipmentNotification(log.eventType, shipment, {
                            recipientRole: 'sender',
                            templateName: 'shipment_confirmation_2',
                            disableProviderFallback: true,
                            force: true
                        });
                    } else {
                        await whatsappIntegration.sendNotification({
                            shipment,
                            recipientRole: 'sender',
                            recipientPhone: log.recipientPhone,
                            recipientName: log.recipientName,
                            eventType: log.eventType,
                            templateName: log.templateName,
                            force: true, // Bypass quiet hours check since we verified not quiet hours
                            existingLogId: log.id,
                            provider: 'chatwoot'
                        });
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
