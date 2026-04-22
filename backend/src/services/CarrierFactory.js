const DgrAdapter = require('../adapters/DgrAdapter');
const FedexAdapter = require('../adapters/FedexAdapter');
const AramexAdapter = require('../adapters/AramexAdapter');

/**
 * Factory class to get the appropriate carrier adapter
 */
class CarrierFactory {
    /**
     * List of carriers that have active implementations.
     */
    static getAvailableCarriers() {
        return [
            { code: 'MANUAL', name: 'Manual Shipment', active: true },
            { code: 'DGR', name: 'DHL DGR', active: true },
            { code: 'ARAMEX', name: 'Aramex', active: true }, // <-- ADDED
            { code: 'FEDEX', name: 'FedEx', active: false }, // <-- DEACTIVATED
            { code: 'UPS', name: 'UPS', active: false }
        ];
    }

    /**
     * Get a carrier adapter instance
     * @param {string} carrierCode - 'DGR', 'ARAMEX', 'FEDEX', 'UPS' (Case insensitive)
     * @param {Object} config - Optional configuration overrides
     * @returns {Object} Carrier Adapter Instance
     */
    static getAdapter(carrierCode, config = {}) {
        const code = (carrierCode || 'DGR').toUpperCase();

        // Block ARAMEX in production (F-23)
        if (code === 'ARAMEX' && process.env.NODE_ENV === 'production') {
            throw new Error('Aramex carrier is not available in production environment');
        }

        switch (code) {
            case 'DGR':
            case 'DHL': // Backward compatibility for any lingering DB refs
                return new DgrAdapter(config);

            case 'ARAMEX':
                return new AramexAdapter(config); // <-- NEW ADAPTER

            case 'FEDEX':
                return new FedexAdapter(config);

            case 'UPS':
                throw new Error('UPS integration not yet implemented');

            default:
                throw new Error(`Carrier '${carrierCode}' not supported`);
        }
    }
}

module.exports = CarrierFactory;
