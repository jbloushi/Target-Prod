const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { prisma } = require('../config/database');
const { generateUniqueCarrierTrackingNumber } = require('../utils/shipmentUtils');

const SALLA_TOKENS_FILE = path.resolve(process.cwd(), 'data', 'salla_tokens.json');
const SALLA_API_BASE = 'https://api.salla.dev/admin/v2';
const SALLA_OAUTH_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';

/**
 * Service to manage Salla API tokens, webhooks, stock synchronization, and shipment tracking.
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
            try {
                storeData = JSON.parse(fs.readFileSync(SALLA_TOKENS_FILE, 'utf8'));
            } catch (_) {
                storeData = {};
            }
        }
        
        const now = Date.now();
        const expiresInMs = (tokens.expires_in || 1209600) * 1000; // Default 14 days
        
        storeData[merchantId] = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: new Date(now + expiresInMs).toISOString(),
            created_at: new Date().toISOString()
        };

        const dir = path.dirname(SALLA_TOKENS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(SALLA_TOKENS_FILE, JSON.stringify(storeData, null, 2), 'utf8');
        logger.info(`Salla tokens saved for merchant ID: ${merchantId}`);
    }

    /**
     * Gets all registered merchants
     */
    getAllMerchants() {
        if (!fs.existsSync(SALLA_TOKENS_FILE)) return {};
        try {
            return JSON.parse(fs.readFileSync(SALLA_TOKENS_FILE, 'utf8'));
        } catch (_) {
            return {};
        }
    }

    /**
     * Gets a valid, auto-refreshed access token for a merchant
     */
    async getValidAccessToken(merchantId) {
        const merchants = this.getAllMerchants();
        const tokenData = merchants[merchantId];
        if (!tokenData || !tokenData.access_token) return null;

        const expiresAt = new Date(tokenData.expires_at || 0).getTime();
        const now = Date.now();
        
        // If token expires in less than 24 hours, refresh it
        if (now >= expiresAt - (24 * 60 * 60 * 1000)) {
            logger.info(`Refreshing Salla token for merchant ${merchantId}...`);
            try {
                const response = await axios.post(SALLA_OAUTH_TOKEN_URL, {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: tokenData.refresh_token
                }, { headers: { 'Content-Type': 'application/json' } });

                if (response.data && response.data.access_token) {
                    this.saveTokens(merchantId, response.data);
                    return response.data.access_token;
                }
            } catch (error) {
                logger.error(`Failed to refresh Salla token for merchant ${merchantId}: ${error.message}`);
                return tokenData.access_token; // Fallback to current token
            }
        }

        return tokenData.access_token;
    }

    /**
     * Combines the exact phone and mobile_code provided directly by Salla (no guesswork).
     */
    extractSallaPhone(customer = {}, address = {}) {
        const rawMobile = String(customer.mobile || customer.phone || address.phone || address.mobile || '').trim();
        const mobileCode = String(customer.mobile_code || customer.phone_code || '').trim();

        if (!rawMobile) return '';

        // If Salla already provided the full number starting with + or 00
        if (rawMobile.startsWith('+')) return rawMobile;
        if (rawMobile.startsWith('00')) return '+' + rawMobile.slice(2);

        // If Salla provided an explicit mobile_code (e.g. "+20", "0020", "966")
        if (mobileCode) {
            const cleanCode = mobileCode.startsWith('+') ? mobileCode : (mobileCode.startsWith('00') ? '+' + mobileCode.slice(2) : '+' + mobileCode);
            const digitsCode = cleanCode.replace(/\D/g, '');
            const digitsMobile = rawMobile.replace(/\D/g, '');

            if (digitsMobile.startsWith(digitsCode)) {
                return '+' + digitsMobile;
            }

            const cleanMobile = rawMobile.startsWith('0') ? rawMobile.slice(1) : rawMobile;
            return `${cleanCode}${cleanMobile}`;
        }

        // Return the exact number stored in Salla as-is
        return rawMobile;
    }

    /**
     * Builds a native Target Logistics Shipment, dispatches to LogesTechs (OTE),
     * triggers WhatsApp notification, and attaches Target tracking to Salla.
     */
    async forwardOrderToLogesTechs(sallaOrder, merchantId = null) {
        const address = sallaOrder.shipping?.address || {};
        const customer = sallaOrder.customer || {};
        const invoiceNumber = String(sallaOrder.reference_id || sallaOrder.id || '');

        const receiverName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Salla Customer';
        const receiverPhone = this.extractSallaPhone(customer, address);
        const receiverAddressLine = address.shipping_address || address.street || '.';
        const city = address.city || 'Kuwait';
        const country = address.country || address.country_code || 'KW';
        const isCod = sallaOrder.payment_method === 'cod';
        const orderTotal = Number(sallaOrder.amounts?.total?.amount || 0);

        // 1. Find default system user and organization
        let systemUser = await prisma.user.findFirst({
            where: { role: { in: ['admin', 'manager'] } },
            include: { organization: true }
        });
        if (!systemUser) {
            systemUser = await prisma.user.findFirst({ include: { organization: true } });
        }
        if (!systemUser) {
            throw new Error('No system user found in database to attach Salla shipment.');
        }

        // 2. Generate unique Target Tracking Number (e.g. TRG-XXXXXXXXXXXX)
        const targetTrackingNumber = await generateUniqueCarrierTrackingNumber(prisma, 'OTE');

        logger.info(`[SallaIntegration] Creating native Target Shipment #${targetTrackingNumber} for Salla Order #${invoiceNumber}...`);

        const originAddress = {
            company: 'Target Logistics Fulfillment',
            contactPerson: 'Target Operations',
            phone: process.env.SUPPORT_WHATSAPP_PHONE || '96597691271',
            city: 'Kuwait City',
            countryCode: 'KW',
            streetLines: ['Target Logistics Central Warehouse']
        };

        const destinationAddress = {
            contactPerson: receiverName,
            phone: receiverPhone,
            email: customer.email || undefined,
            city: city,
            countryCode: country,
            streetLines: [receiverAddressLine],
            addressLine1: receiverAddressLine
        };

        const items = (sallaOrder.items || []).map(item => ({
            sku: item.sku || String(item.product_id),
            name: item.name || 'Product Item',
            price: Number(item.amounts?.total?.amount || item.price || 0),
            quantity: Number(item.quantity || 1)
        }));

        // 3. Create Shipment in Target database
        const createdShipment = await prisma.shipment.create({
            data: {
                trackingNumber: targetTrackingNumber,
                userId: systemUser.id,
                organizationId: systemUser.organizationId,
                carrierCode: 'OTE',
                serviceCode: 'STD',
                status: 'booked',
                origin: originAddress,
                destination: destinationAddress,
                currentLocation: originAddress,
                customer: {
                    name: receiverName,
                    phone: receiverPhone,
                    email: customer.email || ''
                },
                items: items,
                parcels: [{
                    weight: 1,
                    description: `Salla Order #${invoiceNumber}`,
                    quantity: items.reduce((sum, it) => sum + (it.quantity || 1), 0)
                }],
                price: orderTotal,
                currency: sallaOrder.currency || 'KWD',
                codAmount: isCod ? orderTotal : null,
                codCurrency: isCod ? (sallaOrder.currency || 'KWD') : null,
                codStatus: isCod ? 'pending' : null,
                history: [{
                    status: 'booked',
                    description: `Order #${invoiceNumber} received from Salla store and booked with Target Logistics`,
                    timestamp: new Date().toISOString(),
                    location: originAddress
                }]
            }
        });

        // 4. Dispatch to Carrier OTE (LogesTechs)
        const CarrierFactory = require('./CarrierFactory');
        const logestechs = CarrierFactory.getAdapter('OTE');

        const logestechsPayload = {
            receiverName,
            receiverPhone,
            receiverAddress: {
                city,
                region: country,
                addressLine1: receiverAddressLine,
            },
            notes: sallaOrder.notes || '',
            shipmentType: isCod ? 'COD' : 'REGULAR',
            cod: String(isCod ? orderTotal : 0),
            codCollectionMethod: isCod ? 'COD' : 'PREPAID',
            invoiceNumber: invoiceNumber,
            items: items.map(item => ({
                sku: item.sku,
                price: item.price,
                quantity: item.quantity
            }))
        };

        let logestechsResult = null;
        try {
            logestechsResult = await logestechs.addFulfillmentOrder(logestechsPayload);
            logger.info(`[SallaIntegration] Successfully booked with LogesTechs warehouse: Barcode #${logestechsResult.barcode || logestechsResult.id}`);

            // Update Target Shipment with Carrier Barcode & Label
            await prisma.shipment.update({
                where: { id: createdShipment.id },
                data: {
                    carrierShipmentId: String(logestechsResult.id || ''),
                    dhlTrackingNumber: logestechsResult.barcode || targetTrackingNumber,
                    dhlConfirmed: true,
                    labelUrl: logestechsResult.barcodeImage || null
                }
            });
        } catch (oteError) {
            logger.error(`[SallaIntegration] LogesTechs warehouse dispatch error for #${targetTrackingNumber}: ${oteError.message}`);
        }

        // 5. Send automated WhatsApp notification with Target Tracking URL
        try {
            const chatwootService = require('./chatwootNotificationService');
            await chatwootService.triggerShipmentNotification('shipment_created', createdShipment);
            logger.info(`[SallaIntegration] Automated WhatsApp notification triggered for customer ${receiverPhone} with tracking ${targetTrackingNumber}`);
        } catch (waError) {
            logger.warn(`[SallaIntegration] WhatsApp notification non-fatal warning: ${waError.message}`);
        }

        // 6. Attach Target Tracking Number & URL to Salla Order
        if (merchantId) {
            const token = await this.getValidAccessToken(merchantId);
            if (token) {
                try {
                    const targetTrackingUrl = `https://target-kw.com/track/${targetTrackingNumber}`;
                    await axios.post(`${SALLA_API_BASE}/orders/${invoiceNumber}/shipments`, {
                        shipment_type: 'standard',
                        tracking_number: targetTrackingNumber,
                        tracking_link: targetTrackingUrl,
                        shipping_company: 'Target Logistics'
                    }, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    logger.info(`[SallaIntegration] Attached Target tracking URL (${targetTrackingUrl}) to Salla Order #${invoiceNumber}`);
                } catch (sallaShipError) {
                    logger.warn(`[SallaIntegration] Warning attaching shipment to Salla: ${sallaShipError.response?.data?.message || sallaShipError.message}`);
                }
            }
        }

        return {
            targetTrackingNumber,
            shipmentId: createdShipment.id,
            logestechsResult
        };
    }

    /**
     * Synchronizes Warehouse Stock from LogesTechs to all connected Salla stores
     */
    async syncStockFromLogesTechs() {
        const merchants = this.getAllMerchants();
        const merchantIds = Object.keys(merchants);
        if (merchantIds.length === 0) {
            logger.info('[SallaSync] No connected Salla merchants found for stock sync.');
            return { updatedCount: 0 };
        }

        const CarrierFactory = require('./CarrierFactory');
        const logestechs = CarrierFactory.getAdapter('OTE');

        logger.info('[SallaSync] Fetching latest product stock from LogesTechs warehouse...');
        let products = [];
        try {
            const response = await logestechs.getProducts({ page: 1, pageSize: 100 });
            products = Array.isArray(response) ? response : (response?.list || response?.data || []);
        } catch (error) {
            logger.error(`[SallaSync] Failed to fetch products from LogesTechs: ${error.message}`);
            return { updatedCount: 0, error: error.message };
        }

        if (products.length === 0) {
            logger.info('[SallaSync] No products found in LogesTechs warehouse.');
            return { updatedCount: 0 };
        }

        let totalUpdated = 0;

        for (const merchantId of merchantIds) {
            const token = await this.getValidAccessToken(merchantId);
            if (!token) continue;

            const quantityPayload = products
                .filter(p => p.sku)
                .map(p => ({
                    sku: p.sku,
                    quantity: Number(p.quantity ?? p.onHandQuantity ?? 0)
                }));

            if (quantityPayload.length === 0) continue;

            try {
                logger.info(`[SallaSync] Updating ${quantityPayload.length} product quantities on Salla store ${merchantId}...`);
                await axios.put(`${SALLA_API_BASE}/products/quantities`, {
                    products: quantityPayload
                }, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                totalUpdated += quantityPayload.length;
                logger.info(`[SallaSync] Successfully updated product quantities for merchant ${merchantId}`);
            } catch (error) {
                logger.error(`[SallaSync] Error updating Salla quantities for merchant ${merchantId}: ${error.response?.data?.message || error.message}`);
            }
        }

        return { updatedCount: totalUpdated };
    }

    /**
     * Synchronizes delivery and tracking statuses from LogesTechs to Salla orders
     */
    async syncShipmentTrackingToSalla() {
        const merchants = this.getAllMerchants();
        const merchantIds = Object.keys(merchants);
        if (merchantIds.length === 0) return { syncedCount: 0 };

        const CarrierFactory = require('./CarrierFactory');
        const logestechs = CarrierFactory.getAdapter('OTE');

        logger.info('[SallaSync] Checking latest LogesTechs fulfillment orders for status/tracking updates...');
        let orders = [];
        try {
            const response = await logestechs.getFulfillmentOrders({ page: 1, pageSize: 50 });
            orders = Array.isArray(response) ? response : (response?.list || response?.data || []);
        } catch (error) {
            logger.error(`[SallaSync] Failed to fetch fulfillment orders from LogesTechs: ${error.message}`);
            return { syncedCount: 0, error: error.message };
        }

        let syncedCount = 0;

        for (const order of orders) {
            const sallaOrderId = order.invoiceNumber;
            if (!sallaOrderId) continue;

            const barcode = order.barcode || order.packageBarcode;
            const logestechsStatus = String(order.status || '').toUpperCase();

            // Map LogesTechs statuses to Salla standard statuses
            let sallaStatus = null;
            if (['SCANNED_BY_DRIVER_AND_IN_CAR', 'DISPATCHED', 'OUT_FOR_DELIVERY'].includes(logestechsStatus)) {
                sallaStatus = 'delivering';
            } else if (['DELIVERED_TO_RECIPIENT', 'COMPLETED', 'DELIVERED'].includes(logestechsStatus)) {
                sallaStatus = 'delivered';
            } else if (['CANCELLED', 'CANCELED'].includes(logestechsStatus)) {
                sallaStatus = 'canceled';
            } else if (['APPROVED_BY_CUSTOMER_CARE_AND_WAITING_FOR_DISPATCHER', 'PACKED', 'CREATED'].includes(logestechsStatus)) {
                sallaStatus = 'in_progress';
            }

            for (const merchantId of merchantIds) {
                const token = await this.getValidAccessToken(merchantId);
                if (!token) continue;

                try {
                    // 1. Update Shipment / Tracking Barcode if present
                    if (barcode) {
                        const trackingLink = `https://target-kw.com/track/${barcode}`;
                        await axios.post(`${SALLA_API_BASE}/orders/${sallaOrderId}/shipments`, {
                            shipment_type: 'standard',
                            tracking_number: barcode,
                            tracking_link: trackingLink,
                            shipping_company: 'Target Logistics'
                        }, {
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                        }).catch(() => {}); // Ignore if shipment already exists
                    }

                    // 2. Update Order Status in Salla
                    if (sallaStatus) {
                        await axios.post(`${SALLA_API_BASE}/orders/${sallaOrderId}/status`, {
                            status: sallaStatus
                        }, {
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                        }).catch(e => {
                            logger.warn(`[SallaSync] Status update warning for order ${sallaOrderId}: ${e.response?.data?.message || e.message}`);
                        });
                    }

                    syncedCount++;
                } catch (err) {
                    logger.error(`[SallaSync] Failed to sync tracking for order ${sallaOrderId}: ${err.message}`);
                }
            }
        }

        return { syncedCount };
    }
}

module.exports = new SallaIntegrationService();
