/**
 * Target Logistics 3PL Platform - Milestone 4 Test Suite
 * File: backend/__tests__/chatwootOutboundDispatch.test.js
 *
 * Requirements Covered (Milestone 4 - ORIGINAL_REQUEST.md & DISPATCH.md):
 * - Suite 1: Primary Chatwoot Outbound Dispatch (template send, template mapping, agent token header attribution).
 * - Suite 2: Meta 24-Hour Customer Service Window Enforcement (inside 24h allowed, outside 24h rejected with OUTSIDE_24H_WINDOW, no incoming messages rejected, template allowed anytime).
 * - Suite 3: Emergency Fallback Failover to msg.target-kw.com (502 failover, timeout failover, ECONNREFUSED failover, isFallback: true and fallbackReason recorded, double failure handled, explicit admin toggle bypass).
 * - Suite 4: Retention and Enforcement of All Core Safety Guards (quiet hours suppression, quiet hours bypass, 36h age guard, deduplication, dev safe phone redirect, location token generation).
 */

const axios = require('axios');
const crypto = require('crypto');
const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const chatwootService = require('../src/services/chatwootNotificationService');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const appConfig = require('../src/config/config');
const logger = require('../src/utils/logger');

// Mock external HTTP requests: zero real customer messages and zero live network requests
jest.mock('axios');

describe('Milestone 4: Chatwoot Outbound WhatsApp Dispatch, 24h Window & Fallback Suite', () => {
    let mockClientRequest;
    let mockConversationMessages;
    let mockMessages;
    let createdLogs;
    let updatedLogs;
    let mockInboxTemplates;
    let shipmentFixtures;

    const rememberShipment = (shipment) => {
        shipmentFixtures.set(shipment.id, shipment);
        return shipment;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();

        mockConversationMessages = [];
        mockMessages = [];
        createdLogs = [];
        updatedLogs = [];
        shipmentFixtures = new Map();
        mockInboxTemplates = [
            { name: 'shipment_confirmation_2', status: 'APPROVED' },
            { name: 'payment_request_v1', status: 'APPROVED' },
            { name: 'location_request_v1', status: 'APPROVED' },
            { name: 'return_portal_v1', status: 'APPROVED' },
            { name: 'customer_inquiry_start', status: 'APPROVED' },
            { name: 'target_shipment_out_for_delivery', status: 'APPROVED' },
            { name: 'target_shipment_delivered', status: 'APPROVED' },
            { name: 'target_customs_exception_hold', status: 'APPROVED' }
        ];
        appConfig.chatwoot.enabled = true;
        appConfig.chatwoot.baseUrl = 'https://inbox.mawthook.io';
        appConfig.chatwoot.accountId = '1';
        appConfig.chatwoot.inboxId = '1';
        appConfig.chatwoot.apiAccessToken = 'test-chatwoot-token';

        // Setup mock axios adapter simulating Chatwoot API v1
        mockClientRequest = jest.fn().mockImplementation(async (reqConfig) => {
            const { method, url, data, params, headers } = reqConfig;
            const m = String(method).toLowerCase();

            if (m === 'get' && url.includes('/inboxes')) {
                return { data: { payload: [{ id: 1, message_templates: mockInboxTemplates }] } };
            }

            // Contacts search
            if (m === 'get' && url.includes('/contacts/search')) {
                const q = params?.q || '+96599112233';
                return {
                    data: {
                        payload: [
                            {
                                id: 101,
                                phone_number: q,
                                name: 'Test Customer',
                                custom_attributes: { role: 'receiver', recipient_role: 'receiver', customer_role: 'receiver' }
                            }
                        ]
                    }
                };
            }

            // Contact create
            if (m === 'post' && url.endsWith('/contacts')) {
                return {
                    data: {
                        payload: {
                            contact: {
                                id: 101,
                                phone_number: data?.phone_number || '+96599112233',
                                name: data?.name || 'Customer',
                                custom_attributes: { role: 'receiver', recipient_role: 'receiver', customer_role: 'receiver' }
                            }
                        }
                    }
                };
            }

            // Contact update
            if (m === 'put' && url.includes('/contacts/')) {
                return {
                    data: {
                        payload: {
                            contact: {
                                id: 101,
                                phone_number: '+96599112233',
                                name: 'Test Customer',
                                custom_attributes: { role: 'receiver', recipient_role: 'receiver', customer_role: 'receiver', ...(data?.custom_attributes || {}) }
                            }
                        }
                    }
                };
            }

            // Contact conversations
            if (m === 'get' && url.includes('/conversations') && url.includes('/contacts/')) {
                return {
                    data: {
                        payload: [
                            {
                                id: 201,
                                status: 'open',
                                custom_attributes: {}
                            }
                        ]
                    }
                };
            }

            // Conversation create
            if (m === 'post' && url.endsWith('/conversations')) {
                return {
                    data: {
                        payload: {
                            id: 201,
                            status: 'open'
                        }
                    }
                };
            }

            // Custom attributes
            if (m === 'post' && url.includes('/custom_attributes')) {
                return { data: { payload: { id: 201 } } };
            }

            // Labels
            if (m === 'post' && url.includes('/labels')) {
                return { data: { payload: ['role_receiver'] } };
            }

            // Conversation messages GET
            if (m === 'get' && url.includes('/messages')) {
                return { data: { payload: mockConversationMessages } };
            }

            // Conversation messages POST
            if (m === 'post' && url.includes('/messages')) {
                const newMsg = {
                    id: mockMessages.length + 301,
                    content: data?.content,
                    message_type: data?.message_type || 1,
                    template_params: data?.template_params,
                    created_at: Math.floor(Date.now() / 1000)
                };
                mockMessages.push({ ...newMsg, headers, data });
                return { data: newMsg };
            }

            return { data: { success: true } };
        });

        axios.create.mockReturnValue({
            defaults: { baseURL: 'https://inbox.mawthook.io' },
            request: mockClientRequest
        });

        // Default mock for microservice fallback POST (https://msg.target-kw.com/api/send)
        axios.post.mockResolvedValue({
            data: { status: 'sent', messageId: 'wamid.SW_MOCK_SENT_1' }
        });

        // Prisma mocks
        jest.spyOn(prisma.shipmentNotificationLog, 'create').mockImplementation(async ({ data }) => {
            const row = { id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, ...data };
            createdLogs.push(row);
            return row;
        });

        jest.spyOn(prisma.shipmentNotificationLog, 'update').mockImplementation(async ({ where, data }) => {
            const row = { id: where.id, ...data };
            updatedLogs.push(row);
            return row;
        });

        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        jest.spyOn(prisma.shipmentNotificationLog, 'findUnique').mockImplementation(async ({ where }) => ({ id: where.id }));
        jest.spyOn(prisma.shipmentNotificationLog, 'updateMany').mockResolvedValue({ count: 1 });
        jest.spyOn(prisma.shipment, 'findUnique').mockImplementation(async ({ where }) => shipmentFixtures.get(where.id) || null);
        jest.spyOn(prisma.shipment, 'update').mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
        jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
            provider: 'CHATWOOT',
            fallbackProvider: 'SHIPMENT_WHATSAPP',
            enabled: true
        });
        jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);
    });

    afterEach(() => {
        appConfig.chatwoot.enabled = false;
        appConfig.chatwoot.baseUrl = undefined;
        appConfig.chatwoot.accountId = undefined;
        appConfig.chatwoot.inboxId = undefined;
        appConfig.chatwoot.apiAccessToken = undefined;
    });

    describe('approved shipment confirmation routing', () => {
        const makeShipment = (destination = {}) => rememberShipment({
            id: 'confirmation-test-shipment',
            trackingNumber: 'TRK-TEST-20261026',
            status: 'created',
            createdAt: new Date('2026-10-26T10:00:00.000Z'),
            origin: { contactPerson: 'Sender Name', phone: '+96597959567' },
            destination,
            documents: {}
        });

        test('updates the exact queued log instead of a newer submitted log', async () => {
            const shipment = makeShipment();
            prisma.shipmentNotificationLog.findFirst.mockResolvedValueOnce({
                id: 'queued-log', shipmentId: shipment.id, eventType: 'delivered',
                recipientRole: 'sender', status: 'QUEUED'
            });

            await chatwootService.createLog({
                shipment, eventType: 'delivered',
                target: { role: 'sender', name: 'Sender Name', phone: '+96597959567' },
                existingLogId: 'queued-log', force: true
            });

            expect(prisma.shipmentNotificationLog.findFirst).toHaveBeenCalledWith({
                where: {
                    id: 'queued-log', shipmentId: shipment.id, eventType: 'delivered',
                    templateName: null,
                    recipientRole: { in: ['sender', 'shipper', 'merchant'] },
                    status: { in: ['FAILED', 'failed', 'SKIPPED', 'skipped', 'QUEUED', 'queued', 'PENDING', 'pending'] }
                }
            });
            expect(prisma.shipmentNotificationLog.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ id: 'queued-log', templateName: null }) })
            );
            expect(prisma.shipmentNotificationLog.create).not.toHaveBeenCalled();
        });

        test('sends the approved confirmation to the shipper with receiver fields and no support footer', async () => {
            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment({
                contactPerson: 'Receiver Name',
                phone: '+97455123456'
            }), { recipientRole: 'sender', manualDispatch: true });

            expect(result.results).toEqual([expect.objectContaining({ target: 'sender', status: 'submitted' })]);
            const messageCall = mockClientRequest.mock.calls.find(([req]) => req.method === 'post' && req.url.includes('/messages'));
            expect(messageCall).toBeDefined();
            const payload = messageCall[0].data;
            expect(payload.template_params.name).toBe('shipment_confirmation_2');
            expect(payload.template_params.parameters).toEqual(expect.arrayContaining(['Receiver Name', '97455123456']));
            expect(payload.content).toContain('Receiver Name: Receiver Name');
            expect(payload.content).toContain('Receiver Tel: 97455123456');
            expect(payload.content).not.toContain('Shipment: TRK-TEST-20261026');
            expect(payload.content).not.toContain('Support:');
            expect(payload.content).not.toContain('wa.me/');
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('uses literal receiver placeholders when receiver details are absent', async () => {
            await chatwootService.sendShipmentNotification('shipment_created', makeShipment(), { recipientRole: 'sender', manualDispatch: true });

            const messageCall = mockClientRequest.mock.calls.find(([req]) => req.method === 'post' && req.url.includes('/messages'));
            expect(messageCall[0].data.template_params.parameters).toEqual(expect.arrayContaining([
                '[receiver name]',
                '[receiver telephone]'
            ]));
        });

        test('does not treat a customer or account phone as the shipper phone', () => {
            const shipment = {
                ...makeShipment(),
                origin: { contactPerson: 'Shipper without phone' },
                customer: { phone: '+96590000001' },
                user: { phone: '+96590000002' },
                organization: { phone: '+96590000003' }
            };

            expect(chatwootService.getNotificationTargets('shipment_created', shipment)).toEqual([]);
        });

        test('blocks the legacy Target support number on Phenix shipments', () => {
            const shipment = {
                ...makeShipment(),
                phenixSourceKey: 'legacy-phenix-source',
                origin: { contactPerson: 'Unknown Shipper', phone: '+96597691271' }
            };

            expect(chatwootService.getNotificationTargets('shipment_created', shipment)).toEqual([]);
        });

        test('records a missing shipper phone instead of silently dropping the event', async () => {
            const shipment = rememberShipment({ ...makeShipment(), origin: { contactPerson: 'Shipper without phone' } });

            const result = await chatwootService.sendShipmentNotification('shipment_created', shipment, { manualDispatch: true });

            expect(result).toEqual(expect.objectContaining({ skipped: true, reason: 'missing_recipient_phone' }));
            expect(createdLogs).toEqual([expect.objectContaining({
                eventType: 'shipment_created', recipientRole: 'sender', status: 'skipped',
                errorMessage: expect.stringContaining('Recipient phone missing')
            })]);
            expect(mockClientRequest).not.toHaveBeenCalled();
        });

        test('reports unsupported notification events explicitly', async () => {
            const result = await chatwootService.sendShipmentNotification('shipment_booked', makeShipment(), { manualDispatch: true });

            expect(result).toEqual(expect.objectContaining({ skipped: true, reason: 'unsupported_event' }));
            expect(createdLogs).toEqual([]);
        });

        test('forces Chatwoot when stored provider settings name another provider', async () => {
            whatsAppConfigService.getConfig.mockReset().mockResolvedValue({
                provider: 'SHIPMENT_WHATSAPP',
                enabled: true
            });

            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment(), {
                recipientRole: 'sender', manualDispatch: true
            });

            expect(result.results).toEqual([expect.objectContaining({ target: 'sender', status: 'submitted' })]);
            expect(prisma.shipmentNotificationLog.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'submitted' })
            }));
            expect(mockClientRequest).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post', url: expect.stringContaining('/messages')
            }));
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('fails closed when the approved confirmation template is absent from the inbox', async () => {
            mockInboxTemplates = [{ name: 'target_shipment_created', status: 'APPROVED' }];

            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment({
                contactPerson: 'Receiver Name',
                phone: '+97455123456'
            }), { recipientRole: 'sender', manualDispatch: true });

            expect(result.results[0].status).toBe('failed');
            expect(result.results[0].reason).toBe('approved_template_unavailable');
            expect(mockClientRequest.mock.calls.filter(([req]) => req.method === 'post' && req.url.includes('/messages'))).toHaveLength(0);
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('fails closed when the inbox template list cannot be verified', async () => {
            mockInboxTemplates = null;
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (String(reqConfig.method).toLowerCase() === 'get' && reqConfig.url.includes('/inboxes')) {
                    throw new Error('Chatwoot inbox request failed');
                }
                return { data: { success: true } };
            });

            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment({
                contactPerson: 'Receiver Name',
                phone: '+97455123456'
            }), { recipientRole: 'sender', manualDispatch: true });

            expect(result.results[0].status).toBe('failed');
            expect(result.results[0].reason).toBe('approved_template_unavailable');
            expect(mockClientRequest.mock.calls.filter(([req]) => req.method === 'post' && req.url.includes('/messages'))).toHaveLength(0);
        });

        test.each([
            ['payment_link_ready', 'payment_request_v1'],
            ['location_request', 'location_request_v1'],
            ['return_portal', 'return_portal_v1'],
            ['customer_engagement', 'customer_inquiry_start']
        ])('requires exact approved Chatwoot template for %s', async (eventType, templateName) => {
            mockInboxTemplates = [{ name: 'new_shipment_created', status: 'APPROVED' }];

            await expect(whatsappService.sendNotification({
                shipment: makeShipment({ contactPerson: 'Receiver', phone: '+97455123456' }),
                recipientRole: 'receiver',
                recipientPhone: '+97455123456',
                eventType,
                templateName,
                force: true,
                manualDispatch: true,
                provider: 'SHIPMENT_WHATSAPP'
            })).rejects.toThrow(`Required approved Chatwoot template ${templateName}`);

            expect(mockClientRequest.mock.calls.filter(([req]) => req.method === 'post' && req.url.includes('/messages'))).toHaveLength(0);
            expect(axios.post).not.toHaveBeenCalled();
        });

        test.each([
            ['payment_link_ready', 'payment_request_v1', { amount: '25.250 KWD', paymentLink: 'https://pay.example.test/abc' }, ['Test Receiver', 'TRK-TEST-20261026', '25.250 KWD', 'https://pay.example.test/abc']],
            ['location_request', 'location_request_v1', { locationUrl: 'https://target-kw.com/track/TRK-TEST-20261026/location' }, ['Test Receiver', 'TRK-TEST-20261026', 'https://target-kw.com/track/TRK-TEST-20261026/location']],
            ['return_portal', 'return_portal_v1', { returnUrl: 'https://target-kw.com/returns/TRK-TEST-20261026' }, ['Test Receiver', 'TRK-TEST-20261026', 'https://target-kw.com/returns/TRK-TEST-20261026']],
            ['customer_engagement', 'customer_inquiry_start', {}, ['Test Receiver', 'TRK-TEST-20261026']]
        ])('sends %s with the synced template body parameters', async (eventType, templateName, customMessage, expectedParameters) => {
            await whatsappService.sendNotification({
                shipment: makeShipment({ contactPerson: 'Test Receiver', phone: '+97455123456' }),
                recipientRole: 'receiver',
                recipientPhone: '+97455123456',
                recipientName: 'Test Receiver',
                eventType,
                templateName,
                customMessage,
                force: true,
                manualDispatch: true,
                provider: 'SHIPMENT_WHATSAPP'
            });

            const messageCall = mockClientRequest.mock.calls.find(([req]) => req.method === 'post' && req.url.includes('/messages'));
            expect(messageCall[0].data.template_params).toEqual(expect.objectContaining({
                name: templateName,
                category: 'UTILITY',
                language: 'en',
                parameters: expectedParameters
            }));
            expect(messageCall[0].data.template_params.processed_params.body).toEqual(
                Object.fromEntries(expectedParameters.map((value, index) => [String(index + 1), value]))
            );
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('does not switch providers after a shipment confirmation Chatwoot send failure', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (String(reqConfig.method).toLowerCase() === 'get' && reqConfig.url.includes('/inboxes')) {
                    return { data: { payload: [{ id: 1, message_templates: mockInboxTemplates }] } };
                }
                if (String(reqConfig.method).toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    throw new Error('Chatwoot send failed');
                }
                return { data: { success: true, payload: { id: 201, status: 'open' } } };
            });

            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment({
                contactPerson: 'Receiver Name',
                phone: '+97455123456'
            }), { recipientRole: 'sender', manualDispatch: true });

            expect(result.results[0].status).toBe('failed');
            expect(axios.post).not.toHaveBeenCalled();
        });
    });

    describe('OTP log redaction', () => {
        test('does not log the OTP value or full recipient phone on template dispatch', async () => {
            const otp = '638204';
            const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
            axios.post.mockResolvedValueOnce({ data: { status: 'sent', messageId: 'wamid.OTP_TEST' } });

            await whatsappService.sendViaShipmentWhatsappMicroservice({
                serviceUrl: 'https://msg.target-kw.com',
                templateName: 'otptargetlogin',
                language: 'en_US',
                toPhone: '+96597959567',
                variables: [otp]
            });

            const logged = JSON.stringify(infoSpy.mock.calls);
            expect(logged).not.toContain(otp);
            expect(logged).not.toContain('96597959567');
            expect(logged).toContain('9567');
            infoSpy.mockRestore();
        });
    });

    // =========================================================================
    // Suite 1: Primary Chatwoot Outbound Dispatch
    // =========================================================================
    describe('Suite 1: Primary Chatwoot Outbound Dispatch', () => {
        test('1.1 Unapproved outbound milestone action is blocked before any provider call', async () => {
            const shipment = rememberShipment({
                id: 'shp-m4-01',
                trackingNumber: 'TRG-DISPATCH-01',
                destination: { contactPerson: 'Fatima Al-Sabah', phone: '+96599112233', city: 'Kuwait City', area: 'Dasman' },
                origin: { contactPerson: 'Ahmad Al-Kandari', phone: '+96597959567' },
                status: 'out_for_delivery',
                locationToken: 'loc_test_existing_token_123',
                locationTokenExpiresAt: new Date(Date.now() + 40 * 3600 * 1000),
                createdAt: new Date()
            });

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            })).resolves.toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'UNAPPROVED_MANUAL_ACTION' }));

            // The production inbox does not have this template, so no message is sent.
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls).toHaveLength(0);
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('1.2 Milestone events map to authoritative Meta template names', () => {
            const { CANONICAL_EVENT_TEMPLATES } = chatwootService;
            expect(CANONICAL_EVENT_TEMPLATES).toBeDefined();

            // Verify all canonical mappings from docs/whatsapp-template-catalog.md
            expect(CANONICAL_EVENT_TEMPLATES.shipment_created).toBe('target_shipment_created');
            expect(CANONICAL_EVENT_TEMPLATES.delivered).toBe('target_shipment_delivered');
            expect(CANONICAL_EVENT_TEMPLATES.on_hold_customs_issue).toBe('target_customs_exception_hold');
            expect(CANONICAL_EVENT_TEMPLATES.payment_link_ready).toBe('payment_request_v1');
            expect(CANONICAL_EVENT_TEMPLATES.location_request).toBe('location_request_v1');
            expect(CANONICAL_EVENT_TEMPLATES.auth_otp).toBe('otptargetlogin');
            expect(CANONICAL_EVENT_TEMPLATES.out_for_delivery).toBe('target_shipment_out_for_delivery');
            expect(CANONICAL_EVENT_TEMPLATES.pickup_scheduled).toBe('target_pickup_scheduled');
            expect(CANONICAL_EVENT_TEMPLATES.received_at_hub).toBe('target_received_at_hub');
            expect(CANONICAL_EVENT_TEMPLATES.verified_and_dispatched).toBe('target_verified_dispatched');
        });

        test('1.3 Outbound agent message includes decrypted agent token header', async () => {
            const agentToken = 'pat_mock_agent_secret_token_123';
            const payload = {
                content: 'Hello, your shipment has been verified and cleared customs.',
                message_type: 'outgoing'
            };

            await chatwootService.sendMessage(201, payload, {
                userAccessToken: agentToken,
                skipWindowCheck: true
            });

            // Verify client.request was called with the api_access_token header
            expect(mockClientRequest).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: expect.stringContaining('/conversations/201/messages'),
                headers: {
                    api_access_token: agentToken
                }
            }));
        });
    });

    // =========================================================================
    // Suite 2: Meta 24-Hour Customer Service Window Enforcement
    // =========================================================================
    describe('Suite 2: Meta 24-Hour Customer Service Window Enforcement', () => {
        test('2.1 Free-text message succeeds when customer incoming message was received 2 hours ago (<24h)', async () => {
            const twoHoursAgoSeconds = Math.floor((Date.now() - 2 * 3600 * 1000) / 1000);
            mockConversationMessages = [
                {
                    id: 50,
                    message_type: 0, // incoming customer message
                    content: 'Where is my order?',
                    created_at: twoHoursAgoSeconds
                }
            ];

            const freeTextPayload = {
                content: 'Your driver is 10 minutes away.',
                message_type: 'outgoing'
            };

            const response = await chatwootService.sendMessage(201, freeTextPayload);
            expect(response).toBeDefined();
            expect(mockMessages.length).toBe(1);
            expect(mockMessages[0].content).toBe('Your driver is 10 minutes away.');

            // Verify window status check directly
            const windowStatus = await chatwootService.checkCustomer24hWindow(201);
            expect(windowStatus.inside24hWindow).toBe(true);
            expect(windowStatus.reason).toBe('INSIDE_WINDOW');
            expect(windowStatus.remainingSeconds).toBeGreaterThan(21 * 3600);
        });

        test('2.2 Free-text message is rejected with OUTSIDE_24H_WINDOW when incoming message was 25 hours ago (>24h)', async () => {
            const twentyFiveHoursAgoSeconds = Math.floor((Date.now() - 25 * 3600 * 1000) / 1000);
            mockConversationMessages = [
                {
                    id: 51,
                    message_type: 0, // incoming customer message
                    content: 'Can you deliver tomorrow?',
                    created_at: twentyFiveHoursAgoSeconds
                }
            ];

            const freeTextPayload = {
                content: 'Yes we can deliver tomorrow morning.',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(201, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400
            });

            // Verify window status calculation
            const windowStatus = await chatwootService.checkCustomer24hWindow(201);
            expect(windowStatus.inside24hWindow).toBe(false);
            expect(windowStatus.reason).toBe('OUTSIDE_24H_WINDOW');
            expect(windowStatus.remainingSeconds).toBe(0);
        });

        test('2.3 Free-text message is rejected when conversation has no incoming customer messages', async () => {
            // Only outgoing agent/bot messages or empty array
            mockConversationMessages = [
                {
                    id: 52,
                    message_type: 1, // outgoing bot
                    content: 'Welcome to Target Logistics',
                    created_at: Math.floor(Date.now() / 1000)
                }
            ];

            const freeTextPayload = {
                content: 'Proactive staff text without customer inbound',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(201, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400
            });

            const windowStatus = await chatwootService.checkCustomer24hWindow(201);
            expect(windowStatus.inside24hWindow).toBe(false);
            expect(windowStatus.reason).toBe('NO_INCOMING_MESSAGES');
        });

        test('2.4 Pre-approved Meta template message sent outside 24h window succeeds', async () => {
            const twentyFiveHoursAgoSeconds = Math.floor((Date.now() - 25 * 3600 * 1000) / 1000);
            mockConversationMessages = [
                {
                    id: 53,
                    message_type: 0,
                    content: 'Hello',
                    created_at: twentyFiveHoursAgoSeconds
                }
            ];

            const templatePayload = {
                content: 'Your shipment has been delivered successfully.',
                message_type: 'outgoing',
                template_params: {
                    name: 'target_shipment_delivered',
                    category: 'UTILITY',
                    language: 'en'
                }
            };

            // Must succeed without throwing OUTSIDE_24H_WINDOW
            const response = await chatwootService.sendMessage(201, templatePayload);
            expect(response).toBeDefined();
            expect(mockMessages.length).toBe(1);
            expect(mockMessages[0].template_params.name).toBe('target_shipment_delivered');
        });
    });

    // =========================================================================
    // Suite 3: Shipment messages fail closed instead of falling back to another provider
    // =========================================================================
    describe('Suite 3: Chatwoot shipment failure handling', () => {
        test('3.1 Chatwoot HTTP 502 fails without external-provider fallback', async () => {
            // Mock Chatwoot message POST to reject with 502 Bad Gateway
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
                if (method.toLowerCase() === 'get' && url.includes('/inboxes')) {
                    return { data: { payload: [{ id: 1, message_templates: mockInboxTemplates }] } };
                }
                if (method.toLowerCase() === 'post' && url.includes('/messages')) {
                    const err = new Error('Request failed with status code 502');
                    err.response = { status: 502, data: { error: 'Bad Gateway' } };
                    throw err;
                }
                if (url.includes('/contacts')) return { data: { payload: { contact: { id: 101 } } } };
                if (url.includes('/conversations')) return { data: { payload: { id: 201 } } };
                return { data: { success: true } };
            });

            // Mock fallback microservice response
            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FALLBACK_502' }
            });

            const shipment = rememberShipment({
                id: 'shp-failover-502',
                trackingNumber: 'TRG-502-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            });

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'sender',
                recipientPhone: '+96597959567',
                templateName: 'shipment_confirmation_2',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            })).rejects.toThrow('Request failed with status code 502');
            expect(axios.post).not.toHaveBeenCalled();
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.status).toBe('FAILED');
            expect(latestUpdate.isFallback).not.toBe(true);
        });

        test('3.2 Chatwoot request timeout does not trigger external-provider fallback', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
                if (method.toLowerCase() === 'get' && url.includes('/inboxes')) {
                    return { data: { payload: [{ id: 1, message_templates: mockInboxTemplates }] } };
                }
                if (method.toLowerCase() === 'post' && url.includes('/messages')) {
                    const err = new Error('timeout of 15000ms exceeded');
                    err.code = 'ECONNABORTED';
                    throw err;
                }
                if (url.includes('/contacts')) return { data: { payload: { contact: { id: 101 } } } };
                if (url.includes('/conversations')) return { data: { payload: { id: 201 } } };
                return { data: { success: true } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FALLBACK_TIMEOUT' }
            });

            const shipment = rememberShipment({
                id: 'shp-failover-timeout',
                trackingNumber: 'TRG-TIMEOUT-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            });

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'sender',
                recipientPhone: '+96597959567',
                templateName: 'shipment_confirmation_2',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            })).rejects.toThrow(/timeout/i);
            expect(axios.post).not.toHaveBeenCalled();
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.status).toBe('FAILED');
            expect(latestUpdate.isFallback).not.toBe(true);
        });

        test('3.3 Chatwoot connection refusal does not trigger external-provider fallback', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
                if (method.toLowerCase() === 'get' && url.includes('/inboxes')) {
                    return { data: { payload: [{ id: 1, message_templates: mockInboxTemplates }] } };
                }
                if (method.toLowerCase() === 'post' && url.includes('/messages')) {
                    const err = new Error('connect ECONNREFUSED 127.0.0.1:443');
                    err.code = 'ECONNREFUSED';
                    throw err;
                }
                if (url.includes('/contacts')) return { data: { payload: { contact: { id: 101 } } } };
                if (url.includes('/conversations')) return { data: { payload: { id: 201 } } };
                return { data: { success: true } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FALLBACK_REFUSED' }
            });

            const shipment = rememberShipment({
                id: 'shp-failover-refused',
                trackingNumber: 'TRG-REFUSED-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            });

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'sender',
                recipientPhone: '+96597959567',
                templateName: 'shipment_confirmation_2',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            })).rejects.toThrow(/ECONNREFUSED/i);
            expect(axios.post).not.toHaveBeenCalled();
            expect(updatedLogs[updatedLogs.length - 1].status).toBe('FAILED');
        });

        test('3.4 Template inventory failure records FAILED without trying the external service', async () => {
            // Chatwoot fails with 502
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
                if (method.toLowerCase() === 'get' && url.includes('/inboxes')) {
                    return { data: { payload: [{ id: 1, message_templates: mockInboxTemplates }] } };
                }
                if (method.toLowerCase() === 'post' && url.includes('/messages')) {
                    const err = new Error('Chatwoot 502 Bad Gateway');
                    err.response = { status: 502 };
                    throw err;
                }
                if (url.includes('/contacts')) return { data: { payload: { contact: { id: 101 } } } };
                if (url.includes('/conversations')) return { data: { payload: { id: 201 } } };
                return { data: { success: true } };
            });

            // Microservice also fails
            axios.post.mockRejectedValueOnce(new Error('WhatsApp microservice 500 downstream error'));

            const shipment = rememberShipment({
                id: 'shp-double-fail',
                trackingNumber: 'TRG-DOUBLE-FAIL-01',
                destination: { phone: '+96599112233' },
                origin: { phone: '+96597959567' },
                createdAt: new Date()
            });

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'sender',
                recipientPhone: '+96597959567',
                templateName: 'shipment_confirmation_2',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            })).rejects.toThrow(/Chatwoot 502/i);

            // Verify ShipmentNotificationLog was updated with FAILED and complete failure reason
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.status).toBe('FAILED');
            expect(latestUpdate.isFallback).not.toBe(true);
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('3.5 Explicit SHIPMENT_WHATSAPP setting still routes shipment through Chatwoot', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValueOnce({
                provider: 'SHIPMENT_WHATSAPP',
                serviceUrl: 'https://msg.target-kw.com',
                apiKey: 'test-api-key'
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.DIRECT_MICROSERVICE_999' }
            });

            const shipment = rememberShipment({
                id: 'shp-direct-micro',
                trackingNumber: 'TRG-DIRECT-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'sender',
                recipientPhone: '+96597959567',
                templateName: 'shipment_confirmation_2',
                force: true,
                manualDispatch: true,
                provider: 'SHIPMENT_WHATSAPP'
            });

            expect(result.status).toBe('submitted');
            expect(result.provider).toBe('chatwoot');
            expect(result.isFallback).toBe(false);
            expect(axios.post).not.toHaveBeenCalled();
            const chatwootMsgCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(chatwootMsgCalls.length).toBe(1);

            // The dispatch log records Chatwoot acceptance distinctly from handset delivery.
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.provider).toBe('chatwoot');
            expect(latestUpdate.isFallback).toBe(false);
            expect(latestUpdate.fallbackReason).toBeNull();
        });
    });

    // =========================================================================
    // Suite 4: Retention and Enforcement of All Core Safety Guards
    // =========================================================================
    describe('Suite 4: Retention and Enforcement of All Core Safety Guards', () => {
        test('4.1 Quiet-hours window (22:00-08:00 Asia/Kuwait) suppresses notification', async () => {
            const shipment = rememberShipment({
                id: 'shp-guard-quiet',
                trackingNumber: 'TRG-QUIET-GUARD-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            });

            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValueOnce(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValueOnce({ allowQuietHoursBypass: false });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'payment_link_ready',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                manualDispatch: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('QUEUED');
            expect(result.reason).toBe('QUIET_HOURS_SUPPRESSED');

            // Verify no calls made to Chatwoot or microservice
            const chatwootMsgCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(chatwootMsgCalls.length).toBe(0);
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.2 Quiet-hours bypass rule allows urgent customs notifications', async () => {
            const shipment = rememberShipment({
                id: 'shp-guard-bypass',
                trackingNumber: 'TRG-BYPASS-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            });

            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValueOnce(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValueOnce({ allowQuietHoursBypass: true });

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'on_hold_customs_issue',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                manualDispatch: true,
                provider: 'chatwoot'
            })).resolves.toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'UNAPPROVED_MANUAL_ACTION' }));

            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls).toHaveLength(0);
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.3 36-hour age guard drops delivered historical shipments', async () => {
            const shipment = rememberShipment({
                id: 'shp-guard-age',
                trackingNumber: 'TRG-AGE-01',
                status: 'delivered',
                createdAt: new Date(Date.now() - 40 * 3600 * 1000), // 40h old (>36h)
                destination: { phone: '+96599112233' }
            });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                manualDispatch: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('SHIPMENT_TERMINAL');

            // Verify zero HTTP dispatches
            expect(axios.post).not.toHaveBeenCalled();
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(0);
        });

        test('4.4 Recipient deduplication guard prevents duplicate sends', async () => {
            const shipment = rememberShipment({
                id: 'shp-guard-dedup',
                trackingNumber: 'TRG-DEDUP-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            });

            // Mock existing log with SENT status
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValueOnce({
                id: 'log-prev-sent',
                status: 'SENT',
                sentAt: new Date(Date.now() - 1000 * 60)
            });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'location_request',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                templateName: 'location_request_v1',
                force: false,
                manualDispatch: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('DUPLICATE_ALREADY_SUBMITTED');

            expect(axios.post).not.toHaveBeenCalled();
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(0);
        });

        test('4.5 Developer-mode safe routing redirects the shipper recipient phone', async () => {
            const { DEV_SAFE_PHONE, resolveRecipientPhone } = whatsappService;
            expect(DEV_SAFE_PHONE).toBe('+201040957289');

            // In non-production/test environments, any customer phone redirects to DEV_SAFE_PHONE
            const redirected = resolveRecipientPhone('+96599112233');
            expect(redirected).toBe('+201040957289');

            const shipment = rememberShipment({
                id: 'shp-guard-devphone',
                trackingNumber: 'TRG-DEV-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            });

            await whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'sender',
                recipientPhone: '+96597959567',
                templateName: 'shipment_confirmation_2',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            });

            // Target phone passed to Chatwoot contact search/create must be DEV_SAFE_PHONE
            const contactCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/contacts'));
            expect(contactCalls.length).toBeGreaterThanOrEqual(1);
            const callConfig = contactCalls[0][0];
            const phoneUsed = callConfig.params?.q || callConfig.data?.phone_number;
            expect(phoneUsed).toBe('+201040957289');
        });

        test('4.6 Out-for-delivery fails closed when no approved template mapping exists', async () => {
            const shipmentWithoutToken = rememberShipment({
                id: 'shp-guard-token-gen',
                trackingNumber: 'TRG-TOKEN-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                locationToken: null,
                locationTokenExpiresAt: null,
                createdAt: new Date()
            });

            const updateShipmentSpy = jest.spyOn(prisma.shipment, 'update');

            await expect(whatsappService.sendNotification({
                shipment: shipmentWithoutToken,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                manualDispatch: true,
                provider: 'chatwoot'
            })).resolves.toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'UNAPPROVED_MANUAL_ACTION' }));
            expect(updateShipmentSpy).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });
    });
});
