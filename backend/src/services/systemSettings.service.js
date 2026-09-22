const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const SETTINGS_FILE_PATH = path.resolve(process.cwd(), 'data', 'system_settings.json');

const DEFAULT_SETTINGS = {
    carrierBranding: {
        INTERNAL: {
            name: 'Target Local Fleet',
            description: 'Same-day and next-day local courier delivery within Kuwait',
            badge: 'Local Fleet',
            active: true
        },
        DGR: {
            name: 'Target International Air (DHL DGR)',
            description: 'Worldwide express air freight with dangerous goods certification',
            badge: 'Global Air',
            active: true
        },
        OTE: {
            name: 'Target GCC Express (OTE)',
            description: 'Cross-border road & express distribution across GCC states',
            badge: 'GCC Express',
            active: true
        },
        ARAMEX: {
            name: 'Target Regional Express (Aramex)',
            description: 'Middle East regional parcels and express courier',
            badge: 'Regional',
            active: true
        }
    },
    weightDiscrepancy: {
        policy: 'auto_bill', // 'auto_bill' | 'require_approval'
        thresholdPercent: 10,
        notifyMerchantOnDiscrepancy: true
    },
    carrierEnvironments: {
        DHL: 'test', // 'test' | 'production'
        OTE: 'test'  // 'test' | 'production'
    },
    whatsapp: {
        enabled: true,
        provider: 'SHIPMENT_WHATSAPP', // 'SHIPMENT_WHATSAPP' | 'META' | 'CHATWOOT' | 'MOCK'
        serviceUrl: process.env.WHATSAPP_SERVICE_URL || 'https://msg.target-kw.com',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '109823471928374',
        businessAccountId: process.env.WHATSAPP_WABA_ID || '209384019283741',
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'target_logistics_meta_verify_secret_2026',
        metaAppId: process.env.WHATSAPP_META_APP_ID || '',
        metaAppSecret: process.env.WHATSAPP_META_APP_SECRET || ''
    }
};

function ensureDataDir() {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getSystemSettings() {
    try {
        ensureDataDir();
        if (!fs.existsSync(SETTINGS_FILE_PATH)) {
            fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
            return DEFAULT_SETTINGS;
        }
        const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8');
        const parsed = JSON.parse(data);
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            carrierBranding: {
                ...DEFAULT_SETTINGS.carrierBranding,
                ...(parsed.carrierBranding || {})
            },
            weightDiscrepancy: {
                ...DEFAULT_SETTINGS.weightDiscrepancy,
                ...(parsed.weightDiscrepancy || {})
            },
            carrierEnvironments: {
                ...DEFAULT_SETTINGS.carrierEnvironments,
                ...(parsed.carrierEnvironments || {})
            },
            whatsapp: {
                ...DEFAULT_SETTINGS.whatsapp,
                ...(parsed.whatsapp || {})
            }
        };
    } catch (err) {
        logger.error('Error reading system settings file, using defaults:', err);
        return DEFAULT_SETTINGS;
    }
}

function updateSystemSettings(updates) {
    try {
        ensureDataDir();
        const current = getSystemSettings();
        const next = {
            ...current,
            ...updates,
            carrierBranding: {
                ...current.carrierBranding,
                ...(updates.carrierBranding || {})
            },
            weightDiscrepancy: {
                ...current.weightDiscrepancy,
                ...(updates.weightDiscrepancy || {})
            },
            carrierEnvironments: {
                ...current.carrierEnvironments,
                ...(updates.carrierEnvironments || {})
            },
            whatsapp: {
                ...current.whatsapp,
                ...(updates.whatsapp || {})
            }
        };
        fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(next, null, 2), 'utf8');
        logger.info('System settings successfully updated');
        return next;
    } catch (err) {
        logger.error('Error saving system settings file:', err);
        throw err;
    }
}

module.exports = {
    DEFAULT_SETTINGS,
    getSystemSettings,
    updateSystemSettings
};
