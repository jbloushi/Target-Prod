/**
 * Target Logistics 3PL Platform - Milestone 4 Challenger 1 Adversarial Suite
 * File: backend/__tests__/m4_challenger1_window.test.js
 *
 * Adversarial Challenge Targets (DISPATCH.md & ORIGINAL_REQUEST.md):
 * 1. Window Boundary Conditions:
 *    - Exactly 23h 59m 50s elapsed: free text must succeed.
 *    - Exactly 24h 00m 10s elapsed: free text must fail with code === 'OUTSIDE_24H_WINDOW' and status 400.
 *    - Exact 24h 00m 00s boundary (86,400,000ms) and sub-second precision.
 *    - Future timestamps / clock skew handling.
 *    - Timestamp format invariance (Unix seconds, milliseconds, ISO 8601).
 * 2. Missing Customer Activity:
 *    - Empty messages array: free text must be rejected with OUTSIDE_24H_WINDOW & NO_INCOMING_MESSAGES.
 *    - Only outgoing messages (message_type === 1 or 'outgoing'): free text rejected.
 *    - Outgoing messages must not falsely reopen expired window.
 *    - Out-of-order incoming messages sort resolution.
 *    - Chatwoot messages GET API failure resilience.
 * 3. Template Bypass Invariance:
 *    - Outside window (5 days, 30 days) or 0 incoming messages: pre-approved Meta templates ALWAYS succeed.
 *    - Template bypass must not trigger GET /messages API call.
 *    - Invariance across payload.template_params, payload.templateName, options.isTemplate.
 * 4. Backfill & Administrative Overrides:
 *    - options.skipWindowCheck: true allows free-text messages regardless of timestamps or missing messages.
 * 5. Per-Agent Attribution Security:
 *    - options.userAccessToken supplied: headers contain api_access_token.
 *    - options.userAccessToken omitted: headers is undefined (no undefined injection or header corruption).
 *    - Sequential isolation across disparate agents without token leakage.
 */

const axios = require('axios');
const chatwootService = require('../src/services/chatwootNotificationService');
const { prisma } = require('../src/config/database');

// Mock external HTTP requests: zero live network calls
jest.mock('axios');

describe('Milestone 4 Adversarial Challenge: 24h Customer Service Window & Attribution Security', () => {
    let mockClientRequest;
    let mockConversationMessages;
    let recordedOutgoingMessages;

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();

        mockConversationMessages = [];
        recordedOutgoingMessages = [];

        // Mock Chatwoot API v1 axios instance
        mockClientRequest = jest.fn().mockImplementation(async (reqConfig) => {
            const { method, url, data, params, headers } = reqConfig;
            const m = String(method).toLowerCase();

            // GET conversation messages
            if (m === 'get' && url.includes('/messages')) {
                return {
                    data: {
                        payload: mockConversationMessages
                    }
                };
            }

            // POST conversation message
            if (m === 'post' && url.includes('/messages')) {
                const newMsg = {
                    id: recordedOutgoingMessages.length + 5001,
                    content: data?.content,
                    message_type: data?.message_type || 1,
                    template_params: data?.template_params,
                    created_at: Math.floor(Date.now() / 1000)
                };
                recordedOutgoingMessages.push({
                    message: newMsg,
                    requestConfig: reqConfig,
                    headers,
                    data
                });
                return { data: newMsg };
            }

            return { data: { success: true } };
        });

        axios.create.mockReturnValue({
            defaults: {
                baseURL: 'https://inbox.mawthook.io',
                headers: {
                    api_access_token: 'default_platform_token',
                    'Content-Type': 'application/json'
                }
            },
            request: mockClientRequest
        });
    });

    // =========================================================================
    // 1. Window Boundary Conditions Stress Tests
    // =========================================================================
    describe('1. Window Boundary Conditions (Sub-Second & Precision)', () => {
        const referenceTime = new Date('2026-10-24T18:00:00.000Z');

        test('1.1 Exactly 23h 59m 50s (86,390s) elapsed: free text must succeed and report 10s remaining', async () => {
            // 23 hours, 59 minutes, 50 seconds before referenceTime = exactly 10s remaining in window
            const incomingTimestamp = new Date(referenceTime.getTime() - (23 * 3600 + 59 * 60 + 50) * 1000);
            mockConversationMessages = [
                {
                    id: 101,
                    message_type: 0,
                    content: 'Customer inquiry near boundary',
                    created_at: incomingTimestamp.toISOString()
                }
            ];

            const freeTextPayload = {
                content: 'Response within 10 seconds of 24h window expiration.',
                message_type: 'outgoing'
            };

            const result = await chatwootService.sendMessage(301, freeTextPayload, { now: referenceTime });
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
            expect(recordedOutgoingMessages[0].data.content).toBe(freeTextPayload.content);

            // Verify window status inspection
            const status = await chatwootService.checkCustomer24hWindow(301, { now: referenceTime });
            expect(status.inside24hWindow).toBe(true);
            expect(status.reason).toBe('INSIDE_WINDOW');
            expect(status.remainingSeconds).toBe(10);
            expect(status.expiresAt.toISOString()).toBe(new Date(incomingTimestamp.getTime() + 24 * 3600 * 1000).toISOString());
        });

        test('1.2 Exactly 24h 00m 10s (86,410s) elapsed: free text must fail with OUTSIDE_24H_WINDOW and status 400', async () => {
            // 24 hours, 00 minutes, 10 seconds before referenceTime = expired 10s ago
            const incomingTimestamp = new Date(referenceTime.getTime() - (24 * 3600 + 10) * 1000);
            mockConversationMessages = [
                {
                    id: 102,
                    message_type: 0,
                    content: 'Customer inquiry 10s past boundary',
                    created_at: incomingTimestamp.toISOString()
                }
            ];

            const freeTextPayload = {
                content: 'Attempted response 10 seconds past expiration.',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(301, freeTextPayload, { now: referenceTime })).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400,
                message: expect.stringContaining('Free-text messages are prohibited outside the 24-hour customer service window')
            });

            // Outgoing message POST must NOT have been called
            expect(recordedOutgoingMessages.length).toBe(0);

            // Verify window status details
            const status = await chatwootService.checkCustomer24hWindow(301, { now: referenceTime });
            expect(status.inside24hWindow).toBe(false);
            expect(status.reason).toBe('OUTSIDE_24H_WINDOW');
            expect(status.remainingSeconds).toBe(0);
        });

        test('1.3 Exact 24h 00m 00s (86,400,000ms) boundary: elapsedMs === windowMs must succeed with 0s remaining', async () => {
            // Exactly 24 hours (86,400s) before referenceTime
            const incomingTimestamp = new Date(referenceTime.getTime() - 24 * 3600 * 1000);
            mockConversationMessages = [
                {
                    id: 103,
                    message_type: 'incoming',
                    content: 'Customer inquiry at exact second 86,400',
                    created_at: incomingTimestamp.getTime() // numeric ms
                }
            ];

            const freeTextPayload = {
                content: 'Response at exact 24h threshold.',
                message_type: 'outgoing'
            };

            const result = await chatwootService.sendMessage(301, freeTextPayload, { now: referenceTime });
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);

            const status = await chatwootService.checkCustomer24hWindow(301, { now: referenceTime });
            expect(status.inside24hWindow).toBe(true);
            expect(status.remainingSeconds).toBe(0);
        });

        test('1.4 Exactly 24h 00m 01s (86,401,000ms) elapsed: must fail immediately', async () => {
            const incomingTimestamp = new Date(referenceTime.getTime() - (24 * 3600 + 1) * 1000);
            mockConversationMessages = [
                {
                    id: 104,
                    message_type: 0,
                    content: 'Customer inquiry 1 second expired',
                    created_at: Math.floor(incomingTimestamp.getTime() / 1000) // numeric seconds
                }
            ];

            const freeTextPayload = {
                content: 'Response 1 second late.',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(301, freeTextPayload, { now: referenceTime })).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400
            });
            expect(recordedOutgoingMessages.length).toBe(0);
        });

        test('1.5 Future timestamp anomaly (server clock skew): negative elapsed time must be rejected', async () => {
            // Customer message timestamp is 45 seconds ahead of server clock
            const futureTimestamp = new Date(referenceTime.getTime() + 45 * 1000);
            mockConversationMessages = [
                {
                    id: 105,
                    message_type: 0,
                    content: 'Customer message from the future',
                    created_at: futureTimestamp.toISOString()
                }
            ];

            const freeTextPayload = {
                content: 'Response to future message.',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(301, freeTextPayload, { now: referenceTime })).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400
            });
            expect(recordedOutgoingMessages.length).toBe(0);

            const status = await chatwootService.checkCustomer24hWindow(301, { now: referenceTime });
            expect(status.inside24hWindow).toBe(false);
            expect(status.reason).toBe('OUTSIDE_24H_WINDOW');
        });

        test('1.6 Timestamp format invariance: Unix seconds, Unix milliseconds, and ISO string evaluate identically', async () => {
            const elapsedSeconds = 12 * 3600; // 12 hours ago
            const dateObj = new Date(referenceTime.getTime() - elapsedSeconds * 1000);

            const testFormats = [
                { desc: 'Unix seconds (<1e12)', val: Math.floor(dateObj.getTime() / 1000) },
                { desc: 'Unix milliseconds (>=1e12)', val: dateObj.getTime() },
                { desc: 'ISO 8601 string', val: dateObj.toISOString() }
            ];

            for (const { desc, val } of testFormats) {
                mockConversationMessages = [
                    {
                        id: 106,
                        message_type: 0,
                        content: `Test format ${desc}`,
                        created_at: val
                    }
                ];

                const status = await chatwootService.checkCustomer24hWindow(301, { now: referenceTime });
                expect(status.inside24hWindow).toBe(true);
                expect(status.lastIncomingTimestamp.getTime()).toBe(dateObj.getTime());
                expect(status.remainingSeconds).toBe(12 * 3600);
            }
        });
    });

    // =========================================================================
    // 2. Missing Customer Activity & Malformed Responses
    // =========================================================================
    describe('2. Missing Customer Activity & Edge Cases', () => {
        test('2.1 Empty messages array [] rejects free text with NO_INCOMING_MESSAGES', async () => {
            mockConversationMessages = [];

            const freeTextPayload = {
                content: 'Proactive cold outreach attempt without customer message.',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(302, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400,
                windowStatus: expect.objectContaining({
                    inside24hWindow: false,
                    reason: 'NO_INCOMING_MESSAGES',
                    lastIncomingMessage: null,
                    remainingSeconds: 0
                })
            });

            expect(recordedOutgoingMessages.length).toBe(0);
        });

        test('2.2 Non-standard API responses (null, undefined, malformed object) fail safe', async () => {
            // Chatwoot API returns unexpected shape
            mockClientRequest.mockImplementationOnce(async () => ({
                data: { payload: null }
            }));

            const freeTextPayload = {
                content: 'Test null payload handling',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(302, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400
            });
            expect(recordedOutgoingMessages.length).toBe(0);
        });

        test('2.3 Conversation with only outgoing messages rejects free text', async () => {
            mockConversationMessages = [
                { id: 1, message_type: 1, content: 'Bot greeting', created_at: Math.floor(Date.now() / 1000) },
                { id: 2, message_type: 'outgoing', content: 'Agent follow-up', created_at: Math.floor(Date.now() / 1000) },
                { id: 3, message_type: 1, template_params: { name: 'target_shipment_created' }, created_at: Math.floor(Date.now() / 1000) }
            ];

            const freeTextPayload = {
                content: 'Another outgoing free-text without customer inbound',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(302, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400,
                windowStatus: expect.objectContaining({
                    reason: 'NO_INCOMING_MESSAGES'
                })
            });
            expect(recordedOutgoingMessages.length).toBe(0);
        });

        test('2.4 Recent outgoing message (10m ago) does NOT reset or reopen an expired window', async () => {
            const twentySixHoursAgo = Math.floor((Date.now() - 26 * 3600 * 1000) / 1000);
            const tenMinutesAgo = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);

            mockConversationMessages = [
                // Old incoming customer message >24h ago
                { id: 201, message_type: 0, content: 'Customer asked 26h ago', created_at: twentySixHoursAgo },
                // Recent outgoing agent message 10m ago
                { id: 202, message_type: 1, content: 'Agent responded 10m ago', created_at: tenMinutesAgo }
            ];

            const freeTextPayload = {
                content: 'Subsequent agent reply outside 24h window',
                message_type: 'outgoing'
            };

            // Must strictly fail because window is measured from the customer inbound, not agent outbound!
            await expect(chatwootService.sendMessage(302, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400,
                windowStatus: expect.objectContaining({
                    reason: 'OUTSIDE_24H_WINDOW'
                })
            });
            expect(recordedOutgoingMessages.length).toBe(0);
        });

        test('2.5 Multiple incoming messages in reverse/unsorted order correctly finds latest timestamp', async () => {
            const twoHoursAgo = Math.floor((Date.now() - 2 * 3600 * 1000) / 1000);
            const fortyEightHoursAgo = Math.floor((Date.now() - 48 * 3600 * 1000) / 1000);
            const tenHoursAgo = Math.floor((Date.now() - 10 * 3600 * 1000) / 1000);

            // Array is intentionally not sorted by timestamp
            mockConversationMessages = [
                { id: 301, message_type: 0, content: 'Middle message', created_at: tenHoursAgo },
                { id: 302, message_type: 0, content: 'Oldest message', created_at: fortyEightHoursAgo },
                { id: 303, message_type: 0, content: 'Newest message', created_at: twoHoursAgo }
            ];

            const freeTextPayload = {
                content: 'Response honoring the latest incoming message.',
                message_type: 'outgoing'
            };

            const result = await chatwootService.sendMessage(302, freeTextPayload);
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);

            const status = await chatwootService.checkCustomer24hWindow(302);
            expect(status.inside24hWindow).toBe(true);
            expect(status.lastIncomingMessage.id).toBe(303);
            expect(status.lastIncomingTimestamp.getTime()).toBe(twoHoursAgo * 1000);
        });

        test('2.6 Chatwoot messages GET failure (404/500/network error) fails safe and rejects free text', async () => {
            mockClientRequest.mockImplementationOnce(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'get' && reqConfig.url.includes('/messages')) {
                    const error = new Error('Chatwoot GET /messages network timeout');
                    error.code = 'ETIMEDOUT';
                    throw error;
                }
                return { data: { success: true } };
            });

            const freeTextPayload = {
                content: 'Attempt when messages service is unreachable',
                message_type: 'outgoing'
            };

            await expect(chatwootService.sendMessage(302, freeTextPayload)).rejects.toMatchObject({
                code: 'OUTSIDE_24H_WINDOW',
                status: 400,
                windowStatus: expect.objectContaining({
                    inside24hWindow: false,
                    reason: 'NO_INCOMING_MESSAGES'
                })
            });
            expect(recordedOutgoingMessages.length).toBe(0);
        });
    });

    // =========================================================================
    // 3. Template Bypass Invariance Under Extreme Window Expiry
    // =========================================================================
    describe('3. Template Bypass Invariance', () => {
        test('3.1 Approved Meta template succeeds when customer incoming message was 5 days (120h) ago', async () => {
            const fiveDaysAgo = Math.floor((Date.now() - 5 * 24 * 3600 * 1000) / 1000);
            mockConversationMessages = [
                { id: 401, message_type: 0, content: '5 days old inquiry', created_at: fiveDaysAgo }
            ];

            const templatePayload = {
                content: 'Milestone update template',
                message_type: 'outgoing',
                template_params: {
                    name: 'target_shipment_delivered',
                    category: 'UTILITY',
                    language: 'en'
                }
            };

            const result = await chatwootService.sendMessage(303, templatePayload);
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
            expect(recordedOutgoingMessages[0].data.template_params.name).toBe('target_shipment_delivered');

            // Verify GET /messages was NOT even called by sendMessage (complete bypass)
            const getCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'get' && c[0].url.includes('/messages'));
            expect(getCalls.length).toBe(0);
        });

        test('3.2 Approved Meta template succeeds when customer incoming was 30 days (720h) ago', async () => {
            const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
            mockConversationMessages = [
                { id: 402, message_type: 0, content: 'A month ago', created_at: thirtyDaysAgo }
            ];

            const templatePayload = {
                content: 'Payment request template',
                message_type: 'outgoing',
                template_params: {
                    name: 'payment_request_v1',
                    category: 'UTILITY',
                    language: 'en'
                }
            };

            const result = await chatwootService.sendMessage(303, templatePayload);
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
            expect(recordedOutgoingMessages[0].data.template_params.name).toBe('payment_request_v1');
        });

        test('3.3 Approved Meta template succeeds with ZERO incoming messages (empty conversation)', async () => {
            mockConversationMessages = [];

            const templatePayload = {
                content: 'Out for delivery alert',
                message_type: 'outgoing',
                template_params: {
                    name: 'target_shipment_out_for_delivery',
                    category: 'UTILITY',
                    language: 'en'
                }
            };

            const result = await chatwootService.sendMessage(303, templatePayload);
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
            expect(recordedOutgoingMessages[0].data.template_params.name).toBe('target_shipment_out_for_delivery');
        });

        test('3.4 Approved Meta template succeeds even if GET /messages endpoint would fail with 500', async () => {
            // If checkCustomer24hWindow were called, this would throw
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'get' && reqConfig.url.includes('/messages')) {
                    throw new Error('Fatal Chatwoot 500 on messages search');
                }
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const newMsg = { id: 999, data: reqConfig.data };
                    recordedOutgoingMessages.push({ message: newMsg, data: reqConfig.data });
                    return { data: newMsg };
                }
                return { data: { success: true } };
            });

            const templatePayload = {
                content: 'Customs hold notice',
                message_type: 'outgoing',
                template_params: {
                    name: 'target_customs_exception_hold',
                    category: 'UTILITY',
                    language: 'en'
                }
            };

            const result = await chatwootService.sendMessage(303, templatePayload);
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
        });

        test('3.5 Invariance across template declaration methods', async () => {
            const declarationForms = [
                {
                    name: 'Form A: payload.template_params.name',
                    payload: { content: 'T1', message_type: 'outgoing', template_params: { name: 'target_pickup_scheduled' } },
                    options: {}
                },
                {
                    name: 'Form B: payload.templateName',
                    payload: { content: 'T2', message_type: 'outgoing', templateName: 'target_received_at_hub' },
                    options: {}
                },
                {
                    name: 'Form C: options.isTemplate: true',
                    payload: { content: 'T3', message_type: 'outgoing' },
                    options: { isTemplate: true }
                }
            ];

            mockConversationMessages = []; // Zero incoming messages

            for (const { name, payload, options } of declarationForms) {
                const res = await chatwootService.sendMessage(303, payload, options);
                expect(res).toBeDefined();
            }

            expect(recordedOutgoingMessages.length).toBe(3);
        });
    });

    // =========================================================================
    // 4. Backfill & Operational Overrides
    // =========================================================================
    describe('4. Backfill & Administrative Overrides (skipWindowCheck)', () => {
        test('4.1 options.skipWindowCheck: true allows free-text messages when incoming is >24h ago', async () => {
            const tenDaysAgo = Math.floor((Date.now() - 10 * 24 * 3600 * 1000) / 1000);
            mockConversationMessages = [
                { id: 501, message_type: 0, content: 'Ten days ago', created_at: tenDaysAgo }
            ];

            const freeTextPayload = {
                content: 'Historical backfill message record #1',
                message_type: 'outgoing'
            };

            const result = await chatwootService.sendMessage(304, freeTextPayload, { skipWindowCheck: true });
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
            expect(recordedOutgoingMessages[0].data.content).toBe('Historical backfill message record #1');
        });

        test('4.2 options.skipWindowCheck: true allows free-text messages with zero incoming messages', async () => {
            mockConversationMessages = [];

            const freeTextPayload = {
                content: 'Historical backfill message record #2 with no prior inbounds',
                message_type: 'outgoing'
            };

            const result = await chatwootService.sendMessage(304, freeTextPayload, { skipWindowCheck: true });
            expect(result).toBeDefined();
            expect(recordedOutgoingMessages.length).toBe(1);
        });

        test('4.3 options.skipWindowCheck: true completely bypasses GET /messages network call', async () => {
            const freeTextPayload = {
                content: 'Fast backfill import',
                message_type: 'outgoing'
            };

            await chatwootService.sendMessage(304, freeTextPayload, { skipWindowCheck: true });
            
            // Assert that no GET /messages network request was made
            const getCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'get' && c[0].url.includes('/messages'));
            expect(getCalls.length).toBe(0);
        });
    });

    // =========================================================================
    // 5. Per-Agent Attribution & Header Security
    // =========================================================================
    describe('5. Per-Agent Attribution & Header Security', () => {
        test('5.1 Outbound message with options.userAccessToken sends api_access_token in headers', async () => {
            const agentToken = 'cw_pat_agent_sarah_secret_9988';
            const payload = {
                content: 'Agent Sarah replying inside 24h window',
                message_type: 'outgoing'
            };

            // Setup valid incoming message 1h ago
            const oneHourAgo = Math.floor((Date.now() - 3600 * 1000) / 1000);
            mockConversationMessages = [
                { id: 601, message_type: 0, content: 'Need status', created_at: oneHourAgo }
            ];

            await chatwootService.sendMessage(305, payload, { userAccessToken: agentToken });

            expect(recordedOutgoingMessages.length).toBe(1);
            expect(recordedOutgoingMessages[0].headers).toBeDefined();
            expect(recordedOutgoingMessages[0].headers.api_access_token).toBe(agentToken);
        });

        test('5.2 Outbound message without options.userAccessToken passes headers: undefined', async () => {
            const payload = {
                content: 'Automated platform notification',
                message_type: 'outgoing'
            };

            const oneHourAgo = Math.floor((Date.now() - 3600 * 1000) / 1000);
            mockConversationMessages = [
                { id: 602, message_type: 0, content: 'Help please', created_at: oneHourAgo }
            ];

            await chatwootService.sendMessage(305, payload);

            expect(recordedOutgoingMessages.length).toBe(1);
            // Verify that headers is undefined so axios client defaults (platform api_access_token) remain untouched
            expect(recordedOutgoingMessages[0].headers).toBeUndefined();
        });

        test('5.3 Sequential agent requests do not leak or cross-contaminate tokens', async () => {
            const oneHourAgo = Math.floor((Date.now() - 3600 * 1000) / 1000);
            mockConversationMessages = [
                { id: 603, message_type: 0, content: 'Active inquiry', created_at: oneHourAgo }
            ];

            // 1. Agent 1 sends message
            await chatwootService.sendMessage(305, { content: 'Msg 1' }, { userAccessToken: 'token_agent_1' });

            // 2. Agent 2 sends message
            await chatwootService.sendMessage(305, { content: 'Msg 2' }, { userAccessToken: 'token_agent_2' });

            // 3. System / bot sends message (no token)
            await chatwootService.sendMessage(305, { content: 'Msg 3' });

            // 4. Agent 1 sends another message
            await chatwootService.sendMessage(305, { content: 'Msg 4' }, { userAccessToken: 'token_agent_1' });

            expect(recordedOutgoingMessages.length).toBe(4);
            expect(recordedOutgoingMessages[0].headers.api_access_token).toBe('token_agent_1');
            expect(recordedOutgoingMessages[1].headers.api_access_token).toBe('token_agent_2');
            expect(recordedOutgoingMessages[2].headers).toBeUndefined();
            expect(recordedOutgoingMessages[3].headers.api_access_token).toBe('token_agent_1');
        });
    });
});
