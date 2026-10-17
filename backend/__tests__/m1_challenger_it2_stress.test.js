const {
    isTerminalStatus,
    isStatusAhead,
    normalizeStatus,
    normalizeCarrierStatus
} = require('../src/constants/statusConstants');

const {
    syncCarrierTrackingHistory,
    evaluateRealtimeExceptionStatus,
    getResolvedExceptionStatus,
    autoHealResolvedShipment,
    autoSyncAllExceptions
} = require('../src/controllers/shipment.helpers');

jest.mock('../src/services/CarrierFactory', () => ({
    getAdapter: jest.fn()
}));

const CarrierFactory = require('../src/services/CarrierFactory');

describe('Milestone 1 Iteration 2 Challenger: Terminal State Invariants Empirical Stress Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Terminal State Invariants in syncCarrierTrackingHistory', () => {
        const terminalCasingVariants = [
            { raw: 'DELIVERED', canonical: 'delivered' },
            { raw: 'delivered', canonical: 'delivered' },
            { raw: 'Delivered', canonical: 'delivered' },
            { raw: ' DELIVERED ', canonical: 'delivered' },
            { raw: 'CANCELLED', canonical: 'cancelled' },
            { raw: 'cancelled', canonical: 'cancelled' },
            { raw: 'Cancelled', canonical: 'cancelled' },
            { raw: ' CANCELLED ', canonical: 'cancelled' },
            { raw: 'RETURNED', canonical: 'returned' },
            { raw: 'returned', canonical: 'returned' },
            { raw: 'Returned', canonical: 'returned' },
            { raw: ' RETURNED ', canonical: 'returned' },
            { raw: 'Returned to Shipper', canonical: 'returned' },
            { raw: 'Return to origin', canonical: 'returned' }
        ];

        it.each(terminalCasingVariants)(
            'prevents regression of %s when an out-of-order in_transit scan arrives',
            async ({ raw, canonical }) => {
                CarrierFactory.getAdapter.mockReturnValue({
                    getTracking: jest.fn().mockResolvedValue({
                        events: [
                            {
                                statusCode: 'tr',
                                status: 'in_transit',
                                description: 'Shipment departed local facility',
                                timestamp: '2026-04-01T10:00:00.000Z',
                                location: 'Riyadh Hub'
                            }
                        ]
                    })
                });

                const shipment = {
                    trackingNumber: `TRK-INV-TR-${raw.replace(/\s+/g, '_')}`,
                    carrierCode: 'DGR',
                    carrierShipmentId: 'CARRIER-123',
                    status: raw,
                    history: [],
                    origin: { contactPerson: 'Sender', phone: '1234567890' }
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result).not.toBeNull();
                expect(normalizeStatus(result.status)).toBe(canonical);
            }
        );

        it.each(terminalCasingVariants)(
            'prevents regression of %s when an out-of-order exception/hold scan arrives',
            async ({ raw, canonical }) => {
                CarrierFactory.getAdapter.mockReturnValue({
                    getTracking: jest.fn().mockResolvedValue({
                        events: [
                            {
                                statusCode: 'ba',
                                status: 'exception',
                                description: 'Consignee premises closed',
                                timestamp: '2026-04-02T10:00:00.000Z',
                                location: 'Destination City'
                            }
                        ]
                    })
                });

                const shipment = {
                    trackingNumber: `TRK-INV-EXC-${raw.replace(/\s+/g, '_')}`,
                    carrierCode: 'DGR',
                    carrierShipmentId: 'CARRIER-456',
                    status: raw,
                    history: [],
                    origin: { contactPerson: 'Sender', phone: '1234567890' }
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result).not.toBeNull();
                expect(normalizeStatus(result.status)).toBe(canonical);
            }
        );

        it('prevents cross-terminal mutation: CANCELLED shipment cannot be mutated by DELIVERED scan', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'ok',
                            status: 'delivered',
                            description: 'Delivered - Signed by Consignee',
                            timestamp: '2026-04-05T10:00:00.000Z',
                            location: 'Front Door'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-CAN-CROSS',
                carrierCode: 'DGR',
                carrierShipmentId: 'CARRIER-CAN',
                status: 'CANCELLED',
                history: [],
                origin: { contactPerson: 'Sender', phone: '1234567890' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(normalizeStatus(result.status)).toBe('cancelled');
        });

        it('prevents cross-terminal mutation: RETURNED shipment cannot be mutated by DELIVERED scan', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'ok',
                            status: 'delivered',
                            description: 'Delivered - Signed by Consignee',
                            timestamp: '2026-04-05T10:00:00.000Z',
                            location: 'Front Door'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-RET-CROSS',
                carrierCode: 'DGR',
                carrierShipmentId: 'CARRIER-RET',
                status: 'RETURNED',
                history: [],
                origin: { contactPerson: 'Sender', phone: '1234567890' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(normalizeStatus(result.status)).toBe('returned');
        });
    });

    describe('Terminal State Invariants in evaluateRealtimeExceptionStatus', () => {
        const terminalShipments = [
            { desc: 'lowercase returned with prior exception in history', status: 'returned' },
            { desc: 'uppercase RETURNED with prior exception in history', status: 'RETURNED' },
            { desc: 'lowercase delivered with prior exception in history', status: 'delivered' },
            { desc: 'uppercase DELIVERED with prior exception in history', status: 'DELIVERED' },
            { desc: 'lowercase cancelled with prior exception in history', status: 'cancelled' },
            { desc: 'uppercase CANCELLED with prior exception in history', status: 'CANCELLED' }
        ];

        it.each(terminalShipments)(
            'returns null for %s without mutating status',
            ({ status }) => {
                const shipment = {
                    id: `ship-${status}`,
                    trackingNumber: `TRK-EVAL-${status}`,
                    status,
                    history: [
                        { status: 'picked_up', timestamp: '2026-04-01T10:00:00Z' },
                        { status: 'exception', description: 'Address invalid - contacted consignee', timestamp: '2026-04-02T10:00:00Z' },
                        { status, description: 'Final milestone', timestamp: '2026-04-03T10:00:00Z' }
                    ]
                };

                const nextStatus = evaluateRealtimeExceptionStatus(shipment);
                expect(nextStatus).toBeNull();
            }
        );

        it('returns null for returned shipment even if out-of-order exception scan has the latest timestamp', () => {
            const shipment = {
                id: 'ship-ret-stale',
                trackingNumber: 'TRK-RET-STALE',
                status: 'returned',
                history: [
                    { status: 'returned', description: 'Package returned to warehouse', timestamp: '2026-04-03T10:00:00Z' },
                    { status: 'exception', description: 'Delayed scan: Consignee refused delivery', timestamp: '2026-04-04T10:00:00Z' }
                ]
            };

            const nextStatus = evaluateRealtimeExceptionStatus(shipment);
            expect(nextStatus).toBeNull();
        });

        it('returns null for RETURNED shipment with multiple exception keywords', () => {
            const shipment = {
                id: 'ship-ret-multi',
                trackingNumber: 'TRK-RET-MULTI',
                status: 'RETURNED',
                history: [
                    { status: 'exception', description: 'premises locked / customer not home', timestamp: '2026-04-01T10:00:00Z' },
                    { status: 'exception', description: 'customs hold / action required', timestamp: '2026-04-02T10:00:00Z' },
                    { status: 'returned', description: 'Returned to sender', timestamp: '2026-04-03T10:00:00Z' }
                ]
            };

            const nextStatus = evaluateRealtimeExceptionStatus(shipment);
            expect(nextStatus).toBeNull();
        });
    });

    describe('Terminal State Invariants in autoSyncAllExceptions', () => {
        it('never calls prisma.shipment.update on returned, RETURNED, delivered, DELIVERED, cancelled, CANCELLED shipments', async () => {
            const mockShipments = [
                {
                    id: 's-1',
                    trackingNumber: 'TRK-1',
                    status: 'returned',
                    history: [{ status: 'exception', description: 'Refused', timestamp: '2026-04-01T12:00:00Z' }]
                },
                {
                    id: 's-2',
                    trackingNumber: 'TRK-2',
                    status: 'RETURNED',
                    history: [{ status: 'exception', description: 'Failed attempt', timestamp: '2026-04-01T12:00:00Z' }]
                },
                {
                    id: 's-3',
                    trackingNumber: 'TRK-3',
                    status: 'delivered',
                    history: [{ status: 'exception', description: 'Damaged packaging', timestamp: '2026-04-01T12:00:00Z' }]
                },
                {
                    id: 's-4',
                    trackingNumber: 'TRK-4',
                    status: 'DELIVERED',
                    history: [{ status: 'exception', description: 'Delay in transit', timestamp: '2026-04-01T12:00:00Z' }]
                },
                {
                    id: 's-5',
                    trackingNumber: 'TRK-5',
                    status: 'cancelled',
                    history: [{ status: 'exception', description: 'Order cancelled', timestamp: '2026-04-01T12:00:00Z' }]
                },
                {
                    id: 's-6',
                    trackingNumber: 'TRK-6',
                    status: 'CANCELLED',
                    history: [{ status: 'exception', description: 'Cancelled by merchant', timestamp: '2026-04-01T12:00:00Z' }]
                },
                // Active shipment that legitimately needs update:
                {
                    id: 's-7',
                    trackingNumber: 'TRK-7',
                    status: 'exception',
                    history: [
                        { status: 'exception', description: 'Premises closed', timestamp: '2026-04-01T10:00:00Z' },
                        { status: 'in_transit', description: 'Out for delivery to consignee', timestamp: '2026-04-02T10:00:00Z' }
                    ]
                }
            ];

            const mockPrisma = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue(mockShipments),
                    update: jest.fn().mockResolvedValue({})
                }
            };

            const updatedCount = await autoSyncAllExceptions(mockPrisma);

            // Exactly 1 shipment (s-7) should have been updated:
            expect(updatedCount).toBe(1);
            expect(mockPrisma.shipment.update).toHaveBeenCalledTimes(1);
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith({
                where: { id: 's-7' },
                data: { status: 'in_transit' }
            });

            // Ensure none of the terminal shipments were updated:
            const updatedIds = mockPrisma.shipment.update.mock.calls.map(call => call[0].where.id);
            expect(updatedIds).not.toContain('s-1');
            expect(updatedIds).not.toContain('s-2');
            expect(updatedIds).not.toContain('s-3');
            expect(updatedIds).not.toContain('s-4');
            expect(updatedIds).not.toContain('s-5');
            expect(updatedIds).not.toContain('s-6');
        });
    });
});
