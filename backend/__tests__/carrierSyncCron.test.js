const carrierSyncCronService = require('../src/services/carrierSyncCron.service');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findMany: jest.fn(),
            update: jest.fn()
        }
    }
}));

jest.mock('../src/controllers/shipment.helpers', () => ({
    syncCarrierTrackingHistory: jest.fn(),
    resolveCarrierTrackingNumber: jest.fn((s) => s.carrierTrackingNumber || s.trackingNumber || 'TRK-100')
}));

jest.mock('../src/services/chatwootNotificationService', () => ({
    mapStatusToNotificationEvent: jest.fn(() => 'delivered'),
    triggerShipmentNotification: jest.fn()
}));

describe('CarrierSyncCronService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('runSyncBatch scans and updates eligible active shipments', async () => {
        const mockShipments = [
            {
                id: 'ship-1',
                trackingNumber: 'TRK-100',
                carrierCode: 'DHL',
                carrier: 'DHL',
                status: 'in_transit',
                history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }]
            }
        ];

        prisma.shipment.findMany.mockResolvedValueOnce(mockShipments);

        const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
        syncCarrierTrackingHistory.mockResolvedValueOnce({
            status: 'out_for_delivery',
            history: [
                { status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' },
                { status: 'out_for_delivery', timestamp: '2026-09-12T08:00:00Z' }
            ]
        });

        prisma.shipment.update.mockResolvedValueOnce({
            id: 'ship-1',
            trackingNumber: 'TRK-100',
            status: 'out_for_delivery'
        });

        const result = await carrierSyncCronService.runSyncBatch({ limit: 5 });

        expect(result.scanned).toBe(1);
        expect(result.synced).toBe(1);
        expect(result.updated).toBe(1);
        expect(prisma.shipment.update).toHaveBeenCalledWith({
            where: { id: 'ship-1' },
            data: expect.objectContaining({ status: 'out_for_delivery' })
        });
    });

    test('runSyncBatch gracefully handles empty active shipment queue', async () => {
        prisma.shipment.findMany.mockResolvedValueOnce([]);

        const result = await carrierSyncCronService.runSyncBatch({ limit: 10 });
        expect(result.scanned).toBe(0);
        expect(result.updated).toBe(0);
        expect(result.synced).toBe(0);
    });
});
