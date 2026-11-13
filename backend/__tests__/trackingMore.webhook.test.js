const crypto = require('crypto');
const { createMockRes } = require('../testUtils');

jest.mock('../src/utils/logger', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
}));

jest.mock('../src/services/chatwootNotificationService', () => ({
    mapStatusToNotificationEvent: jest.fn((status) => {
        if (status === 'delivered') return 'SHIPMENT_DELIVERED';
        if (status === 'out_for_delivery') return 'OUT_FOR_DELIVERY';
        if (status === 'exception') return 'SHIPMENT_EXCEPTION';
        return null;
    }),
    triggerShipmentNotification: jest.fn()
}));

describe('TrackingMore Webhook Security & Idempotency', () => {
    let integrationController;
    let chatwootNotificationService;
    let prisma;

    const mockShipment = {
        id: 'ship-fedex-1',
        trackingNumber: 'TRK-FEDEX-999',
        carrierCode: 'FEDEX',
        carrierShipmentId: '772991823',
        dhlTrackingNumber: '772991823',
        status: 'in_transit',
        history: [
            {
                status: 'in_transit',
                source: 'carrier',
                description: 'Departed FedEx location',
                timestamp: '2026-10-15T10:00:00.000Z',
                location: { formattedAddress: 'MEMPHIS, TN, US' }
            }
        ],
        documents: {},
        pricingSnapshot: { carrierWeight: 2.5, carrierPieces: 1 }
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        prisma = {
            shipment: {
                findFirst: jest.fn().mockResolvedValue({ ...mockShipment }),
                update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockShipment, ...data }))
            },
            shipmentTrackingEvent: {
                findMany: jest.fn().mockResolvedValue([]),
                upsert: jest.fn().mockResolvedValue({ id: 'evt-1' })
            },
            $transaction: jest.fn().mockImplementation(async (ops) => Promise.all(ops))
        };

        jest.doMock('../src/config/database', () => ({ prisma }));
        integrationController = require('../src/controllers/integration.controller');
        chatwootNotificationService = require('../src/services/chatwootNotificationService');
    });

    afterEach(() => {
        delete process.env.TRACKINGMORE_WEBHOOK_SECRET;
        delete process.env.ENFORCE_WEBHOOK_SECRETS;
    });

    describe('Security: Signature & Secret Verification', () => {
        const secret = 'super-secret-key-123';
        const payloadObj = {
            event: 'tracking_update',
            data: {
                tracking_number: 'TRK-FEDEX-999',
                delivery_status: 'delivered',
                origin_info: {
                    trackinfo: [
                        {
                            checkpoint_date: '2026-10-16T14:30:00Z',
                            checkpoint_delivery_status: 'delivered',
                            tracking_detail: 'Delivered to recipient front door',
                            location: 'DUBAI, AE'
                        }
                    ]
                }
            }
        };
        const rawBodyStr = JSON.stringify(payloadObj);

        beforeEach(() => {
            process.env.TRACKINGMORE_WEBHOOK_SECRET = secret;
        });

        it('rejects with 401 when secret is configured but no signature or secret header is provided', async () => {
            const req = {
                headers: {},
                body: payloadObj,
                rawBody: Buffer.from(rawBodyStr)
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.stringMatching(/Unauthorized/)
            }));
            expect(prisma.shipment.update).not.toHaveBeenCalled();
        });

        it('rejects with 401 when signature HMAC does not match', async () => {
            const req = {
                headers: {
                    'trackingmore-signature': 'bad-signature-hex-123'
                },
                body: payloadObj,
                rawBody: Buffer.from(rawBodyStr)
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(prisma.shipment.update).not.toHaveBeenCalled();
        });

        it('accepts with 200 when valid HMAC signature is provided in official trackingmore-signature header using req.rawBody', async () => {
            const validHmac = crypto.createHmac('sha256', secret).update(rawBodyStr).digest('hex');
            const req = {
                headers: {
                    'trackingmore-signature': validHmac
                },
                body: payloadObj,
                rawBody: Buffer.from(rawBodyStr)
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
            expect(prisma.shipment.update).toHaveBeenCalled();
        });

        it('accepts with 200 when valid HMAC signature is provided in x-trackingmore-signature', async () => {
            const validHmac = crypto.createHmac('sha256', secret).update(rawBodyStr).digest('hex');
            const req = {
                headers: {
                    'x-trackingmore-signature': validHmac
                },
                body: payloadObj,
                rawBody: Buffer.from(rawBodyStr)
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(prisma.shipment.update).toHaveBeenCalled();
        });

        it('accepts with 200 when direct secret is provided in x-webhook-secret', async () => {
            const req = {
                headers: {
                    'x-webhook-secret': secret
                },
                body: payloadObj,
                rawBody: Buffer.from(rawBodyStr)
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(prisma.shipment.update).toHaveBeenCalled();
        });

        it('accepts with 200 when direct secret is provided in query parameter ?secret=...', async () => {
            const req = {
                headers: {},
                query: { secret },
                body: payloadObj,
                rawBody: Buffer.from(rawBodyStr)
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(prisma.shipment.update).toHaveBeenCalled();
        });
    });

    describe('Idempotency & Deduplication', () => {
        const payloadObj = {
            event: 'tracking_update',
            data: {
                tracking_number: 'TRK-FEDEX-999',
                delivery_status: 'in_transit',
                origin_info: {
                    trackinfo: [
                        {
                            checkpoint_date: '2026-10-15T10:00:00.000Z',
                            checkpoint_delivery_status: 'in_transit',
                            tracking_detail: 'Departed FedEx location',
                            location: 'MEMPHIS, TN, US'
                        }
                    ]
                }
            }
        };

        it('skips database update and notification when duplicate delivery arrives with identical checkpoints and status', async () => {
            const req = {
                headers: {},
                body: payloadObj,
                rawBody: Buffer.from(JSON.stringify(payloadObj))
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
            expect(prisma.shipment.update).not.toHaveBeenCalled();
            expect(chatwootNotificationService.triggerShipmentNotification).not.toHaveBeenCalled();
        });

        it('updates database and triggers notification when a genuinely new checkpoint changes status', async () => {
            const newPayload = {
                event: 'tracking_update',
                data: {
                    tracking_number: 'TRK-FEDEX-999',
                    delivery_status: 'delivered',
                    origin_info: {
                        trackinfo: [
                            {
                                checkpoint_date: '2026-10-16T15:00:00.000Z',
                                checkpoint_delivery_status: 'delivered',
                                tracking_detail: 'Delivered to front porch',
                                location: 'DUBAI, AE'
                            }
                        ]
                    }
                }
            };
            const req = {
                headers: {},
                body: newPayload,
                rawBody: Buffer.from(JSON.stringify(newPayload))
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'ship-fedex-1' },
                data: expect.objectContaining({
                    status: 'delivered'
                })
            }));
            expect(chatwootNotificationService.triggerShipmentNotification).toHaveBeenCalledWith(
                'SHIPMENT_DELIVERED',
                expect.any(Object)
            );
        });
    });

    describe('False-Positive Elimination & Terminal Invariant', () => {
        it('never promotes to delivered when checkpoint description is "Undelivered - delivery attempt failed"', async () => {
            const exceptionPayload = {
                event: 'tracking_update',
                data: {
                    tracking_number: 'TRK-FEDEX-999',
                    delivery_status: 'exception',
                    origin_info: {
                        trackinfo: [
                            {
                                checkpoint_date: '2026-10-16T12:00:00.000Z',
                                checkpoint_delivery_status: 'undelivered',
                                tracking_detail: 'Undelivered - Customer premises closed, delivery attempt failed',
                                location: 'KUWAIT CITY, KW'
                            }
                        ]
                    }
                }
            };
            const req = {
                headers: {},
                body: exceptionPayload,
                rawBody: Buffer.from(JSON.stringify(exceptionPayload))
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'ship-fedex-1' },
                data: expect.objectContaining({
                    status: 'exception'
                })
            }));
            expect(chatwootNotificationService.triggerShipmentNotification).toHaveBeenCalledWith(
                'SHIPMENT_EXCEPTION',
                expect.any(Object)
            );
        });

        it('never regresses terminal delivered status on out-of-order in_transit checkpoint', async () => {
            prisma.shipment.findFirst.mockResolvedValueOnce({
                ...mockShipment,
                status: 'delivered'
            });

            const stalePayload = {
                event: 'tracking_update',
                data: {
                    tracking_number: 'TRK-FEDEX-999',
                    delivery_status: 'in_transit',
                    origin_info: {
                        trackinfo: [
                            {
                                checkpoint_date: '2026-10-15T08:00:00.000Z',
                                checkpoint_delivery_status: 'in_transit',
                                tracking_detail: 'In transit at hub',
                                location: 'MEMPHIS, TN, US'
                            }
                        ]
                    }
                }
            };
            const req = {
                headers: {},
                body: stalePayload,
                rawBody: Buffer.from(JSON.stringify(stalePayload))
            };
            const res = createMockRes();

            await integrationController.handleTrackingMoreWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            if (prisma.shipment.update.mock.calls.length > 0) {
                expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                    where: { id: 'ship-fedex-1' },
                    data: expect.objectContaining({
                        status: 'delivered' // Remained delivered!
                    })
                }));
            }
        });
    });
});

describe('DHL Web Scraper Service Fallback & Code Parsing', () => {
    const dhlWebScraper = require('../src/services/dhlWebScraper.service');
    const DgrAdapter = require('../src/adapters/DgrAdapter');
    const axios = require('axios');

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('scrapes public DHL tracking payload and maps checkpoint codes, pieces, and weight', async () => {
        const mockPayload = {
            shipments: [{
                id: '1234567895',
                status: { statusCode: 'transit', description: 'With delivery courier' },
                details: { weight: 8.75, pieces: 4 },
                events: [
                    {
                        statusCode: 'PU',
                        description: 'Shipment picked up',
                        date: '2026-10-15',
                        time: '09:00:00',
                        gmtOffset: '+03:00'
                    },
                    {
                        statusCode: 'WC',
                        description: 'With delivery courier',
                        timestampWithOffset: '2026-10-16T08:30:00+03:00'
                    }
                ]
            }]
        };

        jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockPayload });

        const result = await dhlWebScraper.scrapeDhl('1234567895');

        expect(result.carrierCode).toBe('DGR');
        expect(result.status).toBe('out_for_delivery');
        expect(result.carrierWeight).toBe(8.75);
        expect(result.carrierPieces).toBe(4);
        expect(result.events).toHaveLength(2);
        expect(result.events[0].statusCode).toBe('WC');
        expect(result.events[0].localTimestamp).toBe('2026-10-16T08:30:00+03:00');
    });

    it('collapses minute jitter in scraped events', async () => {
        const mockPayload = {
            shipments: [{
                id: '1234567896',
                events: [
                    { statusCode: 'AF', description: 'Arrived facility', date: '2026-10-15', time: '10:00:10', gmtOffset: '+03:00' },
                    { statusCode: 'AF', description: 'Arrived facility', date: '2026-10-15', time: '10:00:40', gmtOffset: '+03:00' }
                ]
            }]
        };

        jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockPayload });

        const result = await dhlWebScraper.scrapeDhl('1234567896');
        expect(result.events).toHaveLength(1);
    });

    it('recovers via scraper fallback when DgrAdapter official API returns 401', async () => {
        const adapter = new DgrAdapter({ apiKey: 'k', apiSecret: 's', accountNumber: '123', isTest: true });

        const err401 = new Error('Request failed with status code 401');
        err401.response = { status: 401, data: { detail: 'The incoming token has expired' } };

        jest.spyOn(axios, 'get')
            .mockRejectedValueOnce(err401) // official API call fails
            .mockResolvedValueOnce({       // scraper fallback succeeds
                data: {
                    shipments: [{
                        id: '1234567897',
                        status: { statusCode: 'delivered', description: 'Delivered to recipient' },
                        events: [{ statusCode: 'OK', description: 'Delivered', date: '2026-10-16', time: '14:00:00', gmtOffset: '+03:00' }]
                    }]
                }
            });

        const tracking = await adapter.getTracking('1234567897');
        expect(tracking.status).toBe('delivered');
        expect(tracking.source).toBe('scraper');
        expect(tracking.events).toHaveLength(1);
        expect(tracking.events[0].statusCode).toBe('OK');
    });
});

describe('LogesTechs Dual Barcode / ID Lookup', () => {
    const LogesTechsAdapter = require('../src/adapters/LogesTechsAdapter');

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('seamlessly falls back to ID lookup when barcode lookup throws for numeric trackingNumber', async () => {
        const adapter = new LogesTechsAdapter({ isTest: true });

        jest.spyOn(adapter, 'getStatus').mockImplementation(async (opts) => {
            if (opts.barcode === '45268816') {
                const err = new Error('Package not found at provider yet');
                err.response = { status: 404, data: { message: 'Package not found' } };
                throw err;
            }
            if (opts.id === '45268816') {
                return {
                    status: 'Delivered',
                    enStatus: 'Delivered',
                    lastStatusDate: '2026-10-15T12:00:00Z',
                    destinationCity: 'Kuwait City'
                };
            }
            throw new Error('Unknown param');
        });

        const tracking = await adapter.getTracking('45268816');
        expect(tracking.status).toBe('Delivered');
        expect(tracking.events).toHaveLength(1);
        expect(tracking.events[0].location).toBe('Kuwait City');
    });
});

describe('Status Normalizer Word Boundary & Precedence', () => {
    const uts = require('../src/services/UniversalTrackingService');
    const fws = require('../src/services/FreeWebScraperService');

    it('does not map "assigned by dispatcher" to delivered in UTS or FWS', () => {
        expect(uts._mapTrackingMoreStatus('in_transit', 'assigned by dispatcher')).not.toBe('delivered');
        expect(fws._mapStatus('assigned by dispatcher')).not.toBe('delivered');
    });

    it('does not map "carton received" to returned in UTS or FWS', () => {
        expect(uts._mapTrackingMoreStatus('in_transit', 'carton received at facility')).not.toBe('returned');
        expect(fws._mapStatus('carton received at facility')).not.toBe('returned');
    });

    it('evaluates exception and negative phrases prior to positive milestones', () => {
        expect(uts._mapTrackingMoreStatus('transit', 'Consignee premises closed')).toBe('exception');
        expect(uts._mapTrackingMoreStatus('transit', 'Undelivered: package damaged')).toBe('exception');
        expect(fws._mapStatus('Consignee premises closed')).toBe('exception');
        expect(fws._mapStatus('Delivery attempt failed')).toBe('exception');
    });
});
