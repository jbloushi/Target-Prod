const express = require('express');
const router = express.Router();
const { validateApiKey } = require('../middleware/apiKey.middleware');
const { authorize } = require('../middleware/authorize.middleware');
const { requireIdempotency } = require('../middleware/idempotency.middleware');
const apiController = require('../controllers/api.controller');

// All routes here are prefixed with /api/v1 and require API Key
router.use(validateApiKey);

// Shipment Routes
router.post('/shipments', authorize('CREATE_SHIPMENTS'), requireIdempotency, apiController.createShipment);
router.put('/shipments/:number', apiController.updateShipment);
router.get('/tracking/:number', apiController.trackShipment);

// Quote Routes
router.post('/quotes', apiController.getQuotation);

// Address Management Routes
router.get('/addresses', apiController.getAddresses);
router.post('/addresses', apiController.addAddress);
router.put('/addresses/:id', apiController.updateAddress);

module.exports = router;
