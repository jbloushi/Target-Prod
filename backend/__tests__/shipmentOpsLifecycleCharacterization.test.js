const mockPrisma = {
    shipment: {
        findUnique: jest.fn(),
        update: jest.fn()
    },
    pickupRequest: {
        findUnique: jest.fn()
    }
};

jest.mock('../src/config/database', () => ({ prisma: mockPrisma }));
jest.mock('../src/controllers/pickup.controller', () => ({
    processApproval: jest.fn()
}));
jest.mock('../src/middleware/authorize.middleware', () => ({
    canAccessShipment: jest.fn(() => true)
}));
jest.mock('../src/controllers/shipment.helpers', () => ({
    canUpdateShipmentStatus: jest.fn(() => true),
    isManualShipment: jest.fn(() => false)
}));
jest.mock('../src/services/chatwootNotificationService', () => ({
    mapStatusToNotificationEvent: jest.fn(() => null),
    triggerShipmentNotification: jest.fn()
}));
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const shipmentOpsController = require('../src/controllers/shipment-ops.controller');

describe('shipment operations lifecycle characterization baseline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('records driver pickup as picked_up for an internally managed shipment', async () => {
        const shipment = {
            id: 'shipment-1',
            trackingNumber: 'TGR-1',
            carrierCode: 'INTERNAL',
            status: 'ready_for_pickup',
            history: [],
            currentLocation: 'Kuwait City'
        };
        const updated = { ...shipment, status: 'picked_up' };
        mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
        mockPrisma.shipment.update.mockResolvedValue(updated);
        const res = responseDouble();

        await shipmentOpsController.pickupShipment({
            params: { trackingNumber: 'TGR-1' },
            user: { id: 'driver-1', role: 'driver', name: 'Driver' }
        }, res);

        expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'shipment-1' },
            data: expect.objectContaining({
                status: 'picked_up',
                history: [expect.objectContaining({ status: 'picked_up' })]
            })
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('records pickup as pending_approval when an external shipment still awaits carrier booking', async () => {
        const shipment = {
            id: 'shipment-2',
            trackingNumber: 'DGR-1',
            carrierCode: 'DGR',
            status: 'ready_for_pickup',
            dhlConfirmed: false,
            dhlTrackingNumber: null,
            history: [],
            currentLocation: 'Kuwait City'
        };
        mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
        mockPrisma.shipment.update.mockResolvedValue({ ...shipment, status: 'pending_approval' });
        const res = responseDouble();

        await shipmentOpsController.pickupShipment({
            params: { trackingNumber: 'DGR-1' },
            user: { id: 'driver-1', role: 'driver', name: 'Driver' }
        }, res);

        expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'pending_approval',
                history: [expect.objectContaining({ status: 'pending_approval' })]
            })
        }));
    });

    it('receives a picked-up shipment at the hub and persists verified weight changes with history', async () => {
        const shipment = {
            id: 'shipment-3',
            trackingNumber: 'TGR-3',
            status: 'picked_up',
            parcels: [{ weight: 1, dimensions: { length: 10, width: 10, height: 10 } }],
            items: [],
            history: [],
            currentLocation: 'Target Hub'
        };
        mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
        mockPrisma.shipment.update.mockResolvedValue({ ...shipment, status: 'received_at_hub' });
        const res = responseDouble();

        await shipmentOpsController.processWarehouseScan({
            params: { trackingNumber: 'TGR-3' },
            body: {
                action: 'receive',
                weight: 1.5,
                dimensions: { length: 12, width: 10, height: 10 }
            },
            user: { id: 'staff-1', role: 'staff', name: 'Staff' }
        }, res);

        expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'received_at_hub',
                parcels: [expect.objectContaining({
                    weight: 1.5,
                    dimensions: { length: 12, width: 10, height: 10 }
                })],
                history: [expect.objectContaining({ status: 'received_at_hub' })]
            })
        }));
    });
});

function responseDouble() {
    const res = {
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
}
