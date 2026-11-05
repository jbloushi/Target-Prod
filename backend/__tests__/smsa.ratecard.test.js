const RateCardService = require('../src/services/RateCardService');

describe('RateCardService SMSA zones', () => {
    const card = {
        id: 'SMSA_TEST', name: 'SMSA Test', carrierCode: 'SMSA', currency: 'SAR', pricingMode: 'SELLING_PRICE',
        countryZones: { SA: 1, AE: 2 }, defaultZone: 3, maxBracketWeight: 30, weightStep: 0.5,
        brackets: [{ weight: 0.5, rates: { 1: 10, 2: 20, 3: 30 } }, { weight: 1, rates: { 1: 12, 2: 22, 3: 32 } }, { weight: 30, rates: { 1: 50, 2: 60, 3: 70 } }]
    };

    test('resolveZone uses card zones then default for SMSA', () => {
        expect(RateCardService.resolveZone('SMSA', 'ae', card)).toBe(2);
        expect(RateCardService.resolveZone('SMSA', 'KW', card)).toBe(3);
        expect(RateCardService.resolveZone('SMSA', 'KW')).toBe(1);
    });

    test('calculateRate prices SMSA card by zone', () => {
        RateCardService.rateCards.set('SMSA_TEST', card);
        const r = RateCardService.calculateRate({ rateCardId: 'SMSA_TEST', carrierCode: 'SMSA', countryCode: 'SA', weight: 0.8 });
        expect(r).toMatchObject({ zone: 1, baseRate: 12, totalPrice: 12, currency: 'SAR' });
    });
});
