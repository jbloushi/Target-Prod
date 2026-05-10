describe('ShipmentDraftService manual pricing', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('returns a manual pricing snapshot when the carrier quote requires manual pricing', async () => {
        const getRates = jest.fn().mockResolvedValue([
            {
                serviceCode: 'STD',
                serviceName: 'Internal Standard',
                currency: 'KWD',
                requiresManualPricing: true,
                totalPrice: null
            }
        ]);

        jest.doMock('../src/config/database', () => ({
            prisma: {}
        }));

        jest.doMock('../src/services/CarrierFactory', () => ({
            getCarrierMetadata: jest.fn(() => ({ defaultServiceCode: 'STD' })),
            getAdapter: jest.fn(() => ({
                getRates
            }))
        }));

        const ShipmentDraftService = require('../src/services/ShipmentDraftService');
        const snapshot = await ShipmentDraftService.getSecurePricing(
            {
                carrierCode: 'INTERNAL',
                serviceCode: 'STD',
                currency: 'KWD'
            },
            { organization: {} }
        );

        expect(getRates).toHaveBeenCalledTimes(1);
        expect(snapshot).toEqual(expect.objectContaining({
            carrierRate: 0,
            markup: 0,
            totalPrice: 0,
            currency: 'KWD',
            billingCurrency: 'KWD',
            requiresManualPricing: true,
            rateType: 'MANUAL'
        }));
    });
});
