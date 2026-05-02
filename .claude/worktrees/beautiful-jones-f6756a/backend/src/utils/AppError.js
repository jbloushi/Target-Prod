/**
 * AppError — Operational error class
 *
 * Throw this in controllers/services for expected errors (validation, auth, not-found).
 * The global error handler will format and send it consistently.
 *
 * @example
 *   throw new AppError('Shipment not found', 404, 'ERR_NOT_FOUND');
 */
class AppError extends Error {
    constructor(message, statusCode, code = 'ERR_UNKNOWN') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
