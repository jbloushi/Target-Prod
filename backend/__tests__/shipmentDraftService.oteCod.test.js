describe('ShipmentDraftService OTE COD defaults', () => {
    const prisma = {
        user: {
            findUnique: jest.fn()
        },
        shipment: {
            create: jest.fn()
        }
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/utils/shipmentUtils', () => ({
            generateUniqueCarrierTrackingNumber: jest.fn().mockResolvedValue('TRG-COD-25')
        }));
        jest.doMock('../src/services/CarrierFactory', () => ({
            getCarrierMetadata: jest.fn(() => ({ defaultServiceCode: 'STD' })),
            getCarrierCapabilities: jest.fn(() => ({ supportsRating: true })),
            getAdapter: jest.fn(() => ({
                getRates: jest.fn().mockResolvedValue([
                    {
                        serviceCode: 'STD',
                        serviceName: 'OTE Standard',
                        totalPrice: 0,
                        currency: 'AED',
                        optionalServices: []
                    }
                ])
            }))
        }));
        jest.doMock('../src/utils/logger', () => ({
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn()
        }));
    });

    it('persists fixed OTE COD collection fields separately from billing price', async () => {
        const ShipmentDraftService = require('../src/services/ShipmentDraftService');
        const targetUser = {
            id: 'client-1',
            role: 'client',
            organizationId: 'org-1',
            organization: { markup: { type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 } },
            carrierConfig: {
                preferredCarrier: 'OTE',
                serviceCode: 'STD',
                pricingByCarrier: {
                    OTE: { fixedFee: 25, currency: 'AED' }
                }
            },
            markup: { type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }
        };
        const shipment = {
            id: 'shipment-1',
            trackingNumber: 'TRG-COD-25',
            carrierCode: 'OTE',
            codAmount: 25,
            codCurrency: 'AED',
            codStatus: 'pending'
        };

        prisma.user.findUnique.mockResolvedValue(targetUser);
        prisma.shipment.create.mockResolvedValue(shipment);

        const result = await ShipmentDraftService.createDraft({
            carrierCode: 'OTE',
            serviceCode: 'STD',
            currency: 'AED',
            sender: {
                contactPerson: 'Sender',
                email: 'sender@example.com',
                phone: '111',
                formattedAddress: 'Origin, Dubai'
            },
            receiver: {
                contactPerson: 'Receiver',
                phone: '222',
                formattedAddress: 'Destination, Dubai'
            },
            parcels: [{ quantity: 1, weight: 1 }]
        }, { id: 'client-1', role: 'client' });

        expect(prisma.shipment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                carrierCode: 'OTE',
                codAmount: 25,
                codCurrency: 'AED',
                codStatus: 'pending',
                price: 25,
                costPrice: 25,
                currency: 'AED',
                pricingSnapshot: expect.objectContaining({
                    carrierRate: 25,
                    totalPrice: 25,
                    billingCurrency: 'AED'
                })
            })
        }));
        expect(result).toBe(shipment);
    });
});
