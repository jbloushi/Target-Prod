const axios = require('axios');

jest.mock('axios', () => ({ create: jest.fn() }));

describe('Milestone 1 Challenger 1: Adversarial Empirical Test Suite', () => {
    let SmsaAdapter, mockClient, adapter;

    beforeEach(() => {
        jest.resetModules();
        mockClient = { request: jest.fn() };
        require('axios').create.mockReturnValue(mockClient);
        SmsaAdapter = require('../src/adapters/SmsaAdapter');
        adapter = new SmsaAdapter({
            apiKey: 'mock-smsa-api-key',
            baseUrl: 'https://ecomapis-sandbox.azurewebsites.net'
        });
    });

    const createValidShipment = () => ({
        OrderNumber: 'ORD-ADV-999',
        ShipDate: '2026-10-25T12:00:00Z',
        ShipmentCurrency: 'SAR',
        CODAmount: 50.0,
        DeclaredValue: 25.0,
        ContentDescription: 'Electronic Accessories',
        Parcels: 1,
        Weight: 2.5,
        WeightUnit: 'KG',
        WaybillType: 'PDF',
        ShipperAddress: {
            ContactName: 'Warehouse Shipper',
            ContactPhoneNumber: '+96522334455',
            AddressLine1: 'Shuwaikh Industrial Area 2 Block 1',
            City: 'Kuwait City',
            Country: 'KW'
        },
        ConsigneeAddress: {
            ContactName: 'Customer Receiver',
            ContactPhoneNumber: '+966551234567',
            AddressLine1: 'King Fahd Road Building 12',
            City: 'Riyadh',
            Country: 'SA'
        }
    });

    describe('1. validate() - Extreme & Adversarial Inputs', () => {
        describe('1.1 Null / Undefined / Non-Object Shipment Data', () => {
            test('validate(undefined) handles gracefully and returns validation errors array', async () => {
                const errors = await adapter.validate(undefined);
                expect(Array.isArray(errors)).toBe(true);
                expect(errors.length).toBeGreaterThan(0);
                expect(errors).toContain('OrderNumber is required');
                expect(errors).toContain('ConsigneeAddress is required');
                expect(errors).toContain('ShipperAddress is required');
            });

            test('validate(null) handles gracefully and returns validation errors array without throwing TypeError', async () => {
                const errors = await adapter.validate(null);
                expect(Array.isArray(errors)).toBe(true);
                expect(errors.length).toBeGreaterThan(0);
                expect(errors).toContain('OrderNumber is required');
                expect(errors).toContain('ConsigneeAddress is required');
                expect(errors).toContain('ShipperAddress is required');
            });

            test('createShipment(null) rejects with 400 validation error without throwing TypeError', async () => {
                await expect(adapter.createShipment(null)).rejects.toMatchObject({
                    statusCode: 400
                });
            });

            test('createC2BShipment(null) rejects with 400 validation error without throwing TypeError', async () => {
                await expect(adapter.createC2BShipment(null)).rejects.toMatchObject({
                    statusCode: 400
                });
            });

            test('sendInvoice(null) rejects with 400 validation error without throwing TypeError', async () => {
                await expect(adapter.sendInvoice(null)).rejects.toMatchObject({
                    statusCode: 400
                });
            });

            test('validate("string") handles non-object string input without uncaught exception', async () => {
                const errors = await adapter.validate('invalid string shipment');
                expect(Array.isArray(errors)).toBe(true);
                expect(errors).toContain('OrderNumber is required');
                expect(errors).toContain('ConsigneeAddress is required');
                expect(errors).toContain('ShipperAddress is required');
            });

            test('validate(12345) handles number input without uncaught exception', async () => {
                const errors = await adapter.validate(12345);
                expect(Array.isArray(errors)).toBe(true);
                expect(errors).toContain('OrderNumber is required');
            });

            test('validate(false) handles boolean input without uncaught exception', async () => {
                const errors = await adapter.validate(false);
                expect(Array.isArray(errors)).toBe(true);
                expect(errors).toContain('OrderNumber is required');
            });

            test('validate([]) handles array input without uncaught exception', async () => {
                const errors = await adapter.validate([]);
                expect(Array.isArray(errors)).toBe(true);
                expect(errors).toContain('OrderNumber is required');
            });
        });

        describe('1.2 AddressLine1 Boundary Lengths (9 vs 10 vs 100 vs 101)', () => {
            test('Consignee AddressLine1 exactly 9 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.AddressLine1 = '123456789'; // 9 chars
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.AddressLine1 length must be 10-100');
            });

            test('Consignee AddressLine1 exactly 10 chars passes', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.AddressLine1 = '1234567890'; // 10 chars
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('AddressLine1'))).toHaveLength(0);
            });

            test('Consignee AddressLine1 exactly 100 chars passes', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.AddressLine1 = 'A'.repeat(100);
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('AddressLine1'))).toHaveLength(0);
            });

            test('Consignee AddressLine1 exactly 101 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.AddressLine1 = 'A'.repeat(101);
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.AddressLine1 length must be 10-100');
            });

            test('Shipper AddressLine1 exactly 9 chars fails', async () => {
                const s = createValidShipment();
                s.ShipperAddress.AddressLine1 = '123456789';
                const errors = await adapter.validate(s);
                expect(errors).toContain('ShipperAddress.AddressLine1 length must be 10-100');
            });

            test('Shipper AddressLine1 exactly 10 chars passes', async () => {
                const s = createValidShipment();
                s.ShipperAddress.AddressLine1 = '1234567890';
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('AddressLine1'))).toHaveLength(0);
            });

            test('Shipper AddressLine1 exactly 100 chars passes', async () => {
                const s = createValidShipment();
                s.ShipperAddress.AddressLine1 = 'B'.repeat(100);
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('AddressLine1'))).toHaveLength(0);
            });

            test('Shipper AddressLine1 exactly 101 chars fails', async () => {
                const s = createValidShipment();
                s.ShipperAddress.AddressLine1 = 'B'.repeat(101);
                const errors = await adapter.validate(s);
                expect(errors).toContain('ShipperAddress.AddressLine1 length must be 10-100');
            });

            test('AddressLine1 with padded spaces trimmed to 9 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.AddressLine1 = '   123456789   '; // length 15, trimmed 9
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.AddressLine1 length must be 10-100');
            });

            test('AddressLine2 max length 100 enforced', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.AddressLine2 = 'X'.repeat(101);
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.AddressLine2 length must be at most 100');
            });
        });

        describe('1.3 City Boundary Lengths (2 vs 3 vs 50 vs 51)', () => {
            test('City exactly 2 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.City = 'KW';
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.City length must be 3-50');
            });

            test('City exactly 3 chars passes', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.City = 'RUH';
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('City'))).toHaveLength(0);
            });

            test('City exactly 50 chars passes', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.City = 'C'.repeat(50);
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('City'))).toHaveLength(0);
            });

            test('City exactly 51 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.City = 'C'.repeat(51);
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.City length must be 3-50');
            });

            test('Shipper City 2 chars fails, 3 passes', async () => {
                const s = createValidShipment();
                s.ShipperAddress.City = 'DX';
                const errors2 = await adapter.validate(s);
                expect(errors2).toContain('ShipperAddress.City length must be 3-50');

                s.ShipperAddress.City = 'DXB';
                const errors3 = await adapter.validate(s);
                expect(errors3.filter(e => e.includes('City'))).toHaveLength(0);
            });
        });

        describe('1.4 ContactName Boundary Lengths (4 vs 5 vs 150 vs 151)', () => {
            test('ContactName exactly 4 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.ContactName = 'Alex';
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.ContactName length must be 5-150');
            });

            test('ContactName exactly 5 chars passes', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.ContactName = 'Tariq';
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('ContactName'))).toHaveLength(0);
            });

            test('ContactName exactly 150 chars passes', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.ContactName = 'N'.repeat(150);
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('ContactName'))).toHaveLength(0);
            });

            test('ContactName exactly 151 chars fails', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress.ContactName = 'N'.repeat(151);
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.ContactName length must be 5-150');
            });

            test('Shipper ContactName 4 chars fails, 5 chars passes', async () => {
                const s = createValidShipment();
                s.ShipperAddress.ContactName = 'Sara';
                const errors4 = await adapter.validate(s);
                expect(errors4).toContain('ShipperAddress.ContactName length must be 5-150');

                s.ShipperAddress.ContactName = 'Sarah';
                const errors5 = await adapter.validate(s);
                expect(errors5.filter(e => e.includes('ContactName'))).toHaveLength(0);
            });
        });

        describe('1.5 DeclaredValue: 0 vs 0.1 vs Negative Numbers', () => {
            test('DeclaredValue 0 fails', async () => {
                const s = createValidShipment();
                s.DeclaredValue = 0;
                const errors = await adapter.validate(s);
                expect(errors).toContain('DeclaredValue must be at least 0.1');
            });

            test('DeclaredValue 0.05 fails', async () => {
                const s = createValidShipment();
                s.DeclaredValue = 0.05;
                const errors = await adapter.validate(s);
                expect(errors).toContain('DeclaredValue must be at least 0.1');
            });

            test('DeclaredValue 0.0999 fails', async () => {
                const s = createValidShipment();
                s.DeclaredValue = 0.0999;
                const errors = await adapter.validate(s);
                expect(errors).toContain('DeclaredValue must be at least 0.1');
            });

            test('DeclaredValue 0.1 passes', async () => {
                const s = createValidShipment();
                s.DeclaredValue = 0.1;
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('DeclaredValue'))).toHaveLength(0);
            });

            test('DeclaredValue negative numbers fail', async () => {
                const s = createValidShipment();
                for (const neg of [-0.1, -1, -100, -0.0001]) {
                    s.DeclaredValue = neg;
                    const errors = await adapter.validate(s);
                    expect(errors).toContain('DeclaredValue must be at least 0.1');
                }
            });

            test('DeclaredValue null or non-numeric fails', async () => {
                const s = createValidShipment();
                s.DeclaredValue = 'not-a-number';
                const errors = await adapter.validate(s);
                expect(errors).toContain('DeclaredValue must be at least 0.1');
            });
        });

        describe('1.6 Weight: 0 vs 0.001 vs Negative Numbers', () => {
            test('Weight 0 fails', async () => {
                const s = createValidShipment();
                s.Weight = 0;
                const errors = await adapter.validate(s);
                expect(errors).toContain('Weight must be at least 0.001');
            });

            test('Weight 0.0009 fails', async () => {
                const s = createValidShipment();
                s.Weight = 0.0009;
                const errors = await adapter.validate(s);
                expect(errors).toContain('Weight must be at least 0.001');
            });

            test('Weight 0.001 passes', async () => {
                const s = createValidShipment();
                s.Weight = 0.001;
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('Weight'))).toHaveLength(0);
            });

            test('Weight negative numbers fail', async () => {
                const s = createValidShipment();
                for (const neg of [-0.001, -0.5, -5]) {
                    s.Weight = neg;
                    const errors = await adapter.validate(s);
                    expect(errors).toContain('Weight must be at least 0.001');
                }
            });

            test('Weight NaN or non-numeric fails', async () => {
                const s = createValidShipment();
                s.Weight = 'invalid-weight';
                const errors = await adapter.validate(s);
                expect(errors).toContain('Weight must be at least 0.001');
            });
        });

        describe('1.7 WeightUnit: Invalid Values (OZ, G, etc.) vs KG / LB', () => {
            test('WeightUnit OZ fails', async () => {
                const s = createValidShipment();
                s.WeightUnit = 'OZ';
                const errors = await adapter.validate(s);
                expect(errors).toContain('WeightUnit must be KG or LB');
            });

            test('WeightUnit G fails', async () => {
                const s = createValidShipment();
                s.WeightUnit = 'G';
                const errors = await adapter.validate(s);
                expect(errors).toContain('WeightUnit must be KG or LB');
            });

            test('WeightUnit GRAMS, LBS, KGS, TON fail', async () => {
                const s = createValidShipment();
                for (const unit of ['GRAMS', 'LBS', 'KGS', 'TON', 'MTR', '123']) {
                    s.WeightUnit = unit;
                    const errors = await adapter.validate(s);
                    expect(errors).toContain('WeightUnit must be KG or LB');
                }
            });

            test('WeightUnit KG and LB pass', async () => {
                const s = createValidShipment();
                s.WeightUnit = 'KG';
                expect((await adapter.validate(s)).filter(e => e.includes('WeightUnit'))).toHaveLength(0);

                s.WeightUnit = 'LB';
                expect((await adapter.validate(s)).filter(e => e.includes('WeightUnit'))).toHaveLength(0);
            });

            test('WeightUnit lowercase kg and lb normalized to uppercase and pass', async () => {
                const s = createValidShipment();
                s.WeightUnit = 'kg';
                expect((await adapter.validate(s)).filter(e => e.includes('WeightUnit'))).toHaveLength(0);

                s.WeightUnit = 'lb';
                expect((await adapter.validate(s)).filter(e => e.includes('WeightUnit'))).toHaveLength(0);
            });
        });

        describe('1.8 Missing Addresses or Partial Address Objects', () => {
            test('Completely missing ShipperAddress and ConsigneeAddress fail', async () => {
                const s = createValidShipment();
                delete s.ShipperAddress;
                delete s.ConsigneeAddress;
                const errors = await adapter.validate(s);
                expect(errors).toContain('ShipperAddress is required');
                expect(errors).toContain('ConsigneeAddress is required');
            });

            test('ShipperAddress is empty object fails with missing field list', async () => {
                const s = createValidShipment();
                s.ShipperAddress = {};
                const errors = await adapter.validate(s);
                expect(errors).toContain('ShipperAddress.ContactName is required');
                expect(errors).toContain('ShipperAddress.ContactPhoneNumber is required');
                expect(errors).toContain('ShipperAddress.AddressLine1 is required');
                expect(errors).toContain('ShipperAddress.City is required');
                expect(errors).toContain('ShipperAddress.Country is required');
            });

            test('ConsigneeAddress is missing ContactPhoneNumber only fails with that specific field', async () => {
                const s = createValidShipment();
                delete s.ConsigneeAddress.ContactPhoneNumber;
                const errors = await adapter.validate(s);
                expect(errors).toContain('ConsigneeAddress.ContactPhoneNumber is required');
                expect(errors.filter(e => e.startsWith('ConsigneeAddress.'))).toHaveLength(1);
            });

            test('Address mapped from legacy streetLines array passes AddressLine1 and AddressLine2', async () => {
                const s = createValidShipment();
                s.ConsigneeAddress = {
                    name: 'Recipient Person',
                    phone: '+966500000000',
                    streetLines: ['Al-Malaz District Street 15', 'Flat 402 Tower B'],
                    city: 'Riyadh',
                    country: 'SA'
                };
                const errors = await adapter.validate(s);
                expect(errors.filter(e => e.includes('ConsigneeAddress'))).toHaveLength(0);
            });
        });
    });

    describe('2. RFC 7231 Problem Details Error Response Parsing & Crash Resilience', () => {
        test('2.1 Malformed error: response.data is string (e.g. HTML 500)', async () => {
            const htmlError = '<html><head><title>500 Internal Server Error</title></head><body><h1>Crash</h1></body></html>';
            mockClient.request.mockRejectedValue({
                response: {
                    status: 500,
                    data: htmlError
                },
                message: 'Request failed with status code 500'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 500,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('SMSA queryB2CShipment failed')
            });
        });

        test('2.2 Malformed error: response.data is null or empty string', async () => {
            mockClient.request.mockRejectedValueOnce({
                response: {
                    status: 502,
                    data: null
                },
                message: 'Bad Gateway'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 502,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('Bad Gateway')
            });

            mockClient.request.mockRejectedValueOnce({
                response: {
                    status: 503,
                    data: ''
                },
                message: 'Service Unavailable'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 503,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('Service Unavailable')
            });
        });

        test('2.3 Malformed error: response is undefined (network drop / timeout)', async () => {
            mockClient.request.mockRejectedValue({
                code: 'ETIMEDOUT',
                message: 'connect ETIMEDOUT 10.0.0.1:443'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 500,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('connect ETIMEDOUT')
            });
        });

        test('2.4 Problem Details with null errors property does not throw', async () => {
            mockClient.request.mockRejectedValue({
                response: {
                    status: 400,
                    data: {
                        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
                        title: 'Bad Request',
                        status: 400,
                        errors: null
                    }
                },
                message: 'Request failed with status code 400'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 400,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('Bad Request')
            });
        });

        test('2.5 Problem Details with array errors does not crash', async () => {
            mockClient.request.mockRejectedValue({
                response: {
                    status: 400,
                    data: {
                        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
                        title: 'Validation failed',
                        status: 400,
                        errors: ['First global error', 'Second global error']
                    }
                },
                message: 'Request failed with status code 400'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 400,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('Validation failed')
            });
        });

        test('2.6 Problem Details with nested non-array error values does not crash', async () => {
            mockClient.request.mockRejectedValue({
                response: {
                    status: 400,
                    data: {
                        title: 'Validation Error',
                        status: 400,
                        errors: {
                            FieldA: 'Single string error',
                            FieldB: 12345,
                            FieldC: null,
                            FieldD: undefined,
                            FieldE: { nested: 'object value' }
                        }
                    }
                },
                message: 'Request failed with status code 400'
            });

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 400,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('Validation Error')
            });
        });

        test('2.7 Error object is primitive or unexpected non-error', async () => {
            mockClient.request.mockRejectedValue('String rejection instead of Error');

            await expect(adapter.queryB2CShipment('290012345678')).rejects.toMatchObject({
                statusCode: 500,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('SMSA queryB2CShipment failed')
            });
        });

        test('2.8 getTracking safely ignores null or malformed items in carrier tracking history without throwing TypeError', async () => {
            mockClient.request.mockResolvedValue({
                data: {
                    statusCode: 'IN_TRANSIT',
                    statusDescription: 'In Transit',
                    history: [null, { checkpointCode: 'DELIVERED', description: 'Delivered', timestamp: '2026-10-25T14:00:00Z' }]
                }
            });

            const tracking = await adapter.getTracking('SMSA-290011223344');
            expect(tracking.status).toBe('IN_TRANSIT');
            expect(Array.isArray(tracking.events)).toBe(true);
            expect(tracking.events).toHaveLength(1);
            expect(tracking.events[0].statusCode).toBe('DELIVERED');
            expect(tracking.events[0].description).toBe('Delivered');
        });
    });
});
