/**
 * Target Logistics 3PL Platform - Milestone 4 Challenger 2 Suite
 * File: backend/__tests__/m4_challenger2_failover.test.js
 *
 * Empirical Challenger 2: Adversarial Stress-Testing for:
 * 1. Diverse Failover Triggers (HTTP 500, 502, 503, 504, Timeout ECONNABORTED/ETIMEDOUT, Network ECONNREFUSED/ENOTFOUND/ENETUNREACH, Unconfigured, 4xx non-failover)
 * 2. Audit Logging Accuracy & Microservice Direct Routing (isFallback: true, provider: 'fallback', fallbackReason, buttonUrlParam preservation, existingLogId continuity, direct SHIPMENT_WHATSAPP bypass)
 * 3. Double Failure Handling (Chatwoot 5xx/Timeout + Microservice Failure -> status: FAILED, provider: fallback, isFallback: true, fallbackReason + errorMessage capture)
 * 4. Safety Guard Precedence (Quiet hours, 36h age guard, deduplication, dev-mode safe routing executed BEFORE any network calls)
 */

const axios = require('axios');
const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const chatwootService = require('../src/services/chatwootNotificationService');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');

// Mock external HTTP requests: zero real customer messages and zero live network requests
jest.mock('axios');

describe('Milestone 4 Challenger 2: Failover, Logging & Safety Precedence Suite', () => {
    let mockClientRequest;
    let createdLogs;
    let updatedLogs;

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();

        createdLogs = [];
        updatedLogs = [];

        // Mock Chatwoot API client
        mockClientRequest = jest.fn().mockImplementation(async (reqConfig) => {
            const { method, url, data } = reqConfig;
            const m = String(method).toLowerCase();

            if (m === 'get' && url.includes('/contacts/search')) {
                return {
                    data: {
                        payload: [
                            {
                                id: 501,
                                phone_number: '+96599112233',
                                name: 'Test Consignee',
                                custom_attributes: { role: 'receiver' }
                            }
                        ]
                    }
                };
            }

            if (m === 'post' && url.endsWith('/contacts')) {
                return {
                    data: {
                        payload: {
                            contact: {
                                id: 501,
                                phone_number: data?.phone_number || '+96599112233',
                                name: data?.name || 'Test Consignee',
                                custom_attributes: { role: 'receiver' }
                            }
                        }
                    }
                };
            }

            if (m === 'get' && url.includes('/conversations') && url.includes('/contacts/')) {
                return {
                    data: {
                        payload: [
                            {
                                id: 601,
                                status: 'open',
                                custom_attributes: {}
                            }
                        ]
                    }
                };
            }

            if (m === 'post' && url.endsWith('/conversations')) {
                return {
                    data: {
                        payload: {
                            id: 601,
                            status: 'open'
                        }
                    }
                };
            }

            if (m === 'post' && url.includes('/custom_attributes')) {
                return { data: { payload: { id: 601 } } };
            }

            if (m === 'post' && url.includes('/labels')) {
                return { data: { payload: ['role_receiver'] } };
            }

            if (m === 'get' && url.includes('/messages')) {
                return {
                    data: {
                        payload: [
                            {
                                id: 701,
                                message_type: 0, // incoming
                                content: 'Hello, where is my parcel?',
                                created_at: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago (<24h)
                            }
                        ]
                    }
                };
            }

            if (m === 'post' && url.includes('/messages')) {
                return {
                    data: {
                        id: 801,
                        content: data?.content,
                        message_type: 1,
                        template_params: data?.template_params,
                        created_at: Math.floor(Date.now() / 1000)
                    }
                };
            }

            return { data: { success: true } };
        });

        axios.create.mockReturnValue({
            defaults: { baseURL: 'https://inbox.mawthook.io' },
            request: mockClientRequest
        });

        // Mock fallback microservice POST response (https://msg.target-kw.com/api/send)
        axios.post.mockResolvedValue({
            data: { status: 'sent', messageId: 'wamid.SW_DEFAULT_MOCK' }
        });

        // Mock check-sent GET
        axios.get.mockResolvedValue({
            data: { sent: false }
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

        // Quiet hours and config defaults
        jest.spyOn(chatwootService, 'isConfigured').mockReturnValue(true);
        jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
        jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
            enabled: true,
            provider: 'chatwoot',
            fallbackProvider: 'SHIPMENT_WHATSAPP',
            serviceUrl: 'https://msg.target-kw.com'
        });
    });

    // =========================================================================
    // 1. Diverse Failover Triggers
    // =========================================================================
    describe('1. Diverse Failover Triggers', () => {
        const testShipment = {
            id: 'shp-trig-01',
            trackingNumber: 'TRG-TRIG-01',
            destination: { contactPerson: 'Dana Al-Ghanim', phone: '+96599112233' },
            origin: { contactPerson: 'Sender Hub', phone: '+96597959567' },
            createdAt: new Date()
        };

        test('1.1 HTTP 500 Internal Server Error from Chatwoot triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Request failed with status code 500');
                    err.response = { status: 500, data: { error: 'Internal Server Error' } };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_500' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.externalMessageId).toBe('wamid.SW_FAILOVER_500');
            expect(result.fallbackReason).toContain('500');

            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('https://msg.target-kw.com/api/send'),
                expect.objectContaining({ templateName: 'target_shipment_delivered' }),
                expect.any(Object)
            );
        });

        test('1.2 HTTP 502 Bad Gateway triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Request failed with status code 502');
                    err.response = { status: 502, data: { error: 'Bad Gateway' } };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_502' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('502');
        });

        test('1.3 HTTP 503 Service Unavailable triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Request failed with status code 503');
                    err.response = { status: 503, data: { error: 'Service Unavailable' } };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_503' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('503');
        });

        test('1.4 HTTP 504 Gateway Timeout triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Request failed with status code 504');
                    err.response = { status: 504, data: { error: 'Gateway Timeout' } };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_504' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('504');
        });

        test('1.5 Timeout (>15s / ECONNABORTED) triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('timeout of 15000ms exceeded');
                    err.code = 'ECONNABORTED';
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_TIMEOUT' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toMatch(/ECONNABORTED|timeout/i);
        });

        test('1.6 Network error ECONNREFUSED triggers failover to microservice', async () => {
            mockClientRequest.mockImplementation(async () => {
                const err = new Error('connect ECONNREFUSED 127.0.0.1:443');
                err.code = 'ECONNREFUSED';
                throw err;
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_REFUSED' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('ECONNREFUSED');
        });

        test('1.7 Network error ENOTFOUND (DNS resolution failure) triggers failover', async () => {
            mockClientRequest.mockImplementation(async () => {
                const err = new Error('getaddrinfo ENOTFOUND inbox.mawthook.io');
                err.code = 'ENOTFOUND';
                throw err;
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_NOTFOUND' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('ENOTFOUND');
        });

        test('1.8 Network error ENETUNREACH (network unreachable) triggers failover', async () => {
            mockClientRequest.mockImplementation(async () => {
                const err = new Error('connect ENETUNREACH 10.0.0.1');
                err.code = 'ENETUNREACH';
                throw err;
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_NETUNREACH' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('ENETUNREACH');
        });

        test('1.9 Failure during early contact lookup triggers failover before message creation', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.url.includes('/contacts')) {
                    const err = new Error('Chatwoot DB connection pool exhausted');
                    err.response = { status: 503 };
                    throw err;
                }
                return { data: { success: true } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_EARLY_CONTACT' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
            expect(result.fallbackReason).toContain('503');
        });

        test('1.10 Unconfigured or missing Chatwoot credentials triggers failover', async () => {
            jest.spyOn(chatwootService, 'isConfigured').mockReturnValue(false);

            mockClientRequest.mockImplementation(async () => {
                throw new Error('Chatwoot configuration incomplete (baseUrl or accountId missing)');
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_FAILOVER_UNCONFIGURED' }
            });

            const result = await whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');
        });

        test('1.11 Client error HTTP 400 does NOT failover and records FAILED in log', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Template name target_invalid_xyz does not exist');
                    err.response = { status: 400, data: { error: 'INVALID_TEMPLATE' } };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            await expect(whatsappService.sendNotification({
                shipment: testShipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            })).rejects.toThrow(/target_invalid_xyz/);

            // Verify microservice was NOT called
            expect(axios.post).not.toHaveBeenCalled();

            // Verify log was updated with FAILED, isFallback is NOT true
            const latestUpdate = updatedLogs[updatedLogs.length - 1];
            expect(latestUpdate.status).toBe('FAILED');
            expect(latestUpdate.isFallback).toBeUndefined();
            expect(latestUpdate.errorMessage).toContain('target_invalid_xyz');
        });
    });

    // =========================================================================
    // 2. Audit Logging Accuracy & Microservice Direct Routing
    // =========================================================================
    describe('2. Audit Logging Accuracy & Microservice Direct Routing', () => {
        test('2.1 Fallback records isFallback: true, provider: fallback, and fallbackReason accurately in ShipmentNotificationLog', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Chatwoot 502 Bad Gateway');
                    err.response = { status: 502 };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_ACCURACY_LOG_01' }
            });

            const shipment = {
                id: 'shp-audit-01',
                trackingNumber: 'TRG-AUDIT-01',
                destination: { contactPerson: 'Nasser Al-Kharafi', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper Store', phone: '+96597959567' },
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

            expect(result.isFallback).toBe(true);
            expect(result.provider).toBe('fallback');

            // Verify database log update
            const updateCall = updatedLogs.find(l => l.provider === 'fallback' && l.status === 'SENT');
            expect(updateCall).toBeDefined();
            expect(updateCall.isFallback).toBe(true);
            expect(updateCall.fallbackReason).toContain('502');
            expect(updateCall.chatwootMessageId).toBe('wamid.SW_ACCURACY_LOG_01');
            expect(updateCall.payloadJson.fallback).toBe(true);
            expect(updateCall.payloadJson.primaryError).toContain('502');
            expect(updateCall.sentAt).toBeInstanceOf(Date);
        });

        test('2.2 Button URL parameter (locationToken) is preserved and passed to microservice on fallback', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Chatwoot 504 Gateway Timeout');
                    err.response = { status: 504 };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_TOKEN_FALLBACK_01' }
            });

            const shipment = {
                id: 'shp-token-01',
                trackingNumber: 'TRG-TOKEN-01',
                destination: { contactPerson: 'Consignee Pin', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                locationToken: 'loc_preset_valid_token_abc123',
                locationTokenExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
                createdAt: new Date()
            };

            await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            // Inspect axios.post payload to microservice
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('https://msg.target-kw.com/api/send'),
                expect.objectContaining({
                    rows: expect.arrayContaining([
                        expect.objectContaining({
                            buttonUrlParam: 'loc_preset_valid_token_abc123'
                        })
                    ])
                }),
                expect.any(Object)
            );
        });

        test('2.3 Providing existingLogId updates that specific record upon fallback rather than duplicating', async () => {
            mockClientRequest.mockImplementation(async () => {
                const err = new Error('Chatwoot 500 error');
                err.response = { status: 500 };
                throw err;
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_EXISTING_LOG_01' }
            });

            const shipment = {
                id: 'shp-exist-01',
                trackingNumber: 'TRG-EXIST-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                existingLogId: 'log-existing-12345',
                force: true,
                provider: 'chatwoot'
            });

            // prisma.shipmentNotificationLog.create should NOT be called
            expect(createdLogs.length).toBe(0);

            // All updates should target log-existing-12345
            expect(updatedLogs.every(u => u.id === 'log-existing-12345')).toBe(true);
            const finalUpdate = updatedLogs[updatedLogs.length - 1];
            expect(finalUpdate.status).toBe('SENT');
            expect(finalUpdate.provider).toBe('fallback');
            expect(finalUpdate.isFallback).toBe(true);
        });

        test('2.4 Explicit admin config provider SHIPMENT_WHATSAPP routes directly with isFallback: false', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValueOnce({
                provider: 'SHIPMENT_WHATSAPP',
                serviceUrl: 'https://msg.target-kw.com',
                apiKey: 'secret-key-123'
            });

            axios.post.mockResolvedValueOnce({
                data: { status: 'sent', messageId: 'wamid.SW_DIRECT_ADMIN_CONFIG' }
            });

            const shipment = {
                id: 'shp-direct-01',
                trackingNumber: 'TRG-DIRECT-01',
                destination: { contactPerson: 'Direct Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Direct Shipper', phone: '+96597959567' },
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

            // Chatwoot was never called
            const chatwootMessagesCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/messages'));
            expect(chatwootMessagesCalls.length).toBe(0);

            // DB log records isFallback: false and fallbackReason: null
            const finalUpdate = updatedLogs[updatedLogs.length - 1];
            expect(finalUpdate.provider).toBe('SHIPMENT_WHATSAPP');
            expect(finalUpdate.isFallback).toBe(false);
            expect(finalUpdate.fallbackReason).toBeNull();
        });
    });

    // =========================================================================
    // 3. Double Failure Handling
    // =========================================================================
    describe('3. Double Failure Handling', () => {
        test('3.1 Both Chatwoot and microservice 5xx failures mark log FAILED with root cause captured', async () => {
            // Chatwoot fails with 503
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Chatwoot 503 Service Unavailable');
                    err.response = { status: 503 };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            // Microservice also fails with 500
            axios.post.mockRejectedValueOnce(new Error('WhatsApp microservice connection error: 500 downstream error'));

            const shipment = {
                id: 'shp-dbl-01',
                trackingNumber: 'TRG-DBL-01',
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
            })).rejects.toThrow(/microservice/i);

            // Verify ShipmentNotificationLog persistence
            const finalUpdate = updatedLogs[updatedLogs.length - 1];
            expect(finalUpdate.status).toBe('FAILED');
            expect(finalUpdate.provider).toBe('fallback');
            expect(finalUpdate.isFallback).toBe(true);
            expect(finalUpdate.fallbackReason).toContain('503');
            expect(finalUpdate.fallbackReason).toContain('500 downstream error');
            expect(finalUpdate.errorMessage).toContain('500 downstream error');
        });

        test('3.2 Chatwoot timeout + Microservice ECONNREFUSED records double failure accurately', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('timeout of 15000ms exceeded');
                    err.code = 'ECONNABORTED';
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            axios.post.mockRejectedValueOnce(new Error('connect ECONNREFUSED msg.target-kw.com:443'));

            const shipment = {
                id: 'shp-dbl-02',
                trackingNumber: 'TRG-DBL-02',
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
            })).rejects.toThrow(/ECONNREFUSED/);

            const finalUpdate = updatedLogs[updatedLogs.length - 1];
            expect(finalUpdate.status).toBe('FAILED');
            expect(finalUpdate.isFallback).toBe(true);
            expect(finalUpdate.provider).toBe('fallback');
            expect(finalUpdate.fallbackReason).toMatch(/ECONNABORTED|timeout/i);
            expect(finalUpdate.errorMessage).toContain('ECONNREFUSED');
        });

        test('3.3 Microservice business failure (status: failed) after Chatwoot 502 records failure', async () => {
            mockClientRequest.mockImplementation(async (reqConfig) => {
                if (reqConfig.method.toLowerCase() === 'post' && reqConfig.url.includes('/messages')) {
                    const err = new Error('Chatwoot 502 Bad Gateway');
                    err.response = { status: 502 };
                    throw err;
                }
                return { data: { payload: { id: 501 } } };
            });

            // Microservice returns 200 HTTP but status: failed in body
            axios.post.mockResolvedValueOnce({
                data: { status: 'failed', error: 'Meta Cloud API rate limit exceeded (131056)' }
            });

            const shipment = {
                id: 'shp-dbl-03',
                trackingNumber: 'TRG-DBL-03',
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
            })).rejects.toThrow(/rate limit exceeded/);

            const finalUpdate = updatedLogs[updatedLogs.length - 1];
            expect(finalUpdate.status).toBe('FAILED');
            expect(finalUpdate.isFallback).toBe(true);
            expect(finalUpdate.errorMessage).toContain('rate limit exceeded');
        });
    });

    // =========================================================================
    // 4. Safety Guard Precedence
    // =========================================================================
    describe('4. Safety Guard Precedence', () => {
        test('4.1 Quiet hours suppresses regular notifications BEFORE any network calls', async () => {
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({ allowQuietHoursBypass: false });

            const shipment = {
                id: 'shp-guard-01',
                trackingNumber: 'TRG-GUARD-01',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('QUEUED');
            expect(result.reason).toBe('QUIET_HOURS_SUPPRESSED');

            // Zero network calls made to Chatwoot or fallback microservice
            expect(mockClientRequest).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.2 Quiet hours bypass allows urgent customs notification to dispatch', async () => {
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({ allowQuietHoursBypass: true });

            const shipment = {
                id: 'shp-guard-02',
                trackingNumber: 'TRG-GUARD-02',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                createdAt: new Date()
            };

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

            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(1);
        });

        test('4.3 Delivery quiet hours toggle allows out_for_delivery and delivered during quiet hours', async () => {
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(true);
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({ allowQuietHoursBypass: false });
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                enabled: true,
                allowDeliveryQuietHours: true,
                provider: 'chatwoot'
            });

            const shipment = {
                id: 'shp-guard-03',
                trackingNumber: 'TRG-GUARD-03',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                status: 'out_for_delivery',
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(1);
        });

        test('4.4 36-hour age guard drops delivered historical shipment BEFORE network attempt', async () => {
            const shipment = {
                id: 'shp-guard-04',
                trackingNumber: 'TRG-GUARD-04',
                status: 'delivered',
                createdAt: new Date(Date.now() - 48 * 3600 * 1000), // 48h old
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

            expect(mockClientRequest).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.5 36-hour age guard does NOT drop in-transit shipments created >36h ago', async () => {
            const shipment = {
                id: 'shp-guard-05',
                trackingNumber: 'TRG-GUARD-05',
                status: 'in_transit',
                createdAt: new Date(Date.now() - 48 * 3600 * 1000), // 48h old but still moving
                destination: { contactPerson: 'Active Receiver', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' }
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(1);
        });

        test('4.6 bypassAgeGuard flag permits sending notification for delivered historical shipment', async () => {
            const shipment = {
                id: 'shp-guard-06',
                trackingNumber: 'TRG-GUARD-06',
                status: 'delivered',
                createdAt: new Date(Date.now() - 48 * 3600 * 1000),
                destination: { contactPerson: 'Manual Send Receiver', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' }
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'delivered',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                bypassAgeGuard: true,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SENT');
            const messageCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/messages'));
            expect(messageCalls.length).toBe(1);
        });

        test('4.7 Deduplication guard: existing local log suppresses duplicate send BEFORE network attempt', async () => {
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValueOnce({
                id: 'log-existing-sent',
                status: 'SENT',
                sentAt: new Date(Date.now() - 1000 * 120)
            });

            const shipment = {
                id: 'shp-guard-07',
                trackingNumber: 'TRG-GUARD-07',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
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
            expect(result.alreadySent).toBe(true);

            expect(mockClientRequest).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.8 Deduplication guard: microservice remote check suppresses duplicate send BEFORE dispatch', async () => {
            axios.get.mockResolvedValueOnce({
                data: { sent: true, sentAt: '2026-10-24T18:00:00Z' }
            });

            const shipment = {
                id: 'shp-guard-08',
                trackingNumber: 'TRG-GUARD-08',
                documents: { phenixBillId: 'BILL-889900' },
                destination: { phone: '+96599112233' },
                createdAt: new Date()
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
            expect(result.alreadySent).toBe(true);

            // Dispatches to Chatwoot and microservice send were skipped
            expect(mockClientRequest).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.9 Event rule disabled suppresses notification BEFORE network calls', async () => {
            jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValueOnce(false);

            const shipment = {
                id: 'shp-guard-09',
                trackingNumber: 'TRG-GUARD-09',
                destination: { phone: '+96599112233' },
                createdAt: new Date()
            };

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'received_at_hub',
                recipientRole: 'sender',
                recipientPhone: '+96599112233',
                force: false,
                provider: 'chatwoot'
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('EVENT_RULE_DISABLED');

            expect(mockClientRequest).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        });

        test('4.10 Developer mode safe routing redirects recipient to +201040957289', async () => {
            const shipment = {
                id: 'shp-guard-10',
                trackingNumber: 'TRG-GUARD-10',
                destination: { contactPerson: 'Real Customer', phone: '+96599112233' },
                origin: { contactPerson: 'Real Shipper', phone: '+96597959567' },
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

            // Chatwoot contacts search/create should be called with DEV_SAFE_PHONE
            const contactCalls = mockClientRequest.mock.calls.filter(c => c[0].url.includes('/contacts'));
            expect(contactCalls.length).toBeGreaterThanOrEqual(1);
            const callConfig = contactCalls[0][0];
            const phoneUsed = callConfig.params?.q || callConfig.data?.phone_number;
            expect(phoneUsed).toBe('+201040957289');
        });

        test('4.11 Out-for-delivery generates fresh 64-hex locationToken when missing or expired', async () => {
            const shipment = {
                id: 'shp-guard-11',
                trackingNumber: 'TRG-GUARD-11',
                destination: { contactPerson: 'Consignee', phone: '+96599112233' },
                origin: { contactPerson: 'Shipper', phone: '+96597959567' },
                locationToken: null,
                locationTokenExpiresAt: null,
                createdAt: new Date()
            };

            const updateShipmentSpy = jest.spyOn(prisma.shipment, 'update');

            await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true,
                provider: 'chatwoot'
            });

            // Token saved to shipment
            expect(updateShipmentSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'shp-guard-11' },
                data: expect.objectContaining({
                    locationToken: expect.stringMatching(/^loc_[a-f0-9]{64}$/),
                    locationTokenExpiresAt: expect.any(Date)
                })
            }));

            // Injected into button_params
            const msgCalls = mockClientRequest.mock.calls.filter(c => c[0].method === 'post' && c[0].url.includes('/messages'));
            expect(msgCalls.length).toBe(1);
            expect(msgCalls[0][0].data.template_params.button_params).toEqual([
                {
                    type: 'url',
                    index: '0',
                    parameter: expect.stringMatching(/^loc_[a-f0-9]{64}$/)
                }
            ]);
        });
    });
});
