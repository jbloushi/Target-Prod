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
        let branding = {};
        try {
            const { getSystemSettings } = require('./systemSettings.service');
            branding = getSystemSettings()?.carrierBranding || {};
        } catch {
            // fallback gracefully to hardcoded names
        }

        return CARRIER_REGISTRY.map((carrier) => {
            const custom = branding[carrier.code];
            return {
                ...carrier,
                name: custom?.name || carrier.name,
                description: custom?.description || carrier.description,
                badge: custom?.badge || null,
                active: custom?.active !== undefined ? custom.active : carrier.active,
                capabilities: { ...carrier.capabilities }
            };
        });
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
        const isTestExplicit = config.isTest === true || config.environment === 'test';
        const isProductionExplicit = config.isTest === false || config.environment === 'production';
        
        let resolvedEnv = isTestExplicit ? 'test' : 'production';
        if (!isTestExplicit && !isProductionExplicit) {
            try {
                const { getSystemSettings } = require('./systemSettings.service');
                const carrierEnvs = getSystemSettings()?.carrierEnvironments;
                const envForCarrier = (code === 'OTE' || code === 'LOGESTECHS') ? carrierEnvs?.OTE : carrierEnvs?.DHL;
                if (envForCarrier) resolvedEnv = envForCarrier;
            } catch {
                // fallback to production
            }
        }

        const isTest = resolvedEnv === 'test';
        const environment = resolvedEnv;
        const resolvedConfig = { isTest, environment, ...config };

        switch (code) {
            case 'INTERNAL':
                return new InternalAdapter(resolvedConfig);

            case 'DGR':
                return new DgrAdapter(resolvedConfig);

            case 'ARAMEX':
                return new AramexAdapter(resolvedConfig);

            case 'OTE':
                return new LogesTechsAdapter(resolvedConfig);

            case 'FEDEX':
                return new FedexAdapter(resolvedConfig);

            case 'UPS':
                throw new Error('UPS integration not yet implemented');

            default:
                throw new Error(`Carrier '${carrierCode}' not supported`);
        }
    }
}

module.exports = CarrierFactory;
