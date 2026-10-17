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
    buildTrackingSyncDocuments: jest.fn((shipment, updates) => ({
        ...(shipment?.documents && typeof shipment.documents === 'object' ? shipment.documents : {}),
        trackingSync: updates?.trackingSyncMeta || null
    })),
    resolveCarrierTrackingNumber: jest.fn((s) => s.carrierTrackingNumber || s.trackingNumber || 'TRK-100'),
    autoHealAllResolvedExceptions: jest.fn().mockResolvedValue(0)
}));

jest.mock('../src/services/chatwootNotificationService', () => ({
    mapStatusToNotificationEvent: jest.fn(() => 'delivered'),
    triggerShipmentNotification: jest.fn()
}));

describe('CarrierSyncCronService', () => {
    const originalEnv = process.env.NODE_APP_INSTANCE;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.NODE_APP_INSTANCE;
    });

    afterEach(() => {
        carrierSyncCronService.stop();
        if (originalEnv !== undefined) {
            process.env.NODE_APP_INSTANCE = originalEnv;
        } else {
            delete process.env.NODE_APP_INSTANCE;
        }
    });

    test('runSyncBatch scans and updates eligible active shipments on genuine status change', async () => {
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
            ],
            trackingSyncMeta: { status: 'SUCCESS', carrierCode: 'DHL' }
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

    test('runSyncBatch does not increment updated or write full updates when tracking data is unchanged', async () => {
        const mockShipment = {
            id: 'ship-2',
            trackingNumber: 'TRK-200',
            carrierCode: 'DHL',
            status: 'in_transit',
            history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }],
            pricingSnapshot: { carrierWeight: 2.5, carrierPieces: 1 }
        };

        prisma.shipment.findMany.mockResolvedValueOnce([mockShipment]);

        const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
        // Identical status, history, weight, pieces, but returns trackingSyncMeta
        syncCarrierTrackingHistory.mockResolvedValueOnce({
            status: 'in_transit',
            history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }],
            pricingSnapshot: { carrierWeight: 2.5, carrierPieces: 1 },
            trackingSyncMeta: { status: 'SUCCESS', carrierCode: 'DHL', eventCount: 1 }
        });

        prisma.shipment.update.mockResolvedValueOnce({ id: 'ship-2' });

        const result = await carrierSyncCronService.runSyncBatch({ limit: 5 });

        expect(result.scanned).toBe(1);
        expect(result.synced).toBe(1);
        expect(result.updated).toBe(0); // Must NOT increment updated
        // Must only touch updatedAt for queue rotation
        expect(prisma.shipment.update).toHaveBeenCalledWith({
            where: { id: 'ship-2' },
            data: { updatedAt: expect.any(Date) }
        });
    });

    test('runSyncBatch updates shipment when only ETA changes', async () => {
        const mockShipment = {
            id: 'ship-3',
            trackingNumber: 'TRK-300',
            carrierCode: 'DHL',
            status: 'in_transit',
            history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }],
            estimatedDelivery: '2026-09-15T00:00:00.000Z'
        };

        prisma.shipment.findMany.mockResolvedValueOnce([mockShipment]);

        const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
        syncCarrierTrackingHistory.mockResolvedValueOnce({
            status: 'in_transit',
            history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }],
            estimatedDelivery: '2026-09-18T00:00:00.000Z',
            trackingSyncMeta: { status: 'SUCCESS' }
        });

        prisma.shipment.update.mockResolvedValueOnce({ id: 'ship-3' });

        const result = await carrierSyncCronService.runSyncBatch({ limit: 5 });

        expect(result.updated).toBe(1);
        expect(prisma.shipment.update).toHaveBeenCalledWith({
            where: { id: 'ship-3' },
            data: expect.objectContaining({
                estimatedDelivery: '2026-09-18T00:00:00.000Z'
            })
        });
    });

    test('runSyncBatch updates shipment when carrierWeight or carrierPieces change', async () => {
        const mockShipment = {
            id: 'ship-4',
            trackingNumber: 'TRK-400',
            carrierCode: 'DHL',
            status: 'in_transit',
            history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }],
            pricingSnapshot: { carrierWeight: 2.0, carrierPieces: 1 }
        };

        prisma.shipment.findMany.mockResolvedValueOnce([mockShipment]);

        const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
        syncCarrierTrackingHistory.mockResolvedValueOnce({
            status: 'in_transit',
            history: [{ status: 'in_transit', timestamp: '2026-09-10T10:00:00Z' }],
            actualWeight: 3.5,
            totalPieces: 2,
            trackingSyncMeta: { status: 'SUCCESS' }
        });

        prisma.shipment.update.mockResolvedValueOnce({ id: 'ship-4' });

        const result = await carrierSyncCronService.runSyncBatch({ limit: 5 });

        expect(result.updated).toBe(1);
        expect(prisma.shipment.update).toHaveBeenCalledWith({
            where: { id: 'ship-4' },
            data: expect.objectContaining({
                pricingSnapshot: expect.objectContaining({
                    carrierWeight: 3.5,
                    carrierPieces: 2
                })
            })
        });
    });

    test('runSyncBatch gracefully handles empty active shipment queue', async () => {
        prisma.shipment.findMany.mockResolvedValueOnce([]);

        const result = await carrierSyncCronService.runSyncBatch({ limit: 10 });
        expect(result.scanned).toBe(0);
        expect(result.updated).toBe(0);
        expect(result.synced).toBe(0);
    });

    test('PM2 cluster isolation: skips cron start on secondary cluster instances', () => {
        process.env.NODE_APP_INSTANCE = '1';
        carrierSyncCronService.isRunning = false;

        carrierSyncCronService.start();

        expect(carrierSyncCronService.isRunning).toBe(false);
        expect(carrierSyncCronService.cronTimer).toBeNull();
    });

    test('PM2 cluster isolation: starts cron on primary cluster instance 0', () => {
        process.env.NODE_APP_INSTANCE = '0';
        carrierSyncCronService.isRunning = false;

        carrierSyncCronService.start();

        expect(carrierSyncCronService.isRunning).toBe(true);
        expect(carrierSyncCronService.cronTimer).not.toBeNull();
        carrierSyncCronService.stop();
    });

    test('runSyncBatch touches updatedAt when syncCarrierTrackingHistory throws an error to prevent queue starvation', async () => {
        const mockShipment = {
            id: 'ship-err-1',
            trackingNumber: 'TRK-ERR-1',
            carrierCode: 'DHL',
            status: 'in_transit',
            history: []
        };

        prisma.shipment.findMany.mockResolvedValueOnce([mockShipment]);

        const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
        syncCarrierTrackingHistory.mockRejectedValueOnce(new Error('Scraper timeout'));
        prisma.shipment.update.mockResolvedValueOnce({ id: 'ship-err-1' });

        const result = await carrierSyncCronService.runSyncBatch({ limit: 5 });

        expect(result.errors).toBe(1);
        expect(prisma.shipment.update).toHaveBeenCalledWith({
            where: { id: 'ship-err-1' },
            data: { updatedAt: expect.any(Date) }
        });
    });

    test('runSyncBatch queries all non-terminal statuses including ready_for_pickup, updated, failed, and exception across 180-day window', async () => {
        prisma.shipment.findMany.mockResolvedValueOnce([]);

        await carrierSyncCronService.runSyncBatch({ limit: 10 });

        const queryCall = prisma.shipment.findMany.mock.calls[0][0];
        const statusFilter = queryCall.where.status.in;
        expect(statusFilter).toEqual(expect.arrayContaining([
            'created', 'pending', 'updated', 'booked', 'ready_for_pickup',
            'picked_up', 'in_transit', 'out_for_delivery', 'received_at_hub',
            'verified', 'exception', 'failed'
        ]));
        const cutoffMs = Date.now() - queryCall.where.createdAt.gte.getTime();
        const cutoffDays = Math.round(cutoffMs / (24 * 60 * 60 * 1000));
        expect(cutoffDays).toBe(180);
    });
});
