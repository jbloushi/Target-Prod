const mockPrisma = {
    shipment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn()
    },
    organization: {
        findUnique: jest.fn()
    },
    user: {
        findUnique: jest.fn()
    },
    carrierLog: {
        create: jest.fn().mockResolvedValue({})
    },
    shipmentAuditLog: {
        create: jest.fn().mockResolvedValue({})
    },
    $transaction: jest.fn(async (cb) => cb(mockPrisma))
};

const mockAdapter = {
    createShipment: jest.fn(),
    getStatus: jest.fn(),
    getLabel: jest.fn(),
    getRates: jest.fn(),
    getShipmentDocuments: jest.fn()
};

jest.mock('../src/config/database', () => ({ prisma: mockPrisma }));
jest.mock('../src/services/CarrierFactory', () => ({
    getCarrierCapabilities: jest.fn((code) => ({
        supportsExternalApi: code !== 'INTERNAL',
        supportsLabelGeneration: code !== 'INTERNAL'
    })),
    getAdapter: jest.fn(() => mockAdapter),
    getAvailableCarriers: jest.fn(() => [
        { code: 'DGR', name: 'DGR' },
        { code: 'DGR2', name: 'DGR2' },
        { code: 'SMSA', name: 'SMSA' },
        { code: 'OTE', name: 'OTE' },
        { code: 'ARAMEX', name: 'ARAMEX' },
        { code: 'INTERNAL', name: 'INTERNAL' }
    ])
}));
jest.mock('../src/services/pricing.service', () => ({
    validateSnapshot: jest.fn(() => true),
    resolveMarkup: jest.fn(() => ({ markup: { type: 'FLAT', flatValue: 2 }, source: 'org_default' })),
    resolveCarrierPricingPolicy: jest.fn(() => ({ pricingModel: 'STANDARD', currency: 'KWD' })),
    applyCarrierBasePricePolicy: jest.fn((p) => p),
    calculateFinalPrice: jest.fn((p) => ({ finalPrice: p + 2, markupAmount: 2 })),
    createSnapshot: jest.fn((rate, markup, currency, source) => ({
        carrierRate: rate,
        markup: 2,
        totalPrice: rate + 2,
        currency,
        policySource: source
    }))
}));
jest.mock('../src/services/financeLedger.service', () => ({
    createLedgerEntry: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
    recordCarrierPayable: jest.fn().mockResolvedValue({})
}));
jest.mock('../src/services/generalLedger.service', () => ({
    postShipmentBookingEntry: jest.fn().mockResolvedValue({})
}));
jest.mock('../src/services/CarrierDocumentService', () => ({
    uploadDocument: jest.fn().mockResolvedValue({ type: 'label', url: '/uploads/label.pdf' })
}));
jest.mock('../src/services/shippingAccess.service', () => ({
    getAssignedShippingAccess: jest.fn(() => ({ carrierCode: null })),
    normalizeCarrier: jest.fn((c) => String(c || '').toUpperCase()),
    assertRequestedAccessAllowed: jest.fn(),
    shouldEnforceAssignedAccess: jest.fn(() => false),
    getServiceOptions: jest.fn(() => [])
}));
jest.mock('../src/services/WebhookDispatcher', () => ({ dispatch: jest.fn() }));
jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn(),
    mapStatusToNotificationEvent: jest.fn(() => null)
}));
jest.mock('../src/services/queue/jobQueue', () => ({
    enqueue: jest.fn().mockResolvedValue({})
}));
jest.mock('../src/utils/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
}));

const ShipmentBookingService = require('../src/services/ShipmentBookingService');
const ShipmentLifecycleService = require('../src/services/ShipmentLifecycleService');
const bookingController = require('../src/controllers/shipment-booking.controller');
const crudController = require('../src/controllers/shipment-crud.controller');
const diagnosticAttemptLog = require('../src/services/diagnosticAttemptLog.service');

const validShipmentBase = () => ({
    id: 'shp-1',
    trackingNumber: 'TRK-1001',
    carrierCode: 'DGR',
    status: 'verified',
    origin: {
        name: 'Ali Sender',
        phone: '+96599998888',
        email: 'sender@example.com',
        countryCode: 'KW',
        city: 'Kuwait City',
        addressLine1: 'Block 1 Street 2'
    },
    destination: {
        name: 'Sara Receiver',
        phone: '+971501234567',
        email: 'receiver@example.com',
        countryCode: 'AE',
        city: 'Dubai',
        addressLine1: 'Sheikh Zayed Road'
    },
    parcels: [{ weight: 2, length: 20, width: 15, height: 10, description: 'Electronics', declaredValue: 50 }],
    bookingAttempts: [],
    pricingSnapshot: { carrierRate: 10, markup: 2, totalPrice: 12, currency: 'KWD' },
    price: 12,
    costPrice: 10,
    markupAmount: 2,
    paid: false,
    totalPaid: 0,
    user: { id: 'u-1', role: 'staff' },
    organization: { id: 'org-1', allowedCarriers: ['DGR', 'DGR2', 'SMSA', 'OTE', 'ARAMEX', 'INTERNAL'] },
    organizationId: 'org-1'
});

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('Backend Shipment Lifecycle & API Hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ShipmentBookingService duplicate protection & terminal guards', () => {
        it('blocks booking for terminal statuses with 400 { field, errors } and records diagnostic log', async () => {
            const spy = jest.spyOn(diagnosticAttemptLog, 'recordAttempt');
            const shipment = { ...validShipmentBase(), status: 'cancelled' };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);

            await expect(
                ShipmentBookingService._prepareBooking('TRK-1001', 'DGR', [], 'staff')
            ).rejects.toMatchObject({
                statusCode: 400,
                isValidationError: true,
                field: 'status',
                errors: [expect.objectContaining({ field: 'status' })]
            });

            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                action: 'CARRIER_BOOK',
                status: 'VALIDATION_ERROR',
                trackingNumber: 'TRK-1001'
            }));
        });

        it('returns 409 when a recent pending booking attempt (<60s) exists', async () => {
            const shipment = {
                ...validShipmentBase(),
                bookingAttempts: [{ attemptId: 'att-1', status: 'pending', createdAt: new Date() }]
            };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);

            await expect(
                ShipmentBookingService._prepareBooking('TRK-1001', 'DGR', [], 'staff')
            ).rejects.toMatchObject({
                statusCode: 409
            });
        });

        it('reconciles stale pending booking attempt (>=60s) instead of creating duplicate', async () => {
            const staleDate = new Date(Date.now() - 120000);
            const shipment = {
                ...validShipmentBase(),
                bookingAttempts: [{ attemptId: 'att-stale', status: 'pending', createdAt: staleDate }]
            };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            mockAdapter.getStatus.mockResolvedValue({ trackingNumber: '1234567890', id: 'CAR-1' });
            mockPrisma.shipment.update.mockResolvedValue({ ...shipment, status: 'booked', dhlTrackingNumber: '1234567890' });

            const prep = await ShipmentBookingService._prepareBooking('TRK-1001', 'DGR', [], 'staff');
            expect(prep.alreadyBooked).toBe(true);
            expect(prep.attemptId).toBe('att-stale');
        });

        it('executeCarrierDispatchJob short-circuits if shipment is already booked', async () => {
            const shipment = {
                ...validShipmentBase(),
                status: 'booked',
                carrierShipmentId: 'CAR-999'
            };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);

            const res = await ShipmentBookingService.executeCarrierDispatchJob({
                trackingNumber: 'TRK-1001',
                carrierCode: 'SMSA',
                attemptId: 'att-2'
            });

            expect(res.alreadyBooked || res.outcome === 'booked').toBeTruthy();
            expect(mockAdapter.createShipment).not.toHaveBeenCalled();
        });

        it('persists costPrice, markupAmount, price, and remainingBalance on booking commit', async () => {
            const shipment = {
                ...validShipmentBase(),
                carrierCode: 'SMSA',
                pricingSnapshot: { carrierRate: 10, totalPrice: 14, currency: 'KWD' },
                price: 14,
                costPrice: 10,
                markupAmount: null,
                bookingAttempts: [{ attemptId: 'att-commit', status: 'pending', createdAt: new Date() }]
            };
            mockAdapter.createShipment.mockResolvedValue({
                trackingNumber: '290123456789',
                carrierShipmentId: 'SMSA-1',
                labelUrl: 'data:application/pdf;base64,' + 'A'.repeat(12000)
            });
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            mockPrisma.shipment.update.mockImplementation(async ({ data }) => ({ ...shipment, ...data }));

            const result = await ShipmentBookingService._executeCarrierBooking({
                shipment,
                carrierCode: 'SMSA',
                optionalServiceCodes: [],
                attemptId: 'att-commit',
                payingUser: shipment.user,
                organization: shipment.organization,
                organizationId: 'org-1',
                carrierCapabilities: { supportsExternalApi: true, supportsLabelGeneration: true }
            });

            expect(result.outcome).toBe('booked');
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    price: 14,
                    costPrice: 10,
                    markupAmount: 4,
                    remainingBalance: 14
                })
            }));
        });
    });

    describe('shipment-booking.controller consistency & validation', () => {
        it('getBookingOptions short-circuits for INTERNAL shipments', async () => {
            const shipment = { ...validShipmentBase(), carrierCode: 'INTERNAL', internallyManaged: true };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            const req = { params: { trackingNumber: 'TRK-1001' }, query: {}, user: { id: 'u-1', role: 'admin' } };
            const res = mockRes();

            await bookingController.getBookingOptions(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ carrierCode: 'INTERNAL' })
            }));
            expect(mockAdapter.getRates).not.toHaveBeenCalled();
        });

        it('generateCarrierDocuments returns 400 { field, errors } for INTERNAL shipment', async () => {
            const shipment = { ...validShipmentBase(), carrierCode: 'INTERNAL', internallyManaged: true };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            const req = { params: { trackingNumber: 'TRK-1001' }, query: {}, body: {}, user: { id: 'u-1', role: 'admin' } };
            const res = mockRes();

            await bookingController.generateCarrierDocuments(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                field: 'carrierCode',
                errors: [expect.objectContaining({ field: 'carrierCode' })]
            }));
        });

        it('bookWithCarrier blocks terminal status with 400 { field: status, errors }', async () => {
            const shipment = { ...validShipmentBase(), status: 'delivered' };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            const req = { params: { trackingNumber: 'TRK-1001' }, body: { carrierCode: 'ARAMEX' }, query: {}, user: { id: 'u-1', role: 'admin' } };
            const res = mockRes();

            await bookingController.bookWithCarrier(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                field: 'status',
                errors: [expect.objectContaining({ field: 'status' })]
            }));
        });
    });

    describe('shipment-crud.controller validation, status guards & pricing persistence', () => {
        it('createShipment forwards 400 { field, errors } when isValidationError is thrown', async () => {
            const err = new Error('Validation Failed: Sender name is required');
            err.isValidationError = true;
            err.statusCode = 400;
            err.field = 'sender_name';
            err.errors = [{ field: 'sender_name', step: 1, message: 'Sender name is required' }];
            jest.spyOn(ShipmentLifecycleService, 'submitShipment').mockRejectedValueOnce(err);

            const req = { body: {}, user: { id: 'u-1', role: 'client' } };
            const res = mockRes();

            await crudController.createShipment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Validation Failed: Sender name is required',
                field: 'sender_name',
                errors: [{ field: 'sender_name', step: 1, message: 'Sender name is required' }]
            });
        });

        it('updateShipment blocks terminal-to-draft transition with 400 { field: status, errors }', async () => {
            const shipment = { ...validShipmentBase(), status: 'delivered' };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            const req = {
                params: { trackingNumber: 'TRK-1001' },
                body: { status: 'draft' },
                user: { id: 'u-1', role: 'admin', name: 'Admin' },
                headers: {}
            };
            const res = mockRes();

            await crudController.updateShipment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                field: 'status',
                errors: [expect.objectContaining({ field: 'status' })]
            }));
        });

        it('updateShipment persists costPrice, markupAmount, price, and remainingBalance on INTERNAL/OTE shipments', async () => {
            const shipment = { ...validShipmentBase(), carrierCode: 'OTE', status: 'booked', price: 12, costPrice: 8, markupAmount: 4 };
            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            mockPrisma.shipment.update.mockImplementation(async ({ data }) => ({ ...shipment, ...data }));

            const req = {
                params: { trackingNumber: 'TRK-1001' },
                body: { price: 20, costPrice: 12.5 },
                user: { id: 'u-1', role: 'admin', name: 'Admin' },
                headers: {}
            };
            const res = mockRes();

            await crudController.updateShipment(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    price: 20,
                    costPrice: 12.5,
                    markupAmount: 7.5,
                    remainingBalance: 20,
                    pricingSnapshot: expect.objectContaining({
                        carrierRate: 12.5,
                        markup: 7.5,
                        totalPrice: 20
                    })
                })
            }));
        });
    });

    describe('ShipmentLifecycleService guards', () => {
        it('recordPickup rejects delivered shipment with 400', async () => {
            const shipment = { ...validShipmentBase(), status: 'delivered' };
            await expect(
                ShipmentLifecycleService.recordPickup(shipment, { id: 'drv-1', name: 'Driver' })
            ).rejects.toMatchObject({ statusCode: 400 });
        });

        it('receiveAtOffice rejects invalid action with 400', async () => {
            const shipment = { ...validShipmentBase(), status: 'picked_up' };
            await expect(
                ShipmentLifecycleService.receiveAtOffice(shipment, { id: 'stf-1', name: 'Staff' }, { action: 'invalid_action' })
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });
});
