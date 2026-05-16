const express = require('express');
const authController = require('../controllers/auth.controller');
const integrationController = require('../controllers/integration.controller');
const { authorize } = require('../middleware/authorize.middleware');

const router = express.Router();

// Chatwoot webhook — no auth, called by Chatwoot on message status changes.
// Configure in Chatwoot → Settings → Integrations → Webhooks, subscribe to message_updated.
router.post('/chatwoot/webhook', integrationController.handleChatwootWebhook);
router.post('/logestechs/webhook', integrationController.handleLogesTechsWebhook);

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

module.exports = router;
