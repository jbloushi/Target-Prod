const { createMockRes } = require('../testUtils');

jest.mock('../src/utils/logger', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
}));

describe('LogesTechs webhook ingestion', () => {
    const prisma = {
        shipment: {
            findFirst: jest.fn(),
            update: jest.fn()
        }
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
    });

    it('appends carrier history and marks COD collected for delivered OTE webhook payloads', async () => {
        const integrationController = require('../src/controllers/integration.controller');
        const req = {
            headers: {},
            body: {
                packageId: 368200054,
                newStatus: 'DELIVERED_TO_RECIPIENT',
                barcode: '100368200545',
                cod: 25,
                time: 1762347300095,
                driverName: 'N1',
                driverPhone: '0598985000',
                paymentType: 'cash'
            }
        };
        const res = createMockRes();
        const shipment = {
            id: 'shipment-1',
            trackingNumber: 'TRG-LOCAL',
            carrierCode: 'OTE',
            carrierShipmentId: '368200054',
            dhlTrackingNumber: '100368200545',
            status: 'booked',
            history: [],
            codAmount: 25,
            codCurrency: 'AED',
            origin: { contactPerson: 'Sender', phone: '111' }
        };

        prisma.shipment.findFirst.mockResolvedValue(shipment);
        prisma.shipment.update.mockResolvedValue({ ...shipment, status: 'delivered' });

        await integrationController.handleLogesTechsWebhook(req, res);

        expect(prisma.shipment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                carrierCode: 'OTE'
            })
        }));
        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'shipment-1' },
            data: expect.objectContaining({
                status: 'delivered',
                codStatus: 'collected',
                history: [
                    expect.objectContaining({
                        status: 'delivered',
                        source: 'carrier',
                        description: 'DELIVERED_TO_RECIPIENT',
                        location: expect.objectContaining({
                            contactPerson: 'N1',
                            phone: '0598985000'
                        })
                    })
                ]
            })
        }));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
});
