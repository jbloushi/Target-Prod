const crypto = require('crypto');
const { createMockRes } = require('../testUtils');

describe('Milestone 3 Empirical Challenge & Stress Test Suite', () => {

    // =========================================================================
    // 1. Feature F8: Manual Carrier Pricing & Shipping Access Stress Testing
    // =========================================================================
    describe('1. Manual Carrier Access & Pricing Edge Cases (F8)', () => {
        const {
            normalizeShippingAccess,
            getServiceOptions,
            getServiceName,
            assertRequestedAccessAllowed
        } = require('../src/services/shippingAccess.service');

        it('normalizes lowercase mode "manual" and carrierCode "manual"', () => {
            const res1 = normalizeShippingAccess({ mode: 'manual' });
            expect(res1).toEqual({
                mode: 'manual',
                carrierCode: 'MANUAL',
                serviceCode: null,
                serviceName: 'Manual Shipment'
            });

            const res2 = normalizeShippingAccess({ carrierCode: 'manual' });
            expect(res2).toEqual({
                mode: 'manual',
                carrierCode: 'MANUAL',
                serviceCode: null,
                serviceName: 'Manual Shipment'
            });

            const res3 = normalizeShippingAccess({ preferredCarrier: 'MANUAL' });
            expect(res3).toEqual({
                mode: 'manual',
                carrierCode: 'MANUAL',
                serviceCode: null,
                serviceName: 'Manual Shipment'
            });
        });

        it('returns proper service options and names for MANUAL carrier', () => {
            expect(getServiceOptions('MANUAL')).toEqual([
                { serviceCode: null, serviceName: 'Manual Shipment' }
            ]);
            expect(getServiceOptions('manual')).toEqual([
                { serviceCode: null, serviceName: 'Manual Shipment' }
            ]);
            expect(getServiceName('MANUAL', null)).toBe('Manual Shipment');
            expect(getServiceName('MANUAL', 'STD')).toBe('Manual Shipment');
        });

        it('strictly rejects any carrier service code requested for manual shipments', () => {
            const assigned = normalizeShippingAccess({ mode: 'manual' });

            const invalidCodes = ['EXPRESS', 'STD', 'P', 'Y', 'OVERNIGHT', 'SAMEDAY'];
            invalidCodes.forEach(code => {
                expect(() => assertRequestedAccessAllowed(assigned, { serviceCode: code }))
                    .toThrow(/does not allow/i);
            });
        });

        it('permits manual shipment requests with null or undefined service code', () => {
            const assigned = normalizeShippingAccess({ mode: 'manual' });
            expect(() => assertRequestedAccessAllowed(assigned, {})).not.toThrow();
            expect(() => assertRequestedAccessAllowed(assigned, { serviceCode: null })).not.toThrow();
            expect(() => assertRequestedAccessAllowed(assigned, { serviceCode: undefined })).not.toThrow();
        });
    });

    // =========================================================================
    // 2. Feature F10: RBAC Guards & Webhook Security
    // =========================================================================
    describe('2. RBAC Guards & Webhook Security (F10)', () => {
        let prisma;
        let ShipmentDraftService;

        beforeEach(() => {
            jest.resetModules();
            prisma = {
                user: { findUnique: jest.fn() },
                shipment: { create: jest.fn() }
            };
            jest.doMock('../src/config/database', () => ({ prisma }));
            ShipmentDraftService = require('../src/services/ShipmentDraftService');
        });

        it('strictly rejects driver role from creating draft shipments (HTTP 403)', async () => {
            const driver = { id: 'drv-99', role: 'driver', name: 'Delivery Driver' };
            await expect(ShipmentDraftService.createDraft({ origin: {}, destination: {} }, driver))
                .rejects
                .toMatchObject({
                    statusCode: 403,
                    message: expect.stringMatching(/not authorized to create shipments/i)
                });
            expect(prisma.shipment.create).not.toHaveBeenCalled();
        });

        it('rejects unknown or unauthorized role without CREATE_SHIPMENTS (HTTP 403)', async () => {
            const guest = { id: 'gst-1', role: 'guest_observer', name: 'Guest' };
            await expect(ShipmentDraftService.createDraft({ origin: {}, destination: {} }, guest))
                .rejects
                .toMatchObject({
                    statusCode: 403,
                    message: expect.stringMatching(/not authorized to create shipments/i)
                });
        });

        it('rejects client attempting to create draft for another unauthorized user (HTTP 403)', async () => {
            const clientUser = { id: 'client-1', role: 'client', name: 'Client A' };
            const otherUser = { id: 'client-2', role: 'client', name: 'Client B', organization: { id: 'org-2' } };

            prisma.user.findUnique.mockResolvedValue(otherUser);

            await expect(ShipmentDraftService.createDraft({ userId: 'client-2', origin: {}, destination: {} }, clientUser))
                .rejects
                .toMatchObject({
                    statusCode: 403,
                    message: expect.stringMatching(/not authorized to create shipments for this user/i)
                });
        });

        describe('Webhook fail-closed authentication', () => {
            let integrationController;
            let config;

            beforeEach(() => {
                jest.resetModules();
                config = require('../src/config/config');
            });

            it('LogesTechs webhook fails closed (401) when secret is missing and ENFORCE_WEBHOOK_SECRETS is set', async () => {
                process.env.ENFORCE_WEBHOOK_SECRETS = 'true';
                config.logesTechsWebhookSecret = null;
                integrationController = require('../src/controllers/integration.controller');

                const req = { headers: {}, body: { packageId: 'PKG-1' } };
                const res = createMockRes();

                await integrationController.handleLogesTechsWebhook(req, res);
                expect(res.status).toHaveBeenCalledWith(401);
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                    ok: false,
                    error: expect.stringMatching(/secret/i)
                }));

                delete process.env.ENFORCE_WEBHOOK_SECRETS;
            });

            it('Chatwoot webhook fails closed (401) when webhookSecret is missing and ENFORCE_WEBHOOK_SECRETS is set', async () => {
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

            it('Chatwoot webhook rejects invalid HMAC signature (401)', async () => {
                config.chatwoot = { webhookSecret: 'super-secret-cw' };
                integrationController = require('../src/controllers/integration.controller');

                const rawBody = JSON.stringify({ event: 'message_created' });
                const req = {
                    headers: { 'x-chatwoot-signature': 'invalid-hex-signature-here' },
                    rawBody,
                    body: JSON.parse(rawBody)
                };
                const res = createMockRes();

                await integrationController.handleChatwootWebhook(req, res);
                expect(res.status).toHaveBeenCalledWith(401);
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                    ok: false,
                    error: 'Invalid webhook signature'
                }));
            });

            it('Chatwoot webhook accepts valid HMAC signature (200)', async () => {
                const secret = 'chatwoot-production-hmac-key';
                config.chatwoot = { webhookSecret: secret };
                integrationController = require('../src/controllers/integration.controller');

                const rawBody = JSON.stringify({ event: 'message_created', id: 'msg-99' });
                const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

                const req = {
                    headers: { 'x-chatwoot-signature': signature },
                    rawBody,
                    body: JSON.parse(rawBody)
                };
                const res = createMockRes();

                await integrationController.handleChatwootWebhook(req, res);
                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
            });
        });
    });

    // =========================================================================
    // 3. Feature F11: Mandatory Idempotency Middleware Stress Testing
    // =========================================================================
    describe('3. Idempotency Middleware Stress & Concurrency Testing (F11)', () => {
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

        it('rejects missing, empty, and whitespace-only Idempotency-Key with 400', async () => {
            process.env.ENFORCE_IDEMPOTENCY = 'true';
            const { requireIdempotency } = idempotencyModule;

            const badHeaders = [
                {},
                { 'idempotency-key': '' },
                { 'idempotency-key': '   ' },
                { 'idempotency-key': '\t\n' }
            ];

            for (const headers of badHeaders) {
                const req = { headers, user: { id: 'u1' } };
                const res = createMockRes();
                const next = jest.fn();

                await requireIdempotency(req, res, next);
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                    success: false,
                    error: expect.stringMatching(/Idempotency-Key header is required/i)
                }));
                expect(next).not.toHaveBeenCalled();
            }

            delete process.env.ENFORCE_IDEMPOTENCY;
        });

        it('locks concurrent requests with 409 Conflict when key is in PROCESSING state', async () => {
            const { requireIdempotency } = idempotencyModule;
            const req = {
                headers: { 'idempotency-key': 'in-flight-key-100' },
                user: { id: 'u-1' }
            };
            const res = createMockRes();
            const next = jest.fn();

            prisma.idempotencyKey.findUnique.mockResolvedValue({
                key: 'u-1:in-flight-key-100',
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

        it('handles Prisma P2002 race condition on concurrent key insertion and returns 409', async () => {
            const { requireIdempotency } = idempotencyModule;
            const req = {
                headers: { 'idempotency-key': 'race-condition-key' },
                user: { id: 'u-1' }
            };
            const res = createMockRes();
            const next = jest.fn();

            prisma.idempotencyKey.findUnique.mockResolvedValue(null);
            const p2002Error = new Error('Unique constraint failed on the fields: (`key`)');
            p2002Error.code = 'P2002';
            prisma.idempotencyKey.create.mockRejectedValue(p2002Error);

            await requireIdempotency(req, res, next);
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.stringMatching(/currently being processed/i)
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('replays cached response without calling downstream handlers when key is COMPLETED', async () => {
            const { requireIdempotency } = idempotencyModule;
            const req = {
                headers: { 'idempotency-key': 'completed-key-200' },
                user: { id: 'u-1' }
            };
            const res = createMockRes();
            const next = jest.fn();

            const cachedBody = { success: true, bookingId: 'BK-12345', trackingNumber: 'TRK-987' };
            prisma.idempotencyKey.findUnique.mockResolvedValue({
                key: 'u-1:completed-key-200',
                status: 'COMPLETED',
                responseStatus: 201,
                responseBody: cachedBody
            });

            await requireIdempotency(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(cachedBody);
            expect(next).not.toHaveBeenCalled();
        });

        it('namespaces keys per user to prevent cross-tenant collision', async () => {
            const { requireIdempotency } = idempotencyModule;
            const keyString = 'shared-key-uuid';

            // User 1
            const req1 = { headers: { 'idempotency-key': keyString }, user: { id: 'user-aaa' } };
            const res1 = createMockRes();
            const next1 = jest.fn();
            prisma.idempotencyKey.findUnique.mockResolvedValue(null);
            prisma.idempotencyKey.create.mockResolvedValue({});

            await requireIdempotency(req1, res1, next1);
            expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    key: 'user-aaa:shared-key-uuid',
                    status: 'PROCESSING'
                })
            }));

            // User 2 with identical key string
            const req2 = { headers: { 'idempotency-key': keyString }, user: { id: 'user-bbb' } };
            const res2 = createMockRes();
            const next2 = jest.fn();

            await requireIdempotency(req2, res2, next2);
            expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    key: 'user-bbb:shared-key-uuid',
                    status: 'PROCESSING'
                })
            }));
        });
    });

    // =========================================================================
    // 4. Feature F12: Stored XSS Mitigation Adversarial Payloads
    // =========================================================================
    describe('4. Stored XSS Mitigation Adversarial Payloads (F12)', () => {
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

        it('sanitizes aggressive adversarial injection payloads across all fields in generateLabel', async () => {
            const maliciousPayloads = {
                id: 'shipment-xss-adv',
                trackingNumber: 'TRK-"><script>alert("xss")</script><svg onload=alert(1)>',
                status: 'booked',
                origin: {
                    contactPerson: '<script>alert("origin_contact")</script>',
                    company: '"><img src=x onerror=alert("origin_company")><script>evil()</script>',
                    formattedAddress: '<b onmouseover="alert(\'address\')">Main Rd</b><iframe src="javascript:alert(1)"></iframe>',
                    city: 'Kuwait City";alert(1);//',
                    countryCode: '<script>alert("KW")</script>',
                    phone: '"><script>alert("phone")</script>'
                },
                destination: {
                    contactPerson: '<a href="javascript:alert(\'dest_contact\')">Click</a>',
                    company: '</title><script>alert("dest_company")</script>',
                    formattedAddress: '<body onload=alert(1)>Nested</b>',
                    city: '<<SCRIPT>alert("nested");//<</SCRIPT>',
                    countryCode: 'AE" onfocus="alert(1)" autofocus="',
                    phone: '12345678\';alert(1)//'
                },
                items: [{ weight: 2.5 }],
                createdAt: new Date('2026-01-01')
            };

            prisma.shipment.findUnique.mockResolvedValue(maliciousPayloads);

            const req = {
                params: { trackingNumber: maliciousPayloads.trackingNumber },
                user: { id: 'admin-1', role: 'admin' }
            };
            let renderedHtml = '';
            const res = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn((html) => { renderedHtml = html; })
            };

            await shipmentOpsController.generateLabel(req, res);

            expect(res.send).toHaveBeenCalled();

            // 1. Critical Assertion: NO unescaped executable HTML tags exist
            expect(renderedHtml).not.toContain('<script>');
            expect(renderedHtml).not.toContain('</script>');
            expect(renderedHtml).not.toContain('<script');
            expect(renderedHtml).not.toContain('<img src=x');
            expect(renderedHtml).not.toContain('<svg onload=');
            expect(renderedHtml).not.toContain('<iframe');
            expect(renderedHtml).not.toContain('<body onload=');

            // 2. Critical Assertion: All special characters are HTML-entity encoded
            expect(renderedHtml).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
            expect(renderedHtml).toContain('&lt;img src=x onerror=alert(&quot;origin_company&quot;)&gt;');
            expect(renderedHtml).toContain('&lt;b onmouseover=&quot;alert(&#39;address&#39;)&quot;&gt;');
            expect(renderedHtml).toContain('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;/iframe&gt;');
            expect(renderedHtml).toContain('&lt;/title&gt;&lt;script&gt;');
        });

        it('handles null, undefined, and non-string fields safely without crashing', async () => {
            const emptyShipment = {
                id: 'shipment-empty',
                trackingNumber: 'TRK-EMPTY-001',
                status: null,
                origin: null,
                destination: undefined,
                items: null,
                createdAt: null
            };

            prisma.shipment.findUnique.mockResolvedValue(emptyShipment);

            const req = {
                params: { trackingNumber: 'TRK-EMPTY-001' },
                user: { id: 'admin-1', role: 'admin' }
            };
            let renderedHtml = '';
            const res = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn((html) => { renderedHtml = html; })
            };

            await shipmentOpsController.generateLabel(req, res);

            expect(res.send).toHaveBeenCalled();
            expect(renderedHtml).toContain('TN: TRK-EMPTY-001');
            expect(renderedHtml).toContain('N/A');
        });
    });
});
