jest.mock('axios', () => ({ create: jest.fn() }));

describe('SMSA Adapter - 15 Endpoints & Standard Adapter Contract', () => {
    let SmsaAdapter, CarrierFactory, mockClient;

    beforeEach(() => {
        jest.resetModules();
        mockClient = {
            request: jest.fn()
        };
        require('axios').create.mockReturnValue(mockClient);
        SmsaAdapter = require('../src/adapters/SmsaAdapter');
        CarrierFactory = require('../src/services/CarrierFactory');
    });

    const createAdapter = (config = {}) => new SmsaAdapter({
        apiKey: 'test-smsa-api-key',
        baseUrl: 'https://ecomapis-sandbox.azurewebsites.net',
        ...config
    });

    const sampleB2cShipment = () => ({
        orderNumber: 'ORD-SMSA-001',
        codAmount: 50.0,
        declaredValue: 120.0,
        contentDescription: 'Consumer Electronics',
        weight: 1.75,
        weightUnit: 'KG',
        currency: 'SAR',
        parcels: 1,
        shipDate: '2026-10-25T10:00:00Z',
        waybillType: 'PDF',
        sender: {
            name: 'Target Logistics Hub',
            phone: '+96522001122',
            street: 'Airport Cargo Terminal Gate 4',
            city: 'Kuwait City',
            country: 'KW'
        },
        receiver: {
            name: 'Ahmed Al-Mutawa',
            phone: '+966501234567',
            street: 'Olaya Main Street Building 442',
            city: 'Riyadh',
            country: 'SA',
            shortCode: 'RRRD2929'
        }
    });

    describe('CarrierFactory Registration & Metadata', () => {
        test('resolves SMSA carrier code and SMSAEXPRESS alias', () => {
            const adapterFromSmsa = CarrierFactory.getAdapter('SMSA', { apiKey: 'unit-key' });
            const adapterFromAlias = CarrierFactory.getAdapter('SMSAEXPRESS', { apiKey: 'unit-key' });
            expect(adapterFromSmsa).toBeInstanceOf(SmsaAdapter);
            expect(adapterFromAlias).toBeInstanceOf(SmsaAdapter);
        });

        test('returns correct carrier metadata and capabilities from registry', () => {
            const meta = CarrierFactory.getCarrierMetadata('SMSA');
            expect(meta).toBeDefined();
            expect(meta.code).toBe('SMSA');
            expect(meta.name).toBe('SMSA Express');
            expect(meta.trackingPrefix).toBe('SMSA');
            expect(meta.defaultServiceCode).toBe('DLV');
            expect(meta.capabilities.supportsBooking).toBe(true);
            expect(meta.capabilities.supportsRating).toBe(true);
            expect(meta.capabilities.supportsTracking).toBe(true);
            expect(meta.capabilities.supportsConversionTarget).toBe(true);
        });

        test('normalizes carrier codes accurately', () => {
            expect(CarrierFactory.normalizeCarrierCode('SMSA')).toBe('SMSA');
            expect(CarrierFactory.normalizeCarrierCode('smsa')).toBe('SMSA');
            expect(CarrierFactory.normalizeCarrierCode('SMSAEXPRESS')).toBe('SMSA');
            expect(CarrierFactory.normalizeCarrierCode('smsaexpress')).toBe('SMSA');
            expect(CarrierFactory.normalizeCarrierCode('SMSA_EXPRESS')).toBe('SMSA');
        });
    });

    describe('Configuration & Environment Routing', () => {
        test('defaults to sandbox environment with sandbox URL', () => {
            const adapter = new SmsaAdapter({ apiKey: 'key1' });
            expect(adapter.config.environment).toBe('sandbox');
            expect(adapter.config.baseUrl).toBe('https://ecomapis-sandbox.azurewebsites.net');
        });

        test('routes to production URL when environment is production', () => {
            const adapter = new SmsaAdapter({ apiKey: 'key2', environment: 'production' });
            expect(adapter.config.environment).toBe('production');
            expect(adapter.config.baseUrl).toBe('https://ecomapis.smsaexpress.com');
        });

        test('sends apikey header on every request without hardcoded keys', async () => {
            mockClient.request.mockResolvedValue({ data: [] });
            const adapter = new SmsaAdapter({ apiKey: 'dynamic-configured-key-987' });
            await adapter.getCurrencies();

            expect(mockClient.request).toHaveBeenCalledTimes(1);
            const callConfig = mockClient.request.mock.calls[0][0];
            expect(callConfig.headers.apikey).toBe('dynamic-configured-key-987');
            expect(callConfig.headers['Content-Type']).toBe('application/json');
        });
    });

    describe('Endpoint 1: Create B2C Shipment (POST /api/shipment/b2c/new)', () => {
        test('createB2CShipment sends correct method, URL, headers and body', async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290019283941',
                    orderNumber: 'ORD-SMSA-001',
                    status: 'Created',
                    waybillType: 'PDF',
                    waybillLabel: 'JVBERi0xLjQKJSDi48...'
                }
            });

            const adapter = createAdapter();
            const payload = {
                OrderNumber: 'ORD-SMSA-001',
                ShipDate: '2026-10-25T10:00:00Z',
                ShipmentCurrency: 'SAR',
                CODAmount: 50.0,
                DeclaredValue: 120.0,
                ContentDescription: 'Consumer Electronics',
                Parcels: 1,
                Weight: 1.75,
                WeightUnit: 'KG',
                WaybillType: 'PDF',
                ShipperAddress: {
                    ContactName: 'Target Logistics Hub',
                    ContactPhoneNumber: '+96522001122',
                    AddressLine1: 'Airport Cargo Terminal Gate 4',
                    City: 'Kuwait City',
                    Country: 'KW'
                },
                ConsigneeAddress: {
                    ContactName: 'Ahmed Al-Mutawa',
                    ContactPhoneNumber: '+966501234567',
                    AddressLine1: 'Olaya Main Street Building 442',
                    City: 'Riyadh',
                    Country: 'SA'
                }
            };

            const res = await adapter.createB2CShipment(payload);

            expect(mockClient.request).toHaveBeenCalledTimes(1);
            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/shipment/b2c/new');
            expect(call.headers.apikey).toBe('test-smsa-api-key');
            expect(call.data).toEqual(payload);
            expect(res.awbNumber).toBe('290019283941');
        });

        test('standard createShipment normalizes PDF response into unified CarrierAdapter contract', async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290019283941',
                    orderNumber: 'ORD-SMSA-001',
                    status: 'Created',
                    waybillType: 'PDF',
                    waybillLabel: 'JVBERi0xLjQKJSDi48...'
                }
            });

            const adapter = createAdapter();
            const result = await adapter.createShipment(sampleB2cShipment(), 'DLV');

            expect(result.carrierCode).toBe('SMSA');
            expect(result.trackingNumber).toBe('290019283941');
            expect(result.carrierShipmentId).toBe('290019283941');
            expect(result.labelUrl).toBe('data:application/pdf;base64,JVBERi0xLjQKJSDi48...');
            expect(result.awbUrl).toBe('data:application/pdf;base64,JVBERi0xLjQKJSDi48...');
            expect(result.documents).toEqual([
                {
                    type: 'label',
                    format: 'pdf',
                    data: 'data:application/pdf;base64,JVBERi0xLjQKJSDi48...',
                    url: 'data:application/pdf;base64,JVBERi0xLjQKJSDi48...'
                }
            ]);
            expect(result.rawResponse).toBeDefined();
        });

        test('standard createShipment handles ZPL WaybillType format', async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    awbNumber: '290019283942',
                    waybillType: 'ZPL',
                    waybillLabel: '^XA^FO50,50^ADN,36,20^FDTarget Logistics^FS^XZ'
                }
            });

            const adapter = createAdapter();
            const shipmentData = { ...sampleB2cShipment(), waybillType: 'ZPL' };
            const result = await adapter.createShipment(shipmentData, 'DLV');

            expect(result.documents[0].format).toBe('zpl');
            expect(result.labelUrl).toContain('data:application/x-zpl;base64,');
        });
    });

    describe('Endpoint 2: Query B2C Shipment (GET /api/shipment/b2c/query/{awb})', () => {
        test('queryB2CShipment calls GET with correct AWB path param', async () => {
            mockClient.request.mockResolvedValue({
                data: { awbNumber: '290019283941', status: 'InTransit' }
            });

            const adapter = createAdapter();
            const res = await adapter.queryB2CShipment('290019283941');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/shipment/b2c/query/290019283941');
            expect(call.headers.apikey).toBe('test-smsa-api-key');
            expect(res.status).toBe('InTransit');
        });
    });

    describe('Endpoint 3: Create C2B Shipment (POST /api/c2b/new)', () => {
        test('createC2BShipment sends POST with parcels (1-6) and addresses', async () => {
            mockClient.request.mockResolvedValue({
                data: { awbNumber: '290098765432', pickupId: 'PKP-101', status: 'PickupScheduled' }
            });

            const adapter = createAdapter();
            const c2bPayload = {
                OrderNumber: 'RET-001',
                Parcels: 2,
                PickupAddress: { ContactName: 'Ahmed Consignee', City: 'Riyadh' },
                ReturnToAddress: { ContactName: 'Target Logistics Returns Hub', City: 'Kuwait City' }
            };

            const res = await adapter.createC2BShipment(c2bPayload);

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/c2b/new');
            expect(call.headers.apikey).toBe('test-smsa-api-key');
            expect(call.data).toEqual(c2bPayload);
            expect(res.pickupId).toBe('PKP-101');
        });
    });

    describe('Endpoint 4: Query C2B Shipment (GET /api/c2b/query/{awb})', () => {
        test('queryC2BShipment calls GET with correct AWB path param', async () => {
            mockClient.request.mockResolvedValue({
                data: { awbNumber: '290098765432', pickupStatus: 'Scheduled' }
            });

            const adapter = createAdapter();
            const res = await adapter.queryC2BShipment('290098765432');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/c2b/query/290098765432');
            expect(res.pickupStatus).toBe('Scheduled');
        });
    });

    describe('Endpoint 5: Cancel C2B Shipment (POST /api/c2b/cancel/{awb})', () => {
        test('cancelC2BShipment and cancelShipment execute cancellation POST', async () => {
            mockClient.request.mockResolvedValue({
                data: { success: true, awbNumber: '290098765432', status: 'Cancelled' }
            });

            const adapter = createAdapter();
            const res = await adapter.cancelC2BShipment('290098765432');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/c2b/cancel/290098765432');
            expect(res.success).toBe(true);

            // Test CarrierAdapter standard cancelShipment method
            const standardCancel = await adapter.cancelShipment('290098765432');
            expect(standardCancel.success).toBe(true);
        });
    });

    describe('Endpoint 6: Currency & Country Lookup (GET /api/lookup/currency)', () => {
        test('getCurrencies fetches country currency catalog', async () => {
            mockClient.request.mockResolvedValue({
                data: [{ countryCode: 'SA', currencyCode: 'SAR' }, { countryCode: 'KW', currencyCode: 'KWD' }]
            });

            const adapter = createAdapter();
            const res = await adapter.getCurrencies();

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/lookup/currency');
            expect(res).toHaveLength(2);
        });
    });

    describe('Endpoint 7: SMSA Offices Lookup (GET /api/lookup/smsaoffices)', () => {
        test('getOffices queries retail branch centers', async () => {
            mockClient.request.mockResolvedValue({
                data: [{ retailId: 'RUH-01', officeName: 'Olaya Branch', city: 'Riyadh' }]
            });

            const adapter = createAdapter();
            const res = await adapter.getOffices();

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/lookup/smsaoffices');
            expect(res[0].retailId).toBe('RUH-01');
        });
    });

    describe('Endpoint 8: Cities Lookup (GET /api/lookup/cities/{countryCode})', () => {
        test('getCities queries serviced cities for given country code', async () => {
            mockClient.request.mockResolvedValue({
                data: [{ cityCode: 'RUH', cityNameEn: 'Riyadh' }, { cityCode: 'JED', cityNameEn: 'Jeddah' }]
            });

            const adapter = createAdapter();
            const res = await adapter.getCities('SA');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/lookup/cities/SA');
            expect(res).toHaveLength(2);
        });
    });

    describe('Endpoint 9: Send Commercial Invoice (POST /api/invoice)', () => {
        test('sendInvoice sends POST with AWB, dd/mm/yyyy date, currency and items', async () => {
            mockClient.request.mockResolvedValue({
                data: { success: true, invoiceId: 'INV-1001', message: 'Invoice submitted successfully' }
            });

            const adapter = createAdapter();
            const invoicePayload = {
                AWB: '290019283941',
                InvoiceDate: '25/10/2026',
                Currency: 'SAR',
                WeightUnit: 'KG',
                Items: [
                    {
                        sequence: 1,
                        ItemReference: 'SKU-001',
                        ItemDescription: 'Cotton Shirts',
                        ItemHSCode: '6109.10.00',
                        Quantity: 2,
                        QuantityUnit: 'PCS',
                        Weight: 0.5,
                        ItemValue: 75.0
                    }
                ]
            };

            const res = await adapter.sendInvoice(invoicePayload);

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/invoice');
            expect(call.data).toEqual(invoicePayload);
            expect(res.invoiceId).toBe('INV-1001');
        });
    });

    describe('Endpoint 10: Track Bulk Shipments (POST /api/track/bulk)', () => {
        test('trackBulk sends POST with JSON string array', async () => {
            mockClient.request.mockResolvedValue({
                data: [
                    { awb: '290019283941', status: 'Delivered' },
                    { awb: '290019283942', status: 'InTransit' }
                ]
            });

            const adapter = createAdapter();
            const awbs = ['290019283941', '290019283942'];
            const res = await adapter.trackBulk(awbs);

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/track/bulk');
            expect(call.data).toEqual(awbs);
            expect(res).toHaveLength(2);
        });
    });

    describe('Endpoint 11: Track Single Shipment (GET /api/track/single/{awb})', () => {
        test('trackSingle and standard getTracking return normalized checkpoints and metadata', async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    awb: '290019283941',
                    statusCode: 'IN_TRANSIT',
                    statusDescription: 'In transit to distribution hub',
                    estimatedDeliveryDate: '2026-10-27T18:00:00Z',
                    carrierWeight: 2.5,
                    carrierPieces: 1,
                    history: [
                        {
                            checkpointCode: 'PU',
                            checkpointDescription: 'Picked up from shipper',
                            location: 'Kuwait City',
                            timestamp: '2026-10-25T11:00:00Z',
                            localTimestamp: '2026-10-25 14:00:00',
                            timezoneOffset: '+03:00'
                        },
                        {
                            checkpointCode: 'ARR_FAC',
                            checkpointDescription: 'Arrived at Sort Facility',
                            location: 'Riyadh Express Hub',
                            timestamp: '2026-10-26T06:00:00Z',
                            localTimestamp: '2026-10-26 09:00:00',
                            timezoneOffset: '+03:00'
                        }
                    ]
                }
            });

            const adapter = createAdapter();
            const tracking = await adapter.getTracking('SMSA-290019283941');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/track/single/290019283941');

            expect(tracking.carrierCode).toBe('SMSA');
            expect(tracking.trackingNumber).toBe('290019283941');
            expect(tracking.status).toBe('IN_TRANSIT');
            expect(tracking.description).toBe('In transit to distribution hub');
            expect(tracking.carrierWeight).toBe(2.5);
            expect(tracking.carrierPieces).toBe(1);
            expect(tracking.estimatedDelivery).toEqual(new Date('2026-10-27T18:00:00Z'));
            expect(tracking.events).toHaveLength(2);
            expect(tracking.events[0]).toMatchObject({
                statusCode: 'PU',
                description: 'Picked up from shipper',
                location: 'Kuwait City',
                timezoneOffset: '+03:00'
            });
        });
    });

    describe('Endpoint 12: Track by Reference (GET /api/track/reference/{ref})', () => {
        test('trackByReference queries tracking status by merchant order number', async () => {
            mockClient.request.mockResolvedValue({
                data: { referenceNumber: 'ORD-SMSA-001', awb: '290019283941', status: 'InTransit' }
            });

            const adapter = createAdapter();
            const res = await adapter.trackByReference('ORD-SMSA-001');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/track/reference/ORD-SMSA-001');
            expect(res.awb).toBe('290019283941');
        });
    });

    describe('Endpoint 13: Status Lookup (GET /api/track/statuslookup)', () => {
        test('getStatusLookup retrieves master list of status codes', async () => {
            mockClient.request.mockResolvedValue({
                data: [
                    { statusCode: 'DATA_RCVD', statusName: 'Information Received' },
                    { statusCode: 'DLV', statusName: 'Delivered', isTerminal: true }
                ]
            });

            const adapter = createAdapter();
            const res = await adapter.getStatusLookup();

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/track/statuslookup');
            expect(res).toHaveLength(2);
        });
    });

    describe('Endpoint 14: Validate Short Address (POST /api/lookup/shortaddress & GET /api/lookup/address/{code})', () => {
        test('validateShortAddress supports POST /api/lookup/shortaddress when object or option specified', async () => {
            mockClient.request.mockResolvedValue({
                data: { isValid: true, shortAddress: 'RRRD2929', city: 'Riyadh' }
            });

            const adapter = createAdapter();
            const res = await adapter.validateShortAddress({ shortAddress: 'RRRD2929' });

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/lookup/shortaddress');
            expect(call.data).toEqual({ shortAddress: 'RRRD2929' });
            expect(res.isValid).toBe(true);
        });

        test('validateShortAddress supports GET /api/lookup/address/{code} for string shorthand', async () => {
            mockClient.request.mockResolvedValue({
                data: { isValid: true, shortAddress: 'RRRD2929', city: 'Riyadh' }
            });

            const adapter = createAdapter();
            const res = await adapter.validateShortAddress('RRRD2929');

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('get');
            expect(call.url).toBe('/api/lookup/address/RRRD2929');
            expect(res.isValid).toBe(true);
        });
    });

    describe('Endpoint 15: Push ID Details (POST /api/shipment/id)', () => {
        test('pushIdDetails sends POST with customs KYC parameters', async () => {
            mockClient.request.mockResolvedValue({
                data: { success: true, message: 'ID details registered successfully' }
            });

            const adapter = createAdapter();
            const payload = {
                AWB: '290019283941',
                IDType: 'NationalId',
                IDNumber: '1098765432',
                ConsigneeName: 'Ahmed Al-Mutawa'
            };

            const res = await adapter.pushIdDetails(payload);

            const call = mockClient.request.mock.calls[0][0];
            expect(call.method).toBe('post');
            expect(call.url).toBe('/api/shipment/id');
            expect(call.data).toEqual(payload);
            expect(res.success).toBe(true);
        });
    });

    describe('getRates & RateCardService Integration', () => {
        test('getRates calculates rate via RateCardService when rateCardId is supplied', async () => {
            const RateCardService = require('../src/services/RateCardService');
            jest.spyOn(RateCardService, 'calculateRate').mockReturnValue({
                rateCardName: 'SMSA GCC Standard',
                totalPrice: 15.5,
                currency: 'SAR'
            });

            const adapter = createAdapter();
            const rates = await adapter.getRates({
                rateCardId: 'rc_smsa_gcc',
                receiver: { country: 'SA' },
                weight: 2.0
            });

            expect(rates).toHaveLength(1);
            expect(rates[0].serviceName).toContain('SMSA GCC Standard');
            expect(rates[0].totalPrice).toBe(15.5);
            expect(rates[0].currency).toBe('SAR');
            expect(rates[0].carrierCode).toBe('SMSA');
        });

        test('getRates returns default quote when no rateCardId is provided', async () => {
            const adapter = createAdapter();
            const rates = await adapter.getRates({ weight: 1.0 });

            expect(rates).toHaveLength(1);
            expect(rates[0].carrierCode).toBe('SMSA');
            expect(rates[0].serviceCode).toBe('DLV');
            expect(rates[0].totalPrice).toBe(0);
        });
    });
});
