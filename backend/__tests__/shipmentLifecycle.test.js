const { createMockRes } = require('../testUtils');

describe('shipment lifecycle and staff carrier dispatch', () => {
    const shipment = {
        id: 'shipment-1',
        trackingNumber: 'TGR-LIFECYCLE-1',
        userId: 'client-1',
        organizationId: 'org-1',
        carrierCode: 'DGR',
        status: 'booked',
        currentLocation: { city: 'Kuwait City' },
        destination: { contactPerson: 'Recipient', city: 'Dubai' },
        history: []
    };
    const prisma = {
        shipment: {
            findUnique: jest.fn(),
            update: jest.fn()
        }
    };
    const bookShipment = jest.fn();

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        shipment.status = 'booked';
        shipment.history = [];
        prisma.shipment.findUnique.mockImplementation(async () => ({ ...shipment }));
        prisma.shipment.update.mockImplementation(async ({ data }) => {
            Object.assign(shipment, data);
            return { ...shipment };
        });
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/middleware/authorize.middleware', () => ({
            canAccessShipment: jest.fn(() => true)
        }));
        jest.doMock('../src/controllers/shipment.helpers', () => ({
            ...jest.requireActual('../src/controllers/shipment.helpers'),
            isManualShipment: jest.fn(() => false),
            canUpdateShipmentStatus: jest.fn(() => true)
        }));
        jest.doMock('../src/services/chatwootNotificationService', () => ({
            mapStatusToNotificationEvent: jest.fn(() => null),
            triggerShipmentNotification: jest.fn()
        }));
        jest.doMock('../src/services/ShipmentBookingService', () => ({
            bookShipment,
            bookShipmentAsync: jest.fn()
        }));
    });

    it('moves a UI-created shipment through every operational step and records POD as delivered', async () => {
        const controller = require('../src/controllers/shipment-ops.controller');
        const user = { id: 'staff-1', role: 'staff', name: 'Operations Staff' };

        for (const status of ['ready_for_pickup', 'picked_up', 'received_at_hub', 'verified', 'in_transit', 'out_for_delivery']) {
            const res = createMockRes();
            await controller.updateShipmentStatus({
                params: { trackingNumber: shipment.trackingNumber },
                user,
                body: { status, description: `Lifecycle check: ${status}` }
            }, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(shipment.status).toBe(status);
        }

        const deliveryRes = createMockRes();
        await controller.confirmDeliveryWithPod({
            params: { trackingNumber: shipment.trackingNumber },
            user,
            body: { recipientName: 'Recipient', signatureDataUrl: 'data:image/png;base64,c2lnbmF0dXJl' }
        }, deliveryRes);

        expect(deliveryRes.status).toHaveBeenCalledWith(200);
        expect(shipment.status).toBe('delivered');
        expect(shipment.history.map((event) => event.status)).toEqual([
            'ready_for_pickup', 'picked_up', 'received_at_hub', 'verified',
            'in_transit', 'out_for_delivery', 'delivered'
        ]);
        expect(shipment.documents.pod).toEqual(expect.objectContaining({ recipientName: 'Recipient' }));
    });

    it('lets staff select a carrier and synchronously dispatch a shipment', async () => {
        const controller = require('../src/controllers/shipment-booking.controller');
        bookShipment.mockResolvedValue({ shipment: { ...shipment, status: 'booked', carrierCode: 'OTE' } });
        const res = createMockRes();

        await controller.bookWithCarrier({
            params: { trackingNumber: shipment.trackingNumber },
            query: { async: 'false' },
            user: { id: 'staff-1', role: 'staff', name: 'Operations Staff' },
            body: { carrierCode: 'OTE', optionalServiceCodes: ['EPOD'], async: false }
        }, res);

        expect(bookShipment).toHaveBeenCalledWith(
            shipment.trackingNumber,
            'OTE',
            ['EPOD'],
            'staff'
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
