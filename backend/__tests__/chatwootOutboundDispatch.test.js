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

// Mock external HTTP requests: zero real customer messages and zero live network requests
jest.mock('axios');

describe('Milestone 4: Chatwoot Outbound WhatsApp Dispatch, 24h Window & Fallback Suite', () => {
    let mockClientRequest;
    let mockConversationMessages;
    let mockMessages;
    let createdLogs;
    let updatedLogs;
    let mockInboxTemplates;

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();

        mockConversationMessages = [];
        mockMessages = [];
        createdLogs = [];
        updatedLogs = [];
        mockInboxTemplates = [
            { name: 'shipment_confirmation_2', status: 'APPROVED' },
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
        const makeShipment = (destination = {}) => ({
            id: 'confirmation-test-shipment',
            trackingNumber: 'TRK-TEST-20261026',
            status: 'created',
            createdAt: new Date('2026-10-26T10:00:00.000Z'),
            origin: { contactPerson: 'Sender Name', phone: '+96597959567' },
            destination,
            documents: {}
        });

        test('sends the approved confirmation to the shipper with receiver fields and no support footer', async () => {
            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment({
                contactPerson: 'Receiver Name',
                phone: '+97455123456'
            }), { recipientRole: 'sender' });

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
            await chatwootService.sendShipmentNotification('shipment_created', makeShipment(), { recipientRole: 'sender' });

            const messageCall = mockClientRequest.mock.calls.find(([req]) => req.method === 'post' && req.url.includes('/messages'));
            expect(messageCall[0].data.template_params.parameters).toEqual(expect.arrayContaining([
                '[receiver name]',
                '[receiver telephone]'
            ]));
        });

        test('fails closed when the approved confirmation template is absent from the inbox', async () => {
            mockInboxTemplates = [{ name: 'target_shipment_created', status: 'APPROVED' }];

            const result = await chatwootService.sendShipmentNotification('shipment_created', makeShipment({
                contactPerson: 'Receiver Name',
                phone: '+97455123456'
            }), { recipientRole: 'sender' });

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
            }), { recipientRole: 'sender' });

            expect(result.results[0].status).toBe('failed');
            expect(result.results[0].reason).toBe('approved_template_unavailable');
            expect(mockClientRequest.mock.calls.filter(([req]) => req.method === 'post' && req.url.includes('/messages'))).toHaveLength(0);
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
            }), { recipientRole: 'sender' });

            expect(result.results[0].status).toBe('failed');
            expect(axios.post).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Suite 1: Primary Chatwoot Outbound Dispatch
    // =========================================================================
    describe('Suite 1: Primary Chatwoot Outbound Dispatch', () => {
        test('1.1 Outbound milestone template dispatches successfully via Chatwoot API', async () => {
            const shipment = {
                id: 'shp-m4-01',
                trackingNumber: 'TRG-DISPATCH-01',
                destination: { contactPerson: 'Fatima Al-Sabah', phone: '+96599112233', city: 'Kuwait City', area: 'Dasman' },
                origin: { contactPerson: 'Ahmad Al-Kandari', phone: '+96597959567' },
                status: 'out_for_delivery',
                locationToken: 'loc_test_existing_token_123',
                locationTokenExpiresAt: new Date(Date.now() + 40 * 3600 * 1000),
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.provider).toBe('chatwoot');
            expect(result.isFallback).toBe(false);

            // Verify Chatwoot POST was dispatched with the canonical template
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(1);
            expect(messageCalls[0][0].data.template_params.name).toBe('target_shipment_out_for_delivery');

            // Verify NO HTTP call made to microservice https://msg.target-kw.com
            expect(axios.post).not.toHaveBeenCalled();

            // Verify ShipmentNotificationLog updated with Chatwoot provider and no fallback
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate).toBeDefined();
            expect(latestUpdate.status).toBe('SENT');
            expect(latestUpdate.provider).toBe('chatwoot');
            expect(latestUpdate.isFallback).toBe(false);
            expect(latestUpdate.fallbackReason).toBeNull();
            expect(latestUpdate.templateName).toBe('target_shipment_out_for_delivery');
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
    // Suite 3: Emergency Fallback Failover to msg.target-kw.com
    // =========================================================================
    describe('Suite 3: Emergency Fallback Failover to msg.target-kw.com', () => {
        test('3.1 Chatwoot HTTP 502 Bad Gateway triggers failover to msg.target-kw.com', async () => {
            // Mock Chatwoot message POST to reject with 502 Bad Gateway
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
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

            const shipment = {
                id: 'shp-failover-502',
                trackingNumber: 'TRG-502-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            // Verify failover succeeded
            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.externalMessageId).toBe('wamid.SW_FALLBACK_502');
            expect(result.fallbackReason).toContain('502');

            // Verify microservice was called with msg.target-kw.com
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('https://msg.target-kw.com/api/send'),
                expect.objectContaining({
                    templateName: 'target_shipment_delivered'
                }),
                expect.any(Object)
            );

            // Verify ShipmentNotificationLog persistence of fallback
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.status).toBe('SENT');
            expect(latestUpdate.provider).toBe('fallback');
            expect(latestUpdate.isFallback).toBe(true);
            expect(latestUpdate.fallbackReason).toContain('502');
            expect(latestUpdate.chatwootMessageId).toBe('wamid.SW_FALLBACK_502');
        });

        test('3.2 Chatwoot request timeout (>15s / ECONNABORTED) triggers failover', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
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

            const shipment = {
                id: 'shp-failover-timeout',
                trackingNumber: 'TRG-TIMEOUT-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.externalMessageId).toBe('wamid.SW_FALLBACK_TIMEOUT');
            expect(result.fallbackReason).toMatch(/timeout|ECONNABORTED/i);

            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.isFallback).toBe(true);
            expect(latestUpdate.provider).toBe('fallback');
        });

        test('3.3 Chatwoot connection refused (ECONNREFUSED) triggers failover', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
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

            const shipment = {
                id: 'shp-failover-refused',
                trackingNumber: 'TRG-REFUSED-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.externalMessageId).toBe('wamid.SW_FALLBACK_REFUSED');
            expect(result.fallbackReason).toMatch(/ECONNREFUSED/i);
        });

        test('3.4 Double failure: Chatwoot and fallback microservice failure records FAILED in log', async () => {
            // Chatwoot fails with 502
            mockClientRequest.mockImplementation(async (reqConfig) => {
                const { method, url } = reqConfig;
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

            const shipment = {
                id: 'shp-double-fail',
                trackingNumber: 'TRG-DOUBLE-FAIL-01',
                destination: { phone: '+96599112233' },
                origin: { phone: '+96597959567' },
                createdAt: new Date()
            };

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            })).rejects.toThrow(/microservice/i);

            // Verify ShipmentNotificationLog was updated with FAILED and complete failure reason
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.status).toBe('FAILED');
            expect(latestUpdate.isFallback).toBe(true);
            expect(latestUpdate.provider).toBe('fallback');
            expect(latestUpdate.fallbackReason).toMatch(/502.*downstream error/i);
        });

        test('3.5 Explicit admin provider configuration SHIPMENT_WHATSAPP bypasses Chatwoot directly to microservice', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValueOnce({
                provider: 'SHIPMENT_WHATSAPP',
                serviceUrl: 'https://msg.target-kw.com',
                apiKey: 'test-api-key'
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.DIRECT_MICROSERVICE_999' }
            });

            const shipment = {
                id: 'shp-direct-micro',
                trackingNumber: 'TRG-DIRECT-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'SHIPMENT_WHATSAPP'
            });

            expect(result.status).toBe('SENT');
            expect(result.provider).toBe('SHIPMENT_WHATSAPP');
            expect(result.isFallback).toBe(false);
            expect(result.externalMessageId).toBe('wamid.DIRECT_MICROSERVICE_999');

            // Microservice was called directly
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('https://msg.target-kw.com/api/send'),
                expect.any(Object),
                expect.any(Object)
            );

            // Chatwoot messages POST was NOT called
            const chatwootMsgCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(chatwootMsgCalls.length).toBe(0);

            // DB log records provider as SHIPMENT_WHATSAPP and isFallback: false
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.provider).toBe('SHIPMENT_WHATSAPP');
            expect(latestUpdate.isFallback).toBe(false);
            expect(latestUpdate.fallbackReason).toBeNull();
        });
    });

    // =========================================================================
    // Suite 4: Retention and Enforcement of All Core Safety Guards
    // =========================================================================
    describe('Suite 4: Retention and Enforcement of All Core Safety Guards', () => {
        test('4.1 Quiet-hours window (22:00-08:00 Asia/Kuwait) suppresses notification', async () => {
            const shipment = {
                id: 'shp-guard-quiet',
                trackingNumber: 'TRG-QUIET-GUARD-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValueOnce(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValueOnce({ allowQuietHoursBypass: false });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'payment_link_ready',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
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
            const shipment = {
                id: 'shp-guard-bypass',
                trackingNumber: 'TRG-BYPASS-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValueOnce(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValueOnce({ allowQuietHoursBypass: true });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'on_hold_customs_issue',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.provider).toBe('chatwoot');

            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(1);
            expect(messageCalls[0][0].data.template_params.name).toBe('target_customs_exception_hold');
        });

        test('4.3 36-hour age guard drops delivered historical shipments', async () => {
            const shipment = {
                id: 'shp-guard-age',
                trackingNumber: 'TRG-AGE-01',
                status: 'delivered',
                createdAt: new Date(Date.now() - 40 * 3600 * 1000), // 40h old (>36h)
                destination: { phone: '+96599112233' }
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('HISTORICAL_SHIPMENT');

            // Verify zero HTTP dispatches
            expect(axios.post).not.toHaveBeenCalled();
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(0);
        });

        test('4.4 Recipient deduplication guard prevents duplicate sends', async () => {
            const shipment = {
                id: 'shp-guard-dedup',
                trackingNumber: 'TRG-DEDUP-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            // Mock existing log with SENT status
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValueOnce({
                id: 'log-prev-sent',
                status: 'SENT',
                sentAt: new Date(Date.now() - 1000 * 60)
            });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.alreadySent).toBe(true);

            expect(axios.post).not.toHaveBeenCalled();
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(0);
        });

        test('4.5 Developer-mode safe routing redirects recipient phone', async () => {
            const { DEV_SAFE_PHONE, resolveRecipientPhone } = whatsappService;
            expect(DEV_SAFE_PHONE).toBe('+201040957289');

            // In non-production/test environments, any customer phone redirects to DEV_SAFE_PHONE
            const redirected = resolveRecipientPhone('+96599112233');
            expect(redirected).toBe('+201040957289');

            const shipment = {
                id: 'shp-guard-devphone',
                trackingNumber: 'TRG-DEV-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

            await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            // Target phone passed to Chatwoot contact search/create must be DEV_SAFE_PHONE
            const contactCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/contacts'));
            expect(contactCalls.length).toBeGreaterThanOrEqual(1);
            const callConfig = contactCalls[0][0];
            const phoneUsed = callConfig.params?.q || callConfig.data?.phone_number;
            expect(phoneUsed).toBe('+201040957289');
        });

        test('4.6 Out-for-delivery generates locationToken for customer GPS pin CTA', async () => {
            const shipmentWithoutToken = {
                id: 'shp-guard-token-gen',
                trackingNumber: 'TRG-TOKEN-01',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                locationToken: null,
                locationTokenExpiresAt: null,
                createdAt: new Date()
            };

            const updateShipmentSpy = jest.spyOn(prisma.shipment, 'update');

            await whatsappService.sendNotification({
                shipment: shipmentWithoutToken,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            // Verify 32-byte (64 hex char) locationToken was generated and saved
            expect(updateShipmentSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'shp-guard-token-gen' },
                data: expect.objectContaining({
                    locationToken: expect.stringMatching(/^loc_[a-f0-9]{64}$/),
                    locationTokenExpiresAt: expect.any(Date)
                })
            }));

            // Verify buttonUrlParam was injected into Chatwoot payload
            const msgCall = mockClientRequest.mock.calls.find(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(msgCall).toBeDefined();
            expect(msgCall[0].data.template_params.button_params).toEqual([
                {
                    type: 'url',
                    index: '0',
                    parameter: expect.stringMatching(/^loc_[a-f0-9]{64}$/)
                }
            ]);
        });
    });
});
