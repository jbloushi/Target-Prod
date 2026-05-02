const CarrierFactory = require('./CarrierFactory');
const logger = require('../utils/logger');

class CarrierRateService {
    /**
     * Fetch rates from all available carriers or a specific one.
     * @param {Object} shipmentData - Normalized shipment data
     * @param {string} [carrierCode] - Optional carrier code
     * @returns {Promise<Array>} List of rates
     */
    async getRates(shipmentData, carrierCode) {
        try {
            // For now, only DGR is supported
            const code = carrierCode || 'DGR';
            const adapter = CarrierFactory.getAdapter(code);

            // Call adapter
            const rates = await adapter.getRates(shipmentData);

            // Normalize here if adapter doesn't return standard format (Future)
            return rates.map(rate => ({
                ...rate,
                provider: code,
                timestamp: new Date()
            }));

        } catch (error) {
            logger.error(`Rate Fetch Error (${carrierCode || 'All'}):`, error.message);
            throw error;
        }
    }
}

module.exports = new CarrierRateService();
