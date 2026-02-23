const express = require('express');
const router = express.Router();
const externalController = require('../controllers/external.controller');
const { validateApiKey } = require('../middleware/apiKey.middleware');
const { idempotency } = require('../middleware/idempotency.middleware');

router.use(validateApiKey);

router.post('/pickups', idempotency, externalController.createPickup);
router.get('/pickups/:id', externalController.getPickupStatus);
router.get('/shipments/:id', externalController.getShipmentStatus);
router.get('/shipments/:id/tracking', externalController.getUnifiedTracking);

module.exports = router;
