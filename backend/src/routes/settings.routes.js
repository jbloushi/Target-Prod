const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const authController = require('../controllers/auth.controller');
const settingsController = require('../controllers/settings.controller');
const adminWhatsAppLogs = require('../controllers/adminWhatsAppLogs.controller');
const { authorize, authorizeAny } = require('../middleware/authorize.middleware');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
};

// Admin WhatsApp Settings
router.get(
    '/whatsapp',
    authController.protect,
    authorize('MANAGE_SYSTEM_SETTINGS'),
    adminWhatsAppLogs.getWhatsAppConfig
);

router.put(
    '/whatsapp',
    authController.protect,
    authorize('MANAGE_SYSTEM_SETTINGS'),
    adminWhatsAppLogs.updateWhatsAppConfig
);

// Public/Authenticated reading of system settings (e.g. carrier display names)
router.get('/system', settingsController.getSystemSettings);

// Available rate cards for carrier assignment
router.get('/rate-cards', authController.protect, authorizeAny('VIEW_SYSTEM_SETTINGS', 'MANAGE_SYSTEM_SETTINGS', 'VIEW_FINANCE', 'CREATE_SHIPMENTS'), settingsController.getRateCards);

// Download sample rate card Excel template
router.get('/rate-cards/sample-template', authController.protect, authorizeAny('VIEW_SYSTEM_SETTINGS', 'MANAGE_SYSTEM_SETTINGS'), settingsController.downloadSampleTemplate);

// View specific rate card matrix details
router.get('/rate-cards/:id', authController.protect, authorizeAny('VIEW_SYSTEM_SETTINGS', 'MANAGE_SYSTEM_SETTINGS', 'VIEW_FINANCE'), settingsController.getRateCardDetails);

// Upload new rate card from Excel (Superadmin only)
router.post(
    '/rate-cards/upload',
    authController.protect,
    authorize('MANAGE_SYSTEM_SETTINGS'),
    settingsController.uploadRateCard
);

// Delete custom rate card (Superadmin only)
router.delete(
    '/rate-cards/:id',
    authController.protect,
    authorize('MANAGE_SYSTEM_SETTINGS'),
    settingsController.deleteRateCard
);

// Superadmin update of system settings
router.patch(
    '/system',
    authController.protect,
    authorize('MANAGE_SYSTEM_SETTINGS'),
    settingsController.updateSystemSettings
);

// Superadmin-only carrier connection test
router.post(
    '/system/test-carrier',
    authController.protect,
    authorize('MANAGE_SYSTEM_SETTINGS'),
    settingsController.testCarrierConnection
);

// Staff & Admin diagnostic attempt logs
router.get(
    '/system/diagnostics',
    authController.protect,
    authorizeAny('MANAGE_SYSTEM_SETTINGS', 'MANAGE_CARRIERS'),
    [
        query('limit').optional().isInt({ min: 1, max: 250 }).toInt().withMessage('limit must be an integer between 1 and 250'),
        query('carrierCode').optional().isString().trim().isLength({ min: 1, max: 32 }).matches(/^[A-Za-z0-9_-]+$/).withMessage('carrierCode must be alphanumeric'),
        query('action').optional().isString().trim().isLength({ min: 1, max: 64 }).matches(/^[A-Za-z0-9_-]+$/).withMessage('action must be a valid diagnostic action'),
        query('status').optional().isString().trim().toUpperCase().isIn(['SUCCESS', 'FAILED', 'VALIDATION_ERROR']).withMessage('status must be one of SUCCESS, FAILED, VALIDATION_ERROR'),
        query('trackingNumber').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('trackingNumber must be a valid string'),
        validate
    ],
    settingsController.getSystemDiagnostics
);

module.exports = router;
