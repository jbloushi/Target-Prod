/**
 * Idempotency Middleware (Prisma/MySQL)
 * 
 * Prevents duplicate API requests by tracking unique Idempotency-Key headers.
 * Uses the Prisma IdempotencyKey table.
 * 
 * @security Namespaces keys per user to prevent cross-tenant replay attacks.
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const createIdempotencyHandler = (options = {}) => {
    const required = options.required ?? false;

    return async (req, res, next) => {
        const rawKey = req.headers['idempotency-key'];
        const key = typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : null;

        if (!key) {
            if (required) {
                return res.status(400).json({
                    success: false,
                    error: 'Idempotency-Key header is required for this operation.'
                });
            }
            return next();
        }

        // Defensive: if database client or table is not present in mock context, proceed
        if (!prisma?.idempotencyKey) {
            return next();
        }

        // Namespace the key to the current user/client to prevent cross-tenant collisions
        const clientId = req.user?.id || 'ANON';
        const scopedKey = `${clientId}:${key}`;

        try {
            const existing = await prisma.idempotencyKey.findUnique({ where: { key: scopedKey } });

            if (existing) {
                logger.info(`Idempotency cache hit for key: ${scopedKey}`);

                if (existing.status === 'PROCESSING') {
                    return res.status(409).json({
                        success: false,
                        error: 'A request with this Idempotency-Key is currently being processed.'
                    });
                }

                // Replay the previous response exactly
                return res.status(existing.responseStatus).json(existing.responseBody);
            }

            // 1. Create the PROCESSING lock
            await prisma.idempotencyKey.create({
                data: {
                    key: scopedKey,
                    status: 'PROCESSING',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Persist for 24 hours
                }
            });

            // 2. Intercept the eventual Express res.json call to store the result
            const originalJson = res.json.bind(res);
            res.json = function (body) {
                // Restore original to prevent recursion
                res.json = originalJson;

                // Fire-and-forget update to mark as completed.
                prisma.idempotencyKey.update({
                    where: { key: scopedKey },
                    data: {
                        status: 'COMPLETED',
                        responseStatus: res.statusCode,
                        responseBody: body
                    }
                }).catch(err => logger.error(`Failed to update IdempotencyKey ${scopedKey}:`, err));

                // Forward the payload back to the client natively
                return originalJson(body);
            };

            next();
        } catch (err) {
            // Handle race conditions (Prisma unique constraint violation)
            if (err.code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    error: 'A request with this Idempotency-Key is currently being processed.'
                });
            }
            next(err);
        }
    };
};

const idempotency = createIdempotencyHandler({ required: false });

const requireIdempotency = (reqOrOptions, res, next) => {
    if (res && typeof next === 'function') {
        return createIdempotencyHandler({ required: true })(reqOrOptions, res, next);
    }
    return createIdempotencyHandler({ required: true, ...(reqOrOptions || {}) });
};

module.exports = {
    idempotency,
    requireIdempotency
};
