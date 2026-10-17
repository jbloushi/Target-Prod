const {
    isTerminalStatus,
    isStatusAhead,
    normalizeStatus,
    normalizeCarrierStatus,
    SHIPMENT_STATUSES
} = require('../src/constants/statusConstants');

const {
    syncCarrierTrackingHistory,
    evaluateRealtimeExceptionStatus,
    getResolvedExceptionStatus,
    autoHealResolvedShipment
} = require('../src/controllers/shipment.helpers');

jest.mock('../src/services/CarrierFactory', () => ({
    getAdapter: jest.fn()
}));

const CarrierFactory = require('../src/services/CarrierFactory');

describe('Challenger M1_2: Terminal State Invariants & Exception Auto-Healing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // 1. isTerminalStatus unit assertions
    // =========================================================================
    describe('isTerminalStatus contract and edge cases', () => {
        it('returns true for canonical terminal statuses: delivered, cancelled, returned', () => {
            expect(isTerminalStatus('delivered')).toBe(true);
            expect(isTerminalStatus('cancelled')).toBe(true);
            expect(isTerminalStatus('returned')).toBe(true);
        });

        it('returns true for case-insensitive and whitespace-padded terminal statuses', () => {
            expect(isTerminalStatus('DELIVERED')).toBe(true);
            expect(isTerminalStatus('Delivered')).toBe(true);
            expect(isTerminalStatus(' delivered ')).toBe(true);
            expect(isTerminalStatus('CANCELLED')).toBe(true);
            expect(isTerminalStatus('Cancelled')).toBe(true);
            expect(isTerminalStatus('RETURNED')).toBe(true);
            expect(isTerminalStatus('Returned')).toBe(true);
        });

        it('returns true for phrase mappings of terminal statuses', () => {
            expect(isTerminalStatus('Shipment delivered')).toBe(true);
            expect(isTerminalStatus('Returned to Shipper')).toBe(true);
            expect(isTerminalStatus('Return to origin')).toBe(true);
            expect(isTerminalStatus('Customer cancelled')).toBe(true);
        });

        it('returns false for non-terminal statuses', () => {
            const nonTerminal = [
                'draft', 'pending', 'pending_approval', 'booked', 'ready_for_pickup',
                'picked_up', 'received_at_hub', 'verified', 'in_transit',
                'out_for_delivery', 'rto_in_transit', 'exception'
            ];
            for (const status of nonTerminal) {
                expect(isTerminalStatus(status)).toBe(false);
            }
        });

        it('returns false for null, undefined, or empty strings', () => {
            expect(isTerminalStatus(null)).toBe(false);
            expect(isTerminalStatus(undefined)).toBe(false);
            expect(isTerminalStatus('')).toBe(false);
        });
    });

    // =========================================================================
    // 2. isStatusAhead invariants
    // =========================================================================
    describe('isStatusAhead invariants', () => {
        it('terminal statuses cannot be superseded by active movement or exceptions', () => {
            const activeStatuses = ['booked', 'picked_up', 'received_at_hub', 'in_transit', 'out_for_delivery', 'exception'];
            for (const terminal of ['delivered', 'cancelled', 'returned']) {
                for (const active of activeStatuses) {
                    expect(isStatusAhead(terminal, active)).toBe(false);
                }
            }
        });

        it('exception status yields to genuine active movement (auto-healing)', () => {
            expect(isStatusAhead('exception', 'in_transit')).toBe(true);
            expect(isStatusAhead('exception', 'out_for_delivery')).toBe(true);
            expect(isStatusAhead('exception', 'delivered')).toBe(true);
            expect(isStatusAhead('exception', 'picked_up')).toBe(true);
            expect(isStatusAhead('exception', 'received_at_hub')).toBe(true);
        });

        it('exception status does NOT advance ahead of active movement', () => {
            expect(isStatusAhead('in_transit', 'exception')).toBe(false);
            expect(isStatusAhead('out_for_delivery', 'exception')).toBe(false);
            expect(isStatusAhead('picked_up', 'exception')).toBe(false);
        });
    });

    // =========================================================================
    // 3. syncCarrierTrackingHistory: Terminal State Invariants
    // =========================================================================
    describe('syncCarrierTrackingHistory: Terminal State Invariants', () => {
        it('does NOT regress "delivered" status when older out-of-order in_transit scan arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'transit',
                            description: 'Departed facility',
                            timestamp: '2026-04-10T08:00:00.000Z',
                            location: 'Kuwait Sorting Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-DEL-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-DEL-1',
                status: 'delivered',
                history: [
                    {
                        status: 'delivered',
                        description: 'Delivered to recipient',
                        timestamp: '2026-04-12T14:00:00.000Z',
                        source: 'carrier'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('delivered');
            expect(result.status).not.toBe('in_transit');
        });

        it('does NOT regress "delivered" status when older out-of-order exception scan arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'ba',
                            description: 'Consignee premises closed',
                            timestamp: '2026-04-11T10:00:00.000Z',
                            location: 'Customer Address'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-DEL-2',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-DEL-2',
                status: 'delivered',
                history: [
                    {
                        status: 'delivered',
                        description: 'Delivered to recipient',
                        timestamp: '2026-04-12T14:00:00.000Z',
                        source: 'carrier'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('delivered');
            expect(result.status).not.toBe('exception');
        });

        it('does NOT regress "cancelled" status when out-of-order in_transit or out_for_delivery scan arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'wc',
                            description: 'With delivery courier',
                            timestamp: '2026-04-14T08:00:00.000Z',
                            location: 'Local Delivery Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-CAN-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-CAN-1',
                status: 'cancelled',
                history: [
                    {
                        status: 'cancelled',
                        description: 'Shipment cancelled by merchant',
                        timestamp: '2026-04-13T10:00:00.000Z',
                        source: 'staff'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('cancelled');
            expect(result.status).not.toBe('out_for_delivery');
        });

        it('does NOT regress "returned" status when out-of-order in_transit or exception scan arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'transit',
                            description: 'Departed facility',
                            timestamp: '2026-04-14T08:00:00.000Z',
                            location: 'Sorting Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-RET-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-RET-1',
                status: 'returned',
                history: [
                    {
                        status: 'returned',
                        description: 'Returned to shipper',
                        timestamp: '2026-04-13T16:00:00.000Z',
                        source: 'carrier'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('returned');
            expect(result.status).not.toBe('in_transit');
        });
    });

    // =========================================================================
    // 4. syncCarrierTrackingHistory: Exception Auto-Healing
    // =========================================================================
    describe('syncCarrierTrackingHistory: Exception Auto-Healing', () => {
        it('accurately auto-heals "exception" status to "in_transit" when genuine movement arrives ("Departed facility")', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    status: 'transit',
                    events: [
                        {
                            statusCode: 'ba',
                            description: 'Consignee premises closed',
                            timestamp: '2026-04-14T08:00:00.000Z',
                            location: 'Delivery Area'
                        },
                        {
                            statusCode: 'df',
                            description: 'Departed facility',
                            timestamp: '2026-04-15T09:00:00.000Z',
                            location: 'Regional Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-EXC-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-EXC-1',
                status: 'exception',
                history: [
                    {
                        status: 'exception',
                        description: 'Consignee premises closed',
                        timestamp: '2026-04-14T08:00:00.000Z',
                        source: 'carrier'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('in_transit');
            expect(result.status).not.toBe('exception');
        });

        it('accurately auto-heals "exception" status to "out_for_delivery" when "Out for delivery" scan arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    status: 'transit',
                    events: [
                        {
                            statusCode: 'wc',
                            description: 'With delivery courier',
                            timestamp: '2026-04-15T07:30:00.000Z',
                            location: 'Destination Station'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-EXC-2',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-EXC-2',
                status: 'exception',
                history: [
                    {
                        status: 'exception',
                        description: 'Delivery attempt failed',
                        timestamp: '2026-04-14T15:00:00.000Z',
                        source: 'carrier'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('out_for_delivery');
            expect(result.status).not.toBe('exception');
        });

        it('accurately auto-heals "exception" status to "delivered" when delivery scan arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'ok',
                            description: 'Delivered to recipient',
                            timestamp: '2026-04-15T12:00:00.000Z',
                            location: 'Consignee Address'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-EXC-3',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-EXC-3',
                status: 'exception',
                history: [
                    {
                        status: 'exception',
                        description: 'On hold - address clarification',
                        timestamp: '2026-04-14T10:00:00.000Z',
                        source: 'carrier'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('delivered');
        });

        it('overrides top-level carrier exception status when the latest chronological scan is active movement', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    status: 'failure', // top-level carrier status says failure
                    events: [
                        {
                            statusCode: 'ba',
                            description: 'Bad address',
                            timestamp: '2026-04-14T08:00:00.000Z',
                            location: 'Hub A'
                        },
                        {
                            statusCode: 'df',
                            description: 'Departed facility',
                            timestamp: '2026-04-15T09:00:00.000Z',
                            location: 'Hub B'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-EXC-4',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-EXC-4',
                status: 'exception',
                history: [],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).not.toBeNull();
            expect(result.status).toBe('in_transit');
            expect(result.status).not.toBe('exception');
        });
    });

    // =========================================================================
    // 5. syncCarrierTrackingHistory: Empty events and TRACKING_PENDING handling
    // =========================================================================
    describe('syncCarrierTrackingHistory: Empty events & TRACKING_PENDING', () => {
        it('returns null without throwing or mutating when carrier returns empty events array', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: []
                })
            });

            const shipment = {
                trackingNumber: 'TRK-EMP-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-EMP-1',
                status: 'booked',
                history: [{ status: 'booked', timestamp: '2026-04-14T00:00:00.000Z' }]
            };

            const originalSnapshot = JSON.stringify(shipment);

            let result;
            expect(() => {
                // Must be async
            }).not.toThrow();

            result = await syncCarrierTrackingHistory(shipment);

            expect(result).toBeNull();
            // Verify shipment object was NOT mutated
            expect(JSON.stringify(shipment)).toBe(originalSnapshot);
        });

        it('returns null without throwing or mutating when carrier throws TRACKING_PENDING', async () => {
            const pendingError = new Error('Carrier tracking pending at provider: Package not found (45268816)');
            pendingError.code = 'TRACKING_PENDING';
            pendingError.provider = 'OTE';

            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockRejectedValue(pendingError)
            });

            const shipment = {
                trackingNumber: 'TRK-PND-1',
                carrierCode: 'OTE',
                carrierShipmentId: '45268816',
                status: 'booked',
                history: [{ status: 'booked', timestamp: '2026-04-14T00:00:00.000Z' }]
            };

            const originalSnapshot = JSON.stringify(shipment);

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).toBeNull();
            // Verify shipment object was NOT mutated
            expect(JSON.stringify(shipment)).toBe(originalSnapshot);
        });

        it('returns null without throwing or mutating on generic adapter error', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockRejectedValue(new Error('Connection timed out'))
            });

            const shipment = {
                trackingNumber: 'TRK-ERR-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-ERR-1',
                status: 'in_transit',
                history: []
            };

            const originalSnapshot = JSON.stringify(shipment);

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result).toBeNull();
            expect(JSON.stringify(shipment)).toBe(originalSnapshot);
        });
    });

    // =========================================================================
    // 6. Adversarial Edge Cases: Case variations & Malformed Statuses
    // =========================================================================
    describe('Adversarial Edge Cases: Case Sensitivity & Malformed Statuses', () => {
        it('evaluates uppercase "DELIVERED" and prevents regression', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'transit',
                            description: 'Departed facility',
                            timestamp: '2026-04-10T08:00:00.000Z',
                            location: 'Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-DEL-UPPER',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-DEL-UPPER',
                status: 'DELIVERED', // Uppercase in DB
                history: [
                    {
                        status: 'delivered',
                        timestamp: '2026-04-12T14:00:00.000Z'
                    }
                ],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            // Should not regress to in_transit
            expect(result.status.toLowerCase()).toBe('delivered');
        });

        it('evaluates uppercase "DELIVERED" without delivered in history and prevents regression to exception', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'ba',
                            description: 'Consignee premises closed',
                            timestamp: '2026-04-10T08:00:00.000Z',
                            location: 'Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-DEL-UPPER-EXC',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-DEL-UPPER-EXC',
                status: 'DELIVERED',
                history: [],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(result.status.toLowerCase()).toBe('delivered');
        });

        it('evaluates uppercase "RETURNED" and prevents regression to exception', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'ba',
                            description: 'Consignee premises closed',
                            timestamp: '2026-04-10T08:00:00.000Z',
                            location: 'Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-RET-UPPER-EXC',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-RET-UPPER-EXC',
                status: 'RETURNED',
                history: [],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(result.status.toLowerCase()).toBe('returned');
        });

        it('evaluates uppercase "CANCELLED" and prevents regression', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'wc',
                            description: 'With delivery courier',
                            timestamp: '2026-04-14T08:00:00.000Z'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-CAN-UPPER',
                carrierCode: 'DGR',
                carrierShipmentId: 'DHL-CAN-UPPER',
                status: 'CANCELLED',
                history: [],
                origin: { contactPerson: 'Sender', phone: '123' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            // In strict case comparison, line 614 terminalStatuses.includes('CANCELLED') would fail
            // If it regresses, this assertion will reveal the bug
            expect(result.status.toLowerCase()).toBe('cancelled');
        });

        it('evaluates evaluateRealtimeExceptionStatus against "returned" shipment and ensures no mutation', () => {
            const returnedShipment = {
                id: 'ship-ret',
                trackingNumber: 'TRK-RET-2',
                status: 'returned',
                history: [
                    { status: 'picked_up', timestamp: '2026-04-01T10:00:00Z' },
                    { status: 'exception', description: 'Address invalid', timestamp: '2026-04-02T10:00:00Z' },
                    { status: 'returned', description: 'Returned to shipper', timestamp: '2026-04-03T10:00:00Z' }
                ]
            };

            const status = evaluateRealtimeExceptionStatus(returnedShipment);
            // Must return null (no change needed), must NOT return 'exception'
            expect(status).toBeNull();
        });

        it('evaluates evaluateRealtimeExceptionStatus when latest scan is out-of-order exception on "returned" shipment', () => {
            const returnedShipment = {
                id: 'ship-ret-3',
                trackingNumber: 'TRK-RET-3',
                status: 'returned',
                history: [
                    { status: 'returned', description: 'Returned to shipper', timestamp: '2026-04-02T10:00:00Z' },
                    // Stale out-of-order exception scan with later timestamp
                    { status: 'exception', description: 'Address invalid', timestamp: '2026-04-03T10:00:00Z' }
                ]
            };

            const status = evaluateRealtimeExceptionStatus(returnedShipment);
            // An already returned shipment must not regress to exception
            expect(status).toBeNull();
        });

        it('autoSyncAllExceptions must NOT regress returned shipments to exception', async () => {
            const { autoSyncAllExceptions } = require('../src/controllers/shipment.helpers');
            const mockPrisma = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: 'ship-ret-db',
                            trackingNumber: 'TRK-RET-DB',
                            status: 'returned',
                            history: [
                                { status: 'returned', description: 'Returned to shipper', timestamp: '2026-04-02T10:00:00Z' },
                                { status: 'exception', description: 'Address invalid', timestamp: '2026-04-03T10:00:00Z' }
                            ]
                        }
                    ]),
                    update: jest.fn().mockResolvedValue({})
                }
            };

            const updatedCount = await autoSyncAllExceptions(mockPrisma);
            expect(mockPrisma.shipment.update).not.toHaveBeenCalled();
            expect(updatedCount).toBe(0);
        });
    });
});

