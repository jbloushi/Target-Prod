const phenixSyncService = require('../src/services/phenixSync.service');

describe('Phenix import hardening', () => {
    test('keeps the explicit Phenix country and records phone-country conflicts', () => {
        const signals = phenixSyncService.resolveDestinationSignals('KSA', '+96891234567');

        expect(signals.resolved).toEqual({ code: 'SA', name: 'Saudi Arabia' });
        expect(signals.phoneCountry).toEqual({ code: 'OM', name: 'Oman' });
        expect(signals.conflict).toBe(true);
    });

    test('uses phone country only when Phenix has no country signal', () => {
        const signals = phenixSyncService.resolveDestinationSignals('', '+96891234567');

        expect(signals.resolved).toEqual({ code: 'OM', name: 'Oman' });
        expect(signals.conflict).toBe(false);
    });

    test('generates a stable source key for the same Phenix bill', () => {
        const first = phenixSyncService.sourceKeyForRow({}, { billId: '45973', carrierTracking: '38290311684', receiptNo: '653112' });
        const second = phenixSyncService.sourceKeyForRow({}, { billId: '45973', carrierTracking: 'different', receiptNo: 'different' });

        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });
});
