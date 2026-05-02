const express = require('express');
const router = express.Router();
const publicController = require('../controllers/shipment-public.controller');

// @route   GET /api/public/shipments/:trackingNumber
// @desc    Get public shipment details and history (unprotected)
router.get('/:trackingNumber', publicController.getPublicShipment);

// @route   PATCH /api/public/shipments/:trackingNumber/location
// @desc    Update destination location by receiver (unprotected, one-time)
router.patch('/:trackingNumber/location', publicController.updatePublicLocation);

module.exports = router;
