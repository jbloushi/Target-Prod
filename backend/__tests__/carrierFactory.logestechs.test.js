describe('CarrierFactory LogesTechs registration', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('exposes OTE in available carriers', () => {
        const CarrierFactory = require('../src/services/CarrierFactory');
        const carriers = CarrierFactory.getAvailableCarriers().map((c) => c.code);
        expect(carriers).toContain('OTE');
    });

    it('returns LogesTechs adapter instance', () => {
        const CarrierFactory = require('../src/services/CarrierFactory');
        const adapter = CarrierFactory.getAdapter('logestechs', {
            companyId: 'cmp',
            username: 'usr',
            password: 'pwd',
            email: 'ops@example.com'
        });

        expect(adapter.code).toBe('OTE');
        expect(typeof adapter.createShipment).toBe('function');
        expect(typeof adapter.getVillages).toBe('function');
    });
});
