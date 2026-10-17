/**
 * Shipment Tracking Display & Timeline Presentation Test Suite
 *
 * Verifies:
 * 1. buildDisplayHistory timeline transformation and ordering
 * 2. Duplicate scan collapsing with collapsedCount tracking
 * 3. Active vs. resolved exception evaluation (evaluateRealtimeExceptionStatus & getResolvedExceptionStatus)
 * 4. Carrier local time vs. UTC system timestamp preservation
 * 5. Defensive resilience on null/undefined/malformed history payloads
 * 6. Public vs. internal display sanitization (stripping Phenix/sensitive audit notes)
 */

const {
    buildDisplayHistory,
    normalizeLocationLabel,
    canonicalStatusFromDescription,
    evaluateRealtimeExceptionStatus,
    getResolvedExceptionStatus,
    compactHistory
} = require('../src/controllers/shipment.helpers');

describe('Shipment Tracking Display & Timeline Presentation', () => {
    describe('1. Duplicate Scan Collapsing & collapsedCount Tracking', () => {
        it('collapses repeated scans at the same location on the same day with collapsedCount', () => {
            const rawScans = [
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up by courier',
                    location: 'Kuwait City, Kuwait',
                    timestamp: '2026-05-01T10:00:00.000Z',
                    localTimestamp: '2026-05-01T13:00:00+03:00',
                    timezoneOffset: '+03:00'
                },
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up by courier',
                    location: 'KUWAIT-KW',
                    timestamp: '2026-05-01T10:05:00.000Z',
                    localTimestamp: '2026-05-01T13:05:00+03:00',
                    timezoneOffset: '+03:00'
                },
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up by courier',
                    location: 'Kuwait-KW',
                    timestamp: '2026-05-01T10:10:00.000Z',
                    localTimestamp: '2026-05-01T13:10:00+03:00',
                    timezoneOffset: '+03:00'
                }
            ];

            const display = buildDisplayHistory(rawScans);

            expect(display).toHaveLength(1);
            expect(display[0].canonicalStatus).toBe('pickup');
            expect(display[0].normalizedLocation).toBe('KUWAIT-KW');
            expect(display[0].collapsedCount).toBe(3);
            // Retains earliest timestamp
            expect(display[0].timestamp).toBe('2026-05-01T10:00:00.000Z');
        });

        it('assigns collapsedCount = 1 for distinct, non-duplicate checkpoints', () => {
            const events = [
                {
                    status: 'pickup',
                    description: 'Picked up from shipper',
                    location: 'Kuwait-KW',
                    timestamp: '2026-05-01T08:00:00.000Z'
                },
                {
                    status: 'arrived_facility',
                    description: 'Arrived at Sort Facility',
                    location: 'DUBAI-AE',
                    timestamp: '2026-05-02T12:00:00.000Z'
                },
                {
                    status: 'out_for_delivery',
                    description: 'With driver for delivery',
                    location: 'DUBAI-AE',
                    timestamp: '2026-05-03T09:00:00.000Z'
                }
            ];

            const display = buildDisplayHistory(events);

            expect(display).toHaveLength(3);
            expect(display.every(e => e.collapsedCount === 1)).toBe(true);
            expect(display.map(e => e.canonicalStatus)).toEqual(['pickup', 'arrived_facility', 'out_for_delivery']);
        });

        it('collapses customs clearance status updates to once per day per facility', () => {
            const customsScans = [
                {
                    status: 'customs_update',
                    description: 'Customs clearance status updated',
                    location: 'Cincinnati Hub - Ohio - USA',
                    timestamp: '2026-05-01T13:00:00.000Z'
                },
                {
                    status: 'customs_update',
                    description: 'Customs clearance status updated',
                    location: 'CINCINNATI-US',
                    timestamp: '2026-05-01T14:30:00.000Z'
                },
                {
                    status: 'customs_update',
                    description: 'Customs clearance status updated',
                    location: 'Cincinnati Hub-US',
                    timestamp: '2026-05-01T16:00:00.000Z'
                }
            ];

            const display = buildDisplayHistory(customsScans);

            expect(display).toHaveLength(1);
            expect(display[0].canonicalStatus).toBe('customs_update');
            expect(display[0].normalizedLocation).toBe('CINCINNATI-US');
            expect(display[0].collapsedCount).toBe(3);
        });
    });

    describe('2. Active vs. Resolved Exception Status Logic', () => {
        it('identifies an active exception when the latest chronological scan is an exception/hold', () => {
            const shipment = {
                status: 'in_transit',
                history: [
                    {
                        status: 'picked_up',
                        description: 'Collected from shipper',
                        timestamp: '2026-05-01T10:00:00.000Z'
                    },
                    {
                        status: 'in_transit',
                        description: 'Departed Kuwait Facility',
                        timestamp: '2026-05-01T14:00:00.000Z'
                    },
                    {
                        status: 'exception',
                        description: 'Shipment is on hold: Address incorrect or consignee unreachable',
                        timestamp: '2026-05-02T09:00:00.000Z'
                    }
                ]
            };

            const targetStatus = evaluateRealtimeExceptionStatus(shipment);
            expect(targetStatus).toBe('exception');

            // Not resolved because the latest scan IS the exception
            const resolved = getResolvedExceptionStatus({ ...shipment, status: 'exception' });
            expect(resolved).toBeNull();
        });

        it('auto-heals a prior exception when subsequent active movement occurs (resolved exception)', () => {
            const shipment = {
                status: 'exception',
                history: [
                    {
                        status: 'picked_up',
                        description: 'Collected from shipper',
                        timestamp: '2026-05-01T10:00:00.000Z'
                    },
                    {
                        status: 'exception',
                        description: 'Customs hold at Dubai gateway',
                        timestamp: '2026-05-02T08:00:00.000Z'
                    },
                    {
                        status: 'in_transit',
                        description: 'Processed and cleared at DUBAI-AE',
                        timestamp: '2026-05-02T16:00:00.000Z'
                    },
                    {
                        status: 'out_for_delivery',
                        description: 'With delivery champion',
                        timestamp: '2026-05-03T07:30:00.000Z'
                    }
                ]
            };

            // Realtime evaluation should detect that status should heal to out_for_delivery
            const healedStatus = evaluateRealtimeExceptionStatus(shipment);
            expect(healedStatus).toBe('out_for_delivery');

            // getResolvedExceptionStatus confirms the prior exception is resolved
            const resolvedStatus = getResolvedExceptionStatus(shipment);
            expect(resolvedStatus).toBe('out_for_delivery');
        });

        it('conclusively resolves all prior exceptions when a delivered milestone exists', () => {
            const shipment = {
                status: 'exception',
                history: [
                    {
                        status: 'picked_up',
                        timestamp: '2026-05-01T10:00:00.000Z'
                    },
                    {
                        status: 'exception',
                        description: 'Consignee premises closed at 14:00',
                        timestamp: '2026-05-02T14:00:00.000Z'
                    },
                    {
                        status: 'delivered',
                        description: 'Proof of Delivery signed by recipient',
                        timestamp: '2026-05-03T11:00:00.000Z'
                    }
                ]
            };

            const healed = evaluateRealtimeExceptionStatus(shipment);
            expect(healed).toBe('delivered');

            const resolved = getResolvedExceptionStatus(shipment);
            expect(resolved).toBe('delivered');
        });

        it('returns null when shipment is already delivered and no status transition is required', () => {
            const shipment = {
                status: 'delivered',
                history: [
                    { status: 'picked_up', timestamp: '2026-05-01T10:00:00.000Z' },
                    { status: 'delivered', timestamp: '2026-05-02T15:00:00.000Z' }
                ]
            };

            expect(evaluateRealtimeExceptionStatus(shipment)).toBeNull();
            expect(getResolvedExceptionStatus(shipment)).toBeNull();
        });
    });

    describe('3. Carrier Local Time vs. UTC System Time Preservation', () => {
        it('preserves carrier localTimestamp and timezoneOffset alongside normalized UTC timestamp', () => {
            const events = [
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up',
                    location: 'Kuwait City, Kuwait',
                    timestamp: '2026-05-01T07:00:00.000Z',
                    localTimestamp: '2026-05-01T10:00:00+03:00',
                    timezoneOffset: '+03:00'
                },
                {
                    status: 'Processed at DUBAI-UNITED ARAB EMIRATES',
                    description: 'Processed at DUBAI-UNITED ARAB EMIRATES',
                    location: 'Dubai, UAE',
                    timestamp: '2026-05-01T16:00:00.000Z',
                    localTimestamp: '2026-05-01T20:00:00+04:00',
                    timezoneOffset: '+04:00'
                }
            ];

            const display = buildDisplayHistory(events);

            expect(display).toHaveLength(2);

            // First event: UTC 07:00, Local 10:00 (+03:00)
            expect(display[0].timestamp).toBe('2026-05-01T07:00:00.000Z');
            expect(display[0].localTimestamp).toBe('2026-05-01T10:00:00+03:00');
            expect(display[0].timezoneOffset).toBe('+03:00');

            // Second event: UTC 16:00, Local 20:00 (+04:00)
            expect(display[1].timestamp).toBe('2026-05-01T16:00:00.000Z');
            expect(display[1].localTimestamp).toBe('2026-05-01T20:00:00+04:00');
            expect(display[1].timezoneOffset).toBe('+04:00');
        });

        it('orders display events strictly by chronological UTC timestamp regardless of carrier input order', () => {
            const outOfOrderEvents = [
                {
                    status: 'out_for_delivery',
                    description: 'Out for delivery',
                    location: 'DUBAI-AE',
                    timestamp: '2026-05-02T08:00:00.000Z'
                },
                {
                    status: 'pickup',
                    description: 'Picked up',
                    location: 'KUWAIT-KW',
                    timestamp: '2026-05-01T10:00:00.000Z'
                },
                {
                    status: 'arrived_facility',
                    description: 'Arrived at sorting facility',
                    location: 'DUBAI-AE',
                    timestamp: '2026-05-01T22:00:00.000Z'
                }
            ];

            const display = buildDisplayHistory(outOfOrderEvents);

            expect(display.map(e => e.canonicalStatus)).toEqual([
                'pickup',
                'arrived_facility',
                'out_for_delivery'
            ]);
            expect(new Date(display[0].timestamp).getTime()).toBeLessThan(new Date(display[1].timestamp).getTime());
            expect(new Date(display[1].timestamp).getTime()).toBeLessThan(new Date(display[2].timestamp).getTime());
        });
    });

    describe('4. Location Normalization & Suppression of Origin Replays', () => {
        it('normalizes common carrier location variants correctly', () => {
            expect(normalizeLocationLabel('KUWAIT-KUWAIT')).toBe('KUWAIT-KW');
            expect(normalizeLocationLabel('Abu Dhabi-UNITED ARAB EMIRATES')).toBe('ABU DHABI-AE');
            expect(normalizeLocationLabel('Dubai-AE')).toBe('DUBAI-AE');
            expect(normalizeLocationLabel('Cincinnati Hub - Ohio - USA')).toBe('CINCINNATI-US');
            expect(normalizeLocationLabel('Erlanger - Kentucky - USA')).toBe('ERLANGER-US');
            expect(normalizeLocationLabel('')).toBe('UNKNOWN');
            expect(normalizeLocationLabel('   ')).toBe('UNKNOWN');
            expect(normalizeLocationLabel(null)).toBe('NULL');
        });

        it('suppresses origin facility replay events once shipment has departed origin', () => {
            const events = [
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up',
                    location: 'Kuwait-KW',
                    timestamp: '2026-04-27T10:00:00Z'
                },
                {
                    status: 'Shipment has departed from a DHL facility KUWAIT-KUWAIT',
                    description: 'Shipment has departed from a DHL facility KUWAIT-KUWAIT',
                    location: 'KUWAIT-KUWAIT',
                    timestamp: '2026-04-27T12:00:00Z'
                },
                // Subsequent delayed origin replay scan after departure
                {
                    status: 'Shipment is on hold',
                    description: 'Shipment is on hold',
                    location: 'Kuwait-KW',
                    timestamp: '2026-04-27T13:00:00Z'
                },
                // Destination event
                {
                    status: 'Processed at ABU DHABI-UNITED ARAB EMIRATES',
                    description: 'Processed at ABU DHABI-UNITED ARAB EMIRATES',
                    location: 'ABU DHABI-UNITED ARAB EMIRATES',
                    timestamp: '2026-04-27T16:00:00Z'
                }
            ];

            const display = buildDisplayHistory(events, { originLocation: 'KUWAIT-KW' });
            expect(display.map(e => e.canonicalStatus)).toEqual(['pickup', 'departed_facility', 'processed']);
        });
    });

    describe('5. Defensive Resilience on Null / Malformed Payloads', () => {
        it('handles null, undefined, and empty array history gracefully without throwing', () => {
            expect(buildDisplayHistory(null)).toEqual([]);
            expect(buildDisplayHistory(undefined)).toEqual([]);
            expect(buildDisplayHistory([])).toEqual([]);
            expect(buildDisplayHistory([null, undefined, {}])).toEqual([]);
        });

        it('filters out corrupt events missing valid timestamps', () => {
            const corruptEvents = [
                { status: 'pickup', description: 'Invalid timestamp', timestamp: 'not-a-date' },
                { status: 'pickup', description: 'Missing timestamp' },
                { status: 'in_transit', description: 'Valid event', timestamp: '2026-05-01T12:00:00Z', location: 'DUBAI-AE' }
            ];

            const display = buildDisplayHistory(corruptEvents);
            expect(display).toHaveLength(1);
            expect(display[0].description).toBe('Valid event');
        });

        it('handles object-shaped location structures safely', () => {
            const events = [
                {
                    status: 'pickup',
                    description: 'Picked up',
                    location: { formattedAddress: 'Kuwait City, Kuwait', city: 'Kuwait City' },
                    timestamp: '2026-05-01T10:00:00Z'
                }
            ];

            const display = buildDisplayHistory(events);
            expect(display).toHaveLength(1);
            expect(display[0].normalizedLocation).toBe('KUWAIT-KW');
        });
    });

    describe('6. Public vs. Internal Data Sanitization', () => {
        it('strips internal Phenix ERP audit sync checkpoints from display history', () => {
            const mixedEvents = [
                {
                    status: 'created',
                    description: 'Consignment booked on platform',
                    timestamp: '2026-05-01T08:00:00Z',
                    source: 'platform'
                },
                {
                    status: 'updated',
                    description: 'Synchronized from Phenix ERP bill #104928',
                    timestamp: '2026-05-01T08:05:00Z',
                    source: 'phenix_erp'
                },
                {
                    status: 'pickup',
                    description: 'Courier picked up package',
                    timestamp: '2026-05-01T09:00:00Z',
                    source: 'carrier',
                    location: 'Kuwait City'
                }
            ];

            const display = buildDisplayHistory(mixedEvents);

            // Phenix ERP sync event must NOT appear in display history
            expect(display.some(e => e.description.includes('Phenix ERP'))).toBe(false);
            expect(display.some(e => e.source === 'phenix_erp')).toBe(false);
            expect(display.map(e => e.canonicalStatus)).toEqual(['created', 'pickup']);
        });

        it('strips internal operations gateway manifest audit events', () => {
            const events = [
                {
                    status: 'in_transit',
                    description: 'Manifested under Master AWB 99482910',
                    location: 'Operations Gateway Kuwait',
                    timestamp: '2026-05-01T11:00:00Z'
                },
                {
                    status: 'in_transit',
                    description: 'Processed at DUBAI-AE',
                    location: 'DUBAI-AE',
                    timestamp: '2026-05-01T14:00:00Z'
                }
            ];

            const display = buildDisplayHistory(events);
            expect(display).toHaveLength(1);
            expect(display[0].normalizedLocation).toBe('DUBAI-AE');
        });
    });
});
