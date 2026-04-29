const { createMockRes } = require('../testUtils');

describe('LogesTechs webhook controller', () => {
    const prisma = {
        shipment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() }
    };
    const dispatcher = { dispatch: jest.fn() };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/services/WebhookDispatcher', () => dispatcher);
        jest.doMock('../src/config/config', () => ({
            logesTechsWebhookToken: 'secret-token'
        }));
    });

    test('rejects requests with bad token', async () => {
        const controller = require('../src/controllers/logestechs-webhook.controller');
        const req = { headers: { 'x-logestechs-token': 'wrong' }, body: {} };
        const res = createMockRes();
        await controller.lastmile(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(prisma.shipment.findFirst).not.toHaveBeenCalled();
    });

    test('returns 503 when webhook token is not configured', async () => {
        jest.resetModules();
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/services/WebhookDispatcher', () => dispatcher);
        jest.doMock('../src/config/config', () => ({ logesTechsWebhookToken: null }));
        const controller = require('../src/controllers/logestechs-webhook.controller');
        const res = createMockRes();
        await controller.lastmile({ headers: {}, body: {} }, res);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    test('returns 202 when no shipment matches', async () => {
        prisma.shipment.findFirst.mockResolvedValue(null);
        prisma.shipment.findUnique.mockResolvedValue(null);
        const controller = require('../src/controllers/logestechs-webhook.controller');
        const req = {
            headers: { 'x-logestechs-token': 'secret-token' },
            body: { newStatus: 'DELIVERED_TO_RECIPIENT', barcode: 'NOPE', invoiceNumber: 'NOPE' }
        };
        const res = createMockRes();
        await controller.lastmile(req, res);
        expect(res.status).toHaveBeenCalledWith(202);
    });

    test('maps DELIVERED_TO_RECIPIENT to delivered and dispatches event', async () => {
        prisma.shipment.findFirst.mockResolvedValue({
            id: 's1', trackingNumber: 'TRK1', organizationId: 'org-1',
            status: 'in_transit', checkpoints: []
        });
        prisma.shipment.update.mockResolvedValue({});
        const controller = require('../src/controllers/logestechs-webhook.controller');
        const req = {
            headers: { 'x-logestechs-token': 'secret-token' },
            body: {
                packageId: 368200054,
                newStatus: 'DELIVERED_TO_RECIPIENT',
                barcode: '100368200545',
                invoiceNumber: 'TRK1',
                cod: 0,
                time: 1762347300095,
                driverName: 'John',
                driverPhone: '0598985000'
            }
        };
        const res = createMockRes();
        await controller.lastmile(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 's1' },
            data: expect.objectContaining({ status: 'delivered' })
        }));
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'shipment.status_updated',
            'org-1',
            expect.objectContaining({ status: 'delivered', externalStatus: 'DELIVERED_TO_RECIPIENT', carrier: 'OTE' })
        );
    });

    test('fulfillment webhook maps PICKED to in_transit', async () => {
        prisma.shipment.findFirst.mockResolvedValue({
            id: 's1', trackingNumber: 'TRK1', organizationId: 'org-1',
            status: 'booked', checkpoints: []
        });
        const controller = require('../src/controllers/logestechs-webhook.controller');
        const req = {
            headers: { 'x-logestechs-token': 'secret-token' },
            body: { status: 'PICKED', barcode: 'O0015030400001', packageBarcode: null }
        };
        const res = createMockRes();
        await controller.fulfillment(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'in_transit' })
        }));
    });
});
