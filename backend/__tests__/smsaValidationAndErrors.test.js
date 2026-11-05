jest.mock('axios', () => ({ create: jest.fn() }));

describe('SMSA Adapter - Validation Rules, Boundary Limits & RFC 7231 Error Parsing', () => {
    let SmsaAdapter, mockClient;

    beforeEach(() => {
        jest.resetModules();
        mockClient = { request: jest.fn() };
        require('axios').create.mockReturnValue(mockClient);
        SmsaAdapter = require('../src/adapters/SmsaAdapter');
    });

    const createAdapter = () => new SmsaAdapter({
        apiKey: 'test-smsa-api-key',
        baseUrl: 'https://ecomapis-sandbox.azurewebsites.net'
    });

    const baseValidShipment = () => ({
        OrderNumber: 'ORD-12345',
        ShipDate: '2026-10-25T10:00:00Z',
        ShipmentCurrency: 'SAR',
        CODAmount: 0.0,
        DeclaredValue: 10.0,
        ContentDescription: 'Documents',
        Parcels: 1,
        Weight: 1.0,
        WeightUnit: 'KG',
        WaybillType: 'PDF',
        ShipperAddress: {
            ContactName: 'Valid Shipper Name',
            ContactPhoneNumber: '+96522001122',
            AddressLine1: 'Airport Cargo Terminal Gate 4',
            City: 'Kuwait City',
            Country: 'KW'
        },
        ConsigneeAddress: {
            ContactName: 'Valid Consignee Name',
            ContactPhoneNumber: '+966501234567',
            AddressLine1: 'Olaya Main Street Building 442',
            City: 'Riyadh',
            Country: 'SA'
        }
    });

    describe('Mandatory Field Validations', () => {
        test('validates completely valid shipment returns no errors', async () => {
            const adapter = createAdapter();
            const errors = await adapter.validate(baseValidShipment());
            expect(errors).toHaveLength(0);
        });

        test('detects missing OrderNumber or length > 50', async () => {
            const adapter = createAdapter();
            const missing = { ...baseValidShipment(), OrderNumber: '' };
            const errorsMissing = await adapter.validate(missing);
            expect(errorsMissing).toContain('OrderNumber is required');

            const tooLong = { ...baseValidShipment(), OrderNumber: 'O'.repeat(51) };
            const errorsTooLong = await adapter.validate(tooLong);
            expect(errorsTooLong).toContain('OrderNumber max length is 50');
        });

        test('detects invalid Weight (missing or < 0.001)', async () => {
            const adapter = createAdapter();
            const zeroWeight = { ...baseValidShipment(), Weight: 0 };
            const errorsZero = await adapter.validate(zeroWeight);
            expect(errorsZero).toContain('Weight must be at least 0.001');

            const belowMin = { ...baseValidShipment(), Weight: 0.0009 };
            const errorsBelow = await adapter.validate(belowMin);
            expect(errorsBelow).toContain('Weight must be at least 0.001');

            const validMin = { ...baseValidShipment(), Weight: 0.001 };
            const errorsValid = await adapter.validate(validMin);
            expect(errorsValid).not.toContain('Weight must be at least 0.001');
        });

        test('detects invalid WeightUnit (must be KG or LB)', async () => {
            const adapter = createAdapter();
            const invalidUnit = { ...baseValidShipment(), WeightUnit: 'OZ' };
            const errors = await adapter.validate(invalidUnit);
            expect(errors).toContain('WeightUnit must be KG or LB');

            const validKg = { ...baseValidShipment(), WeightUnit: 'KG' };
            expect(await adapter.validate(validKg)).not.toContain('WeightUnit must be KG or LB');

            const validLb = { ...baseValidShipment(), WeightUnit: 'LB' };
            expect(await adapter.validate(validLb)).not.toContain('WeightUnit must be KG or LB');
        });

        test('detects invalid DeclaredValue (missing or < 0.1)', async () => {
            const adapter = createAdapter();
            const zeroValue = { ...baseValidShipment(), DeclaredValue: 0.05 };
            const errors = await adapter.validate(zeroValue);
            expect(errors).toContain('DeclaredValue must be at least 0.1');

            const validMin = { ...baseValidShipment(), DeclaredValue: 0.1 };
            expect(await adapter.validate(validMin)).not.toContain('DeclaredValue must be at least 0.1');
        });

        test('detects invalid ContentDescription', async () => {
            const adapter = createAdapter();
            const emptyContent = { ...baseValidShipment(), ContentDescription: '   ' };
            const errors = await adapter.validate(emptyContent);
            expect(errors).toContain('ContentDescription is required');
        });

        test('detects negative CODAmount', async () => {
            const adapter = createAdapter();
            const negativeCod = { ...baseValidShipment(), CODAmount: -5.0 };
            const errors = await adapter.validate(negativeCod);
            expect(errors).toContain('CODAmount must be >= 0');

            const zeroCod = { ...baseValidShipment(), CODAmount: 0.0 };
            expect(await adapter.validate(zeroCod)).not.toContain('CODAmount must be >= 0');
        });

        test('detects missing ShipmentCurrency', async () => {
            const adapter = createAdapter();
            const missingCurrency = { ...baseValidShipment(), ShipmentCurrency: '' };
            const errors = await adapter.validate(missingCurrency);
            expect(errors).toContain('ShipmentCurrency is required');
        });

        test('detects invalid ShipDate', async () => {
            const adapter = createAdapter();
            const invalidDate = { ...baseValidShipment(), ShipDate: 'invalid-date-string' };
            const errors = await adapter.validate(invalidDate);
            expect(errors).toContain('ShipDate is required and must be a valid date');
        });

        test('detects invalid WaybillType', async () => {
            const adapter = createAdapter();
            const invalidType = { ...baseValidShipment(), WaybillType: 'PNG' };
            const errors = await adapter.validate(invalidType);
            expect(errors).toContain('WaybillType must be PDF or ZPL');
        });

        test('detects completely missing ShipperAddress or ConsigneeAddress', async () => {
            const adapter = createAdapter();
            const missingAddresses = {
                ...baseValidShipment(),
                ShipperAddress: null,
                ConsigneeAddress: null
            };
            const errors = await adapter.validate(missingAddresses);
            expect(errors).toContain('ShipperAddress is required');
            expect(errors).toContain('ConsigneeAddress is required');
        });
    });

    describe('Address Boundary Length Validations (9 vs 10 vs 100 vs 101)', () => {
        test('AddressLine1 boundary: 9 chars invalid, 10 valid, 100 valid, 101 invalid', async () => {
            const adapter = createAdapter();
            const base = baseValidShipment();

            // 9 chars -> invalid
            const nineChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, AddressLine1: '123456789' }
            };
            const errors9 = await adapter.validate(nineChars);
            expect(errors9).toContain('ConsigneeAddress.AddressLine1 length must be 10-100');

            // 10 chars -> valid
            const tenChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, AddressLine1: '1234567890' }
            };
            const errors10 = await adapter.validate(tenChars);
            expect(errors10).not.toContain('ConsigneeAddress.AddressLine1 length must be 10-100');

            // 100 chars -> valid
            const hundredChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, AddressLine1: 'A'.repeat(100) }
            };
            const errors100 = await adapter.validate(hundredChars);
            expect(errors100).not.toContain('ConsigneeAddress.AddressLine1 length must be 10-100');

            // 101 chars -> invalid
            const hundredOneChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, AddressLine1: 'A'.repeat(101) }
            };
            const errors101 = await adapter.validate(hundredOneChars);
            expect(errors101).toContain('ConsigneeAddress.AddressLine1 length must be 10-100');
        });

        test('City boundary: 2 chars invalid, 3 valid, 50 valid, 51 invalid', async () => {
            const adapter = createAdapter();
            const base = baseValidShipment();

            // 2 chars -> invalid
            const twoChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, City: 'KW' }
            };
            const errors2 = await adapter.validate(twoChars);
            expect(errors2).toContain('ConsigneeAddress.City length must be 3-50');

            // 3 chars -> valid
            const threeChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, City: 'RUH' }
            };
            const errors3 = await adapter.validate(threeChars);
            expect(errors3).not.toContain('ConsigneeAddress.City length must be 3-50');

            // 50 chars -> valid
            const fiftyChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, City: 'C'.repeat(50) }
            };
            const errors50 = await adapter.validate(fiftyChars);
            expect(errors50).not.toContain('ConsigneeAddress.City length must be 3-50');

            // 51 chars -> invalid
            const fiftyOneChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, City: 'C'.repeat(51) }
            };
            const errors51 = await adapter.validate(fiftyOneChars);
            expect(errors51).toContain('ConsigneeAddress.City length must be 3-50');
        });

        test('ContactName boundary: 4 chars invalid, 5 valid, 150 valid, 151 invalid', async () => {
            const adapter = createAdapter();
            const base = baseValidShipment();

            // 4 chars -> invalid
            const fourChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, ContactName: 'John' }
            };
            const errors4 = await adapter.validate(fourChars);
            expect(errors4).toContain('ConsigneeAddress.ContactName length must be 5-150');

            // 5 chars -> valid
            const fiveChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, ContactName: 'Ahmed' }
            };
            const errors5 = await adapter.validate(fiveChars);
            expect(errors5).not.toContain('ConsigneeAddress.ContactName length must be 5-150');

            // 150 chars -> valid
            const hundredFiftyChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, ContactName: 'N'.repeat(150) }
            };
            const errors150 = await adapter.validate(hundredFiftyChars);
            expect(errors150).not.toContain('ConsigneeAddress.ContactName length must be 5-150');

            // 151 chars -> invalid
            const hundredFiftyOneChars = {
                ...base,
                ConsigneeAddress: { ...base.ConsigneeAddress, ContactName: 'N'.repeat(151) }
            };
            const errors151 = await adapter.validate(hundredFiftyOneChars);
            expect(errors151).toContain('ConsigneeAddress.ContactName length must be 5-150');
        });
    });

    describe('Parcels Boundary Validations (0 vs 1 vs 6 vs 7)', () => {
        test('B2C Parcels boundary: 0 invalid, 1 valid', async () => {
            const adapter = createAdapter();
            const base = baseValidShipment();

            // 0 -> invalid
            const zeroParcels = { ...base, Parcels: 0 };
            const errors0 = await adapter.validate(zeroParcels);
            expect(errors0).toContain('Parcels must be an integer >= 1');

            // 1 -> valid
            const oneParcel = { ...base, Parcels: 1 };
            const errors1 = await adapter.validate(oneParcel);
            expect(errors1).not.toContain('Parcels must be an integer >= 1');
        });

        test('C2B Parcels boundary: 0 invalid, 1 valid, 6 valid, 7 invalid', async () => {
            const adapter = createAdapter();
            const validC2bBase = {
                OrderNumber: 'RET-001',
                PickupAddress: { ContactName: 'Ahmed Al-Mutawa', City: 'Riyadh' },
                ReturnToAddress: { ContactName: 'Target Logistics Hub', City: 'Kuwait City' }
            };

            // 0 -> invalid
            await expect(adapter.createC2BShipment({ ...validC2bBase, Parcels: 0 }))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('1 to 6 parcels') });

            // 7 -> invalid
            await expect(adapter.createC2BShipment({ ...validC2bBase, Parcels: 7 }))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('1 to 6 parcels') });

            // 1 -> valid (calls mockClient)
            mockClient.request.mockResolvedValue({ data: { awbNumber: '290098765432' } });
            await expect(adapter.createC2BShipment({ ...validC2bBase, Parcels: 1 }))
                .resolves.toMatchObject({ awbNumber: '290098765432' });

            // 6 -> valid
            await expect(adapter.createC2BShipment({ ...validC2bBase, Parcels: 6 }))
                .resolves.toMatchObject({ awbNumber: '290098765432' });
        });
    });

    describe('Date & Format Validations across Endpoints', () => {
        test('sendInvoice rejects ISO date and requires strict dd/mm/yyyy format', async () => {
            const adapter = createAdapter();
            const validInvoice = {
                AWB: '290019283941',
                InvoiceDate: '25/10/2026',
                Currency: 'SAR',
                Items: [{ sequence: 1, Quantity: 5, ItemHSCode: '6109.10' }]
            };

            // ISO date -> rejected
            await expect(adapter.sendInvoice({ ...validInvoice, InvoiceDate: '2026-10-25' }))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('dd/mm/yyyy') });

            // Invalid sequence (> 100) or Quantity (> 1000)
            await expect(adapter.sendInvoice({
                ...validInvoice,
                Items: [{ sequence: 101, Quantity: 5, ItemHSCode: '6109' }]
            })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('sequence must be 1-100') });

            await expect(adapter.sendInvoice({
                ...validInvoice,
                Items: [{ sequence: 1, Quantity: 1001, ItemHSCode: '6109' }]
            })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Quantity must be 1-1000') });
        });

        test('validateShortAddress enforces 4 letters + 4 digits regex', async () => {
            const adapter = createAdapter();

            await expect(adapter.validateShortAddress('1234ABCD'))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('4 letters followed by 4 digits') });

            await expect(adapter.validateShortAddress('ABC1234'))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('4 letters followed by 4 digits') });

            await expect(adapter.validateShortAddress('ABCDE1234'))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('4 letters followed by 4 digits') });

            mockClient.request.mockResolvedValue({ data: { isValid: true } });
            await expect(adapter.validateShortAddress('RRRD2929')).resolves.toBeDefined();
        });

        test('pushIdDetails enforces IDType enum and required fields', async () => {
            const adapter = createAdapter();

            await expect(adapter.pushIdDetails({ AWB: '290019283941', IDType: 'InvalidIDType', IDNumber: '1098765432' }))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('IDType must be NationalId, Iqama, Passport or CR') });

            await expect(adapter.pushIdDetails({ IDType: 'NationalId', IDNumber: '1098765432' }))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('AWB is required') });

            await expect(adapter.pushIdDetails({ AWB: '290019283941', IDType: 'NationalId' }))
                .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('IDNumber is required') });
        });

        test('trackBulk rejects non-string arrays or empty lists', async () => {
            const adapter = createAdapter();

            await expect(adapter.trackBulk([]))
                .rejects.toMatchObject({ statusCode: 400 });

            await expect(adapter.trackBulk([123, 456]))
                .rejects.toMatchObject({ statusCode: 400 });

            await expect(adapter.trackBulk(['']))
                .rejects.toMatchObject({ statusCode: 400 });
        });
    });

    describe('RFC 7231 Problem Details Error Response Parsing', () => {
        test('parses ASP.NET Core RFC 7231 400 Problem Details extracting nested field error arrays', async () => {
            const rfc7231ErrorBody = {
                type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
                title: 'One or more validation errors occurred.',
                status: 400,
                traceId: '00-987654321-00',
                errors: {
                    'ConsigneeAddress.AddressLine1': [
                        'Address line 1 length between 10 and 100 characters'
                    ],
                    'Weight': [
                        'Please enter a valid weight (min 0.001)'
                    ],
                    'Parcels': [
                        'Parcels count must be greater than zero',
                        'Parcels must be an integer'
                    ]
                }
            };

            mockClient.request.mockRejectedValue({
                response: {
                    status: 400,
                    data: rfc7231ErrorBody
                },
                message: 'Request failed with status code 400'
            });

            const adapter = createAdapter();

            let caughtError;
            try {
                await adapter.queryB2CShipment('999999999999');
            } catch (err) {
                caughtError = err;
            }

            expect(caughtError).toBeDefined();
            expect(caughtError.statusCode).toBe(400);
            expect(caughtError.provider).toBe('SMSA');
            expect(caughtError.isProviderError).toBe(true);
            expect(caughtError.title).toBe('One or more validation errors occurred.');
            expect(caughtError.traceId).toBe('00-987654321-00');

            // Error message should concatenate all field error details clearly
            expect(caughtError.message).toContain('ConsigneeAddress.AddressLine1: Address line 1 length between 10 and 100 characters');
            expect(caughtError.message).toContain('Weight: Please enter a valid weight (min 0.001)');
            expect(caughtError.message).toContain('Parcels: Parcels count must be greater than zero, Parcels must be an integer');
        });

        test('parses RFC 7235 401 Unauthorized Problem Details', async () => {
            const rfc7235Body = {
                type: 'https://tools.ietf.org/html/rfc7235#section-3.1',
                title: 'Unauthorized',
                status: 401,
                traceId: '00-auth-failed-00'
            };

            mockClient.request.mockRejectedValue({
                response: {
                    status: 401,
                    data: rfc7235Body
                },
                message: 'Request failed with status code 401'
            });

            const adapter = createAdapter();

            await expect(adapter.getCurrencies()).rejects.toMatchObject({
                statusCode: 401,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('Unauthorized')
            });
        });

        test('parses RFC 7231 404 Not Found Problem Details with detail message', async () => {
            const notFoundBody = {
                type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
                title: 'Not Found',
                status: 404,
                detail: 'No shipment found for AWB: 290000000000'
            };

            mockClient.request.mockRejectedValue({
                response: {
                    status: 404,
                    data: notFoundBody
                },
                message: 'Request failed with status code 404'
            });

            const adapter = createAdapter();

            await expect(adapter.trackSingle('290000000000')).rejects.toMatchObject({
                statusCode: 404,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('No shipment found for AWB: 290000000000')
            });
        });

        test('parses RFC 7231 500 Internal Server Error', async () => {
            const serverErrorBody = {
                type: 'https://tools.ietf.org/html/rfc7231#section-6.6.1',
                title: 'An error occurred while processing your request.',
                status: 500
            };

            mockClient.request.mockRejectedValue({
                response: {
                    status: 500,
                    data: serverErrorBody
                },
                message: 'Internal Server Error'
            });

            const adapter = createAdapter();

            await expect(adapter.getOffices()).rejects.toMatchObject({
                statusCode: 500,
                provider: 'SMSA',
                isProviderError: true,
                message: expect.stringContaining('An error occurred while processing your request')
            });
        });
    });
});
