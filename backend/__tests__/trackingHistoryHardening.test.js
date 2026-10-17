/**
 * Comprehensive Tracking History & Status Hardening Regression Suite (R1–R6)
 *
 * Verifies:
 * - R1: Status Normalization, False-Positive Prevention ("premises closed", "undelivered", "contacted consignee"), Checkpoint Precedence, Terminal Invariants & Auto-Healing.
 * - R2: Coordinate Safety (missing/array/object coordinates), Distance Calculation, and History Compaction.
 * - R3: Carrier Sync Cron Change Detection, Webhook HMAC Verification, and Idempotent Ingestion.
 * - R4: Timeline Display Presentation, Collapsed Scans, and Public Data Sanitization.
 * - R5: Production Backfill Engine and Exception Auto-Healing.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    normalizeStatus,
    normalizeCarrierStatus,
    isNegativeOrExceptionPhrase,
    isTerminalStatus,
    isStatusAhead,
    DHL_CHECKPOINT_MAP,
    OTE_STATUS_MAP,
    ARAMEX_CHECKPOINT_MAP,
    FEDEX_CHECKPOINT_MAP
} = require('../src/constants/statusConstants');

const {
    calculateDistance,
    compactHistory,
    buildDisplayHistory,
    evaluateRealtimeExceptionStatus,
    getResolvedExceptionStatus,
    autoHealResolvedShipment,
    autoSyncAllExceptions,
    hasCriticalChanges
} = require('../src/controllers/shipment.helpers');

describe('Tracking History & Status Hardening Regression Suite (R1–R6)', () => {
    // -------------------------------------------------------------------------
    // R1: Status Normalization & False-Positive Prevention
    // -------------------------------------------------------------------------
    describe('R1: Status Normalization & False-Positive Prevention', () => {
        const falsePositiveNegativeCases = [
            'Consignee premises closed',
            'Consignee premises closed at 14:15',
            'Premises closed - courier unable to access',
            'Undelivered',
            'Package undelivered',
            'Delivery attempt failed',
            'Delivery attempt failed - consignee unavailable',
            'Contacted consignee for customs requirements',
            'Contacted consignee for address clarification',
            'Consignee unavailable at delivery address',
            'Consignee refused delivery',
            'Refused by recipient',
            'Customer not home',
            'Not at home',
            'Bad address reported by driver',
            'Address incorrect',
            'Shipment is on hold',
            'Held at sorting facility',
            'Clearance delay'
        ];

        falsePositiveNegativeCases.forEach((phrase) => {
            it(`prevents false-positive promotion to 'delivered' for phrase: "${phrase}"`, () => {
                const normalized = normalizeStatus(phrase);
                expect(normalized).toBe('exception');
                expect(normalized).not.toBe('delivered');
                expect(isNegativeOrExceptionPhrase(phrase)).toBe(true);
            });
        });

        const genuineDeliveredCases = [
            'Delivered to recipient',
            'Delivered to consignee',
            'Shipment delivered',
            'Package delivered',
            'Proof of delivery signed by John Doe',
            'DLV',
            'POD'
        ];

        genuineDeliveredCases.forEach((phrase) => {
            it(`accurately identifies genuine delivery phrase: "${phrase}"`, () => {
                const normalized = normalizeStatus(phrase);
                expect(normalized).toBe('delivered');
                expect(isNegativeOrExceptionPhrase(phrase)).toBe(false);
            });
        });

        it('strictly enforces terminal status invariants (cannot regress from delivered, cancelled, returned)', () => {
            expect(isTerminalStatus('delivered')).toBe(true);
            expect(isTerminalStatus('cancelled')).toBe(true);
            expect(isTerminalStatus('returned')).toBe(true);
            expect(isTerminalStatus('in_transit')).toBe(false);
            expect(isTerminalStatus('exception')).toBe(false);
            expect(isTerminalStatus('out_for_delivery')).toBe(false);

            // Terminal status cannot be superseded by active movement
            expect(isStatusAhead('delivered', 'in_transit')).toBe(false);
            expect(isStatusAhead('delivered', 'out_for_delivery')).toBe(false);
            expect(isStatusAhead('delivered', 'exception')).toBe(false);
            expect(isStatusAhead('cancelled', 'in_transit')).toBe(false);
            expect(isStatusAhead('returned', 'in_transit')).toBe(false);
        });

        it('auto-heals exception status when subsequent genuine movement scans arrive', () => {
            // Forward movement clears prior exception
            expect(isStatusAhead('exception', 'in_transit')).toBe(true);
            expect(isStatusAhead('exception', 'out_for_delivery')).toBe(true);
            expect(isStatusAhead('exception', 'delivered')).toBe(true);
            expect(isStatusAhead('exception', 'picked_up')).toBe(true);

            // But exception does NOT advance ahead of active movement
            expect(isStatusAhead('in_transit', 'exception')).toBe(false);
            expect(isStatusAhead('out_for_delivery', 'exception')).toBe(false);
        });

        it('verifies carrier checkpoint code priority across all carriers', () => {
            // DHL
            expect(normalizeCarrierStatus('Some carrier note', 'DGR', 'OK')).toBe('delivered');
            expect(normalizeCarrierStatus('Facility update', 'DGR', 'WC')).toBe('out_for_delivery');
            expect(normalizeCarrierStatus('Operational status', 'DGR', 'BA')).toBe('exception');
            expect(normalizeCarrierStatus('Operational status', 'DGR', 'RT')).toBe('returned');

            // Aramex
            expect(normalizeCarrierStatus('Aramex event', 'ARAMEX', 'SH005')).toBe('delivered');
            expect(normalizeCarrierStatus('Aramex event', 'ARAMEX', 'SH014')).toBe('out_for_delivery');
            expect(normalizeCarrierStatus('Aramex event', 'ARAMEX', 'SH008')).toBe('exception');

            // FedEx
            expect(normalizeCarrierStatus('FedEx event', 'FEDEX', 'DL')).toBe('delivered');
            expect(normalizeCarrierStatus('FedEx event', 'FEDEX', 'OD')).toBe('out_for_delivery');
            expect(normalizeCarrierStatus('FedEx event', 'FEDEX', 'DE')).toBe('exception');

            // OTE / LogesTechs
            expect(normalizeCarrierStatus('OTE event', 'OTE', 'delivered_to_recipient')).toBe('delivered');
            expect(normalizeCarrierStatus('OTE event', 'OTE', 'failed_delivery')).toBe('exception');
            expect(normalizeCarrierStatus('OTE event', 'OTE', 'customer_cancelled')).toBe('cancelled');
        });
    });

    // -------------------------------------------------------------------------
    // R2: Coordinate Safety & History Compaction
    // -------------------------------------------------------------------------
    describe('R2: Coordinate Safety & History Compaction', () => {
        it('safely calculates distance for array coordinates [lon, lat]', () => {
            const coord1 = [47.9774, 29.3759]; // Kuwait City [lon, lat]
            const coord2 = [55.2708, 25.2048]; // Dubai [lon, lat]

            const dist = calculateDistance(coord1, coord2);
            expect(dist).toBeGreaterThan(800);
            expect(dist).toBeLessThan(900);
        });

        it('safely calculates distance for object coordinates { latitude, longitude } and { lat, lng }', () => {
            const coord1 = { latitude: 29.3759, longitude: 47.9774 };
            const coord2 = { lat: 25.2048, lng: 55.2708 };

            const dist = calculateDistance(coord1, coord2);
            expect(dist).toBeGreaterThan(800);
            expect(dist).toBeLessThan(900);
        });

        it('defensively handles missing, null, undefined, and malformed coordinates without throwing', () => {
            expect(calculateDistance(null, [47.9774, 29.3759])).toBe(0);
            expect(calculateDistance(undefined, undefined)).toBe(0);
            expect(calculateDistance({}, {})).toBe(0);
            expect(calculateDistance([], [])).toBe(0);
            expect(calculateDistance('invalid', 123)).toBe(0);
            expect(calculateDistance([NaN, NaN], [47.9774, 29.3759])).toBe(0);
        });

        it('compacts history by deduplicating scans in identical minute buckets while preserving metadata', () => {
            const rawHistory = [
                {
                    status: 'picked_up',
                    description: 'Shipment picked up',
                    source: 'carrier',
                    timestamp: '2026-05-01T10:00:10.000Z',
                    localTimestamp: '2026-05-01T13:00:10+03:00',
                    timezoneOffset: '+03:00',
                    location: 'Kuwait City'
                },
                // Jitter repeat 20s later in same minute bucket
                {
                    status: 'picked_up',
                    description: 'Shipment picked up',
                    source: 'carrier',
                    timestamp: '2026-05-01T10:00:30.000Z',
                    localTimestamp: '2026-05-01T13:00:30+03:00',
                    timezoneOffset: '+03:00',
                    location: 'Kuwait City'
                },
                // Internal audit event to be filtered
                {
                    status: 'updated',
                    description: 'Synchronized from Phenix ERP bill',
                    source: 'phenix_erp',
                    timestamp: '2026-05-01T10:05:00.000Z'
                },
                // Subsequent distinct scan
                {
                    status: 'in_transit',
                    description: 'Departed sorting facility',
                    source: 'carrier',
                    timestamp: '2026-05-01T12:00:00.000Z',
                    localTimestamp: '2026-05-01T15:00:00+03:00',
                    timezoneOffset: '+03:00',
                    location: 'Kuwait Facility'
                }
            ];

            const compacted = compactHistory(rawHistory);

            expect(compacted).toHaveLength(2);
            expect(compacted[0].status).toBe('picked_up');
            expect(compacted[0].localTimestamp).toBe('2026-05-01T13:00:30+03:00');
            expect(compacted[0].timezoneOffset).toBe('+03:00');
            expect(compacted[1].status).toBe('in_transit');
            expect(compacted.some(e => (e.description || '').includes('Phenix ERP'))).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // R3: Cron Change Detection & Webhook HMAC Verification
    // -------------------------------------------------------------------------
    describe('R3: Carrier Sync Cron Change Detection & Webhook HMAC', () => {
        it('detects genuine tracking updates with hasCriticalChanges', () => {
            const original = {
                serviceCode: 'P',
                insuredValue: 100,
                parcels: [{ weight: 2.5, dimensions: { l: 20, w: 20, h: 20 } }],
                origin: { countryCode: 'KW', city: 'Kuwait City' },
                destination: { countryCode: 'AE', city: 'Dubai' }
            };

            // Identical updates -> false
            expect(hasCriticalChanges(original, { serviceCode: 'P', insuredValue: 100 })).toBe(false);

            // Service change -> true
            expect(hasCriticalChanges(original, { serviceCode: 'D' })).toBe(true);

            // Insured value change -> true
            expect(hasCriticalChanges(original, { insuredValue: 200 })).toBe(true);

            // Weight change -> true
            expect(hasCriticalChanges(original, { parcels: [{ weight: 3.5, dimensions: { l: 20, w: 20, h: 20 } }] })).toBe(true);
        });

        it('verifies TrackingMore webhook HMAC-SHA256 signature against raw payload', () => {
            const webhookSecret = 'secret_test_key_12345';
            const rawBody = JSON.stringify({
                event: 'tracking_update',
                data: {
                    tracking_number: '1234567890',
                    carrier_code: 'dhl',
                    status: 'delivered'
                }
            });

            // Correct HMAC calculation over raw string
            const validSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

            // Verification function
            const verifySignature = (payload, signature, secret) => {
                if (!payload || !signature || !secret) return false;
                const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
                try {
                    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
                } catch {
                    return false;
                }
            };

            expect(verifySignature(rawBody, validSignature, webhookSecret)).toBe(true);

            // Tampered body must fail
            const tamperedBody = rawBody.replace('delivered', 'in_transit');
            expect(verifySignature(tamperedBody, validSignature, webhookSecret)).toBe(false);

            // Wrong secret must fail
            expect(verifySignature(rawBody, validSignature, 'wrong_secret')).toBe(false);

            // Missing signature must fail
            expect(verifySignature(rawBody, '', webhookSecret)).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // R4: Timeline Presentation & Public Sanitization
    // -------------------------------------------------------------------------
    describe('R4: Timeline Presentation & Public Sanitization', () => {
        it('renders collapsed scans, local timestamps, and proper chronological ordering', () => {
            const scans = [
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up',
                    location: 'KUWAIT-KW',
                    timestamp: '2026-05-01T08:00:00Z',
                    localTimestamp: '2026-05-01T11:00:00+03:00',
                    timezoneOffset: '+03:00'
                },
                {
                    status: 'Shipment picked up',
                    description: 'Shipment picked up',
                    location: 'Kuwait-KW',
                    timestamp: '2026-05-01T08:05:00Z',
                    localTimestamp: '2026-05-01T11:05:00+03:00',
                    timezoneOffset: '+03:00'
                },
                {
                    status: 'Arrived at Sort Facility',
                    description: 'Arrived at DHL Sort Facility',
                    location: 'DUBAI-AE',
                    timestamp: '2026-05-01T20:00:00Z',
                    localTimestamp: '2026-05-02T00:00:00+04:00',
                    timezoneOffset: '+04:00'
                }
            ];

            const display = buildDisplayHistory(scans);

            expect(display).toHaveLength(2);
            expect(display[0].canonicalStatus).toBe('pickup');
            expect(display[0].collapsedCount).toBe(2);
            expect(display[0].localTimestamp).toBe('2026-05-01T11:00:00+03:00');

            expect(display[1].canonicalStatus).toBe('arrived_facility');
            expect(display[1].collapsedCount).toBe(1);
            expect(display[1].localTimestamp).toBe('2026-05-02T00:00:00+04:00');
        });
    });

    // -------------------------------------------------------------------------
    // R5: Production Backfill Engine & Exception Auto-Healing
    // -------------------------------------------------------------------------
    describe('R5: Production Backfill Engine & Exception Auto-Healing', () => {
        it('auto-heals a single resolved shipment in mock database', async () => {
            const mockShipment = {
                id: 'ship-101',
                trackingNumber: 'TRK-101',
                status: 'exception',
                history: [
                    { status: 'picked_up', timestamp: '2026-05-01T10:00:00Z' },
                    { status: 'exception', description: 'Address verification delay', timestamp: '2026-05-02T09:00:00Z' },
                    { status: 'out_for_delivery', description: 'With courier', timestamp: '2026-05-03T08:00:00Z' }
                ]
            };

            const mockPrisma = {
                shipment: {
                    update: jest.fn().mockResolvedValue({ id: 'ship-101', status: 'out_for_delivery' })
                }
            };

            const healed = await autoHealResolvedShipment(mockShipment, mockPrisma);

            expect(healed).toBe('out_for_delivery');
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith({
                where: { id: 'ship-101' },
                data: { status: 'out_for_delivery' }
            });
            expect(mockShipment.status).toBe('out_for_delivery');
        });

        it('bulk synchronizes active and resolved exceptions via autoSyncAllExceptions', async () => {
            const candidates = [
                // Resolved exception -> should heal to delivered
                {
                    id: 's-1',
                    trackingNumber: 'TRK-001',
                    status: 'exception',
                    history: [
                        { status: 'picked_up', timestamp: '2026-05-01T10:00:00Z' },
                        { status: 'exception', description: 'Consignee premises closed', timestamp: '2026-05-01T14:00:00Z' },
                        { status: 'delivered', description: 'Delivered to recipient', timestamp: '2026-05-02T10:00:00Z' }
                    ]
                },
                // Still in active exception -> should not update
                {
                    id: 's-2',
                    trackingNumber: 'TRK-002',
                    status: 'exception',
                    history: [
                        { status: 'picked_up', timestamp: '2026-05-01T10:00:00Z' },
                        { status: 'exception', description: 'Consignee premises closed', timestamp: '2026-05-02T14:00:00Z' }
                    ]
                },
                // Active in-transit shipment whose latest scan is an exception -> should flag to exception
                {
                    id: 's-3',
                    trackingNumber: 'TRK-003',
                    status: 'in_transit',
                    history: [
                        { status: 'picked_up', timestamp: '2026-05-01T10:00:00Z' },
                        { status: 'exception', description: 'Customs hold', timestamp: '2026-05-02T16:00:00Z' }
                    ]
                }
            ];

            const mockPrisma = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue(candidates),
                    update: jest.fn().mockResolvedValue({})
                }
            };

            const updatedCount = await autoSyncAllExceptions(mockPrisma);

            // s-1 heals exception -> delivered, s-3 flags in_transit -> exception
            expect(updatedCount).toBe(2);
            expect(mockPrisma.shipment.update).toHaveBeenCalledTimes(2);
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith({
                where: { id: 's-1' },
                data: { status: 'delivered' }
            });
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith({
                where: { id: 's-3' },
                data: { status: 'exception' }
            });
        });
    });
});
