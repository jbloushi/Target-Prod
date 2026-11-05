jest.mock('axios', () => ({ create: jest.fn() }));

describe('SmsaAdapter', () => {
    let SmsaAdapter, CarrierFactory, client;

    beforeEach(() => {
        jest.resetModules();
        client = { request: jest.fn() };
        require('axios').create.mockReturnValue(client);
        SmsaAdapter = require('../src/adapters/SmsaAdapter');
        CarrierFactory = require('../src/services/CarrierFactory');
    });

    const adapter = () => new SmsaAdapter({ apiKey: 'test-key', baseUrl: 'https://sandbox.example' });

    const shipment = () => ({
        orderNumber: 'ORD-1',
        codAmount: 10,
        declaredValue: 10,
        description: 'Shirts',
        weight: 1.5,
        currency: 'SAR',
        sender: { name: 'Shipper Co', phone: '966500000000', street: 'Dababh St Riyadh', city: 'Riyadh', country: 'sa' },
        receiver: { name: 'Ahmed Al-Mutawa', phone: '966501234567', street: 'Olaya Main Street 442', city: 'Jeddah', country: 'SA', shortCode: 'RRRD2929' }
    });

    const ok = (data) => client.request.mockResolvedValue({ data });
    const lastCall = () => client.request.mock.calls[0][0];

    test('factory resolves SMSA and smsaexpress alias', () => {
        expect(CarrierFactory.getAdapter('SMSA', { apiKey: 'k' })).toBeInstanceOf(SmsaAdapter);
        expect(CarrierFactory.getAdapter('smsaexpress', { apiKey: 'k' })).toBeInstanceOf(SmsaAdapter);
        expect(CarrierFactory.getCarrierMetadata('smsaexpress').code).toBe('SMSA');
    });

    test('createShipment posts to b2c/new with apikey and maps response', async () => {
        ok({ awbNumber: '290019283941', waybillLabel: 'JVBER' });
        const res = await adapter().createShipment(shipment(), 'EDDL');
        const c = lastCall();
        expect(c.method).toBe('post');
        expect(c.url).toBe('/api/shipment/b2c/new');
        expect(c.headers.apikey).toBe('test-key');
        expect(c.data).toMatchObject({ OrderNumber: 'ORD-1', Parcels: 1, WeightUnit: 'KG', ServiceCode: 'EDDL', ShipmentCurrency: 'SAR' });
        expect(c.data.ShipperAddress.Country).toBe('SA');
        expect(c.data.ConsigneeAddress.ShortCode).toBe('RRRD2929');
        expect(res.trackingNumber).toBe('290019283941');
        expect(res.labelBase64).toBe('JVBER');
    });

    test('validation failures do not call the API', async () => {
        const s = shipment();
        s.receiver.city = 'a';
        s.receiver.street = 'short';
        s.orderNumber = '';
        await expect(adapter().createShipment(s)).rejects.toMatchObject({ statusCode: 400 });
        expect(client.request).not.toHaveBeenCalled();
    });

    test('missing api key is rejected', async () => {
        const a = new SmsaAdapter({ apiKey: '', baseUrl: 'x' });
        await expect(a.getCurrencyLookup()).rejects.toThrow(/API key/);
    });

    test('provider errors are normalized', async () => {
        client.request.mockRejectedValue({ response: { status: 400, data: { title: 'Bad', errors: { Weight: ['bad weight'] } } }, message: 'x' });
        await expect(adapter().queryB2c('1')).rejects.toMatchObject({ statusCode: 400, provider: 'SMSA', message: expect.stringContaining('bad weight') });
    });

    const cases = [
        ['queryB2c', ['123'], 'get', '/api/shipment/b2c/query/123'],
        ['queryC2b', ['123'], 'get', '/api/c2b/query/123'],
        ['getCurrencyLookup', [], 'get', '/api/lookup/currency'],
        ['getOffices', [], 'get', '/api/lookup/smsaoffices'],
        ['getStatusLookup', [], 'get', '/api/track/statuslookup'],
        ['getCities', ['SA'], 'get', '/api/lookup/cities/SA'],
        ['cancelReversePickup', ['123'], 'post', '/api/c2b/cancel/123'],
        ['trackSingle', ['123'], 'get', '/api/track/single/123'],
        ['trackByReference', ['R1'], 'get', '/api/track/reference/R1'],
        ['trackBulk', [['1', '2']], 'post', '/api/track/bulk'],
        ['validateShortAddress', ['rrrd2929'], 'get', '/api/lookup/address/RRRD2929']
    ];
    test.each(cases)('%s uses correct method/url/header', async (fn, args, method, url) => {
        ok({});
        await adapter()[fn](...args);
        const c = lastCall();
        expect(c.method).toBe(method);
        expect(c.url).toBe(url);
        expect(c.headers.apikey).toBe('test-key');
    });

    test('createC2b enforces parcels 1-6 and posts', async () => {
        const body = { OrderNumber: 'R1', Parcels: 1, PickupAddress: {}, ReturnToAddress: {} };
        await expect(adapter().createC2b({ ...body, Parcels: 7 })).rejects.toMatchObject({ statusCode: 400 });
        ok({ awbNumber: 'x' });
        await adapter().createC2b(body);
        expect(lastCall().url).toBe('/api/c2b/new');
    });

    test('sendInvoice validates date and posts', async () => {
        const inv = { AWB: '1', InvoiceDate: '25/10/2026', Items: [{ sequence: 1, Quantity: 2, ItemHSCode: '6109' }] };
        await expect(adapter().sendInvoice({ ...inv, InvoiceDate: '2026-10-25' })).rejects.toMatchObject({ statusCode: 400 });
        ok({ success: true });
        await adapter().sendInvoice(inv);
        expect(lastCall().url).toBe('/api/invoice');
    });

    test('pushIdDetails validates and posts', async () => {
        await expect(adapter().pushIdDetails({ AWB: '1', IDType: 'X', IDNumber: '1' })).rejects.toMatchObject({ statusCode: 400 });
        ok({ success: true });
        await adapter().pushIdDetails({ AWB: '1', IDType: 'Iqama', IDNumber: '123' });
        expect(lastCall().method).toBe('post');
    });

    test('getTracking returns unified object', async () => {
        ok({ statusCode: 'DLV', statusDescription: 'Delivered', history: [{ checkpointCode: 'DLV', checkpointDescription: 'Delivered', location: 'Riyadh', timestamp: 't' }] });
        const t = await adapter().getTracking('123');
        expect(t).toMatchObject({ carrierCode: 'SMSA', status: 'DLV' });
        expect(t.events).toHaveLength(1);
    });

    test('trackBulk rejects non-string arrays', async () => {
        await expect(adapter().trackBulk([1])).rejects.toMatchObject({ statusCode: 400 });
    });
});
