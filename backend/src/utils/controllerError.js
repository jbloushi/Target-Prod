/**
 * Centralized Controller Error Handler
 * 
 * Prevents raw Prisma/system error messages from leaking to HTTP responses.
 * Only known, user-facing error messages are forwarded.
 * 
 * @security Addresses OWASP A09 — prevents schema/SQL leak via error responses.
 */
const logger = require('./logger');

// Errors whose messages are safe to return to the client
const SAFE_ERROR_PATTERNS = [
    'Email already exists',
    'User not found',
    'Shipment not found',
    'Invalid tracking number',
    'Organization not found',
    'Missing fields',
    'Password must be',
    'Permission denied',
    'Only organization agent',
    'Incorrect email or password',
    'No key generated',
    'already exists',
    'not found',
    'DGR Error',
    'DGR Validation Failed',
    'DHL API Error',
    'Insufficient',
    'Carrier booking failed',
    'Validation Failed',
    'restricted for this account',
    'not allowed',
    'does not allow',
    'A booking request is currently being processed',
];

/**
 * Handles controller errors safely.
 * @param {Object} res - Express response object
 * @param {Error} error - The caught error
 * @param {string} context - Human-readable context for logging (e.g., 'Shipment creation')
 * @param {number} [defaultStatus=500] - Default HTTP status if error is unrecognized
 */
exports.handleControllerError = (res, error, context = 'Operation', defaultStatus = 500) => {
    // Always log the full error server-side
    logger.error(`${context} failed:`, { message: error.message, stack: error.stack });

    // Allow known, intentionally created user-facing errors
    const isSafe = SAFE_ERROR_PATTERNS.some(pattern => 
        error.message && error.message.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isSafe) {
        return res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }

    // Prisma known unique constraint violations — safe to surface generically
    if (error.code === 'P2002') {
        return res.status(409).json({ success: false, error: 'A record with this value already exists.' });
    }

    // Prisma record not found
    if (error.code === 'P2025') {
        return res.status(404).json({ success: false, error: 'Record not found.' });
    }

    // Prisma validation errors — safe to surface generically
    if (error.code && error.code.startsWith('P2')) {
        return res.status(422).json({ success: false, error: 'Data validation failed.' });
    }

    // All other errors — do NOT expose internals
    return res.status(defaultStatus).json({ 
        success: false, 
        error: `${context} failed. Please try again.` 
    });
};
