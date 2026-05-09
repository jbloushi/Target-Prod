const CarrierAdapter = require('./CarrierAdapter');

const INTERNAL_CAPABILITIES = {
    code: 'INTERNAL',
    supportsBooking: true,
    supportsRating: true,
    supportsTracking: true,
    supportsCancellation: false,
    supportsLabelGeneration: false,
    supportsExternalApi: false
};

class InternalAdapter extends CarrierAdapter {
    constructor(config = {}) {
        super(config);
        this.code = 'INTERNAL';
        this.name = 'Internal';
        this.trackingPrefix = 'TGR';
        this.defaultServiceCode = 'STD';
        this.capabilities = INTERNAL_CAPABILITIES;
    }

    async getRates(normalizedShipment = {}) {
        return [{
            success: true,
            carrier: this.code,
            carrierCode: this.code,
            serviceName: 'Internal Standard',
            serviceCode: this.defaultServiceCode,
            rateType: 'INTERNAL',
            requiresManualPricing: true,
            amount: null,
            totalPrice: null,
            currency: normalizedShipment.currency || 'KWD',
            pricingModel: {
                supports: [
                    'zone',
                    'route',
                    'customer',
                    'cod',
                    'weightTier',
                    'cityAreaSurcharge',
                    'contract',
                    'manualOverride'
                ]
            }
        }];
    }

    async createShipment(normalizedShipment = {}, serviceCode = this.defaultServiceCode) {
        const trackingNumber = normalizedShipment.trackingNumber;
        return {
            trackingNumber,
            carrierShipmentId: trackingNumber,
            serviceCode: serviceCode || this.defaultServiceCode,
            internallyManaged: true,
            requiresManualPricing: true,
            rawResponse: {
                carrier: this.code,
                bookedLocally: true
            }
        };
    }

    async getTracking(trackingNumber) {
        return {
            trackingNumber,
            carrierCode: this.code,
            status: 'booked',
            events: []
        };
    }

    async cancelShipment() {
        throw new Error('Internal carrier cancellation is not supported');
    }
}

InternalAdapter.capabilities = INTERNAL_CAPABILITIES;

module.exports = InternalAdapter;
