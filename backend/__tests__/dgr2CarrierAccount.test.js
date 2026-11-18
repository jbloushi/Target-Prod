const CarrierFactory = require('../src/services/CarrierFactory');
const DgrAdapter = require('../src/adapters/DgrAdapter');
const shippingAccess = require('../src/services/shippingAccess.service');

describe('Second DHL Express Account (DGR2)', () => {
    test('normalizes DGR2 and aliases to DGR2', () => {
        expect(CarrierFactory.normalizeCarrierCode('DGR2')).toBe('DGR2');
        expect(CarrierFactory.normalizeCarrierCode('DHL2')).toBe('DGR2');
        expect(CarrierFactory.normalizeCarrierCode('dhl_2')).toBe('DGR2');
        expect(CarrierFactory.normalizeCarrierCode('dgr_2')).toBe('DGR2');
        expect(CarrierFactory.normalizeCarrierCode('DHL')).toBe('DGR');
    });

    test('registers DGR2 in available carriers with full capabilities', () => {
        const carriers = CarrierFactory.getAvailableCarriers();
        const dgr2 = carriers.find(c => c.code === 'DGR2');
        expect(dgr2).toBeDefined();
        expect(dgr2.active).toBe(true);
        expect(dgr2.capabilities).toEqual(expect.objectContaining({
            code: 'DGR2',
            supportsBooking: true,
            supportsRating: true,
            supportsTracking: true,
            supportsLabelGeneration: true,
            supportsExternalApi: true,
            supportsConversionTarget: true
        }));
    });

    test('instantiates DgrAdapter with isolated DGR2 credentials and carrierCode', () => {
        const adapter = CarrierFactory.getAdapter('DGR2', {
            environment: 'production',
            apiKey: 'dhl2-key',
            apiSecret: 'dhl2-secret',
            accountNumber: '999888777',
            baseUrl: 'https://express.api.dhl.com/mydhlapi'
        });

        expect(adapter).toBeInstanceOf(DgrAdapter);
        expect(adapter.code).toBe('DGR2');
        expect(adapter.config.apiKey).toBe('dhl2-key');
        expect(adapter.config.apiSecret).toBe('dhl2-secret');
        expect(adapter.config.accountNumber).toBe('999888777');
        expect(adapter.config.carrierCode).toBe('DGR2');
    });

    test('provides DHL service options for DGR2 in shippingAccess', () => {
        const options = shippingAccess.getServiceOptions('DGR2');
        expect(options.map(o => o.serviceCode)).toEqual(expect.arrayContaining(['P', 'Y', 'H']));
    });
});
