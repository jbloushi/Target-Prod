/**
 * Empirical Adversarial Test Suite for Milestone 5:
 * 24-Hour Customer Window Boundary & Bypass Attempts, Edge Cases, and Per-Agent Token Security
 * File: backend/__tests__/adversarialSupportM5.test.js
 */

process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = 'test_jwt_secret_adversarial_m5';
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
const supportChatController = require('../src/controllers/supportChat.controller');
const userController = require('../src/controllers/user.controller');
const fieldEncryption = require('../src/utils/fieldEncryption');

jest.mock('axios');

describe('Adversarial M5 Challenge: 24h Window Bypasses, Boundary Conditions & Token Security', () => {
    let mockClientRequest;
    let testUserWithValidToken;
    let testUserWithoutToken;
    let testUserWithCorruptedToken;
    let testAuthTokenValid;
    let testAuthTokenNoToken;
    let testAuthTokenCorrupted;
    let capturedAxiosCalls;
    let currentMockMessages;

    beforeAll(() => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_adversarial_m5';
        process.env.CHATWOOT_ENABLED = 'true';
        process.env.CHATWOOT_ACCOUNT_ID = '1';
        process.env.CHATWOOT_INBOX_ID = '1';
    });

    afterAll(() => {
        supportChatController.resetSseClients();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();
        capturedAxiosCalls = [];
        currentMockMessages = [];

        // 1. Valid agent with encrypted token
        const realToken = 'cw_pat_live_super_secret_agent_token_12345';
        const validEnvelope = fieldEncryption.encrypt(realToken);
        testUserWithValidToken = {
            id: 'adv-agent-valid-01',
            email: 'valid.agent@target-kw.com',
            name: 'Valid Agent',
            role: 'staff',
            active: true,
            chatwootAccessToken: JSON.stringify(validEnvelope),
            organizationId: 'org-target-01'
        };

        // 2. Agent with null token
        testUserWithoutToken = {
            id: 'adv-agent-notoken-02',
            email: 'notoken.agent@target-kw.com',
            name: 'No Token Agent',
            role: 'staff',
            active: true,
            chatwootAccessToken: null,
            organizationId: 'org-target-01'
        };

        // 3. Agent with corrupted / tampered ciphertext token
        testUserWithCorruptedToken = {
            id: 'adv-agent-corrupted-03',
            email: 'corrupted.agent@target-kw.com',
            name: 'Corrupted Token Agent',
            role: 'staff',
            active: true,
            chatwootAccessToken: JSON.stringify({
                _encrypted: true,
                iv: '0123456789abcdef0123456789abcdef',
                data: 'deadbeef12345678',
                tag: '0123456789abcdef0123456789abcdef'
            }),
            organizationId: 'org-target-01'
        };

        testAuthTokenValid = jwt.sign({ id: testUserWithValidToken.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        testAuthTokenNoToken = jwt.sign({ id: testUserWithoutToken.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        testAuthTokenCorrupted = jwt.sign({ id: testUserWithCorruptedToken.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        prisma.user.findUnique = jest.fn().mockImplementation(({ where }) => {
            if (where.id === testUserWithValidToken.id) return Promise.resolve(testUserWithValidToken);
            if (where.id === testUserWithoutToken.id) return Promise.resolve(testUserWithoutToken);
            if (where.id === testUserWithCorruptedToken.id) return Promise.resolve(testUserWithCorruptedToken);
            return Promise.resolve(null);
        });

        // Setup Chatwoot Axios Mock
        mockClientRequest = jest.fn().mockImplementation(async (reqConfig) => {
            capturedAxiosCalls.push(reqConfig);
            const { method, url, data } = reqConfig;
            const m = String(method).toLowerCase();

            if (m === 'get' && url.endsWith('/inboxes')) {
                return { data: { payload: [{
                    id: 1,
                    message_templates: [{
                        name: 'customer_inquiry_start',
                        status: 'APPROVED',
                        language: 'en',
                        components: [{ type: 'BODY', text: 'Hello {{1}}, shipment {{2}}' }]
                    }]
                }] } };
            }

            // GET messages
            if (m === 'get' && url.match(/\/conversations\/\d+\/messages/)) {
                return { data: { payload: currentMockMessages } };
            }

            // POST messages
            if (m === 'post' && url.match(/\/conversations\/\d+\/messages/)) {
                return {
                    data: {
                        id: 99001,
                        content: data?.content,
                        message_type: data?.message_type || 1,
                        created_at: Math.floor(Date.now() / 1000)
                    }
                };
            }

            // GET conversation
            if (m === 'get' && url.match(/\/conversations\/\d+$/)) {
                return {
                    data: {
                        id: 201,
                        status: 'open',
                        meta: { sender: { id: 501, name: 'Customer', phone_number: '+96599112233' } }
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

    describe('ADVERSARIAL SUITE 1: 24-Hour Customer Window Boundary & Bypass Attempts', () => {
        it('ADV-1.1: Rejects free-text send outside 24h window even when client injects forged timestamps in body/headers', async () => {
            // Customer sent message 30 hours ago
            const thirtyHoursAgoSec = Math.floor(Date.now() / 1000) - (30 * 3600);
            currentMockMessages = [
                {
                    id: 101,
                    content: 'Customer inquiry',
                    message_type: 0,
                    created_at: thirtyHoursAgoSec
                }
            ];

            // Attacker passes fake client timestamps attempting to trick server
            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .set('X-Client-Timestamp', new Date().toISOString())
                .send({
                    content: 'Attacker free text bypassing window',
                    now: new Date().toISOString(),
                    timestamp: Math.floor(Date.now() / 1000),
                    created_at: Math.floor(Date.now() / 1000),
                    clientTime: new Date().toISOString()
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('OUTSIDE_24H_WINDOW');
            expect(res.body.windowStatus.inside24hWindow).toBe(false);
            // Verify no message was dispatched to Chatwoot
            const postCalls = capturedAxiosCalls.filter(c => c.method === 'post' && c.url.includes('/messages'));
            expect(postCalls.length).toBe(0);
        });

        it('ADV-1.2: Boundary Test: Exact 86,400s (24h) threshold vs 86,401s threshold', async () => {
            const now = new Date('2026-10-25T12:00:00.000Z');
            const exact24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // exactly 86,400s ago
            const justExpired = new Date(now.getTime() - (24 * 60 * 60 * 1000 + 1000)); // 86,401s ago

            // A. Exactly 24 hours ago (86,400,000 ms)
            const statusExact = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: exact24hAgo.toISOString() }]
            });
            expect(statusExact.inside24hWindow).toBe(true);
            expect(statusExact.remainingSeconds).toBe(0);

            // B. 86,401 seconds ago (just expired)
            const statusExpired = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: justExpired.toISOString() }]
            });
            expect(statusExpired.inside24hWindow).toBe(false);
            expect(statusExpired.reason).toBe('OUTSIDE_24H_WINDOW');
            expect(statusExpired.remainingSeconds).toBe(0);
        });

        it('ADV-1.3: Outgoing agent messages do NOT reset or extend the customer service window', async () => {
            // Customer messaged 26 hours ago; agent replied 10 minutes ago
            const twentySixHoursAgo = Math.floor(Date.now() / 1000) - (26 * 3600);
            const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

            currentMockMessages = [
                { id: 1, message_type: 0, created_at: twentySixHoursAgo }, // incoming customer
                { id: 2, message_type: 1, created_at: tenMinutesAgo }      // outgoing agent
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .send({
                    content: 'Attempting to piggyback on recent outgoing agent message'
                });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('OUTSIDE_24H_WINDOW');
            expect(res.body.windowStatus.inside24hWindow).toBe(false);
        });

        it('ADV-1.4: Handles missing, null, or malformed incoming timestamps safely without throwing', async () => {
            const now = new Date('2026-10-25T12:00:00.000Z');

            // 1. created_at is null
            const resNull = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: null }]
            });
            expect(resNull.inside24hWindow).toBe(false);

            // 2. created_at is invalid string
            const resInvalid = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: 'not-a-valid-date' }]
            });
            expect(resInvalid.inside24hWindow).toBe(false);

            // 3. empty messages
            const resEmpty = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: []
            });
            expect(resEmpty.inside24hWindow).toBe(false);
            expect(resEmpty.reason).toBe('NO_INCOMING_MESSAGES');

            // 4. all messages outgoing
            const resOutgoingOnly = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 1, created_at: new Date().toISOString() }]
            });
            expect(resOutgoingOnly.inside24hWindow).toBe(false);
            expect(resOutgoingOnly.reason).toBe('NO_INCOMING_MESSAGES');
        });

        it('ADV-1.5: Approved Meta utility template is permitted regardless of 24h window expiration', async () => {
            // Customer message 48 hours ago (well outside 24h)
            const fortyEightHoursAgoSec = Math.floor(Date.now() / 1000) - (48 * 3600);
            currentMockMessages = [
                { id: 101, content: 'Old inquiry', message_type: 0, created_at: fortyEightHoursAgoSec }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .send({
                    isTemplate: true,
                    templateName: 'customer_inquiry_start',
                    templateParams: ['Customer Name', 'TRG-ACT-1001']
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            // Check that Chatwoot received the template params
            const postCall = capturedAxiosCalls.find(c => c.method === 'post' && c.url.includes('/messages'));
            expect(postCall).toBeDefined();
            expect(postCall.data.template_params.name).toBe('customer_inquiry_start');
        });

        it('ADV-1.6: Supports Unix seconds timestamps vs milliseconds timestamps in Chatwoot messages', async () => {
            const now = new Date('2026-10-25T12:00:00.000Z');
            const oneHourAgoSec = Math.floor(now.getTime() / 1000) - 3600;
            const oneHourAgoMs = now.getTime() - 3600 * 1000;

            // Unix seconds format (e.g. Chatwoot standard 1792880000)
            const resSec = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: oneHourAgoSec }]
            });
            expect(resSec.inside24hWindow).toBe(true);
            expect(resSec.remainingSeconds).toBeGreaterThan(80000);

            // Milliseconds format (1792880000000)
            const resMs = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: oneHourAgoMs }]
            });
            expect(resMs.inside24hWindow).toBe(true);
            expect(resMs.remainingSeconds).toBeGreaterThan(80000);
        });

        it('ADV-1.7: Unordered messages correctly identify latest incoming customer scan', async () => {
            const now = new Date('2026-10-25T12:00:00.000Z');
            const thirtyHoursAgo = new Date(now.getTime() - 30 * 3600 * 1000).toISOString();
            const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
            const tenHoursAgo = new Date(now.getTime() - 10 * 3600 * 1000).toISOString();

            // Provided out of order
            const res = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [
                    { id: 1, message_type: 0, created_at: thirtyHoursAgo },
                    { id: 2, message_type: 0, created_at: twoHoursAgo },   // latest!
                    { id: 3, message_type: 0, created_at: tenHoursAgo }
                ]
            });

            expect(res.inside24hWindow).toBe(true);
            expect(res.lastIncomingMessage.id).toBe(2);
        });

        it('ADV-1.8: Attempt to bypass 24h window by sending isTemplate: true without templateName', async () => {
            // Customer message 30 hours ago
            currentMockMessages = [
                { id: 101, content: 'Old inquiry', message_type: 0, created_at: Math.floor(Date.now() / 1000) - 30 * 3600 }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .send({
                    content: 'Bypassing window with isTemplate true but no templateName',
                    isTemplate: true
                    // templateName omitted
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('INVALID_TEMPLATE_NAME');
            expect(res.body.error).toContain('Template name is required');
        });

        it('ADV-1.9: Clock skew check when customer message timestamp is slightly in the future', async () => {
            const now = new Date('2026-10-25T12:00:00.000Z');
            // A. Customer message 2 seconds in the future due to server clock drift (tolerated)
            const futureTimestamp2s = new Date(now.getTime() + 2000).toISOString();

            const resTolerated = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 1, message_type: 0, created_at: futureTimestamp2s }]
            });

            expect(resTolerated.inside24hWindow).toBe(true);
            expect(resTolerated.reason).toBe('INSIDE_WINDOW');
            expect(resTolerated.remainingSeconds).toBe(86400);

            // B. Customer message 120 seconds in the future (exceeds 60s tolerance)
            const futureTimestamp120s = new Date(now.getTime() + 120000).toISOString();

            const resExceeded = await chatwootService.checkCustomer24hWindow(null, {
                now,
                messages: [{ id: 2, message_type: 0, created_at: futureTimestamp120s }]
            });

            expect(resExceeded.inside24hWindow).toBe(false);
            expect(resExceeded.reason).toBe('OUTSIDE_24H_WINDOW');
            expect(resExceeded.remainingSeconds).toBe(0);
        });

        it('ADV-1.10: String boolean type juggling (isTemplate: "false") against window check', async () => {
            // Customer message 30 hours ago
            currentMockMessages = [
                { id: 101, content: 'Old inquiry', message_type: 0, created_at: Math.floor(Date.now() / 1000) - 30 * 3600 }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .send({
                    content: 'Testing string false for isTemplate',
                    isTemplate: 'false'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('OUTSIDE_24H_WINDOW');
        });
    });

    describe('ADVERSARIAL SUITE 2: Per-Agent Token Security & Attribution', () => {
        it('ADV-2.1: Rejects reply with HTTP 403 NO_CHATWOOT_TOKEN when agent has chatwootAccessToken = null', async () => {
            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenNoToken}`)
                .send({ content: 'Hello from agent without token' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('NO_CHATWOOT_TOKEN');
            expect(res.body.error).toContain('Chatwoot personal access token');
            expect(capturedAxiosCalls.length).toBe(0);
        });

        it('ADV-2.2: Rejects reply with HTTP 403 NO_CHATWOOT_TOKEN when agent has corrupted/tampered ciphertext envelope', async () => {
            currentMockMessages = [
                { id: 1, message_type: 0, created_at: Math.floor(Date.now() / 1000) - 300 }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenCorrupted}`)
                .send({ content: 'Hello from agent with corrupted token' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('NO_CHATWOOT_TOKEN');
            expect(res.body.error).toContain('Failed to decrypt Chatwoot personal access token');
            expect(capturedAxiosCalls.length).toBe(0);
        });

        it('ADV-2.3: Decrypts valid token at runtime and passes via api_access_token header to Chatwoot', async () => {
            // Setup active window
            currentMockMessages = [
                { id: 1, message_type: 0, created_at: Math.floor(Date.now() / 1000) - 300 }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .send({ content: 'Valid message from authenticated agent' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const postCall = capturedAxiosCalls.find(c => c.method === 'post' && c.url.includes('/messages'));
            expect(postCall).toBeDefined();
            expect(postCall.headers).toBeDefined();
            expect(postCall.headers.api_access_token).toBe('cw_pat_live_super_secret_agent_token_12345');
        });

        it('ADV-2.4: API responses never leak plaintext token in response body or headers', async () => {
            currentMockMessages = [
                { id: 1, message_type: 0, created_at: Math.floor(Date.now() / 1000) - 300 }
            ];

            const res = await request(app)
                .post('/api/support/conversations/201/messages')
                .set('Authorization', `Bearer ${testAuthTokenValid}`)
                .send({ content: 'Test token leakage' });

            const jsonString = JSON.stringify(res.body);
            expect(jsonString).not.toContain('cw_pat_live_super_secret_agent_token_12345');
            expect(JSON.stringify(res.headers)).not.toContain('cw_pat_live_super_secret_agent_token_12345');
        });

        it('ADV-2.5: User management endpoints mask token as •••••••• for admins and omit for non-admins', async () => {
            const adminUser = {
                id: 'admin-01',
                email: 'admin@target-kw.com',
                role: 'admin',
                active: true
            };
            const nonAdminStaff = {
                id: 'staff-01',
                email: 'staff@target-kw.com',
                role: 'staff',
                active: true
            };

            const userWithSecret = {
                id: 'target-user-01',
                name: 'Agent With Token',
                email: 'agent@target.com',
                role: 'staff',
                chatwootAccessToken: JSON.stringify(fieldEncryption.encrypt('my_secret_token')),
                chatwootUserId: 'cw_123',
                chatwootEmail: 'cw@target.com'
            };

            prisma.user.findMany = jest.fn().mockResolvedValue([userWithSecret]);
            prisma.user.findUnique = jest.fn().mockResolvedValue(userWithSecret);

            // A. Admin requesting GET /api/users
            const adminReq = { user: adminUser, query: {} };
            let adminResData = null;
            const adminRes = {
                status: (code) => ({
                    json: (data) => { adminResData = data; return data; }
                })
            };
            await userController.getUsers(adminReq, adminRes);

            expect(adminResData.data[0].chatwootAccessToken).toBe('••••••••');
            expect(adminResData.data[0].chatwootAccessToken).not.toContain('my_secret_token');

            // B. Non-admin staff requesting GET /api/users
            const staffReq = { user: nonAdminStaff, query: {} };
            let staffResData = null;
            const staffRes = {
                status: (code) => ({
                    json: (data) => { staffResData = data; return data; }
                })
            };
            await userController.getUsers(staffReq, staffRes);

            expect(staffResData.data[0].chatwootAccessToken).toBeUndefined();
            expect(staffResData.data[0].chatwootUserId).toBeUndefined();
        });

        it('ADV-2.6: Non-admin users are strictly blocked from configuring Chatwoot tokens (HTTP 403)', async () => {
            const nonAdminStaff = {
                id: 'staff-01',
                email: 'staff@target-kw.com',
                role: 'staff',
                active: true
            };

            // Non-admin attempting to create a user with chatwootAccessToken
            const createReq = {
                user: nonAdminStaff,
                body: {
                    name: 'Test',
                    email: 'test@example.com',
                    password: 'password1234',
                    chatwootAccessToken: 'injected_token'
                }
            };
            let createResStatus = 0;
            let createResData = null;
            const createRes = {
                status: (code) => {
                    createResStatus = code;
                    return { json: (d) => { createResData = d; } };
                }
            };
            await userController.createUser(createReq, createRes);
            expect(createResStatus).toBe(403);
            expect(createResData.error).toContain('Only administrators can configure Chatwoot access tokens');

            // Non-admin attempting to update a user with chatwootAccessToken
            const updateReq = {
                user: nonAdminStaff,
                params: { id: 'some-user-id' },
                body: {
                    chatwootAccessToken: 'injected_token_update'
                }
            };
            let updateResStatus = 0;
            let updateResData = null;
            const updateRes = {
                status: (code) => {
                    updateResStatus = code;
                    return { json: (d) => { updateResData = d; } };
                }
            };
            await userController.updateUser(updateReq, updateRes);
            expect(updateResStatus).toBe(403);
            expect(updateResData.error).toContain('Only administrators can configure Chatwoot access tokens');
        });
    });
});
