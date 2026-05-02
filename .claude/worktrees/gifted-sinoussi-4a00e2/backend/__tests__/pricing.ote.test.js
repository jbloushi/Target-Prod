const PricingService = require('../src/services/pricing.service');

describe('PricingService OTE carrier pricing policy', () => {
    it('defaults OTE fee to 25 AED when user has no override', () => {
        const policy = PricingService.resolveCarrierPricingPolicy({}, 'OTE');

        expect(policy).toEqual({
            fixedFee: 25,
            currency: 'AED'
        });
        expect(PricingService.applyCarrierBasePricePolicy(7.5, {}, 'OTE')).toBe(25);
    });

    it('uses per-user OTE fee and currency override', () => {
        const user = {
            carrierConfig: {
                pricingByCarrier: {
                    OTE: { fixedFee: 33, currency: 'usd' }
                }
            }
        };
        const policy = PricingService.resolveCarrierPricingPolicy(user, 'OTE');

        expect(policy).toEqual({
            fixedFee: 33,
            currency: 'USD'
        });
        expect(PricingService.applyCarrierBasePricePolicy(7.5, user, 'OTE')).toBe(33);
    });

    it('does not override non-OTE carrier base pricing', () => {
        const user = {
            carrierConfig: {
                pricingByCarrier: {
                    DGR: { fixedFee: 19, currency: 'KWD' }
                }
            }
        };

        expect(PricingService.applyCarrierBasePricePolicy(11.25, user, 'DGR')).toBe(11.25);
    });
});
