const axios = require('axios');
const { prisma } = require('../config/database');
const config = require('../config/config');
const { getSystemSettings } = require('./systemSettings.service');
const chatwootNotificationService = require('./chatwootNotificationService');
const financeLedgerService = require('./financeLedger.service');
const logger = require('../utils/logger');

class OttuPaymentService {
    /**
     * Resolve Ottu Configuration from System Settings and Environment Variables
     */
    getConfig() {
        const settings = getSystemSettings() || {};
        const ottuSettings = settings.ottu || {};
        return {
            enabled: ottuSettings.enabled !== false,
            domain: (ottuSettings.domain || process.env.OTTU_DOMAIN || 'target.ottu.com').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
            apiKey: (ottuSettings.apiKey || process.env.OTTU_API_KEY || '').trim(),
            pgCodes: Array.isArray(ottuSettings.pgCodes) && ottuSettings.pgCodes.length > 0 
                ? ottuSettings.pgCodes 
                : ['knet', 'apple-pay', 'mpgs'],
            mode: ottuSettings.mode || process.env.OTTU_MODE || 'production'
        };
    }

    /**
     * Create an Ottu Hosted Payment Session or return a fallback checkout link
     */
    async createPaymentSession({ shipment, amount = null, currency = 'KWD', customerName = null, customerPhone = null, customerEmail = null }) {
        if (!shipment) throw new Error('Shipment record is required');

        const ottuConfig = this.getConfig();
        const payableAmount = Number(amount !== null && amount !== undefined ? amount : (shipment.remainingBalance || shipment.price || shipment.codAmount || 0));
        const payableCurrency = currency || shipment.currency || 'KWD';
        const trackingNumber = shipment.trackingNumber;

        const baseUrl = String(config.publicTrackingBaseUrl || config.frontendUrl || 'https://target-kw.com').replace(/\/+$/, '');
        const backendUrl = String(process.env.BACKEND_PUBLIC_URL || baseUrl).replace(/\/+$/, '');
        const fallbackUrl = `${baseUrl}/pay/${encodeURIComponent(trackingNumber)}`;

        // If Ottu API Key is not configured, gracefully fallback to the Target hosted checkout page
        if (!ottuConfig.enabled || !ottuConfig.apiKey) {
            logger.info(`[Ottu Gateway] API Key not set - returning Target hosted Pay-by-Link for ${trackingNumber}: ${fallbackUrl}`);
            return {
                gateway: 'LOCAL_CHECKOUT',
                checkoutUrl: fallbackUrl,
                sessionId: `local_${Date.now()}`,
                orderNo: trackingNumber,
                amount: payableAmount,
                currency: payableCurrency
            };
        }

        const cleanPhone = String(customerPhone || shipment.destination?.phone || shipment.customerPhone || '').replace(/\D/g, '');
        const cleanName = customerName || shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName || 'Valued Customer';
        const cleanEmail = customerEmail || shipment.destination?.email || shipment.customerEmail || 'orders@target-kw.com';

        const endpoint = `https://${ottuConfig.domain}/b/checkout/v1/pymt-txn`;
        const payload = {
            type: 'e_commerce',
            amount: payableAmount.toFixed(3),
            currency_code: payableCurrency,
            pg_codes: ottuConfig.pgCodes,
            customer_id: cleanPhone || trackingNumber,
            customer_phone: cleanPhone || undefined,
            customer_email: cleanEmail,
            customer_first_name: cleanName,
            order_no: trackingNumber,
            redirect_url: `${baseUrl}/pay/${encodeURIComponent(trackingNumber)}?session_id={session_id}`,
            webhook_url: `${backendUrl}/api/public/checkout/ottu/webhook`,
            extra: {
                shipmentId: shipment.id,
                trackingNumber,
                carrierCode: shipment.carrierCode || 'DGR'
            }
        };

        try {
            logger.info(`[Ottu Gateway] Requesting payment session for ${trackingNumber} (${payableAmount} ${payableCurrency}) at ${endpoint}`);
            const response = await axios.post(endpoint, payload, {
                headers: {
                    'Authorization': `Api-Key ${ottuConfig.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            });

            const data = response.data || {};
            const checkoutUrl = data.checkout_url || data.payment_url || fallbackUrl;
            const sessionId = data.session_id || data.id || null;

            logger.info(`[Ottu Gateway] Successfully generated checkout session for ${trackingNumber}: ${checkoutUrl}`);
            return {
                gateway: 'OTTU',
                checkoutUrl,
                sessionId,
                orderNo: trackingNumber,
                amount: payableAmount,
                currency: payableCurrency,
                rawResponse: data
            };
        } catch (err) {
            logger.error(`[Ottu Gateway Error] Failed to generate Ottu session for ${trackingNumber}: ${err.response?.data?.message || err.message}`);
            // Fallback to internal payment link so the customer still gets a functional link
            return {
                gateway: 'LOCAL_FALLBACK',
                checkoutUrl: fallbackUrl,
                sessionId: `fallback_${Date.now()}`,
                orderNo: trackingNumber,
                amount: payableAmount,
                currency: payableCurrency,
                error: err.response?.data || err.message
            };
        }
    }

    /**
     * Handle incoming Ottu Webhook or Callback when customer completes payment
     */
    async handleWebhook(body = {}) {
        const orderNo = body.order_no || body.orderNo || body.extra?.trackingNumber;
        const sessionId = body.session_id || body.sessionId;
        const state = String(body.state || body.status || '').toLowerCase();
        const reference = body.reference_number || body.reference || body.gateway_reference || sessionId || `OTTU-${Date.now()}`;
        const amount = Number(body.amount || 0);
        const currency = body.currency_code || body.currency || 'KWD';
        const pgCode = body.payment_gateway_info?.pg_code || body.pg_code || 'KNET';

        logger.info(`[Ottu Webhook] Processing event for order: ${orderNo}, state: ${state}, amount: ${amount} ${currency}, ref: ${reference}`);

        if (!orderNo) {
            throw new Error('Order number (trackingNumber) is missing from Ottu webhook');
        }

        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber: orderNo }
        });

        if (!shipment) {
            logger.warn(`[Ottu Webhook] Shipment ${orderNo} not found in database.`);
            return { success: false, error: 'Shipment not found', orderNo };
        }

        // If already fully settled, return success early
        if (shipment.paid && Number(shipment.remainingBalance || 0) <= 0) {
            logger.info(`[Ottu Webhook] Shipment ${orderNo} is already marked as paid.`);
            return { success: true, alreadyPaid: true, trackingNumber: orderNo };
        }

        const isSuccessState = ['success', 'paid', 'captured'].includes(state);
        if (!isSuccessState) {
            logger.info(`[Ottu Webhook] Payment not in successful state (${state}) for ${orderNo}. Ignored.`);
            return { success: true, processed: false, state };
        }

        const settledAmount = amount > 0 ? amount : Number(shipment.remainingBalance || shipment.price || 0);

        // Perform transactional database update
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Payment record
            const payment = await tx.payment.create({
                data: {
                    organizationId: shipment.organizationId || null,
                    amount: settledAmount,
                    currency,
                    method: pgCode.toUpperCase(),
                    reference: String(reference),
                    notes: `Settled via Ottu Payment Gateway (Session: ${sessionId || 'N/A'}, PG: ${pgCode})`,
                    createdById: shipment.userId || null
                }
            });

            // 2. Ledger credit entry if attached to organization
            if (shipment.organizationId) {
                await financeLedgerService.createLedgerEntry(shipment.organizationId, {
                    sourceRepo: 'Payment',
                    sourceId: payment.id,
                    amount: settledAmount,
                    entryType: 'CREDIT',
                    category: 'PAYMENT',
                    description: `Online payment received via Ottu (${pgCode.toUpperCase()} - Ref: ${reference})`,
                    reference: String(reference),
                    createdBy: shipment.userId || null,
                    metadata: { currency, trackingNumber: orderNo, ottuSessionId: sessionId }
                }, tx);
            }

            // 3. Prevent FIFO double sweep
            await tx.paymentAllocation.create({
                data: {
                    organizationId: shipment.organizationId || null,
                    paymentId: payment.id,
                    shipmentId: shipment.id,
                    amount: settledAmount,
                    currency,
                    status: 'ACTIVE',
                    isFifo: false
                }
            });

            // 4. Update Shipment financials & status
            const history = Array.isArray(shipment.history) ? shipment.history : [];
            const newHistory = {
                location: shipment.currentLocation,
                status: shipment.status,
                description: `Payment of ${settledAmount.toFixed(3)} ${currency} settled online via Ottu (${pgCode.toUpperCase()}) - Ref: ${reference}`,
                timestamp: new Date()
            };

            const updatedShipment = await tx.shipment.update({
                where: { id: shipment.id },
                data: {
                    paid: true,
                    totalPaid: { increment: settledAmount },
                    remainingBalance: 0,
                    history: [...history, newHistory]
                }
            });

            return { payment, updatedShipment };
        });

        // 5. Trigger WhatsApp Payment Confirmed notification to customer
        try {
            chatwootNotificationService.triggerShipmentNotification('payment_confirmed', result.updatedShipment, { force: true });
        } catch (notifErr) {
            logger.warn(`[Ottu Webhook] Failed to dispatch payment confirmed WhatsApp: ${notifErr.message}`);
        }

        logger.info(`[Ottu Webhook] Successfully settled shipment ${orderNo} with payment reference ${reference}`);
        return { success: true, trackingNumber: orderNo, paymentId: result.payment.id };
    }
}

module.exports = new OttuPaymentService();
