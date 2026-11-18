const {
    NON_POSTAL_COUNTRIES,
    SUPPORTED_CARRIERS,
    normalizeCarrierCode,
    isPostalCodeRequired,
    isValidPhone,
    isValidEmail,
    validateMinimumShipmentFields,
    buildValidationError
} = require('../src/services/carrierMinimumValidation.service');

jest.mock('../src/config/database', () => ({
    prisma: {
        carrierLog: {
            create: jest.fn(),
            findMany: jest.fn()
        }
    }
}));

jest.mock('../src/utils/logger', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const { prisma } = require('../src/config/database');
const diagnosticAttemptLog = require('../src/services/diagnosticAttemptLog.service');

function buildValidPayload(overrides = {}) {
    return {
        carrierCode: 'DGR',
        shipmentType: 'PACKAGE',
        sender: {
            name: 'Ahmed Al-Sabah',
            phone: '+96550001111',
            email: 'sender@example.com',
            countryCode: 'KW',
            city: 'Kuwait City',
            addressLine1: 'Block 4, Street 12, Building 8'
        },
        receiver: {
            name: 'Jane Doe',
            phone: '+12125550199',
            email: 'receiver@example.com',
            countryCode: 'US',
            city: 'New York',
            addressLine1: '350 Fifth Avenue, Suite 4200',
            postalCode: '10118'
        },
        parcels: [
            {
                weight: 2.5,
                length: 30,
                width: 20,
                height: 15,
                description: 'Electronic sensors',
                declaredValue: 150
            }
        ],
        ...overrides
    };
}

describe('carrierMinimumValidation.service', () => {
    test('normalizes carrier codes and aliases', () => {
        expect(normalizeCarrierCode('dhl')).toBe('DGR');
        expect(normalizeCarrierCode('DHL2')).toBe('DGR2');
        expect(normalizeCarrierCode('logestechs')).toBe('OTE');
        expect(normalizeCarrierCode('arm')).toBe('ARAMEX');
        expect(normalizeCarrierCode('smsaexpress')).toBe('SMSA');
        expect(normalizeCarrierCode('manual')).toBe('INTERNAL');
        expect(normalizeCarrierCode('')).toBe('DGR');
    });

    test('identifies postal vs non-postal countries', () => {
        for (const code of NON_POSTAL_COUNTRIES) {
            expect(isPostalCodeRequired(code)).toBe(false);
        }
        expect(isPostalCodeRequired('', 'Kuwait')).toBe(false);
        expect(isPostalCodeRequired('US')).toBe(true);
        expect(isPostalCodeRequired('GB')).toBe(true);
        expect(isPostalCodeRequired('SA')).toBe(true);
    });

    test('validates phone and email basics without rigid length caps', () => {
        expect(isValidPhone('+96550001111')).toBe(true);
        expect(isValidPhone('50001111', '+965')).toBe(true);
        expect(isValidPhone('123')).toBe(false);
        expect(isValidPhone('')).toBe(false);

        expect(isValidEmail('user@example.com')).toBe(true);
        expect(isValidEmail('invalid-email')).toBe(false);
        expect(isValidEmail('')).toBe(false);
    });

    test('passes valid non-document shipment across all supported carriers', () => {
        for (const carrierCode of SUPPORTED_CARRIERS) {
            const result = validateMinimumShipmentFields(buildValidPayload({ carrierCode }));
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.carrierCode).toBe(carrierCode);
        }
    });

    test('allows long names and street addresses without rigid character-length caps', () => {
        const longName = 'A'.repeat(120);
        const longAddress = 'Street '.repeat(25).trim();
        const result = validateMinimumShipmentFields(
            buildValidPayload({
                sender: {
                    name: longName,
                    phone: '+96550001111',
                    email: 'sender@example.com',
                    countryCode: 'KW',
                    city: 'Kuwait City',
                    addressLine1: longAddress
                }
            })
        );
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    test('allows document shipments without declaredValue', () => {
        const payload = buildValidPayload({
            shipmentType: 'DOCUMENTS',
            isDocument: true,
            parcels: [
                {
                    weight: 0.5,
                    length: 30,
                    width: 22,
                    height: 2,
                    description: 'Signed legal contracts'
                }
            ]
        });

        const result = validateMinimumShipmentFields(payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    test('requires declaredValue > 0 for non-document shipments', () => {
        const payload = buildValidPayload({
            parcels: [
                {
                    weight: 1.5,
                    length: 20,
                    width: 15,
                    height: 10,
                    description: 'Apparel samples',
                    declaredValue: 0
                }
            ]
        });

        const result = validateMinimumShipmentFields(payload);
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: 'customs_invoiceVal',
                    step: 5
                })
            ])
        );
    });

    test('returns structured step and field keys for missing sender, receiver, and parcel fields', () => {
        const result = validateMinimumShipmentFields({
            carrierCode: 'ARAMEX',
            sender: {
                countryCode: 'US',
                postalCode: '00000'
            },
            receiver: {
                countryCode: 'BAD'
            },
            parcels: [
                {
                    weight: 0,
                    length: -1,
                    width: 0,
                    height: 0,
                    description: ''
                }
            ]
        });

        expect(result.valid).toBe(false);
        const byField = Object.fromEntries(result.errors.map((e) => [e.field, e]));

        expect(byField.sender_name.step).toBe(1);
        expect(byField.sender_phone.step).toBe(1);
        expect(byField.sender_email.step).toBe(1);
        expect(byField.sender_city.step).toBe(1);
        expect(byField.sender_addr1.step).toBe(1);
        expect(byField.sender_zip.step).toBe(1);

        expect(byField.receiver_name.step).toBe(2);
        expect(byField.receiver_phone.step).toBe(2);
        expect(byField.receiver_email.step).toBe(2);
        expect(byField.receiver_country.step).toBe(2);
        expect(byField.receiver_city.step).toBe(2);
        expect(byField.receiver_addr1.step).toBe(2);
        expect(byField.receiver_zip.step).toBe(2);

        expect(byField.pkg_weight.step).toBe(3);
        expect(byField.pkg_length.step).toBe(3);
        expect(byField.pkg_width.step).toBe(3);
        expect(byField.pkg_height.step).toBe(3);
        expect(byField.pkg_description.step).toBe(3);

        expect(byField.customs_invoiceVal.step).toBe(5);
    });

    test('buildValidationError creates HTTP 400 error with structured field and errors', () => {
        const validation = validateMinimumShipmentFields({});
        const err = buildValidationError(validation);

        expect(err).toBeInstanceOf(Error);
        expect(err.statusCode).toBe(400);
        expect(err.isValidationError).toBe(true);
        expect(err.message).toMatch(/^Validation Failed:/);
        expect(err.field).toBe(validation.errors[0].field);
        expect(err.step).toBe(validation.errors[0].step);
        expect(err.errors).toEqual(validation.errors);
    });
});

describe('diagnosticAttemptLog.service', () => {
    beforeEach(() => {
        diagnosticAttemptLog.clearBuffer();
        jest.clearAllMocks();
        prisma.carrierLog.create.mockResolvedValue({ id: 'db-1' });
        prisma.carrierLog.findMany.mockResolvedValue([]);
    });

    test('sanitizes sensitive keys and truncates binary payloads', () => {
        const sanitized = diagnosticAttemptLog.sanitizeDetails({
            apiKey: 'secret-key-123',
            nested: {
                password: 'pw',
                authorization: 'Bearer xyz',
                safeField: 'ok'
            },
            labelData: 'A'.repeat(200),
            documentUrl: `data:application/pdf;base64,${'B'.repeat(600)}`
        });

        expect(sanitized.apiKey).toBe('[REDACTED]');
        expect(sanitized.nested.password).toBe('[REDACTED]');
        expect(sanitized.nested.authorization).toBe('[REDACTED]');
        expect(sanitized.nested.safeField).toBe('ok');
        expect(sanitized.labelData).toBe('[BINARY_TRUNCATED:200]');
        expect(sanitized.documentUrl).toMatch(/\[truncated \d+ chars\]$/);
    });

    test('records attempt in ring buffer and persists non-blockingly via prisma.carrierLog', () => {
        const record = diagnosticAttemptLog.recordAttempt({
            trackingNumber: 'TRK-1001',
            carrierCode: 'dgr2',
            action: 'carrier_book',
            status: 'SUCCESS',
            durationMs: 142.7,
            message: 'Booked successfully',
            details: { token: 'top-secret', serviceCode: 'P' },
            organizationId: 'org-1'
        });

        expect(record.carrierCode).toBe('DGR2');
        expect(record.action).toBe('CARRIER_BOOK');
        expect(record.status).toBe('SUCCESS');
        expect(record.durationMs).toBe(143);
        expect(record.trackingNumber).toBe('TRK-1001');
        expect(record.details.token).toBe('[REDACTED]');
        expect(record.details.serviceCode).toBe('P');

        expect(prisma.carrierLog.create).toHaveBeenCalledTimes(1);
        expect(prisma.carrierLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    id: record.id,
                    carrierCode: 'DGR2',
                    requestType: 'CARRIER_BOOK',
                    statusCode: 200,
                    trackingNumber: 'TRK-1001',
                    organizationId: 'org-1'
                })
            })
        );
    });

    test('never throws when prisma.carrierLog.create rejects or throws', () => {
        prisma.carrierLog.create.mockRejectedValueOnce(new Error('DB down'));
        expect(() =>
            diagnosticAttemptLog.recordAttempt({
                carrierCode: 'SMSA',
                action: 'RATE_QUOTE',
                status: 'FAILED',
                message: 'Timeout'
            })
        ).not.toThrow();

        prisma.carrierLog.create.mockImplementationOnce(() => {
            throw new Error('Sync failure');
        });
        expect(() =>
            diagnosticAttemptLog.recordAttempt({
                carrierCode: 'OTE',
                action: 'DRAFT_CREATE',
                status: 'VALIDATION_ERROR',
                message: 'Missing city'
            })
        ).not.toThrow();
    });

    test('getRecentAttempts filters results and merges DB rows without duplicating ring buffer IDs', async () => {
        const memRecord = diagnosticAttemptLog.recordAttempt({
            id: 'shared-id',
            trackingNumber: 'TRK-MEM',
            carrierCode: 'DGR',
            action: 'CARRIER_BOOK',
            status: 'SUCCESS',
            message: 'From memory',
            timestamp: '2026-11-18T10:00:00.000Z'
        });

        prisma.carrierLog.findMany.mockResolvedValueOnce([
            {
                id: memRecord.id,
                carrierCode: 'DGR',
                requestType: 'CARRIER_BOOK',
                statusCode: 200,
                trackingNumber: 'TRK-MEM',
                createdAt: new Date('2026-11-18T10:00:00.000Z'),
                requestPayload: { status: 'SUCCESS', details: {} },
                responsePayload: { status: 'SUCCESS', message: 'Duplicate from DB' }
            },
            {
                id: 'db-only-id',
                carrierCode: 'ARAMEX',
                requestType: 'RATE_QUOTE',
                statusCode: 400,
                trackingNumber: 'TRK-DB',
                durationMs: 55,
                createdAt: new Date('2026-11-18T11:00:00.000Z'),
                requestPayload: { status: 'VALIDATION_ERROR', details: { field: 'sender_city' } },
                responsePayload: { status: 'VALIDATION_ERROR', message: 'Sender city is required' }
            }
        ]);

        const all = await diagnosticAttemptLog.getRecentAttempts({ limit: 10 });
        expect(all).toHaveLength(2);
        expect(all[0].id).toBe('db-only-id');
        expect(all[0].status).toBe('VALIDATION_ERROR');
        expect(all[1].id).toBe('shared-id');
        expect(all[1].message).toBe('From memory');

        const filtered = await diagnosticAttemptLog.getRecentAttempts({
            carrierCode: 'DGR',
            status: 'SUCCESS'
        });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('shared-id');
    });

    test('getRecentAttempts falls back to ring buffer when DB query fails', async () => {
        diagnosticAttemptLog.recordAttempt({
            carrierCode: 'INTERNAL',
            action: 'DRAFT_CREATE',
            status: 'SUCCESS',
            message: 'Buffered entry'
        });
        prisma.carrierLog.findMany.mockRejectedValueOnce(new Error('DB unavailable'));

        const results = await diagnosticAttemptLog.getRecentAttempts();
        expect(results).toHaveLength(1);
        expect(results[0].carrierCode).toBe('INTERNAL');
    });
});
