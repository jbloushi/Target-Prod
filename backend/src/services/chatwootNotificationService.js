const axios = require('axios');
const { prisma } = require('../config/database');
const config = require('../config/config');
const logger = require('../utils/logger');
const { STATUS_LABELS } = require('../constants/statusConstants');

const PROVIDER = 'chatwoot';

const EVENT_TARGETS = {
    shipment_created: ['sender', 'receiver'],
    on_hold_customs_issue: ['sender', 'receiver'],
    documents_needed: ['sender', 'receiver'],
    delivery_attempt: ['receiver'],
    out_for_delivery: ['receiver']
};

const DEFAULT_EVENT_CONTENT = {
    shipment_created: 'Shipment Created',
    on_hold_customs_issue: 'On Hold / Customs Issue',
    documents_needed: 'Documents Needed',
    delivery_attempt: 'Delivery Attempt',
    out_for_delivery: 'Out for Delivery'
};

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

    if (normalizedStatus === 'out_for_delivery') return 'out_for_delivery';
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
        context.supportWhatsappLink || context.supportInstruction,
        target.name || ''
    ];
}

function buildPlainContent(eventType, context, target) {
    const statusLabel = DEFAULT_EVENT_CONTENT[eventType] || context.currentStatus || eventType;
    const routeLine = `${context.origin} \u2192 ${context.destination}`;
    const updatedAt = context.currentStatusDatetimeDisplay || formatDisplayDate(new Date(), true);
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

function buildMessagePayload(eventType, context, target) {
    const template = getTemplateConfig(eventType, target);
    const content = buildPlainContent(eventType, context, target);

    if (template?.name) {
        return {
            payload: compactObject({
                message_type: 'outgoing',
                private: false,
                content,
                template_params: {
                    name: template.name,
                    category: template.category,
                    language: template.language || 'en',
                    processed_params: template.processed_params || buildTemplateParameters(context, target),
                    parameters: template.parameters || buildTemplateParameters(context, target)
                }
            }),
            templateName: template.name
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

    getClient() {
        const cw = getChatwootConfig();
        if (!cw.baseUrl || !cw.apiAccessToken) return null;

        if (!this.client || this.client.defaults.baseURL !== cw.baseUrl) {
            this.client = axios.create({
                baseURL: cw.baseUrl,
                timeout: 15000,
                headers: {
                    api_access_token: cw.apiAccessToken,
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

    async request(method, path, body = undefined, query = undefined) {
        const client = this.getClient();
        const response = await client.request({ method, url: path, data: body, params: query });
        return response.data;
    }

    async findOrCreateContact(target, context) {
        const cw = getChatwootConfig();
        const query = target.phone;
        let found = null;

        try {
            const result = await this.request('get', `/api/v1/accounts/${cw.accountId}/contacts/search`, undefined, { q: query });
            const contacts = result?.payload || result?.data || result || [];
            found = Array.isArray(contacts)
                ? contacts.find(contact => normalizePhone(contact.phone_number || contact.phoneNumber) === target.phone) || contacts[0]
                : null;
        } catch (error) {
            logger.debug(`[chatwoot] contact search failed ${maskPhone(target.phone)}: ${error.response?.status || error.message}`);
        }

        if (found?.id) {
            logger.info(`[chatwoot] contact found ${found.id} ${maskPhone(target.phone)}`);
            return found;
        }

        const payload = {
            inbox_id: Number(cw.inboxId),
            name: target.name || target.phone,
            phone_number: target.phone,
            email: target.email || undefined,
            custom_attributes: {
                shipment_tracking_number: context.trackingNumber,
                shipment_id: context.shipmentId,
                recipient_role: target.role,
                carrier_code: context.carrierCode
            }
        };
        const created = await this.request('post', `/api/v1/accounts/${cw.accountId}/contacts`, payload);
        const contact = created?.payload?.contact || created?.payload || created;
        logger.info(`[chatwoot] contact created ${contact?.id || 'unknown'} ${maskPhone(target.phone)}`);
        return contact;
    }

    async findOrCreateConversation(contact, target, context) {
        const cw = getChatwootConfig();
        const contactId = contact?.id || contact?.contact?.id;
        if (!contactId) throw new Error('Chatwoot contact id missing');

        const sourceId = `contact:${contactId}:whatsapp`;
        const inboxes = contact.contact_inboxes || contact.contactInboxes || [];
        const inbox = Array.isArray(inboxes)
            ? inboxes.find(item => String(item.inbox?.id || item.inbox_id) === String(cw.inboxId)) || inboxes[0]
            : null;

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
            logger.info(`[chatwoot] conversation reused ${existingLogConversation.chatwootConversationId} ${maskPhone(target.phone)}`);
            return { id: existingLogConversation.chatwootConversationId };
        }

        try {
            const result = await this.request('get', `/api/v1/accounts/${cw.accountId}/contacts/${contactId}/conversations`);
            const conversations = result?.payload || result?.data || result || [];
            const found = Array.isArray(conversations)
                ? conversations.find(conv => String(conv.inbox_id || conv.inbox?.id) === String(cw.inboxId) && !['resolved', 'closed'].includes(conv.status)) ||
                    conversations.find(conv => String(conv.inbox_id || conv.inbox?.id) === String(cw.inboxId)) ||
                    conversations[0]
                : null;
            if (found?.id) {
                logger.info(`[chatwoot] conversation found ${found.id} ${maskPhone(target.phone)}`);
                return found;
            }
        } catch (error) {
            logger.debug(`[chatwoot] conversation search failed ${maskPhone(target.phone)}: ${error.response?.status || error.message}`);
        }

        const payload = compactObject({
            source_id: inbox?.source_id || sourceId,
            inbox_id: Number(cw.inboxId),
            contact_id: Number(contactId),
            status: 'open',
            custom_attributes: {
                shipment_tracking_number: context.trackingNumber,
                shipment_id: context.shipmentId,
                recipient_role: target.role,
                carrier_code: context.carrierCode
            }
        });

        const created = await this.request('post', `/api/v1/accounts/${cw.accountId}/conversations`, payload);
        const conversation = created?.payload || created;
        logger.info(`[chatwoot] conversation created ${conversation?.id || 'unknown'} ${maskPhone(target.phone)}`);
        return conversation;
    }

    async sendMessage(conversationId, payload) {
        const cw = getChatwootConfig();
        const response = await this.request('post', `/api/v1/accounts/${cw.accountId}/conversations/${conversationId}/messages`, payload);
        logger.info(`[chatwoot] message submitted conversation=${conversationId}`);
        return response;
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
        const cw = getChatwootConfig();
        const context = buildShipmentNotificationContext(shipment);
        const targets = getNotificationTargets(eventType, shipment);

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

    triggerShipmentNotification(eventType, shipment, options = {}) {
        this.sendShipmentNotification(eventType, shipment, options).catch(error => {
            logger.error(`[chatwoot] non-blocking notification failed: ${error.message}`);
        });
    }
}

const service = new ChatwootNotificationService();

module.exports = service;
module.exports.buildShipmentNotificationContext = buildShipmentNotificationContext;
module.exports.getNotificationTargets = getNotificationTargets;
module.exports.mapStatusToNotificationEvent = mapStatusToNotificationEvent;
module.exports.maskPhone = maskPhone;
module.exports.normalizePhone = normalizePhone;


