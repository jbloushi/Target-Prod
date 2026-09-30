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
            const rawCode = String(carrierCode || '').trim().toUpperCase();
            const isTest = shipmentData?.isTest === true || shipmentData?.environment === 'test';
            const environment = isTest ? 'test' : (shipmentData?.environment || 'production');

            if (rawCode && rawCode !== 'ALL') {
                const adapter = CarrierFactory.getAdapter(rawCode, { isTest, environment });
                const rates = await adapter.getRates(shipmentData);
                return (Array.isArray(rates) ? rates : []).map(r => ({
                    ...r,
                    provider: rawCode,
                    timestamp: new Date()
                }));
            }

            // Fetch from all active carriers concurrently
            const availableCarriers = CarrierFactory.getAvailableCarriers().filter(c => c.active && c.capabilities?.supportsRating);
            const ratePromises = availableCarriers.map(async (carrier) => {
                try {
                    const adapter = CarrierFactory.getAdapter(carrier.code, { isTest, environment });
                    const rates = await adapter.getRates(shipmentData);
                    return (Array.isArray(rates) ? rates : []).map(r => ({
                        ...r,
                        provider: carrier.code,
                        timestamp: new Date()
                    }));
                } catch (err) {
                    logger.warn(`Failed to fetch rates for ${carrier.code}: ${err.message}`);
                    return [];
                }
            });

            const results = await Promise.all(ratePromises);
            return results.flat();
        } catch (error) {
            logger.error(`Rate Fetch Error (${carrierCode || 'All'}):`, error.message);
            throw error;
        }
    }
}

module.exports = new CarrierRateService();
