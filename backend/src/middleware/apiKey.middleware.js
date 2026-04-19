const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { compareApiKey } = require('../utils/security');

const AUTH_ERROR = Object.freeze({
    MISSING_KEY: { status: 401, code: 'MISSING_API_KEY', message: 'API Key missing. Please provide x-api-key header.' },
    MALFORMED_KEY: { status: 401, code: 'MALFORMED_API_KEY', message: 'Malformed API Key format.' },
    INVALID_KEY: { status: 401, code: 'INVALID_API_KEY', message: 'Invalid API Key' },
    INACTIVE_USER: { status: 403, code: 'INACTIVE_ACCOUNT', message: 'Account is inactive or revoked.' },
    INACTIVE_ORG: { status: 403, code: 'INACTIVE_ORGANIZATION', message: 'Organization is inactive or unavailable.' },
    INTERNAL: { status: 500, code: 'AUTH_INTERNAL_ERROR', message: 'Authentication failed due to an internal error.' }
});

const fail = (res, authError) => res.status(authError.status).json({
    success: false,
    error: authError.message
});

/**
 * Middleware: Validate x-api-key header and attach user context
 */
exports.validateApiKey = async (req, res, next) => {
    const requestContext = require('../utils/RequestContext');

    try {
        const rawHeader = req.headers['x-api-key'];
        const apiKey = typeof rawHeader === 'string' ? rawHeader.trim() : '';

        if (!apiKey) {
            return fail(res, AUTH_ERROR.MISSING_KEY);
        }

        // Expected format: <key_id>.<secret>
        const separatorIndex = apiKey.indexOf('.');
        if (separatorIndex <= 0 || separatorIndex >= apiKey.length - 1 || apiKey.indexOf('.', separatorIndex + 1) !== -1) {
            return fail(res, AUTH_ERROR.MALFORMED_KEY);
        }

        const keyId = apiKey.slice(0, separatorIndex);

        const user = await prisma.user.findUnique({
            where: { id: keyId },
            select: {
                id: true,
                role: true,
                organizationId: true,
                apiKeyHash: true,
                active: true,
                carrierConfig: true,
                agentPolicy: true
            }
        });

        if (!user || !user.apiKeyHash) {
            logger.warn('API key rejected: unknown key id', {
                keyId,
                path: req.originalUrl
            });
            return fail(res, AUTH_ERROR.INVALID_KEY);
        }

        if (!compareApiKey(apiKey, user.apiKeyHash)) {
            logger.warn('API key rejected: hash mismatch', {
                keyId,
                path: req.originalUrl
            });
            return fail(res, AUTH_ERROR.INVALID_KEY);
        }

        if (!user.active) {
            logger.warn('API key rejected: inactive user', {
                keyId: user.id,
                organizationId: user.organizationId || null,
                path: req.originalUrl
            });
            return fail(res, AUTH_ERROR.INACTIVE_USER);
        }

        if (user.organizationId) {
            const organization = await prisma.organization.findUnique({
                where: { id: user.organizationId },
                select: { id: true, active: true, name: true }
            });

            if (!organization || !organization.active) {
                logger.warn('API key rejected: inactive or missing organization', {
                    keyId: user.id,
                    organizationId: user.organizationId,
                    path: req.originalUrl
                });
                return fail(res, AUTH_ERROR.INACTIVE_ORG);
            }

            req.organization = organization;
        }

        req.user = user;
        req.isExternalApi = true;

        requestContext.run({
            organizationId: user.organizationId,
            role: user.role,
            userId: user.id
        }, () => next());
    } catch (error) {
        logger.error('API Key Validation Error', {
            message: error.message,
            stack: error.stack,
            path: req.originalUrl,
            method: req.method
        });
        return fail(res, AUTH_ERROR.INTERNAL);
    }
};
