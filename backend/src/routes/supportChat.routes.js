const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const supportChatController = require('../controllers/supportChat.controller');

/**
 * Authentication wrapper supporting both Bearer header and query param token
 * (Essential for native EventSource in SSE which doesn't allow setting custom headers)
 */
const protectSupport = (req, res, next) => {
    if (!req.headers.authorization && req.query.token) {
        req.headers.authorization = `Bearer ${req.query.token}`;
    }
    return authController.protect(req, res, next);
};

// All support routes are protected
router.use(protectSupport);

// Conversations & Thread Operations
router.get('/conversations', supportChatController.getConversations);
router.get('/conversations/:id', supportChatController.getConversationById);
router.get('/conversations/:id/messages', supportChatController.getMessages);
router.get('/conversations/:id/window', supportChatController.get24hWindow);
router.post('/conversations/:id/messages', supportChatController.sendMessage);
router.post('/conversations/:id/status', supportChatController.toggleStatus);
router.post('/conversations/:id/labels', supportChatController.updateLabels);

// Logistics Context & Shipment Binding
router.get('/conversations/:id/context', supportChatController.getLogisticsContext);
router.get('/context', supportChatController.getLogisticsContext);
router.get('/shipments/:trackingNumber/conversation', supportChatController.getShipmentConversation);

// Unread Badge Count
router.get('/unread-count', supportChatController.getUnreadCount);

// 1-Click Operational Actions
router.post('/actions/request-location', supportChatController.requestLocation);

// Real-Time Server-Sent Events (SSE)
router.get('/events', supportChatController.getEvents);

module.exports = router;
