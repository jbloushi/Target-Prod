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
        // Primary auth header for external clients.
        // Fallback supports "Authorization: ApiKey <key>" for compatibility.
        const apiKeyFromHeader = req.headers['x-api-key'];
        const authHeader = req.headers.authorization || '';
        const apiKeyFromAuthorization = authHeader.startsWith('ApiKey ')
            ? authHeader.slice('ApiKey '.length).trim()
            : null;
        const apiKey = (apiKeyFromHeader || apiKeyFromAuthorization || '').trim();

        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'API Key missing. Please provide x-api-key header.' });
        }

        // Parse compound key format: {userId}.{randomBytes}
        const parts = apiKey.split('.');
        if (parts.length !== 2) {
            return res.status(401).json({ success: false, error: 'Malformed API Key format.' });
        }

        const userId = parts[0];

        // Use a minimal query for auth lookup to avoid JSON parsing failures
        // from unrelated profile fields.
        const authUser = await prisma.user.findFirst({
            where: { id: userId, active: true },
            select: {
                id: true,
                role: true,
                organizationId: true,
                apiKeyHash: true,
                active: true
            }
        });

        if (!authUser || !authUser.apiKeyHash) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }

        // Verify using HMAC-SHA256 with constant-time comparison
        const isMatch = compareApiKey(apiKey, authUser.apiKeyHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }

        // Attach user to request
        req.user = authUser;
        req.isExternalApi = true; // Context flag

        // Inject RequestContext for multi-tenancy support
        const requestContext = require('../utils/RequestContext');
        requestContext.run({ 
            organizationId: authUser.organizationId,
            role: authUser.role,
            userId: authUser.id
        }, () => {
            next();
        });
    } catch (error) {
        logger.error('API Key Validation Error:', {
            message: error?.message,
            code: error?.code,
            meta: error?.meta
        });
        res.status(500).json({ success: false, error: 'Authentication system error' });
    }
};
