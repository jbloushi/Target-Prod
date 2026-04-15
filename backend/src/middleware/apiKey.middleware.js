const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { compareApiKey } = require('../utils/security');

/**
 * Middleware: Validate x-api-key header and attach user context
 * 
 * @security Uses HMAC-SHA256 + timingSafeEqual instead of bcrypt for:
 *   - Constant-time comparison (timing-attack resistant)
 *   - ~200x faster than bcrypt (~0.01ms vs ~200ms per request)
 */
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

        // Find user with this API key from MySQL via Prisma
        const user = await prisma.user.findFirst({
            where: { id: userId, active: true },
            select: {
                id: true,
                role: true,
                organizationId: true,
                apiKeyHash: true,
                active: true,
                carrierConfig: true,
                agentPolicy: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        allowedCarriers: true,
                        carrierConfig: true
                    }
                }
            }
        });

        if (!user || !user.apiKeyHash) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }

        // Verify using HMAC-SHA256 with constant-time comparison
        const isMatch = compareApiKey(apiKey, user.apiKeyHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }

        // Attach user to request
        req.user = user;
        req.isExternalApi = true; // Context flag

        // Inject RequestContext for multi-tenancy support
        const requestContext = require('../utils/RequestContext');
        requestContext.run({ 
            organizationId: user.organizationId, 
            role: user.role, 
            userId: user.id 
        }, () => {
            next();
        });
    } catch (error) {
        logger.error('API Key Validation Error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};
