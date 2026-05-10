describe('Internal carrier architecture', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('registers INTERNAL with first-class carrier capabilities', () => {
        const CarrierFactory = require('../src/services/CarrierFactory');

        expect(CarrierFactory.getAvailableCarriers()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'INTERNAL',
                    name: 'Internal',
                    active: true,
                    trackingPrefix: 'TGR',
                    defaultServiceCode: 'STD',
                    capabilities: expect.objectContaining({
                        code: 'INTERNAL',
                        supportsBooking: true,
                        supportsRating: true,
                        supportsTracking: true,
                        supportsCancellation: false,
                        supportsLabelGeneration: false,
                        supportsExternalApi: false,
                        supportsConversionTarget: false
                    })
                })
            ])
        );

        const adapter = CarrierFactory.getAdapter('internal');
        expect(adapter.code).toBe('INTERNAL');
        expect(adapter.capabilities.supportsExternalApi).toBe(false);
    });

    it('returns a manual pricing scaffold for INTERNAL rating', async () => {
        const CarrierRateService = require('../src/services/CarrierRateService');

        const rates = await CarrierRateService.getRates({ currency: 'KWD' }, 'INTERNAL');

        expect(rates).toEqual([
            expect.objectContaining({
                success: true,
                carrier: 'INTERNAL',
                carrierCode: 'INTERNAL',
                rateType: 'INTERNAL',
                requiresManualPricing: true,
                amount: null,
                totalPrice: null,
                currency: 'KWD',
                serviceCode: 'STD',
                provider: 'INTERNAL'
            })
        ]);
    });

    it('generates unique TGR tracking numbers after checking existing shipments', async () => {
        const { generateUniqueCarrierTrackingNumber } = require('../src/utils/shipmentUtils');
        const prisma = {
            shipment: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce({ id: 'collision' })
                    .mockResolvedValueOnce(null)
            }
        };

        const trackingNumber = await generateUniqueCarrierTrackingNumber(prisma, 'INTERNAL');

        expect(trackingNumber).toMatch(/^TGR-[A-Z0-9]{12}$/);
        expect(prisma.shipment.findUnique).toHaveBeenCalledTimes(2);
        expect(prisma.shipment.findUnique).toHaveBeenCalledWith({ where: { trackingNumber: expect.stringMatching(/^TGR-/) } });
    });

    it('books INTERNAL shipments locally without external API calls and records history', async () => {
        const shipmentRecord = {
            id: 'shipment-internal-1',
            trackingNumber: 'TGR-ABC123DEF456',
            userId: 'user-1',
            organizationId: 'org-1',
            carrierCode: 'INTERNAL',
            serviceCode: 'STD',
            status: 'ready_for_pickup',
            price: 0,
            currency: 'KWD',
            pricingSnapshot: {
                totalPrice: 0,
                currency: 'KWD',
                expiresAt: new Date(Date.now() + 86400000).toISOString()
            },
            bookingAttempts: [],
            history: [
                {
                    status: 'ready_for_pickup',
                    description: 'Shipment Created',
                    timestamp: new Date().toISOString()
                }
            ],
            documents: [],
            origin: { formattedAddress: 'Kuwait City', contactPerson: 'Sender', phone: '123' },
            destination: { formattedAddress: 'Salmiya', contactPerson: 'Receiver', phone: '456' },
            parcels: [],
            items: [],
            user: { id: 'user-1' },
            organization: { id: 'org-1' }
        };

        const prisma = {
            shipment: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce(shipmentRecord)
                    .mockResolvedValueOnce({
                        ...shipmentRecord,
                        bookingAttempts: [{ attemptId: 'attempt-1', status: 'pending', createdAt: new Date().toISOString() }]
                    })
                    .mockResolvedValueOnce({
                        ...shipmentRecord,
                        bookingAttempts: [{ attemptId: 'attempt-1', status: 'pending', createdAt: new Date().toISOString() }]
                    }),
                update: jest.fn(async ({ data }) => ({ ...shipmentRecord, ...data }))
            }
        };
        const createLedgerEntry = jest.fn();
        const createShipment = jest.fn();

        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('crypto', () => ({ randomUUID: () => 'attempt-1' }));
        jest.doMock('../src/services/CarrierFactory', () => {
            const actual = jest.requireActual('../src/services/CarrierFactory');
            return {
                getAvailableCarriers: actual.getAvailableCarriers.bind(actual),
                getCarrierMetadata: actual.getCarrierMetadata.bind(actual),
                getCarrierCapabilities: actual.getCarrierCapabilities.bind(actual),
                getAdapter: jest.fn((carrierCode) => {
                    const adapter = actual.getAdapter(carrierCode);
                    if (String(carrierCode).toUpperCase() === 'INTERNAL') {
                        adapter.createShipment = createShipment.mockImplementation(adapter.createShipment.bind(adapter));
                    }
                    return adapter;
                })
            };
        });
        jest.doMock('../src/services/financeLedger.service', () => ({ createLedgerEntry }));

        const ShipmentBookingService = require('../src/services/ShipmentBookingService');
        const result = await ShipmentBookingService.bookShipment(shipmentRecord.trackingNumber, 'INTERNAL', [], 'admin');

        expect(createShipment).toHaveBeenCalledTimes(1);
        expect(result.shipment).toEqual(expect.objectContaining({
            status: 'booked',
            carrierCode: 'INTERNAL',
            carrierShipmentId: shipmentRecord.trackingNumber,
            dhlTrackingNumber: shipmentRecord.trackingNumber
        }));
        expect(prisma.shipment.update).toHaveBeenLastCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'booked',
                pricingSnapshot: expect.objectContaining({
                    internallyManaged: true,
                    requiresManualPricing: true
                }),
                history: expect.arrayContaining([
                    expect.objectContaining({
                        status: 'booked',
                        description: 'Awaiting Internal Processing',
                        source: 'platform'
                    })
                ])
            })
        }));
        expect(createLedgerEntry).not.toHaveBeenCalled();
    });

    it('allows platform staff to book a converted DGR shipment even if the paying account was assigned INTERNAL', async () => {
        const shipmentRecord = {
            id: 'shipment-converted-1',
            trackingNumber: 'TGR-ABC123DEF456',
            userId: 'user-1',
            organizationId: 'org-1',
            carrierCode: 'DGR',
            serviceCode: 'P',
            status: 'ready_for_pickup',
            price: 11.5,
            costPrice: 10,
            currency: 'KWD',
            pricingSnapshot: {
                carrierRate: 10,
                totalPrice: 11.5,
                currency: 'KWD',
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                conversion: {
                    fromCarrierCode: 'INTERNAL',
                    toCarrierCode: 'DGR',
                    convertedAt: new Date().toISOString()
                }
            },
            bookingAttempts: [],
            history: [],
            documents: [],
            origin: { formattedAddress: 'Kuwait City', contactPerson: 'Sender', phone: '123' },
            destination: { formattedAddress: 'Salmiya', contactPerson: 'Receiver', phone: '456' },
            parcels: [],
            items: [],
            user: {
                id: 'user-1',
                agentPolicy: {
                    shippingAccess: {
                        carrierCode: 'INTERNAL',
                        serviceCode: 'STD'
                    }
                }
            },
            organization: { id: 'org-1', allowedCarriers: ['INTERNAL', 'DGR'] }
        };

        const prisma = {
            shipment: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce(shipmentRecord)
                    .mockResolvedValueOnce({
                        ...shipmentRecord,
                        bookingAttempts: [{ attemptId: 'attempt-2', status: 'pending', createdAt: new Date().toISOString() }]
                    }),
                update: jest.fn(async ({ data }) => ({ ...shipmentRecord, ...data }))
            }
        };
        const createLedgerEntry = jest.fn();

        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('crypto', () => ({ randomUUID: () => 'attempt-2' }));
        jest.doMock('../src/services/CarrierFactory', () => ({
            getCarrierCapabilities: jest.fn(() => ({
                supportsExternalApi: true,
                supportsLabelGeneration: false
            })),
            getAvailableCarriers: jest.fn(() => [{ code: 'DGR' }]),
            getAdapter: jest.fn(() => ({
                createShipment: jest.fn().mockResolvedValue({
                    trackingNumber: 'JD01460001004200000001',
                    carrierShipmentId: 'JD01460001004200000001'
                })
            }))
        }));
        jest.doMock('../src/services/financeLedger.service', () => ({ createLedgerEntry }));

        const ShipmentBookingService = require('../src/services/ShipmentBookingService');
        const result = await ShipmentBookingService.bookShipment(shipmentRecord.trackingNumber, 'DGR', [], 'staff');

        expect(result.success).toBe(true);
        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'booked',
                dhlConfirmed: true
            })
        }));
        expect(createLedgerEntry).toHaveBeenCalled();
    });

    it('prefers carrierCode over legacy carrier fields when syncing converted shipments', async () => {
        const getTracking = jest.fn().mockResolvedValue({
            status: 'booked',
            events: []
        });

        jest.doMock('../src/services/CarrierFactory', () => ({
            getAdapter: jest.fn(() => ({ getTracking }))
        }));

        const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
        await syncCarrierTrackingHistory({
            trackingNumber: 'TGR-OTE123456789',
            carrier: 'LOGESTECHS',
            carrierCode: 'OTE',
            carrierShipmentId: 'OTE123',
            history: []
        });

        const CarrierFactory = require('../src/services/CarrierFactory');
        expect(CarrierFactory.getAdapter).toHaveBeenCalledWith('OTE');
    });

    it('wires shipment routes without depending on barrel booking exports for conversion endpoints', () => {
        const router = require('../src/routes/shipment.routes');
        expect(typeof router).toBe('function');
    });
});
