const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const DEFAULT_CONFIG = {
    provider: 'CHATWOOT',
    fallbackProvider: 'SHIPMENT_WHATSAPP',
    serviceUrl: 'https://msg.target-kw.com',
    apiKey: null,
    phoneId: null,
    chatwootBaseUrl: 'https://inbox.mawthook.io',
    chatwootAccountId: '1',
    chatwootInboxId: null,
    chatwootApiToken: null,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    quietHoursTimezone: 'Asia/Kuwait',
    allowDeliveryQuietHours: false
};

const DEFAULT_RULES = [
    { eventType: 'shipment_created', recipientRole: 'sender', templateName: 'target_shipment_created', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'pickup_scheduled', recipientRole: 'sender', templateName: 'target_pickup_scheduled', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'received_at_hub', recipientRole: 'sender', templateName: 'target_received_at_hub', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'verified_and_dispatched', recipientRole: 'sender', templateName: 'target_verified_dispatched', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'out_for_delivery', recipientRole: 'sender', templateName: 'target_shipment_out_for_delivery', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'delivery_attempt', recipientRole: 'sender', templateName: 'target_delivery_attempt', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'delivered', recipientRole: 'sender', templateName: 'target_shipment_delivered', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'on_hold_customs_issue', recipientRole: 'sender', templateName: 'target_customs_exception_hold', enabled: true, allowQuietHoursBypass: true },
    { eventType: 'documents_needed', recipientRole: 'sender', templateName: 'target_documents_needed', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'payment_link_ready', recipientRole: 'sender', templateName: 'payment_request_v1', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'payment_confirmed', recipientRole: 'sender', templateName: 'target_payment_confirmed', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'rto_in_transit', recipientRole: 'sender', templateName: 'target_rto_in_transit', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'returned', recipientRole: 'sender', templateName: 'target_shipment_returned', enabled: true, allowQuietHoursBypass: false }
];

function maskSecrets(config) {
    if (!config) return config;
    const copy = { ...config };
    if (copy.apiKey) {
        copy.apiKey = copy.apiKey.length > 8
            ? `${copy.apiKey.substring(0, 4)}••••${copy.apiKey.slice(-4)}`
            : '••••••••';
    }
    if (copy.phoneId) copy.phoneId = '••••••••';
    if (copy.accessToken) copy.accessToken = 'EAAB••••••••[redacted]';
    if (copy.metaAppSecret) copy.metaAppSecret = '••••••••';
    if (copy.chatwootApiToken) copy.chatwootApiToken = '••••••••';
    return copy;
}

function isMaskedValue(val) {
    if (typeof val !== 'string') return false;
    return val.includes('••••') || val.includes('[redacted]');
}

class WhatsAppConfigService {
    /**
     * Get the current WhatsApp configuration.
     * Initializes default record in DB if none exists.
     * Masks sensitive fields unless internal=true.
     *
     * @param {Object} options
     * @param {boolean} options.internal - If true, returns unmasked secrets for internal dispatch
     * @returns {Promise<Object>}
     */
    async getConfig(options = { internal: false }) {
        let config = await prisma.whatsAppConfig.findFirst({
            include: {
                rules: true
            }
        });

        if (!config) {
            config = await prisma.whatsAppConfig.create({
                data: DEFAULT_CONFIG
            });

            // Seed default rules
            for (const r of DEFAULT_RULES) {
                try {
                    await prisma.whatsAppEventRule.create({
                        data: {
                            configId: config.id,
                            eventType: r.eventType,
                            recipientRole: r.recipientRole,
                            templateName: r.templateName,
                            enabled: r.enabled,
                            allowQuietHoursBypass: r.allowQuietHoursBypass
                        }
                    });
                } catch (_) {}
            }

            config = await prisma.whatsAppConfig.findUnique({
                where: { id: config.id },
                include: { rules: true }
            });
        }

        if (options && options.internal === true) {
            return config;
        }

        return maskSecrets(config);
    }

    /**
     * Update WhatsApp configuration.
     * Preserves existing secrets if incoming values are omitted, masked, or null.
     *
     * @param {Object} updates
     * @returns {Promise<Object>} Updated configuration (masked)
     */
    async updateConfig(updates = {}) {
        const current = await this.getConfig({ internal: true });

        const allowedFields = [
            'provider',
            'serviceUrl',
            'apiKey',
            'phoneId',
            'chatwootBaseUrl',
            'chatwootAccountId',
            'chatwootInboxId',
            'chatwootApiToken',
            'quietHoursEnabled',
            'quietHoursStart',
            'quietHoursEnd',
            'quietHoursTimezone',
            'allowDeliveryQuietHours'
        ];

        const data = {};

        for (const field of allowedFields) {
            if (updates[field] === undefined) continue;

            const val = updates[field];

            // Secret preservation check
            if (['apiKey', 'phoneId', 'chatwootApiToken'].includes(field)) {
                if (isMaskedValue(val) || val === '' || val === null) {
                    continue; // Preserve existing
                }
            }

            if (typeof val === 'boolean') {
                data[field] = Boolean(val);
            } else if (typeof val === 'string') {
                data[field] = val.trim();
            } else {
                data[field] = val;
            }
        }

        const updated = await prisma.whatsAppConfig.update({
            where: { id: current.id },
            data,
            include: { rules: true }
        });

        logger.info(`[WhatsAppConfig] Updated config ${updated.id} provider=${updated.provider}`);
        return maskSecrets(updated);
    }

    /**
     * Get all WhatsAppEventRule records.
     * @returns {Promise<Array>}
     */
    async getRules() {
        return await prisma.whatsAppEventRule.findMany({
            orderBy: [
                { eventType: 'asc' },
                { recipientRole: 'asc' }
            ]
        });
    }

    /**
     * Get a single WhatsAppEventRule for an event and recipient role.
     * @param {string} eventType
     * @param {string} recipientRole
     * @returns {Promise<Object|null>}
     */
    async getRule(eventType, recipientRole) {
        return await prisma.whatsAppEventRule.findFirst({
            where: {
                eventType,
                recipientRole
            }
        });
    }

    /**
     * Upsert rules by (configId, eventType, recipientRole).
     * @param {Array<Object>} rules
     * @returns {Promise<Array>}
     */
    async updateRules(rules = []) {
        const config = await this.getConfig({ internal: true });
        const configId = config.id;

        for (const rule of rules) {
            if (!rule.eventType || !rule.recipientRole) continue;

            const targetConfigId = rule.configId || configId;
            const eventType = String(rule.eventType).trim();
            const recipientRole = String(rule.recipientRole).trim();
            const templateName = rule.templateName ? String(rule.templateName).trim() : 'target_shipment_delivered';
            const enabled = rule.enabled !== undefined ? Boolean(rule.enabled) : true;
            const allowQuietHoursBypass = Boolean(rule.allowQuietHoursBypass);

            await prisma.whatsAppEventRule.upsert({
                where: {
                    configId_eventType_recipientRole: {
                        configId: targetConfigId,
                        eventType,
                        recipientRole
                    }
                },
                create: {
                    configId: targetConfigId,
                    eventType,
                    recipientRole,
                    templateName,
                    enabled,
                    allowQuietHoursBypass
                },
                update: {
                    ...(rule.templateName ? { templateName } : {}),
                    ...(rule.enabled !== undefined ? { enabled } : {}),
                    ...(rule.allowQuietHoursBypass !== undefined ? { allowQuietHoursBypass } : {})
                }
            });
        }

        return await this.getRules();
    }

    /**
     * Checks whether an event rule is enabled for a given role.
     * Defaults to true if no rule is found.
     *
     * @param {string} eventType
     * @param {string} recipientRole
     * @returns {Promise<boolean>}
     */
    async isEventEnabled(eventType, recipientRole) {
        try {
            const rule = await prisma.whatsAppEventRule.findFirst({
                where: {
                    eventType,
                    recipientRole
                }
            });
            if (rule) {
                return Boolean(rule.enabled);
            }
            // Auto notifications are limited to shipper/sender; consignee/receiver is disabled by default
            if (recipientRole === 'receiver' || recipientRole === 'consignee' || recipientRole === 'customer') {
                return false;
            }
            return true;
        } catch (err) {
            logger.warn(`[WhatsAppConfig] isEventEnabled lookup error: ${err.message}`);
            return true;
        }
    }

    /**
     * Evaluates whether current time is within the configured quiet-hours window
     * (quietHoursStart to quietHoursEnd, default 22:00 - 08:00) in quietHoursTimezone
     * (default Asia/Kuwait / UTC+3). Accurately handles midnight-crossing windows.
     *
     * @param {Date} [now=new Date()]
     * @param {Object} [configOverride=null]
     * @returns {Promise<boolean>|boolean}
     */
    isQuietHours(now = new Date(), configOverride = null) {
        if (configOverride) {
            return this._computeQuietHours(configOverride, now);
        }

        // Return promise if fetching config from DB
        return this.getConfig({ internal: true }).then(config => {
            return this._computeQuietHours(config, now);
        }).catch(err => {
            logger.warn(`[WhatsAppConfig] isQuietHours error: ${err.message}`);
            return false;
        });
    }

    /**
     * Synchronous computation helper for quiet hours
     * @param {Object} config
     * @param {Date} now
     * @returns {boolean}
     */
    _computeQuietHours(config, now = new Date()) {
        if (!config || !config.quietHoursEnabled) return false;

        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: config.quietHoursTimezone || 'Asia/Kuwait',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
        const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
        const currentMins = hour * 60 + minute;

        const [startH, startM] = (config.quietHoursStart || '22:00').split(':').map(Number);
        const [endH, endM] = (config.quietHoursEnd || '08:00').split(':').map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        if (startMins > endMins) {
            return currentMins >= startMins || currentMins < endMins;
        }
        return currentMins >= startMins && currentMins < endMins;
    }

    maskSecrets(config) {
        return maskSecrets(config);
    }
}

module.exports = new WhatsAppConfigService();
