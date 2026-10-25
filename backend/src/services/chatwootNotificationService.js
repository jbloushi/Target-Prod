const axios = require('axios');
const { prisma } = require('../config/database');
const config = require('../config/config');
const logger = require('../utils/logger');
const { STATUS_LABELS } = require('../constants/statusConstants');

const PROVIDER = 'chatwoot';

const EVENT_TARGETS = {
    shipment_created: ['sender'],
    pickup_scheduled: ['sender'],
    received_at_hub: ['sender'],
    verified_and_dispatched: ['sender'],
    payment_link_ready: ['sender'],
    payment_confirmed: ['sender'],
    on_hold_customs_issue: ['sender'],
    documents_needed: ['sender'],
    delivery_attempt: ['sender'],
    out_for_delivery: ['sender'],
    delivered: ['sender'],
    rto_in_transit: ['sender'],
    returned: ['sender']
};

const DEFAULT_EVENT_CONTENT = {
    shipment_created: 'Shipment Created',
    pickup_scheduled: 'Driver Scheduled for Pickup',
    received_at_hub: 'Received at Target Logistics Hub',
    verified_and_dispatched: 'Hub Verified & Dispatched to Carrier',
    payment_link_ready: 'Payment Request & Checkout Link',
    payment_confirmed: 'Payment Received & Verified',
    on_hold_customs_issue: 'On Hold / Customs Issue',
    documents_needed: 'Documents Needed',
    delivery_attempt: 'Delivery Attempt',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Shipment Successfully Delivered',
    rto_in_transit: 'Return to Shipper (RTO) in Transit',
    returned: 'Parcel Returned to Shipper'
};

const CANONICAL_EVENT_TEMPLATES = {
    shipment_created: 'target_shipment_created',
    new_shipment_created: 'target_shipment_created',
    pickup_scheduled: 'target_pickup_scheduled',
    received_at_hub: 'target_received_at_hub',
    verified_and_dispatched: 'target_verified_dispatched',
    out_for_delivery: 'target_shipment_out_for_delivery',
    delivery_attempt: 'target_delivery_attempt',
    delivered: 'target_shipment_delivered',
    on_hold_customs_issue: 'target_customs_exception_hold',
    documents_needed: 'target_documents_needed',
    payment_link_ready: 'payment_request_v1',
    payment_confirmed: 'target_payment_confirmed',
    rto_in_transit: 'target_rto_in_transit',
    returned: 'target_shipment_returned',
    location_request: 'location_request_v1',
    customer_engagement: 'customer_inquiry_start',
    return_portal: 'return_portal_v1',
    auth_otp: 'otptargetlogin'
};

const APPROVED_META_TEMPLATES = new Set([
    ...Object.values(CANONICAL_EVENT_TEMPLATES || {}),
    'shipment_confirmation_2',
    'new_shipment_created',
    'pickup_alert_v1',
    'target_customs_hold',
    'target_out_for_delivery',
    'shipment_tracking_quick',
    'account_statement_v1',
    'invoice_notification_v1',
    'hello_world'
]);

function getTemplateLanguage(templateName, userLang = 'en') {
    if (userLang === 'ar') return 'ar';
    if (templateName && templateName.startsWith('target_')) return 'en_US';
    if (templateName === 'otptargetlogin') return 'en_US';
    if (templateName === 'shipment_tracking_quick') return 'en_GB';
    if (templateName === 'shipment_confirmation_2' || templateName === 'hello_world') return 'en_US';
    return 'en';
}

function formatProcessedParams(params) {
    if (!params) return {};
    if (typeof params === 'object' && !Array.isArray(params)) {
        return params;
    }
    const bodyHash = {};
    if (Array.isArray(params)) {
        params.forEach((val, idx) => {
            bodyHash[String(idx + 1)] = String(val ?? '');
        });
    }
    return {
        body: bodyHash,
        ...bodyHash
    };
}

function getChatwootConfig() {
    const chatwoot = config.chatwoot || {};
    return {
        enabled: chatwoot.enabled === true,
        baseUrl: trimTrailingSlash(chatwoot.baseUrl),
        accountId: chatwoot.accountId,
        inboxId: chatwoot.inboxId,
        apiAccessToken: chatwoot.apiAccessToken,
        allowPlainTextFallback: chatwoot.allowPlainTextFallback !== false,
        templateConfig: chatwoot.templateConfig || {}
    };
}

function trimTrailingSlash(value) {
    return value ? String(value).replace(/\/+$/, '') : value;
}

function normalizeDialCode(dialCode) {
    const digits = String(dialCode || '').replace(/\D/g, '');
    return digits ? `+${digits}` : null;
}

function normalizePhone(phone, dialCode = null) {
    if (!phone) return null;
    const value = String(phone).trim();
    if (!value) return null;
    if (value.startsWith('+')) return `+${value.slice(1).replace(/\D/g, '')}`;
    const digits = value.replace(/\D/g, '');
    if (!digits) return null;

    const normalizedDialCode = normalizeDialCode(dialCode);
    if (!normalizedDialCode) return `+${digits}`;

    const dialDigits = normalizedDialCode.slice(1);
    if (digits.startsWith(dialDigits)) return `+${digits}`;

    const localDigits = digits.startsWith('0') && dialDigits !== '1'
        ? digits.slice(1)
        : digits;

    return `+${dialDigits}${localDigits}`;
}

function maskPhone(phone, dialCode = null) {
    const normalized = normalizePhone(phone, dialCode);
    if (!normalized || normalized.length <= 6) return '***';
    return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function compactObject(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function slugify(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '_')
        .replace(/^-+|-+$/g, '');
}

function resolveUpgradedRole(existingRole, incomingRole) {
    const validRoles = ['sender', 'receiver', 'both'];
    const existing = existingRole ? String(existingRole).toLowerCase().trim() : '';
    const incoming = incomingRole ? String(incomingRole).toLowerCase().trim() : '';

    if (existing === 'both' || incoming === 'both') return 'both';
    if (
        (existing === 'sender' && incoming === 'receiver') ||
        (existing === 'receiver' && incoming === 'sender')
    ) {
        return 'both';
    }

    const isExistingValid = validRoles.includes(existing);
    const isIncomingValid = validRoles.includes(incoming);

    if (isExistingValid && isIncomingValid) {
        return existing;
    }
    if (!isExistingValid && isIncomingValid) {
        return incoming;
    }
    if (isExistingValid && !isIncomingValid) {
        return existing;
    }
    return 'receiver';
}

function getPersonFromShipment(shipment, role) {
    const source = role === 'sender'
        ? (shipment.origin || shipment.customer || {})
        : (shipment.destination || {});
    return {
        role,
        name: source.contactPerson || source.name || source.company || (role === 'sender' ? shipment.customer?.name : null),
        email: source.email || (role === 'sender' ? shipment.customer?.email : null),
        phone: normalizePhone(
            source.phone || (role === 'sender' ? shipment.customer?.phone : null),
            source.phoneCountryCode
        ),
        raw: source
    };
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

function formatDisplayDate(value, includeTime = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const options = includeTime
        ? { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }
        : { day: 'numeric', month: 'long', year: 'numeric' };

    return new Intl.DateTimeFormat('en-GB', options)
        .format(date)
        .replace(',', '')
        .replace(/\b(am|pm)\b/g, (value) => value.toUpperCase());
}

function locationLabel(location) {
    if (!location) return '';
    const city = location.city;
    const country = location.countryCode || location.country;
    if (city && country) return `${city}, ${country}`;

    return [
        location.city,
        location.state,
        location.countryCode || location.country,
    ].filter(Boolean).join(', ') || location.formattedAddress || '';
}

function buildPublicTrackingLink(trackingNumber) {
    const baseUrl = trimTrailingSlash(config.publicTrackingBaseUrl || config.frontendUrl);
    return `${baseUrl}/track/${encodeURIComponent(trackingNumber)}`;
}

function buildPublicPaymentLink(trackingNumber) {
    const baseUrl = trimTrailingSlash(config.publicTrackingBaseUrl || config.frontendUrl);
    return `${baseUrl}/pay/${encodeURIComponent(trackingNumber)}`;
}

function buildSupportWhatsappLink(trackingNumber) {
    const phone = String(config.supportWhatsappPhone || '').replace(/\D/g, '');
    if (!phone) return '';
    const text = encodeURIComponent(`Hi, I want to ask about my shipment ${trackingNumber}`);
    return `https://wa.me/${phone}?text=${text}`;
}

function latestStatusEntry(shipment) {
    const history = Array.isArray(shipment.history) ? shipment.history : [];
    return history.length ? history[history.length - 1] : null;
}

function buildShipmentNotificationContext(shipment) {
    const latest = latestStatusEntry(shipment);
    const status = shipment.status || latest?.status || 'unknown';
    const carrierCode = shipment.carrierCode || 'DGR';
    const carrierName = carrierCode === 'DGR' ? 'DHL' : carrierCode;
    const statusDatetime = latest?.timestamp || shipment.updatedAt || shipment.createdAt;

    const price = Number(shipment.remainingBalance || shipment.price || 0);
    const currency = shipment.currency || 'KWD';
    const formattedAmount = `${price.toFixed(3)} ${currency}`;

    const codNum = Number(shipment.codAmount || 0);
    const codCurrency = shipment.codCurrency || currency;
    const codFormatted = `${codNum.toFixed(3)} ${codCurrency}`;

    return {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrierCode,
        carrierName,
        carrierDisplayName: carrierCode === 'DGR' || carrierCode === 'DHL' ? 'DHL Express' : carrierName,
        origin: locationLabel(shipment.origin),
        destination: locationLabel(shipment.destination),
        estimatedDeliveryDate: formatDateTime(shipment.estimatedDelivery),
        estimatedDeliveryDisplay: formatDisplayDate(shipment.estimatedDelivery),
        currentStatus: STATUS_LABELS[status] || String(status).replace(/_/g, ' '),
        currentStatusRaw: status,
        currentStatusDatetime: formatDateTime(statusDatetime),
        currentStatusDatetimeDisplay: formatDisplayDate(statusDatetime, true),
        publicTrackingLink: buildPublicTrackingLink(shipment.trackingNumber),
        publicPaymentLink: buildPublicPaymentLink(shipment.trackingNumber),
        amountDue: formattedAmount,
        codAmount: codFormatted,
        codAmountRaw: codNum,
        codStatus: shipment.codStatus || null,
        currency,
        isPaid: Boolean(shipment.paid),
        organization: shipment.organization || null,
        organizationId: shipment.organizationId || shipment.organization?.id || null,
        organizationName: shipment.organization?.name || null,
        supportWhatsappLink: buildSupportWhatsappLink(shipment.trackingNumber),
        supportInstruction: 'Reply to this WhatsApp message for shipment support.',
        latestDescription: latest?.description || ''
    };
}

function getNotificationTargets(eventType, shipment) {
    const roles = EVENT_TARGETS[eventType] || [];
    return roles
        .map(role => getPersonFromShipment(shipment, role))
        .filter(target => target.phone);
}

function mapStatusToNotificationEvent(status, description = '') {
    const normalizedStatus = String(status || '').toLowerCase();
    const text = String(description || '').toLowerCase();

    if (normalizedStatus === 'received_at_hub') return 'received_at_hub';
    if (normalizedStatus === 'verified') return 'verified_and_dispatched';
    if (normalizedStatus === 'out_for_delivery') return 'out_for_delivery';
    if (normalizedStatus === 'delivered') return 'delivered';
    if (normalizedStatus === 'rto_in_transit') return 'rto_in_transit';
    if (normalizedStatus === 'returned') return 'returned';
    if (normalizedStatus === 'ready_for_pickup') return 'pickup_scheduled';
    if (normalizedStatus === 'exception' && /customs|clearance|hold/.test(text)) return 'on_hold_customs_issue';
    if (normalizedStatus === 'exception' && /document|invoice|paperwork|kyc/.test(text)) return 'documents_needed';
    if (normalizedStatus === 'exception' && /attempt|unavailable|no answer|failed delivery/.test(text)) return 'delivery_attempt';
    return null;
}

function buildTemplateParameters(context, target) {
    return [
        context.trackingNumber,
        `${context.carrierName} / ${context.carrierCode}`,
        `${context.origin} \u2192 ${context.destination}`,
        context.estimatedDeliveryDisplay || 'Not available',
        context.currentStatus,
        context.currentStatusDatetimeDisplay || formatDisplayDate(new Date(), true),
        context.publicTrackingLink,
        context.publicPaymentLink || context.publicTrackingLink,
        target.name || '',
        context.amountDue || ''
    ];
}

function buildPlainContent(eventType, context, target) {
    const statusLabel = DEFAULT_EVENT_CONTENT[eventType] || context.currentStatus || eventType;
    const routeLine = `${context.origin} \u2192 ${context.destination}`;
    const updatedAt = context.currentStatusDatetimeDisplay || formatDisplayDate(new Date(), true);

    if (eventType === 'payment_link_ready') {
        return [
            '*Target Logistics - Payment Request*',
            '',
            `*Tracking Number:* _${context.trackingNumber}_`,
            `*Amount Due:* *${context.amountDue}*`,
            `*Carrier / Route:* ${context.carrierDisplayName || context.carrierName} (${routeLine})`,
            '',
            '*Secure Pay-by-Link (K-Net / Card / Apple Pay):*',
            context.publicPaymentLink,
            '',
            'Please complete your settlement via the link above to dispatch your shipment.',
            '',
            '*Support:*',
            context.supportWhatsappLink || 'Reply to this WhatsApp message for assistance.'
        ].join('\n');
    }

    if (eventType === 'payment_confirmed') {
        return [
            '*Target Logistics - Payment Confirmed*',
            '',
            `*Tracking Number:* _${context.trackingNumber}_`,
            `*Amount Paid:* *${context.amountDue}*`,
            `*Status:* Payment received & verified online.`,
            `*Route:* ${routeLine}`,
            '',
            '*Live Tracking:*',
            context.publicTrackingLink,
            '',
            '*Support:*',
            context.supportWhatsappLink || 'Reply to this WhatsApp message for assistance.'
        ].join('\n');
    }

    return [
        '*Shipment Update*',
        '',
        `*Tracking Number:* _${context.trackingNumber}_`,
        `*Carrier:* ${context.carrierDisplayName || context.carrierName}`,
        '',
        '*Route:*',
        routeLine,
        '',
        '*Estimated Delivery:*',
        context.estimatedDeliveryDisplay || 'Not available',
        '',
        '*Current Status*',
        statusLabel,
        `*Updated:* ${updatedAt}`,
        '',
        '*Track Your Shipment:*',
        context.publicTrackingLink,
        '',
        '*Support:*',
        context.supportWhatsappLink || 'Reply to this WhatsApp message for assistance.'
    ].join('\n');
}

function getTemplateConfig(eventType, target) {
    const templates = getChatwootConfig().templateConfig || {};
    return templates[`${eventType}:${target.role}`] || templates[eventType] || null;
}

function buildMessagePayload(eventType, context, target, customTemplateName = null) {
    const template = getTemplateConfig(eventType, target);
    const content = buildPlainContent(eventType, context, target);
    const resolvedTemplateName = customTemplateName || template?.name || CANONICAL_EVENT_TEMPLATES[eventType] || null;

    if (resolvedTemplateName) {
        return {
            payload: compactObject({
                message_type: 'outgoing',
                private: false,
                content,
                template_params: {
                    name: resolvedTemplateName,
                    category: template?.category || (resolvedTemplateName === 'otptargetlogin' ? 'AUTHENTICATION' : 'UTILITY'),
                    language: template?.language || getTemplateLanguage(resolvedTemplateName),
                    processed_params: formatProcessedParams(template?.processed_params || buildTemplateParameters(context, target)),
                    parameters: template?.parameters || buildTemplateParameters(context, target)
                }
            }),
            templateName: resolvedTemplateName
        };
    }

    if (!getChatwootConfig().allowPlainTextFallback) {
        return { payload: null, templateName: null };
    }

    return {
        payload: {
            message_type: 'outgoing',
            private: false,
            content
        },
        templateName: null
    };
}

function sanitizeForLog(value) {
    if (!value || typeof value !== 'object') return value;
    const json = JSON.parse(JSON.stringify(value));
    const scrub = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach((key) => {
            if (/token|secret|password|authorization|api_access/i.test(key)) {
                obj[key] = '[redacted]';
            } else if (/phone/i.test(key) && typeof obj[key] === 'string') {
                obj[key] = maskPhone(obj[key]);
            } else {
                scrub(obj[key]);
            }
        });
    };
    scrub(json);
    return json;
}

class ChatwootNotificationService {
    constructor() {
        this.client = null;
    }

    resetClient() {
        this.client = null;
    }

    getClient() {
        const cw = getChatwootConfig();
        const baseUrl = cw.baseUrl || 'https://inbox.mawthook.io';
        const token = cw.apiAccessToken || 'token';

        if (!this.client || this.client.defaults?.baseURL !== baseUrl) {
            this.client = axios.create({
                baseURL: baseUrl,
                timeout: 15000,
                headers: {
                    api_access_token: token,
                    'Content-Type': 'application/json'
                }
            });
        }

        return this.client;
    }

    isConfigured() {
        const cw = getChatwootConfig();
        return Boolean(cw.enabled && cw.baseUrl && cw.accountId && cw.inboxId && cw.apiAccessToken);
    }

    async createLog({ shipment, eventType, target, status = 'pending', errorMessage = null, force = false }) {
        const cw = getChatwootConfig();
        const data = {
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            eventType,
            recipientRole: target.role,
            recipientName: target.name || null,
            recipientPhone: maskPhone(target.phone),
            provider: PROVIDER,
            chatwootAccountId: cw.accountId || null,
            chatwootInboxId: cw.inboxId || null,
            status,
            errorMessage
        };

        if (force) {
            return prisma.shipmentNotificationLog.upsert({
                where: {
                    shipmentId_eventType_recipientRole_provider: {
                        shipmentId: shipment.id,
                        eventType,
                        recipientRole: target.role,
                        provider: PROVIDER
                    }
                },
                update: { ...data, payloadJson: null, responseJson: null, sentAt: null },
                create: data
            });
        }

        try {
            return await prisma.shipmentNotificationLog.create({ data });
        } catch (error) {
            if (error.code === 'P2002') {
                logger.info(`[chatwoot] skipped duplicate ${eventType} ${shipment.trackingNumber} ${target.role} ${maskPhone(target.phone)}`);
                const existing = await prisma.shipmentNotificationLog.findFirst({
                    where: {
                        shipmentId: shipment.id,
                        eventType,
                        recipientRole: target.role,
                        provider: PROVIDER
                    }
                });
                if (existing?.status !== 'skipped') {
                    await prisma.shipmentNotificationLog.update({
                        where: { id: existing.id },
                        data: { responseJson: { skippedReason: 'duplicate' } }
                    }).catch(() => null);
                }
                return null;
            }
            throw error;
        }
    }

    async updateLog(logId, data) {
        if (!logId) return null;
        return prisma.shipmentNotificationLog.update({
            where: { id: logId },
            data: sanitizeForLog(data)
        });
    }

    async request(method, path, body = undefined, query = undefined, headers = undefined) {
        const client = this.getClient();
        if (!client) {
            throw new Error('Chatwoot client is not initialized or configured');
        }
        const response = await client.request({ method, url: path, data: body, params: query, headers });
        return response.data;
    }

    resolveUpgradedRole(existingRole, incomingRole) {
        return resolveUpgradedRole(existingRole, incomingRole);
    }

    slugify(text) {
        return slugify(text);
    }

    normalizePhone(phone, dialCode = null) {
        return normalizePhone(phone, dialCode);
    }

    maskPhone(phone, dialCode = null) {
        return maskPhone(phone, dialCode);
    }

    buildShipmentNotificationContext(shipment) {
        return buildShipmentNotificationContext(shipment);
    }

    buildPlainContent(eventType, context, target) {
        return buildPlainContent(eventType, context, target);
    }

    async getOrCreateChatwootOrganization(organizationOrId, organizationName = null) {
        if (!organizationOrId) return null;

        let orgId = typeof organizationOrId === 'object' ? organizationOrId.id : organizationOrId;
        let orgName = typeof organizationOrId === 'object' ? organizationOrId.name : organizationName;
        let cachedCwId = typeof organizationOrId === 'object' ? organizationOrId.chatwootOrganizationId : null;

        // 1. If we already have cachedCwId on object, return immediately
        if (cachedCwId) {
            return {
                id: cachedCwId,
                name: orgName
            };
        }

        // 2. Check local database
        let dbOrg = null;
        if (orgId) {
            try {
                dbOrg = await prisma.organization.findUnique({
                    where: { id: orgId },
                    select: { id: true, name: true, chatwootOrganizationId: true }
                });
                if (dbOrg?.chatwootOrganizationId) {
                    if (typeof organizationOrId === 'object') {
                        organizationOrId.chatwootOrganizationId = dbOrg.chatwootOrganizationId;
                    }
                    return {
                        id: dbOrg.chatwootOrganizationId,
                        name: dbOrg.name || orgName
                    };
                }
                if (dbOrg?.name && !orgName) {
                    orgName = dbOrg.name;
                }
            } catch (err) {
                logger.debug(`[chatwoot] organization db lookup error for ${orgId}: ${err.message}`);
            }
        }

        const effectiveName = orgName || `Organization ${orgId}`;
        const cw = getChatwootConfig();

        let chatwootOrgId = null;

        // 3. Query / create in Chatwoot API
        try {
            const orgPayload = {
                name: effectiveName,
                company_name: effectiveName
            };
            const res = await this.request('post', `/api/v1/accounts/${cw.accountId}/organizations`, orgPayload);
            chatwootOrgId = res?.id || res?.payload?.id || res?.data?.id || null;
        } catch (apiErr) {
            // Graceful fallback for Chatwoot instances where /organizations is named /companies or unavailable
            if (apiErr.response?.status === 404 || apiErr.message?.includes('404')) {
                try {
                    const compRes = await this.request('post', `/api/v1/accounts/${cw.accountId}/companies`, { name: effectiveName });
                    chatwootOrgId = compRes?.id || compRes?.payload?.id || compRes?.data?.id || null;
                } catch {
                    chatwootOrgId = `org_${slugify(effectiveName)}`;
                }
            } else {
                chatwootOrgId = `org_${slugify(effectiveName)}`;
            }
        }

        if (!chatwootOrgId) {
            chatwootOrgId = `org_${slugify(effectiveName)}`;
        }

        // 4. Persist to MySQL database to guarantee all organization members reuse this exact record
        if (orgId) {
            try {
                await prisma.organization.update({
                    where: { id: orgId },
                    data: { chatwootOrganizationId: String(chatwootOrgId) }
                });
                if (typeof organizationOrId === 'object') {
                    organizationOrId.chatwootOrganizationId = String(chatwootOrgId);
                }
            } catch (dbErr) {
                logger.warn(`[chatwoot] failed to cache chatwootOrganizationId on organization ${orgId}: ${dbErr.message}`);
            }
        }

        return { id: String(chatwootOrgId), name: effectiveName };
    }

    buildConversationLabels({ role, organization, shipment, eventType, context }) {
        const labels = new Set();

        // 1. Role label
        const normalizedRole = String(role || '').toLowerCase();
        if (normalizedRole === 'both') {
            labels.add('role_both');
        } else if (normalizedRole === 'sender') {
            labels.add('sender');
        } else {
            labels.add('receiver');
        }

        // 2. Organization label
        const orgName = organization?.name || context?.organizationName || context?.organization?.name;
        if (orgName) {
            labels.add(`org_${slugify(orgName)}`);
        }

        // 3. Operational state labels
        const status = context?.currentStatusRaw || shipment?.status;
        const codAmount = Number(shipment?.codAmountRaw ?? shipment?.codAmount ?? context?.codAmountRaw ?? 0);
        const codStatus = shipment?.codStatus ?? context?.codStatus;
        const isPaid = Boolean(shipment?.paid ?? context?.isPaid);
        const remainingBal = Number(shipment?.remainingBalance ?? 0);

        if (eventType === 'on_hold_customs_issue' || (status === 'exception' && /customs|clearance/i.test(context?.latestDescription || ''))) {
            labels.add('customs_hold');
        }

        if (codAmount > 0 && codStatus !== 'collected') {
            labels.add('cod_due');
        }

        if (eventType === 'out_for_delivery' || status === 'out_for_delivery') {
            labels.add('out_for_delivery');
        }

        if (eventType === 'delivered' || status === 'delivered') {
            labels.add('delivered');
        }

        if (eventType === 'payment_link_ready' || (!isPaid && remainingBal > 0)) {
            labels.add('payment_pending');
        }

        return Array.from(labels);
    }

    async applyConversationLabels(conversationId, labels) {
        if (!conversationId || !Array.isArray(labels) || labels.length === 0) return null;
        const cw = getChatwootConfig();
        try {
            return await this.request('post', `/api/v1/accounts/${cw.accountId}/conversations/${conversationId}/labels`, { labels });
        } catch (err) {
            logger.warn(`[chatwoot] failed to apply labels [${labels.join(',')}] to conversation ${conversationId}: ${err.message}`);
            return null;
        }
    }

    async syncConversationLabels(conversationId, labels) {
        return this.applyConversationLabels(conversationId, labels);
    }

    async findOrCreateContact(target, context = {}) {
        const cw = getChatwootConfig();
        const query = target.phone;
        let found = null;

        try {
            const result = await this.request('get', `/api/v1/accounts/${cw.accountId}/contacts/search`, undefined, { q: query });
            const contacts = result?.payload || result?.data || result || [];
            found = Array.isArray(contacts)
                ? contacts.find(contact => normalizePhone(contact.phone_number || contact.phoneNumber) === target.phone) || null
                : null;
        } catch (error) {
            logger.debug(`[chatwoot] contact search failed ${maskPhone(target.phone)}: ${error.response?.status || error.message}`);
        }

        // Resolve Organization mapping if available
        let chatwootOrgId = null;
        const orgCandidate = context.organization || context.organizationId;
        if (orgCandidate) {
            let org = context.organization;
            if (!org && context.organizationId) {
                org = await prisma.organization.findUnique({ where: { id: context.organizationId } }).catch(() => null);
            }
            if (org) {
                const cwOrg = await this.getOrCreateChatwootOrganization(org);
                chatwootOrgId = cwOrg?.id ? String(cwOrg.id) : null;
            }
        }

        if (found?.id) {
            const existingAttrs = found.custom_attributes || {};
            const existingRole = existingAttrs.role || existingAttrs.recipient_role;
            const upgradedRole = resolveUpgradedRole(existingRole, target.role);

            const needsRoleUpgrade = upgradedRole !== existingRole;
            const needsOrgLink = chatwootOrgId && String(existingAttrs.organization_id) !== String(chatwootOrgId);

            if (needsRoleUpgrade || needsOrgLink) {
                const updatedCustomAttrs = {
                    ...existingAttrs,
                    role: upgradedRole,
                    recipient_role: upgradedRole,
                    ...(chatwootOrgId ? {
                        organization_id: chatwootOrgId,
                        organization_name: context.organizationName || context.organization?.name || existingAttrs.organization_name
                    } : {})
                };

                try {
                    const updatePayload = {
                        custom_attributes: updatedCustomAttrs,
                        ...(chatwootOrgId ? { organization_id: Number(chatwootOrgId) || chatwootOrgId } : {})
                    };
                    const updated = await this.request('put', `/api/v1/accounts/${cw.accountId}/contacts/${found.id}`, updatePayload);
                    const candidate = updated?.payload?.contact || updated?.payload || updated;
                    if (candidate && (candidate.id || candidate.contact?.id)) {
                        found = candidate.contact || candidate;
                    }
                    found.custom_attributes = updatedCustomAttrs;
                    if (chatwootOrgId) {
                        found.organization_id = Number(chatwootOrgId) || chatwootOrgId;
                    }
                    logger.info(`[chatwoot] contact updated id=${found.id} role=${upgradedRole} org=${chatwootOrgId}`);
                } catch (updateErr) {
                    logger.warn(`[chatwoot] contact attribute update failed for ${found.id}: ${updateErr.message}`);
                    found.custom_attributes = updatedCustomAttrs;
                }
            } else {
                found.custom_attributes = {
                    ...existingAttrs,
                    role: existingRole || target.role || 'receiver',
                    recipient_role: existingRole || target.role || 'receiver'
                };
            }

            return found;
        }

        const initialRole = target.role || 'receiver';
        const payload = {
            inbox_id: Number(cw.inboxId),
            name: target.name || target.phone,
            phone_number: target.phone,
            email: target.email || undefined,
            ...(chatwootOrgId ? { organization_id: Number(chatwootOrgId) || chatwootOrgId } : {}),
            custom_attributes: {
                shipment_tracking_number: context.trackingNumber,
                shipment_id: context.shipmentId,
                role: initialRole,
                recipient_role: initialRole,
                carrier_code: context.carrierCode,
                ...(chatwootOrgId ? {
                    organization_id: chatwootOrgId,
                    organization_name: context.organizationName || context.organization?.name || undefined
                } : {})
            }
        };

        let created;
        try {
            created = await this.request('post', `/api/v1/accounts/${cw.accountId}/contacts`, payload);
        } catch (createErr) {
            const errMsg = createErr.response?.data?.message || createErr.message || '';
            if (/email has already been taken/i.test(errMsg) || createErr.response?.status === 422) {
                logger.warn(`[chatwoot] contact creation duplicate email conflict for ${target.email}: ${errMsg}. Retrying without email.`);
                const retryPayload = { ...payload };
                delete retryPayload.email;
                try {
                    created = await this.request('post', `/api/v1/accounts/${cw.accountId}/contacts`, retryPayload);
                } catch (retryErr) {
                    if (target.email) {
                        try {
                            const emailSearch = await this.request('get', `/api/v1/accounts/${cw.accountId}/contacts/search`, undefined, { q: target.email });
                            const emailContacts = emailSearch?.payload || emailSearch?.data || emailSearch || [];
                            if (Array.isArray(emailContacts) && emailContacts.length > 0) {
                                return emailContacts[0];
                            }
                        } catch (_) {}
                    }
                    throw retryErr;
                }
            } else {
                throw createErr;
            }
        }
        const contact = created?.payload?.contact || created?.payload || created;
        if (contact && !contact.custom_attributes) {
            contact.custom_attributes = payload.custom_attributes;
        }
        if (contact && chatwootOrgId && !contact.organization_id) {
            contact.organization_id = Number(chatwootOrgId) || chatwootOrgId;
        }
        logger.info(`[chatwoot] contact created ${contact?.id || 'unknown'} ${maskPhone(target.phone)} role=${initialRole}`);
        return contact;
    }

    async findOrCreateConversation(contact, target, context = {}) {
        const cw = getChatwootConfig();
        const contactId = contact?.id || contact?.contact?.id;
        if (!contactId) throw new Error('Chatwoot contact id missing');

        const sourceId = `contact:${contactId}:whatsapp`;
        const inboxes = contact.contact_inboxes || contact.contactInboxes || [];
        const inbox = Array.isArray(inboxes)
            ? inboxes.find(item => String(item.inbox?.id || item.inbox_id) === String(cw.inboxId)) || inboxes[0]
            : null;

        let conversation = null;

        // 1. Fetch contact's conversations directly from Chatwoot API
        try {
            const result = await this.request('get', `/api/v1/accounts/${cw.accountId}/contacts/${contactId}/conversations`);
            const conversations = result?.payload || result?.data || result || [];
            if (Array.isArray(conversations) && conversations.length > 0) {
                // Find matching inbox conversation, prioritizing open threads or latest thread
                conversation = conversations.find(conv => String(conv.inbox_id || conv.inbox?.id) === String(cw.inboxId) && !['resolved', 'closed'].includes(conv.status)) ||
                    conversations.find(conv => String(conv.inbox_id || conv.inbox?.id) === String(cw.inboxId)) ||
                    conversations[0];
            }
        } catch (error) {
            logger.debug(`[chatwoot] conversation search failed ${maskPhone(target.phone)}: ${error.response?.status || error.message}`);
        }

        // 2. Check local database logs as secondary lookup
        if (!conversation?.id) {
            const existingLogConversation = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    provider: PROVIDER,
                    chatwootContactId: String(contactId),
                    chatwootInboxId: String(cw.inboxId),
                    chatwootConversationId: { not: null }
                },
                orderBy: { updatedAt: 'desc' },
                select: { chatwootConversationId: true }
            });
            if (existingLogConversation?.chatwootConversationId) {
                conversation = { id: existingLogConversation.chatwootConversationId };
            }
        }

        const currentRole = contact.custom_attributes?.role || contact.custom_attributes?.recipient_role || target.role;

        const activeAttributes = {
            shipment_tracking_number: context.trackingNumber,
            shipment_id: context.shipmentId,
            active_status: context.currentStatusRaw || context.currentStatus,
            cod_amount: context.codAmount || '0.000 KWD',
            carrier_code: context.carrierCode,
            recipient_role: currentRole
        };

        const labels = this.buildConversationLabels({
            role: currentRole,
            organization: context.organization,
            shipment: context,
            eventType: context.eventType,
            context
        });

        // 3. If existing conversation found, reopen if resolved and update active attributes
        if (conversation?.id) {
            logger.info(`[chatwoot] conversation reused ${conversation.id} ${maskPhone(target.phone)}`);

            // Reopen if resolved or closed or snoozed
            if (['resolved', 'closed', 'snoozed'].includes(conversation.status)) {
                try {
                    await this.request('post', `/api/v1/accounts/${cw.accountId}/conversations/${conversation.id}/toggle_status`, { status: 'open' });
                    conversation.status = 'open';
                    logger.info(`[chatwoot] reopened resolved conversation ${conversation.id}`);
                } catch (statusErr) {
                    logger.warn(`[chatwoot] failed to reopen conversation ${conversation.id}: ${statusErr.message}`);
                }
            }

            // Update active shipment custom attributes
            try {
                const res = await this.request('post', `/api/v1/accounts/${cw.accountId}/conversations/${conversation.id}/custom_attributes`, {
                    custom_attributes: activeAttributes
                });
                if (res?.payload?.custom_attributes || res?.custom_attributes) {
                    conversation.custom_attributes = res?.payload?.custom_attributes || res?.custom_attributes;
                } else {
                    conversation.custom_attributes = { ...conversation.custom_attributes, ...activeAttributes };
                }
            } catch (attrErr) {
                logger.warn(`[chatwoot] failed to update conversation attributes ${conversation.id}: ${attrErr.message}`);
                conversation.custom_attributes = { ...conversation.custom_attributes, ...activeAttributes };
            }

            // Apply labels
            const labelRes = await this.applyConversationLabels(conversation.id, labels);
            if (labelRes?.payload) {
                conversation.labels = labelRes.payload;
            } else if (labelRes?.labels) {
                conversation.labels = labelRes.labels;
            } else {
                conversation.labels = Array.from(new Set([...(conversation.labels || []), ...labels]));
            }

            return conversation;
        }

        // 4. Create new conversation
        const payload = compactObject({
            source_id: inbox?.source_id || sourceId,
            inbox_id: Number(cw.inboxId),
            contact_id: Number(contactId),
            status: 'open',
            custom_attributes: activeAttributes
        });

        const created = await this.request('post', `/api/v1/accounts/${cw.accountId}/conversations`, payload);
        conversation = created?.payload || created;
        logger.info(`[chatwoot] conversation created ${conversation?.id || 'unknown'} ${maskPhone(target.phone)}`);

        // Apply labels to newly created conversation
        if (conversation?.id) {
            const labelRes = await this.applyConversationLabels(conversation.id, labels);
            if (labelRes?.payload) {
                conversation.labels = labelRes.payload;
            } else if (labelRes?.labels) {
                conversation.labels = labelRes.labels;
            } else {
                conversation.labels = labels;
            }
        }

        return conversation;
    }

    async checkCustomer24hWindow(conversationId, options = {}) {
        const cw = getChatwootConfig();
        const now = options.now instanceof Date ? options.now : (options.now ? new Date(options.now) : new Date());
        let messages = options.messages || null;

        if (!messages && conversationId) {
            try {
                const res = await this.request('get', `/api/v1/accounts/${cw.accountId}/conversations/${conversationId}/messages`);
                messages = res?.payload || res?.data || res || [];
            } catch (err) {
                logger.warn(`[chatwoot 24h window] Failed to fetch messages for conversation ${conversationId}: ${err.message}`);
                messages = [];
            }
        }

        if (!Array.isArray(messages) || messages.length === 0) {
            return {
                inside24hWindow: false,
                lastIncomingMessage: null,
                lastIncomingTimestamp: null,
                expiresAt: null,
                remainingSeconds: 0,
                reason: 'NO_INCOMING_MESSAGES'
            };
        }

        // Filter for incoming customer messages: message_type === 0 or 'incoming'
        const incomingMessages = messages.filter(m => m.message_type === 0 || m.message_type === 'incoming');

        if (incomingMessages.length === 0) {
            return {
                inside24hWindow: false,
                lastIncomingMessage: null,
                lastIncomingTimestamp: null,
                expiresAt: null,
                remainingSeconds: 0,
                reason: 'NO_INCOMING_MESSAGES'
            };
        }

        // Find latest incoming message
        const getTime = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') {
                return val < 1e12 ? val * 1000 : val;
            }
            return new Date(val).getTime();
        };

        const sorted = incomingMessages.slice().sort((a, b) => getTime(b.created_at) - getTime(a.created_at));
        const latest = sorted[0];
        const latestTime = getTime(latest.created_at);
        const elapsedMs = now.getTime() - latestTime;
        const windowMs = 24 * 60 * 60 * 1000;
        const CLOCK_DRIFT_TOLERANCE_MS = 5000; const inside24hWindow = elapsedMs >= -CLOCK_DRIFT_TOLERANCE_MS && elapsedMs <= windowMs;
        const expiresAt = new Date(latestTime + windowMs);
        const remainingSeconds = inside24hWindow
            ? Math.max(0, Math.min(86400, Math.round((windowMs - elapsedMs) / 1000)))
            : 0;

        return {
            inside24hWindow,
            lastIncomingMessage: latest,
            lastIncomingTimestamp: new Date(latestTime),
            expiresAt,
            remainingSeconds,
            reason: inside24hWindow ? 'INSIDE_WINDOW' : 'OUTSIDE_24H_WINDOW'
        };
    }

    async sendMessage(conversationId, payload, options = {}) {
        const cw = getChatwootConfig();
        const hasTemplateName = Boolean(payload?.template_params?.name || payload?.templateName);
        const isTemplateOption = options.isTemplate === true || options.isTemplate === 'true';
        const isTemplate = hasTemplateName || isTemplateOption;

        // Enforce 24-hour window for free-text messages
        if (!isTemplate && !options.skipWindowCheck) {
            const windowStatus = await this.checkCustomer24hWindow(conversationId, options);
            if (!windowStatus.inside24hWindow) {
                const err = new Error('Free-text messages are prohibited outside the 24-hour customer service window. An approved Meta template is required.');
                err.code = 'OUTSIDE_24H_WINDOW';
                err.status = 400;
                err.windowStatus = windowStatus;
                throw err;
            }
        }

        // Support per-agent token override
        let headers = undefined;
        if (options.userAccessToken) {
            headers = { api_access_token: options.userAccessToken };
        }

        const client = this.getClient();
        const response = await client.request({
            method: 'post',
            url: `/api/v1/accounts/${cw.accountId}/conversations/${conversationId}/messages`,
            data: payload,
            headers
        });

        logger.info(`[chatwoot] message submitted conversation=${conversationId}`);
        return response.data;
    }

    async dispatchSingleNotification({
        shipment,
        eventType,
        recipientRole,
        recipientPhone,
        recipientName,
        templateName,
        customMessage,
        buttonUrlParam,
        logId
    }) {
        const context = buildShipmentNotificationContext(shipment);
        const target = {
            role: recipientRole || 'receiver',
            phone: recipientPhone,
            name: recipientName
        };

        const chosenTemplate = templateName || CANONICAL_EVENT_TEMPLATES[eventType] || 'target_shipment_delivered';
        const contact = await this.findOrCreateContact(target, context);
        const conversation = await this.findOrCreateConversation(contact, target, context);

        const { payload } = buildMessagePayload(eventType, context, target, chosenTemplate);

        let effectivePayload = payload;
        if (!effectivePayload) {
            effectivePayload = {
                message_type: 'outgoing',
                private: false,
                content: buildPlainContent(eventType, context, target),
                template_params: {
                    name: chosenTemplate,
                    category: chosenTemplate === 'otptargetlogin' ? 'AUTHENTICATION' : 'UTILITY',
                    language: getTemplateLanguage(chosenTemplate),
                    processed_params: formatProcessedParams(buildTemplateParameters(context, target)),
                    parameters: buildTemplateParameters(context, target)
                }
            };
        }

        // Attach button parameters if dynamic URL button (e.g. locationToken)
        if (buttonUrlParam && effectivePayload?.template_params) {
            effectivePayload.template_params.button_params = [{ type: 'url', index: '0', parameter: buttonUrlParam }];
        }

        const messageResponse = await this.sendMessage(conversation.id, effectivePayload, { isTemplate: true });

        if (logId) {
            await prisma.shipmentNotificationLog.update({
                where: { id: logId },
                data: {
                    status: 'SENT',
                    provider: 'chatwoot',
                    isFallback: false,
                    fallbackReason: null,
                    chatwootAccountId: String(getChatwootConfig().accountId || '1'),
                    chatwootInboxId: String(getChatwootConfig().inboxId || ''),
                    chatwootContactId: contact?.id ? String(contact.id) : null,
                    chatwootConversationId: conversation?.id ? String(conversation.id) : null,
                    chatwootMessageId: messageResponse?.id ? String(messageResponse.id) : null,
                    templateName: chosenTemplate,
                    payloadJson: effectivePayload,
                    responseJson: messageResponse,
                    sentAt: new Date()
                }
            });
        }

        return {
            messageId: messageResponse?.id ? String(messageResponse.id) : `cw_${Date.now()}`,
            contact,
            conversation,
            response: messageResponse
        };
    }

    async sendDirectOtp({ phone, name, otp }) {
        if (!this.isConfigured() || !phone) return null;
        try {
            const normalizedTargetPhone = normalizePhone(phone);
            const target = { role: 'auth', name: name || 'User', phone: normalizedTargetPhone };
            const contact = await this.findOrCreateContact(target, { trackingNumber: 'AUTH-OTP' });
            const conversation = await this.findOrCreateConversation(contact, target, { trackingNumber: 'AUTH-OTP' });
            const messagePayload = {
                message_type: 'outgoing',
                private: false,
                content: `Your Target Logistics login verification code is: ${otp}\nValid for 5 minutes.`
            };
            return await this.sendMessage(conversation.id, messagePayload);
        } catch (err) {
            logger.warn(`[chatwoot] OTP dispatch failed: ${err.message}`);
            return null;
        }
    }

    buildShipmentNotificationPreview(eventType, shipment, recipientRole = null) {
        const context = buildShipmentNotificationContext(shipment);
        let targets = getNotificationTargets(eventType, shipment);

        if (recipientRole) {
            const target = getPersonFromShipment(shipment, recipientRole);
            targets = target.phone ? [target] : [];
        }

        return targets.map((target) => {
            const { payload, templateName } = buildMessagePayload(eventType, context, target);
            return {
                eventType,
                recipientRole: target.role,
                recipientName: target.name || null,
                recipientPhone: maskPhone(target.phone),
                templateName,
                content: payload?.content || null,
                templateParams: payload?.template_params || null,
                canSend: Boolean(payload && target.phone),
                fallbackAllowed: getChatwootConfig().allowPlainTextFallback
            };
        });
    }

    async sendShipmentNotification(eventType, shipment, options = {}) {
        const whatsAppConfigService = require('./whatsAppConfig.service');
        const { getSystemSettings } = require('./systemSettings.service');
        const dbConfig = await whatsAppConfigService.getConfig({ internal: true }).catch(() => null);
        const systemSettings = dbConfig || getSystemSettings()?.whatsapp || {};
        const activeProvider = systemSettings.provider || 'CHATWOOT';
        const targets = getNotificationTargets(eventType, shipment);

        // When provider is SHIPMENT_WHATSAPP, META, or MOCK, route directly to WhatsApp integration
        if (activeProvider === 'SHIPMENT_WHATSAPP' || activeProvider === 'TARGET_MSG' || activeProvider === 'META' || activeProvider === 'MOCK') {
            const whatsappIntegration = require('./whatsappIntegration.service');
            const results = [];
            for (const target of targets) {
                try {
                    const res = await whatsappIntegration.sendNotification({
                        shipment,
                        recipientRole: target.role,
                        recipientPhone: target.phone,
                        recipientCountryCode: target.countryCode,
                        recipientName: target.name,
                        eventType,
                        templateName: options.templateName,
                        force: Boolean(options.force)
                    });
                    results.push({ target: target.role, status: res.status || 'submitted', externalMessageId: res.externalMessageId });
                } catch (err) {
                    logger.error(`[WhatsApp ${activeProvider}] dispatch error: ${err.message}`);
                    results.push({ target: target.role, status: 'failed', error: err.message });
                }
            }
            return { skipped: false, provider: activeProvider, results };
        }

        const cw = getChatwootConfig();
        const context = buildShipmentNotificationContext(shipment);

        if (!cw.enabled) {
            logger.info('[chatwoot] skipped disabled');
            await Promise.all(targets.map(target => this.createLog({
                shipment,
                eventType,
                target,
                status: 'skipped',
                errorMessage: 'Chatwoot disabled',
                force: options.force
            }).catch(error => logger.warn(`[chatwoot] failed to log disabled skip: ${error.message}`))));
            return { skipped: true, reason: 'disabled' };
        }

        if (!this.isConfigured()) {
            logger.warn('[chatwoot] skipped disabled or incomplete configuration');
            await Promise.all(targets.map(target => this.createLog({
                shipment,
                eventType,
                target,
                status: 'skipped',
                errorMessage: 'Chatwoot configuration incomplete',
                force: options.force
            }).catch(error => logger.warn(`[chatwoot] failed to log config skip: ${error.message}`))));
            return { skipped: true, reason: 'not_configured' };
        }

        const results = [];
        for (const target of targets) {
            const log = await this.createLog({ shipment, eventType, target, force: options.force });
            if (!log) {
                results.push({ target: target.role, status: 'skipped', reason: 'duplicate' });
                continue;
            }

            const { payload, templateName } = buildMessagePayload(eventType, context, target);
            if (!payload) {
                logger.info(`[chatwoot] skipped disabled plain fallback ${eventType} ${target.role}`);
                await this.updateLog(log.id, {
                    status: 'skipped',
                    templateName,
                    payloadJson: { reason: 'template_missing_plain_fallback_disabled' },
                    errorMessage: 'Template config missing and plain-text fallback disabled'
                });
                results.push({ target: target.role, status: 'skipped', reason: 'template_missing' });
                continue;
            }

            try {
                const contact = await this.findOrCreateContact(target, context);
                const conversation = await this.findOrCreateConversation(contact, target, context);
                const messageResponse = await this.sendMessage(conversation.id, payload);

                await this.updateLog(log.id, {
                    status: 'submitted',
                    chatwootContactId: contact?.id ? String(contact.id) : null,
                    chatwootConversationId: conversation?.id ? String(conversation.id) : null,
                    chatwootMessageId: messageResponse?.id ? String(messageResponse.id) : null,
                    templateName,
                    payloadJson: payload,
                    responseJson: {
                        contact,
                        conversation,
                        message: messageResponse
                    },
                    sentAt: new Date(),
                    errorMessage: null
                });
                results.push({ target: target.role, status: 'submitted' });
            } catch (error) {
                const response = error.response?.data;
                const message = response?.message || response?.error || error.message;
                logger.error(`[chatwoot] message failed ${eventType} ${shipment.trackingNumber} ${target.role} ${maskPhone(target.phone)}: ${message}`);
                await this.updateLog(log.id, {
                    status: 'failed',
                    templateName,
                    payloadJson: payload,
                    responseJson: response || { message },
                    errorMessage: message
                }).catch(updateError => logger.error(`[chatwoot] failed to update notification log: ${updateError.message}`));
                results.push({ target: target.role, status: 'failed', error: message });
            }
        }

        return { skipped: false, results };
    }

    /**
     * Processes a queued notification from the durable job queue
     */
    async processQueuedNotification(payload) {
        const { eventType, shipmentId, trackingNumber, shipment: directShipment, options = {} } = payload;
        let shipment = null;
        if (shipmentId || trackingNumber) {
            shipment = await prisma.shipment.findUnique({
                where: shipmentId ? { id: shipmentId } : { trackingNumber },
                include: { user: true, organization: true }
            });
        }
        if (!shipment) {
            shipment = directShipment;
        }
        if (!shipment) {
            logger.warn(`[chatwoot] Shipment not found for queued notification (${shipmentId || trackingNumber})`);
            return { skipped: true, reason: 'shipment_not_found' };
        }
        return await this.sendShipmentNotification(eventType, shipment, options);
    }

    /**
     * Enqueues and triggers an operational WhatsApp notification immediately
     */
    triggerShipmentNotification(eventType, shipment, options = {}) {
        // Immediate dispatch in next tick for real-time customer messaging
        setImmediate(async () => {
            try {
                await this.sendShipmentNotification(eventType, shipment, options);
            } catch (err) {
                logger.error(`[chatwoot] Immediate notification failed for ${shipment?.trackingNumber}: ${err.message}`);
                // Fallback to durable queue on failure
                try {
                    const jobQueue = require('./queue/jobQueue');
                    await jobQueue.enqueue('chatwoot_notify', {
                        eventType,
                        shipmentId: shipment?.id,
                        trackingNumber: shipment?.trackingNumber,
                        options
                    }, { maxRetries: 3, backoffMs: 10000 });
                } catch (qErr) {
                    logger.error(`[chatwoot] Failed to enqueue fallback: ${qErr.message}`);
                }
            }
        });
    }
}

const service = new ChatwootNotificationService();
service.CANONICAL_EVENT_TEMPLATES = CANONICAL_EVENT_TEMPLATES;
service.APPROVED_META_TEMPLATES = APPROVED_META_TEMPLATES;
service.checkCustomer24hWindow = service.checkCustomer24hWindow.bind(service);
service.dispatchSingleNotification = service.dispatchSingleNotification.bind(service);

module.exports = service;
module.exports.CANONICAL_EVENT_TEMPLATES = CANONICAL_EVENT_TEMPLATES;
module.exports.APPROVED_META_TEMPLATES = APPROVED_META_TEMPLATES;
module.exports.buildShipmentNotificationContext = buildShipmentNotificationContext;
module.exports.buildPlainContent = buildPlainContent;
module.exports.buildMessagePayload = buildMessagePayload;
module.exports.getNotificationTargets = getNotificationTargets;
module.exports.mapStatusToNotificationEvent = mapStatusToNotificationEvent;
module.exports.maskPhone = maskPhone;
module.exports.normalizePhone = normalizePhone;
module.exports.resolveUpgradedRole = resolveUpgradedRole;
module.exports.slugify = slugify;


