const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const fleetController = require('../controllers/fleet.controller');
const { authorize, authorizeAny } = require('../middleware/authorize.middleware');
const { requireFeature } = require('../middleware/featureGate.middleware');

// All fleet endpoints require authentication and active Fleet feature
router.use(authController.protect);
router.use(requireFeature('fleet'));

// 1. Dispatcher Deck & Run Creation
router.get('/dispatch-deck', authorize('MANAGE_FLEET'), fleetController.getDispatchDeck);
router.post('/runs', authorize('MANAGE_FLEET'), fleetController.createRun);
router.get('/runs', authorize('VIEW_FLEET'), fleetController.getRuns);
router.get('/runs/:id', authorize('VIEW_FLEET'), fleetController.getRunDetails);

// 2. COD Settlement (Cashier/Admin)
router.post('/runs/:id/settle-cod', authorizeAny('MANAGE_FLEET', 'MANAGE_PAYMENTS', 'VIEW_FINANCE'), fleetController.settleRunCod);

// 3. Driver Cockpit Actions
router.get('/driver/active-run', authorizeAny('DRIVER_OPS', 'VIEW_FLEET'), fleetController.getDriverActiveRun);
router.post('/driver/complete-stop', authorizeAny('DRIVER_OPS', 'MANAGE_FLEET'), fleetController.completeStop);
router.post('/driver/record-exception', authorizeAny('DRIVER_OPS', 'MANAGE_FLEET'), fleetController.recordException);

// 4. Vehicle Assets
router.get('/vehicles', authorize('VIEW_FLEET'), fleetController.getVehicles);
router.post('/vehicles', authorize('MANAGE_FLEET'), fleetController.createVehicle);
router.patch('/vehicles/:id', authorize('MANAGE_FLEET'), fleetController.updateVehicle);

module.exports = router;
