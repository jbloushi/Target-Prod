const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const settingsController = require('../controllers/settings.controller');
const { authorize } = require('../middleware/authorize.middleware');

// Public/Authenticated reading of system settings (e.g. carrier display names)
router.get('/system', settingsController.getSystemSettings);

// Superadmin update of system settings
router.patch(
    '/system',
    authController.protect,
    authorize('MANAGE_USERS'),
    settingsController.updateSystemSettings
);

// Superadmin & Staff test carrier connection
router.post(
    '/system/test-carrier',
    authController.protect,
    authorize('MANAGE_USERS'),
    settingsController.testCarrierConnection
);

module.exports = router;
