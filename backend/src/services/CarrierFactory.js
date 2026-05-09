const DgrAdapter = require('../adapters/DgrAdapter');
const FedexAdapter = require('../adapters/FedexAdapter');
const AramexAdapter = require('../adapters/AramexAdapter');
const LogesTechsAdapter = require('../adapters/LogesTechsAdapter');
const InternalAdapter = require('../adapters/InternalAdapter');

const INTERNAL_CAPABILITIES = InternalAdapter.capabilities;

const EXTERNAL_CAPABILITIES = (code) => ({
    code,
    supportsBooking: true,
    supportsRating: true,
    supportsTracking: true,
    supportsCancellation: false,
    supportsLabelGeneration: true,
    supportsExternalApi: true,
    supportsConversionTarget: ['DGR', 'OTE'].includes(String(code || '').toUpperCase())
});

const CARRIER_REGISTRY = [
    {
        code: 'INTERNAL',
        name: 'Internal',
        active: true,
        trackingPrefix: 'TGR',
        defaultServiceCode: 'STD',
        capabilities: {
            ...INTERNAL_CAPABILITIES,
            supportsConversionTarget: false
        }
    },
    {
        code: 'DGR',
        name: 'DHL DGR',
        active: true,
        trackingPrefix: 'DGR',
        defaultServiceCode: 'P',
        capabilities: EXTERNAL_CAPABILITIES('DGR')
    },
    {
        code: 'OTE',
        name: 'OTE',
        active: true,
        trackingPrefix: 'TRG',
        defaultServiceCode: 'STD',
        capabilities: EXTERNAL_CAPABILITIES('OTE')
    },
    {
        code: 'ARAMEX',
        name: 'Aramex',
        active: true,
        trackingPrefix: 'ARA',
        defaultServiceCode: 'P',
        capabilities: EXTERNAL_CAPABILITIES('ARAMEX')
    },
    {
        code: 'FEDEX',
        name: 'FedEx',
        active: false,
        trackingPrefix: 'FED',
        defaultServiceCode: 'P',
        capabilities: EXTERNAL_CAPABILITIES('FEDEX')
    },
    {
        code: 'UPS',
        name: 'UPS',
        active: false,
        trackingPrefix: 'UPS',
        defaultServiceCode: null,
        capabilities: {
            code: 'UPS',
            supportsBooking: false,
            supportsRating: false,
            supportsTracking: false,
            supportsCancellation: false,
            supportsLabelGeneration: false,
            supportsExternalApi: true,
            supportsConversionTarget: false
        }
    }
];

const normalizeCarrierCode = (carrierCode) => {
    const code = String(carrierCode || 'DGR').toUpperCase();
    if (code === 'DHL') return 'DGR';
    if (code === 'LOGESTECHS') return 'OTE';
    return code;
};

/**
 * Factory class to get the appropriate carrier adapter
 */
class CarrierFactory {
    /**
     * List of carriers that have active implementations.
     */
    static getAvailableCarriers() {
        return CARRIER_REGISTRY.map((carrier) => ({
            ...carrier,
            capabilities: { ...carrier.capabilities }
        }));
    }

    static getCarrierMetadata(carrierCode) {
        const normalizedCode = normalizeCarrierCode(carrierCode);
        const metadata = CARRIER_REGISTRY.find((carrier) => carrier.code === normalizedCode);
        if (!metadata) return null;
        return {
            ...metadata,
            capabilities: { ...metadata.capabilities }
        };
    }

    static getCarrierCapabilities(carrierCode) {
        return this.getCarrierMetadata(carrierCode)?.capabilities || null;
    }

    /**
     * Get a carrier adapter instance
     * @param {string} carrierCode - 'DGR', 'ARAMEX', 'FEDEX', 'UPS' (Case insensitive)
     * @param {Object} config - Optional configuration overrides
     * @returns {Object} Carrier Adapter Instance
     */
    static getAdapter(carrierCode, config = {}) {
        const code = normalizeCarrierCode(carrierCode);

        switch (code) {
            case 'INTERNAL':
                return new InternalAdapter(config);

            case 'DGR':
                return new DgrAdapter(config);

            case 'ARAMEX':
                return new AramexAdapter(config); // <-- NEW ADAPTER

            case 'OTE':
                return new LogesTechsAdapter(config);

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
