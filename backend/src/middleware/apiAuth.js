const ApiClient = require('../models/ApiClient.model');
const logger = require('../utils/logger');

/**
 * Middleware to validate API Key
 */
const validateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API Key missing. Please provide x-api-key header.'
            });
        }

        // Check format: sk_live_{id}_{bytes}
        const parts = apiKey.split('_');
        if (parts.length !== 4 || parts[0] !== 'sk' || parts[1] !== 'live') {
            return res.status(401).json({
                success: false,
                error: 'Malformed API Key.'
            });
        }

        const clientId = parts[2];
        const client = await ApiClient.findOne({ _id: clientId, isActive: true }).select('+apiKeyHash');

        if (!client || !client.apiKeyHash) {
            logger.warn(`Invalid API Key attempt: ${apiKey}`);
            return res.status(403).json({
                success: false,
                error: 'Invalid or inactive API Key.'
            });
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(apiKey, client.apiKeyHash);

        if (!isMatch) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or inactive API Key.'
            });
        }

        // Attach client to request
        req.apiClient = client;

        const requestContext = require('../utils/RequestContext');
        requestContext.run({ organizationId: client.organization, role: 'api_client', clientId: client._id }, () => {
            next();
        });
    } catch (error) {
        logger.error('API Auth Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Authentication Error'
        });
    }
};

module.exports = validateApiKey;
