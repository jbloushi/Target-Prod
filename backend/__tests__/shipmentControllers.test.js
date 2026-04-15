const { createMockRes } = require('../testUtils');

describe('shipment controllers', () => {
    const prisma = {
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
});
