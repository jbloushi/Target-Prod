const axios = require('axios');

jest.mock('axios', () => ({
    create: jest.fn()
}));

describe('Milestone 1 Challenger 2: CarrierFactory Resolution, Environment Routing & Document/Tracking Shapes', () => {
    let CarrierFactory, SmsaAdapter, mockClient;

    beforeEach(() => {
        jest.resetModules();
        mockClient = {
            request: jest.fn(),
            defaults: { baseURL: '' }
        };
        require('axios').create.mockImplementation((config) => {
            mockClient.defaults.baseURL = config?.baseURL;
            return mockClient;
        });
        CarrierFactory = require('../src/services/CarrierFactory');
        SmsaAdapter = require('../src/adapters/SmsaAdapter');
    });

    const createValidShipment = (overrides = {}) => ({
        OrderNumber: 'ORD-TEST-CH2',
        ShipDate: '2026-10-25T12:00:00Z',
        ShipmentCurrency: 'SAR',
        CODAmount: 0,
        DeclaredValue: 100,
        ContentDescription: 'Test Goods',
        Parcels: 1,
        Weight: 1.5,
        WeightUnit: 'KG',
        WaybillType: 'PDF',
        ShipperAddress: {
            ContactName: 'Test Shipper Co',
            ContactPhoneNumber: '+96522334455',
            AddressLine1: 'Warehouse Street Block 4',
            City: 'Kuwait City',
            Country: 'KW'
        },
        ConsigneeAddress: {
            ContactName: 'Test Receiver Co',
            ContactPhoneNumber: '+966551234567',
            AddressLine1: 'King Fahd Road Building 100',
            City: 'Riyadh',
            Country: 'SA'
        },
        ...overrides
    });

    describe('1. CarrierFactory Resolution', () => {
        test("CarrierFactory.normalizeCarrierCode('SMSA') -> 'SMSA'", () => {
            expect(CarrierFactory.normalizeCarrierCode('SMSA')).toBe('SMSA');
        });

        test("CarrierFactory.normalizeCarrierCode('smsa') -> 'SMSA'", () => {
            expect(CarrierFactory.normalizeCarrierCode('smsa')).toBe('SMSA');
        });

        test("CarrierFactory.normalizeCarrierCode('smsaexpress') -> 'SMSA'", () => {
            expect(CarrierFactory.normalizeCarrierCode('smsaexpress')).toBe('SMSA');
        });

        test("CarrierFactory.normalizeCarrierCode('SMSA_EXPRESS') -> 'SMSA'", () => {
            expect(CarrierFactory.normalizeCarrierCode('SMSA_EXPRESS')).toBe('SMSA');
        });

        test("CarrierFactory.normalizeCarrierCode aliases: 'SMSAEXPRESS', 'smsa_express'", () => {
            expect(CarrierFactory.normalizeCarrierCode('SMSAEXPRESS')).toBe('SMSA');
            expect(CarrierFactory.normalizeCarrierCode('smsa_express')).toBe('SMSA');
        });

        test("CarrierFactory.getAdapter('SMSA') returns SmsaAdapter instance", () => {
            const adapter = CarrierFactory.getAdapter('SMSA', { apiKey: 'k' });
            expect(adapter).toBeInstanceOf(SmsaAdapter);
            expect(adapter.code).toBe('SMSA');
        });

        test("CarrierFactory.getAdapter('smsaexpress') returns SmsaAdapter instance", () => {
            const adapter = CarrierFactory.getAdapter('smsaexpress', { apiKey: 'k' });
            expect(adapter).toBeInstanceOf(SmsaAdapter);
            expect(adapter.code).toBe('SMSA');
        });

        test("CarrierFactory.getAdapter('SMSA_EXPRESS') returns SmsaAdapter instance", () => {
            const adapter = CarrierFactory.getAdapter('SMSA_EXPRESS', { apiKey: 'k' });
            expect(adapter).toBeInstanceOf(SmsaAdapter);
            expect(adapter.code).toBe('SMSA');
        });

        test("CarrierFactory registry includes SMSA with conversion target enabled", () => {
            const carriers = CarrierFactory.getAvailableCarriers();
            const smsa = carriers.find((c) => c.code === 'SMSA');
            expect(smsa).toBeDefined();
            expect(smsa.active).toBe(true);
            expect(smsa.capabilities.supportsConversionTarget).toBe(true);
            expect(smsa.capabilities.supportsBooking).toBe(true);
            expect(smsa.capabilities.supportsRating).toBe(true);
            expect(smsa.capabilities.supportsTracking).toBe(true);
        });
    });

    describe('2. Environment Routing & baseUrl Investigation', () => {
        test("CarrierFactory.getAdapter('SMSA', { environment: 'production' }) routes to production URL", () => {
            const adapter = CarrierFactory.getAdapter('SMSA', { environment: 'production', apiKey: 'k' });
            expect(adapter).toBeInstanceOf(SmsaAdapter);
            expect(adapter.config.environment).toBe('production');
            expect(adapter.config.isTest).toBe(false);
            expect(adapter.config.baseUrl).toBe('https://ecomapis.smsaexpress.com');
            expect(adapter.client.defaults.baseURL).toBe('https://ecomapis.smsaexpress.com');
        });

        test("CarrierFactory.getAdapter('SMSA', { environment: 'sandbox' }) routes to sandbox URL", () => {
            const adapter = CarrierFactory.getAdapter('SMSA', { environment: 'sandbox', apiKey: 'k' });
            expect(adapter).toBeInstanceOf(SmsaAdapter);
            expect(adapter.config.environment).toBe('sandbox');
            expect(adapter.config.isTest).toBe(true);
            expect(adapter.config.baseUrl).toBe('https://ecomapis-sandbox.azurewebsites.net');
            expect(adapter.client.defaults.baseURL).toBe('https://ecomapis-sandbox.azurewebsites.net');
        });

        test("CarrierFactory.getAdapter('SMSA', { isTest: true }) routes to sandbox URL", () => {
            const adapter = CarrierFactory.getAdapter('SMSA', { isTest: true, apiKey: 'k' });
            expect(adapter.config.baseUrl).toBe('https://ecomapis-sandbox.azurewebsites.net');
        });

        test("EMPIRICAL CHECK: Does adapter.baseUrl property exist directly on the instance?", () => {
            const prod = CarrierFactory.getAdapter('SMSA', { environment: 'production', apiKey: 'k' });
            const sandbox = CarrierFactory.getAdapter('SMSA', { environment: 'sandbox', apiKey: 'k' });

            // Note: Currently, adapter.baseUrl is undefined on CarrierAdapter/SmsaAdapter instances
            // baseUrl is stored under adapter.config.baseUrl and adapter.client.defaults.baseURL
            const prodDirectBaseUrl = prod.baseUrl;
            const sandboxDirectBaseUrl = sandbox.baseUrl;

            const prodEffectiveBaseUrl = prod.baseUrl || prod.config?.baseUrl;
            const sandboxEffectiveBaseUrl = sandbox.baseUrl || sandbox.config?.baseUrl;

            expect(prodEffectiveBaseUrl).toBe('https://ecomapis.smsaexpress.com');
            expect(sandboxEffectiveBaseUrl).toBe('https://ecomapis-sandbox.azurewebsites.net');

            // Record empirical finding for report
            expect({
                prodDirectBaseUrl,
                prodConfigBaseUrl: prod.config.baseUrl,
                sandboxDirectBaseUrl,
                sandboxConfigBaseUrl: sandbox.config.baseUrl
            }).toEqual({
                prodDirectBaseUrl: undefined,
                prodConfigBaseUrl: 'https://ecomapis.smsaexpress.com',
                sandboxDirectBaseUrl: undefined,
                sandboxConfigBaseUrl: 'https://ecomapis-sandbox.azurewebsites.net'
            });
        });
    });

    describe('3. Document Handling (createShipment PDF and ZPL formats)', () => {
        test("createShipment formats PDF base64 into 'data:application/pdf;base64,...'", async () => {
            const rawPdfBase64 = 'JVBERi0xLjQKJSDi48...MOCK_PDF_DATA';
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290099887766',
                    waybillLabel: rawPdfBase64
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const shipment = createValidShipment({ WaybillType: 'PDF' });
            const result = await adapter.createShipment(shipment);

            expect(result.trackingNumber).toBe('290099887766');
            expect(result.carrierShipmentId).toBe('290099887766');
            expect(result.labelBase64).toBe(rawPdfBase64);
            expect(result.labelUrl).toBe(`data:application/pdf;base64,${rawPdfBase64}`);
            expect(result.awbUrl).toBe(`data:application/pdf;base64,${rawPdfBase64}`);
            expect(result.documents).toHaveLength(1);
            expect(result.documents[0]).toEqual({
                type: 'label',
                format: 'pdf',
                data: `data:application/pdf;base64,${rawPdfBase64}`,
                url: `data:application/pdf;base64,${rawPdfBase64}`
            });
        });

        test("createShipment formats ZPL base64 into 'data:application/x-zpl;base64,...' when WaybillType is ZPL", async () => {
            const rawZplBase64 = 'XlhBPkZESGVsbG8gV29ybGReWFo=';
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290099887767',
                    waybillLabel: rawZplBase64
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const shipment = createValidShipment({ WaybillType: 'ZPL' });
            const result = await adapter.createShipment(shipment);

            expect(result.trackingNumber).toBe('290099887767');
            expect(result.labelBase64).toBe(rawZplBase64);
            expect(result.labelUrl).toBe(`data:application/x-zpl;base64,${rawZplBase64}`);
            expect(result.awbUrl).toBe(`data:application/x-zpl;base64,${rawZplBase64}`);
            expect(result.documents).toHaveLength(1);
            expect(result.documents[0]).toEqual({
                type: 'label',
                format: 'zpl',
                data: `data:application/x-zpl;base64,${rawZplBase64}`,
                url: `data:application/x-zpl;base64,${rawZplBase64}`
            });
        });

        test("createShipment formats ZPL base64 when response waybillType is 'ZPL'", async () => {
            const rawZplBase64 = 'XlhBPkZESGVsbG8gV29ybGReWFo=';
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290099887768',
                    waybillLabel: rawZplBase64,
                    waybillType: 'ZPL'
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const shipment = createValidShipment({ WaybillType: 'PDF' }); // Request was PDF, but SMSA returned ZPL
            const result = await adapter.createShipment(shipment);

            expect(result.labelUrl).toBe(`data:application/x-zpl;base64,${rawZplBase64}`);
            expect(result.documents[0].format).toBe('zpl');
            expect(result.documents[0].data).toBe(`data:application/x-zpl;base64,${rawZplBase64}`);
        });

        test("createShipment formats ZPL when raw label string starts with '^XA'", async () => {
            const rawZplString = '^XA^FO50,50^ADN,36,20^FDTEST^FS^XZ';
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290099887769',
                    waybillLabel: rawZplString
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const shipment = createValidShipment();
            const result = await adapter.createShipment(shipment);

            expect(result.labelUrl).toBe(`data:application/x-zpl;base64,${rawZplString}`);
            expect(result.documents[0].format).toBe('zpl');
        });

        test("createShipment preserves pre-existing data: URI without double-prefixing", async () => {
            const preformattedDataUri = 'data:application/pdf;base64,JVBERi0xLjQK...';
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290099887770',
                    waybillLabel: preformattedDataUri
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const shipment = createValidShipment();
            const result = await adapter.createShipment(shipment);

            expect(result.labelUrl).toBe(preformattedDataUri);
            expect(result.labelUrl.startsWith('data:data:')).toBe(false);
            expect(result.documents[0].data).toBe(preformattedDataUri);
        });

        test("createShipment preserves HTTP/HTTPS URLs without converting to data: URI", async () => {
            const httpLabelUrl = 'https://labels.smsaexpress.com/download/290099887771.pdf';
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290099887771',
                    waybillLabel: httpLabelUrl
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const shipment = createValidShipment();
            const result = await adapter.createShipment(shipment);

            expect(result.labelUrl).toBe(httpLabelUrl);
            expect(result.documents[0].data).toBe(httpLabelUrl);
            expect(result.documents[0].url).toBe(httpLabelUrl);
        });
    });

    describe('4. Tracking Data Shapes (getTracking)', () => {
        test("getTracking returns normalized events with timestamp, localTimestamp, and status codes", async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    awb: '290011223344',
                    statusCode: 'IN_TRANSIT',
                    statusDescription: 'Package in transit',
                    estimatedDeliveryDate: '2026-10-28T14:00:00Z',
                    carrierWeight: 3.2,
                    carrierPieces: 1,
                    history: [
                        {
                            checkpointCode: 'PU',
                            checkpointDescription: 'Shipment collected',
                            location: 'Kuwait Central Hub',
                            timestamp: '2026-10-25T08:30:00Z',
                            localTimestamp: '2026-10-25 11:30:00',
                            timezoneOffset: '+03:00'
                        },
                        {
                            checkpointCode: 'DEP',
                            checkpointDescription: 'Departed Kuwait facility',
                            location: 'Kuwait Airport Cargo Terminal',
                            timestamp: '2026-10-25T14:15:00Z',
                            localTimestamp: '2026-10-25 17:15:00',
                            timezoneOffset: '+03:00'
                        },
                        {
                            checkpointCode: 'ARR',
                            checkpointDescription: 'Arrived at destination customs facility',
                            location: 'Riyadh Hub',
                            timestamp: '2026-10-25T20:00:00Z',
                            localTimestamp: '2026-10-25 23:00:00',
                            timezoneOffset: '+03:00'
                        }
                    ]
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const tracking = await adapter.getTracking('SMSA-290011223344');

            expect(mockClient.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'get',
                    url: '/api/track/single/290011223344'
                })
            );

            expect(tracking.carrierCode).toBe('SMSA');
            expect(tracking.trackingNumber).toBe('290011223344');
            expect(tracking.status).toBe('IN_TRANSIT');
            expect(tracking.description).toBe('Package in transit');
            expect(tracking.carrierWeight).toBe(3.2);
            expect(tracking.carrierPieces).toBe(1);
            expect(tracking.estimatedDelivery).toEqual(new Date('2026-10-28T14:00:00Z'));

            expect(Array.isArray(tracking.events)).toBe(true);
            expect(tracking.events).toHaveLength(3);

            tracking.events.forEach((event) => {
                expect(event).toHaveProperty('timestamp');
                expect(event).toHaveProperty('localTimestamp');
                expect(event).toHaveProperty('statusCode');
                expect(event).toHaveProperty('status');
                expect(event).toHaveProperty('description');
                expect(event).toHaveProperty('timezoneOffset');
                expect(event).toHaveProperty('location');

                expect(typeof event.timestamp).toBe('string');
                expect(typeof event.localTimestamp).toBe('string');
                expect(typeof event.statusCode).toBe('string');
                expect(event.statusCode.length).toBeGreaterThan(0);
            });

            expect(tracking.events[0]).toEqual({
                statusCode: 'PU',
                status: 'PU',
                description: 'Shipment collected',
                location: 'Kuwait Central Hub',
                timestamp: '2026-10-25T08:30:00Z',
                localTimestamp: '2026-10-25 11:30:00',
                timezoneOffset: '+03:00'
            });
        });

        test("getTracking normalizes alternate field names in event items (events vs history, Date vs timestamp)", async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    statusCode: 'DELIVERED',
                    events: [
                        {
                            statusCode: 'DLV',
                            statusDescription: 'Delivered to recipient',
                            city: 'Riyadh',
                            Date: '2026-10-26T10:00:00Z'
                        }
                    ]
                }
            });

            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            const tracking = await adapter.getTracking('290011223355');

            expect(tracking.events).toHaveLength(1);
            expect(tracking.events[0].statusCode).toBe('DLV');
            expect(tracking.events[0].description).toBe('Delivered to recipient');
            expect(tracking.events[0].location).toBe('Riyadh');
            expect(tracking.events[0].timestamp).toBe('2026-10-26T10:00:00Z');
            expect(tracking.events[0].localTimestamp).toBe('2026-10-26T10:00:00Z');
        });

        test("getTracking strips 'SMSA' or 'SMSA-' prefix from tracking number", async () => {
            mockClient.request.mockResolvedValue({ data: { statusCode: 'OK' } });
            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });

            await adapter.getTracking('SMSA-112233');
            expect(mockClient.request).toHaveBeenLastCalledWith(
                expect.objectContaining({ url: '/api/track/single/112233' })
            );

            await adapter.getTracking('smsa112233');
            expect(mockClient.request).toHaveBeenLastCalledWith(
                expect.objectContaining({ url: '/api/track/single/112233' })
            );
        });

        test("getTracking rejects empty or missing trackingNumber", async () => {
            const adapter = new SmsaAdapter({ apiKey: 'k', baseUrl: 'https://sandbox' });
            await expect(adapter.getTracking('')).rejects.toMatchObject({ statusCode: 400 });
            await expect(adapter.getTracking(null)).rejects.toMatchObject({ statusCode: 400 });
            await expect(adapter.getTracking(undefined)).rejects.toMatchObject({ statusCode: 400 });
        });
    });
});
