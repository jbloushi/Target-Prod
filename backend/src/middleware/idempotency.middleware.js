const IdempotencyKey = require('../models/IdempotencyKey.model');
const logger = require('../utils/logger');

exports.idempotency = async (req, res, next) => {
    const key = req.headers['idempotency-key'];

    // If no key is provided, bypass seamlessly for backward compatibility
    if (!key) {
        return next();
    }

    // Namespace the key to the current user/client to prevent cross-tenant collisions
    const clientId = req.user?._id || req.apiClient?._id || 'ANON';
    const scopedKey = `${clientId}:${key}`;

    try {
        const existing = await IdempotencyKey.findOne({ key: scopedKey });

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
        await IdempotencyKey.create({
            key: scopedKey,
            status: 'PROCESSING',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Persist for 24 hours
        });

        // 2. Intercept the eventual Express res.json call to store the result
        const originalJson = res.json;
        res.json = function (body) {
            // Restore original to prevent recursion
            res.json = originalJson;

            // Fire-and-forget update to mark as completed.
            IdempotencyKey.updateOne(
                { key: scopedKey },
                {
                    $set: {
                        status: 'COMPLETED',
                        responseStatus: res.statusCode,
                        responseBody: body
                    }
                }
            ).catch(err => logger.error(`Failed to update IdempotencyKey ${scopedKey}:`, err));

            // Forward the payload back to the client natively
            return originalJson.call(this, body);
        };

        next();
    } catch (err) {
        // Handle race conditions where two identical requests arrive instantly at the exact same millisecond
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'A request with this Idempotency-Key is currently being processed.'
            });
        }
        next(err);
    }
};
