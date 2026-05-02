class CarrierAdapter {
    /**
     * @param {Object} config - Carrier configuration (api keys, urls, etc.)
     */
    constructor(config) {
        this.config = config;
    }

    /**
     * Calculate rates for a shipment
     * @param {Object} normalizedShipment 
     * @returns {Promise<Array>} List of rates { serviceName, serviceCode, totalPrice, currency, ... }
     */
    async getRates(normalizedShipment) {
        throw new Error('getRates() must be implemented');
    }

    /**
     * Create a shipment label/invoice
     * @param {Object} normalizedShipment 
     * @param {string} serviceCode 
     * @returns {Promise<Object>} { trackingNumber, labelUrl, invoiceUrl, awbUrl, rawResponse }
     */
    async createShipment(normalizedShipment, serviceCode) {
        throw new Error('createShipment() must be implemented');
    }

    /**
     * Validate shipment data requirements
     * @param {Object} normalizedShipment 
     * @returns {Promise<Array<string>>} List of error messages (empty if valid)
     */
    async validate(normalizedShipment) {
        return [];
    }

    /**
     * Cancel a shipment
     * @param {string} trackingNumber 
     * @returns {Promise<boolean>} Success status
     */
    async cancelShipment(trackingNumber) {
        throw new Error('cancelShipment() must be implemented');
    }

    /**
     * Get tracking status
     * @param {string} trackingNumber 
     * @returns {Promise<Object>} Unified tracking object
     */
    async getTracking(trackingNumber) {
        throw new Error('getTracking() must be implemented');
    }
}

module.exports = CarrierAdapter;
