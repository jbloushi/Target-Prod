const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const settingsController = require('../controllers/settings.controller');
const { authorize } = require('../middleware/authorize.middleware');
const geminiController = require('../controllers/geminiClassification.controller');

// Public/Authenticated reading of system settings (e.g. carrier display names)
router.get('/system', settingsController.getSystemSettings);
router.get('/gemini/classifications', authController.protect, authorize('MANAGE_SYSTEM_SETTINGS'), geminiController.getDashboard);
router.patch('/gemini/classifications/:id', authController.protect, authorize('MANAGE_SYSTEM_SETTINGS'), geminiController.updateClassification);

// Available rate cards for carrier assignment
router.get('/rate-cards', settingsController.getRateCards);

// Download sample rate card Excel template
router.get('/rate-cards/sample-template', settingsController.downloadSampleTemplate);

// View specific rate card matrix details
router.get('/rate-cards/:id', settingsController.getRateCardDetails);

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

module.exports = router;
