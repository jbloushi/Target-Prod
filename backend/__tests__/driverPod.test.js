const shipmentOpsController = require('../src/controllers/shipment-ops.controller');
const { prisma } = require('../src/config/database');
const { createMockRes } = require('../testUtils');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findUnique: jest.fn(),
            update: jest.fn()
        }
    }
}));

jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn()
}));

describe('Driver Proof of Delivery (POD)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('records proof of delivery, updates status to DELIVERED, and stores signature and recipient info', async () => {
        const mockShipment = {
            id: 'ship-pod-1',
            trackingNumber: 'TRK-POD-100',
            status: 'OUT_FOR_DELIVERY',
            assignedDriverId: 'driver-1',
            origin: { company: 'Seller Org', city: 'Kuwait City' },
            destination: { contactPerson: 'Fatima Al-Sabah', city: 'Salmiya' },
            history: [],
            documents: {},
            codAmount: 15.000,
            codStatus: 'PENDING'
        };

        prisma.shipment.findUnique.mockResolvedValue(mockShipment);
        prisma.shipment.update.mockResolvedValue({
            ...mockShipment,
            status: 'DELIVERED',
            codStatus: 'COLLECTED'
        });

        const req = {
            params: { trackingNumber: 'TRK-POD-100' },
            user: { id: 'driver-1', role: 'driver', name: 'Ahmed Driver' },
            body: {
                recipientName: 'Fatima Al-Sabah',
                recipientRelationship: 'Self',
                signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                notes: 'Signed and received in good condition',
                codCollected: 15.000,
                coordinates: [29.3759, 47.9774]
            }
        };
        const res = createMockRes();

        await shipmentOpsController.confirmDeliveryWithPod(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'ship-pod-1' },
            data: expect.objectContaining({
                status: 'DELIVERED',
                codStatus: 'COLLECTED',
                documents: expect.objectContaining({
                    pod: expect.objectContaining({
                        recipientName: 'Fatima Al-Sabah',
                        recipientRelationship: 'Self',
                        signatureDataUrl: expect.stringContaining('data:image/png;base64'),
                        driverName: 'Ahmed Driver',
                        codCollected: 15
                    })
                })
            })
        }));
    });
});
