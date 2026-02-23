const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/request-otp', authController.requestOtp);
router.post('/api-key', authController.protect, authorize('MANAGE_CARRIERS'), authController.generateApiKey);

// Staff management
router.get('/users', authController.protect, authorize('VIEW_ALL_SHIPMENTS'), authController.getAllUsers);
router.get('/clients', authController.protect, authorize('VIEW_ALL_SHIPMENTS'), authController.getClients);
router.patch('/surcharge', authController.protect, authorize('MANAGE_PRICING'), authController.updateUserSurcharge);

module.exports = router;
