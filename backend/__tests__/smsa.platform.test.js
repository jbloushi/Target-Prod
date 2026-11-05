jest.mock('axios', () => ({ create: jest.fn() }));

describe('SMSA platform wiring', () => {
    beforeEach(() => { jest.resetModules(); });

    test('UniversalTrackingService routes SMSA to the adapter and normalizes status', async () => {
        const client = { request: jest.fn().mockResolvedValue({ data: {
            statusCode: 'DLV', statusDescription: 'Delivered',
            history: [{ checkpointCode: 'PU', checkpointDescription: 'Picked', location: 'A', timestamp: 't1' }, { checkpointCode: 'DLV', checkpointDescription: 'Delivered', location: 'B', timestamp: 't2' }]
        } }) };
        require('axios').create.mockReturnValue(client);
        process.env.SMSA_API_KEY = 'unit-test-key';
        const svc = require('../src/services/UniversalTrackingService');
        const res = await svc.getTracking('SMSA', '290019283941');
        expect(res.provider).toBe('smsa_api');
        expect(res.status).toBe('delivered');
        expect(res.events).toHaveLength(2);
    });

    test('normalizeCarrierStatus maps SMSA checkpoints', () => {
        const { normalizeCarrierStatus } = require('../src/constants/statusConstants');
        expect(normalizeCarrierStatus('x', 'SMSA', 'OUT_FOR_DLV')).toBe('out_for_delivery');
        expect(normalizeCarrierStatus('x', 'smsaexpress', 'RTO')).toBe('returned');
    });

    test('import rate card reads optional countries sheet', async () => {
        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Weight', 'Zone 1', 'Zone 2'], [0.5, 10, 20], [1, 12, 22]]), 'Rates');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Country', 'Zone'], ['SA', 1], ['AE', 2]]), 'Countries');
        const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const fs = require('fs');
        const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const svc = require('../src/services/RateCardService');
        jest.spyOn(svc, 'loadRateCards').mockImplementation(() => {});
        jest.spyOn(svc, 'getRateCard').mockImplementation(() => ({ id: 'T', name: 'T', carrierCode: 'SMSA', brackets: [] }));
        await svc.importRateCardFromBase64({ id: 't', name: 'T', carrierCode: 'SMSA', currency: 'SAR', fileBase64: b64 });
        const saved = JSON.parse(writeSpy.mock.calls[0][1]);
        expect(saved.carrierCode).toBe('SMSA');
        expect(saved.countryZones).toEqual({ SA: 1, AE: 2 });
    });
});
