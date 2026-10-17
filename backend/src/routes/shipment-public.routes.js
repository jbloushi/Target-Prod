const express = require('express');
const router = express.Router();
const publicController = require('../controllers/shipment-public.controller');

// @route   GET /location/:token (and /api/public/shipments/location/:token)
// @desc    Get public shipment delivery details by single-use/scoped token
router.get('/location/:token', publicController.getLocationByToken);

// @route   POST /location/:token (and PATCH /location/:token)
// @desc    Update destination delivery coordinates by token
router.post('/location/:token', publicController.updateLocationByToken);
router.patch('/location/:token', publicController.updateLocationByToken);

// @route   GET /api/public/shipments/:trackingNumber
// @desc    Get public shipment details and history (unprotected)
router.get('/:trackingNumber', publicController.getPublicShipment);

// @route   GET /api/public/shipments/:trackingNumber/checkout
// @desc    Get public pay-by-link checkout summary
router.get('/:trackingNumber/checkout', publicController.getPublicCheckout);

// @route   POST /api/public/shipments/:trackingNumber/pay
// @desc    Settle shipment payment online (K-Net / Card / Apple Pay)
router.post('/:trackingNumber/pay', publicController.processPublicPayment);

// @route   POST /api/public/shipments/:trackingNumber/ottu-session
// @desc    Generate Ottu Hosted Checkout Session Link
router.post('/:trackingNumber/ottu-session', publicController.createOttuSession);

// @route   POST /api/public/checkout/ottu/webhook
// @desc    Receive incoming payment event from Ottu Payment Gateway
router.post('/checkout/ottu/webhook', publicController.handleOttuWebhook);

// @route   POST /api/public/shipments/:trackingNumber/location/send-otp
// @desc    Send 6-digit OTP to receiver's registered WhatsApp phone number
router.post('/:trackingNumber/location/send-otp', publicController.sendReceiverLocationOtp);

// @route   POST /api/public/shipments/:trackingNumber/location/verify-otp
// @desc    Verify receiver 6-digit OTP
router.post('/:trackingNumber/location/verify-otp', publicController.verifyReceiverLocationOtp);

// @route   PATCH /api/public/shipments/:trackingNumber/location
// @desc    Update destination location by receiver (OTP protected)
router.patch('/:trackingNumber/location', publicController.updatePublicLocation);

// @route   GET /api/public/shipments/:trackingNumber/return-eligibility
// @desc    Check return eligibility for delivered shipment
router.get('/:trackingNumber/return-eligibility', publicController.checkReturnEligibility);

// @route   POST /api/public/shipments/:trackingNumber/create-return
// @desc    Create self-service return waybill
router.post('/:trackingNumber/create-return', publicController.createPublicReturn);

module.exports = router;
