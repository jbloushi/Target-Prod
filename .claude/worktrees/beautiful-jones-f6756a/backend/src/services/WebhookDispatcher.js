const { prisma } = require('../config/database');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WebhookDispatcher {
    /**
     * Dispatches an event to all matching active subscriptions for an organization
     * @param {string} event - The event name e.g. 'shipment.status_updated'
     * @param {string} organizationId
     * @param {Object} payload - The JSON payload to send
     */
    static async dispatch(event, organizationId, payload) {
        try {
            if (!organizationId) return;

            // Find matching subscriptions
            // Note: Prisma Json filtering for "contains" can be tricky in MySQL. 
            // We fetch all active for the org and filter in memory if strictly needed, 
            // or use a join-like structure if we had a many-to-many. 
            // Since events is a Json array, we'll fetch and filter.
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

                // 2. Queue for delivery (Async Fire-and-Forget)
                this._deliver(sub, webhookEvent).catch(err => {
                    logger.error(`Webhook background delivery failed for event ${webhookEvent.id}:`, err);
                });
            }
        } catch (error) {
            logger.error(`Failed to dispatch webhooks for event ${event}:`, error);
        }
    }

    static async _deliver(subscription, webhookEvent) {
        try {
            const updatedEvent = await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    attempts: { increment: 1 },
                    lastAttemptAt: new Date()
                }
            });

            const payloadString = JSON.stringify(updatedEvent.payload);
            const signature = crypto.createHmac('sha256', subscription.secret).update(payloadString).digest('hex');

            await axios.post(subscription.targetUrl, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature-256': signature,
                    'X-Webhook-Event': updatedEvent.event
                },
                timeout: 5000
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
        }
    }
}

module.exports = WebhookDispatcher;
