const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const SALLA_TOKENS_FILE = path.resolve(process.cwd(), 'data', 'salla_tokens.json');

/**
 * Service to manage Salla API tokens and webhooks.
 */
class SallaIntegrationService {
    
    constructor() {
        this.clientId = process.env.SALLA_CLIENT_ID;
        this.clientSecret = process.env.SALLA_CLIENT_SECRET;
        this.webhookSecret = process.env.SALLA_WEBHOOK_SECRET;
    }

    /**
     * Verifies the Salla webhook signature
     * @param {string} body - The raw request body as string
     * @param {string} signature - The signature from headers
     * @returns {boolean}
     */
    verifyWebhookSignature(body, signature) {
        if (!this.webhookSecret) {
            logger.warn('Salla Webhook Secret is not configured.');
            return false;
        }

        const hmac = crypto.createHmac('sha256', this.webhookSecret);
        hmac.update(body);
        const hash = hmac.digest('hex');

        return hash === signature;
    }

    /**
     * Saves Salla App authorization tokens
     */
    saveTokens(merchantId, tokens) {
        let storeData = {};
        if (fs.existsSync(SALLA_TOKENS_FILE)) {
            storeData = JSON.parse(fs.readFileSync(SALLA_TOKENS_FILE, 'utf8'));
        }
        
        storeData[merchantId] = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            created_at: new Date().toISOString()
        };

        fs.writeFileSync(SALLA_TOKENS_FILE, JSON.stringify(storeData, null, 2), 'utf8');
        logger.info(`Salla tokens saved for merchant ID: ${merchantId}`);
    }

    /**
     * Gets saved tokens for a merchant
     */
    getTokens(merchantId) {
        if (fs.existsSync(SALLA_TOKENS_FILE)) {
            const storeData = JSON.parse(fs.readFileSync(SALLA_TOKENS_FILE, 'utf8'));
            return storeData[merchantId];
        }
        return null;
    }

    /**
     * Maps a Salla order to LogesTechs format and forwards it
     */
    async forwardOrderToLogesTechs(sallaOrder) {
        // We will call the existing LogesTechsAdapter
        const CarrierFactory = require('./CarrierFactory');
        const logestechs = CarrierFactory.getAdapter('OTE');
        
        const address = sallaOrder.shipping?.address || {};
        const customer = sallaOrder.customer || {};

        const logestechsPayload = {
            receiverName: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
            receiverPhone: customer.mobile || '',
            receiverAddress: {
                city: address.city || '',
                region: address.country || '',
                addressLine1: address.shipping_address || '',
            },
            notes: sallaOrder.notes || '',
            shipmentType: 'REGULAR',
            cod: String(sallaOrder.payment_method === 'cod' ? sallaOrder.amounts?.total?.amount : 0),
            codCollectionMethod: sallaOrder.payment_method === 'cod' ? 'COD' : 'PREPAID',
            invoiceNumber: sallaOrder.reference_id,
            items: (sallaOrder.items || []).map(item => ({
                sku: item.sku,
                price: item.amounts?.total?.amount || 0,
                quantity: item.quantity
            }))
        };

        logger.info(`Forwarding Salla Order ${sallaOrder.reference_id} to LogesTechs...`, logestechsPayload);
        
        try {
            const result = await logestechs.addFulfillmentOrder(logestechsPayload);
            logger.info(`Successfully forwarded Salla order ${sallaOrder.reference_id} to LogesTechs`, result);
            return result;
        } catch (error) {
            logger.error(`Failed to forward Salla order ${sallaOrder.reference_id} to LogesTechs`, error);
            throw error;
        }
    }
}

module.exports = new SallaIntegrationService();
