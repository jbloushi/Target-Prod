describe('Internal shipment conversion service', () => {
    const sourceShipment = {
        id: 'shipment-internal-1',
        trackingNumber: 'TGR-ABC123DEF456',
        userId: 'client-1',
        createdOnBehalfOfUserId: null,
        organizationId: 'org-1',
        carrierCode: 'INTERNAL',
        serviceCode: 'STD',
        status: 'booked',
        price: 0,
        costPrice: 0,
        markupAmount: 0,
        currency: 'KWD',
        pricingSnapshot: {
            carrierRate: 0,
            totalPrice: 0,
            currency: 'KWD',
            requiresManualPricing: true,
            internallyManaged: true
        },
        origin: {
            formattedAddress: 'Kuwait City, Kuwait',
            contactPerson: 'Sender',
            phone: '111',
            packagingType: 'user',
            incoterm: 'DAP'
        },
        destination: {
            formattedAddress: 'Salmiya, Kuwait',
            contactPerson: 'Receiver',
            phone: '222'
        },
        currentLocation: { formattedAddress: 'Kuwait City, Kuwait' },
        items: [{ description: 'Box', quantity: 1, weight: 1, currency: 'KWD' }],
        parcels: [{ weight: 1, length: 10, width: 10, height: 10 }],
        shipmentType: 'package',
        estimatedDelivery: new Date('2026-05-12T00:00:00.000Z'),
        history: [
            {
                status: 'booked',
                description: 'Awaiting Internal Processing',
                source: 'platform',
                timestamp: new Date('2026-05-09T00:00:00.000Z')
            }
        ],
        bookingAttempts: [],
        documents: [],
        user: {
            id: 'client-1',
            organizationId: 'org-1',
            organization: { id: 'org-1', markup: null, allowedCarriers: ['INTERNAL', 'DGR', 'OTE'] }
        },
        organization: { id: 'org-1', markup: null, allowedCarriers: ['INTERNAL', 'DGR', 'OTE'] }
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('declares DGR and OTE as conversion targets without making INTERNAL a target', () => {
        const CarrierFactory = require('../src/services/CarrierFactory');
        const InternalShipmentConversionService = require('../src/services/InternalShipmentConversionService');

        expect(CarrierFactory.getCarrierCapabilities('DGR')).toEqual(expect.objectContaining({
            supportsConversionTarget: true
        }));
        expect(CarrierFactory.getCarrierCapabilities('OTE')).toEqual(expect.objectContaining({
            supportsConversionTarget: true
        }));
        expect(CarrierFactory.getCarrierCapabilities('INTERNAL')).toEqual(expect.objectContaining({
            supportsConversionTarget: false
        }));

        expect(InternalShipmentConversionService.getConversionTargetCarriers().map(carrier => carrier.code)).toEqual(['DGR', 'OTE']);
    });

    it('converts an internal shipment in place without booking the carrier', async () => {
        const createShipment = jest.fn();
        const getRates = jest.fn().mockResolvedValue([
            {
                serviceCode: 'P',
                serviceName: 'Express Worldwide',
                totalPrice: 10,
                currency: 'KWD',
                optionalServices: []
            }
        ]);
        const convertedShipment = {
            ...sourceShipment,
            carrierCode: 'DGR',
            serviceCode: 'P',
            status: 'ready_for_pickup'
        };
        const prisma = {
            shipment: {
                findUnique: jest.fn(async ({ where }) => {
                    if (where.trackingNumber === sourceShipment.trackingNumber) return sourceShipment;
                    return null;
                }),
                update: jest.fn(async ({ data }) => ({ ...convertedShipment, ...data }))
            },
            organizationLedger: {
                findFirst: jest.fn().mockResolvedValue(null)
            }
        };

        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/services/CarrierFactory', () => {
            const actual = jest.requireActual('../src/services/CarrierFactory');
            return {
                getAvailableCarriers: actual.getAvailableCarriers.bind(actual),
                getCarrierMetadata: actual.getCarrierMetadata.bind(actual),
                getCarrierCapabilities: actual.getCarrierCapabilities.bind(actual),
                getAdapter: jest.fn(() => ({ getRates, createShipment }))
            };
        });

        const InternalShipmentConversionService = require('../src/services/InternalShipmentConversionService');
        const result = await InternalShipmentConversionService.convertToCarrier(sourceShipment.trackingNumber, {
            carrierCode: 'DGR',
            serviceCode: 'P'
        }, { id: 'staff-1', role: 'staff', name: 'Staff' });

        expect(getRates).toHaveBeenCalledTimes(1);
        expect(createShipment).not.toHaveBeenCalled();
        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: sourceShipment.id },
            data: expect.objectContaining({
                carrierCode: 'DGR',
                serviceCode: 'P',
                status: 'ready_for_pickup',
                dhlConfirmed: false,
                carrierShipmentId: null,
                dhlTrackingNumber: null,
                pricingSnapshot: expect.objectContaining({
                    carrierRate: 10,
                    totalPrice: 11.5,
                    conversion: expect.objectContaining({
                        trackingNumber: sourceShipment.trackingNumber,
                        fromCarrierCode: 'INTERNAL',
                        toCarrierCode: 'DGR',
                        convertedBy: 'staff-1'
                    })
                }),
                history: expect.arrayContaining([
                    expect.objectContaining({
                        status: 'ready_for_pickup',
                        description: 'Carrier changed from INTERNAL to DGR',
                        source: 'platform'
                    })
                ])
            })
        }));
        expect(result.shipment.carrierCode).toBe('DGR');
        expect(result.shipment.trackingNumber).toBe(sourceShipment.trackingNumber);
        expect(result.shipment.status).toBe('ready_for_pickup');
    });

    it('rejects converting a non-internal shipment', async () => {
        const prisma = {
            shipment: {
                findUnique: jest.fn().mockResolvedValue({
                    ...sourceShipment,
                    carrierCode: 'DGR',
                    trackingNumber: 'DGR-ABC123DEF456'
                })
            },
            organizationLedger: {
                findFirst: jest.fn().mockResolvedValue(null)
            }
        };

        jest.doMock('../src/config/database', () => ({ prisma }));

        const InternalShipmentConversionService = require('../src/services/InternalShipmentConversionService');

        await expect(InternalShipmentConversionService.convertToCarrier('DGR-ABC123DEF456', {
            carrierCode: 'OTE',
            serviceCode: 'STD'
        }, { id: 'staff-1', role: 'staff' })).rejects.toThrow('Only INTERNAL shipments can be converted');
    });
});
