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

    test('runSyncBatch queries all non-terminal statuses with tiered polling and indefinite checking for dormant shipments', async () => {
        prisma.shipment.findMany.mockResolvedValueOnce([]);

        await carrierSyncCronService.runSyncBatch({ limit: 10 });

        const queryCall = prisma.shipment.findMany.mock.calls[0][0];
        const statusFilter = queryCall.where.status.in;
        expect(statusFilter).toEqual(expect.arrayContaining([
            'created', 'pending', 'updated', 'booked', 'ready_for_pickup',
            'picked_up', 'in_transit', 'out_for_delivery', 'received_at_hub',
            'verified', 'exception', 'failed'
        ]));
        // By default, non-terminal shipments have NO cutoff date
        expect(queryCall.where.createdAt).toBeUndefined();

        // Verify tiered polling conditions inside where.AND
        expect(queryCall.where.AND).toBeDefined();
        const tierOrConditions = queryCall.where.AND[0].OR;
        expect(tierOrConditions).toHaveLength(5);
        // Urgent: out_for_delivery
        expect(tierOrConditions[0].status).toBe('out_for_delivery');
        // Fresh
        expect(tierOrConditions[1].createdAt.gte).toBeInstanceOf(Date);
        // Tier 1
        expect(tierOrConditions[2].createdAt.gte).toBeInstanceOf(Date);
        // Tier 2
        expect(tierOrConditions[3].createdAt.gte).toBeInstanceOf(Date);
        // Tier 3
        expect(tierOrConditions[4].createdAt.lt).toBeInstanceOf(Date);
    });

    test('runSyncBatch respects options.maxDays when explicitly provided', async () => {
        prisma.shipment.findMany.mockResolvedValueOnce([]);

        await carrierSyncCronService.runSyncBatch({ limit: 10, maxDays: 180 });

        const queryCall = prisma.shipment.findMany.mock.calls[0][0];
        const cutoffMs = Date.now() - queryCall.where.createdAt.gte.getTime();
        const cutoffDays = Math.round(cutoffMs / (24 * 60 * 60 * 1000));
        expect(cutoffDays).toBe(180);
    });

    test('runSyncBatch bypasses tier throttling when force: true is provided', async () => {
        prisma.shipment.findMany.mockResolvedValueOnce([]);

        await carrierSyncCronService.runSyncBatch({ limit: 10, force: true });

        const queryCall = prisma.shipment.findMany.mock.calls[0][0];
        expect(queryCall.where.AND).toBeUndefined();
    });

    test('getShipmentPollingTier accurately calculates intervals and labels', () => {
        const { getShipmentPollingTier } = carrierSyncCronService;
        const now = new Date('2026-10-17T12:00:00Z');

        // Urgent: out_for_delivery
        const urgent = getShipmentPollingTier({ status: 'out_for_delivery', createdAt: '2026-10-10T00:00:00Z' }, now);
        expect(urgent.tier).toBe('Urgent');
        expect(urgent.label).toBe('Urgent (1h)');
        expect(urgent.intervalHours).toBe(1);

        // Tier 1: <= 14 days old
        const tier1 = getShipmentPollingTier({ status: 'in_transit', createdAt: '2026-10-10T12:00:00Z' }, now);
        expect(tier1.tier).toBe('Tier 1');
        expect(tier1.label).toBe('Tier 1 (2h)');
        expect(tier1.intervalHours).toBe(2);

        // Tier 2: 15 to 45 days old
        const tier2 = getShipmentPollingTier({ status: 'in_transit', createdAt: '2026-09-20T12:00:00Z' }, now);
        expect(tier2.tier).toBe('Tier 2');
        expect(tier2.label).toBe('Tier 2 (18h)');
        expect(tier2.intervalHours).toBe(18);

        // Tier 3: > 45 days old (indefinite checking every 15 days)
        const tier3 = getShipmentPollingTier({ status: 'in_transit', createdAt: '2026-08-01T12:00:00Z' }, now);
        expect(tier3.tier).toBe('Tier 3');
        expect(tier3.label).toBe('Tier 3 (15d)');
        expect(tier3.intervalHours).toBe(360);
        expect(tier3.intervalDays).toBe(15);
    });
});

