const {
    reconcileTrackingHistory,
    evaluateHistoryCheckpointStatus,
    parseCliArgs
} = require('../scripts/reconcile-tracking-history');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findMany: jest.fn(),
            update: jest.fn()
        },
        shipmentTrackingEvent: {
            upsert: jest.fn()
        }
    }
}));

describe('reconcile-tracking-history script', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prisma.shipment.update.mockResolvedValue({});
        prisma.shipmentTrackingEvent.upsert.mockResolvedValue({});
    });

    test('parseCliArgs parses --dry-run, --carrier, --limit, and --batch-size', () => {
        const parsed = parseCliArgs(['--dry-run', '--carrier=dgr', '--limit=250', '--batch-size=50']);
        expect(parsed).toEqual({
            dryRun: true,
            carrier: 'DGR',
            limit: 250,
            batchSize: 50
        });
    });

    test('evaluateHistoryCheckpointStatus repairs false-positive delivered on negative phrases', () => {
        expect(evaluateHistoryCheckpointStatus({
            status: 'delivered',
            description: 'Consignee premises closed'
        })).toBe('exception');

        expect(evaluateHistoryCheckpointStatus({
            status: 'delivered',
            description: 'Contacted consignee for address clarification'
        })).toBe('exception');

        expect(evaluateHistoryCheckpointStatus({
            status: 'delivered',
            description: 'Assigned by dispatcher to route 4'
        })).toBe('in_transit');

        expect(evaluateHistoryCheckpointStatus({
            status: 'in_transit',
            description: 'Delivered - Signed for by: M. AL-SABAH'
        })).toBe('delivered');
    });

    test('reconcileTrackingHistory heals false-positive delivered, clears resolved holds, compacts history, and upserts relational events', async () => {
        const mockBatch = [
            {
                id: 'ship-1',
                trackingNumber: 'TRK-FALSE-DEL',
                carrierCode: 'DGR',
                status: 'delivered',
                documents: {},
                history: [
                    {
                        status: 'booked',
                        description: 'Shipment created',
                        timestamp: '2026-10-15T08:00:00.000Z',
                        location: 'Kuwait'
                    },
                    {
                        status: 'delivered',
                        description: 'Consignee premises closed - delivery attempt failed',
                        timestamp: '2026-10-16T10:00:00.000Z',
                        location: 'Riyadh'
                    }
                ]
            },
            {
                id: 'ship-2',
                trackingNumber: 'TRK-RESOLVED-HOLD',
                carrierCode: 'DGR',
                status: 'exception',
                documents: {},
                history: [
                    {
                        status: 'exception',
                        description: 'Shipment on hold at hub',
                        timestamp: '2026-10-15T09:00:00.000Z',
                        location: 'Bahrain'
                    },
                    {
                        status: 'out_for_delivery',
                        description: 'Out for delivery with courier',
                        timestamp: '2026-10-16T07:00:00.000Z',
                        location: 'Riyadh'
                    },
                    {
                        status: 'out_for_delivery',
                        description: 'Out for delivery with courier',
                        timestamp: '2026-10-16T07:00:45.000Z',
                        location: 'Riyadh'
                    }
                ]
            }
        ];

        prisma.shipment.findMany
            .mockResolvedValueOnce(mockBatch)
            .mockResolvedValueOnce([]);

        const summary = await reconcileTrackingHistory({
            dryRun: false,
            batchSize: 50,
            silent: true
        });

        expect(summary.totalScanned).toBe(2);
        expect(summary.falseDeliveredHealed).toBe(1);
        expect(summary.resolvedExceptionsHealed).toBe(1);
        expect(summary.historiesCompacted).toBe(2);
        expect(prisma.shipment.update).toHaveBeenCalledTimes(2);

        // First shipment should be demoted from 'delivered' to 'exception'
        expect(prisma.shipment.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
            where: { id: 'ship-1' },
            data: expect.objectContaining({
                status: 'exception'
            })
        }));

        // Second shipment should be healed from 'exception' to 'out_for_delivery' and have compacted history (2 items instead of 3)
        const secondUpdateCall = prisma.shipment.update.mock.calls[1][0];
        expect(secondUpdateCall.where).toEqual({ id: 'ship-2' });
        expect(secondUpdateCall.data.status).toBe('out_for_delivery');
        expect(secondUpdateCall.data.history).toHaveLength(2);
        expect(prisma.shipmentTrackingEvent.upsert).toHaveBeenCalled();
    });

    test('reconcileTrackingHistory respects --dry-run and performs zero DB writes', async () => {
        prisma.shipment.findMany
            .mockResolvedValueOnce([
                {
                    id: 'ship-dry',
                    trackingNumber: 'TRK-DRY',
                    carrierCode: 'DGR',
                    status: 'delivered',
                    documents: {},
                    history: [
                        {
                            status: 'delivered',
                            description: 'Consignee premises closed',
                            timestamp: '2026-10-16T10:00:00.000Z',
                            location: 'Riyadh'
                        }
                    ]
                }
            ])
            .mockResolvedValueOnce([]);

        const summary = await reconcileTrackingHistory({
            dryRun: true,
            silent: true
        });

        expect(summary.falseDeliveredHealed).toBe(1);
        expect(prisma.shipment.update).not.toHaveBeenCalled();
        expect(prisma.shipmentTrackingEvent.upsert).not.toHaveBeenCalled();
    });
});
