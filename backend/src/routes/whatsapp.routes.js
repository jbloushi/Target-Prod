const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authorize, authorizeAny } = require('../middleware/authorize.middleware');
const whatsappWebhook = require('../controllers/whatsappWebhook.controller');
const adminWhatsAppLogs = require('../controllers/adminWhatsAppLogs.controller');

// Meta Webhook Public Verification (GET) and Incoming Delivery Receipt (POST)
router.get('/whatsapp/webhook', whatsappWebhook.verifyWebhook);
router.post('/whatsapp/webhook', whatsappWebhook.handleWebhookEvent);
router.get('/integrations/whatsapp/webhook', whatsappWebhook.verifyWebhook);
router.post('/integrations/whatsapp/webhook', whatsappWebhook.handleWebhookEvent);
router.get('/webhook', whatsappWebhook.verifyWebhook);
router.post('/webhook', whatsappWebhook.handleWebhookEvent);

// Admin WhatsApp Notification Audit Logs & Microservice Sync
router.get('/admin/whatsapp/logs', authController.protect, authorizeAny('MANAGE_USERS', 'BOOK_CARRIERS', 'MANAGE_ORG_USERS'), adminWhatsAppLogs.getNotificationLogs);
router.post('/admin/whatsapp/resend/:id', authController.protect, authorizeAny('MANAGE_USERS', 'BOOK_CARRIERS'), adminWhatsAppLogs.resendNotification);
router.post('/admin/whatsapp/sync-telemetry', authController.protect, authorizeAny('MANAGE_USERS', 'BOOK_CARRIERS', 'MANAGE_ORG_USERS'), adminWhatsAppLogs.syncMicroserviceTelemetry);
router.post('/admin/whatsapp/dispatch-queued', authController.protect, authorizeAny('MANAGE_USERS', 'BOOK_CARRIERS', 'MANAGE_ORG_USERS'), adminWhatsAppLogs.dispatchQueuedNotifications);

// Manual WhatsApp Trigger from Shipment Details
router.post('/shipments/:trackingNumber/whatsapp/send', authController.protect, adminWhatsAppLogs.sendShipmentWhatsApp);

// Meta WhatsApp Message Templates
router.get('/whatsapp/templates', authController.protect, adminWhatsAppLogs.getMetaTemplates);

module.exports = router;
