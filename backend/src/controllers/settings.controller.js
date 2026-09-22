const { getSystemSettings, updateSystemSettings } = require('../services/systemSettings.service');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

/**
 * GET /api/settings/system
 * Retrieve public/general system settings (including carrier branding)
 */
exports.getSystemSettings = async (req, res) => {
    try {
        const rawSettings = getSystemSettings();
        let role = req.user?.role;
        if (!role && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const u = await prisma.user.findUnique({ where: { id: decoded.id }, select: { role: true } });
                role = u?.role;
            } catch (_) {}
        }
        const isSuperAdmin = role === 'admin' || role === 'manager';

        const sanitized = {
            carrierBranding: rawSettings.carrierBranding,
            weightDiscrepancy: rawSettings.weightDiscrepancy,
            carrierEnvironments: isSuperAdmin ? rawSettings.carrierEnvironments : undefined,
            whatsapp: {
                enabled: rawSettings.whatsapp?.enabled || false,
                provider: rawSettings.whatsapp?.provider || 'META'
            }
        };

        if (isSuperAdmin) {
            sanitized.whatsapp.phoneNumberId = rawSettings.whatsapp?.phoneNumberId;
            sanitized.whatsapp.businessAccountId = rawSettings.whatsapp?.businessAccountId;
            sanitized.whatsapp.hasAccessToken = Boolean(rawSettings.whatsapp?.accessToken);
            sanitized.whatsapp.hasAppSecret = Boolean(rawSettings.whatsapp?.metaAppSecret);
        }

        res.status(200).json({
            success: true,
            data: sanitized
        });
    } catch (err) {
        return handleControllerError(res, err, 'Get system settings');
    }
};

/**
 * PATCH /api/settings/system
 * Update system settings (Superadmin only)
 */
exports.updateSystemSettings = async (req, res) => {
    try {
        const updates = req.body;
        const updated = updateSystemSettings(updates);
        res.status(200).json({
            success: true,
            data: updated,
            message: 'System settings updated successfully'
        });
    } catch (err) {
        return handleControllerError(res, err, 'Update system settings');
    }
};

/**
 * POST /api/settings/system/test-carrier
 * Test carrier API connection (Superadmin & Staff only)
 */
exports.testCarrierConnection = async (req, res) => {
    const { carrierCode = 'DGR', environment: reqEnv } = req.body;
    const startTime = Date.now();
    try {
        const settings = getSystemSettings();
        const activeEnv = reqEnv || ((carrierCode === 'OTE' || carrierCode === 'LOGESTECHS')
            ? (settings.carrierEnvironments?.OTE || 'test')
            : (settings.carrierEnvironments?.DHL || 'test'));

        const CarrierFactory = require('../services/CarrierFactory');
        const isTest = activeEnv === 'test';
        const adapter = CarrierFactory.getAdapter(carrierCode, { isTest, environment: activeEnv });

        let pingResult = { success: true, message: 'Connection healthy' };

        if (carrierCode === 'DGR' || carrierCode === 'DHL') {
            // Ping DHL rates
            const d = new Date();
            d.setDate(d.getDate() + 2);
            const plannedDate = `${d.toISOString().split('T')[0]}T10:00:00GMT+03:00`;
            const quotes = await adapter.getRates({
                sender: { postalCode: '00000', cityName: 'KUWAIT', countryCode: 'KW', streetLines: ['Shuwaikh'] },
                receiver: { postalCode: '00000', cityName: 'Dubai', countryCode: 'AE', streetLines: ['Business Bay'] },
                parcels: [{ weight: 1, length: 10, width: 10, height: 10 }],
                plannedShippingDateAndTime: plannedDate,
                currency: 'KWD'
            });
            pingResult = {
                success: true,
                message: `DHL connected successfully (${quotes.length} service options retrieved)`,
                sampleServices: quotes.map(q => q.serviceName || q.serviceCode)
            };
        } else if (carrierCode === 'OTE' || carrierCode === 'LOGESTECHS') {
            pingResult = {
                success: true,
                message: 'OTE / LogesTechs client ready'
            };
        }

        const latencyMs = Date.now() - startTime;
        res.status(200).json({
            success: true,
            carrierCode,
            environment: activeEnv,
            latencyMs,
            ...pingResult
        });
    } catch (err) {
        const latencyMs = Date.now() - startTime;
        logger.error(`Carrier ${carrierCode} test connection failed:`, err.message);
        res.status(200).json({
            success: false,
            carrierCode,
            latencyMs,
            error: err.message || 'Carrier connection test failed'
        });
    }
};
