/**
 * Feature Gate Middleware
 * Protects platform features by checking global system settings and role entitlements.
 */
const { getSystemSettings } = require('../services/systemSettings.service');
const logger = require('../utils/logger');

const INTERNAL_ROLES = ['admin', 'manager', 'staff', 'driver', 'accounting'];

/**
 * Require a feature to be active in System Settings.
 * Supports paywall gating for non-internal roles.
 * @param {'fleet' | 'phenixSync' | 'whatsapp' | 'ottu'} featureKey
 */
const requireFeature = (featureKey) => {
    return (req, res, next) => {
        try {
            const settings = getSystemSettings();
            const featureConfig = settings[featureKey];

            if (!featureConfig || featureConfig.enabled === false) {
                logger.warn(`Feature access denied: ${featureKey} is disabled globally`);
                return res.status(403).json({
                    success: false,
                    error: `The ${featureKey} module is currently disabled.`,
                    code: 'FEATURE_DISABLED',
                    feature: featureKey
                });
            }

            // Paywall / Internal-only check
            const isInternal = req.user && INTERNAL_ROLES.includes(req.user.role);
            if (featureConfig.mode === 'internal_only' && !isInternal) {
                logger.warn(`Feature paywalled: user=${req.user?.id} role=${req.user?.role} feature=${featureKey}`);
                return res.status(403).json({
                    success: false,
                    error: 'Fleet Operations is an internal logistics feature. Upgrade to Fleet Pro for standalone merchant dispatch.',
                    code: 'FEATURE_PAYWALLED',
                    feature: featureKey,
                    upgradeUrl: '/billing/upgrade?feature=fleet'
                });
            }

            if (featureConfig.paywallActive && !isInternal) {
                return res.status(403).json({
                    success: false,
                    error: 'This feature requires an active Fleet Pro subscription.',
                    code: 'FEATURE_PAYWALLED',
                    feature: featureKey,
                    upgradeUrl: '/billing/upgrade?feature=fleet'
                });
            }

            next();
        } catch (err) {
            logger.error(`Error in featureGate middleware for ${featureKey}:`, err);
            next();
        }
    };
};

module.exports = {
    requireFeature
};
