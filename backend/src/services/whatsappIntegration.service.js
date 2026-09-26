const axios = require('axios');
const { prisma } = require('../config/database');
const { getSystemSettings } = require('./systemSettings.service');
const chatwootService = require('./chatwootNotificationService');
const logger = require('../utils/logger');

function normalizePhone(phone, phoneCountryCode = '965') {
    if (!phone) return null;
    let s = String(phone).trim();
    if (!s) return null;

    let digits = s.replace(/\D/g, '');
    if (!digits) return null;

    // Strip leading 00 (e.g. 00966555 -> 966555)
    if (s.startsWith('00') || digits.startsWith('00')) {
        digits = digits.replace(/^00/, '');
    }

    // Kuwait local 8-digit mobile numbers starting with 2, 5, 6, 9 (e.g. 97959567 -> +96597959567)
    if (digits.length === 8 && ['2', '5', '6', '9'].includes(digits[0])) {
        return `+965${digits}`;
    }

    // E.164 standard is 8 to 15 digits
    if (digits.length >= 8 && digits.length <= 16) {
        return `+${digits}`;
    }

    return null;
}

const DEV_SAFE_PHONE = '+201040957289';

function isDevMode() {
    return process.env.NODE_ENV !== 'production' || process.env.WHATSAPP_DEV_MODE === 'true';
}

function resolveRecipientPhone(phone, phoneCountryCode = '965') {
    const normalized = normalizePhone(phone, phoneCountryCode);
    if (isDevMode()) {
        logger.info(`[WhatsApp DEV Safe Routing] Intended recipient: ${normalized || phone} -> Overriding dispatch to developer: ${DEV_SAFE_PHONE}`);
        return DEV_SAFE_PHONE;
    }
    return normalized;
}

function getTemplateLanguage(templateName) {
    if (templateName === 'shipment_tracking_quick') return 'en_GB';
    if (templateName === 'shipment_confirmation_2' || templateName === 'hello_world') return 'en_US';
    return 'en';
}

const formatLegibleDate = (val) => {
    if (!val) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Check if a bill has already been sent via the Shipment-WhatsApp Microservice
 */
async function checkMicroserviceSent(billId, role = 'receiver') {
    if (!billId) return { sent: false };
    try {
        const settings = getSystemSettings()?.whatsapp || {};
        const serviceUrl = String(settings.serviceUrl || 'https://msg.target-kw.com').replace(/\/+$/, '');
        const res = await axios.get(`${serviceUrl}/api/send/check-sent`, {
            params: { billId, role },
            timeout: 5000
        });
        return res.data || { sent: false };
    } catch {
        return { sent: false };
    }
}

/**
 * Dispatch message via the Shipment-WhatsApp Microservice (https://msg.target-kw.com)
 */
async function sendViaShipmentWhatsappMicroservice({ serviceUrl = 'https://msg.target-kw.com', templateName, language, toPhone, variables = [], headerVariables = [], billId = null, role = 'receiver', apiKey = null }) {
    const cleanPhone = String(toPhone).replace(/\D/g, '');
    const cleanServiceUrl = String(serviceUrl || 'https://msg.target-kw.com').replace(/\/+$/, '');
    const url = `${cleanServiceUrl}/api/send`;

    const lang = language || getTemplateLanguage(templateName);
    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const payload = {
        templateName,
        language: lang,
        headerVariables: headerVariables.map(v => v === null || v === undefined ? '' : String(v)),
        rows: [
            {
                to: cleanPhone,
                variables: variables.map(v => v === null || v === undefined ? '' : String(v)),
                headerVariables: headerVariables.map(v => v === null || v === undefined ? '' : String(v)),
                header: (headerVariables && headerVariables.length > 0) ? String(headerVariables[0]) : undefined,
                billId: billId || undefined,
                role: role || undefined
            }
        ]
    };

    logger.info(`[Shipment-WhatsApp Dispatch] URL: ${url} Template: ${templateName} [${lang}] Recipient: ${cleanPhone}`, payload);

    let response;
    try {
        response = await axios.post(url, payload, {
            headers,
            timeout: 18000,
            responseType: 'text'
        });
    } catch (httpErr) {
        const errData = httpErr.response?.data || httpErr.message;
        const e = new Error(`WhatsApp microservice connection error: ${httpErr.message}`);
        e.payload = payload;
        e.rawResponse = errData;
        throw e;
    }

    const rawData = response.data;
    let messageId = null;
    let status = 'sent';
    let errorMessage = null;

    if (typeof rawData === 'string') {
        const lines = rawData.split('\n');
        for (const line of lines) {
            if (line.startsWith('data:')) {
                try {
                    const parsed = JSON.parse(line.slice(5).trim());
                    if (parsed.messageId) messageId = parsed.messageId;
                    if (parsed.status === 'skipped') {
                        status = 'skipped';
                        errorMessage = parsed.message || parsed.error || 'Already sent previously';
                    }
                    if (parsed.status === 'failed') {
                        status = 'failed';
                        errorMessage = parsed.error || 'Microservice reported delivery failure';
                    }
                    if (parsed.status === 'sent') {
                        status = 'sent';
                    }
                } catch (_) {}
            }
        }
    } else if (typeof rawData === 'object' && rawData !== null) {
        messageId = rawData.messageId || rawData.id || null;
        if (rawData.status === 'skipped') {
            status = 'skipped';
            errorMessage = rawData.message || 'Already sent previously';
        } else if (rawData.error) {
            status = 'failed';
            errorMessage = rawData.error;
        }
    }

    if (status === 'skipped') {
        return {
            status: 'SKIPPED',
            alreadySent: true,
            message: errorMessage,
            messageId: messageId || `wamid.SKIPPED_${Date.now()}`,
            rawResponse: rawData,
            payload
        };
    }

    if (status === 'failed' && errorMessage) {
        const e = new Error(`WhatsApp microservice dispatch failed: ${errorMessage}`);
        e.payload = payload;
        e.rawResponse = rawData;
        throw e;
    }

    return {
        status: 'SENT',
        messageId: messageId || `wamid.SW_${Date.now()}`,
        rawResponse: rawData,
        payload
    };
}

function buildMetaMessagePayload(toPhone, eventType, context, templateNameOverride = null) {
    const cleanPhone = String(toPhone).replace(/\D/g, '');
    
    const targetTemplateName = templateNameOverride || (
        eventType === 'shipment_created' || eventType === 'new_shipment_created' ? 'new_shipment_created' :
        eventType === 'out_for_delivery' ? 'out_for_delivery_v1' :
        eventType === 'delivered' ? 'delivery_complete_v1' :
        eventType === 'payment_link_ready' ? 'payment_request_v1' :
        eventType === 'pickup_scheduled' ? 'pickup_alert_v1' :
        'new_shipment_created'
    );

    const estDeliveryFormatted = formatLegibleDate(context.estimatedDeliveryDate);
    const dateFormatted = context.updatedAt ? formatLegibleDate(context.updatedAt) : formatLegibleDate(new Date());
    const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fullUpdatedText = `${dateFormatted} at ${timeFormatted}`;

    const components = [
        {
            type: 'header',
            parameters: [
                { type: 'text', text: context.trackingNumber || 'TRG-SHIPMENT' }
            ]
        },
        {
            type: 'body',
            parameters: [
                { type: 'text', text: context.route || 'Kuwait City, KW → Destination' },
                { type: 'text', text: estDeliveryFormatted },
                { type: 'text', text: context.currentStatus || 'Shipment Created' },
                { type: 'text', text: fullUpdatedText },
                { type: 'text', text: context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber}` }
            ]
        }
    ];

    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
            name: targetTemplateName,
            language: { code: getTemplateLanguage(targetTemplateName) },
            components
        }
    };
}

class WhatsAppIntegrationService {
    /**
     * Send automatic or manual shipment event notification via WhatsApp
     */
    async sendNotification({ shipment, recipientRole, recipientPhone, recipientCountryCode, recipientName, eventType, templateName, customMessage, force = false }) {
        const settings = getSystemSettings()?.whatsapp || {};
        const phone = resolveRecipientPhone(recipientPhone, recipientCountryCode || '965');

        if (!phone) {
            throw new Error('Recipient phone number is required and must be valid');
        }

        const billId = shipment?.documents?.phenixBillId || null;
        const role = recipientRole || 'customer';
        const chosenTemplate = templateName || 'shipment_confirmation_2';
        const provider = settings.provider || 'SHIPMENT_WHATSAPP';

        // STRICT DEDUPLICATION GUARD: Prevent duplicate WhatsApp sends from any entry point
        if (!force) {
            // 1. Check local database for successful sends to this shipment / tracking number
            const existingLog = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    OR: [
                        { shipmentId: shipment.id },
                        { trackingNumber: shipment.trackingNumber }
                    ],
                    status: { in: ['SENT', 'DELIVERED', 'READ'] }
                },
                orderBy: { sentAt: 'desc' }
            });

            if (existingLog) {
                logger.info(`[WhatsApp Dedup Guard] Blocked duplicate send for shipment ${shipment.trackingNumber} (Already sent at ${existingLog.sentAt})`);
                return {
                    status: 'SKIPPED',
                    logId: existingLog.id,
                    alreadySent: true,
                    sentAt: existingLog.sentAt,
                    message: `Notification was already sent for ${shipment.trackingNumber} on ${formatLegibleDate(existingLog.sentAt)}.`
                };
            }

            // 2. Check microservice (msg.target-kw.com) sent store
            if (billId) {
                const microSent = await checkMicroserviceSent(billId, role === 'sender' ? 'sender' : 'receiver');
                if (microSent?.sent) {
                    logger.info(`[WhatsApp Dedup Guard] Blocked duplicate send: Bill #${billId} was already sent by microservice (at ${microSent.sentAt})`);
                    // Ensure local log reflects that it was sent by microservice
                    let savedLog = await prisma.shipmentNotificationLog.findFirst({
                        where: { shipmentId: shipment.id, recipientPhone: phone }
                    });
                    if (!savedLog) {
                        savedLog = await prisma.shipmentNotificationLog.create({
                            data: {
                                shipmentId: shipment.id,
                                trackingNumber: shipment.trackingNumber,
                                eventType: eventType || 'shipment_created',
                                recipientRole: role,
                                recipientName: recipientName || null,
                                recipientPhone: phone,
                                provider,
                                templateName: chosenTemplate,
                                status: 'SENT',
                                chatwootMessageId: `msg-autosend-${microSent.sentAt || Date.now()}`,
                                payloadJson: { source: 'MICROSERVICE_AUTOSEND', billId },
                                responseJson: { autoSent: true, sentAt: microSent.sentAt },
                                sentAt: microSent.sentAt ? new Date(microSent.sentAt) : new Date()
                            }
                        });
                    }
                    return {
                        status: 'SKIPPED',
                        logId: savedLog.id,
                        alreadySent: true,
                        sentAt: microSent.sentAt,
                        message: `Notification was already sent via auto-send service on ${formatLegibleDate(microSent.sentAt)}.`
                    };
                }
            }
        }

        const context = chatwootService.buildShipmentNotificationContext(shipment);

        // Initial DB log creation
        const log = await prisma.shipmentNotificationLog.create({
            data: {
                shipmentId: shipment.id,
                trackingNumber: shipment.trackingNumber,
                eventType: eventType || 'manual_trigger',
                recipientRole: role,
                recipientName: recipientName || null,
                recipientPhone: phone,
                provider,
                templateName: chosenTemplate,
                status: 'QUEUED',
                sentAt: new Date()
            }
        });

        if (!settings.enabled) {
            await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'SKIPPED',
                    errorMessage: 'WhatsApp service is disabled in system settings'
                }
            });
            return { status: 'SKIPPED', logId: log.id, message: 'WhatsApp disabled in settings' };
        }

        // 1. Primary Shipment-WhatsApp Microservice Dispatch (msg.target-kw.com)
        if (provider === 'SHIPMENT_WHATSAPP' || provider === 'TARGET_MSG') {
            const serviceUrl = settings.serviceUrl || 'https://msg.target-kw.com';
            const estDeliveryFormatted = formatLegibleDate(context.estimatedDeliveryDate);
            const dateFormatted = context.updatedAt ? formatLegibleDate(context.updatedAt) : formatLegibleDate(new Date());
            const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const fullUpdatedText = `${dateFormatted} at ${timeFormatted}`;
            const trackingUrl = context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber}`;
            const displayTracking = shipment.dhlTrackingNumber || context.trackingNumber || shipment.trackingNumber;

            let variables = [];
            let headerVariables = [displayTracking];

            if (chosenTemplate === 'new_shipment_created') {
                variables = [
                    context.route || 'Kuwait City, KW → Destination',
                    estDeliveryFormatted,
                    context.currentStatus || 'Shipment In Transit',
                    fullUpdatedText,
                    trackingUrl
                ];
            } else if (chosenTemplate === 'shipment_confirmation_2') {
                // Meta template: HEADER={{1}} (trackingNumber)
                // BODY: {{1}}=Invoice/Receipt, {{2}}=Date, {{3}}=Receiver Name, {{4}}=Receiver Tel, {{5}}=Tracking Link
                const receiptNo = shipment.documents?.phenixReceiptNo || shipment.documents?.phenixBillId || displayTracking;
                variables = [
                    receiptNo,
                    dateFormatted,
                    recipientName || shipment.customerName || shipment.customer?.name || 'Valued Customer',
                    phone,
                    trackingUrl
                ];
                headerVariables = [displayTracking];
            } else if (chosenTemplate === 'shipment_tracking_quick') {
                variables = [
                    displayTracking,
                    dateFormatted,
                    displayTracking,
                    recipientName || shipment.customerName || shipment.customer?.name || 'Valued Customer',
                    phone,
                    trackingUrl
                ];
                headerVariables = [displayTracking];
            } else {
                variables = [
                    context.route || 'Kuwait City, KW → Destination',
                    estDeliveryFormatted,
                    context.currentStatus || 'Shipment In Transit',
                    fullUpdatedText,
                    trackingUrl
                ];
            }

            try {
                const billId = shipment.documents?.phenixBillId || null;
                const result = await sendViaShipmentWhatsappMicroservice({
                    serviceUrl,
                    templateName: chosenTemplate,
                    language: getTemplateLanguage(chosenTemplate),
                    toPhone: phone,
                    variables,
                    headerVariables,
                    billId,
                    role: recipientRole || 'receiver',
                    apiKey: settings.apiKey || null
                });

                const updated = await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'SENT',
                        chatwootMessageId: result.messageId,
                        payloadJson: result.payload,
                        responseJson: result.rawResponse
                    }
                });

                return { status: 'SENT', logId: updated.id, externalMessageId: result.messageId, provider: 'SHIPMENT_WHATSAPP' };
            } catch (err) {
                logger.error(`[Shipment-WhatsApp Dispatch Error] ${err.message}`);
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: err.message,
                        payloadJson: err.payload || { templateName: chosenTemplate, variables, headerVariables },
                        responseJson: err.rawResponse || { error: err.message }
                    }
                });
            }
        }

        // 2. Chatwoot provider fallback
        if (provider === 'CHATWOOT') {
            const res = await chatwootService.sendShipmentNotification(eventType || 'out_for_delivery', shipment, { force: true });
            await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'SENT',
                    responseJson: res
                }
            });
            return { status: 'SENT', logId: log.id, provider: 'CHATWOOT' };
        }

        // 3. Mock Provider for Local/Sandbox Unit Tests
        if (provider === 'MOCK') {
            const mockWamid = `wamid.MOCK_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            logger.info(`[WhatsApp MOCK] Sent ${eventType} to ${phone} with ID ${mockWamid}`);
            
            const updated = await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'SENT',
                    chatwootMessageId: mockWamid,
                    payloadJson: { customMessage, context },
                    responseJson: { mock: true, wamid: mockWamid, timestamp: new Date().toISOString() }
                }
            });
            return { status: 'SENT', logId: updated.id, externalMessageId: mockWamid, provider: 'MOCK' };
        }

        // 4. Direct Meta WhatsApp Business API Cloud Endpoint
        try {
            const url = `https://graph.facebook.com/v19.0/${settings.phoneNumberId}/messages`;
            const payload = buildMetaMessagePayload(phone, eventType, context, chosenTemplate);

            logger.info(`[WhatsApp Meta API Request] URL: ${url}`, JSON.stringify(payload, null, 2));

            const res = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${settings.accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000
            });

            const wamid = res.data?.messages?.[0]?.id || null;

            const updated = await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'SENT',
                    chatwootMessageId: wamid,
                    payloadJson: payload,
                    responseJson: res.data
                }
            });

            return { status: 'SENT', logId: updated.id, externalMessageId: wamid, provider: 'META' };
        } catch (err) {
            const errorData = err.response?.data || { message: err.message };
            logger.error(`[WhatsApp Meta API Error] ${err.message}`, errorData);

            await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'FAILED',
                    errorMessage: err.response?.data?.error?.message || err.message,
                    responseJson: errorData
                }
            });

            throw new Error(`Meta WhatsApp API request failed: ${err.response?.data?.error?.message || err.message}`);
        }
    }

    normalizePhone(phone, countryCode = '965') {
        return normalizePhone(phone, countryCode);
    }

    async checkMicroserviceSent(billId, role = 'receiver') {
        return await checkMicroserviceSent(billId, role);
    }

    /**
     * Send direct text message or template via configured provider
     */
    async sendDirectTextMessage({ toPhone, messageText, recipientName, metadata = {} }) {
        const settings = getSystemSettings()?.whatsapp || {};
        const phone = resolveRecipientPhone(toPhone, metadata.countryCode || '965');

        if (!phone) {
            throw new Error('Recipient phone number is required and must be valid');
        }

        const provider = settings.provider || 'SHIPMENT_WHATSAPP';
        const cleanPhone = String(phone).replace(/\D/g, '');

        if (!settings.enabled) {
            logger.warn(`[WhatsApp] Service disabled in system settings. Message to ${phone} skipped.`);
            return { status: 'SKIPPED', message: 'WhatsApp disabled in settings', phone };
        }

        if (provider === 'SHIPMENT_WHATSAPP' || provider === 'TARGET_MSG') {
            const serviceUrl = settings.serviceUrl || 'https://msg.target-kw.com';
            const tmpl = metadata.templateName || 'shipment_tracking_quick';
            const vars = metadata.variables || [
                'TRG-DIRECT',
                formatLegibleDate(new Date()),
                'TRG-DIRECT',
                recipientName || 'Valued Customer',
                cleanPhone,
                'https://target-kw.com'
            ];
            return await sendViaShipmentWhatsappMicroservice({
                serviceUrl,
                templateName: tmpl,
                language: getTemplateLanguage(tmpl),
                toPhone: cleanPhone,
                variables: vars,
                apiKey: settings.apiKey || null
            });
        }

        if (provider === 'MOCK' || !settings.accessToken || !settings.phoneNumberId) {
            const mockWamid = `wamid.MOCK_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            logger.info(`[WhatsApp MOCK] Text message sent to ${phone} (ID: ${mockWamid}):\n${messageText}`);
            return { status: 'SENT', externalMessageId: mockWamid, provider: 'MOCK', phone };
        }

        if (provider === 'META') {
            const url = `https://graph.facebook.com/v19.0/${settings.phoneNumberId}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanPhone,
                type: 'text',
                text: {
                    preview_url: true,
                    body: messageText
                }
            };

            logger.info(`[WhatsApp Meta API] Dispatching text message to ${cleanPhone} (DEV Mode: ${isDevMode() ? 'YES -> +201040957289' : 'NO'})`);
            try {
                const res = await axios.post(url, payload, {
                    headers: {
                        Authorization: `Bearer ${settings.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 12000
                });
                const wamid = res.data?.messages?.[0]?.id || null;
                logger.info(`[WhatsApp Meta API] Success sending to ${cleanPhone}. Message ID: ${wamid}`);
                return { status: 'SENT', externalMessageId: wamid, provider: 'META', phone, response: res.data };
            } catch (err) {
                const errorData = err.response?.data || { message: err.message };
                logger.error(`[WhatsApp Meta API Error] ${err.message}`, errorData);
                throw new Error(`Meta WhatsApp API failed: ${err.response?.data?.error?.message || err.message}`);
            }
        }

        return { status: 'FAILED', message: `Unsupported WhatsApp provider: ${provider}` };
    }

    /**
     * Fetch all available approved message templates from the Shipment-WhatsApp Microservice
     */
    async getMetaTemplates() {
        const settings = getSystemSettings()?.whatsapp || {};
        const serviceUrl = (settings.serviceUrl || 'https://msg.target-kw.com').replace(/\/+$/, '');

        try {
            const url = `${serviceUrl}/api/templates`;
            const response = await axios.get(url, { timeout: 8000 });
            return (response.data?.templates || []).map(t => ({
                id: t.name,
                name: t.name,
                status: t.status,
                category: t.category,
                language: t.language,
                variableCount: t.variableCount,
                bodyText: t.bodyText,
                isApproved: t.status === 'APPROVED'
            }));
        } catch (err) {
            logger.error(`[WhatsApp Microservice Get Templates Error] ${err.message}`);
            
            // Secondary fallback to direct Meta Cloud API if tokens present
            const businessAccountId = settings.businessAccountId || settings.wabaId;
            if (settings.accessToken && businessAccountId) {
                try {
                    const metaUrl = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates`;
                    const res = await axios.get(metaUrl, {
                        headers: { Authorization: `Bearer ${settings.accessToken}` },
                        timeout: 8000
                    });
                    return (res.data?.data || []).map(t => ({
                        id: t.id,
                        name: t.name,
                        status: t.status,
                        category: t.category,
                        language: t.language,
                        components: t.components,
                        isApproved: t.status === 'APPROVED'
                    }));
                } catch (metaErr) {
                    logger.error(`[WhatsApp Meta API Get Templates Error] ${metaErr.message}`);
                }
            }
            return [];
        }
    }

    /**
     * Send Account Statement summary via WhatsApp using approved template 'account_statement_v1'
     */
    async sendStatementNotification({ organization, recipientPhone, summary = {}, currency = 'KWD', templateName = null }) {
        const rawPhone = recipientPhone || organization?.billingWhatsappNumber || organization?.members?.[0]?.phone;
        const normalizedTarget = normalizePhone(rawPhone, '965');
        const phone = resolveRecipientPhone(rawPhone, '965');
        if (!phone) {
            throw new Error('No valid WhatsApp phone number found for organization');
        }

        const orgName = organization?.name || 'Valued Partner';
        const cur = currency || organization?.currency || 'KWD';
        const netBal = Number(summary.netBalance || 0).toFixed(3);
        const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const contactName = organization?.billingContactName || organization?.members?.[0]?.name || orgName;

        const cleanPhone = String(phone).replace(/\D/g, '');
        const settings = getSystemSettings()?.whatsapp || {};
        const provider = settings.provider || 'SHIPMENT_WHATSAPP';
        const chosenTemplate = templateName || 'account_statement_v1';

        // Microservice Dispatch
        if (provider === 'SHIPMENT_WHATSAPP' || provider === 'TARGET_MSG') {
            const serviceUrl = settings.serviceUrl || 'https://msg.target-kw.com';
            const variables = [
                contactName,
                orgName,
                `${netBal} ${cur}`,
                today
            ];

            return await sendViaShipmentWhatsappMicroservice({
                serviceUrl,
                templateName: chosenTemplate,
                language: getTemplateLanguage(chosenTemplate),
                toPhone: cleanPhone,
                variables,
                apiKey: settings.apiKey || null
            });
        }

        // Direct Text Message Fallback for other providers
        const devNotice = isDevMode() 
            ? `🧪 *[DEVELOPMENT TEST - ROUTED TO DEVELOPER]*\n👤 *Intended Recipient:* ${orgName} (${normalizedTarget})\n━━━━━━━━━━━━━━━━━━━━\n`
            : '';

        const creditLim = Number(summary.creditLimit || organization?.creditLimit || 0).toFixed(3);
        const unapplied = Number(summary.unappliedBalance || organization?.unappliedBalance || 0).toFixed(3);

        const messageText = 
`${devNotice}📋 *TARGET LOGISTICS - KINETIC ACCOUNT STATEMENT*
━━━━━━━━━━━━━━━━━━━━
🏢 *Account:* ${orgName}
📅 *As of:* ${today}

💰 *Current Outstanding:* ${netBal} ${cur}
💳 *Credit Limit:* ${creditLim} ${cur}
💵 *Unapplied Balance:* ${unapplied} ${cur}

━━━━━━━━━━━━━━━━━━━━
To review full statement ledger or reconcile invoices, please visit the Target Logistics Portal.
For remittance assistance, reply directly to this message or contact accounting@target-kw.com.

*Target Logistics Services W.L.L.*
www.target-kw.com | +965 6965 6563`;

        return await this.sendDirectTextMessage({
            toPhone: phone,
            messageText,
            recipientName: organization?.billingContactName || orgName,
            metadata: { organizationId: organization?.id, type: 'STATEMENT' }
        });
    }

    /**
     * Send Invoice notification via WhatsApp using approved template 'invoice_notification_v1'
     */
    async sendInvoiceNotification({ invoice, organization, recipientPhone, templateName = null }) {
        const rawPhone = recipientPhone || organization?.billingWhatsappNumber || organization?.members?.[0]?.phone;
        const normalizedTarget = normalizePhone(rawPhone, '965');
        const phone = resolveRecipientPhone(rawPhone, '965');
        if (!phone) {
            throw new Error('No valid WhatsApp phone number found for this invoice');
        }

        const orgName = organization?.name || 'Valued Client';
        const invNum = invoice.invoiceNumber;
        const total = Number(invoice.total || 0).toFixed(3);
        const cur = invoice.currency || 'KWD';
        const dueDate = invoice.dueDate ? formatLegibleDate(invoice.dueDate) : 'Due upon receipt';
        const contactName = organization?.billingContactName || organization?.members?.[0]?.name || orgName;

        const cleanPhone = String(phone).replace(/\D/g, '');
        const settings = getSystemSettings()?.whatsapp || {};
        const provider = settings.provider || 'SHIPMENT_WHATSAPP';
        const chosenTemplate = templateName || 'invoice_notification_v1';

        // Microservice Dispatch
        if (provider === 'SHIPMENT_WHATSAPP' || provider === 'TARGET_MSG') {
            const serviceUrl = settings.serviceUrl || 'https://msg.target-kw.com';
            const variables = [
                contactName,
                invNum,
                `${total} ${cur}`,
                dueDate
            ];

            return await sendViaShipmentWhatsappMicroservice({
                serviceUrl,
                templateName: chosenTemplate,
                language: getTemplateLanguage(chosenTemplate),
                toPhone: cleanPhone,
                variables,
                apiKey: settings.apiKey || null
            });
        }

        const devNotice = isDevMode() 
            ? `🧪 *[DEVELOPMENT TEST - ROUTED TO DEVELOPER]*\n👤 *Intended Recipient:* ${orgName} (${normalizedTarget})\n━━━━━━━━━━━━━━━━━━━━\n`
            : '';

        const pStart = invoice.periodStart ? new Date(invoice.periodStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '-';
        const pEnd = invoice.periodEnd ? new Date(invoice.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
        const itemsCount = invoice.lines?.length || 0;

        const messageText = 
`${devNotice}🧾 *TARGET LOGISTICS - INVOICE NOTIFICATION*
━━━━━━━━━━━━━━━━━━━━
📄 *Invoice #:* ${invNum}
🏢 *Billed To:* ${orgName}
📅 *Billing Period:* ${pStart} - ${pEnd}
📦 *Shipments Billed:* ${itemsCount} items
💰 *Total Due:* ${total} ${cur}
⏳ *Payment Due Date:* ${dueDate}
📊 *Status:* ${(invoice.status || 'draft').toUpperCase()}

━━━━━━━━━━━━━━━━━━━━
Please quote invoice number *${invNum}* with your bank remittance or K-Net payment reference.
To download your PDF invoice, log in to your dashboard.

*Target Logistics Services W.L.L.*
www.target-kw.com | +965 6965 6563`;

        return await this.sendDirectTextMessage({
            toPhone: phone,
            messageText,
            recipientName: organization?.billingContactName || orgName,
            metadata: { invoiceId: invoice.id, organizationId: organization?.id, type: 'INVOICE' }
        });
    }
}

module.exports = new WhatsAppIntegrationService();
