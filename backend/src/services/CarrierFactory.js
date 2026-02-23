const DgrAdapter = require('../adapters/DgrAdapter');
const FedexAdapter = require('../adapters/FedexAdapter');

/**
 * Factory class to get the appropriate carrier adapter
 */
class CarrierFactory {
    /**
     * List of carriers that have active implementations.
     */
    static getAvailableCarriers() {
        return [
            { code: 'DGR', name: 'DHL DGR', active: true },
            { code: 'FEDEX', name: 'FedEx', active: true }, // <-- ACTIVATED
            { code: 'UPS', name: 'UPS', active: false }
        ];
    }

    /**
     * Get a carrier adapter instance
     * @param {string} carrierCode - 'DGR', 'FEDEX', 'UPS' (Case insensitive)
     * @param {Object} config - Optional configuration overrides
     * @returns {Object} Carrier Adapter Instance
     */
    static getAdapter(carrierCode, config = {}) {
        const code = (carrierCode || 'DGR').toUpperCase();

        switch (code) {
            case 'DGR':
            case 'DHL': // Backward compatibility for any lingering DB refs
                return new DgrAdapter(config);

            case 'FEDEX':
                return new FedexAdapter(config); // <-- NEW INSTANTIATION

            case 'UPS':
                throw new Error('UPS integration not yet implemented');

            default:
                throw new Error(`Carrier '${carrierCode}' not supported`);
        }
    }
}

module.exports = CarrierFactory;
