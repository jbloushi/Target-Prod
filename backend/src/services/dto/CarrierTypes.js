/**
 * @typedef {Object} NormalizedRate
 * @property {string} serviceName - Carrier service name (e.g. "DHL Express Worldwide")
 * @property {string} serviceCode - Carrier service code (e.g. "P")
 * @property {string} carrierCode - Carrier code (e.g. "DHL")
 * @property {number} totalPrice - Total price including surcharges
 * @property {string} currency - Currency code (e.g. "KWD")
 * @property {string} deliveryDate - ISO date string
 * @property {number} [basePrice] - Optional base price breakdown
 * @property {Object} [meta] - Carrier specific raw data
 */

/**
 * @typedef {Object} ShipmentBookingResult
 * @property {string} trackingNumber - Validation tracking number
 * @property {string} [carrierShipmentId] - Internal carrier ID if available
 * @property {Array<{type: string, url: string, format: string}>} documents - Array of document objects
 * @property {Object} [meta] - Raw carrier response
 */

/**
 * @typedef {Object} CarrierError
 * @property {string} code - Error code
 * @property {string} message - User readable message
 * @property {boolean} retryable - Whether the operation can be retried
 * @property {Object} [details] - Additional error context
 */

module.exports = {};
