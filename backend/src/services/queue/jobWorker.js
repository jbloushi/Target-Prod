const jobQueue = require('./jobQueue');
const logger = require('../../utils/logger');

let isInitialized = false;

/**
 * Initializes and registers all background queue workers
 */
function initWorkers() {
    if (isInitialized) return jobQueue;
    isInitialized = true;

    // 1. Carrier Dispatch Worker
    jobQueue.registerWorker('carrier_dispatch', async (payload, context) => {
        logger.info(`[jobWorker] Processing carrier_dispatch for ${payload.trackingNumber} (Job ${context.jobId})`);
        const ShipmentBookingService = require('../ShipmentBookingService');
        return await ShipmentBookingService.executeCarrierDispatchJob(payload);
    });

    // 2. Chatwoot WhatsApp Notification Worker
    jobQueue.registerWorker('chatwoot_notify', async (payload, context) => {
        logger.info(`[jobWorker] Processing chatwoot_notify for event ${payload.eventType} (Job ${context.jobId})`);
        const chatwootService = require('../chatwootNotificationService');
        return await chatwootService.processQueuedNotification(payload);
    });

    // 3. Webhook Delivery Worker
    jobQueue.registerWorker('webhook_delivery', async (payload, context) => {
        logger.info(`[jobWorker] Processing webhook_delivery for event ${payload.webhookEventId} (Job ${context.jobId})`);
        const WebhookDispatcher = require('../WebhookDispatcher');
        return await WebhookDispatcher.processQueuedDelivery(payload);
    });

    // 4. Carrier Tracking Sync Worker
    jobQueue.registerWorker('tracking_sync', async (payload, context) => {
        logger.info(`[jobWorker] Processing tracking_sync for ${payload.trackingNumber} (Job ${context.jobId})`);
        const { syncCarrierTrackingHistory } = require('../../controllers/shipment.helpers');
        const { prisma } = require('../../config/database');

        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber: payload.trackingNumber }
        });

        if (!shipment) {
            logger.warn(`[jobWorker] Shipment ${payload.trackingNumber} not found for tracking sync`);
            return;
        }

        const updates = await syncCarrierTrackingHistory(shipment);
        if (updates) {
            await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                    history: updates.history,
                    status: updates.status
                }
            });
            logger.info(`[jobWorker] Tracking sync completed for ${payload.trackingNumber}, status: ${updates.status}`);
        }
    });

    // 5. Tryton ERP Shadow Dual-Writing Worker
    jobQueue.registerWorker('tryton_dual_write', async (payload, context) => {
        logger.info(`[jobWorker] Processing tryton_dual_write (${payload.action}) for ${payload.trackingNumber || payload.shipmentId} (Job ${context.jobId})`);
        const trytonClient = require('../tryton/trytonClient');
        const { prisma } = require('../../config/database');

        try {
            if (payload.action === 'CREATE_SHIPMENT') {
                const shipment = await prisma.shipment.findUnique({
                    where: { id: payload.shipmentId },
                    include: { user: true }
                });
                if (shipment) {
                    return await trytonClient.mirrorShipment(shipment);
                }
            } else if (payload.action === 'WAREHOUSE_SCAN') {
                return await trytonClient.mirrorWarehouseScan(payload.trackingNumber, payload.scanData);
            } else if (payload.action === 'SYNC_PARTY') {
                return await trytonClient.mirrorParty(payload.party);
            }
        } catch (err) {
            logger.error(`[jobWorker] Tryton dual-write failed for ${payload.trackingNumber || payload.shipmentId}: ${err.message}`);
            throw err; // Allow jobQueue retry with backoff
        }
    });

    return jobQueue;
}

module.exports = {
    initWorkers,
    jobQueue
};
