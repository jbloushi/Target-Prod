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
        const isSuperAdmin = role === 'admin';

        const sanitized = {
            carrierBranding: rawSettings.carrierBranding,
            weightDiscrepancy: rawSettings.weightDiscrepancy,
            carrierEnvironments: isSuperAdmin ? rawSettings.carrierEnvironments : undefined,
            whatsapp: {
                enabled: rawSettings.whatsapp?.enabled || false,
                provider: rawSettings.whatsapp?.provider || 'META'
            },
            fleet: isSuperAdmin ? (rawSettings.fleet || {
                enabled: true,
                mode: 'internal_only',
                paywallActive: false,
                requirePhotoPod: true,
                requireSignaturePod: true,
                autoAssignZone: true,
                codAutoReconciliation: true
            }) : undefined
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

/**
 * GET /api/settings/rate-cards
 * Retrieve available carrier contract rate cards
 */
exports.getRateCards = async (req, res) => {
    try {
        const RateCardService = require('../services/RateCardService');
        const carrierCode = req.query.carrierCode;
        const cards = RateCardService.listRateCards(carrierCode);
        return res.status(200).json({ success: true, data: cards });
    } catch (err) {
        return handleControllerError(res, err, 'Get rate cards');
    }
};

/**
 * GET /api/settings/rate-cards/sample-template
 * Download ready-to-use sample .xlsx template for rate cards
 */
exports.downloadSampleTemplate = async (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
        const templatePath = path.join(__dirname, '../constants/rateCards/templates/rate_card_template_sample.xlsx');
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ success: false, error: 'Sample template file not found' });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="target_rate_card_sample_template.xlsx"');
        const fileStream = fs.createReadStream(templatePath);
        fileStream.pipe(res);
    } catch (err) {
        return handleControllerError(res, err, 'Download sample template');
    }
};

/**
 * GET /api/settings/rate-cards/:id
 * Retrieve full rate card matrix and details
 */
exports.getRateCardDetails = async (req, res) => {
    try {
        const RateCardService = require('../services/RateCardService');
        const card = RateCardService.getRateCard(req.params.id);
        if (!card) {
            return res.status(404).json({ success: false, error: `Rate card '${req.params.id}' not found` });
        }
        return res.status(200).json({ success: true, data: card });
    } catch (err) {
        return handleControllerError(res, err, 'Get rate card details');
    }
};

/**
 * POST /api/settings/rate-cards/upload
 * Upload and parse Excel .xlsx rate card
 */
exports.uploadRateCard = async (req, res) => {
    try {
        const { id, name, carrierCode = 'DGR', currency = 'KWD', pricingMode = 'SELLING_PRICE', fileBase64 } = req.body || {};

        if (!id || !name || !fileBase64) {
            return res.status(400).json({
                success: false,
                error: 'Card ID, display name, and Excel file content (base64) are required.'
            });
        }

        const cleanId = String(id).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
        if (!cleanId) {
            return res.status(400).json({ success: false, error: 'Invalid card ID' });
        }

        const RateCardService = require('../services/RateCardService');
        const result = await RateCardService.importRateCardFromBase64({
            id: cleanId,
            name: String(name).trim(),
            carrierCode: String(carrierCode || 'DGR').trim().toUpperCase(),
            currency: String(currency || 'KWD').trim().toUpperCase(),
            pricingMode: pricingMode === 'BASE_COST' ? 'BASE_COST' : 'SELLING_PRICE',
            fileBase64
        });

        return res.status(201).json({
            success: true,
            data: result,
            message: `Rate card '${cleanId}' imported successfully!`
        });
    } catch (err) {
        logger.error('Error uploading rate card:', err);
        return res.status(500).json({ success: false, error: err.message || 'Failed to upload rate card' });
    }
};

/**
 * DELETE /api/settings/rate-cards/:id
 * Delete a custom rate card
 */
exports.deleteRateCard = async (req, res) => {
    try {
        const { id } = req.params;
        const RateCardService = require('../services/RateCardService');
        RateCardService.deleteRateCard(id);
        return res.status(200).json({
            success: true,
            message: `Rate card '${id}' deleted successfully`
        });
    } catch (err) {
        logger.error('Error deleting rate card:', err);
        return res.status(400).json({ success: false, error: err.message || 'Failed to delete rate card' });
    }
};

