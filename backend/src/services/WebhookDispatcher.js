const { prisma } = require('../config/database');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WebhookDispatcher {
    /**
     * Dispatches an event to all matching active subscriptions for an organization
     * @param {string} event - The event name e.g. 'shipment.status_updated', 'shipment.created', 'shipment.booked'
     * @param {string} organizationId
     * @param {Object} payload - The JSON payload to send
     */
    static async dispatch(event, organizationId, payload) {
        try {
            if (!organizationId) return;

            // Find matching subscriptions
            const subscriptions = await prisma.webhookSubscription.findMany({
                where: {
                    organizationId,
                    isActive: true
                }
            });

            const matchingSubs = subscriptions.filter(sub => {
                const events = Array.isArray(sub.events) ? sub.events : [];
                return events.includes(event) || events.includes('*');
            });

            if (matchingSubs.length === 0) return;

            const jobQueue = require('./queue/jobQueue');

            for (const sub of matchingSubs) {
                // 1. Create Event record
                const webhookEvent = await prisma.webhookEvent.create({
                    data: {
                        subscriptionId: sub.id,
                        event,
                        payload,
                        status: 'pending',
                        attempts: 0
                    }
                });

                // 2. Queue for delivery with retry and backoff
                try {
                    await jobQueue.enqueue('webhook_delivery', {
                        webhookEventId: webhookEvent.id,
                        subscriptionId: sub.id
                    }, {
                        maxRetries: 5,
                        backoffMs: 15000
                    });
                } catch (queueErr) {
                    logger.warn(`[WebhookDispatcher] Queue enqueue failed, falling back to direct delivery for event ${webhookEvent.id}: ${queueErr.message}`);
                    this._deliver(sub, webhookEvent).catch(err => {
                        logger.error(`Webhook background delivery failed for event ${webhookEvent.id}:`, err);
                    });
                }
            }
        } catch (error) {
            logger.error(`Failed to dispatch webhooks for event ${event}:`, error);
        }
    }

    /**
     * Worker processor for queued webhook delivery
     */
    static async processQueuedDelivery(payload) {
        const { webhookEventId, subscriptionId } = payload;
        
        const webhookEvent = await prisma.webhookEvent.findUnique({
            where: { id: webhookEventId }
        });

        if (!webhookEvent) {
            logger.warn(`[WebhookDispatcher] Webhook event ${webhookEventId} not found`);
            return;
        }

        const subscription = await prisma.webhookSubscription.findUnique({
            where: { id: subscriptionId }
        });

        if (!subscription || !subscription.isActive) {
            logger.warn(`[WebhookDispatcher] Subscription ${subscriptionId} not found or inactive`);
            await prisma.webhookEvent.update({
                where: { id: webhookEventId },
                data: { status: 'cancelled', lastError: 'Subscription inactive or deleted' }
            });
            return;
        }

        // Run delivery - will throw on network/HTTP failure so jobQueue retries
        return await this._deliver(subscription, webhookEvent, true);
    }

    /**
     * Executes the HTTP delivery and signature verification
     * @param {Object} subscription
     * @param {Object} webhookEvent
     * @param {boolean} [throwOnError=false]
     */
    static async _deliver(subscription, webhookEvent, throwOnError = false) {
        try {
            const updatedEvent = await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    attempts: { increment: 1 },
                    lastAttemptAt: new Date()
                }
            });

            const payloadString = JSON.stringify(updatedEvent.payload);
            const secret = subscription.secret || '';
            const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

            await axios.post(subscription.targetUrl, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature-256': signature,
                    'X-Webhook-Event': updatedEvent.event
                },
                timeout: 8000
            });

            await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { status: 'success' }
            });
            
            logger.info(`Webhook ${webhookEvent.id} delivered successfully to ${subscription.targetUrl}`);
        } catch (error) {
            await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    status: 'failed',
                    lastError: error.message
                }
            });
            logger.error(`Webhook ${webhookEvent.id} delivery failed:`, error.message);
            if (throwOnError) {
                throw error;
            }
        }
    }
}

module.exports = WebhookDispatcher;
