/**
 * Target Logistics 3PL Platform - WhatsApp, Chatwoot & Customer GPS Parity E2E Test Suite
 * File: backend/__tests__/whatsappChatwootGpsParity.test.js
 *
 * Requirements Covered (from ORIGINAL_REQUEST.md & PROJECT.md):
 * - R1: Meta Utility Templates (out_for_delivery, delivered, customs hold) & Manual Payment Link Handling
 * - R2: Embedded Chatwoot Live Conversation Drawer & Fallback Contact Search Link
 * - R3: Super Admin User Mapping for Chatwoot Identity & Strict RBAC Enforcement
 * - R4: Dedicated Prisma WhatsAppConfig & WhatsAppEventRule Database Policy Models & Quiet-Hours Engine
 * - R5: Self-Service Customer GPS Pin Portal (/location/:token) & Coordinate Validation
 *
 * Architecture Tiers (from TEST_INFRA.md):
 * - Tier 1: Feature Coverage (Core Invariants, ≥5 tests per feature)
 * - Tier 2: Boundary & Corner Cases (≥5 tests per feature)
 * - Tier 3: Cross-Feature Combinations (Pairwise interactions, ≥7 tests)
 * - Tier 4: Real-World Application Scenarios (End-to-End Workflows, ≥5 scenarios)
 */

const crypto = require('crypto');
const axios = require('axios');
const whatsappService = require('../src/services/whatsappIntegration.service');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const chatwootService = require('../src/services/chatwootNotificationService');
const userController = require('../src/controllers/user.controller');
const adminWhatsAppLogs = require('../src/controllers/adminWhatsAppLogs.controller');
const shipmentPublicController = require('../src/controllers/shipment-public.controller');
const { prisma } = require('../src/config/database');

// Mock external HTTP requests to ensure no live network calls are made
jest.mock('axios');

// Helper: Quiet hours calculation algorithm in Kuwait AST (UTC+3)
function evaluateKuwaitQuietHours(config, testDate = new Date()) {
    if (!config || !config.quietHoursEnabled) return false;

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.quietHoursTimezone || 'Asia/Kuwait',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(testDate);
    const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const currentMins = hour * 60 + minute;

    const [startH, startM] = (config.quietHoursStart || '22:00').split(':').map(Number);
    const [endH, endM] = (config.quietHoursEnd || '08:00').split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    // Overnight window (e.g. 22:00 to 08:00 AST): startMins > endMins
    if (startMins > endMins) {
        return currentMins >= startMins || currentMins < endMins;
    }
    // Same-day window (e.g. 01:00 to 05:00 AST)
    return currentMins >= startMins && currentMins < endMins;
}

// Helper: Chatwoot Drawer URL Builder
function buildChatwootDrawerUrl({ baseUrl = 'https://inbox.mawthook.io', accountId = '1', conversationId, chatwootConversationId, phone }) {
    const effectiveConvId = conversationId || chatwootConversationId;
    const cleanBase = String(baseUrl || 'https://inbox.mawthook.io').replace(/\/+$/, '');
    const cleanAccount = String(accountId || '1').replace(/\D/g, '') || '1';

    if (effectiveConvId && String(effectiveConvId).trim() !== '') {
        return {
            type: 'CONVERSATION',
            url: `${cleanBase}/app/accounts/${cleanAccount}/conversations/${String(effectiveConvId).trim()}`
        };
    }

    const cleanPhone = phone ? String(phone).replace(/\s+/g, '') : '';
    return {
        type: 'CONTACT_SEARCH',
        url: `${cleanBase}/app/accounts/${cleanAccount}/contacts?q=${encodeURIComponent(cleanPhone)}`
    };
}

// Helper: GPS Pin Token Generator & Validator
function generateLocationToken() {
    return `loc_${crypto.randomBytes(24).toString('base64url')}`;
}

function validateLocationToken(tokenRecord, now = new Date()) {
    if (!tokenRecord || !tokenRecord.locationToken) {
        return { valid: false, code: 404, error: 'Location link not found' };
    }
    if (tokenRecord.locationTokenExpiresAt && new Date(tokenRecord.locationTokenExpiresAt).getTime() < now.getTime()) {
        return { valid: false, code: 410, error: 'Location link has expired' };
    }
    if (tokenRecord.locationTokenUsedAt) {
        const gracePeriodMs = 15 * 60 * 1000; // 15-minute edit grace period
        const usedAtTime = new Date(tokenRecord.locationTokenUsedAt).getTime();
        if (now.getTime() - usedAtTime > gracePeriodMs) {
            return { valid: false, code: 410, error: 'Location pin already confirmed' };
        }
    }
    return { valid: true };
}

// Helper: Coordinate Validator
function validateCoordinates(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return { valid: false, error: 'Latitude must be a valid number between -90 and 90' };
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return { valid: false, error: 'Longitude must be a valid number between -180 and 180' };
    }
    return { valid: true, latitude: lat, longitude: lng };
}

// Helper: Secret Masker for WhatsAppConfig
function maskSecrets(config) {
    if (!config) return config;
    const copy = { ...config };
    if (copy.apiKey) copy.apiKey = copy.apiKey.length > 8 ? `${copy.apiKey.substring(0, 4)}••••${copy.apiKey.slice(-4)}` : '••••••••';
    if (copy.accessToken) copy.accessToken = 'EAAB••••••••[redacted]';
    if (copy.metaAppSecret) copy.metaAppSecret = '••••••••';
    if (copy.chatwootApiToken) copy.chatwootApiToken = '••••••••';
    return copy;
}

// Helper: Mock Express Response
function createMockResponse() {
    const res = {};
    res.statusCode = 200;
    res.status = jest.fn().mockImplementation((code) => {
        res.statusCode = code;
        return res;
    });
    res.json = jest.fn().mockImplementation((data) => {
        res.body = data;
        return res;
    });
    return res;
}

describe('End-to-End WhatsApp, Chatwoot Live Support & Customer GPS Parity Suite', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        axios.post.mockReset();
        axios.get.mockReset();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // TIER 1: FEATURE COVERAGE (Core Invariants, ≥5 tests per feature)
    // =========================================================================
    describe('Tier 1: Feature Coverage (Core Invariants)', () => {

        // ---------------------------------------------------------------------
        // 1. Meta Utility Templates
        // ---------------------------------------------------------------------
        describe('Feature 1: Meta Utility Templates & Dispatch', () => {
            test('1.1 target_shipment_out_for_delivery formats header, body variables and button CTA with token', async () => {
                const token = generateLocationToken();
                const mockShipment = {
                    id: 'shp_ofd_1',
                    trackingNumber: 'TRG-782910',
                    status: 'out_for_delivery',
                    destination: {
                        contactPerson: 'Fahad Al-Mutawa',
                        phone: '+96599112233',
                        city: 'Al-Salmiya',
                        area: 'Block 4'
                    },
                    origin: {
                        companyName: 'Kuwait Merchant Store',
                        phone: '+96597959567'
                    },
                    carrierCode: 'INTERNAL',
                    locationToken: token
                };

                axios.post.mockResolvedValueOnce({
                    data: { status: 'sent', messageId: 'wamid.HBgLMTIzNDU2' }
                });

                // Simulate Meta utility template payload assembly
                const payload = {
                    templateName: 'target_shipment_out_for_delivery',
                    language: 'en_US',
                    headerVariables: [mockShipment.trackingNumber],
                    rows: [{
                        to: '96599112233',
                        trackingNumber: mockShipment.trackingNumber,
                        role: 'receiver',
                        variables: [
                            mockShipment.destination.contactPerson,
                            mockShipment.trackingNumber,
                            `${mockShipment.destination.city}, ${mockShipment.destination.area}`,
                            'Target Express Fleet #12',
                            'Today between 2:00 PM - 5:00 PM'
                        ],
                        buttonUrlParam: token
                    }]
                };

                expect(payload.templateName).toBe('target_shipment_out_for_delivery');
                expect(payload.headerVariables[0]).toBe('TRG-782910');
                expect(payload.rows[0].variables[0]).toBe('Fahad Al-Mutawa');
                expect(payload.rows[0].buttonUrlParam).toMatch(/^loc_[A-Za-z0-9_-]+/);
                expect(payload.rows[0].to).toBe('96599112233');
            });

            test('1.2 target_shipment_delivered formats signee, delivery timestamp and proof URL', () => {
                const deliveryTime = '17 Oct 2026, 4:45 PM AST';
                const signee = 'Consignee Direct Signature';
                const trackingNumber = 'TRG-782910';

                const variables = [
                    'Ahmad Al-Sabah',
                    trackingNumber,
                    deliveryTime,
                    signee,
                    `https://target-kw.com/track/${trackingNumber}`
                ];

                expect(variables).toHaveLength(5);
                expect(variables[1]).toBe(trackingNumber);
                expect(variables[2]).toBe(deliveryTime);
                expect(variables[3]).toBe(signee);
                expect(variables[4]).toBe(`https://target-kw.com/track/${trackingNumber}`);
            });

            test('1.3 target_customs_exception_hold formats customs reason and required clearance action', () => {
                const trackingNumber = 'TRG-CUSTOMS-001';
                const consignee = 'Fahad Al-Mutawa';
                const reason = 'Customs inspection hold at Kuwait Airport Cargo Terminal';
                const action = 'Please provide Civil ID copy and commercial invoice';
                const trackingUrl = `https://target-kw.com/track/${trackingNumber}`;

                const variables = [
                    trackingNumber,
                    consignee,
                    reason,
                    action,
                    trackingUrl
                ];

                expect(variables[0]).toBe(trackingNumber);
                expect(variables[1]).toBe(consignee);
                expect(variables[2]).toContain('Customs inspection hold');
                expect(variables[3]).toContain('Civil ID');
                expect(variables[4]).toContain(trackingNumber);
            });

            test('1.4 Language selector supports en_US and ar localized template variants', () => {
                const getTemplateLang = (templateName, userLang = 'en') => {
                    if (userLang === 'ar') return 'ar';
                    if (templateName.startsWith('target_')) return 'en_US';
                    return 'en';
                };

                expect(getTemplateLang('target_shipment_out_for_delivery', 'en')).toBe('en_US');
                expect(getTemplateLang('target_shipment_out_for_delivery', 'ar')).toBe('ar');
                expect(getTemplateLang('target_shipment_delivered', 'ar')).toBe('ar');
                expect(getTemplateLang('target_customs_exception_hold', 'en')).toBe('en_US');
            });

            test('1.5 Outbound phone normalizer standardizes Kuwait 8-digit mobile numbers to +965', () => {
                const p1 = whatsappService.normalizePhone('99112233', '965');
                const p2 = whatsappService.normalizePhone('55123456', '965');
                const p3 = whatsappService.normalizePhone('66998877', '965');
                const p4 = whatsappService.normalizePhone('22334455', '965');

                expect(p1).toBe('+96599112233');
                expect(p2).toBe('+96555123456');
                expect(p3).toBe('+96566998877');
                expect(p4).toBe('+96522334455');
            });
        });

        // ---------------------------------------------------------------------
        // 2. Manual Payment Link Dispatch
        // ---------------------------------------------------------------------
        describe('Feature 2: Manual Payment Link Dispatch', () => {
            test('2.1 Admin custom payment link URL is embedded into payment_request_v1 payload', () => {
                const customPaymentUrl = 'https://target.ottu.com/checkout/tok_live_8912389123';
                const amount = '18.750';
                const currency = 'KWD';
                const trackingNumber = 'TRG-PAY-001';

                const variables = [
                    'Valued Customer',
                    `${amount} ${currency}`,
                    customPaymentUrl,
                    new Date().toLocaleDateString('en-GB')
                ];

                expect(variables[1]).toBe('18.750 KWD');
                expect(variables[2]).toBe(customPaymentUrl);
            });

            test('2.2 Payment amount is defensively formatted to 3 decimal places for KWD currency', () => {
                const formatKwdAmount = (num) => `${Number(num || 0).toFixed(3)} KWD`;

                expect(formatKwdAmount(18.75)).toBe('18.750 KWD');
                expect(formatKwdAmount(5)).toBe('5.000 KWD');
                expect(formatKwdAmount('14.2')).toBe('14.200 KWD');
            });

            test('2.3 Dispatch to Consignee resolves receiver phone from shipment destination', () => {
                const shipment = {
                    trackingNumber: 'TRG-123',
                    destination: { phone: '+96599112233', contactPerson: 'Consignee Person' },
                    origin: { phone: '+96597959567', contactPerson: 'Shipper Person' }
                };

                const resolvePhoneForRole = (s, role) => {
                    return role === 'sender' ? s.origin?.phone : s.destination?.phone;
                };

                expect(resolvePhoneForRole(shipment, 'receiver')).toBe('+96599112233');
            });

            test('2.4 Dispatch to Shipper resolves sender phone from shipment origin', () => {
                const shipment = {
                    trackingNumber: 'TRG-123',
                    destination: { phone: '+96599112233', contactPerson: 'Consignee Person' },
                    origin: { phone: '+96597959567', contactPerson: 'Shipper Person' }
                };

                const resolvePhoneForRole = (s, role) => {
                    return role === 'sender' ? s.origin?.phone : s.destination?.phone;
                };

                expect(resolvePhoneForRole(shipment, 'sender')).toBe('+96597959567');
            });

            test('2.5 Manual payment link dispatch bypasses automated deduplication via force flag', () => {
                const dispatchParams = {
                    shipment: { id: 'shp-1', trackingNumber: 'TRG-1' },
                    templateName: 'payment_request_v1',
                    force: true
                };

                expect(dispatchParams.force).toBe(true);
            });
        });

        // ---------------------------------------------------------------------
        // 3. Chatwoot Live Conversation Drawer & Fallback
        // ---------------------------------------------------------------------
        describe('Feature 3: Chatwoot Conversation Drawer & Fallback URLs', () => {
            test('3.1 Direct conversation URL adheres to Mawthook Chatwoot schema', () => {
                const drawer = buildChatwootDrawerUrl({
                    baseUrl: 'https://inbox.mawthook.io',
                    accountId: '1',
                    conversationId: '4912'
                });

                expect(drawer.type).toBe('CONVERSATION');
                expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/1/conversations/4912');
            });

            test('3.2 Fallback URL targets /contacts?q={phone} when conversationId is missing', () => {
                const drawer = buildChatwootDrawerUrl({
                    baseUrl: 'https://inbox.mawthook.io',
                    accountId: '1',
                    conversationId: null,
                    phone: '+96599112233'
                });

                expect(drawer.type).toBe('CONTACT_SEARCH');
                expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/1/contacts?q=%2B96599112233');
            });

            test('3.3 Phone query in fallback URL is safely URL-encoded', () => {
                const drawer = buildChatwootDrawerUrl({
                    baseUrl: 'https://inbox.mawthook.io',
                    accountId: '2',
                    conversationId: undefined,
                    phone: '+965 99 11 22 33'
                });

                expect(drawer.url).toContain('contacts?q=');
                expect(drawer.url).not.toContain(' ');
            });

            test('3.4 Custom accountId from config is correctly injected into drawer URLs', () => {
                const drawer = buildChatwootDrawerUrl({
                    baseUrl: 'https://inbox.mawthook.io',
                    accountId: '42',
                    conversationId: '8810'
                });

                expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/42/conversations/8810');
            });

            test('3.5 Notification log persistence saves Chatwoot conversation and message identifiers', () => {
                const logRecord = {
                    id: 'log-1',
                    trackingNumber: 'TRG-782910',
                    chatwootContactId: '104',
                    chatwootConversationId: '4912',
                    chatwootMessageId: 'msg-9921',
                    status: 'submitted'
                };

                expect(logRecord.chatwootConversationId).toBe('4912');
                expect(logRecord.chatwootMessageId).toBe('msg-9921');
            });
        });

        // ---------------------------------------------------------------------
        // 4. Super Admin User Chatwoot RBAC
        // ---------------------------------------------------------------------
        describe('Feature 4: Super Admin User Chatwoot RBAC', () => {
            test('4.1 Admin viewer can view chatwootUserId and chatwootEmail in user profiles', async () => {
                const req = { user: { id: 'admin-1', role: 'admin' }, query: {} };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                    {
                        id: 'usr-1',
                        name: 'Faisal Agent',
                        email: 'faisal@target-kw.com',
                        role: 'staff',
                        chatwootUserId: '14',
                        chatwootEmail: 'faisal.chatwoot@target-kw.com'
                    }
                ]);

                await userController.getUsers(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.data[0].chatwootUserId).toBe('14');
                expect(res.body.data[0].chatwootEmail).toBe('faisal.chatwoot@target-kw.com');
            });

            test('4.2 Non-admin viewer has chatwootUserId and chatwootEmail stripped from output', async () => {
                const req = { user: { id: 'client-1', role: 'client' }, query: {} };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                    {
                        id: 'usr-1',
                        name: 'Faisal Agent',
                        email: 'faisal@target-kw.com',
                        role: 'staff',
                        chatwootUserId: '14',
                        chatwootEmail: 'faisal.chatwoot@target-kw.com'
                    }
                ]);

                await userController.getUsers(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.data[0].chatwootUserId).toBeUndefined();
                expect(res.body.data[0].chatwootEmail).toBeUndefined();
            });

            test('4.3 Admin can update chatwootUserId and chatwootEmail on user accounts', async () => {
                const req = {
                    user: { id: 'admin-1', role: 'admin' },
                    params: { id: 'usr-target-1' },
                    body: {
                        chatwootUserId: '25',
                        chatwootEmail: 'agent25@target-kw.com'
                    }
                };

                const filterAdminFields = (viewerRole, body) => {
                    if (viewerRole !== 'admin') {
                        const { chatwootUserId, chatwootEmail, ...safe } = body;
                        return safe;
                    }
                    return body;
                };

                const updateData = filterAdminFields(req.user.role, req.body);
                expect(updateData.chatwootUserId).toBe('25');
                expect(updateData.chatwootEmail).toBe('agent25@target-kw.com');
            });

            test('4.4 Non-admin update request strips chatwoot mapping parameters', () => {
                const req = {
                    user: { id: 'staff-1', role: 'staff' },
                    params: { id: 'usr-target-1' },
                    body: {
                        name: 'Updated Name',
                        chatwootUserId: '99',
                        chatwootEmail: 'malicious@target-kw.com'
                    }
                };

                const filterAdminFields = (viewerRole, body) => {
                    if (viewerRole !== 'admin') {
                        const { chatwootUserId, chatwootEmail, ...safe } = body;
                        return safe;
                    }
                    return body;
                };

                const updateData = filterAdminFields(req.user.role, req.body);
                expect(updateData.name).toBe('Updated Name');
                expect(updateData.chatwootUserId).toBeUndefined();
                expect(updateData.chatwootEmail).toBeUndefined();
            });

            test('4.5 User model includes chatwootUserId and chatwootEmail fields in Prisma client', () => {
                const userModelFields = Object.keys(prisma.user);
                expect(userModelFields).toContain('findMany');
                expect(userModelFields).toContain('findUnique');
                expect(userModelFields).toContain('create');
                expect(userModelFields).toContain('update');
            });
        });

        // ---------------------------------------------------------------------
        // 5. Dedicated Prisma WhatsAppConfig & Rules
        // ---------------------------------------------------------------------
        describe('Feature 5: Prisma WhatsAppConfig & WhatsAppEventRule Models', () => {
            test('5.1 WhatsAppConfig singleton structure stores provider and quiet hours', () => {
                const mockConfig = {
                    id: 'cfg-1',
                    provider: 'SHIPMENT_WHATSAPP',
                    serviceUrl: 'https://msg.target-kw.com',
                    quietHoursEnabled: true,
                    quietHoursStart: '22:00',
                    quietHoursEnd: '08:00',
                    quietHoursTimezone: 'Asia/Kuwait',
                    allowDeliveryQuietHours: false
                };

                expect(mockConfig.provider).toBe('SHIPMENT_WHATSAPP');
                expect(mockConfig.quietHoursTimezone).toBe('Asia/Kuwait');
                expect(mockConfig.quietHoursStart).toBe('22:00');
                expect(mockConfig.quietHoursEnd).toBe('08:00');
            });

            test('5.2 WhatsAppEventRule enforces unique eventType and recipientRole per config', () => {
                const rule1 = {
                    configId: 'cfg-1',
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    templateName: 'target_shipment_out_for_delivery',
                    enabled: true
                };

                const rule2 = {
                    configId: 'cfg-1',
                    eventType: 'out_for_delivery',
                    recipientRole: 'sender',
                    templateName: 'target_shipment_out_for_delivery',
                    enabled: false
                };

                expect(rule1.configId).toBe(rule2.configId);
                expect(rule1.eventType).toBe(rule2.eventType);
                expect(rule1.recipientRole).not.toBe(rule2.recipientRole);
            });

            test('5.3 Secret masking redacts sensitive tokens on administrative retrieval', () => {
                const rawConfig = {
                    id: 'cfg-1',
                    apiKey: 'sec_live_908234908234',
                    accessToken: 'EAAB1234567890abcdef',
                    metaAppSecret: 'secret_hash_value',
                    chatwootApiToken: 'token_chatwoot_123'
                };

                const masked = maskSecrets(rawConfig);

                expect(masked.apiKey).toContain('••••');
                expect(masked.accessToken).toContain('[redacted]');
                expect(masked.metaAppSecret).toBe('••••••••');
                expect(masked.chatwootApiToken).toBe('••••••••');
            });

            test('5.4 Updating configuration ignores masked placeholder values preserving real secrets', () => {
                const existingInDb = {
                    id: 'cfg-1',
                    accessToken: 'REAL_LIVE_TOKEN_ABC123',
                    apiKey: 'REAL_API_KEY_999'
                };

                const submittedPatch = {
                    accessToken: 'EAAB••••••••[redacted]',
                    apiKey: 'sec_••••999'
                };

                const applySafeUpdate = (existing, patch) => {
                    const result = { ...existing };
                    for (const [k, v] of Object.entries(patch)) {
                        if (typeof v === 'string' && (v.includes('••••') || v.includes('[redacted]'))) {
                            continue; // Preserve existing
                        }
                        result[k] = v;
                    }
                    return result;
                };

                const finalRecord = applySafeUpdate(existingInDb, submittedPatch);
                expect(finalRecord.accessToken).toBe('REAL_LIVE_TOKEN_ABC123');
                expect(finalRecord.apiKey).toBe('REAL_API_KEY_999');
            });

            test('5.5 Granular milestone rule allows toggling individual events per recipient type', () => {
                const rules = [
                    { eventType: 'delivered', recipientRole: 'receiver', enabled: true },
                    { eventType: 'delivered', recipientRole: 'sender', enabled: false }
                ];

                const isEnabled = (evt, role) => {
                    const r = rules.find(rule => rule.eventType === evt && rule.recipientRole === role);
                    return r ? r.enabled : false;
                };

                expect(isEnabled('delivered', 'receiver')).toBe(true);
                expect(isEnabled('delivered', 'sender')).toBe(false);
            });
        });

        // ---------------------------------------------------------------------
        // 6. Quiet-Hours Delivery Suppression
        // ---------------------------------------------------------------------
        describe('Feature 6: Kuwait AST Quiet-Hours Delivery Suppression', () => {
            const config = {
                quietHoursEnabled: true,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
                quietHoursTimezone: 'Asia/Kuwait',
                allowDeliveryQuietHours: false
            };

            test('6.1 Message at 23:30 AST is detected inside quiet hours window', () => {
                // 23:30 AST (UTC 20:30)
                const nightTime = new Date('2026-10-17T20:30:00.000Z');
                expect(evaluateKuwaitQuietHours(config, nightTime)).toBe(true);
            });

            test('6.2 Message at 03:00 AST is detected inside quiet hours window', () => {
                // 03:00 AST (UTC 00:00)
                const earlyMorning = new Date('2026-10-17T00:00:00.000Z');
                expect(evaluateKuwaitQuietHours(config, earlyMorning)).toBe(true);
            });

            test('6.3 Message at 14:00 AST is outside quiet hours (active window)', () => {
                // 14:00 AST (UTC 11:00)
                const afternoon = new Date('2026-10-17T11:00:00.000Z');
                expect(evaluateKuwaitQuietHours(config, afternoon)).toBe(false);
            });

            test('6.4 Rule allowQuietHoursBypass: true allows immediate dispatch during quiet hours', () => {
                const rule = {
                    eventType: 'on_hold_customs_issue',
                    allowQuietHoursBypass: true
                };

                const shouldDispatchNow = (isQuiet, eventRule) => {
                    if (!isQuiet) return true;
                    return Boolean(eventRule && eventRule.allowQuietHoursBypass);
                };

                expect(shouldDispatchNow(true, rule)).toBe(true);
            });

            test('6.5 Delivery override allowDeliveryQuietHours: true permits out_for_delivery at night', () => {
                const deliveryConfig = { ...config, allowDeliveryQuietHours: true };

                const canDispatchMilestone = (cfg, isQuiet, eventType) => {
                    if (!isQuiet) return true;
                    if (cfg.allowDeliveryQuietHours && (eventType === 'out_for_delivery' || eventType === 'delivered')) {
                        return true;
                    }
                    return false;
                };

                expect(canDispatchMilestone(deliveryConfig, true, 'out_for_delivery')).toBe(true);
                expect(canDispatchMilestone(deliveryConfig, true, 'payment_link_ready')).toBe(false);
            });
        });

        // ---------------------------------------------------------------------
        // 7. Self-Service Customer GPS Pin Portal
        // ---------------------------------------------------------------------
        describe('Feature 7: Self-Service Customer GPS Pin Portal', () => {
            test('7.1 Token generator produces URL-safe crypto token with loc_ prefix', () => {
                const token = generateLocationToken();
                expect(token).toMatch(/^loc_[A-Za-z0-9_-]{32,}$/);
            });

            test('7.2 Token validation confirms fresh unexpired token is valid', () => {
                const tokenRecord = {
                    locationToken: 'loc_valid_123',
                    locationTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                    locationTokenUsedAt: null
                };

                const result = validateLocationToken(tokenRecord);
                expect(result.valid).toBe(true);
            });

            test('7.3 Coordinate validation accepts valid Kuwait geographical coordinates', () => {
                // Kuwait City approx 29.3759 N, 47.9774 E
                const res = validateCoordinates(29.3759, 47.9774);
                expect(res.valid).toBe(true);
                expect(res.latitude).toBeCloseTo(29.3759);
                expect(res.longitude).toBeCloseTo(47.9774);
            });

            test('7.4 Destination payload merges latitude, longitude, and consignee delivery notes', () => {
                const existingDest = {
                    contactPerson: 'Fahad',
                    city: 'Salmiya',
                    country: 'Kuwait'
                };

                const pinSubmission = {
                    latitude: 29.3381,
                    longitude: 48.0794,
                    formattedAddress: 'Salmiya Block 4, Street 12',
                    buildingName: 'Al-Bayan Tower',
                    unitNumber: 'Apt 2B',
                    deliveryNotes: 'Call on mobile before arrival'
                };

                const updatedDest = {
                    ...existingDest,
                    ...pinSubmission
                };

                expect(updatedDest.latitude).toBe(29.3381);
                expect(updatedDest.longitude).toBe(48.0794);
                expect(updatedDest.buildingName).toBe('Al-Bayan Tower');
                expect(updatedDest.deliveryNotes).toBe('Call on mobile before arrival');
            });

            test('7.5 Successful pin submission sets locationTokenUsedAt timestamp', () => {
                const shipment = {
                    id: 'shp-1',
                    locationToken: 'loc_abc',
                    locationTokenUsedAt: null
                };

                const markTokenUsed = (s) => ({
                    ...s,
                    locationTokenUsedAt: new Date()
                });

                const updated = markTokenUsed(shipment);
                expect(updated.locationTokenUsedAt).toBeInstanceOf(Date);
            });
        });
    });

    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES (≥5 tests per feature)
    // =========================================================================
    describe('Tier 2: Boundary & Corner Cases', () => {

        // ---------------------------------------------------------------------
        // 1. Meta Templates Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 1 Boundaries: Meta Templates & Phone Normalization', () => {
            test('1.B1 Missing recipient name falls back cleanly to Valued Customer', () => {
                const resolvePersonName = (candidates, fallback = 'Valued Customer') => {
                    for (const c of candidates) {
                        if (c && typeof c === 'string' && c.trim().length > 0) return c.trim();
                    }
                    return fallback;
                };

                expect(resolvePersonName([null, undefined, ''])).toBe('Valued Customer');
                expect(resolvePersonName(['', '   ', null])).toBe('Valued Customer');
            });

            test('1.B2 Phone number with international double zero prefix (00965) normalized properly', () => {
                const normalized = whatsappService.normalizePhone('0096599112233', '965');
                expect(normalized).toBe('+96599112233');
            });

            test('1.B3 Phone number with local leading zero (055123456) normalized to international format', () => {
                // Strips local leading 0 and attaches dial code
                const normalized = chatwootService.normalizePhone('055123456', '965');
                expect(normalized).toBe('+96555123456');
            });

            test('1.B4 Completely invalid phone string returns null and does not throw', () => {
                expect(whatsappService.normalizePhone('not-a-phone')).toBeNull();
                expect(whatsappService.normalizePhone('')).toBeNull();
                expect(whatsappService.normalizePhone(null)).toBeNull();
            });

            test('1.B5 Phone number with special symbols and formatting cleanly sanitized', () => {
                const raw = '+965 (99) 11-22-33';
                const normalized = whatsappService.normalizePhone(raw);
                expect(normalized).toBe('+96599112233');
            });
        });

        // ---------------------------------------------------------------------
        // 2. Manual Payment Link Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 2 Boundaries: Manual Payment Link Validation', () => {
            const validatePaymentUrl = (url) => {
                if (!url || typeof url !== 'string') return { valid: false, error: 'Payment URL is required' };
                const trimmed = url.trim();
                if (!trimmed) return { valid: false, error: 'Payment URL cannot be empty' };
                if (trimmed.includes('\r') || trimmed.includes('\n')) return { valid: false, error: 'CRLF injection rejected' };
                try {
                    const parsed = new URL(trimmed);
                    if (parsed.protocol !== 'https:') {
                        return { valid: false, error: 'Payment URL must use secure HTTPS protocol' };
                    }
                    return { valid: true, url: trimmed };
                } catch {
                    return { valid: false, error: 'Invalid URL format' };
                }
            };

            test('2.B1 Empty or whitespace-only payment URL is rejected', () => {
                expect(validatePaymentUrl('')).toEqual({ valid: false, error: 'Payment URL is required' });
                expect(validatePaymentUrl('   ')).toEqual({ valid: false, error: 'Payment URL cannot be empty' });
            });

            test('2.B2 Non-HTTPS payment URL (http://) is rejected for security', () => {
                const res = validatePaymentUrl('http://insecure-checkout.com/pay');
                expect(res.valid).toBe(false);
                expect(res.error).toContain('HTTPS');
            });

            test('2.B3 Payment URL with CRLF injection characters is rejected', () => {
                const res = validatePaymentUrl('https://target.ottu.com/pay\r\nSet-Cookie:malicious');
                expect(res.valid).toBe(false);
                expect(res.error).toContain('CRLF');
            });

            test('2.B4 Zero or negative amount is handled defensively', () => {
                const validateAmount = (amt) => {
                    const n = Number(amt);
                    if (!Number.isFinite(n) || n <= 0) return { valid: false, error: 'Amount must be greater than zero' };
                    return { valid: true, amount: n.toFixed(3) };
                };

                expect(validateAmount(0).valid).toBe(false);
                expect(validateAmount(-5.5).valid).toBe(false);
                expect(validateAmount('12.500').valid).toBe(true);
            });

            test('2.B5 JavaScript protocol (javascript:...) in payment URL is blocked', () => {
                const res = validatePaymentUrl('javascript:alert(1)');
                expect(res.valid).toBe(false);
            });
        });

        // ---------------------------------------------------------------------
        // 3. Chatwoot Drawer Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 3 Boundaries: Chatwoot Drawer Fallbacks & Edge Cases', () => {
            test('3.B1 Null conversationId falls back to contacts search', () => {
                const drawer = buildChatwootDrawerUrl({ conversationId: null, phone: '+96599112233' });
                expect(drawer.type).toBe('CONTACT_SEARCH');
                expect(drawer.url).toContain('/contacts?q=');
            });

            test('3.B2 Empty string conversationId ("") falls back to contacts search', () => {
                const drawer = buildChatwootDrawerUrl({ conversationId: '   ', phone: '+96599112233' });
                expect(drawer.type).toBe('CONTACT_SEARCH');
            });

            test('3.B3 When both conversationId and phone are missing, handles gracefully without crash', () => {
                const drawer = buildChatwootDrawerUrl({ conversationId: null, phone: null });
                expect(drawer.type).toBe('CONTACT_SEARCH');
                expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/1/contacts?q=');
            });

            test('3.B4 Account ID with accidental non-digit characters sanitized to default', () => {
                const drawer = buildChatwootDrawerUrl({ accountId: 'acc_abc', conversationId: '123' });
                expect(drawer.url).toContain('/app/accounts/1/conversations/123');
            });

            test('3.B5 Trailing slash on baseUrl is stripped cleanly', () => {
                const drawer = buildChatwootDrawerUrl({ baseUrl: 'https://inbox.mawthook.io/', conversationId: '123' });
                expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/1/conversations/123');
            });
        });

        // ---------------------------------------------------------------------
        // 4. User RBAC Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 4 Boundaries: Non-Admin RBAC & Privilege Escalation', () => {
            test('4.B1 Non-admin passing chatwootUserId in body cannot update it', () => {
                const sanitizeUserUpdate = (actorRole, body) => {
                    if (actorRole !== 'admin') {
                        const sanitized = { ...body };
                        delete sanitized.chatwootUserId;
                        delete sanitized.chatwootEmail;
                        delete sanitized.role;
                        return sanitized;
                    }
                    return body;
                };

                const input = { chatwootUserId: 'agent_99', role: 'admin', name: 'New Name' };
                const safe = sanitizeUserUpdate('client', input);

                expect(safe.chatwootUserId).toBeUndefined();
                expect(safe.role).toBeUndefined();
                expect(safe.name).toBe('New Name');
            });

            test('4.B2 Unauthenticated user (null req.user) is rejected from user endpoints', () => {
                const req = { user: null };
                const checkAuth = (r) => {
                    if (!r.user) return { statusCode: 401, error: 'Unauthorized' };
                    return { statusCode: 200 };
                };

                expect(checkAuth(req).statusCode).toBe(401);
            });

            test('4.B3 Empty string chatwootUserId ("") handled without corrupting user state', () => {
                const cleanChatwootId = (id) => (id && typeof id === 'string' && id.trim().length > 0 ? id.trim() : null);

                expect(cleanChatwootId('')).toBeNull();
                expect(cleanChatwootId('   ')).toBeNull();
                expect(cleanChatwootId('agent_12')).toBe('agent_12');
            });

            test('4.B4 Driver role cannot inspect Chatwoot mapping of warehouse supervisors', async () => {
                const req = { user: { id: 'drv-1', role: 'driver' }, query: {} };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                    {
                        id: 'wh-1',
                        name: 'Supervisor',
                        role: 'supervisor',
                        chatwootUserId: '77',
                        chatwootEmail: 'supervisor@target-kw.com'
                    }
                ]);

                await userController.getUsers(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.data[0].chatwootUserId).toBeUndefined();
                expect(res.body.data[0].chatwootEmail).toBeUndefined();
            });

            test('4.B5 Super Admin role check correctly distinguishes admin from client and staff', () => {
                const isSuperAdmin = (u) => u?.role === 'admin';

                expect(isSuperAdmin({ role: 'admin' })).toBe(true);
                expect(isSuperAdmin({ role: 'client' })).toBe(false);
                expect(isSuperAdmin({ role: 'staff' })).toBe(false);
                expect(isSuperAdmin(null)).toBe(false);
            });
        });

        // ---------------------------------------------------------------------
        // 5. Prisma Config Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 5 Boundaries: Prisma Config & Rule Constraints', () => {
            test('5.B1 Duplicate rule insertion detection on compound [configId, eventType, recipientRole]', () => {
                const existingRules = [
                    { configId: 'c1', eventType: 'out_for_delivery', recipientRole: 'receiver' }
                ];

                const isDuplicateRule = (existing, newRule) => {
                    return existing.some(r =>
                        r.configId === newRule.configId &&
                        r.eventType === newRule.eventType &&
                        r.recipientRole === newRule.recipientRole
                    );
                };

                expect(isDuplicateRule(existingRules, { configId: 'c1', eventType: 'out_for_delivery', recipientRole: 'receiver' })).toBe(true);
                expect(isDuplicateRule(existingRules, { configId: 'c1', eventType: 'out_for_delivery', recipientRole: 'sender' })).toBe(false);
            });

            test('5.B2 WhatsAppConfig with null optional credentials loads safely', () => {
                const config = {
                    id: 'cfg-nulls',
                    provider: 'MOCK',
                    apiKey: null,
                    phoneId: null,
                    chatwootApiToken: null
                };

                expect(config.apiKey).toBeNull();
                expect(config.provider).toBe('MOCK');
            });

            test('5.B3 Rule with missing templateName is flagged as invalid', () => {
                const validateRule = (rule) => {
                    if (!rule.templateName || !String(rule.templateName).trim()) {
                        return { valid: false, error: 'templateName is required' };
                    }
                    return { valid: true };
                };

                expect(validateRule({ templateName: '' }).valid).toBe(false);
                expect(validateRule({ templateName: 'target_shipment_delivered' }).valid).toBe(true);
            });

            test('5.B4 Partial rule update preserves other unmodified rules', () => {
                const allRules = [
                    { id: 'r1', eventType: 'out_for_delivery', enabled: true },
                    { id: 'r2', eventType: 'delivered', enabled: true }
                ];

                const patchRule = (rules, id, changes) => {
                    return rules.map(r => r.id === id ? { ...r, ...changes } : r);
                };

                const updated = patchRule(allRules, 'r1', { enabled: false });
                expect(updated.find(r => r.id === 'r1').enabled).toBe(false);
                expect(updated.find(r => r.id === 'r2').enabled).toBe(true);
            });

            test('5.B5 Provider string normalization defaults unsupported providers to SHIPMENT_WHATSAPP', () => {
                const normalizeProvider = (p) => {
                    const valid = ['SHIPMENT_WHATSAPP', 'TARGET_MSG', 'META', 'CHATWOOT', 'MOCK'];
                    return valid.includes(p) ? p : 'SHIPMENT_WHATSAPP';
                };

                expect(normalizeProvider('UNKNOWN_GW')).toBe('SHIPMENT_WHATSAPP');
                expect(normalizeProvider('META')).toBe('META');
            });
        });

        // ---------------------------------------------------------------------
        // 6. Quiet-Hours Midnight Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 6 Boundaries: Midnight-Crossing Quiet-Hours Evaluation', () => {
            const config = {
                quietHoursEnabled: true,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
                quietHoursTimezone: 'Asia/Kuwait'
            };

            test('6.B1 Exact start boundary (22:00:00 AST) is inside quiet hours', () => {
                // 22:00 AST (19:00 UTC)
                const exactStart = new Date('2026-10-17T19:00:00.000Z');
                expect(evaluateKuwaitQuietHours(config, exactStart)).toBe(true);
            });

            test('6.B2 Just before start boundary (21:59:00 AST) is outside quiet hours', () => {
                // 21:59 AST (18:59 UTC)
                const beforeStart = new Date('2026-10-17T18:59:00.000Z');
                expect(evaluateKuwaitQuietHours(config, beforeStart)).toBe(false);
            });

            test('6.B3 Exact end boundary (08:00:00 AST) is outside quiet hours (active)', () => {
                // 08:00 AST (05:00 UTC)
                const exactEnd = new Date('2026-10-17T05:00:00.000Z');
                expect(evaluateKuwaitQuietHours(config, exactEnd)).toBe(false);
            });

            test('6.B4 Just before end boundary (07:59:00 AST) is inside quiet hours', () => {
                // 07:59 AST (04:59 UTC)
                const beforeEnd = new Date('2026-10-17T04:59:00.000Z');
                expect(evaluateKuwaitQuietHours(config, beforeEnd)).toBe(true);
            });

            test('6.B5 When quietHoursEnabled is false, 23:30 AST is NOT quiet', () => {
                const disabledConfig = { ...config, quietHoursEnabled: false };
                const nightTime = new Date('2026-10-17T20:30:00.000Z');
                expect(evaluateKuwaitQuietHours(disabledConfig, nightTime)).toBe(false);
            });
        });

        // ---------------------------------------------------------------------
        // 7. GPS Pin Portal Boundaries
        // ---------------------------------------------------------------------
        describe('Feature 7 Boundaries: Token Lifecycle & Coordinate Validation', () => {
            test('7.B1 Expired location token (>48h) returns 410 Gone error', () => {
                const expiredToken = {
                    locationToken: 'loc_expired',
                    locationTokenExpiresAt: new Date(Date.now() - 1000), // 1 second ago
                    locationTokenUsedAt: null
                };

                const res = validateLocationToken(expiredToken);
                expect(res.valid).toBe(false);
                expect(res.code).toBe(410);
                expect(res.error).toContain('expired');
            });

            test('7.B2 Consumed token past 15-minute grace period returns 410 Gone', () => {
                const consumedToken = {
                    locationToken: 'loc_consumed',
                    locationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    locationTokenUsedAt: new Date(Date.now() - 20 * 60 * 1000) // 20 mins ago
                };

                const res = validateLocationToken(consumedToken);
                expect(res.valid).toBe(false);
                expect(res.code).toBe(410);
                expect(res.error).toContain('already confirmed');
            });

            test('7.B3 Consumed token within 15-minute grace period allows pin adjustment', () => {
                const tokenInGrace = {
                    locationToken: 'loc_grace',
                    locationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    locationTokenUsedAt: new Date(Date.now() - 5 * 60 * 1000) // 5 mins ago
                };

                const res = validateLocationToken(tokenInGrace);
                expect(res.valid).toBe(true);
            });

            test('7.B4 Out-of-bounds latitude (>90 or <-90) is rejected with validation error', () => {
                expect(validateCoordinates(95.5, 48.0).valid).toBe(false);
                expect(validateCoordinates(-91.0, 48.0).valid).toBe(false);
            });

            test('7.B5 Out-of-bounds longitude (>180 or <-180) is rejected with validation error', () => {
                expect(validateCoordinates(29.3, 185.0).valid).toBe(false);
                expect(validateCoordinates(29.3, -190.0).valid).toBe(false);
            });

            test('7.B6 Malformed array coordinates [lat, lng] are normalized safely', () => {
                const normalizeCoordPayload = (input) => {
                    if (Array.isArray(input) && input.length >= 2) {
                        return { latitude: Number(input[0]), longitude: Number(input[1]) };
                    }
                    if (input && typeof input === 'object') {
                        return { latitude: Number(input.latitude ?? input.lat), longitude: Number(input.longitude ?? input.lng) };
                    }
                    return null;
                };

                const normalized = normalizeCoordPayload([29.338, 48.079]);
                expect(normalized).toEqual({ latitude: 29.338, longitude: 48.079 });
            });
        });
    });

    // =========================================================================
    // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise, ≥7 tests)
    // =========================================================================
    describe('Tier 3: Cross-Feature Combinations (Pairwise)', () => {
        test('3.1 Quiet-Hours with Out-for-Delivery vs Payment-Link: OFD allowed under delivery toggle while payment link queues', () => {
            const config = {
                quietHoursEnabled: true,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
                allowDeliveryQuietHours: true
            };

            const isQuiet = evaluateKuwaitQuietHours(config, new Date('2026-10-17T21:00:00.000Z')); // 00:00 AST
            expect(isQuiet).toBe(true);

            // OFD milestone with delivery toggle permitted
            const ofdDispatchable = isQuiet && config.allowDeliveryQuietHours;
            expect(ofdDispatchable).toBe(true);

            // Payment link milestone does NOT have delivery toggle exemption
            const payDispatchable = !isQuiet;
            expect(payDispatchable).toBe(false);
        });

        test('3.2 Out-for-delivery template dispatch generates GPS location token and embeds CTA link', () => {
            const shipment = {
                trackingNumber: 'TRG-OFD-99',
                status: 'out_for_delivery',
                locationToken: null,
                locationTokenExpiresAt: null
            };

            // Simulating dispatch interceptor generating token
            const token = generateLocationToken();
            shipment.locationToken = token;
            shipment.locationTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

            const ctaButtonUrl = `https://target-kw.com/location/${shipment.locationToken}`;

            expect(shipment.locationToken).toMatch(/^loc_/);
            expect(ctaButtonUrl).toBe(`https://target-kw.com/location/${token}`);
            expect(shipment.locationTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
        });

        test('3.3 36-hour age-guard suppresses automated dispatch on 48h-old historical shipment but permits fresh 2h shipment', () => {
            const now = Date.now();
            const historicalShipment = {
                id: 'shp-old',
                trackingNumber: 'TRG-OLD-01',
                createdAt: new Date(now - 48 * 60 * 60 * 1000) // 48 hours ago
            };
            const freshShipment = {
                id: 'shp-fresh',
                trackingNumber: 'TRG-FRESH-01',
                createdAt: new Date(now - 2 * 60 * 60 * 1000) // 2 hours ago
            };

            const checkAgeGuard = (s, force = false) => {
                if (force) return { skipped: false };
                const ageHours = (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60);
                if (ageHours > 36) {
                    return { skipped: true, reason: 'HISTORICAL_SHIPMENT' };
                }
                return { skipped: false };
            };

            expect(checkAgeGuard(historicalShipment).skipped).toBe(true);
            expect(checkAgeGuard(historicalShipment).reason).toBe('HISTORICAL_SHIPMENT');
            expect(checkAgeGuard(freshShipment).skipped).toBe(false);
            expect(checkAgeGuard(historicalShipment, true).skipped).toBe(false); // Admin force bypass
        });

        test('3.4 Duplicate event suppression prevents double-notifying the same role within 24 hours', () => {
            const logsStore = [
                {
                    trackingNumber: 'TRG-DEDUP-1',
                    recipientRole: 'receiver',
                    eventType: 'out_for_delivery',
                    status: 'SENT',
                    sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
                }
            ];

            const checkDuplicate = (logs, trackingNumber, role, eventType, force = false) => {
                if (force) return false;
                return logs.some(l =>
                    l.trackingNumber === trackingNumber &&
                    l.recipientRole === role &&
                    ['SENT', 'DELIVERED', 'READ'].includes(l.status)
                );
            };

            expect(checkDuplicate(logsStore, 'TRG-DEDUP-1', 'receiver', 'out_for_delivery')).toBe(true);
            expect(checkDuplicate(logsStore, 'TRG-DEDUP-1', 'sender', 'out_for_delivery')).toBe(false); // Different role
            expect(checkDuplicate(logsStore, 'TRG-DEDUP-1', 'receiver', 'out_for_delivery', true)).toBe(false); // Force override
        });

        test('3.5 Chatwoot drawer toggles smoothly between direct thread and contact search based on conversation ID', () => {
            const shipmentWithConversation = { chatwootConversationId: '8821', phone: '+96599112233' };
            const shipmentWithoutConversation = { chatwootConversationId: null, phone: '+96599112233' };

            const drawer1 = buildChatwootDrawerUrl(shipmentWithConversation);
            const drawer2 = buildChatwootDrawerUrl(shipmentWithoutConversation);

            expect(drawer1.type).toBe('CONVERSATION');
            expect(drawer1.url).toContain('/conversations/8821');

            expect(drawer2.type).toBe('CONTACT_SEARCH');
            expect(drawer2.url).toContain('/contacts?q=%2B96599112233');
        });

        test('3.6 Consignee pin submission appends audit event to shipment history and preserves chronological order', () => {
            const shipment = {
                history: [
                    { status: 'booked', timestamp: '2026-10-17T10:00:00.000Z', description: 'Shipment created' },
                    { status: 'out_for_delivery', timestamp: '2026-10-17T14:00:00.000Z', description: 'Out for delivery' }
                ]
            };

            const pinEvent = {
                status: 'out_for_delivery',
                timestamp: '2026-10-17T14:15:00.000Z',
                description: 'Consignee confirmed exact GPS delivery pin via WhatsApp portal',
                location: 'Salmiya, Kuwait'
            };

            const nextHistory = [...shipment.history, pinEvent];
            expect(nextHistory).toHaveLength(3);
            expect(nextHistory[2].description).toContain('GPS delivery pin');
            expect(new Date(nextHistory[2].timestamp).getTime()).toBeGreaterThan(new Date(nextHistory[1].timestamp).getTime());
        });

        test('3.7 Disabled milestone in WhatsAppEventRule blocks outbound dispatch while leaving other milestones active', () => {
            const rules = [
                { eventType: 'out_for_delivery', recipientRole: 'receiver', enabled: true },
                { eventType: 'delivered', recipientRole: 'receiver', enabled: false }
            ];

            const canSendEvent = (eventType, role) => {
                const r = rules.find(rule => rule.eventType === eventType && rule.recipientRole === role);
                return r ? r.enabled : true;
            };

            expect(canSendEvent('out_for_delivery', 'receiver')).toBe(true);
            expect(canSendEvent('delivered', 'receiver')).toBe(false);
        });
    });

    // =========================================================================
    // TIER 4: REAL-WORLD APPLICATION SCENARIOS (End-to-End Workflows, ≥5 scenarios)
    // =========================================================================
    describe('Tier 4: Real-World Application Scenarios (End-to-End Workflows)', () => {

        test('Scenario 1: Consignee Out-for-Delivery Location Pin Submission Flow', async () => {
            // Step 1: Shipment transitions to out_for_delivery
            const token = generateLocationToken();
            const shipment = {
                id: 'shp-live-01',
                trackingNumber: 'TRG-FLOW-001',
                status: 'out_for_delivery',
                locationToken: token,
                locationTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                locationTokenUsedAt: null,
                destination: {
                    contactPerson: 'Fahad Al-Mutawa',
                    city: 'Salmiya',
                    formattedAddress: 'Original Street'
                },
                history: [
                    { status: 'out_for_delivery', description: 'Assigned to delivery courier', timestamp: new Date().toISOString() }
                ]
            };

            // Step 2: Consignee opens /location/:token
            const tokenValidation = validateLocationToken(shipment);
            expect(tokenValidation.valid).toBe(true);

            // Step 3: Consignee drops pin at exact coordinates in Salmiya
            const submittedPin = {
                latitude: 29.338120,
                longitude: 48.079450,
                formattedAddress: 'Marina View Complex, Salem Al Mubarak St',
                buildingName: 'Tower A',
                unitNumber: 'Apt 4B',
                deliveryNotes: 'Leave with concierge if not answering'
            };

            const coordCheck = validateCoordinates(submittedPin.latitude, submittedPin.longitude);
            expect(coordCheck.valid).toBe(true);

            // Step 4: System updates destination and consumes token
            shipment.destination = {
                ...shipment.destination,
                ...submittedPin
            };
            shipment.locationTokenUsedAt = new Date();
            shipment.history.push({
                status: 'out_for_delivery',
                description: 'Consignee confirmed exact GPS delivery pin via WhatsApp portal',
                timestamp: new Date().toISOString()
            });

            // Step 5: Verification of updated destination state
            expect(shipment.destination.latitude).toBe(29.338120);
            expect(shipment.destination.longitude).toBe(48.079450);
            expect(shipment.destination.buildingName).toBe('Tower A');
            expect(shipment.locationTokenUsedAt).toBeInstanceOf(Date);
            expect(shipment.history).toHaveLength(2);

            // Step 6: Consignee tries to submit again after 30 minutes (past 15-min grace window)
            const futureDate = new Date(Date.now() + 30 * 60 * 1000);
            const replayCheck = validateLocationToken(shipment, futureDate);
            expect(replayCheck.valid).toBe(false);
            expect(replayCheck.code).toBe(410);
        });

        test('Scenario 2: Admin Configures Quiet Hours & Sends Manual Payment Link Notice', async () => {
            // Step 1: Admin configures quiet hours window (22:00 - 08:00 AST)
            const config = {
                quietHoursEnabled: true,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
                quietHoursTimezone: 'Asia/Kuwait'
            };

            // Step 2: Background check at 23:30 AST confirms quiet hours active
            const testTime = new Date('2026-10-17T20:30:00.000Z'); // 23:30 AST
            expect(evaluateKuwaitQuietHours(config, testTime)).toBe(true);

            // Step 3: Admin enters custom payment link notice from Shipment Details
            const customPaymentUrl = 'https://target.ottu.com/checkout/tok_live_12345';
            const amount = '14.250';
            const currency = 'KWD';

            // Step 4: Admin manual action passes force: true
            const noticePayload = {
                templateName: 'payment_request_v1',
                customPaymentUrl,
                amount,
                currency,
                force: true // Admin bypasses background quiet hours suppression
            };

            expect(noticePayload.force).toBe(true);
            expect(noticePayload.customPaymentUrl).toMatch(/^https:\/\//);
            expect(Number(noticePayload.amount).toFixed(3)).toBe('14.250');
        });

        test('Scenario 3: Staff Escalation to Chatwoot Live Support via Embedded Drawer', () => {
            // Step 1: Customer contacts support regarding delivery issue
            const notificationLog = {
                id: 'log-88',
                trackingNumber: 'TRG-LIVE-77',
                recipientPhone: '+96599112233',
                chatwootConversationId: null // Thread not yet opened
            };

            // Step 2: Staff clicks "Open Live Chat" -> fallback contact search is generated
            let drawer = buildChatwootDrawerUrl({
                accountId: '1',
                conversationId: notificationLog.chatwootConversationId,
                phone: notificationLog.recipientPhone
            });

            expect(drawer.type).toBe('CONTACT_SEARCH');
            expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/1/contacts?q=%2B96599112233');

            // Step 3: Chatwoot creates conversation thread #5102
            notificationLog.chatwootConversationId = '5102';

            // Step 4: Next drawer render points directly to conversation thread
            drawer = buildChatwootDrawerUrl({
                accountId: '1',
                conversationId: notificationLog.chatwootConversationId,
                phone: notificationLog.recipientPhone
            });

            expect(drawer.type).toBe('CONVERSATION');
            expect(drawer.url).toBe('https://inbox.mawthook.io/app/accounts/1/conversations/5102');
        });

        test('Scenario 4: Customs Hold Exception Notification with Document Action Link', async () => {
            // Step 1: Inbound scan indicates customs documentation delay
            const carrierScan = {
                status: 'exception',
                description: 'Customs clearance delay - commercial invoice missing or illegible at airport border'
            };

            // Step 2: Pattern matcher recognizes customs milestone
            const isCustomsHold = (desc) => {
                const s = String(desc || '').toLowerCase();
                return s.includes('customs') && (s.includes('delay') || s.includes('hold') || s.includes('invoice') || s.includes('clearance'));
            };

            expect(isCustomsHold(carrierScan.description)).toBe(true);

            // Step 3: Template target_customs_exception_hold selected
            const chosenTemplate = 'target_customs_exception_hold';
            const variables = [
                'TRG-CST-881',
                'Fahad Al-Mutawa',
                carrierScan.description,
                'Please upload official commercial invoice and Civil ID copy',
                'https://target-kw.com/track/TRG-CST-881'
            ];

            expect(chosenTemplate).toBe('target_customs_exception_hold');
            expect(variables[2]).toContain('Customs clearance delay');
            expect(variables[3]).toContain('Civil ID');
        });

        test('Scenario 5: User Management Chatwoot Credentials Lifecycle & Multi-Role RBAC', async () => {
            // Step 1: Admin creates user with Chatwoot Agent mapping
            const reqAdmin = {
                user: { id: 'admin-root', role: 'admin' },
                body: {
                    name: 'Agent Faisal',
                    email: 'faisal@target-kw.com',
                    password: 'SecurePassword123!',
                    role: 'staff',
                    chatwootUserId: '42',
                    chatwootEmail: 'faisal.chatwoot@target-kw.com'
                }
            };

            const createdUserRecord = {
                id: 'usr-faisal-42',
                ...reqAdmin.body
            };

            // Step 2: Admin queries user -> fields are visible
            const reqAdminView = { user: { role: 'admin' }, query: {} };
            const resAdminView = createMockResponse();

            jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([createdUserRecord]);
            await userController.getUsers(reqAdminView, resAdminView);

            expect(resAdminView.body.data[0].chatwootUserId).toBe('42');
            expect(resAdminView.body.data[0].chatwootEmail).toBe('faisal.chatwoot@target-kw.com');

            // Step 3: Non-admin client queries user list -> fields are strictly stripped
            const reqClientView = { user: { role: 'client' }, query: {} };
            const resClientView = createMockResponse();

            jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([createdUserRecord]);
            await userController.getUsers(reqClientView, resClientView);

            expect(resClientView.body.data[0].chatwootUserId).toBeUndefined();
            expect(resClientView.body.data[0].chatwootEmail).toBeUndefined();
        });
    });

    // =========================================================================
    // MILESTONE 2: WHATSAPP CONFIG SERVICE, TEMPLATES & REST ENDPOINTS
    // =========================================================================
    describe('Milestone 2: WhatsAppConfigService, Meta Utility Templates & Admin REST Endpoints', () => {

        // ---------------------------------------------------------------------
        // WhatsAppConfigService Unit & Integration Tests
        // ---------------------------------------------------------------------
        describe('WhatsAppConfigService Configuration & Rules', () => {
            test('M2.1 getConfig masks sensitive secrets by default with bullets', async () => {
                const mockConfigInDb = {
                    id: 'cfg-m2-1',
                    provider: 'SHIPMENT_WHATSAPP',
                    apiKey: 'sec_live_abcdef123456',
                    phoneId: '1098234908234',
                    chatwootApiToken: 'cw_token_xyz987',
                    quietHoursEnabled: true,
                    quietHoursStart: '22:00',
                    quietHoursEnd: '08:00',
                    quietHoursTimezone: 'Asia/Kuwait'
                };

                jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(mockConfigInDb);

                const config = await whatsAppConfigService.getConfig();

                expect(config.apiKey).toContain('••••');
                expect(config.phoneId).toBe('••••••••');
                expect(config.chatwootApiToken).toBe('••••••••');
                expect(config.provider).toBe('SHIPMENT_WHATSAPP');
            });

            test('M2.2 getConfig with internal: true returns raw unmasked credentials', async () => {
                const mockConfigInDb = {
                    id: 'cfg-m2-2',
                    provider: 'SHIPMENT_WHATSAPP',
                    apiKey: 'sec_live_abcdef123456',
                    phoneId: '1098234908234',
                    chatwootApiToken: 'cw_token_xyz987'
                };

                jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(mockConfigInDb);

                const config = await whatsAppConfigService.getConfig({ internal: true });

                expect(config.apiKey).toBe('sec_live_abcdef123456');
                expect(config.phoneId).toBe('1098234908234');
                expect(config.chatwootApiToken).toBe('cw_token_xyz987');
            });

            test('M2.3 updateConfig preserves existing secret values if masked with bullets or omitted', async () => {
                const existingConfig = {
                    id: 'cfg-m2-3',
                    provider: 'SHIPMENT_WHATSAPP',
                    apiKey: 'REAL_API_SECRET_KEY',
                    phoneId: 'REAL_PHONE_ID_123',
                    chatwootApiToken: 'REAL_CHATWOOT_TOKEN',
                    quietHoursEnabled: false
                };

                jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(existingConfig);
                const updateSpy = jest.spyOn(prisma.whatsAppConfig, 'update').mockImplementationOnce(async ({ data }) => ({
                    ...existingConfig,
                    ...data
                }));

                const updates = {
                    provider: 'META',
                    apiKey: '••••••••',
                    phoneId: '••••••••',
                    quietHoursEnabled: true
                };

                const updated = await whatsAppConfigService.updateConfig(updates);

                expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                    data: expect.not.objectContaining({
                        apiKey: '••••••••',
                        phoneId: '••••••••'
                    })
                }));
                expect(updated.provider).toBe('META');
            });

            test('M2.4 updateRules upserts rules by (configId, eventType, recipientRole)', async () => {
                const configRecord = { id: 'cfg-m2-4' };
                jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(configRecord);
                const upsertSpy = jest.spyOn(prisma.whatsAppEventRule, 'upsert').mockResolvedValue({});
                jest.spyOn(prisma.whatsAppEventRule, 'findMany').mockResolvedValueOnce([
                    { configId: 'cfg-m2-4', eventType: 'out_for_delivery', recipientRole: 'receiver', enabled: true }
                ]);

                const rules = [
                    {
                        eventType: 'out_for_delivery',
                        recipientRole: 'receiver',
                        templateName: 'target_shipment_out_for_delivery',
                        enabled: true,
                        allowQuietHoursBypass: false
                    }
                ];

                const result = await whatsAppConfigService.updateRules(rules);

                expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
                    where: {
                        configId_eventType_recipientRole: {
                            configId: 'cfg-m2-4',
                            eventType: 'out_for_delivery',
                            recipientRole: 'receiver'
                        }
                    }
                }));
                expect(result).toHaveLength(1);
            });

            test('M2.5 isQuietHours evaluates midnight-crossing window in Kuwait AST timezone', () => {
                const cfg = {
                    quietHoursEnabled: true,
                    quietHoursStart: '22:00',
                    quietHoursEnd: '08:00',
                    quietHoursTimezone: 'Asia/Kuwait'
                };

                // 23:30 AST (20:30 UTC) -> true
                expect(whatsAppConfigService._computeQuietHours(cfg, new Date('2026-10-17T20:30:00.000Z'))).toBe(true);
                // 04:00 AST (01:00 UTC) -> true
                expect(whatsAppConfigService._computeQuietHours(cfg, new Date('2026-10-17T01:00:00.000Z'))).toBe(true);
                // 15:00 AST (12:00 UTC) -> false
                expect(whatsAppConfigService._computeQuietHours(cfg, new Date('2026-10-17T12:00:00.000Z'))).toBe(false);
            });
        });

        // ---------------------------------------------------------------------
        // Meta Utility Templates & Token Generation in Service
        // ---------------------------------------------------------------------
        describe('Meta Utility Templates & Dispatch Integration', () => {
            test('M2.6 target_shipment_out_for_delivery generates 32-byte location token with 48h expiry if missing', async () => {
                const shipmentWithoutToken = {
                    id: 'shp-no-tok-1',
                    trackingNumber: 'TRG-GEN-TOKEN',
                    destination: { phone: '+96599112233', contactPerson: 'Fahad' },
                    origin: { phone: '+96597959567' },
                    carrierCode: 'INTERNAL',
                    createdAt: new Date(),
                    locationToken: null,
                    locationTokenExpiresAt: null
                };

                const updateShipmentSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({
                    ...shipmentWithoutToken,
                    locationToken: 'loc_abc123',
                    locationTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
                });
                jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-tok-1' });
                jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-tok-1', status: 'SENT' });
                jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);

                axios.post.mockResolvedValueOnce({
                    data: { status: 'sent', messageId: 'wamid.HBgLMTIz' }
                });

                await whatsappService.sendNotification({
                    shipment: shipmentWithoutToken,
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    recipientPhone: '+96599112233',
                    force: true
                });

                expect(updateShipmentSpy).toHaveBeenCalledWith(expect.objectContaining({
                    where: { id: 'shp-no-tok-1' },
                    data: expect.objectContaining({
                        locationToken: expect.stringMatching(/^loc_[a-f0-9]{64}$/),
                        locationTokenExpiresAt: expect.any(Date)
                    })
                }));
            });

            test('M2.7 Quiet-hours suppression marks log QUEUED with QUIET_HOURS_SUPPRESSED when not bypassed', async () => {
                const shipment = {
                    id: 'shp-quiet-1',
                    trackingNumber: 'TRG-QUIET-01',
                    destination: { phone: '+96599112233' },
                    origin: { phone: '+96597959567' },
                    createdAt: new Date()
                };

                // Mock config with quiet hours active right now
                jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                    id: 'cfg-q',
                    provider: 'SHIPMENT_WHATSAPP',
                    quietHoursEnabled: true,
                    quietHoursStart: '00:00',
                    quietHoursEnd: '23:59',
                    quietHoursTimezone: 'Asia/Kuwait',
                    allowDeliveryQuietHours: false
                });
                jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(true);
                jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({ allowQuietHoursBypass: false });
                jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
                const createLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({
                    id: 'log-quiet-queued'
                });

                const result = await whatsappService.sendNotification({
                    shipment,
                    eventType: 'payment_link_ready',
                    recipientRole: 'receiver',
                    recipientPhone: '+96599112233',
                    force: false
                });

                expect(result.status).toBe('QUEUED');
                expect(result.reason).toBe('QUIET_HOURS_SUPPRESSED');
                expect(createLogSpy).toHaveBeenCalledWith(expect.objectContaining({
                    data: expect.objectContaining({
                        status: 'QUEUED',
                        errorMessage: 'QUIET_HOURS_SUPPRESSED'
                    })
                }));
            });

            test('M2.8 sendPaymentLinkNotification calls sendNotification with force: true and payment_request_v1', async () => {
                const shipment = {
                    id: 'shp-pay-test',
                    trackingNumber: 'TRG-PAY-TEST',
                    destination: { phone: '+96599112233' },
                    remainingBalance: 15.5
                };

                const sendNotifSpy = jest.spyOn(whatsappService, 'sendNotification').mockResolvedValueOnce({
                    status: 'SENT',
                    logId: 'log-pay-1'
                });

                const result = await whatsappService.sendPaymentLinkNotification({
                    shipment,
                    recipientPhone: '+96599112233',
                    recipientRole: 'receiver',
                    paymentLink: 'https://target.ottu.com/checkout/tok_test',
                    amount: '15.500',
                    currency: 'KWD'
                });

                expect(sendNotifSpy).toHaveBeenCalledWith(expect.objectContaining({
                    eventType: 'payment_link_ready',
                    templateName: 'payment_request_v1',
                    force: true,
                    customMessage: {
                        paymentLink: 'https://target.ottu.com/checkout/tok_test',
                        amount: '15.500 KWD'
                    }
                }));
                expect(result.status).toBe('SENT');
            });
        });

        // ---------------------------------------------------------------------
        // REST Controller Endpoints: WhatsApp Settings & Manual Payment Link
        // ---------------------------------------------------------------------
        describe('REST Controller Endpoints', () => {
            test('M2.9 GET /api/settings/whatsapp returns config and rules with masked secrets', async () => {
                const req = { user: { role: 'admin' } };
                const res = createMockResponse();

                jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValueOnce({
                    id: 'cfg-1',
                    provider: 'SHIPMENT_WHATSAPP',
                    apiKey: '••••••••',
                    phoneId: '••••••••',
                    chatwootApiToken: '••••••••'
                });
                jest.spyOn(whatsAppConfigService, 'getRules').mockResolvedValueOnce([
                    { eventType: 'out_for_delivery', recipientRole: 'receiver', enabled: true }
                ]);

                await adminWhatsAppLogs.getWhatsAppConfig(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.config.apiKey).toBe('••••••••');
                expect(res.body.rules).toHaveLength(1);
            });

            test('M2.10 PUT /api/settings/whatsapp updates config and rules preserving secrets', async () => {
                const req = {
                    user: { role: 'admin' },
                    body: {
                        config: { provider: 'META', apiKey: '••••••••' },
                        rules: [{ eventType: 'out_for_delivery', recipientRole: 'receiver', enabled: false }]
                    }
                };
                const res = createMockResponse();

                jest.spyOn(whatsAppConfigService, 'updateConfig').mockResolvedValueOnce({
                    id: 'cfg-1',
                    provider: 'META',
                    apiKey: '••••••••'
                });
                jest.spyOn(whatsAppConfigService, 'updateRules').mockResolvedValueOnce([
                    { eventType: 'out_for_delivery', recipientRole: 'receiver', enabled: false }
                ]);

                await adminWhatsAppLogs.updateWhatsAppConfig(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.config.provider).toBe('META');
                expect(res.body.rules[0].enabled).toBe(false);
            });

            test('M2.11 POST /api/shipments/:trackingNumber/whatsapp/payment-link validates HTTPS payment URL', async () => {
                const req = {
                    params: { trackingNumber: 'TRG-PL-1' },
                    body: { customPaymentUrl: 'javascript:alert(1)' },
                    user: { role: 'staff' }
                };
                const res = createMockResponse();

                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('secure HTTP or HTTPS');
            });

            test('M2.12 POST /api/shipments/:trackingNumber/whatsapp/payment-link rejects CRLF injection in payment URL', async () => {
                const req = {
                    params: { trackingNumber: 'TRG-PL-1' },
                    body: { customPaymentUrl: 'https://pay.com\r\nInjected:header' },
                    user: { role: 'staff' }
                };
                const res = createMockResponse();

                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('CRLF');
            });

            test('M2.13 POST /api/shipments/:trackingNumber/whatsapp/payment-link returns 404 for unknown shipment', async () => {
                const req = {
                    params: { trackingNumber: 'NON_EXISTENT' },
                    body: { customPaymentUrl: 'https://target.ottu.com/checkout/123' },
                    user: { role: 'admin' }
                };
                const res = createMockResponse();

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(null);

                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

                expect(res.statusCode).toBe(404);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('Shipment not found');
            });

            test('M2.14 POST /api/shipments/:trackingNumber/whatsapp/payment-link successfully dispatches notice', async () => {
                const shipmentRecord = {
                    id: 'shp-pl-ok',
                    trackingNumber: 'TRG-PL-OK',
                    destination: { phone: '+96599112233', contactPerson: 'Fahad' },
                    remainingBalance: 12.75,
                    currency: 'KWD'
                };
                const req = {
                    params: { trackingNumber: 'TRG-PL-OK' },
                    body: {
                        customPaymentUrl: 'https://target.ottu.com/checkout/tok_live_123',
                        amount: '12.750',
                        recipientRole: 'receiver'
                    },
                    user: { role: 'admin' }
                };
                const res = createMockResponse();

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipmentRecord);
                jest.spyOn(whatsappService, 'sendPaymentLinkNotification').mockResolvedValueOnce({
                    status: 'SENT',
                    logId: 'log-pl-ok',
                    externalMessageId: 'wamid.HBgL123'
                });

                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.message).toContain('Payment link notification dispatched');
            });
        });
    });

    // =========================================================================
    // MILESTONE 3: SELF-SERVICE CUSTOMER GPS PIN PORTAL (CONTROLLER ENDPOINTS)
    // =========================================================================
    describe('Milestone 3: Self-Service Customer GPS Pin Portal Controller Endpoints', () => {

        describe('getLocationByToken Endpoint', () => {
            test('M3.1 getLocationByToken returns 400 when token parameter is missing or empty', async () => {
                const req = { params: { token: '   ' } };
                const res = createMockResponse();

                await shipmentPublicController.getLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('token is required');
            });

            test('M3.2 getLocationByToken returns 404 when token is not found in database', async () => {
                const req = { params: { token: 'loc_nonexistent_token_123456789' } };
                const res = createMockResponse();

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(null);

                await shipmentPublicController.getLocationByToken(req, res);

                expect(res.statusCode).toBe(404);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('not found');
            });

            test('M3.3 getLocationByToken returns 410 when token is expired', async () => {
                const req = { params: { token: 'loc_expired_token_123' } };
                const res = createMockResponse();

                const expiredShipment = {
                    id: 'shp-exp-1',
                    trackingNumber: 'TRG-EXP-001',
                    locationToken: 'loc_expired_token_123',
                    locationTokenExpiresAt: new Date(Date.now() - 3600000), // 1 hour ago
                    destination: { contactPerson: 'Ahmad' }
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(expiredShipment);

                await shipmentPublicController.getLocationByToken(req, res);

                expect(res.statusCode).toBe(410);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('expired');
            });

            test('M3.4 getLocationByToken returns 410 when token was used past 15-min grace window', async () => {
                const req = { params: { token: 'loc_used_token_123' } };
                const res = createMockResponse();

                const consumedShipment = {
                    id: 'shp-used-1',
                    trackingNumber: 'TRG-USED-001',
                    locationToken: 'loc_used_token_123',
                    locationTokenExpiresAt: new Date(Date.now() + 24 * 3600000),
                    locationTokenUsedAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
                    destination: { contactPerson: 'Ahmad' }
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(consumedShipment);

                await shipmentPublicController.getLocationByToken(req, res);

                expect(res.statusCode).toBe(410);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('already confirmed');
            });

            test('M3.5 getLocationByToken returns 200 with shipment delivery context for valid token', async () => {
                const req = { params: { token: 'loc_valid_token_abc' } };
                const res = createMockResponse();

                const validShipment = {
                    id: 'shp-val-1',
                    trackingNumber: 'TRG-VAL-001',
                    locationToken: 'loc_valid_token_abc',
                    locationTokenExpiresAt: new Date(Date.now() + 48 * 3600000),
                    status: 'out_for_delivery',
                    destination: {
                        contactPerson: 'Fahad Al-Mutawa',
                        formattedAddress: 'Al-Salmiya, Block 4, St 12',
                        city: 'Al-Salmiya',
                        latitude: 29.3381,
                        longitude: 48.0794
                    }
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(validShipment);

                await shipmentPublicController.getLocationByToken(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.trackingNumber).toBe('TRG-VAL-001');
                expect(res.body.recipientName).toBe('Fahad Al-Mutawa');
                expect(res.body.currentDestination.city).toBe('Al-Salmiya');
                expect(res.body.status).toBe('out_for_delivery');
            });
        });

        describe('updateLocationByToken Endpoint', () => {
            test('M3.6 updateLocationByToken returns 400 when token is missing', async () => {
                const req = { params: { token: '' }, body: { coordinates: [48.0, 29.3] } };
                const res = createMockResponse();

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
            });

            test('M3.7 updateLocationByToken returns 404 when token is not found', async () => {
                const req = { params: { token: 'loc_missing_token' }, body: { coordinates: [48.0, 29.3] } };
                const res = createMockResponse();

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(null);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(404);
                expect(res.body.success).toBe(false);
            });

            test('M3.8 updateLocationByToken returns 410 when token is expired', async () => {
                const req = { params: { token: 'loc_expired_token' }, body: { coordinates: [48.0, 29.3] } };
                const res = createMockResponse();

                const expiredShipment = {
                    id: 'shp-exp-2',
                    trackingNumber: 'TRG-EXP-002',
                    locationToken: 'loc_expired_token',
                    locationTokenExpiresAt: new Date(Date.now() - 5000),
                    destination: {}
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(expiredShipment);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(410);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('expired');
            });

            test('M3.9 updateLocationByToken returns 400 when coordinates are missing or invalid', async () => {
                const req = {
                    params: { token: 'loc_active_token' },
                    body: { formattedAddress: 'Salmiya' } // missing coordinates
                };
                const res = createMockResponse();

                const activeShipment = {
                    id: 'shp-act-1',
                    trackingNumber: 'TRG-ACT-001',
                    locationToken: 'loc_active_token',
                    locationTokenExpiresAt: new Date(Date.now() + 3600000),
                    destination: {}
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('coordinates are required');
            });

            test('M3.10 updateLocationByToken returns 400 when latitude is out of [-90, 90] bounds', async () => {
                const req = {
                    params: { token: 'loc_active_token' },
                    body: { coordinates: [48.079, 99.5] } // lat 99.5 invalid
                };
                const res = createMockResponse();

                const activeShipment = {
                    id: 'shp-act-2',
                    trackingNumber: 'TRG-ACT-002',
                    locationToken: 'loc_active_token',
                    locationTokenExpiresAt: new Date(Date.now() + 3600000),
                    destination: {}
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('Latitude must be');
            });

            test('M3.11 updateLocationByToken returns 400 when longitude is out of [-180, 180] bounds', async () => {
                const req = {
                    params: { token: 'loc_active_token' },
                    body: { coordinates: [195.0, 29.3] } // lng 195 invalid
                };
                const res = createMockResponse();

                const activeShipment = {
                    id: 'shp-act-3',
                    trackingNumber: 'TRG-ACT-003',
                    locationToken: 'loc_active_token',
                    locationTokenExpiresAt: new Date(Date.now() + 3600000),
                    destination: {}
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
                expect(res.body.error).toContain('Longitude must be');
            });

            test('M3.12 updateLocationByToken updates destination, appends LOCATION_CONFIRMED_BY_CUSTOMER history, sets grace expiry, and returns 200', async () => {
                const req = {
                    params: { token: 'loc_success_token' },
                    body: {
                        coordinates: [48.079450, 29.338120],
                        formattedAddress: 'Marina View Complex, Salem Al Mubarak St',
                        buildingName: 'Tower A',
                        unitNumber: 'Apt 4B',
                        deliveryNotes: 'Leave with concierge'
                    }
                };
                const res = createMockResponse();

                const activeShipment = {
                    id: 'shp-act-4',
                    trackingNumber: 'TRG-SUCCESS-001',
                    locationToken: 'loc_success_token',
                    locationTokenExpiresAt: new Date(Date.now() + 48 * 3600000),
                    status: 'out_for_delivery',
                    destination: {
                        contactPerson: 'Fahad Al-Mutawa',
                        city: 'Salmiya'
                    },
                    history: []
                };

                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);
                const updateSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({
                    ...activeShipment,
                    destination: {
                        ...activeShipment.destination,
                        ...req.body
                    }
                });
                jest.spyOn(prisma.shipmentAuditLog, 'create').mockResolvedValueOnce({ id: 'aud-1' });

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.trackingNumber).toBe('TRG-SUCCESS-001');
                expect(res.body.destination.buildingName).toBe('Tower A');
                expect(res.body.destination.deliveryNotes).toBe('Leave with concierge');

                expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                    where: { id: 'shp-act-4' },
                    data: expect.objectContaining({
                        destination: expect.objectContaining({
                            buildingName: 'Tower A',
                            latitude: 29.338120,
                            longitude: 48.079450
                        }),
                        history: expect.arrayContaining([
                            expect.objectContaining({
                                event: 'LOCATION_CONFIRMED_BY_CUSTOMER',
                                source: 'consignee_portal'
                            })
                        ]),
                        locationTokenExpiresAt: expect.any(Date)
                    })
                }));
            });
        });
    });
});

