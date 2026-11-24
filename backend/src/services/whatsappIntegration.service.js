const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');
const { prisma } = require('../config/database');
const { getSystemSettings } = require('./systemSettings.service');
const whatsAppConfigService = require('./whatsAppConfig.service');
const chatwootService = require('./chatwootNotificationService');
const logger = require('../utils/logger');
const { normalizeStatus } = require('../constants/statusConstants');

function normalizePhone(phone, phoneCountryCode = '965') {
    if (!phone) return null;
    let s = String(phone).trim();
    if (!s) return null;

    const dialDigits = String(phoneCountryCode || '').replace(/\D/g, '');

    // If explicitly prefixed with + or 00, normalize directly
    if (s.startsWith('+') || s.startsWith('00')) {
        const clean = (s.startsWith('00') ? s.slice(2) : s.slice(1)).replace(/\D/g, '');
        if (!clean) return null;
        if (dialDigits && clean.startsWith(dialDigits)) {
            const rest = clean.slice(dialDigits.length).replace(/^0+/, '');
            return `+${dialDigits}${rest}`;
        }
        return clean.length >= 8 && clean.length <= 16 ? `+${clean}` : null;
    }

    let digits = s.replace(/\D/g, '');
    if (!digits) return null;

    if (dialDigits) {
        if (digits.startsWith(dialDigits) && digits.length >= dialDigits.length + 7) {
            return `+${digits}`;
        }
        const localDigits = (digits.startsWith('0') && dialDigits !== '1')
            ? digits.slice(1)
            : digits;
        const combined = `${dialDigits}${localDigits}`;
        if (combined.length >= 8 && combined.length <= 16) {
            return `+${combined}`;
        }
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

function maskPhoneForLog(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length < 4 ? '****' : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

const DEV_SAFE_PHONE = '+201040957289';

function isDevMode() {
    return process.env.NODE_ENV !== 'production' || process.env.WHATSAPP_DEV_MODE === 'true';
}

function resolveRecipientPhone(phone, phoneCountryCode = '965') {
    const normalized = normalizePhone(phone, phoneCountryCode);
    if (isDevMode()) {
        logger.info(`[WhatsApp DEV Safe Routing] Intended recipient: ${maskPhoneForLog(normalized || phone)} -> Overriding dispatch to developer: ${maskPhoneForLog(DEV_SAFE_PHONE)}`);
        return DEV_SAFE_PHONE;
    }
    return normalized;
}

function getTemplateLanguage(templateName, userLang = 'en') {
    if (userLang === 'ar') return 'ar';
    if (templateName && templateName.startsWith('target_')) return 'en_US';
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
async function sendViaShipmentWhatsappMicroservice({ serviceUrl = 'https://msg.target-kw.com', templateName, language, toPhone, variables = [], headerVariables = [], billId = null, trackingNumber = null, role = 'receiver', apiKey = null, buttonUrlParam = null }) {
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
                role: role || undefined,
                buttonUrlParam: buttonUrlParam || undefined
            }
        ]
    };

    logger.info('[Shipment-WhatsApp Dispatch] Sending template', {
        templateName,
        language: lang,
        recipient: maskPhoneForLog(cleanPhone),
        rowCount: payload.rows.length
    });

    let response;
    try {
        response = await axios.post(url, payload, {
            headers,
            timeout: 18000,
            responseType: 'text'
        });
    } catch (httpErr) {
        const e = new Error(httpErr.message || 'WhatsApp microservice request failed');
        e.code = httpErr.code;
        e.status = httpErr.response?.status;
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
        } else if (rawData.status === 'failed' || rawData.error) {
            status = 'failed';
            errorMessage = rawData.error || rawData.message || 'Microservice reported delivery failure';
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

/**
 * Resolve Evolution API credentials via config with settings fallback.
 */
function resolveEvolutionConfig(settings = {}) {
    const evoConfig = config.whatsapp?.evolution || config.evolution || {};
    const configUrl = config.whatsapp?.evolutionUrl ?? config.whatsappEvolutionUrl ?? evoConfig.url ?? evoConfig.baseUrl;
    const configInstance = config.whatsapp?.evolutionInstance ?? config.whatsappEvolutionInstance ?? evoConfig.instance ?? evoConfig.instanceName;
    const configApiKey = config.whatsapp?.evolutionApiKey ?? config.whatsappEvolutionApiKey ?? evoConfig.apiKey;

    const envUrl = configUrl !== undefined ? configUrl : process.env.WHATSAPP_EVOLUTION_URL;
    const envInstance = configInstance !== undefined ? configInstance : process.env.WHATSAPP_EVOLUTION_INSTANCE;
    const envApiKey = configApiKey !== undefined ? configApiKey : process.env.WHATSAPP_EVOLUTION_API_KEY;

    const baseUrl = String(
        settings.evolutionUrl
        || envUrl
        || (settings.provider === 'EVOLUTION' ? settings.serviceUrl : '')
        || 'https://evo.mawthook.io'
    ).replace(/\/+$/, '');
    const instanceName = String(
        settings.evolutionInstance
        || envInstance
        || (settings.provider === 'EVOLUTION' ? settings.phoneId : '')
        || ''
    ).trim();
    const apiKey = String(
        settings.evolutionApiKey
        || envApiKey
        || (settings.provider === 'EVOLUTION' ? settings.apiKey : '')
        || ''
    ).trim();
    return { baseUrl, instanceName, apiKey };
}

/**
 * Send a WhatsApp text message via Evolution API v2 (`POST /message/sendText/{instance}`).
 */
async function sendViaEvolutionApi({ settings = {}, toPhone, text }) {
    const { baseUrl, instanceName, apiKey } = resolveEvolutionConfig(settings);
    if (!instanceName || !apiKey) {
        throw new Error('Evolution API credentials missing (set WHATSAPP_EVOLUTION_INSTANCE and WHATSAPP_EVOLUTION_API_KEY in .env)');
    }

    const cleanDigits = String(toPhone || '').replace(/\D/g, '');
    const url = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
    const payload = {
        number: cleanDigits,
        text: String(text || '')
    };

    const res = await axios.post(url, payload, {
        headers: {
            apikey: apiKey,
            'Content-Type': 'application/json'
        },
        timeout: 15000
    });

    const wamid = res.data?.key?.id || res.data?.messageId || res.data?.id || `evo_${Date.now()}`;
    return {
        status: 'SENT',
        messageId: wamid,
        rawResponse: res.data,
        payload
    };
}

function buildEvolutionShipmentText({ context = {}, shipment = {}, customMessage = null, resolvedReceiverName, resolvedReceiverPhone }) {
    if (typeof customMessage === 'string' && customMessage.trim()) return customMessage;
    const tracking = shipment.dhlTrackingNumber || context.trackingNumber || shipment.trackingNumber || '-';
    const invoice = context.invoiceNumber || shipment.invoiceNumber || shipment.trackingNumber || '-';
    const dateDisplay = context.shipmentDateDisplay || formatLegibleDate(shipment.createdAt || context.updatedAt || new Date());
    const receiverName = resolvedReceiverName || shipment.destination?.contactPerson || shipment.destination?.name || '[receiver name]';
    const receiverPhone = resolvedReceiverPhone || shipment.destination?.phone || '[receiver telephone]';
    const trackingUrl = context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber || shipment.trackingNumber}`;
    return (
        `📦 *Shipment: ${tracking}*\n` +
        `Thank you for choosing Target Logistics.\n\n` +
        `Invoice: ${invoice}\n` +
        `Date: ${dateDisplay}\n` +
        `Receiver Name: ${receiverName}\n` +
        `Receiver Tel: ${receiverPhone}\n\n` +
        `Track Order: ${trackingUrl}\n\n` +
        `Target Logistics\nwww.target-kw.com`
    );
}

function buildMicroserviceVariables({
    chosenTemplate,
    context,
    shipment,
    displayTracking,
    resolvedReceiverName,
    resolvedReceiverPhone,
    effectiveRecipientName,
    customMessage,
    estDeliveryFormatted,
    dateFormatted,
    fullUpdatedText,
    trackingUrl
}) {
    let variables = [];
    let headerVariables = [displayTracking];

    if (chosenTemplate === 'new_shipment_created' || chosenTemplate === 'target_shipment_created') {
        variables = [
            context.route || 'Kuwait City, KW → Destination',
            estDeliveryFormatted,
            context.currentStatus || 'Shipment In Transit',
            fullUpdatedText,
            trackingUrl
        ];
    } else if (chosenTemplate === 'shipment_confirmation_2') {
        const receiptNo = resolveInvoiceDetail(shipment, displayTracking);
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
    } else if (chosenTemplate === 'target_shipment_out_for_delivery') {
        const destCity = shipment.destination?.city || context.destination?.city || 'Kuwait City';
        const destArea = shipment.destination?.area || context.destination?.area || '';
        const cityArea = destArea ? `${destCity}, ${destArea}` : destCity;
        const courier = shipment.assignedDriver?.name || shipment.carrierCode || 'Target Express Fleet #12';
        const deliveryWindow = estDeliveryFormatted || 'Today between 2:00 PM - 5:00 PM';

        variables = [
            resolvedReceiverName,
            displayTracking,
            cityArea,
            courier,
            deliveryWindow
        ];
        headerVariables = [displayTracking];
    } else if (chosenTemplate === 'target_shipment_delivered') {
        const deliveryTime = shipment.deliveredAt ? `${formatLegibleDate(shipment.deliveredAt)} AST` : `${dateFormatted} AST`;
        const signee = shipment.podRecipientName || 'Consignee Direct Signature';

        variables = [
            effectiveRecipientName,
            displayTracking,
            deliveryTime,
            signee,
            trackingUrl
        ];
        headerVariables = [displayTracking];
    } else if (chosenTemplate === 'target_customs_exception_hold') {
        const holdReason = customMessage?.reason || shipment.failureReason || 'Customs inspection hold at Kuwait Airport Cargo Terminal';
        const reqAction = customMessage?.action || 'Please provide Civil ID copy and commercial invoice';

        variables = [
            displayTracking,
            resolvedReceiverName,
            holdReason,
            reqAction,
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

    return { variables, headerVariables };
}

function buildMetaMessagePayload(toPhone, eventType, context, templateNameOverride = null) {
    const cleanPhone = String(toPhone).replace(/\D/g, '');
    
    const targetTemplateName = templateNameOverride || (
        eventType === 'payment_link_ready' ? 'payment_request_v1' :
        eventType === 'location_request' ? 'location_request_v1' :
        eventType === 'return_portal' ? 'return_portal_v1' :
        eventType === 'customer_engagement' ? 'customer_inquiry_start' :
        eventType === 'out_for_delivery' ? 'target_shipment_out_for_delivery' :
        eventType === 'delivered' ? 'target_shipment_delivered' :
        eventType === 'on_hold_customs_issue' ? 'target_customs_exception_hold' :
        eventType === 'shipment_created' || eventType === 'new_shipment_created' ? 'shipment_confirmation_2' :
        eventType === 'pickup_scheduled' ? 'pickup_alert_v1' :
        'new_shipment_created'
    );

    const estDeliveryFormatted = formatLegibleDate(context.estimatedDeliveryDate);
    const dateFormatted = targetTemplateName === 'shipment_confirmation_2'
        ? (context.shipmentDateDisplay || formatLegibleDate(context.shipment?.createdAt || context.updatedAt || new Date()))
        : (context.updatedAt ? formatLegibleDate(context.updatedAt) : formatLegibleDate(new Date()));
    const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fullUpdatedText = `${dateFormatted} at ${timeFormatted}`;
    const trackingUrl = context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber}`;
    const displayTracking = context.trackingNumber || 'TRG-SHIPMENT';

    let components = [];

    if (targetTemplateName === 'target_shipment_out_for_delivery') {
        const destCity = context.shipment?.destination?.city || context.destination?.city || 'Kuwait City';
        const destArea = context.shipment?.destination?.area || context.destination?.area || '';
        const cityArea = destArea ? `${destCity}, ${destArea}` : destCity;
        const courier = context.shipment?.assignedDriver?.name || context.courier || 'Target Express Fleet #12';
        const deliveryWindow = context.deliveryWindow || estDeliveryFormatted || 'Today between 2:00 PM - 5:00 PM';
        const token = context.locationToken || context.shipment?.locationToken || context.buttonUrlParam || '';

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
                    { type: 'text', text: cityArea },
                    { type: 'text', text: courier },
                    { type: 'text', text: deliveryWindow }
                ]
            }
        ];

        if (token) {
            components.push({
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: token }]
            });
        }
    } else if (targetTemplateName === 'target_shipment_delivered') {
        const deliveryTime = context.deliveryTimestamp || (context.shipment?.deliveredAt ? `${formatLegibleDate(context.shipment.deliveredAt)} AST` : `${dateFormatted} AST`);
        const signee = context.podRecipientName || context.signee || context.shipment?.podRecipientName || 'Consignee Direct Signature';

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
                    { type: 'text', text: deliveryTime },
                    { type: 'text', text: signee },
                    { type: 'text', text: trackingUrl }
                ]
            }
        ];
    } else if (targetTemplateName === 'target_customs_exception_hold') {
        const reason = context.customsReason || context.reason || context.shipment?.failureReason || 'Customs inspection hold at Kuwait Airport Cargo Terminal';
        const action = context.customsAction || context.action || 'Please provide Civil ID copy and commercial invoice';

        components = [
            {
                type: 'header',
                parameters: [{ type: 'text', text: displayTracking }]
            },
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: displayTracking },
                    { type: 'text', text: context.recipientName || 'Valued Customer' },
                    { type: 'text', text: reason },
                    { type: 'text', text: action }
                ]
            }
        ];
    } else if (targetTemplateName === 'payment_request_v1') {
        const paymentLink = context.publicPaymentLink || context.paymentUrl || `https://target-kw.com/pay/${displayTracking}`;
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
                    { type: 'text', text: context.amountDue || '0.000 KWD' },
                    { type: 'text', text: dateFormatted }
                ]
            },
            {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: paymentLink }]
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
        const resolvedRecv = context.receiverName || '[receiver name]';
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
                    { type: 'text', text: context.receiverPhone ? String(context.receiverPhone).replace(/\D/g, '') : '[receiver telephone]' },
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
    async sendNotification({ shipment, recipientRole, recipientPhone, recipientCountryCode, recipientName, eventType, templateName, customMessage, force = false, existingLogId = null, bypassAgeGuard = false, provider: optionsProvider = null, isFallbackAttempt = false, fallbackReason: incomingFallbackReason = null }) {
        const dbConfig = await whatsAppConfigService.getConfig({ internal: true }).catch(() => null);
        const sysSettings = getSystemSettings()?.whatsapp || {};
        const settings = {
            ...sysSettings,
            ...(dbConfig || {}),
            enabled: dbConfig?.enabled !== undefined ? dbConfig.enabled : (sysSettings.enabled ?? true)
        };
        const phone = resolveRecipientPhone(recipientPhone, recipientCountryCode || '965');

        if (!phone) {
            throw new Error('Recipient phone number is required and must be valid');
        }

        const billId = shipment?.documents?.phenixBillId || null;
        const role = recipientRole || 'customer';
        const roleGroup = (role === 'sender') ? ['sender'] : ['receiver', 'customer'];
        const microRole = (role === 'sender') ? 'sender' : 'receiver';
        const rawProvider = optionsProvider || settings.provider || 'chatwoot';
        const provider = String(rawProvider).toUpperCase();

        let chosenTemplate = templateName;
        if (!chosenTemplate) {
            const shipmentLifecycleEvents = new Set([
                'shipment_created',
                'pickup_scheduled',
                'received_at_hub',
                'verified_and_dispatched',
                'on_hold_customs_issue',
                'documents_needed',
                'delivery_attempt',
                'out_for_delivery',
                'delivered',
                'rto_in_transit',
                'returned',
                'shipment_created_backfill'
            ]);
            if (role === 'sender' && shipmentLifecycleEvents.has(eventType)) {
                chosenTemplate = 'shipment_confirmation_2';
            } else if (eventType === 'out_for_delivery') {
                chosenTemplate = 'target_shipment_out_for_delivery';
            } else if (eventType === 'delivered') {
                chosenTemplate = 'target_shipment_delivered';
            } else if (eventType === 'on_hold_customs_issue') {
                chosenTemplate = 'target_customs_exception_hold';
            } else if (eventType === 'payment_link_ready') {
                chosenTemplate = 'payment_request_v1';
            } else {
                chosenTemplate = 'shipment_confirmation_2';
            }
        }

        // Token generation for out_for_delivery if missing or expired
        let buttonUrlParam = null;
        if (chosenTemplate === 'target_shipment_out_for_delivery' || eventType === 'out_for_delivery') {
            const isExpired = !shipment.locationTokenExpiresAt || new Date(shipment.locationTokenExpiresAt).getTime() < Date.now();
            if (!shipment.locationToken || isExpired) {
                const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
                const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
                try {
                    if (shipment.id) {
                        await prisma.shipment.update({
                            where: { id: shipment.id },
                            data: {
                                locationToken: token,
                                locationTokenExpiresAt: expiresAt
                            }
                        });
                    }
                } catch (tokErr) {
                    logger.warn(`[WhatsApp] Failed to save locationToken on shipment: ${tokErr.message}`);
                }
                shipment.locationToken = token;
                shipment.locationTokenExpiresAt = expiresAt;
            }
            buttonUrlParam = `#${shipment.locationToken}`;
        }

        // Check quiet hours suppression
        const isQuiet = whatsAppConfigService._computeQuietHours(settings);
        if (isQuiet && !force) {
            const rule = await whatsAppConfigService.getRule(eventType, role).catch(() => null);
            const allowBypass = Boolean(rule?.allowQuietHoursBypass);
            const isDeliveryEvent = eventType === 'out_for_delivery' || eventType === 'delivered';
            const allowDelivery = isDeliveryEvent && Boolean(settings.allowDeliveryQuietHours);

            if (!allowBypass && !allowDelivery) {
                logger.info(`[WhatsApp Quiet Hours] Message for ${shipment.trackingNumber} (${eventType} to ${role}) suppressed during quiet hours`);
                
                let quietLog;
                if (existingLogId) {
                    quietLog = await prisma.shipmentNotificationLog.update({
                        where: { id: existingLogId },
                        data: {
                            status: 'QUEUED',
                            errorMessage: 'QUIET_HOURS_SUPPRESSED'
                        }
                    });
                } else {
                    quietLog = await prisma.shipmentNotificationLog.create({
                        data: {
                            shipmentId: shipment.id,
                            trackingNumber: shipment.trackingNumber,
                            eventType: eventType || 'manual_trigger',
                            recipientRole: role,
                            recipientName: recipientName || null,
                            recipientPhone: phone,
                            provider: rawProvider,
                            templateName: chosenTemplate,
                            status: 'QUEUED',
                            errorMessage: 'QUIET_HOURS_SUPPRESSED',
                            sentAt: new Date()
                        }
                    });
                }

                return {
                    status: 'QUEUED',
                    reason: 'QUIET_HOURS_SUPPRESSED',
                    logId: quietLog.id,
                    message: 'Outbound WhatsApp notification suppressed by quiet-hours window'
                };
            }
        }

        // Check event enabled rule
        if (!force && eventType) {
            const isEnabled = await whatsAppConfigService.isEventEnabled(eventType, role);
            if (!isEnabled) {
                logger.info(`[WhatsApp Event Rule] Event ${eventType} is disabled for role ${role}. Skipping dispatch.`);
                return {
                    status: 'SKIPPED',
                    reason: 'EVENT_RULE_DISABLED',
                    message: `Event ${eventType} is disabled for role ${role} in WhatsApp settings`
                };
            }
        }

        // Keep the age guard for delivered shipments, but allow notifications for
        // older shipments while they are still moving through the lifecycle.
        if (!force) {
            // Do not send stale notifications for shipments already delivered.
            const shipmentDateRaw = shipment?.documents?.rawDate || shipment?.createdAt;
            if (shipmentDateRaw && !bypassAgeGuard && normalizeStatus(shipment?.status) === 'delivered') {
                let sDate = new Date(shipmentDateRaw);
                if (typeof shipmentDateRaw === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(shipmentDateRaw)) {
                    const m = shipmentDateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                    if (m) sDate = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
                }
                if (!Number.isNaN(sDate.getTime())) {
                    const ageHours = (Date.now() - sDate.getTime()) / (1000 * 60 * 60);
                    if (ageHours > 36) {
                        logger.info(`[WhatsApp Age Guard] Skipped outbound notification for historical shipment ${shipment.trackingNumber} (Age: ${Math.round(ageHours)}h > 36h ceiling)`);
                        if (existingLogId) {
                            await prisma.shipmentNotificationLog.update({
                                where: { id: existingLogId },
                                data: {
                                    status: 'SKIPPED',
                                    errorMessage: 'HISTORICAL_SHIPMENT_DELIVERED'
                                }
                            });
                        }
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
                    status: { in: ['SENT', 'DELIVERED', 'READ', 'SUBMITTED', 'submitted', 'sent'] },
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
                    const autoSentAt = microSent.sentAt ? new Date(microSent.sentAt) : new Date();
                    const autoSentLogData = {
                        recipientName: recipientName || null,
                        recipientPhone: phone,
                        provider,
                        templateName: chosenTemplate,
                        status: 'SENT',
                        errorMessage: null,
                        chatwootMessageId: `msg-autosend-${microSent.sentAt || Date.now()}`,
                        payloadJson: { source: 'MICROSERVICE_AUTOSEND', billId },
                        responseJson: { autoSent: true, sentAt: microSent.sentAt },
                        sentAt: autoSentAt
                    };
                    let savedLog = existingLogId
                        ? await prisma.shipmentNotificationLog.update({
                            where: { id: existingLogId },
                            data: autoSentLogData
                        })
                        : await prisma.shipmentNotificationLog.findFirst({
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
                                ...autoSentLogData
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
        const resolvedSenderPhone = normalizePhone(
            shipment.origin?.phone || shipment.documents?.senderPhone || (role === 'sender' ? phone : ''),
            shipment.origin?.phoneCountryCode || (role === 'sender' ? recipientCountryCode : '965')
        ) || phone;

        const explicitReceiverName = resolvePersonName([
            shipment.destination?.contactPerson,
            shipment.destination?.consigneeName,
            shipment.documents?.receiverName,
            shipment.destination?.name,
            shipment.destination?.company
        ], '[receiver name]');
        const normalizedExplicitReceiverPhone = normalizePhone(
            shipment.destination?.phone || shipment.documents?.receiverPhone,
            shipment.destination?.phoneCountryCode || shipment.documents?.receiverPhoneCountryCode
        );
        const explicitReceiverPhone = normalizedExplicitReceiverPhone
            ? normalizedExplicitReceiverPhone.replace(/\D/g, '')
            : null;
        const resolvedReceiverName = chosenTemplate === 'shipment_confirmation_2'
            ? explicitReceiverName
            : resolvePersonName([
                shipment.destination?.contactPerson,
                shipment.destination?.consigneeName,
                shipment.customer?.name,
                shipment.customerName,
                shipment.documents?.receiverName,
                (role === 'receiver' || role === 'customer' ? recipientName : null),
                shipment.destination?.company,
                shipment.destination?.name
            ], 'Valued Customer');
        const resolvedReceiverPhone = chosenTemplate === 'shipment_confirmation_2'
            ? (explicitReceiverPhone || '[receiver telephone]')
            : (normalizePhone(
                shipment.destination?.phone || shipment.customer?.phone || shipment.customerPhone || shipment.documents?.receiverPhone || (role === 'receiver' || role === 'customer' ? phone : ''),
                shipment.destination?.phoneCountryCode || (role !== 'sender' ? recipientCountryCode : '965')
            ) || phone);
        context.receiverName = resolvedReceiverName;
        context.receiverPhone = resolvedReceiverPhone;

        const effectiveRecipientName = (role === 'sender') ? resolvedSenderName : resolvedReceiverName;

        // Initial DB log creation or update existing log
        let log;
        if (existingLogId) {
            log = await prisma.shipmentNotificationLog.update({
                where: { id: existingLogId },
                data: {
                    recipientName: effectiveRecipientName,
                    recipientPhone: phone,
                    provider: rawProvider,
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
                    provider: rawProvider,
                    templateName: chosenTemplate,
                    status: 'QUEUED',
                    sentAt: new Date()
                }
            });
        }

        if (settings.enabled === false) {
            await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'SKIPPED',
                    errorMessage: 'WhatsApp service is disabled in system settings'
                }
            });
            return { status: 'SKIPPED', logId: log.id, message: 'WhatsApp disabled in settings' };
        }

        const SUPPORTED_FALLBACK_PROVIDERS = new Set(['EVOLUTION', 'SHIPMENT_WHATSAPP', 'META']);
        const rawFallbackProvider = settings.fallbackProvider
            ? String(settings.fallbackProvider).trim().toUpperCase()
            : '';
        const normalizedFallbackProvider = rawFallbackProvider === 'TARGET_MSG'
            ? 'SHIPMENT_WHATSAPP'
            : rawFallbackProvider;
        const canFallbackTo = (
            !isFallbackAttempt
            && normalizedFallbackProvider
            && normalizedFallbackProvider !== 'NONE'
            && SUPPORTED_FALLBACK_PROVIDERS.has(normalizedFallbackProvider)
            && normalizedFallbackProvider !== provider
            && !(provider === 'TARGET_MSG' && normalizedFallbackProvider === 'SHIPMENT_WHATSAPP')
        ) ? normalizedFallbackProvider : null;

        const attemptProviderFailover = async (primaryError) => {
            if (!canFallbackTo) return null;
            const reason = `${provider} dispatch failed (${primaryError.response?.status || primaryError.code || primaryError.message})`;
            logger.warn('[WhatsApp Failover] Primary provider failed; failing over', {
                trackingNumber: shipment.trackingNumber,
                primaryProvider: provider,
                fallbackProvider: canFallbackTo,
                reason
            });
            try {
                const fbResult = await this.sendNotification({
                    shipment,
                    recipientRole,
                    recipientPhone,
                    recipientCountryCode,
                    recipientName,
                    eventType,
                    templateName: chosenTemplate,
                    customMessage,
                    force: true,
                    existingLogId: log.id,
                    bypassAgeGuard: true,
                    provider: canFallbackTo,
                    isFallbackAttempt: true,
                    fallbackReason: reason
                });
                return {
                    ...fbResult,
                    isFallback: true,
                    fallbackReason: reason
                };
            } catch (fbErr) {
                logger.error('[WhatsApp Failover] Fallback provider also failed', {
                    trackingNumber: shipment.trackingNumber,
                    primaryProvider: provider,
                    fallbackProvider: canFallbackTo,
                    error: fbErr.message
                });
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'FAILED',
                        provider: canFallbackTo,
                        isFallback: true,
                        fallbackReason: `${reason} | ${canFallbackTo} error: ${fbErr.message}`,
                        errorMessage: fbErr.message,
                        responseJson: fbErr.response?.data || fbErr.rawResponse || { error: fbErr.message }
                    }
                }).catch(() => {});
                throw fbErr;
            }
        };

        // Evolution's /sendText API cannot carry the approved Meta template payload.
        // Never report or dispatch a required shipment-confirmation template as free text.
        if (provider === 'EVOLUTION' && chosenTemplate === 'shipment_confirmation_2') {
            const templateError = new Error('Evolution text dispatch cannot send the required approved template shipment_confirmation_2');
            const failoverResult = await attemptProviderFailover(templateError);
            if (failoverResult) return failoverResult;

            await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'FAILED',
                    errorMessage: templateError.message,
                    responseJson: { reason: 'TEMPLATE_UNSUPPORTED_BY_PROVIDER', provider }
                }
            });
            throw templateError;
        }

        // 1. Explicit Shipment-WhatsApp Microservice Dispatch (msg.target-kw.com)
        if (provider === 'SHIPMENT_WHATSAPP' || provider === 'TARGET_MSG') {
            const serviceUrl = settings.serviceUrl || 'https://msg.target-kw.com';
            const estDeliveryFormatted = formatLegibleDate(context.estimatedDeliveryDate);
            const dateFormatted = chosenTemplate === 'shipment_confirmation_2'
                ? (context.shipmentDateDisplay || formatLegibleDate(shipment.createdAt || context.updatedAt || new Date()))
                : (context.updatedAt ? formatLegibleDate(context.updatedAt) : formatLegibleDate(new Date()));
            const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const fullUpdatedText = `${dateFormatted} at ${timeFormatted}`;
            const trackingUrl = context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber}`;
            const displayTracking = shipment.dhlTrackingNumber || context.trackingNumber || shipment.trackingNumber;

            const { variables, headerVariables } = buildMicroserviceVariables({
                chosenTemplate,
                context,
                shipment,
                displayTracking,
                resolvedReceiverName,
                resolvedReceiverPhone,
                effectiveRecipientName,
                customMessage,
                estDeliveryFormatted,
                dateFormatted,
                fullUpdatedText,
                trackingUrl
            });

            try {
                const billId = shipment.documents?.phenixBillId || null;
                let result;
                try {
                    result = await sendViaShipmentWhatsappMicroservice({
                        serviceUrl,
                        templateName: chosenTemplate,
                        language: getTemplateLanguage(chosenTemplate),
                        toPhone: phone,
                        variables,
                        headerVariables,
                        billId,
                        trackingNumber: shipment.trackingNumber,
                        role: recipientRole || 'receiver',
                        apiKey: settings.apiKey || null,
                        buttonUrlParam
                    });
                } catch (primaryMicroErr) {
                    if (/132001|Template name does not exist/i.test(primaryMicroErr.message) && chosenTemplate !== 'shipment_confirmation_2') {
                        const fallbackMicroTemplate = 'shipment_confirmation_2';
                        logger.warn(`[Shipment-WhatsApp] Template ${chosenTemplate} not found in WABA (#132001); retrying with ${fallbackMicroTemplate} [en_US]`);
                        const fbVars = buildMicroserviceVariables({
                            chosenTemplate: fallbackMicroTemplate,
                            context,
                            shipment,
                            displayTracking,
                            resolvedReceiverName,
                            resolvedReceiverPhone,
                            effectiveRecipientName,
                            customMessage,
                            estDeliveryFormatted,
                            dateFormatted,
                            fullUpdatedText,
                            trackingUrl
                        });
                        chosenTemplate = fallbackMicroTemplate;
                        result = await sendViaShipmentWhatsappMicroservice({
                            serviceUrl,
                            templateName: fallbackMicroTemplate,
                            language: 'en_US',
                            toPhone: phone,
                            variables: fbVars.variables,
                            headerVariables: fbVars.headerVariables,
                            billId,
                            trackingNumber: shipment.trackingNumber,
                            role: recipientRole || 'receiver',
                            apiKey: settings.apiKey || null,
                            buttonUrlParam
                        });
                    } else {
                        throw primaryMicroErr;
                    }
                }

                const wasSkipped = result.status === 'SKIPPED';
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
                        status: wasSkipped ? 'SKIPPED' : 'SENT',
                        chatwootMessageId: wasSkipped ? null : result.messageId,
                        provider: 'SHIPMENT_WHATSAPP',
                        isFallback: Boolean(isFallbackAttempt),
                        fallbackReason: isFallbackAttempt ? (incomingFallbackReason || null) : null,
                        errorMessage: wasSkipped ? result.message : null,
                        payloadJson: enrichedPayload,
                        responseJson: result.rawResponse,
                        sentAt: wasSkipped ? null : new Date()
                    }
                });

                return {
                    status: wasSkipped ? 'SKIPPED' : 'SENT',
                    logId: updated.id,
                    ...(!wasSkipped ? { externalMessageId: result.messageId } : { reason: result.message }),
                    provider: 'SHIPMENT_WHATSAPP',
                    isFallback: Boolean(isFallbackAttempt),
                    ...(isFallbackAttempt && incomingFallbackReason ? { fallbackReason: incomingFallbackReason } : {})
                };
            } catch (err) {
                logger.error(`[Shipment-WhatsApp Dispatch Error] ${err.message}`);
                const failoverResult = await attemptProviderFailover(err);
                if (failoverResult) return failoverResult;
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: err.message,
                        payloadJson: err.payload || { templateName: chosenTemplate, variables, headerVariables },
                        responseJson: err.rawResponse || { error: err.message }
                    }
                });
                throw err;
            }
        }

        // 2. Primary Chatwoot Outbound Dispatch with Emergency Fallback to msg.target-kw.com
        if (provider === 'CHATWOOT' || (!['MOCK', 'META', 'EVOLUTION'].includes(provider))) {
            const displayTracking = shipment.dhlTrackingNumber || context.trackingNumber || shipment.trackingNumber;
            const estDeliveryFormatted = formatLegibleDate(context.estimatedDeliveryDate);
            const dateFormatted = chosenTemplate === 'shipment_confirmation_2'
                ? (context.shipmentDateDisplay || formatLegibleDate(shipment.createdAt || context.updatedAt || new Date()))
                : (context.updatedAt ? formatLegibleDate(context.updatedAt) : formatLegibleDate(new Date()));
            const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const fullUpdatedText = `${dateFormatted} at ${timeFormatted}`;
            const trackingUrl = context.publicTrackingLink || `https://target-kw.com/track/${context.trackingNumber}`;

            try {
                const chatwootResult = await chatwootService.dispatchSingleNotification({
                    shipment,
                    eventType,
                    recipientRole: role,
                    recipientPhone: phone,
                    recipientName: effectiveRecipientName,
                    templateName: chosenTemplate,
                    customMessage,
                    buttonUrlParam,
                    logId: log.id
                });

                return {
                    status: 'SENT',
                    logId: log.id,
                    externalMessageId: chatwootResult.messageId,
                    provider: 'chatwoot',
                    isFallback: false
                };
            } catch (chatwootErr) {
                const is5xx = (chatwootErr.response?.status >= 500 && chatwootErr.response?.status < 600) ||
                              Boolean(chatwootErr.status >= 500 && chatwootErr.status < 600) ||
                              /50\d|5\d\d|Bad Gateway|Gateway Timeout|Internal Server Error/i.test(chatwootErr.message);
                const isTimeout = chatwootErr.code === 'ETIMEDOUT' ||
                                  chatwootErr.code === 'ECONNABORTED' ||
                                  /timeout/i.test(chatwootErr.message);
                const isNetwork = ['ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH'].includes(chatwootErr.code) ||
                                  /ECONNREFUSED|ENOTFOUND|network error/i.test(chatwootErr.message);
                const isConfigMissing = chatwootErr.message?.includes('Chatwoot configuration incomplete') ||
                                        chatwootErr.message?.includes('disabled') ||
                                        chatwootErr.message?.includes('not configured') ||
                                        chatwootErr.message?.includes('not initialized') ||
                                        chatwootErr.message?.includes('is not a function') ||
                                        !chatwootService.isConfigured();

                if (is5xx || isTimeout || isNetwork || isConfigMissing) {
                    const fallbackReason = `Chatwoot dispatch failed (${chatwootErr.response?.status || chatwootErr.status || chatwootErr.code || chatwootErr.message})`;
                    logger.warn(`[chatwoot fallback] ${fallbackReason} for ${shipment.trackingNumber} to ${role}. Failing over to msg.target-kw.com`);

                    const { variables, headerVariables } = buildMicroserviceVariables({
                        chosenTemplate,
                        context,
                        shipment,
                        displayTracking,
                        resolvedReceiverName,
                        resolvedReceiverPhone,
                        effectiveRecipientName,
                        customMessage,
                        estDeliveryFormatted,
                        dateFormatted,
                        fullUpdatedText,
                        trackingUrl
                    });

                    try {
                        const billId = shipment.documents?.phenixBillId || null;
                        let fallbackResult;
                        try {
                            fallbackResult = await sendViaShipmentWhatsappMicroservice({
                                serviceUrl: settings.serviceUrl || 'https://msg.target-kw.com',
                                templateName: chosenTemplate,
                                language: getTemplateLanguage(chosenTemplate),
                                toPhone: phone,
                                variables,
                                headerVariables,
                                billId,
                                trackingNumber: shipment.trackingNumber,
                                role: recipientRole || 'receiver',
                                apiKey: settings.apiKey || null,
                                buttonUrlParam
                            });
                        } catch (primaryFallbackErr) {
                            if (/132001|Template name does not exist/i.test(primaryFallbackErr.message) && chosenTemplate !== 'shipment_confirmation_2') {
                                const fallbackMicroTemplate = 'shipment_confirmation_2';
                                logger.warn(`[chatwoot fallback] Template ${chosenTemplate} not found in WABA (#132001); retrying with ${fallbackMicroTemplate} [en_US]`);
                                const fbVars = buildMicroserviceVariables({
                                    chosenTemplate: fallbackMicroTemplate,
                                    context,
                                    shipment,
                                    displayTracking,
                                    resolvedReceiverName,
                                    resolvedReceiverPhone,
                                    effectiveRecipientName,
                                    customMessage,
                                    estDeliveryFormatted,
                                    dateFormatted,
                                    fullUpdatedText,
                                    trackingUrl
                                });
                                chosenTemplate = fallbackMicroTemplate;
                                fallbackResult = await sendViaShipmentWhatsappMicroservice({
                                    serviceUrl: settings.serviceUrl || 'https://msg.target-kw.com',
                                    templateName: fallbackMicroTemplate,
                                    language: 'en_US',
                                    toPhone: phone,
                                    variables: fbVars.variables,
                                    headerVariables: fbVars.headerVariables,
                                    billId,
                                    trackingNumber: shipment.trackingNumber,
                                    role: recipientRole || 'receiver',
                                    apiKey: settings.apiKey || null,
                                    buttonUrlParam
                                });
                            } else {
                                throw primaryFallbackErr;
                            }
                        }

                        const fallbackWasSkipped = fallbackResult.status === 'SKIPPED';
                        await prisma.shipmentNotificationLog.update({
                            where: { id: log.id },
                            data: {
                                status: fallbackWasSkipped ? 'SKIPPED' : 'SENT',
                                provider: 'fallback',
                                isFallback: true,
                                fallbackReason,
                                chatwootMessageId: fallbackWasSkipped ? null : fallbackResult.messageId,
                                errorMessage: fallbackWasSkipped ? fallbackResult.message : null,
                                payloadJson: {
                                    ...fallbackResult.payload,
                                    fallback: true,
                                    primaryError: chatwootErr.message
                                },
                                responseJson: fallbackResult.rawResponse,
                                sentAt: fallbackWasSkipped ? null : new Date()
                            }
                        });

                        return {
                            status: fallbackWasSkipped ? 'SKIPPED' : 'SENT',
                            logId: log.id,
                            ...(!fallbackWasSkipped ? { externalMessageId: fallbackResult.messageId } : { reason: fallbackResult.message }),
                            provider: 'fallback',
                            isFallback: true,
                            fallbackReason
                        };
                    } catch (fallbackErr) {
                        logger.error(`[chatwoot fallback error] Fallback microservice also failed: ${fallbackErr.message}`);
                        await prisma.shipmentNotificationLog.update({
                            where: { id: log.id },
                            data: {
                                status: 'FAILED',
                                provider: 'fallback',
                                isFallback: true,
                                fallbackReason: `${fallbackReason} | Microservice error: ${fallbackErr.message}`,
                                errorMessage: fallbackErr.message,
                                responseJson: fallbackErr.rawResponse || { error: fallbackErr.message }
                            }
                        });
                        throw fallbackErr;
                    }
                }

                // Non-fallback error (e.g. 400 validation error like OUTSIDE_24H_WINDOW)
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: chatwootErr.message,
                        responseJson: chatwootErr.response?.data || { error: chatwootErr.message, code: chatwootErr.code }
                    }
                });
                throw chatwootErr;
            }
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

        // 3b. Evolution API Dispatch (evo.mawthook.io)
        if (provider === 'EVOLUTION') {
            try {
                const evoText = buildEvolutionShipmentText({
                    context,
                    shipment,
                    customMessage,
                    resolvedReceiverName,
                    resolvedReceiverPhone
                });
                const result = await sendViaEvolutionApi({ settings, toPhone: phone, text: evoText });

                const updated = await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'SENT',
                        chatwootMessageId: result.messageId,
                        provider: 'EVOLUTION',
                        isFallback: Boolean(isFallbackAttempt),
                        fallbackReason: isFallbackAttempt ? (incomingFallbackReason || null) : null,
                        payloadJson: result.payload,
                        responseJson: result.rawResponse
                    }
                });

                return {
                    status: 'SENT',
                    logId: updated.id,
                    externalMessageId: result.messageId,
                    provider: 'EVOLUTION',
                    isFallback: Boolean(isFallbackAttempt),
                    ...(isFallbackAttempt && incomingFallbackReason ? { fallbackReason: incomingFallbackReason } : {})
                };
            } catch (evoErr) {
                const errorData = evoErr.response?.data || { message: evoErr.message };
                logger.error('[WhatsApp Evolution API Error]', { error: evoErr.message, errorData });
                const failoverResult = await attemptProviderFailover(evoErr);
                if (failoverResult) return failoverResult;
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: evoErr.response?.data?.message || evoErr.message,
                        responseJson: errorData
                    }
                });
                throw new Error(`Evolution API request failed: ${evoErr.response?.data?.message || evoErr.message}`);
            }
        }

        // 4. Direct Meta WhatsApp Business API Cloud Endpoint
        try {
            const url = `https://graph.facebook.com/v19.0/${settings.phoneNumberId}/messages`;
            const payload = buildMetaMessagePayload(phone, eventType, context, chosenTemplate);

            logger.info('[WhatsApp Meta API Request] Sending message', { templateName: chosenTemplate, recipient: maskPhoneForLog(String(phone).replace(/\D/g, '')) });

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
                    provider: 'META',
                    isFallback: Boolean(isFallbackAttempt),
                    fallbackReason: isFallbackAttempt ? (incomingFallbackReason || null) : null,
                    payloadJson: payload,
                    responseJson: res.data
                }
            });

            return {
                status: 'SENT',
                logId: updated.id,
                externalMessageId: wamid,
                provider: 'META',
                isFallback: Boolean(isFallbackAttempt),
                ...(isFallbackAttempt && incomingFallbackReason ? { fallbackReason: incomingFallbackReason } : {})
            };
        } catch (err) {
            const errorData = err.response?.data || { message: err.message };
            logger.error(`[WhatsApp Meta API Error] ${err.message}`, errorData);
            const failoverResult = await attemptProviderFailover(err);
            if (failoverResult) return failoverResult;

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

        if (provider === 'EVOLUTION') {
            const result = await sendViaEvolutionApi({ settings, toPhone: cleanPhone, text: messageText });
            return { status: 'SENT', externalMessageId: result.messageId, provider: 'EVOLUTION', phone, response: result.rawResponse };
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

            logger.info(`[WhatsApp Meta API] Dispatching text message to ${maskPhoneForLog(cleanPhone)} (DEV Mode: ${isDevMode() ? 'YES' : 'NO'})`);
            try {
                const res = await axios.post(url, payload, {
                    headers: {
                        Authorization: `Bearer ${settings.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 12000
                });
                const wamid = res.data?.messages?.[0]?.id || null;
                logger.info(`[WhatsApp Meta API] Message sent to ${maskPhoneForLog(cleanPhone)}. Message ID: ${wamid}`);
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
    async sendAuthOtp({ phone, name, otp, phoneCountryCode = '965' }) {
        if (!phone || !otp) return null;
        const resolvedPhone = resolveRecipientPhone(phone, phoneCountryCode);
        if (!resolvedPhone) {
            logger.warn(`[WhatsApp OTP] Invalid phone number ending ${maskPhoneForLog(phone).slice(-4)}`);
            return null;
        }

        const cleanPhone = String(resolvedPhone).replace(/\D/g, '');
        const dbConfig = await whatsAppConfigService.getConfig({ internal: true }).catch(() => null);
        const settings = {
            ...(getSystemSettings()?.whatsapp || {}),
            ...(dbConfig || {})
        };
        const provider = String(settings.provider || 'CHATWOOT').trim().toUpperCase();
        const fallbackProvider = String(settings.fallbackProvider || 'META').trim().toUpperCase();
        const templateName = 'otptargetlogin';
        const langCode = 'en_US';

        logger.info(`[WhatsApp OTP Dispatch] Template: ${templateName} [${langCode}] Target: ${maskPhoneForLog(cleanPhone)} Provider: ${provider}`);

        // Chatwoot is template-capable only through its approved inbox template API.
        if (provider === 'CHATWOOT') {
            try {
                const result = await chatwootService.sendDirectOtp({ phone: resolvedPhone, name, otp });
                if (result) return { ...result, status: String(result.status || '').toLowerCase() === 'failed' ? 'FAILED' : 'SUBMITTED', provider: 'CHATWOOT', templateName };
                throw new Error('Inbox authentication template dispatch returned no message');
            } catch (inboxErr) {
                logger.warn(`[WhatsApp OTP Inbox Template Error] ${inboxErr.message}`);
            }
        }

        // 1. Direct Meta WhatsApp Business API Cloud Endpoint (Most accurate for Authentication / Custom templates)
        const templateProviderCandidates = [provider, fallbackProvider];
        if (
            (templateProviderCandidates.includes('META') || provider === 'META' || fallbackProvider === 'META') &&
            settings.accessToken &&
            settings.phoneNumberId
        ) {
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
                    logger.info(`[WhatsApp Meta API OTP Sent] Template '${templateName}' sent to ${maskPhoneForLog(cleanPhone)} (Payload Set ${i + 1}). WAMID: ${wamid}`);
                    return { status: 'SENT', externalMessageId: wamid, provider: 'META' };
                } catch (metaErr) {
                    const errorDetail = metaErr.response?.data?.error?.message || metaErr.message;
                    logger.warn(`[WhatsApp Meta API OTP Candidate ${i + 1} Failed] ${errorDetail}`);
                }
            }
        }

        // 2. Shipment-WhatsApp Microservice Dispatch (https://msg.target-kw.com)
        const templateMicroserviceProvider = [provider, fallbackProvider].find(candidate =>
            candidate === 'SHIPMENT_WHATSAPP' || candidate === 'TARGET_MSG'
        );
        if (templateMicroserviceProvider) {
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
                return { ...res, provider: 'SHIPMENT_WHATSAPP', templateName };
            } catch (microErr) {
                logger.warn(`[WhatsApp OTP Microservice Error] ${microErr.message}`);
            }
        }

        if (fallbackProvider === 'CHATWOOT' && provider !== 'CHATWOOT') {
            const result = await chatwootService.sendDirectOtp({ phone: resolvedPhone, name, otp });
            if (result) return { ...result, status: String(result.status || '').toLowerCase() === 'failed' ? 'FAILED' : 'SUBMITTED', provider: 'CHATWOOT', templateName };
        }

        // Evolution /sendText and free-text Chatwoot/direct sends are not approved OTP templates.
        throw new Error(`Unable to send required WhatsApp authentication template '${templateName}' with the configured template-capable provider`);
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

WhatsAppIntegrationService.prototype.buildMetaMessagePayload = buildMetaMessagePayload;
WhatsAppIntegrationService.prototype.sendViaShipmentWhatsappMicroservice = sendViaShipmentWhatsappMicroservice;

const serviceInstance = new WhatsAppIntegrationService();
serviceInstance.buildMetaMessagePayload = buildMetaMessagePayload;
serviceInstance.sendViaShipmentWhatsappMicroservice = sendViaShipmentWhatsappMicroservice;

module.exports = serviceInstance;
module.exports.sendViaShipmentWhatsappMicroservice = sendViaShipmentWhatsappMicroservice;
module.exports.buildMetaMessagePayload = buildMetaMessagePayload;
module.exports.resolveRecipientPhone = resolveRecipientPhone;
module.exports.isDevMode = isDevMode;
module.exports.DEV_SAFE_PHONE = DEV_SAFE_PHONE;
