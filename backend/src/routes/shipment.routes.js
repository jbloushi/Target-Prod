const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const shipmentController = require('../controllers/shipment.controller');
const { check } = require('express-validator');
const logger = require('../utils/logger');
const authController = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');
const { SHIPMENT_STATUSES } = require('../constants/statusConstants');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Log all requests to this router
router.use((req, res, next) => {
  logger.info(`[DEBUG] Shipment Router Hit: ${req.method} ${req.originalUrl}`);
  next();
});

// Public routes must come first and be unprotected
// Public: Get basic shipment info
router.get('/public/:trackingNumber', shipmentController.getPublicShipment);

// Public: Update location
router.patch(
  '/public/:trackingNumber/location',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('coordinates').isArray({ min: 2, max: 2 }).withMessage('Invalid coordinates'),
    body('address').isString().notEmpty().withMessage('Address is required'),
    validate
  ],
  shipmentController.updatePublicLocation
);

// Protect all routes after this middleware
router.use(authController.protect);

// Static/Fixed routes MUST come before parameterized routes (/:trackingNumber)
router.get('/stats', (req, res, next) => {
  logger.info(`[DEBUG] Shipment Stats Route Hit: ${req.method} ${req.originalUrl}`);
  logger.info(`[DEBUG] Query Params: ${JSON.stringify(req.query)}`);
  next();
}, shipmentController.getShipmentStats);

router.get('/carriers', (req, res, next) => {
  logger.info(`[DEBUG] Routing to getAvailableCarriers`);
  next();
}, shipmentController.getAvailableCarriers);

// Get all shipments (Standard list)
router.get('/', shipmentController.getAllShipments);

// Get rate quotes
router.post('/quote', shipmentController.getQuotes);


// Get shipments near a location
router.get(
  '/nearby',
  [
    query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('maxDistance').optional().isInt({ min: 1, max: 100000 }).withMessage('Max distance must be between 1 and 100,000 meters'),
    validate
  ],
  shipmentController.getNearbyShipments
);

// Create a new shipment
router.post('/', shipmentController.createShipment);

// Get shipment by tracking number
router.get(
  '/:trackingNumber',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.getShipmentByTrackingNumber
);

// Delete shipment (admin only)
router.delete(
  '/:trackingNumber',
  authorize('MANAGE_USERS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.deleteShipment
);

// Update shipment details (General)
router.patch(
  '/:trackingNumber',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('status').optional().isIn(SHIPMENT_STATUSES),
    validate
  ],
  shipmentController.updateShipment
);



// Update shipment location
router.patch(
  '/:trackingNumber/location',
  authorize('UPDATE_SHIPMENT_LOCATION'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('coordinates').isArray({ min: 2, max: 2 }).withMessage('Invalid coordinates'),
    body('address').isString().notEmpty().withMessage('Address is required'),
    body('status').optional().isIn(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled']),
    body('description').optional().isString(),
    validate
  ],
  shipmentController.updateShipmentLocation
);

// Update shipment status
router.patch('/:trackingNumber/status', shipmentController.updateShipmentStatus);

// Get shipment history
router.get(
  '/:trackingNumber/history',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.getShipmentHistory
);

// Get shipment ETA
router.get(
  '/:trackingNumber/eta',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.getShipmentETA
);

// Get shipment route distance
router.get(
  '/:trackingNumber/distance',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.getShipmentRouteDistance
);

// Generate Shipment Label (Internal/HTML)
router.get(
  '/:trackingNumber/label',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.generateLabel
);

// Serve Shipment Document (Secure/Hosted PDF)
router.get(
  '/:trackingNumber/documents/:filename',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    param('filename').isString().notEmpty().withMessage('Valid filename is required'),
    validate
  ],
  shipmentController.serveDocument
);

// Update shipment location manually
router.patch(
  '/:trackingNumber/location/manual',
  authorize('UPDATE_SHIPMENT_LOCATION'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('coordinates').isArray({ min: 2, max: 2 }).withMessage('Invalid coordinates'),
    body('address').isString().notEmpty().withMessage('Address is required'),
    body('status').optional().isIn(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled']),
    body('description').optional().isString(),
    validate
  ],
  shipmentController.updateShipmentLocationManually
);

// Add a checkpoint to shipment
router.post(
  '/:trackingNumber/checkpoints',
  authorize('MANAGE_SHIPMENT_CHECKPOINTS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('location').isObject().withMessage('Location is required'),
    body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('Invalid coordinates'),
    body('location.address').isString().notEmpty().withMessage('Address is required'),
    body('name').isString().notEmpty().withMessage('Checkpoint name is required'),
    validate
  ],
  shipmentController.addCheckpoint
);

// Driver Pickup Scan
router.post(
  '/:trackingNumber/pickup',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.pickupShipment
);

// Warehouse Handover Scan (Inbound)
router.post(
  '/:trackingNumber/warehouse/scan',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.processWarehouseScan
);


// Get booking-time carrier options (service + optional services)
router.get(
  '/:trackingNumber/booking-options',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.getBookingOptions
);

// List conversion target carriers for an internal shipment
router.get(
  '/:trackingNumber/conversion-targets',
  authorize('BOOK_CARRIERS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.getInternalShipmentConversionTargets
);

// Convert an internal shipment to a new carrier-backed shipment
router.post(
  '/:trackingNumber/convert-carrier',
  authorize('BOOK_CARRIERS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('carrierCode').isString().notEmpty().withMessage('Target carrier is required'),
    body('serviceCode').optional().isString(),
    validate
  ],
  shipmentController.convertInternalShipmentToCarrier
);

// Submit to Carrier (platform staff with booking capability)
router.post(
  '/:trackingNumber/book',
  authorize('BOOK_CARRIERS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    validate
  ],
  shipmentController.bookWithCarrier
);

// Update a checkpoint
router.patch(
  '/:trackingNumber/checkpoints/:checkpointId',
  authorize('MANAGE_SHIPMENT_CHECKPOINTS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    param('checkpointId').isString().notEmpty().withMessage('Valid checkpoint ID is required'),
    validate
  ],
  shipmentController.updateCheckpoint
);

// Delete a checkpoint
router.delete(
  '/:trackingNumber/checkpoints/:checkpointId',
  authorize('MANAGE_SHIPMENT_CHECKPOINTS'),
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    param('checkpointId').isString().notEmpty().withMessage('Valid checkpoint ID is required'),
    validate
  ],
  shipmentController.deleteCheckpoint
);

// Update public tracking settings
router.patch(
  '/:trackingNumber/public-settings',
  [
    param('trackingNumber').isString().notEmpty().withMessage('Valid tracking number is required'),
    body('allowPublicLocationUpdate').optional().isBoolean(),
    body('allowPublicInfoUpdate').optional().isBoolean(),
    validate
  ],
  shipmentController.updatePublicSettings
);

module.exports = router;
