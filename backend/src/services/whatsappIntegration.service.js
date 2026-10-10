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
    if (templateName === 'otptargetlogin') return 'en_US';
    if (templateName === 'shipment_tracking_quick') return 'en_GB';
    if (templateName === 'shipment_confirmation_2' || templateName === 'hello_world') return 'en_US';
    return 'en';
}

const formatLegibleDate = (val) => {
    if (!val) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

function resolvePersonName(candidates, fallback = 'Customer') {
    for (const cand of candidates) {
        if (cand && typeof cand === 'string' && cand.trim().length > 0) {
            return cand.trim();
        }
    }
    return fallback;
}

/**
 * Resolve the most accurate invoice reference: Phenix ERP Bill/Receipt, Customs Invoice Number, or Tracking
 */
function resolveInvoiceDetail(shipment, displayTracking = '') {
    if (!shipment) return displayTracking || 'TRG-SHIPMENT';
    const docs = (typeof shipment.documents === 'object' && shipment.documents) ? shipment.documents : {};
    const cst = (typeof shipment.customsInvoice === 'object' && shipment.customsInvoice)
        ? shipment.customsInvoice
        : (typeof shipment.origin?.customsInvoice === 'object' ? shipment.origin.customsInvoice : {});

    // 1. Phenix ERP Official Bill ID & Receipt No
    const phenixBill = docs.phenixBillId || shipment.phenixBillId;
    const phenixReceipt = docs.phenixReceiptNo || shipment.phenixReceiptNo;
    if (phenixBill && phenixReceipt) {
        return `Bill #${phenixBill} (Receipt #${phenixReceipt})`;
    }
    if (phenixBill) {
        return `Bill #${phenixBill}`;
    }
    if (phenixReceipt) {
        return `Receipt #${phenixReceipt}`;
    }

    // 2. Customs / Commercial / Client Invoice Number provided at shipment creation
    const manualInv = docs.invoiceNumber || cst.invoiceNumber || docs.commercialInvoiceNumber || docs.customsInvoiceNumber || shipment.invoiceNumber;
    if (manualInv && String(manualInv).trim()) {
        const cleanInv = String(manualInv).trim();
        return cleanInv.toUpperCase().startsWith('INV') ? cleanInv : `INV-${cleanInv}`;
    }

    // 3. Fallback: Display Tracking / Waybill Number
    return displayTracking || shipment.trackingNumber || 'TRG-SHIPMENT';
}

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
async function sendViaShipmentWhatsappMicroservice({ serviceUrl = 'https://msg.target-kw.com', templateName, language, toPhone, variables = [], headerVariables = [], billId = null, trackingNumber = null, role = 'receiver', apiKey = null }) {
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

    const effectiveBillId = billId || trackingNumber || undefined;

    const payload = {
        templateName,
        language: lang,
        headerVariables: headerVariables.map(v => v === null || v === undefined ? '' : String(v)),
        rows: [
            {
                to: cleanPhone,
                trackingNumber: trackingNumber || (headerVariables && headerVariables[0]) || billId || undefined,
                billId: effectiveBillId,
                variables: variables.map(v => v === null || v === undefined ? '' : String(v)),
                headerVariables: headerVariables.map(v => v === null || v === undefined ? '' : String(v)),
                header: (headerVariables && headerVariables.length > 0) ? String(headerVariables[0]) : undefined,
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
        eventType === 'payment_link_ready' ? 'payment_request_v1' :
        eventType === 'location_request' ? 'location_request_v1' :
        eventType === 'return_portal' ? 'return_portal_v1' :
        eventType === 'customer_engagement' ? 'customer_inquiry_start' :
        eventType === 'shipment_created' || eventType === 'new_shipment_created' ? 'shipment_confirmation_2' :
        eventType === 'out_for_delivery' ? 'out_for_delivery_v1' :
        eventType === 'delivered' ? 'delivery_complete_v1' :
        eventType === 'pickup_scheduled' ? 'pickup_alert_v1' :
        'new_shipment_created'
    );

    const estDeliveryFormatted = formatLegibleDate(context.estimatedDeliveryDate);
    const dateFormatted = context.updatedAt ? formatLegibleDate(context.updatedAt) : formatLegibleDate(new Date());
    const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fullUpdatedText = `${dateFormatted} at ${timeFormatted}`;
    const trackingUrl = context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber}`;
    const displayTracking = context.trackingNumber || 'TRG-SHIPMENT';

    let components = [];

    if (targetTemplateName === 'payment_request_v1') {
        components = [
            {
                type: 'header',
                parameters: [{ type: 'text', text: displayTracking }]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: context.recipientName || 'Valued Customer' },
                    { type: 'text', text: context.amountDue || '0.000 KWD' },
                    { type: 'text', text: context.publicPaymentLink || `https://target-kw.com/pay/${displayTracking}` },
                    { type: 'text', text: dateFormatted }
                ]
            }
        ];
    } else if (targetTemplateName === 'location_request_v1') {
        components = [
            {
                type: 'header',
                parameters: [{ type: 'text', text: displayTracking }]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: context.recipientName || 'Valued Consignee' },
                    { type: 'text', text: displayTracking },
                    { type: 'text', text: `${trackingUrl}/location` }
                ]
            }
        ];
    } else if (targetTemplateName === 'return_portal_v1') {
        components = [
            {
                type: 'header',
                parameters: [{ type: 'text', text: displayTracking }]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: context.recipientName || 'Valued Customer' },
                    { type: 'text', text: displayTracking },
                    { type: 'text', text: `https://target-kw.com/returns/${displayTracking}` }
                ]
            }
        ];
    } else if (targetTemplateName === 'customer_inquiry_start') {
        components = [
            {
                type: 'header',
                parameters: [{ type: 'text', text: displayTracking }]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: context.recipientName || 'Valued Customer' },
                    { type: 'text', text: displayTracking },
                    { type: 'text', text: trackingUrl }
                ]
            }
        ];
    } else if (targetTemplateName === 'shipment_confirmation_2') {
        const receiptNo = resolveInvoiceDetail(context.shipment || context, displayTracking);
        const resolvedRecv = resolvePersonName([context.recipientName, context.consigneeName, context.customerName], 'Valued Customer');
        components = [
            {
                type: 'header',
                parameters: [{ type: 'text', text: displayTracking }]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: receiptNo },
                    { type: 'text', text: dateFormatted },
                    { type: 'text', text: resolvedRecv },
                    { type: 'text', text: cleanPhone },
                    { type: 'text', text: trackingUrl }
                ]
            }
        ];
    } else {
        components = [
            {
                type: 'header',
                parameters: [
                    { type: 'text', text: displayTracking }
                ]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: context.route || 'Kuwait City, KW → Destination' },
                    { type: 'text', text: estDeliveryFormatted },
                    { type: 'text', text: context.currentStatus || 'Shipment Created' },
                    { type: 'text', text: fullUpdatedText },
                    { type: 'text', text: trackingUrl }
                ]
            }
        ];
    }

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
    async sendNotification({ shipment, recipientRole, recipientPhone, recipientCountryCode, recipientName, eventType, templateName, customMessage, force = false, existingLogId = null, bypassAgeGuard = false }) {
        const settings = getSystemSettings()?.whatsapp || {};
        const phone = resolveRecipientPhone(recipientPhone, recipientCountryCode || '965');

        if (!phone) {
            throw new Error('Recipient phone number is required and must be valid');
        }

        const billId = shipment?.documents?.phenixBillId || null;
        const role = recipientRole || 'customer';
        const roleGroup = (role === 'sender') ? ['sender'] : ['receiver', 'customer'];
        const microRole = (role === 'sender') ? 'sender' : 'receiver';
        const chosenTemplate = templateName || 'shipment_confirmation_2';
        const provider = settings.provider || 'SHIPMENT_WHATSAPP';

        // STRICT AGE & DEDUPLICATION GUARDS: Prevent sending to old shipments (>36h) or duplicate sends
        if (!force) {
            // Check shipment age: do not notify for historical shipments older than 36 hours
            const shipmentDateRaw = shipment?.documents?.rawDate || shipment?.createdAt;
            if (shipmentDateRaw && !bypassAgeGuard) {
                let sDate = new Date(shipmentDateRaw);
                if (typeof shipmentDateRaw === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(shipmentDateRaw)) {
                    const m = shipmentDateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                    if (m) sDate = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
                }
                if (!Number.isNaN(sDate.getTime())) {
                    const ageHours = (Date.now() - sDate.getTime()) / (1000 * 60 * 60);
                    if (ageHours > 36) {
                        logger.info(`[WhatsApp Age Guard] Skipped outbound notification for historical shipment ${shipment.trackingNumber} (Age: ${Math.round(ageHours)}h > 36h ceiling)`);
                        return {
                            status: 'SKIPPED',
                            reason: 'HISTORICAL_SHIPMENT',
                            message: `Outbound notification skipped because shipment was created >36 hours ago (${formatLegibleDate(sDate)}).`
                        };
                    }
                }
            }

            // 1. Check local database for successful sends to this specific recipient role
            const existingLog = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    OR: [
                        { shipmentId: shipment.id },
                        { trackingNumber: shipment.trackingNumber }
                    ],
                    recipientRole: { in: roleGroup },
                    status: { in: ['SENT', 'DELIVERED', 'READ'] },
                    ...(existingLogId ? { id: { not: existingLogId } } : {})
                },
                orderBy: { sentAt: 'desc' }
            });

            if (existingLog) {
                logger.info(`[WhatsApp Dedup Guard] Blocked duplicate send for shipment ${shipment.trackingNumber} to role ${role} (Already sent at ${existingLog.sentAt})`);
                return {
                    status: 'SKIPPED',
                    logId: existingLog.id,
                    alreadySent: true,
                    sentAt: existingLog.sentAt,
                    message: `Notification was already sent for ${shipment.trackingNumber} (${role}) on ${formatLegibleDate(existingLog.sentAt)}.`
                };
            }

            // 2. Check microservice (msg.target-kw.com) sent store
            if (billId) {
                const microSent = await checkMicroserviceSent(billId, microRole);
                if (microSent?.sent) {
                    logger.info(`[WhatsApp Dedup Guard] Blocked duplicate send: Bill #${billId} (${microRole}) was already sent by microservice (at ${microSent.sentAt})`);
                    // Ensure local log reflects that it was sent by microservice
                    let savedLog = await prisma.shipmentNotificationLog.findFirst({
                        where: {
                            OR: [
                                { shipmentId: shipment.id },
                                { trackingNumber: shipment.trackingNumber }
                            ],
                            recipientRole: { in: roleGroup }
                        }
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
                        message: `Notification was already sent to ${role} via auto-send service on ${formatLegibleDate(microSent.sentAt)}.`
                    };
                }
            }
        }

        const context = chatwootService.buildShipmentNotificationContext(shipment);

        // Resolve explicit Sender and Consignee parties from shipment data using smart person-name resolution
        const resolvedSenderName = resolvePersonName([
            shipment.origin?.contactPerson,
            shipment.origin?.companyName,
            shipment.origin?.company,
            shipment.documents?.senderName,
            shipment.documents?.merchantName,
            (role === 'sender' ? recipientName : null)
        ], 'Shipper');
        const resolvedSenderPhone = normalizePhone(shipment.origin?.phone || shipment.documents?.senderPhone || (role === 'sender' ? phone : '')) || phone;

        const resolvedReceiverName = resolvePersonName([
            shipment.destination?.contactPerson,
            shipment.destination?.consigneeName,
            shipment.customer?.name,
            shipment.customerName,
            shipment.documents?.receiverName,
            (role === 'receiver' || role === 'customer' ? recipientName : null),
            shipment.destination?.company,
            shipment.destination?.name
        ], 'Valued Customer');
        const resolvedReceiverPhone = normalizePhone(shipment.destination?.phone || shipment.customer?.phone || shipment.customerPhone || shipment.documents?.receiverPhone || (role === 'receiver' || role === 'customer' ? phone : '')) || phone;

        const effectiveRecipientName = (role === 'sender') ? resolvedSenderName : resolvedReceiverName;

        // Initial DB log creation or update existing log
        let log;
        if (existingLogId) {
            log = await prisma.shipmentNotificationLog.update({
                where: { id: existingLogId },
                data: {
                    recipientName: effectiveRecipientName,
                    recipientPhone: phone,
                    provider,
                    templateName: chosenTemplate,
                    status: 'QUEUED',
                    errorMessage: null,
                    sentAt: new Date()
                }
            });
        } else {
            log = await prisma.shipmentNotificationLog.create({
                data: {
                    shipmentId: shipment.id,
                    trackingNumber: shipment.trackingNumber,
                    eventType: eventType || 'manual_trigger',
                    recipientRole: role,
                    recipientName: effectiveRecipientName,
                    recipientPhone: phone,
                    provider,
                    templateName: chosenTemplate,
                    status: 'QUEUED',
                    sentAt: new Date()
                }
            });
        }

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
                const receiptNo = resolveInvoiceDetail(shipment, displayTracking);
                
                // Receiver Name & Tel in the template body MUST ALWAYS be the destination Consignee
                variables = [
                    receiptNo,
                    dateFormatted,
                    resolvedReceiverName,
                    resolvedReceiverPhone,
                    trackingUrl
                ];
                headerVariables = [displayTracking];
            } else if (chosenTemplate === 'shipment_tracking_quick') {
                const receiptNo = resolveInvoiceDetail(shipment, displayTracking);
                variables = [
                    displayTracking,
                    dateFormatted,
                    receiptNo,
                    resolvedReceiverName,
                    resolvedReceiverPhone,
                    trackingUrl
                ];
                headerVariables = [displayTracking];
            } else if (chosenTemplate === 'payment_request_v1') {
                const payAmt = customMessage?.amount || context.amountDue || `${Number(shipment.remainingBalance || shipment.price || 0).toFixed(3)} ${shipment.currency || 'KWD'}`;
                const payUrl = customMessage?.paymentLink || context.publicPaymentLink || `https://target-kw.com/pay/${displayTracking}`;
                variables = [
                    effectiveRecipientName,
                    payAmt,
                    payUrl,
                    dateFormatted
                ];
                headerVariables = [displayTracking];
            } else if (chosenTemplate === 'location_request_v1') {
                const locUrl = customMessage?.locationUrl || `${trackingUrl}/location`;
                variables = [
                    effectiveRecipientName,
                    displayTracking,
                    locUrl
                ];
                headerVariables = [displayTracking];
            } else if (chosenTemplate === 'return_portal_v1') {
                const retUrl = customMessage?.returnUrl || `https://target-kw.com/returns/${displayTracking}`;
                variables = [
                    effectiveRecipientName,
                    displayTracking,
                    retUrl
                ];
                headerVariables = [displayTracking];
            } else if (chosenTemplate === 'customer_inquiry_start') {
                variables = [
                    effectiveRecipientName,
                    displayTracking,
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
                    trackingNumber: shipment.trackingNumber,
                    role: recipientRole || 'receiver',
                    apiKey: settings.apiKey || null
                });

                const enrichedPayload = {
                    ...result.payload,
                    auditMetadata: {
                        recipientParty: role === 'sender' ? 'SENDER (Shipper)' : 'RECEIVER (Consignee)',
                        recipientToPhone: phone,
                        sender: { name: resolvedSenderName, phone: resolvedSenderPhone },
                        consignee: { name: resolvedReceiverName, phone: resolvedReceiverPhone, destination: shipment.destination?.city || shipment.destination?.countryCode || 'Destination' },
                        carrierCode: shipment.carrierCode,
                        carrierAwb: displayTracking,
                        trackingUrl
                    }
                };

                const updated = await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'SENT',
                        chatwootMessageId: result.messageId,
                        payloadJson: enrichedPayload,
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
    async sendStatementNotification({ organization, recipientPhone, recipientName = null, summary = {}, currency = 'KWD', templateName = null, customDate = null }) {
        const rawPhone = recipientPhone || organization?.billingWhatsappNumber || organization?.members?.[0]?.phone;
        const normalizedTarget = normalizePhone(rawPhone, '965');
        const phone = resolveRecipientPhone(rawPhone, '965');
        if (!phone) {
            throw new Error('No valid WhatsApp phone number found for organization');
        }

        const orgName = organization?.name || 'Valued Partner';
        const cur = currency || organization?.currency || 'KWD';
        const netBal = Number(summary.netBalance !== undefined && summary.netBalance !== null ? summary.netBalance : 0).toFixed(3);
        const today = customDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const contactName = recipientName || organization?.billingContactName || organization?.members?.find(m => m.role === 'org_manager')?.name || organization?.members?.[0]?.name || orgName;

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
    async sendInvoiceNotification({ invoice, organization, recipientPhone, recipientName = null, templateName = null }) {
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
        const contactName = recipientName || organization?.billingContactName || organization?.members?.find(m => m.role === 'org_manager')?.name || organization?.members?.[0]?.name || orgName;

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

    /**
     * Send Authentication OTP Code via WhatsApp using approved template 'otptargetlogin'
     */
    async sendAuthOtp({ phone, name, otp }) {
        if (!phone || !otp) return null;
        const resolvedPhone = resolveRecipientPhone(phone, '965');
        if (!resolvedPhone) {
            logger.warn(`[WhatsApp OTP] Invalid phone number: ${phone}`);
            return null;
        }

        const cleanPhone = String(resolvedPhone).replace(/\D/g, '');
        const settings = getSystemSettings()?.whatsapp || {};
        const provider = settings.provider || 'SHIPMENT_WHATSAPP';
        const templateName = 'otptargetlogin';
        const langCode = 'en_US';
        const bodyText = `Please share code ${otp} with delivery agent after verifying the package.`;

        logger.info(`[WhatsApp OTP Dispatch] Template: ${templateName} [${langCode}] Target: ${cleanPhone} (OTP: ${otp}) Provider: ${provider}`);

        // 1. Direct Meta WhatsApp Business API Cloud Endpoint (Most accurate for Authentication / Custom templates)
        if (settings.accessToken && settings.phoneNumberId) {
            const url = `https://graph.facebook.com/v19.0/${settings.phoneNumberId}/messages`;
            
            const candidateComponentSets = [
                // Set 1: Standard Body Parameter (Positional)
                [
                    {
                        type: 'body',
                        parameters: [{ type: 'text', text: String(otp) }]
                    }
                ],
                // Set 2: Body Parameter (Named 'code')
                [
                    {
                        type: 'body',
                        parameters: [{ type: 'text', parameter_name: 'code', text: String(otp) }]
                    }
                ],
                // Set 3: Body + Copy Code Button (Meta Authentication standard)
                [
                    {
                        type: 'body',
                        parameters: [{ type: 'text', text: String(otp) }]
                    },
                    {
                        type: 'button',
                        sub_type: 'copy_code',
                        index: '0',
                        parameters: [{ type: 'coupon_code', coupon_code: String(otp) }]
                    }
                ],
                // Set 4: Body + URL Button
                [
                    {
                        type: 'body',
                        parameters: [{ type: 'text', text: String(otp) }]
                    },
                    {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [{ type: 'text', text: String(otp) }]
                    }
                ],
                // Set 5: Pure Copy Code Button without body param
                [
                    {
                        type: 'button',
                        sub_type: 'copy_code',
                        index: '0',
                        parameters: [{ type: 'coupon_code', coupon_code: String(otp) }]
                    }
                ]
            ];

            for (let i = 0; i < candidateComponentSets.length; i++) {
                const components = candidateComponentSets[i];
                const payload = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanPhone,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: langCode },
                        components
                    }
                };

                try {
                    const res = await axios.post(url, payload, {
                        headers: {
                            Authorization: `Bearer ${settings.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 12000
                    });

                    const wamid = res.data?.messages?.[0]?.id || null;
                    logger.info(`[WhatsApp Meta API OTP Sent] Successfully sent template '${templateName}' to ${cleanPhone} (Payload Set ${i + 1}). WAMID: ${wamid}`);
                    return { status: 'SENT', externalMessageId: wamid, provider: 'META' };
                } catch (metaErr) {
                    const errorDetail = metaErr.response?.data?.error?.message || metaErr.message;
                    logger.debug(`[WhatsApp Meta API OTP Candidate ${i + 1} Failed] ${errorDetail}`);
                }
            }
        }

        // 2. Shipment-WhatsApp Microservice Dispatch (https://msg.target-kw.com)
        if (provider === 'SHIPMENT_WHATSAPP' || provider === 'TARGET_MSG') {
            const serviceUrl = settings.serviceUrl || 'https://msg.target-kw.com';
            try {
                const res = await sendViaShipmentWhatsappMicroservice({
                    serviceUrl,
                    templateName,
                    language: langCode,
                    toPhone: cleanPhone,
                    variables: [String(otp)],
                    apiKey: settings.apiKey || null
                });
                logger.info(`[WhatsApp OTP Sent via Microservice] Message ID: ${res.messageId}`);
                return res;
            } catch (microErr) {
                logger.warn(`[WhatsApp OTP Microservice Error] ${microErr.message}`);
            }
        }

        // 3. Fallback to Chatwoot
        try {
            await chatwootService.sendDirectOtp({ phone: resolvedPhone, name, otp });
        } catch (cwErr) {
            logger.debug(`[Chatwoot OTP note] ${cwErr.message}`);
        }

        // 4. Fallback to direct text message
        try {
            return await this.sendDirectTextMessage({
                toPhone: resolvedPhone,
                messageText: bodyText,
                recipientName: name || 'User',
                metadata: { templateName, variables: [String(otp)] }
            });
        } catch (directErr) {
            logger.warn(`[WhatsApp Direct OTP Text Error] ${directErr.message}`);
            return null;
        }
    }

    /**
     * Dispatch Pay-by-Link Request via WhatsApp API using Meta template 'payment_request_v1'
     */
    async sendPaymentLinkNotification({ shipment, recipientPhone, recipientRole = 'sender', recipientName = null, paymentLink, amount, currency = 'KWD' }) {
        const formattedAmount = `${Number(amount || 0).toFixed(3)} ${currency}`;
        return await this.sendNotification({
            shipment,
            recipientRole,
            recipientPhone,
            recipientName,
            eventType: 'payment_link_ready',
            templateName: 'payment_request_v1',
            customMessage: {
                paymentLink,
                amount: formattedAmount
            },
            force: true
        });
    }

    /**
     * Request Location Pin from Consignee via WhatsApp API using Meta template 'location_request_v1'
     */
    async sendLocationRequestNotification({ shipment, recipientPhone = null, recipientName = null, locationUrl = null }) {
        const baseUrl = config.publicTrackingBaseUrl || config.frontendUrl || 'https://target-kw.com';
        const url = locationUrl || `${String(baseUrl).replace(/\/+$/, '')}/track/${encodeURIComponent(shipment.trackingNumber)}/location`;
        const phone = recipientPhone || shipment.destination?.phone || shipment.customerPhone;
        const name = recipientName || shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName;

        return await this.sendNotification({
            shipment,
            recipientRole: 'receiver',
            recipientPhone: phone,
            recipientName: name,
            eventType: 'location_request',
            templateName: 'location_request_v1',
            customMessage: {
                locationUrl: url
            },
            force: true
        });
    }

    /**
     * Send Reverse Return & Paperwork Portal link to Consignee via WhatsApp API using Meta template 'return_portal_v1'
     */
    async sendReturnPortalNotification({ shipment, recipientPhone = null, recipientName = null, returnUrl = null }) {
        const baseUrl = config.publicTrackingBaseUrl || config.frontendUrl || 'https://target-kw.com';
        const url = returnUrl || `${String(baseUrl).replace(/\/+$/, '')}/returns/${encodeURIComponent(shipment.trackingNumber)}`;
        const phone = recipientPhone || shipment.destination?.phone || shipment.customerPhone;
        const name = recipientName || shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName;

        return await this.sendNotification({
            shipment,
            recipientRole: 'receiver',
            recipientPhone: phone,
            recipientName: name,
            eventType: 'return_portal',
            templateName: 'return_portal_v1',
            customMessage: {
                returnUrl: url
            },
            force: true
        });
    }

    /**
     * Initiate or restart a 24-hour customer conversation session via WhatsApp API using Meta template 'customer_inquiry_start'
     */
    async sendCustomerEngagementNotification({ shipment, recipientPhone = null, recipientName = null }) {
        const phone = recipientPhone || shipment.destination?.phone || shipment.customerPhone;
        const name = recipientName || shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName;

        return await this.sendNotification({
            shipment,
            recipientRole: 'receiver',
            recipientPhone: phone,
            recipientName: name,
            eventType: 'customer_engagement',
            templateName: 'customer_inquiry_start',
            force: true
        });
    }
}

module.exports = new WhatsAppIntegrationService();
