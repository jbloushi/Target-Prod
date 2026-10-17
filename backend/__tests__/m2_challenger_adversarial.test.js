/**
 * Adversarial Challenger Suite for Milestone 2:
 * 1. updateShipmentLocation edge-case coordinates safety
 * 2. compactHistory deduplication & chronological sorting
 * 3. ShipmentTrackingEvent SHA-256 eventKey idempotency & upsert safety
 */

const { createHash } = require('crypto');
const {
    parseCoordinates,
    calculateDistance,
    compactHistory,
    persistTrackingEvents,
    normalizeStatus
} = require('../src/controllers/shipment.helpers');
const { updateShipmentLocation } = require('../src/controllers/shipment-tracking.controller');
const { prisma } = require('../src/config/database');

describe('Milestone 2 Challenger Adversarial Suite', () => {

    describe('1. updateShipmentLocation & parseCoordinates Edge-Case Coordinates', () => {
        let shipmentDb;
        let trackingEventDb;
        let lastUpdatedShipment;
        let upsertedTrackingEvents;

        beforeEach(() => {
            lastUpdatedShipment = null;
            upsertedTrackingEvents = [];

            shipmentDb = {
                id: 'ship-adv-001',
                trackingNumber: 'TRK-ADV-001',
                status: 'in_transit',
                carrierCode: 'DGR',
                assignedDriverId: 'driver-99',
                currentLocation: {
                    formattedAddress: 'Original Warehouse',
                    longitude: 47.9000,
                    latitude: 29.3000
                },
                history: [
                    {
                        status: 'in_transit',
                        description: 'Dispatched from hub',
                        timestamp: '2026-05-01T08:00:00.000Z',
                        location: 'Original Warehouse',
                        source: 'staff'
                    }
                ]
            };

            prisma.shipment = {
                findUnique: jest.fn().mockImplementation(async ({ where }) => {
                    if (where.trackingNumber === shipmentDb.trackingNumber) {
                        return { ...shipmentDb };
                    }
                    return null;
                }),
                update: jest.fn().mockImplementation(async ({ where, data }) => {
                    lastUpdatedShipment = { ...shipmentDb, ...data };
                    return lastUpdatedShipment;
                })
            };

            prisma.shipmentTrackingEvent = {
                upsert: jest.fn().mockImplementation(async (args) => {
                    upsertedTrackingEvents.push(args);
                    return args;
                })
            };
        });

        const runControllerCall = async (body) => {
            const req = {
                params: { trackingNumber: 'TRK-ADV-001' },
                user: { id: 'admin-1', role: 'admin' },
                body
            };
            let statusCode = null;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return {
                        json: (data) => {
                            responseData = data;
                        }
                    };
                }
            };
            await updateShipmentLocation(req, res);
            return { statusCode, responseData };
        };

        test('Edge case 1a: undefined or omitted coordinates', async () => {
            const { statusCode, responseData } = await runControllerCall({
                address: 'New Stop Address',
                description: 'Driver checkpoint'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.9000);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.3000);
            expect(lastUpdatedShipment.currentLocation.formattedAddress).toBe('New Stop Address');
        });

        test('Edge case 1b: explicit undefined coordinates', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: undefined,
                address: 'Explicit Undefined Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.9000);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.3000);
        });

        test('Edge case 1c: null coordinates', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: null,
                address: 'Null Coordinates Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.9000);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.3000);
        });

        test('Edge case 1d: Empty array []', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: [],
                address: 'Empty Array Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.9000);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.3000);
        });

        test('Edge case 1e: Incomplete array [47.9]', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: [47.9],
                address: 'Incomplete Array Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.9000);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.3000);
        });

        test('Edge case 1f: GeoJSON / Google Maps object { lat: 29.37, lng: 47.97 }', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: { lat: 29.37, lng: 47.97 },
                address: 'Google Maps Format Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.97);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.37);
        });

        test('Edge case 1g: Standard object { latitude: 29.37, longitude: 47.97 }', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: { latitude: 29.37, longitude: 47.97 },
                address: 'Standard Object Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.97);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.37);
        });

        test('Edge case 1h: Alternative object format { lon: 47.97, lat: 29.37 }', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: { lon: 47.97, lat: 29.37 },
                address: 'Lon/Lat Object Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.97);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.37);
        });

        test('Edge case 1i: String numbers [\'47.97\', \'29.37\']', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: ['47.97', '29.37'],
                address: 'String Numbers Array Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.97);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.37);
        });

        test('Edge case 1j: String numbers in objects { lat: \'29.37\', lng: \'47.97\' }', async () => {
            const { statusCode, responseData } = await runControllerCall({
                coordinates: { lat: '29.37', lng: '47.97' },
                address: 'String Numbers Object Stop'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.97);
            expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.37);
        });

        test('Edge case 1k: Malformed inputs (NaN, invalid strings, numbers, booleans)', async () => {
            const malformedInputs = [
                ['invalid', 'coords'],
                [NaN, NaN],
                { lat: 'not-a-number', lng: null },
                123456,
                'invalid string',
                true,
                false
            ];

            for (const input of malformedInputs) {
                const { statusCode, responseData } = await runControllerCall({
                    coordinates: input,
                    address: 'Malformed Input Stop'
                });

                expect(statusCode).toBe(200);
                expect(responseData.success).toBe(true);
                // Should fall back to existing location
                expect(lastUpdatedShipment.currentLocation.longitude).toBe(47.9000);
                expect(lastUpdatedShipment.currentLocation.latitude).toBe(29.3000);
            }
        });

        test('Edge case 1l: Fallback when shipment.currentLocation is null', async () => {
            shipmentDb.currentLocation = null;

            const { statusCode, responseData } = await runControllerCall({
                coordinates: null,
                address: 'No Prior Location'
            });

            expect(statusCode).toBe(200);
            expect(responseData.success).toBe(true);
            expect(lastUpdatedShipment.currentLocation.longitude).toBeNull();
            expect(lastUpdatedShipment.currentLocation.latitude).toBeNull();
            expect(lastUpdatedShipment.currentLocation.formattedAddress).toBe('No Prior Location');
        });

        test('Direct parseCoordinates unit stress test', () => {
            // Nulls and empties
            expect(parseCoordinates(null)).toEqual({ longitude: null, latitude: null });
            expect(parseCoordinates(undefined)).toEqual({ longitude: null, latitude: null });
            expect(parseCoordinates([])).toEqual({ longitude: null, latitude: null });
            expect(parseCoordinates([47.9])).toEqual({ longitude: null, latitude: null });
            expect(parseCoordinates({})).toEqual({ longitude: null, latitude: null });

            // Valid arrays
            expect(parseCoordinates([47.97, 29.37])).toEqual({ longitude: 47.97, latitude: 29.37 });
            expect(parseCoordinates(['47.97', '29.37'])).toEqual({ longitude: 47.97, latitude: 29.37 });

            // Valid objects
            expect(parseCoordinates({ lat: 29.37, lng: 47.97 })).toEqual({ longitude: 47.97, latitude: 29.37 });
            expect(parseCoordinates({ latitude: 29.37, longitude: 47.97 })).toEqual({ longitude: 47.97, latitude: 29.37 });
            expect(parseCoordinates({ lat: 29.37, lon: 47.97 })).toEqual({ longitude: 47.97, latitude: 29.37 });

            // Fallback chain
            expect(parseCoordinates(null, [48.1, 29.5])).toEqual({ longitude: 48.1, latitude: 29.5 });
            expect(parseCoordinates([], { lat: 29.5, lng: 48.1 })).toEqual({ longitude: 48.1, latitude: 29.5 });
            expect(parseCoordinates('invalid', null)).toEqual({ longitude: null, latitude: null });
        });
    });

    describe('2. compactHistory Deduplication & Chronological Sorting', () => {
        test('Deduplicates scans with exact identical timestamp and key attributes', () => {
            const raw = [
                {
                    status: 'picked_up',
                    description: 'Shipment collected',
                    source: 'driver',
                    timestamp: '2026-05-01T10:00:00.000Z',
                    location: 'Kuwait City'
                },
                {
                    status: 'picked_up',
                    description: 'Shipment collected',
                    source: 'driver',
                    timestamp: '2026-05-01T10:00:00.000Z',
                    location: 'Kuwait City'
                }
            ];

            const compacted = compactHistory(raw);
            expect(compacted).toHaveLength(1);
            expect(compacted[0].status).toBe('picked_up');
        });

        test('Deduplicates duplicate scans within same minute bucket (sub-minute jitter)', () => {
            const raw = [
                {
                    status: 'in_transit',
                    description: 'Arrived at hub',
                    source: 'carrier',
                    timestamp: '2026-05-01T10:00:05.000Z',
                    location: 'Hub 1'
                },
                {
                    status: 'in_transit',
                    description: 'Arrived at hub',
                    source: 'carrier',
                    timestamp: '2026-05-01T10:00:45.000Z',
                    location: 'Hub 1'
                }
            ];

            const compacted = compactHistory(raw);
            expect(compacted).toHaveLength(1);
            // Retains latest in the bucket
            expect(compacted[0].timestamp).toBe('2026-05-01T10:00:45.000Z');
        });

        test('Sorts out-of-order scans in strict chronological order', () => {
            const raw = [
                { status: 'delivered', description: 'Delivered', timestamp: '2026-05-01T16:00:00.000Z' },
                { status: 'booked', description: 'Booked', timestamp: '2026-05-01T08:00:00.000Z' },
                { status: 'out_for_delivery', description: 'Out for delivery', timestamp: '2026-05-01T14:00:00.000Z' },
                { status: 'picked_up', description: 'Picked up', timestamp: '2026-05-01T10:00:00.000Z' },
                { status: 'in_transit', description: 'In transit', timestamp: '2026-05-01T12:00:00.000Z' }
            ];

            const compacted = compactHistory(raw);
            expect(compacted).toHaveLength(5);
            expect(compacted[0].status).toBe('booked');
            expect(compacted[1].status).toBe('picked_up');
            expect(compacted[2].status).toBe('in_transit');
            expect(compacted[3].status).toBe('out_for_delivery');
            expect(compacted[4].status).toBe('delivered');
        });

        test('Preserves actor metadata (source), localTimestamp, and timezoneOffset', () => {
            const raw = [
                {
                    status: 'out_for_delivery',
                    description: 'Loaded into delivery van',
                    source: 'driver',
                    timestamp: '2026-05-01T07:00:00.000Z',
                    localTimestamp: '2026-05-01T10:00:00+03:00',
                    timezoneOffset: '+03:00',
                    location: { formattedAddress: 'Salmiya Station' }
                }
            ];

            const compacted = compactHistory(raw);
            expect(compacted[0].source).toBe('driver');
            expect(compacted[0].localTimestamp).toBe('2026-05-01T10:00:00+03:00');
            expect(compacted[0].timezoneOffset).toBe('+03:00');
            expect(compacted[0].location.formattedAddress).toBe('Salmiya Station');
        });

        test('Strips internal ERP and operational noise entries', () => {
            const raw = [
                { status: 'booked', description: 'Shipment created', timestamp: '2026-05-01T08:00:00.000Z' },
                { status: 'internal', description: 'Synchronized from Phenix ERP bill', timestamp: '2026-05-01T08:05:00.000Z' },
                { status: 'internal', description: 'Manifested under batch 44', timestamp: '2026-05-01T08:10:00.000Z' },
                { status: 'internal', description: 'Scanned at Operations Gateway', location: 'Operations Gateway', timestamp: '2026-05-01T08:15:00.000Z' },
                { status: 'in_transit', description: 'Departed facility', timestamp: '2026-05-01T09:00:00.000Z' }
            ];

            const compacted = compactHistory(raw);
            expect(compacted).toHaveLength(2);
            expect(compacted[0].status).toBe('booked');
            expect(compacted[1].status).toBe('in_transit');
        });

        test('Large-scale randomized stress test: 500 scans with duplicates and random order', () => {
            const baseTime = Date.parse('2026-05-01T00:00:00.000Z');
            const total = 500;
            const generated = [];

            for (let i = 0; i < total; i++) {
                // Generate 50 distinct timestamps
                const bucket = i % 50;
                const timestamp = new Date(baseTime + bucket * 3600000).toISOString();
                generated.push({
                    status: bucket % 2 === 0 ? 'in_transit' : 'facility_scan',
                    description: `Checkpoint ${bucket}`,
                    source: 'carrier',
                    timestamp,
                    location: `City ${bucket}`
                });
            }

            // Shuffle array
            const shuffled = [...generated].sort(() => Math.random() - 0.5);

            const compacted = compactHistory(shuffled);
            // Must have exactly 50 unique items
            expect(compacted).toHaveLength(50);

            // Must be strictly monotonically non-decreasing in timestamp
            for (let i = 1; i < compacted.length; i++) {
                const prev = new Date(compacted[i - 1].timestamp).getTime();
                const curr = new Date(compacted[i].timestamp).getTime();
                expect(curr).toBeGreaterThanOrEqual(prev);
            }
        });
    });

    describe('3. ShipmentTrackingEvent SHA-256 eventKey Idempotency', () => {
        test('Computes deterministic SHA-256 eventKey across multiple evaluations', () => {
            const payload = {
                provider: 'FLEET',
                status: 'out_for_delivery',
                description: 'Driver on the way',
                timestamp: '2026-05-01T12:00:00.000Z',
                location: 'Hawally Block 3'
            };

            const key1 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
            const key2 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
            const key3 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

            expect(key1).toHaveLength(64);
            expect(key1).toBe(key2);
            expect(key2).toBe(key3);
        });

        test('persistTrackingEvents intra-batch deduplication prevents $transaction collision', async () => {
            const upsertCalls = [];
            const mockPrisma = {
                shipmentTrackingEvent: {
                    upsert: jest.fn().mockImplementation((args) => {
                        upsertCalls.push(args);
                        return Promise.resolve(args);
                    })
                },
                $transaction: jest.fn().mockImplementation(async (ops) => Promise.all(ops))
            };

            const duplicateEvents = [
                {
                    statusCode: 'PU',
                    status: 'picked_up',
                    description: 'Shipment picked up',
                    timestamp: '2026-05-01T10:00:00.000Z',
                    location: 'Kuwait Facility'
                },
                {
                    statusCode: 'PU',
                    status: 'picked_up',
                    description: 'Shipment picked up',
                    timestamp: '2026-05-01T10:00:00.000Z',
                    location: 'Kuwait Facility'
                },
                {
                    statusCode: 'WC',
                    status: 'out_for_delivery',
                    description: 'With delivery courier',
                    timestamp: '2026-05-01T14:00:00.000Z',
                    location: 'Kuwait City'
                }
            ];

            const count = await persistTrackingEvents(mockPrisma, 'ship-101', duplicateEvents, 'DGR');
            expect(count).toBe(2);
            expect(upsertCalls).toHaveLength(2);
            expect(mockPrisma.$transaction).toHaveBeenCalled();

            const eventKeys = upsertCalls.map(c => c.where.shipmentId_eventKey.eventKey);
            expect(new Set(eventKeys).size).toBe(2);
        });

        test('persistTrackingEvents repeated successive calls cleanly update existing keys (idempotency)', async () => {
            const persistedEvents = new Map();
            const mockPrisma = {
                shipmentTrackingEvent: {
                    upsert: jest.fn().mockImplementation(async ({ where, create, update }) => {
                        const compoundKey = `${where.shipmentId_eventKey.shipmentId}:${where.shipmentId_eventKey.eventKey}`;
                        if (persistedEvents.has(compoundKey)) {
                            const updated = { ...persistedEvents.get(compoundKey), ...update, _action: 'UPDATE' };
                            persistedEvents.set(compoundKey, updated);
                            return updated;
                        } else {
                            const created = { ...create, _action: 'CREATE' };
                            persistedEvents.set(compoundKey, created);
                            return created;
                        }
                    })
                },
                $transaction: async (ops) => Promise.all(ops)
            };

            const events = [
                {
                    statusCode: 'DF',
                    status: 'in_transit',
                    description: 'Departed facility',
                    timestamp: '2026-05-01T11:00:00.000Z',
                    location: 'Airport Hub'
                }
            ];

            // First call -> creates record
            const firstRunCount = await persistTrackingEvents(mockPrisma, 'ship-202', events, 'DGR');
            expect(firstRunCount).toBe(1);
            expect(persistedEvents.size).toBe(1);
            const firstRecord = Array.from(persistedEvents.values())[0];
            expect(firstRecord._action).toBe('CREATE');

            // Second call with same event -> updates without collision
            const secondRunCount = await persistTrackingEvents(mockPrisma, 'ship-202', events, 'DGR');
            expect(secondRunCount).toBe(1);
            expect(persistedEvents.size).toBe(1);
            const secondRecord = Array.from(persistedEvents.values())[0];
            expect(secondRecord._action).toBe('UPDATE');
        });

        test('persistTrackingEvents supports both (client, id, events, provider) and (shipment, tracking, events, provider)', async () => {
            const recordedCalls = [];
            const mockPrisma = {
                shipmentTrackingEvent: {
                    upsert: jest.fn().mockImplementation((args) => {
                        recordedCalls.push(args);
                        return Promise.resolve(args);
                    })
                }
            };

            const event = [{
                statusCode: 'OK',
                status: 'delivered',
                description: 'Delivered to recipient',
                timestamp: '2026-05-01T15:00:00.000Z',
                location: 'Kuwait City'
            }];

            // Signature 1: (client, shipmentId, events, provider)
            await persistTrackingEvents(mockPrisma, 'shp-sig1', event, 'CARRIER');
            expect(recordedCalls[0].where.shipmentId_eventKey.shipmentId).toBe('shp-sig1');

            // Signature 2: (client, shipmentObject, events, provider)
            await persistTrackingEvents(mockPrisma, { id: 'shp-sig2', carrierCode: 'OTE' }, event, 'OTE');
            expect(recordedCalls[1].where.shipmentId_eventKey.shipmentId).toBe('shp-sig2');
            expect(recordedCalls[1].create.carrierCode).toBe('OTE');
        });

        test('updateShipmentLocation repeated calls with identical timestamp and payload generate identical eventKey', async () => {
            const upsertArgsList = [];
            prisma.shipmentTrackingEvent = {
                upsert: jest.fn().mockImplementation(async (args) => {
                    upsertArgsList.push(args);
                    return args;
                })
            };

            prisma.shipment = {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ship-idem-1',
                    trackingNumber: 'TRK-IDEM-1',
                    status: 'in_transit',
                    carrierCode: 'DGR',
                    assignedDriverId: 'driver-1',
                    currentLocation: { formattedAddress: 'Hub A', longitude: 48.0, latitude: 29.0 },
                    history: []
                }),
                update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'ship-idem-1', ...data }))
            };

            const fixedTimestamp = '2026-05-01T10:30:00.000Z';
            const req = {
                params: { trackingNumber: 'TRK-IDEM-1' },
                user: { id: 'driver-1', role: 'driver' },
                body: {
                    coordinates: [48.01, 29.01],
                    address: 'Checkpoint Station 1',
                    status: 'in_transit',
                    description: 'En route scan',
                    timestamp: fixedTimestamp
                }
            };

            const makeRes = () => {
                let code;
                let body;
                return {
                    status: (c) => { code = c; return { json: (b) => { body = b; } }; },
                    getCode: () => code,
                    getBody: () => body
                };
            };

            // Call 1
            const res1 = makeRes();
            await updateShipmentLocation(req, res1);
            expect(res1.getCode()).toBe(200);

            // Call 2
            const res2 = makeRes();
            await updateShipmentLocation(req, res2);
            expect(res2.getCode()).toBe(200);

            expect(upsertArgsList).toHaveLength(2);
            const key1 = upsertArgsList[0].where.shipmentId_eventKey.eventKey;
            const key2 = upsertArgsList[1].where.shipmentId_eventKey.eventKey;
            expect(key1).toBe(key2);
        });
    });
});
