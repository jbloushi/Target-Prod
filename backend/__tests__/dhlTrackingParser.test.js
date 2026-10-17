/**
 * DHL Tracking Parser & Checkpoint Code Verification Test Suite
 *
 * Verifies:
 * 1. DHL 2-letter checkpoint codes (OK, DF, PU, AF, PL, WC, CC, BA, NH, OH, FD, RT)
 * 2. Local timestamp parsing, UTC normalization, and timezone offsets
 * 3. Weight and piece count extraction from MyDHL API payloads
 * 4. Minute-bucket checkpoint deduplication
 * 5. Malformed JSON/HTML error resilience and exception handling
 */

const DgrAdapter = require('../src/adapters/DgrAdapter');
const {
    normalizeStatus,
    normalizeCarrierStatus,
    DHL_CHECKPOINT_MAP
} = require('../src/constants/statusConstants');

describe('DHL Tracking Parser & Checkpoint Codes', () => {
    describe('1. DHL 2-Letter Checkpoint Code Normalization', () => {
        const testCases = [
            { code: 'OK', expected: 'delivered', description: 'Proof of Delivery / Consignment Delivered' },
            { code: 'DF', expected: 'in_transit', description: 'Delivery Facility processing' },
            { code: 'PU', expected: 'picked_up', description: 'Shipment picked up by courier' },
            { code: 'AF', expected: 'received_at_hub', description: 'Arrived at DHL facility' },
            { code: 'PL', expected: 'in_transit', description: 'Processed at location' },
            { code: 'WC', expected: 'out_for_delivery', description: 'With courier for delivery' },
            { code: 'CC', expected: 'in_transit', description: 'Customs clearance processing' },
            { code: 'BA', expected: 'exception', description: 'Bad address hold' },
            { code: 'NH', expected: 'exception', description: 'Consignee not at home' },
            { code: 'OH', expected: 'exception', description: 'Shipment on operational hold' },
            { code: 'FD', expected: 'exception', description: 'Failed delivery attempt' },
            { code: 'RT', expected: 'returned', description: 'Returned to shipper / RTO' },
        ];

        testCases.forEach(({ code, expected, description }) => {
            it(`correctly maps checkpoint code ${code} (${description}) to '${expected}'`, () => {
                // Direct map check
                expect(DHL_CHECKPOINT_MAP[code.toLowerCase()]).toBe(expected);

                // Normalization via normalizeStatus (case-insensitive)
                expect(normalizeStatus(code)).toBe(expected);
                expect(normalizeStatus(code.toLowerCase())).toBe(expected);

                // Carrier-aware normalizer with code priority
                expect(normalizeCarrierStatus('Carrier scan', 'DGR', code)).toBe(expected);
                expect(normalizeCarrierStatus('Carrier scan', 'DHL', code)).toBe(expected);
            });
        });

        it('ensures DHL checkpoint code priority overrides ambiguous descriptive text', () => {
            // "OK" delivered scan even if description mentions facility or operations
            expect(normalizeCarrierStatus('Consignment at operations gateway', 'DGR', 'OK')).toBe('delivered');

            // "WC" out for delivery even if description mentions arrival
            expect(normalizeCarrierStatus('Arrived at delivery area', 'DGR', 'WC')).toBe('out_for_delivery');

            // "BA" Bad Address exception even if description mentions recipient
            expect(normalizeCarrierStatus('Delivery contact attempted with recipient', 'DGR', 'BA')).toBe('exception');

            // "FD" Failed Delivery attempt even if description contains "delivery"
            expect(normalizeCarrierStatus('Delivery attempted at 14:30', 'DGR', 'FD')).toBe('exception');
        });
    });

    describe('2. Local Timestamp Parsing & Timezone Offsets', () => {
        const { extractTrackingTimestamp } = DgrAdapter;

        it('extracts localTimestamp and timezoneOffset from ISO timestampWithOffset string', () => {
            const event = {
                timestampWithOffset: '2026-10-15T14:30:00+03:00',
                timezoneOffset: '+03:00'
            };
            const result = extractTrackingTimestamp(event);

            expect(result.localTimestamp).toBe('2026-10-15T14:30:00+03:00');
            expect(result.timezoneOffset).toBe('+03:00');
            expect(new Date(result.timestamp).toISOString()).toBe('2026-10-15T11:30:00.000Z');
        });

        it('extracts and combines discrete date, time, and gmtOffset fields', () => {
            const event = {
                date: '2026-05-10',
                time: '09:45:00',
                gmtOffset: '+04:00'
            };
            const result = extractTrackingTimestamp(event);

            expect(result.localTimestamp).toBe('2026-05-10T09:45:00+04:00');
            expect(result.timezoneOffset).toBe('+04:00');
            expect(new Date(result.timestamp).toISOString()).toBe('2026-05-10T05:45:00.000Z');
        });

        it('handles non-standard offset formats (e.g., GMT+3, +0300, UTC +03:00)', () => {
            const variations = [
                { offset: '+0300', expectedOffset: '+03:00' },
                { offset: 'GMT+3', expectedOffset: '+03:00' },
                { offset: 'UTC +03:00', expectedOffset: '+03:00' },
                { offset: '-05:00', expectedOffset: '-05:00' },
                { offset: '+00:00', expectedOffset: '+00:00' }
            ];

            variations.forEach(({ offset, expectedOffset }) => {
                const event = {
                    date: '2026-06-01',
                    time: '12:00:00',
                    gmtOffset: offset
                };
                const result = extractTrackingTimestamp(event);
                expect(result.timezoneOffset).toBe(expectedOffset);
            });
        });

        it('handles sub-second millisecond precision in time strings', () => {
            const event = {
                date: '2026-07-20',
                time: '16:15:30.450',
                gmtOffset: '+03:00'
            };
            const result = extractTrackingTimestamp(event);

            expect(result.localTimestamp).toBe('2026-07-20T16:15:30+03:00');
            expect(result.timezoneOffset).toBe('+03:00');
        });

        it('handles boundary timezones (-12:00 and +14:00)', () => {
            const bvaEvents = [
                { date: '2026-01-01', time: '00:00:00', gmtOffset: '+14:00' },
                { date: '2026-01-01', time: '23:59:59', gmtOffset: '-12:00' }
            ];

            const res1 = extractTrackingTimestamp(bvaEvents[0]);
            expect(res1.timezoneOffset).toBe('+14:00');
            expect(resultIsoValid(res1.timestamp)).toBe(true);

            const res2 = extractTrackingTimestamp(bvaEvents[1]);
            expect(res2.timezoneOffset).toBe('-12:00');
            expect(resultIsoValid(res2.timestamp)).toBe(true);
        });

        it('gracefully handles missing date and time fields by returning null', () => {
            const event = { location: 'Kuwait City' };
            const result = extractTrackingTimestamp(event);

            expect(result.timestamp).toBeNull();
            expect(result.localTimestamp).toBeNull();
            expect(result.timezoneOffset).toBe('');
        });
    });

    describe('3. Weight & Pieces Extraction in getTracking', () => {
        let adapter;

        beforeEach(() => {
            adapter = new DgrAdapter({
                apiKey: 'test-key',
                apiSecret: 'test-secret',
                accountNumber: '123456789',
                baseUrl: 'https://express.api.dhl.com/mydhlapi/test',
                isTest: true
            });
        });

        it('extracts carrierWeight and carrierPieces from shipment.details structure', async () => {
            const mockApiResponse = {
                shipments: [{
                    id: '1234567890',
                    status: { statusCode: 'transit', description: 'In Transit' },
                    details: {
                        weight: 4.85,
                        pieces: 2
                    },
                    events: [
                        {
                            statusCode: 'PL',
                            description: 'Processed at Facility',
                            date: '2026-04-10',
                            time: '10:00:00',
                            gmtOffset: '+03:00',
                            serviceArea: [{ description: 'KUWAIT-KW' }]
                        }
                    ]
                }]
            };

            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockApiResponse });

            const result = await adapter.getTracking('1234567890');

            expect(result.carrierWeight).toBe(4.85);
            expect(result.carrierPieces).toBe(2);
            expect(result.events).toHaveLength(1);
            expect(result.events[0].statusCode).toBe('PL');
            expect(result.events[0].location).toBe('KUWAIT-KW');

            axios.get.mockRestore();
        });

        it('falls back to root-level weight and numberOfPieces strings', async () => {
            const mockApiResponse = {
                shipments: [{
                    id: '1234567891',
                    status: { statusCode: 'delivered', description: 'Delivered' },
                    weight: '12.5',
                    numberOfPieces: '3',
                    events: [
                        {
                            statusCode: 'OK',
                            description: 'Delivered to recipient',
                            date: '2026-04-11',
                            time: '14:20:00',
                            gmtOffset: '+03:00',
                            serviceArea: [{ description: 'KUWAIT-KW' }]
                        }
                    ]
                }]
            };

            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockApiResponse });

            const result = await adapter.getTracking('1234567891');

            expect(result.carrierWeight).toBe(12.5);
            expect(result.carrierPieces).toBe(3);

            axios.get.mockRestore();
        });

        it('omits carrierWeight and carrierPieces when zero, negative, or missing', async () => {
            const mockApiResponse = {
                shipments: [{
                    id: '1234567892',
                    status: { statusCode: 'transit' },
                    details: { weight: 0, pieces: 0 },
                    events: [
                        {
                            statusCode: 'AF',
                            date: '2026-04-10',
                            time: '08:00:00',
                            gmtOffset: '+03:00'
                        }
                    ]
                }]
            };

            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockApiResponse });

            const result = await adapter.getTracking('1234567892');

            expect(result.carrierWeight).toBeUndefined();
            expect(result.carrierPieces).toBeUndefined();

            axios.get.mockRestore();
        });
    });

    describe('4. Deduplication of Identical Checkpoint Minute Jitter', () => {
        let adapter;

        beforeEach(() => {
            adapter = new DgrAdapter({
                apiKey: 'test-key',
                apiSecret: 'test-secret',
                accountNumber: '123456789',
                isTest: true
            });
        });

        it('collapses DHL scan events occurring within the same minute bucket at the same location', async () => {
            const mockApiResponse = {
                shipments: [{
                    id: '1234567893',
                    status: { statusCode: 'transit' },
                    events: [
                        // Duplicate scan within same minute bucket (10:00:15 vs 10:00:45)
                        {
                            statusCode: 'AF',
                            description: 'Arrived at DHL Sort Facility',
                            date: '2026-04-12',
                            time: '10:00:15',
                            gmtOffset: '+03:00',
                            serviceArea: [{ description: 'KUWAIT-KW' }]
                        },
                        {
                            statusCode: 'AF',
                            description: 'Arrived at DHL Sort Facility',
                            date: '2026-04-12',
                            time: '10:00:45',
                            gmtOffset: '+03:00',
                            serviceArea: [{ description: 'KUWAIT-KW' }]
                        },
                        // Distinct scan 15 minutes later
                        {
                            statusCode: 'PL',
                            description: 'Processed at KUWAIT-KW',
                            date: '2026-04-12',
                            time: '10:15:00',
                            gmtOffset: '+03:00',
                            serviceArea: [{ description: 'KUWAIT-KW' }]
                        }
                    ]
                }]
            };

            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockApiResponse });

            const result = await adapter.getTracking('1234567893');

            // 3 raw events -> 2 deduped events
            expect(result.events).toHaveLength(2);
            expect(result.events.map(e => e.statusCode)).toEqual(['PL', 'AF']);

            axios.get.mockRestore();
        });
    });

    describe('5. Malformed HTML / JSON Resilience', () => {
        let adapter;

        beforeEach(() => {
            adapter = new DgrAdapter({
                apiKey: 'test-key',
                apiSecret: 'test-secret',
                accountNumber: '123456789',
                isTest: true
            });
        });

        it('throws descriptive error when response contains empty shipments array', async () => {
            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: { shipments: [] } });

            await expect(adapter.getTracking('9999999999')).rejects.toThrow(
                'DHL Tracking Error: No tracking data found.'
            );

            axios.get.mockRestore();
        });

        it('handles carrier API 404 / 500 error responses with detail message', async () => {
            const axios = require('axios');
            const axiosError = new Error('Request failed with status code 404');
            axiosError.response = {
                status: 404,
                data: { detail: 'Shipment not found for tracking number 9999999999' }
            };
            jest.spyOn(axios, 'get').mockRejectedValueOnce(axiosError);

            await expect(adapter.getTracking('9999999999')).rejects.toThrow(
                'DHL Tracking Error: Shipment not found for tracking number 9999999999'
            );

            axios.get.mockRestore();
        });

        it('filters out events with missing or corrupted timestamp fields', async () => {
            const mockApiResponse = {
                shipments: [{
                    id: '1234567894',
                    status: { statusCode: 'transit' },
                    events: [
                        {
                            statusCode: 'AF',
                            description: 'Malformed scan without date or time'
                        },
                        {
                            statusCode: 'AF',
                            date: 'invalid-date-string',
                            time: 'not-a-time'
                        },
                        {
                            statusCode: 'PU',
                            description: 'Valid pickup scan',
                            date: '2026-04-12',
                            time: '09:00:00',
                            gmtOffset: '+03:00'
                        }
                    ]
                }]
            };

            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockApiResponse });

            const result = await adapter.getTracking('1234567894');

            // Only the valid scan survives
            expect(result.events).toHaveLength(1);
            expect(result.events[0].statusCode).toBe('PU');

            axios.get.mockRestore();
        });
    });
});

function resultIsoValid(str) {
    if (!str) return false;
    const d = new Date(str);
    return !Number.isNaN(d.getTime());
}
