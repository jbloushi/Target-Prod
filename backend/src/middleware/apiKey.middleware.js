const User = require('../models/user.model');
const logger = require('../utils/logger');

exports.validateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'API Key missing. Please provide x-api-key header.' });
        }

        // Parse compound key format: {userId}.{randomBytes}
        const parts = apiKey.split('.');
        if (parts.length !== 2) {
            return res.status(401).json({ success: false, error: 'Malformed API Key format.' });
        }

        const userId = parts[0];

        // Find user with this API key
        // Note: In real prod, this should be cached (Redis) to avoid DB hit on every request
        // For Phase 1, DB query is acceptable
        const user = await User.findOne({ _id: userId, active: true }).select('+apiKeyHash');

        if (!user || !user.apiKeyHash) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(apiKey, user.apiKeyHash);

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }

        // Attach user to request
        req.user = user;
        req.isExternalApi = true; // Flag for controllers to know context

        const requestContext = require('../utils/RequestContext');
        requestContext.run({ organizationId: user.organization, role: user.role, userId: user._id }, () => {
            next();
        });
    } catch (error) {
        logger.error('API Key Validation Error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};
