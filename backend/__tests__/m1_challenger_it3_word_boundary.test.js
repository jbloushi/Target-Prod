const {
    normalizeStatus,
    normalizeCarrierStatus,
    isNegativeOrExceptionPhrase,
    isTerminalStatus
} = require('../src/constants/statusConstants');

const {
    canonicalStatusFromDescription,
    buildDisplayHistory,
    syncCarrierTrackingHistory,
    evaluateRealtimeExceptionStatus
} = require('../src/controllers/shipment.helpers');

jest.mock('../src/services/CarrierFactory', () => ({
    getAdapter: jest.fn()
}));

const CarrierFactory = require('../src/services/CarrierFactory');

describe('Milestone 1 Iteration 3 Challenger: Word-Boundary & Status Normalization Empirical Stress Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('1. Word-boundary False Positives: "assigned", "consigned", "redesigned" vs "signed by"', () => {
        const falsePositivePhrases = [
            'Shipment assigned by dispatcher',
            'Consigned by shipper',
            'Assigned to driver',
            'Reassigned by dispatch supervisor',
            'Shipment consigned by manufacturer',
            'Package designed by Apple',
            'Unassigned by courier hub'
        ];

        it.each(falsePositivePhrases)(
            'ensures "%s" does NOT normalize to "delivered"',
            (phrase) => {
                const norm = normalizeStatus(phrase);
                expect(norm).not.toBe('delivered');
                expect(norm).toBe('in_transit');
            }
        );

        it.each(falsePositivePhrases)(
            'ensures "%s" in canonicalStatusFromDescription does NOT evaluate to "delivered"',
            (phrase) => {
                const canonical = canonicalStatusFromDescription(null, phrase);
                expect(canonical).not.toBe('delivered');
            }
        );

        it('syncCarrierTrackingHistory does NOT promote status to delivered when event is "Shipment assigned by dispatcher"', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'asgn',
                            status: 'assigned',
                            description: 'Shipment assigned by dispatcher',
                            timestamp: '2026-04-10T08:00:00.000Z',
                            location: 'Central Dispatch Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-ASSIGNED-DISP',
                carrierCode: 'DGR',
                carrierShipmentId: 'CARRIER-ASGN-1',
                status: 'in_transit',
                history: [],
                origin: { contactPerson: 'Sender', phone: '1234567890' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(result.status).not.toBe('delivered');
            expect(result.status).toBe('in_transit');
        });
    });

    describe('2. Word-boundary False Positives: "Carton" vs "rto"', () => {
        const cartonPhrases = [
            'Carton received at warehouse',
            'Carton damaged in transit',
            'Processed 1 carton at sorting hub',
            'Carton weight inspected',
            'Baritone case carton packaged'
        ];

        it.each(cartonPhrases)(
            'ensures "%s" does NOT normalize to "returned"',
            (phrase) => {
                const norm = normalizeStatus(phrase);
                expect(norm).not.toBe('returned');
                expect(norm).not.toBe('cancelled');
            }
        );

        it('ensures "Carton received at warehouse" does NOT evaluate to returned in canonicalStatusFromDescription', () => {
            const canonical = canonicalStatusFromDescription(null, 'Carton received at warehouse');
            expect(canonical).not.toBe('returned');
            expect(canonical).not.toBe('cancelled');
        });

        it('ensures genuine RTO phrases still normalize to "returned"', () => {
            expect(normalizeStatus('RTO')).toBe('returned');
            expect(normalizeStatus('RTO initiated')).toBe('returned');
            expect(normalizeStatus('Package marked as RTO')).toBe('returned');
            expect(normalizeStatus('Return to origin')).toBe('returned');
            expect(normalizeStatus('Return to shipper')).toBe('returned');
            expect(normalizeStatus('Returned to sender')).toBe('returned');
        });

        it('syncCarrierTrackingHistory does NOT mark shipment returned when event is "Carton received at warehouse"', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'wh',
                            status: 'received',
                            description: 'Carton received at warehouse',
                            timestamp: '2026-04-10T09:00:00.000Z',
                            location: 'Kuwait Central Hub'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-CARTON-WH',
                carrierCode: 'DGR',
                carrierShipmentId: 'CARRIER-CARTON-1',
                status: 'in_transit',
                history: [],
                origin: { contactPerson: 'Sender', phone: '1234567890' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(result.status).not.toBe('returned');
            expect(result.status).not.toBe('cancelled');
        });
    });

    describe('3. Precedence: "Departed from facility" vs facility arrival', () => {
        const departurePhrases = [
            'Departed from facility',
            'Departed facility',
            'Shipment departed from sort facility',
            'Departed from operations gateway',
            'Flight departed from facility hub'
        ];

        it.each(departurePhrases)(
            'ensures "%s" normalizes to "in_transit"',
            (phrase) => {
                const norm = normalizeStatus(phrase);
                expect(norm).toBe('in_transit');
            }
        );

        it('ensures "Departed from facility" maps to "departed_facility" in canonicalStatusFromDescription', () => {
            const canonical = canonicalStatusFromDescription(null, 'Departed from facility');
            expect(canonical).toBe('departed_facility');
        });

        it('ensures facility arrivals without departure keyword normalize to "received_at_hub"', () => {
            expect(normalizeStatus('Arrived at facility')).toBe('received_at_hub');
            expect(normalizeStatus('Arrived at sort facility')).toBe('received_at_hub');
            expect(normalizeStatus('Received at hub')).toBe('received_at_hub');
            expect(normalizeStatus('Arrived at operations')).toBe('received_at_hub');
        });
    });

    describe('4. Precedence: "Out for delivery - failed attempt" vs "out for delivery"', () => {
        const failedDeliveryAttempts = [
            'Out for delivery - failed attempt',
            'Out for delivery - customer not home',
            'Out for delivery - premises closed',
            'Out for delivery - contacted consignee',
            'Out for delivery - delivery attempt failed',
            'Out for delivery - bad address'
        ];

        it.each(failedDeliveryAttempts)(
            'ensures compound exception "%s" normalizes to "exception"',
            (phrase) => {
                const norm = normalizeStatus(phrase);
                expect(norm).toBe('exception');
            }
        );

        it.each(failedDeliveryAttempts)(
            'ensures compound exception "%s" maps to "hold" in canonicalStatusFromDescription',
            (phrase) => {
                const canonical = canonicalStatusFromDescription(null, phrase);
                expect(canonical).toBe('hold');
            }
        );

        it('ensures clean "Out for delivery" normalizes to "out_for_delivery"', () => {
            expect(normalizeStatus('Out for delivery')).toBe('out_for_delivery');
            expect(normalizeStatus('With courier for delivery')).toBe('out_for_delivery');
            expect(canonicalStatusFromDescription(null, 'Out for delivery')).toBe('out_for_delivery');
        });

        it('evaluateRealtimeExceptionStatus detects exception when latest scan is "Out for delivery - failed attempt"', () => {
            const shipment = {
                id: 'ship-ofdfail-1',
                trackingNumber: 'TRK-OFD-FAIL',
                status: 'out_for_delivery',
                history: [
                    { status: 'picked_up', description: 'Picked up', timestamp: '2026-04-10T08:00:00Z' },
                    { status: 'out_for_delivery', description: 'Out for delivery', timestamp: '2026-04-10T10:00:00Z' },
                    { status: 'out_for_delivery', description: 'Out for delivery - failed attempt', timestamp: '2026-04-10T14:00:00Z' }
                ]
            };

            const evaluated = evaluateRealtimeExceptionStatus(shipment);
            expect(evaluated).toBe('exception');
        });
    });

    describe('5. Genuine "Signed by customer" and POD verification', () => {
        const genuineSignedScans = [
            'Signed by customer',
            'Signed by John Doe',
            'Signed by: Mohammed Al-Sabah',
            'Signed for by Sarah',
            'Signature obtained',
            'Signature captured',
            'POD received',
            'POD signed',
            'Delivered to recipient',
            'Shipment delivered'
        ];

        it.each(genuineSignedScans)(
            'ensures genuine proof scan "%s" normalizes to "delivered"',
            (scan) => {
                const norm = normalizeStatus(scan);
                expect(norm).toBe('delivered');
            }
        );

        it.each(genuineSignedScans)(
            'ensures genuine proof scan "%s" maps to "delivered" in canonicalStatusFromDescription',
            (scan) => {
                const canonical = canonicalStatusFromDescription(null, scan);
                expect(canonical).toBe('delivered');
            }
        );

        it('ensures negative signature phrases normalize to "exception", not "delivered"', () => {
            expect(normalizeStatus('Not signed by customer')).toBe('exception');
            expect(normalizeStatus('Unable to obtain signature')).toBe('exception');
            expect(normalizeStatus('No signature obtained - consignee unavailable')).toBe('exception');
        });

        it('syncCarrierTrackingHistory promotes shipment to "delivered" on genuine "Signed by customer"', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'dlv',
                            status: 'delivered',
                            description: 'Signed by customer',
                            timestamp: '2026-04-10T15:30:00.000Z',
                            location: 'Salmiya, Kuwait'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-SIGNED-GENUINE',
                carrierCode: 'DGR',
                carrierShipmentId: 'CARRIER-SIGN-1',
                status: 'out_for_delivery',
                history: [],
                origin: { contactPerson: 'Sender', phone: '1234567890' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(result.status).toBe('delivered');
        });
    });

    describe('6. Terminal Invariant: Delivered state is locked against regressive scans', () => {
        it('delivered shipment stays delivered even if out-of-order "Out for delivery - failed attempt" arrives', async () => {
            CarrierFactory.getAdapter.mockReturnValue({
                getTracking: jest.fn().mockResolvedValue({
                    events: [
                        {
                            statusCode: 'exc',
                            status: 'exception',
                            description: 'Out for delivery - failed attempt',
                            timestamp: '2026-04-10T16:00:00.000Z',
                            location: 'Depot'
                        }
                    ]
                })
            });

            const shipment = {
                trackingNumber: 'TRK-TERM-LOCK-1',
                carrierCode: 'DGR',
                carrierShipmentId: 'CARRIER-TERM-1',
                status: 'delivered',
                history: [
                    { status: 'delivered', description: 'Signed by customer', timestamp: '2026-04-10T15:30:00.000Z' }
                ],
                origin: { contactPerson: 'Sender', phone: '1234567890' }
            };

            const result = await syncCarrierTrackingHistory(shipment);
            expect(result).not.toBeNull();
            expect(result.status).toBe('delivered');
        });
    });
});
