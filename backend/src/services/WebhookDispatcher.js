const axios = require('axios');
const crypto = require('crypto');
const WebhookSubscription = require('../models/WebhookSubscription.model');
const WebhookEvent = require('../models/WebhookEvent.model');
const logger = require('../utils/logger');

class WebhookDispatcher {
    /**
     * Dispatches an event to all matching active subscriptions for an organization
     * @param {string} event - The event name e.g. 'shipment.status_updated'
     * @param {mongoose.Types.ObjectId} organizationId
     * @param {Object} payload - The JSON payload to send
     */
    static async dispatch(event, organizationId, payload) {
        try {
            if (!organizationId) return;

            // Find matching subscriptions
            const subscriptions = await WebhookSubscription.find({
                organization: organizationId,
                isActive: true,
                events: { $in: [event, '*'] }
            });

            if (!subscriptions || subscriptions.length === 0) return;

            const promises = subscriptions.map(async (sub) => {
                // 1. Create Event record
                const webhookEvent = await WebhookEvent.create({
                    organization: organizationId,
                    subscription: sub._id,
                    event,
                    payload,
                    status: 'pending',
                    attempts: 0
                });

                // 2. Queue for delivery (Async Fire-and-Forget)
                this._deliver(sub, webhookEvent).catch(err => {
                    logger.error(`Webhook background delivery failed for event ${webhookEvent._id}:`, err);
                });
            });

            await Promise.allSettled(promises);
        } catch (error) {
            logger.error(`Failed to dispatch webhooks for event ${event}:`, error);
        }
    }

    static async _deliver(subscription, webhookEvent) {
        try {
            webhookEvent.attempts += 1;
            webhookEvent.lastAttemptAt = new Date();

            const payloadString = JSON.stringify(webhookEvent.payload);
            const signature = crypto.createHmac('sha256', subscription.secret).update(payloadString).digest('hex');

            await axios.post(subscription.targetUrl, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature-256': signature,
                    'X-Webhook-Event': webhookEvent.event
                },
                timeout: 5000
            });

            webhookEvent.status = 'success';
            await webhookEvent.save();
            logger.info(`Webhook ${webhookEvent._id} delivered successfully to ${subscription.targetUrl}`);
        } catch (error) {
            webhookEvent.status = 'failed';
            webhookEvent.lastError = error.message;
            await webhookEvent.save();
            logger.error(`Webhook ${webhookEvent._id} delivery failed:`, error.message);
        }
    }
}

module.exports = WebhookDispatcher;
