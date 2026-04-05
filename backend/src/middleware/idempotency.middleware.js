/**
 * Idempotency Middleware (Prisma/MySQL)
 * 
 * Prevents duplicate API requests by tracking unique Idempotency-Key headers.
 * Replaces the broken Mongoose-based implementation.
 * 
 * @security Namespaces keys per user to prevent cross-tenant replay attacks.
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

exports.idempotency = async (req, res, next) => {
    const key = req.headers['idempotency-key'];

    // If no key is provided, bypass seamlessly for backward compatibility
    if (!key) {
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
