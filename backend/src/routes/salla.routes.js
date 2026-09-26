const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const sallaIntegration = require('../services/sallaIntegration.service');

// Middleware to capture raw body for Salla Signature Verification
router.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

router.post('/webhook', async (req, res) => {
    const signature = req.headers['x-salla-signature'];
    const event = req.headers['x-salla-event']; // 'app.store.authorize', 'order.created'
    
    // Verify Webhook Signature
    if (signature && !sallaIntegration.verifyWebhookSignature(req.rawBody, signature)) {
        logger.warn('Salla webhook signature verification failed.');
        return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
    }

    const payload = req.body;
    logger.info(`Received Salla Webhook: ${payload.event || event}`);

    try {
        switch (payload.event) {
            case 'app.store.authorize':
                // Salla Easy Mode sends tokens directly via this webhook when the app is installed
                if (payload.data && payload.data.access_token) {
                    sallaIntegration.saveTokens(payload.merchant, payload.data);
                }
                break;

            case 'order.created':
                // Forward the new order to LogesTechs fulfillment
                if (payload.data) {
                    await sallaIntegration.forwardOrderToLogesTechs(payload.data);
                }
                break;
                
            case 'product.updated':
                // TODO: Update stock in LogesTechs if manually changed in Salla
                break;

            default:
                logger.info(`Unhandled Salla event: ${payload.event}`);
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        logger.error(`Error processing Salla webhook: ${error.message}`);
        // Salla expects 200 OK so it doesn't retry unnecessarily, unless it's a critical failure
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
