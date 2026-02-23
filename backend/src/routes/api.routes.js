const express = require('express');
const router = express.Router();
const { validateApiKey } = require('../middleware/apiKey.middleware');
const apiController = require('../controllers/api.controller');

// All routes here are prefixed with /api/v1 and require API Key
router.use(validateApiKey);

// Shipment Routes
router.post('/shipments', apiController.createShipment);
router.get('/tracking/:number', apiController.trackShipment);

// Address Management Routes
router.get('/addresses', apiController.getAddresses);
router.post('/addresses', apiController.addAddress);
router.put('/addresses/:id', apiController.updateAddress);

module.exports = router;
