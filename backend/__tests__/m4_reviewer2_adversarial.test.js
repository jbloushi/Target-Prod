/**
 * Target Logistics 3PL Platform - Milestone 4 Reviewer 2 / Adversarial Critic Test Suite
 * File: backend/__tests__/m4_reviewer2_adversarial.test.js
 */

const axios = require('axios');
const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const chatwootService = require('../src/services/chatwootNotificationService');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');

jest.mock('axios');

describe('Milestone 4 Reviewer 2: Adversarial Failover, Audit, and Safety Guard Stress Tests', () => {
    let mockClientRequest;
    let mockMessages;
    let createdLogs;
    let updatedLogs;

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();

        mockMessages = [];
        createdLogs = [];
        updatedLogs = [];

        // Mock Chatwoot API Client
        mockClientRequest = jest.fn().mockImplementation(async (reqConfig) => {
            const { method, url, data, params, headers } = reqConfig;
            const m = String(method).toLowerCase();

            if (m === 'get' && url.includes('/contacts/search')) {
                return {
                    data: {
                        payload: [{ id: 901, phone_number: '+96599112233', custom_attributes: { role: 'receiver' } }]
                    }
                };
            }
            if (m === 'post' && url.endsWith('/contacts')) {
                return {
                    data: {
                        payload: { contact: { id: 901, phone_number: data?.phone_number || '+96599112233' } }
                    }
                };
            }
            if (m === 'get' && url.includes('/conversations') && url.includes('/contacts/')) {
                return { data: { payload: [{ id: 902, status: 'open' }] } };
            }
            if (m === 'post' && url.endsWith('/conversations')) {
                return { data: { payload: { id: 902, status: 'open' } } };
            }
            if (m === 'post' && url.includes('/custom_attributes')) {
                return { data: { payload: { id: 902 } } };
            }
            if (m === 'post' && url.includes('/labels')) {
                return { data: { payload: ['receiver'] } };
            }
            if (m === 'post' && url.includes('/messages')) {
                const newMsg = {
                    id: mockMessages.length + 9001,
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

        // Mock microservice POST response (https://msg.target-kw.com/api/send)
        axios.post.mockResolvedValue({
            data: { status: 'sent', messageId: 'wamid.SW_MOCK_SUCCESS' }
        });

        // Prisma mocks
        jest.spyOn(prisma.shipmentNotificationLog, 'create').mockImplementation(async ({ data }) => {
            const row = { id: `log_adv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, ...data };
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
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // 1. Fallback Failover Trigger Variations
    // =========================================================================
    describe('1. Fallback Failover Trigger Spectrum', () => {
        const errorScenarios = [
            { desc: 'HTTP 500 Internal Server Error', err: Object.assign(new Error('Internal Server Error'), { response: { status: 500 } }) },
            { desc: 'HTTP 503 Service Unavailable', err: Object.assign(new Error('Service Unavailable'), { response: { status: 503 } }) },
            { desc: 'HTTP 504 Gateway Timeout', err: Object.assign(new Error('Gateway Timeout'), { response: { status: 504 } }) },
            { desc: 'Error status property 502 without response object', err: Object.assign(new Error('Bad Gateway'), { status: 502 }) },
            { desc: 'ETIMEDOUT error code', err: Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' }) },
            { desc: 'ECONNABORTED axios timeout', err: Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }) },
            { desc: 'ECONNREFUSED network error', err: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) },
            { desc: 'ENOTFOUND DNS lookup failure', err: Object.assign(new Error('getaddrinfo ENOTFOUND inbox.mawthook.io'), { code: 'ENOTFOUND' }) },
            { desc: 'ENETUNREACH Network unreachable', err: Object.assign(new Error('Network unreachable'), { code: 'ENETUNREACH' }) }
        ];

        errorScenarios.forEach(({ desc, err }, idx) => {
            test(`1.${idx + 1} Trigger failover on ${desc}`, async () => {
                mockClientRequest.mockImplementation(async (reqConfig) => {
                    if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                        throw err;
                    }
                    if (reqConfig.url.includes('/contacts')) return { data: { payload: { contact: { id: 901 } } } };
                    if (reqConfig.url.includes('/conversations')) return { data: { payload: { id: 902 } } };
                    return { data: { success: true } };
                });

                axios.post.mockResolvedValueOnce({
                    data: { status: 'sent', messageId: `wamid.SW_FAILOVER_${idx}` }
                });

                const shipment = {
                    id: `shp-adv-failover-${idx}`,
                    trackingNumber: `TRG-ADV-${idx}`,
                    destination: { phone: '+96599112233' },
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
                expect(result.externalMessageId).toBe(`wamid.SW_FAILOVER_${idx}`);

                // Check microservice call occurred
                expect(axios.post).toHaveBeenCalledWith(
                    expect.stringContaining('https://msg.target-kw.com/api/send'),
                    expect.objectContaining({ templateName: 'target_shipment_delivered' }),
                    expect.any(Object)
                );

                // Check audit log
                const latest = updatedLogs[updatedLogs.length - 1];
                expect(latest.status).toBe('SENT');
                expect(latest.isFallback).toBe(true);
                expect(latest.provider).toBe('fallback');
                expect(latest.fallbackReason).toBeDefined();
            });
        });

        test('1.10 Chatwoot unconfigured / incomplete configuration error triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    throw new Error('Chatwoot configuration incomplete: inbox not configured');
                }
                if (reqConfig.url.includes('/contacts')) return { data: { payload: { contact: { id: 901 } } } };
                if (reqConfig.url.includes('/conversations')) return { data: { payload: { id: 902 } } };
                return { data: { success: true } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_UNCONFIGURED_FALLBACK' }
            });

            const shipment = {
                id: 'shp-adv-unconfigured',
                trackingNumber: 'TRG-ADV-UNCONFIGURED',
                destination: { phone: '+96599112233' },
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
            expect(result.externalMessageId).toBe('wamid.SW_UNCONFIGURED_FALLBACK');
        });
    });

    // =========================================================================
    // 2. Non-Fallback 4xx / Validation Error Isolation
    // =========================================================================
    describe('2. Non-Fallback 4xx and Validation Error Isolation', () => {
        test('2.1 Chatwoot 400 Bad Request does NOT trigger fallback and marks log as FAILED', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Template parameters mismatch');
                    err.response = { status: 400, data: { error: 'Template parameters mismatch', code: 400 } };
                    throw err;
                }
                if (reqConfig.url.includes('/contacts')) return { data: { payload: { contact: { id: 901 } } } };
                if (reqConfig.url.includes('/conversations')) return { data: { payload: { id: 902 } } };
                return { data: { success: true } };
            });

            const shipment = {
                id: 'shp-adv-400',
                trackingNumber: 'TRG-ADV-400',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            })).rejects.toThrow('Template parameters mismatch');

            // Crucial: Fallback microservice MUST NOT be called!
            expect(axios.post).not.toHaveBeenCalled();

            // Notification log must record FAILED under chatwoot, NOT fallback
            const latest = updatedLogs[updatedLogs.length - 1];
            expect(latest.status).toBe('FAILED');
            expect(latest.errorMessage).toBe('Template parameters mismatch');
            expect(latest.isFallback).toBeUndefined(); // never touched fallback
        });

        test('2.2 Chatwoot 401 Unauthorized does NOT trigger fallback', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Unauthorized');
                    err.response = { status: 401, data: { error: 'Invalid API token' } };
                    throw err;
                }
                if (reqConfig.url.includes('/contacts')) return { data: { payload: { contact: { id: 901 } } } };
                if (reqConfig.url.includes('/conversations')) return { data: { payload: { id: 902 } } };
                return { data: { success: true } };
            });

            const shipment = {
                id: 'shp-adv-401',
                trackingNumber: 'TRG-ADV-401',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            })).rejects.toThrow('Unauthorized');

            expect(axios.post).not.toHaveBeenCalled();
            const latest = updatedLogs[updatedLogs.length - 1];
            expect(latest.status).toBe('FAILED');
        });
    });

    // =========================================================================
    // 3. Double Failure Robustness
    // =========================================================================
    describe('3. Double Failure Robustness', () => {
        test('3.1 Both Chatwoot and Fallback Microservice fail: comprehensive audit logging', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Chatwoot 503 Service Unavailable');
                    err.response = { status: 503 };
                    throw err;
                }
                if (reqConfig.url.includes('/contacts')) return { data: { payload: { contact: { id: 901 } } } };
                if (reqConfig.url.includes('/conversations')) return { data: { payload: { id: 902 } } };
                return { data: { success: true } };
            });

            axios.post.mockRejectedValueOnce(new Error('Microservice down: Connection reset by peer'));

            const shipment = {
                id: 'shp-adv-double-fail',
                trackingNumber: 'TRG-ADV-DOUBLE-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            await expect(whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            })).rejects.toThrow('Microservice down: Connection reset by peer');

            const latest = updatedLogs[updatedLogs.length - 1];
            expect(latest.status).toBe('FAILED');
            expect(latest.provider).toBe('fallback');
            expect(latest.isFallback).toBe(true);
            expect(latest.errorMessage).toContain('Microservice down: Connection reset by peer');
            expect(latest.fallbackReason).toContain('503');
            expect(latest.fallbackReason).toContain('Connection reset by peer');
        });
    });

    // =========================================================================
    // 4. Admin Provider Overrides
    // =========================================================================
    describe('4. Explicit Admin Provider Overrides', () => {
        test('4.1 provider: TARGET_MSG routes directly to microservice with isFallback: false', async () => {
            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.TARGET_MSG_001' }
            });

            const shipment = {
                id: 'shp-adv-target-msg',
                trackingNumber: 'TRG-ADV-TMSG',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'TARGET_MSG'
            });

            expect(result.status).toBe('SENT');
            expect(result.provider).toBe('SHIPMENT_WHATSAPP');
            expect(result.isFallback).toBe(false);

            const latest = updatedLogs[updatedLogs.length - 1];
            expect(latest.provider).toBe('SHIPMENT_WHATSAPP');
            expect(latest.isFallback).toBe(false);
            expect(latest.fallbackReason).toBeNull();
        });
    });

    // =========================================================================
    // 5. Safety Guards Retention Under Extreme Scenarios
    // =========================================================================
    describe('5. Safety Guards Retention Under Stress', () => {
        test('5.1 In-transit shipment >36h old is NOT dropped by age guard (only delivered shipments are guarded)', async () => {
            // Shipment created 50h ago, but status is in_transit (not delivered)
            const shipment = {
                id: 'shp-adv-active-old',
                trackingNumber: 'TRG-ACTIVE-OLD',
                status: 'in_transit',
                createdAt: new Date(Date.now() - 50 * 3600 * 1000),
                destination: { phone: '+96599112233' }
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            // Must NOT be dropped as historical!
            expect(result.status).toBe('SENT');
            expect(result.provider).toBe('chatwoot');
        });

        test('5.2 Delivered shipment >36h IS dropped by age guard', async () => {
            const shipment = {
                id: 'shp-adv-delivered-old',
                trackingNumber: 'TRG-DELIVERED-OLD',
                status: 'delivered',
                createdAt: new Date(Date.now() - 50 * 3600 * 1000),
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
        });

        test('5.3 LocationToken auto-generation generates valid 64-hex char token if expired', async () => {
            const shipmentWithExpiredToken = {
                id: 'shp-adv-expired-tok',
                trackingNumber: 'TRG-EXPIRED-TOK',
                locationToken: 'loc_old_expired_token',
                locationTokenExpiresAt: new Date(Date.now() - 3600 * 1000), // expired 1h ago
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            const updateSpy = jest.spyOn(prisma.shipment, 'update');

            await whatsappService.sendNotification({
                shipment: shipmentWithExpiredToken,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    locationToken: expect.stringMatching(/^loc_[a-f0-9]{64}$/)
                })
            }));
        });
    });
});
