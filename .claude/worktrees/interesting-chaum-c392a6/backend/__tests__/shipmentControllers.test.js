const { createMockRes } = require('../testUtils');

describe('shipment controllers', () => {
    const prisma = {
        user: {
            findUnique: jest.fn()
        },
        shipment: {
            findUnique: jest.fn(),
            update: jest.fn()
        }
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
    });

    it('allows accounting users to update manual shipment status and manual billing fields in edit flow', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');
        const shipment = {
            id: 'shipment-1',
            trackingNumber: 'MAN-1',
            userId: 'client-1',
            carrierCode: 'MANUAL',
            manualShipment: true,
            status: 'booked',
            history: [],
            currentLocation: { city: 'Kuwait City' },
            pricingSnapshot: { currency: 'KWD' },
            currency: 'KWD',
            costPrice: 1,
            price: 2,
            origin: {},
            destination: {},
            items: [],
            parcels: [],
            dangerousGoods: {}
        };
        const req = {
            params: { trackingNumber: 'MAN-1' },
            user: { id: 'accounting-1', role: 'accounting', name: 'Accountant' },
            body: {
                status: 'delivered',
                price: '25.5',
                costPrice: '18.25',
                estimatedDelivery: '2026-04-20T00:00:00.000Z',
                statusDescription: 'Delivered manually'
            }
        };
        const res = createMockRes();

        prisma.shipment.findUnique.mockResolvedValue(shipment);
        prisma.shipment.update.mockResolvedValue({ ...shipment, status: 'delivered' });

        await controller.updateShipment(req, res);

        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'delivered',
                price: 25.5,
                costPrice: 18.25,
                pricingSnapshot: expect.objectContaining({
                    policySource: 'manual',
                    rulesVersion: 'manual'
                }),
                history: expect.arrayContaining([
                    expect.objectContaining({
                        status: 'delivered',
                        source: 'platform'
                    })
                ])
            })
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects client status changes for manual shipments', async () => {
        const controller = require('../src/controllers/shipment-ops.controller');
        const req = {
            params: { trackingNumber: 'MAN-1' },
            user: { id: 'client-1', role: 'client', name: 'Client' },
            body: { status: 'delivered' }
        };
        const res = createMockRes();

        prisma.shipment.findUnique.mockResolvedValue({
            id: 'shipment-1',
            trackingNumber: 'MAN-1',
            carrierCode: 'MANUAL',
            manualShipment: true,
            status: 'booked',
            history: []
        });

        await controller.updateShipmentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prisma.shipment.update).not.toHaveBeenCalled();
    });

    it('re-rates and persists insurance/optional-service pricing updates during shipment edit', async () => {
        jest.doMock('../src/services/CarrierFactory', () => ({
            getAdapter: jest.fn(() => ({
                getRates: jest.fn().mockResolvedValue([
                    {
                        serviceCode: 'P',
                        totalPrice: 10,
                        currency: 'KWD',
                        optionalServices: [
                            { serviceCode: 'II', serviceName: 'Insurance', totalPrice: 2, currency: 'KWD' },
                            { serviceCode: 'AB', serviceName: 'Other', totalPrice: 3, currency: 'KWD' }
                        ]
                    }
                ])
            }))
        }));

        jest.doMock('../src/services/pricing.service', () => ({
            normalizeAmount: (v) => ({ toFixed: () => Number(v).toFixed(3) }),
            resolveMarkup: jest.fn(() => ({ markup: 0.1, source: 'org_default' })),
            resolveOptionalServiceMarkup: jest.fn(() => ({ markup: 0, source: 'none' })),
            calculateFinalPrice: jest.fn((base) => ({ finalPrice: Number(base), markupAmount: 0 })),
            createSnapshot: jest.fn(() => ({
                totalPrice: 12,
                carrierRate: 10,
                markup: 2,
                currency: 'KWD'
            }))
        }));

        jest.doMock('../src/services/financeLedger.service', () => ({
            createLedgerEntry: jest.fn().mockResolvedValue({})
        }));

        const controller = require('../src/controllers/shipment-crud.controller');

        const shipment = {
            id: 'shipment-2',
            trackingNumber: 'DGR-1',
            userId: 'client-1',
            carrierCode: 'DGR',
            status: 'pending',
            history: [],
            currentLocation: { city: 'Kuwait City' },
            pricingSnapshot: {
                optionalServices: [{ serviceCode: 'AB', totalPrice: 1 }],
                totalPrice: 15
            },
            currency: 'KWD',
            totalPaid: 1,
            costPrice: 10,
            price: 15,
            origin: { optionalServiceCodes: ['AB'], insuredValue: 1 },
            destination: { countryCode: 'KW', city: 'Kuwait City' },
            items: [],
            parcels: []
        };

        prisma.shipment.findUnique.mockResolvedValue(shipment);
        prisma.user.findUnique.mockResolvedValue({
            id: 'client-1',
            organization: { id: 'org-1' }
        });
        prisma.shipment.update.mockResolvedValue({ ...shipment, price: 14 });

        const req = {
            params: { trackingNumber: 'DGR-1' },
            user: { id: 'admin-1', role: 'admin', name: 'Admin' },
            body: {
                incoterm: 'DAP',
                optionalServiceCodes: ['II'],
                insuredValue: 5
            }
        };
        const res = createMockRes();

        await controller.updateShipment(req, res);

        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                origin: expect.objectContaining({
                    optionalServiceCodes: ['II'],
                    insuredValue: 5
                }),
                pricingSnapshot: expect.objectContaining({
                    optionalServices: expect.arrayContaining([
                        expect.objectContaining({ serviceCode: 'II' })
                    ]),
                    optionalServicesTotal: 2,
                    totalPrice: 14
                }),
                price: 14,
                costPrice: 10,
                markupAmount: 2,
                remainingBalance: 13
            })
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
