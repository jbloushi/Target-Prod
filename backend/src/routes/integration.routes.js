const express = require('express');
const authController = require('../controllers/auth.controller');
const integrationController = require('../controllers/integration.controller');
const { authorize } = require('../middleware/authorize.middleware');

const router = express.Router();

// Webhook receivers — no auth, called by external providers
router.post('/chatwoot/webhook', integrationController.handleChatwootWebhook);
router.post('/logestechs/webhook', integrationController.handleLogesTechsWebhook);
router.post('/17track/webhook', integrationController.handle17TrackWebhook);

router.use(authController.protect);

router.post(
    '/chatwoot/test-message',
    authorize('VIEW_ALL_SHIPMENTS'),
    integrationController.sendChatwootTestMessage
);

router.get(
    '/chatwoot/shipments/:trackingNumber/preview',
    authorize('VIEW_ALL_SHIPMENTS'),
    integrationController.previewChatwootShipmentMessage
);

// Merchant Webhook Subscriptions & Simulator
router.get('/webhooks', integrationController.listWebhooks);
router.post('/webhooks', integrationController.createWebhook);
router.put('/webhooks/:id', integrationController.updateWebhook);
router.delete('/webhooks/:id', integrationController.deleteWebhook);
router.get('/webhooks/:id/events', integrationController.getWebhookEvents);
router.post('/webhooks/:id/test', integrationController.testWebhook);

// Phenix ERP Ingestion & Synchronization
router.get(
    '/phenix/preview',
    authorize('VIEW_ALL_SHIPMENTS'),
    integrationController.previewPhenixShipments
);
router.post(
    '/phenix/sync',
    authorize('CREATE_SHIPMENTS'),
    integrationController.syncPhenixShipments
);

module.exports = router;

