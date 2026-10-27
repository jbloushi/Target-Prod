/**
 * Backend Support Center & Support Chat Controller Test Suite
 * File: backend/__tests__/supportChat.test.js
 *
 * Verifies all Milestone 5 backend endpoints:
 * - Conversation listing with status, label, unread toggle, search
 * - Thread message retrieval distinguishing templates vs free text
 * - 24-hour customer service window status check
 * - Outbound agent reply attribution with decrypted user token
 * - 24-hour customer service window enforcement on free text vs templates
 * - Rejection of users without configured chatwootAccessToken
 * - Customer logistics context prioritizing active shipments over past shipments
 * - 1-click shipment conversation binding
 * - Unread count aggregation for navigation badge
 * - Status toggle and label management
 * - 1-click location request dispatch
 * - SSE real-time stream connectivity
 */

process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = 'test_jwt_secret_m5';
process.env.CHATWOOT_ENABLED = 'true';
process.env.CHATWOOT_ACCOUNT_ID = '1';
process.env.CHATWOOT_INBOX_ID = '1';
process.env.CHATWOOT_BASE_URL = 'https://inbox.mawthook.io';
process.env.CHATWOOT_API_ACCESS_TOKEN = 'platform_root_token';

const request = require('supertest');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const chatwootService = require('../src/services/chatwootNotificationService');
const whatsappService = require('../src/services/whatsappIntegration.service');
const supportChatController = require('../src/controllers/supportChat.controller');
const fieldEncryption = require('../src/utils/fieldEncryption');

jest.mock('axios');

describe('Milestone 5: Backend Support Center & Chat Controller Suite', () => {
    let mockClientRequest;
    let mockConversations;
    let mockMessages;
    let testUserWithToken;
    let testUserWithoutToken;
    let testAuthTokenWithToken;
    let testAuthTokenWithoutToken;
    let testShipmentActive;
    let testShipmentDelivered;

    beforeAll(() => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_m5';
        process.env.CHATWOOT_ENABLED = 'true';
        process.env.CHATWOOT_ACCOUNT_ID = '1';
        process.env.CHATWOOT_INBOX_ID = '1';
        process.env.CHATWOOT_BASE_URL = 'https://inbox.mawthook.io';
        process.env.CHATWOOT_API_ACCESS_TOKEN = 'platform_root_token';
    });

    afterAll(() => {
        supportChatController.resetSseClients();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();

        // Encrypted token for test user
        const plainToken = 'agent_personal_cw_pat_998877';
        const encryptedEnvelope = fieldEncryption.encrypt(plainToken);

        testUserWithToken = {
            id: 'user-support-agent-01',
            email: 'agent1@target-kw.com',
            name: 'Sarah Support Agent',
            role: 'staff',
            active: true,
            chatwootAccessToken: JSON.stringify(encryptedEnvelope),
            organizationId: 'org-target-01'
        };

        testUserWithoutToken = {
            id: 'user-support-agent-02',
            email: 'agent2@target-kw.com',
            name: 'No Token Agent',
            role: 'staff',
            active: true,
            chatwootAccessToken: null,
            organizationId: 'org-target-01'
        };

        testAuthTokenWithToken = jwt.sign({ id: testUserWithToken.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        testAuthTokenWithoutToken = jwt.sign({ id: testUserWithoutToken.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // Mock Prisma queries
        prisma.user.findUnique = jest.fn().mockImplementation(({ where }) => {
            if (where.id === testUserWithToken.id) return Promise.resolve(testUserWithToken);
            if (where.id === testUserWithoutToken.id) return Promise.resolve(testUserWithoutToken);
            return Promise.resolve(null);
        });

        testShipmentActive = {
            id: 'shp-active-001',
            trackingNumber: 'TRG-ACT-1001',
            assignedStaffId: 'user-support-agent-01',
            status: 'out_for_delivery',
            carrierCode: 'DGR',
            price: 5.5,
            remainingBalance: 5.5,
            paid: false,
            codAmount: 12.0,
            codStatus: 'pending',
            origin: { city: 'Kuwait City', country: 'KW' },
            destination: { contactPerson: 'Fahad Al-Mutawa', phone: '+96599112233', address: 'Hawally Block 1', city: 'Hawally' },
            customer: { name: 'Fahad Al-Mutawa', phone: '+96599112233' },
            locationToken: 'loc_token_123',
            organization: { id: 'org-b2b-01', name: 'Al-Shaya Retail', creditLimit: 1000, balance: 250 }
        };

        testShipmentDelivered = {
            id: 'shp-past-002',
            trackingNumber: 'TRG-PAST-1002',
            status: 'delivered',
            carrierCode: 'DGR',
            price: 4.0,
            remainingBalance: 0,
            paid: true,
            codAmount: 0,
            codStatus: null,
            origin: { city: 'Kuwait City', country: 'KW' },
            destination: { contactPerson: 'Fahad Al-Mutawa', phone: '+96599112233', address: 'Salmiya Block 4', city: 'Salmiya' },
            customer: { name: 'Fahad Al-Mutawa', phone: '+96599112233' },
            locationToken: null,
            organization: { id: 'org-b2b-01', name: 'Al-Shaya Retail', creditLimit: 1000, balance: 250 }
        };

        prisma.shipment.findUnique = jest.fn().mockImplementation(({ where }) => {
            if (where.trackingNumber === testShipmentActive.trackingNumber) return Promise.resolve(testShipmentActive);
            if (where.trackingNumber === testShipmentDelivered.trackingNumber) return Promise.resolve(testShipmentDelivered);
            return Promise.resolve(null);
        });

        prisma.shipment.findMany = jest.fn().mockResolvedValue([testShipmentActive, testShipmentDelivered]);
        prisma.shipment.update = jest.fn().mockImplementation(({ where, data }) => {
            return Promise.resolve({ ...testShipmentActive, ...data });
        });

        // Mock Conversations dataset in Chatwoot
        mockConversations = [
            {
                id: 201,
                status: 'open',
                unread_count: 3,
                labels: ['receiver', 'customs_hold'],
                custom_attributes: {
                    recipient_role: 'receiver',
                    shipment_tracking_number: 'TRG-ACT-1001',
                    active_status: 'out_for_delivery',
                    carrier_code: 'DGR',
                    cod_amount: 12.0
                },
                meta: {
                    sender: {
                        id: 501,
                        name: 'Fahad Al-Mutawa',
                        phone_number: '+96599112233',
                        email: 'fahad@example.com',
                        custom_attributes: { role: 'receiver', organization_name: 'Al-Shaya Retail' }
                    }
                },
                last_non_activity_message: {
                    id: 1001,
                    content: 'Where is my parcel TRG-ACT-1001?',
                    message_type: 0, // incoming
                    created_at: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
                }
            },
            {
                id: 202,
                status: 'resolved',
                unread_count: 0,
                labels: ['sender', 'cod_due'],
                custom_attributes: {
                    recipient_role: 'sender',
                    shipment_tracking_number: 'TRG-PAST-1002',
                    active_status: 'delivered',
                    carrier_code: 'DGR'
                },
                meta: {
                    sender: {
                        id: 502,
                        name: 'Dana Logistics',
                        phone_number: '+96598765432',
                        email: 'dana@example.com',
                        custom_attributes: { role: 'sender' }
                    }
                },
                last_non_activity_message: {
                    id: 1002,
                    content: 'Payment confirmed for delivery',
                    message_type: 1, // outgoing
                    created_at: Math.floor(Date.now() / 1000) - 86400
                }
            }
        ];

        // Mock Messages in Conversation 201 (inside 24h window: last incoming 1 hour ago)
        mockMessages = [
            {
                id: 991,
                content: 'Your package is out for delivery today',
                message_type: 1, // outgoing
                created_at: Math.floor(Date.now() / 1000) - 7200,
                content_attributes: {
                    template_params: {
                        name: 'target_shipment_out_for_delivery',
                        parameters: ['Fahad Al-Mutawa', 'TRG-ACT-1001', 'Hawally']
                    }
                }
            },
            {
                id: 992,
                content: 'Where is my parcel TRG-ACT-1001?',
                message_type: 0, // incoming customer message (1 hour ago)
                created_at: Math.floor(Date.now() / 1000) - 3600,
                sender: { id: 501, name: 'Fahad Al-Mutawa', type: 'contact' }
            }
        ];

        // Setup Chatwoot Axios Mock
        mockClientRequest = jest.fn().mockImplementation(async (reqConfig) => {
            const { method, url, data, params, headers } = reqConfig;
            const m = String(method).toLowerCase();

            if (m === 'get' && url.includes('/inboxes')) {
                return {
                    data: {
                        payload: [{
                            id: 1,
                            message_templates: [{
                                name: 'customer_inquiry_start',
                                status: 'APPROVED',
                                language: 'en',
                                category: 'UTILITY',
                                components: [{
                                    type: 'BODY',
                                    text: 'Hello *{{1}}*,\n\nTarget Logistics is contacting you about shipment *{{2}}*. Please reply to this message to speak with'
                                }]
                            }]
                        }]
                    }
                };
            }

            // GET /api/v1/accounts/:accountId/conversations
            // Contact conversations
            if (m === 'get' && url.includes('/contacts/') && url.includes('/conversations')) {
                return {
                    data: {
                        payload: [mockConversations[0]]
                    }
                };
            }

            // POST /api/v1/accounts/:accountId/conversations
            if (m === 'post' && url.endsWith('/conversations')) {
                return {
                    data: {
                        payload: mockConversations[0]
                    }
                };
            }

            // Custom attributes
            if (m === 'post' && url.includes('/custom_attributes')) {
                return { data: { payload: { id: 201 } } };
            }

            // GET /api/v1/accounts/:accountId/conversations
            if (m === 'get' && url.includes('/conversations') && !url.match(/\/conversations\/\d+/)) {
                return {
                    data: {
                        payloads: mockConversations
                    }
                };
            }

            // GET /api/v1/accounts/:accountId/conversations/:id/messages
            if (m === 'get' && url.match(/\/conversations\/\d+\/messages/)) {
                return {
                    data: {
                        payload: mockMessages
                    }
                };
            }

            // GET /api/v1/accounts/:accountId/conversations/:id
            if (m === 'get' && url.match(/\/conversations\/\d+$/)) {
                const idMatch = url.match(/\/conversations\/(\d+)$/);
                const convId = idMatch ? parseInt(idMatch[1], 10) : 201;
                const found = mockConversations.find(c => c.id === convId) || mockConversations[0];
                return { data: found };
            }

            // POST /api/v1/accounts/:accountId/conversations/:id/messages
            if (m === 'post' && url.match(/\/conversations\/\d+\/messages/)) {
                const newMsg = {
                    id: 2001,
                    content: data?.content,
                    message_type: data?.message_type || 1,
                    created_at: Math.floor(Date.now() / 1000),
                    headersReceived: headers
                };
                return { data: newMsg };
            }

            // POST /api/v1/accounts/:accountId/conversations/:id/toggle_status
            if (m === 'post' && url.includes('/toggle_status')) {
                return { data: { id: 201, status: data?.status || 'resolved' } };
            }

            // POST /api/v1/accounts/:accountId/conversations/:id/labels
            if (m === 'post' && url.includes('/labels')) {
                return { data: { payload: data?.labels || [] } };
            }

            // Contacts search
            if (m === 'get' && url.includes('/contacts/search')) {
                return {
                    data: {
                        payload: [
                            { id: 501, name: 'Fahad Al-Mutawa', phone_number: '+96599112233', custom_attributes: { role: 'receiver' } }
                        ]
                    }
                };
            }

            return { data: { success: true } };
        });

        axios.create.mockReturnValue({
            request: mockClientRequest,
            defaults: { baseURL: 'https://inbox.mawthook.io' }
        });
    });

    describe('1. Conversation Listing & Filtering (GET /api/support/conversations)', () => {
        it('1.1 returns normalized conversations list with unread total', async () => {
            const res = await request(app)
                .get('/api/support/conversations')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.conversations)).toBe(true);
            expect(res.body.conversations.length).toBe(1); // default status 'open' returns conversation 201
            expect(res.body.conversations[0].id).toBe(201);
            expect(res.body.conversations[0].contact.name).toBe('Fahad Al-Mutawa');
            expect(res.body.conversations[0].activeShipment.trackingNumber).toBe('TRG-ACT-1001');
            expect(res.body.meta.unreadTotal).toBe(1);
        });

        it('1.2 filters conversations by status=all or status=resolved', async () => {
            const resAll = await request(app)
                .get('/api/support/conversations?status=all')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(resAll.status).toBe(200);
            expect(resAll.body.conversations.length).toBe(2);

            const resResolved = await request(app)
                .get('/api/support/conversations?status=resolved')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(resResolved.status).toBe(200);
            expect(resResolved.body.conversations.length).toBe(1);
            expect(resResolved.body.conversations[0].id).toBe(202);
        });

        it('1.3 filters conversations by label (e.g. customs_hold)', async () => {
            const res = await request(app)
                .get('/api/support/conversations?status=all&label=customs_hold')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.conversations.length).toBe(1);
            expect(res.body.conversations[0].id).toBe(201);
        });

        it('1.4 filters conversations by unread=true toggle', async () => {
            const res = await request(app)
                .get('/api/support/conversations?status=all&unread=true')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.conversations.length).toBe(1);
            expect(res.body.conversations[0].unreadCount).toBe(3);
        });

        it('1.5 searches conversations by customer name, phone, or tracking number', async () => {
            const res = await request(app)
                .get('/api/support/conversations?status=all&q=Dana')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.conversations.length).toBe(1);
            expect(res.body.conversations[0].contact.name).toBe('Dana Logistics');
        });
    });

    describe('2. Conversation Details & Message Thread (GET /api/support/conversations/:id/messages)', () => {
        it('2.1 returns message thread distinguishing Meta template from free text and computes 24h window', async () => {
            const res = await request(app)
                .get('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.windowStatus.inside24hWindow).toBe(true);
            expect(res.body.windowStatus.remainingSeconds).toBeGreaterThan(0);

            const msgs = res.body.messages;
            expect(msgs.length).toBe(2);

            // First message: Meta template
            expect(msgs[0].isTemplate).toBe(true);
            expect(msgs[0].templateName).toBe('target_shipment_out_for_delivery');
            expect(msgs[0].messageType).toBe('outgoing');

            // Second message: Inbound customer message
            expect(msgs[1].isTemplate).toBe(false);
            expect(msgs[1].messageType).toBe('incoming');
            expect(msgs[1].content).toContain('Where is my parcel');
        });
    });

    describe('3. 24-Hour Customer Service Window Status (GET /api/support/conversations/:id/window)', () => {
        it('3.1 calculates inside24hWindow and remainingSeconds correctly', async () => {
            const res = await request(app)
                .get('/api/support/conversations/201/window')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.inside24hWindow).toBe(true);
            expect(res.body.reason).toBe('INSIDE_WINDOW');
            expect(res.body.remainingSeconds).toBeGreaterThan(80000); // 1 hour elapsed out of 24h
        });
    });

    describe('4. Outbound Agent Replies & Per-Agent Identity (POST /api/support/conversations/:id/messages)', () => {
        it('4.1 allows free-text reply inside 24h window and attributes with decrypted agent token', async () => {
            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`)
                .send({
                    content: 'Hello Fahad, our driver will reach your location in 30 minutes.'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            // Assert Chatwoot received agent personal token in api_access_token header
            expect(mockClientRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'post',
                    url: expect.stringContaining('/conversations/201/messages'),
                    headers: expect.objectContaining({
                        api_access_token: 'agent_personal_cw_pat_998877'
                    })
                })
            );
        });

        it('4.2 rejects free-text reply outside 24h window with HTTP 400 OUTSIDE_24H_WINDOW', async () => {
            // Simulate customer message 25 hours ago
            mockMessages = [
                {
                    id: 995,
                    content: 'Old customer question',
                    message_type: 0,
                    created_at: Math.floor(Date.now() / 1000) - 25 * 3600 // 25 hours ago
                }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`)
                .send({
                    content: 'Attempting to send free text past 24 hours'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('OUTSIDE_24H_WINDOW');
            expect(res.body.windowStatus.inside24hWindow).toBe(false);
        });

        it('4.3 allows approved Meta utility template outside 24h window', async () => {
            // Customer message 25 hours ago
            mockMessages = [
                {
                    id: 995,
                    content: 'Old customer question',
                    message_type: 0,
                    created_at: Math.floor(Date.now() / 1000) - 25 * 3600
                }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`)
                .send({
                    isTemplate: true,
                    templateName: 'customer_inquiry_start',
                    templateParams: ['Fahad', 'TRG-ACT-1001']
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(mockClientRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'post',
                    data: expect.objectContaining({
                        template_params: expect.objectContaining({
                            name: 'customer_inquiry_start',
                            language: 'en',
                            processed_params: { body: { '1': 'Fahad', '2': 'TRG-ACT-1001' } },
                            parameters: ['Fahad', 'TRG-ACT-1001']
                        })
                    })
                })
            );
        });

        it('4.4 rejects sending reply if user has no configured chatwootAccessToken with HTTP 403 NO_CHATWOOT_TOKEN', async () => {
            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenWithoutToken}`)
                .send({
                    content: 'Attempting send without token'
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('NO_CHATWOOT_TOKEN');
            expect(res.body.error).toContain('Chatwoot personal access token');
        });
    });

    describe('5. Customer Logistics Context Panel (GET /api/support/conversations/:id/context)', () => {
        it('5.1 returns customer profile, active shipments first, and shipment history', async () => {
            const res = await request(app)
                .get('/api/support/conversations/201/context')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.customer.name).toBe('Fahad Al-Mutawa');
            expect(res.body.customer.organization.name).toBe('Al-Shaya Retail');

            // Active shipments must be returned first
            expect(res.body.activeShipments.length).toBe(1);
            expect(res.body.activeShipments[0].trackingNumber).toBe('TRG-ACT-1001');
            expect(res.body.activeShipments[0].status).toBe('out_for_delivery');
            expect(res.body.activeShipments[0].links.tracking).toBe('https://target-kw.com/track/TRG-ACT-1001');
            expect(res.body.activeShipments[0].links.payment).toBe('https://target-kw.com/pay/TRG-ACT-1001');

            // Past shipments
            expect(res.body.pastShipments.length).toBe(1);
            expect(res.body.pastShipments[0].trackingNumber).toBe('TRG-PAST-1002');
            expect(res.body.pastShipments[0].status).toBe('delivered');
        });
    });

    describe('6. Shipment 1-Click Conversation Binding (GET /api/support/shipments/:trackingNumber/conversation)', () => {
        it('6.1 finds or binds conversation for shipment and returns window status', async () => {
            const res = await request(app)
                .get('/api/support/shipments/TRG-ACT-1001/conversation')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.conversationId).toBe(201);
            expect(res.body.shipment.trackingNumber).toBe('TRG-ACT-1001');
            expect(res.body.windowStatus.inside24hWindow).toBe(true);
        });

        it('6.2 returns 404 for unknown tracking number', async () => {
            const res = await request(app)
                .get('/api/support/shipments/UNKNOWN-999/conversation')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });
    });

    describe('7. Navbar Unread Badge Count (GET /api/support/unread-count)', () => {
        it('7.1 returns aggregated unread count across open conversations', async () => {
            const res = await request(app)
                .get('/api/support/unread-count')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.unreadCount).toBe(3);
            expect(res.body.openConversationsCount).toBe(2);
        });
    });

    describe('8. Conversation Status & Labels Management', () => {
        it('8.1 toggles conversation status between open and resolved', async () => {
            const res = await request(app)
                .post('/api/support/conversations/201/status')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`)
                .send({ status: 'resolved' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.status).toBe('resolved');
        });

        it('8.2 updates conversation labels', async () => {
            const res = await request(app)
                .post('/api/support/conversations/201/labels')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`)
                .send({ labels: ['receiver', 'cod_due', 'vip_merchant'] });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.labels).toEqual(['receiver', 'cod_due', 'vip_merchant']);
        });
    });

    describe('9. 1-Click Location Request Action (POST /api/support/actions/request-location)', () => {
        it('9.1 dispatches location pin request notification via WhatsApp integration service', async () => {
            jest.spyOn(whatsappService, 'sendLocationRequestNotification').mockResolvedValue({ status: 'submitted' });

            const res = await request(app)
                .post('/api/support/actions/request-location')
                .set('Authorization', `Bearer ${testAuthTokenWithToken}`)
                .send({
                    trackingNumber: 'TRG-ACT-1001',
                    phone: '+96500000000',
                    name: 'Untrusted Caller Name'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.locationToken).toBe('loc_token_123');
            expect(whatsappService.sendLocationRequestNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    recipientPhone: '+96599112233',
                    recipientName: 'Fahad Al-Mutawa'
                })
            );
        });
    });

    describe('10. Real-Time Server-Sent Events (GET /api/support/events)', () => {
        it('10.1 connects to SSE stream and establishes streaming headers and handshake', async () => {
            const res = await request(app)
                .get(`/api/support/events?token=${testAuthTokenWithToken}&testClose=true`)
                .set('Accept', 'text/event-stream');

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.headers['cache-control']).toContain('no-cache');
            expect(res.text).toContain('event: connected');
        });
    });
});
