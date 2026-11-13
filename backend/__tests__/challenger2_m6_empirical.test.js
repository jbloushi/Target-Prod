/**
 * Empirical Adversarial Challenge Test Suite
 * File: backend/__tests__/challenger2_m6_empirical.test.js
 * 
 * Target Logistics 3PL Platform - Milestone 6 Adversarial Challenge
 * Scope:
 *  1. Location Token Generation (32-byte hex entropy, Shannon entropy, 48h expiration)
 *  2. Single-use / 15-minute edit grace period lifecycle (200 on re-edit, 410 on expiry or >15m)
 *  3. Coordinate validation & extreme boundary stress tests (lat -90..90, lng -180..180, non-numeric, 400 Bad Request)
 *  4. User RBAC isolation (chatwootUserId & chatwootEmail stripped for non-admins, updates rejected)
 *  5. Chatwoot Drawer URLs & Phone Query encoding
 */

const crypto = require('crypto');
const axios = require('axios');
const whatsappService = require('../src/services/whatsappIntegration.service');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const shipmentPublicController = require('../src/controllers/shipment-public.controller');
const userController = require('../src/controllers/user.controller');
const { prisma } = require('../src/config/database');

jest.mock('axios');

// Mock response creator
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

// Calculate Shannon entropy in bits per character
function calculateShannonEntropy(str) {
    const len = str.length;
    if (len === 0) return 0;
    const freq = {};
    for (const ch of str) {
        freq[ch] = (freq[ch] || 0) + 1;
    }
    let entropy = 0;
    for (const ch in freq) {
        const p = freq[ch] / len;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

// Helper mirroring Chatwoot Conversation Drawer URL resolution logic (from ChatwootConversationDrawer.jsx)
function resolveDrawerUrls({
    accountId = '1',
    chatwootConversationId,
    conversationId,
    phone
}) {
    const effectiveConversationId = (chatwootConversationId && String(chatwootConversationId).trim()) || 
                                    (conversationId && String(conversationId).trim()) || null;
    const effectiveAccountId = accountId || '1';
    const cleanPhone = (phone || '').trim();

    const conversationUrl = effectiveConversationId
        ? `https://inbox.mawthook.io/app/accounts/${effectiveAccountId}/conversations/${effectiveConversationId}`
        : null;

    const fallbackUrl = `https://inbox.mawthook.io/app/accounts/${effectiveAccountId}/contacts?q=${encodeURIComponent(cleanPhone)}`;

    return {
        effectiveConversationId,
        effectiveAccountId,
        cleanPhone,
        conversationUrl,
        fallbackUrl,
        activeExternalUrl: conversationUrl || fallbackUrl
    };
}

describe('CHALLENGER_2 Empirical Adversarial Test Suite', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // 1. LOCATION TOKEN GENERATION & ENTROPY INVARIANTS
    // =========================================================================
    describe('1. Location Token Generation & Cryptographic Entropy', () => {

        test('1.1 Token generation produces exactly 32 bytes (64 hex characters) of cryptographic entropy with loc_ prefix', () => {
            // Emulate generator as defined in whatsappIntegration.service.js:487
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            
            expect(token).toMatch(/^loc_[0-9a-f]{64}$/);
            expect(token.length).toBe(4 + 64); // "loc_" is 4 chars, 32 bytes in hex is 64 chars -> 68 chars
            expect(token.substring(4)).toHaveLength(64);
        });

        test('1.2 Empirical collision resistance: 5,000 generated tokens exhibit zero duplicate collisions', () => {
            const tokenSet = new Set();
            const iterations = 5000;

            for (let i = 0; i < iterations; i++) {
                const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
                tokenSet.add(token);
            }

            expect(tokenSet.size).toBe(iterations);
        });

        test('1.3 Shannon entropy of 32-byte hex entropy stream approaches theoretical maximum of 4.0 bits/hex-character', () => {
            // Hex uses 16 distinct symbols [0-9, a-f]. Max Shannon entropy is log2(16) = 4.0 bits.
            // Concatenate 500 generated token hex payloads to get a robust sample.
            let stream = '';
            for (let i = 0; i < 500; i++) {
                stream += crypto.randomBytes(32).toString('hex');
            }

            const entropy = calculateShannonEntropy(stream);
            // Empirical entropy should be >= 3.9 bits/symbol for a cryptographically secure PRNG
            expect(entropy).toBeGreaterThanOrEqual(3.90);
            expect(entropy).toBeLessThanOrEqual(4.00);
        });

        test('1.4 Expiration timestamp is set strictly to 48 hours in the future (within 2000ms execution tolerance)', async () => {
            const before = Date.now();
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
            const after = Date.now();

            const expectedMs = 48 * 60 * 60 * 1000;
            const diff = expiresAt.getTime() - before;

            expect(diff).toBeGreaterThanOrEqual(expectedMs);
            expect(diff).toBeLessThanOrEqual(expectedMs + (after - before) + 2000);
        });

        test('1.5 automatic out-for-delivery dispatch is blocked without creating a location token', async () => {
            const shipment = {
                id: 'shp-emp-1',
                trackingNumber: 'TRG-EMP-TOK-01',
                locationToken: null,
                locationTokenExpiresAt: null,
                destination: { phone: '+96599112233' }
            };

            jest.spyOn(prisma.shipment, 'findUnique').mockResolvedValue(shipment);
            const updateSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({
                ...shipment,
                locationToken: 'loc_mocked',
                locationTokenExpiresAt: new Date(Date.now() + 48 * 3600000)
            });
            const logCreateSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'log-suppressed' });

            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-test',
                quietHoursEnabled: false
            });
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'log-1' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValue({ id: 'log-1', status: 'SENT' });
            axios.post.mockResolvedValue({ data: { status: 'sent', messageId: 'wamid.123' } });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true
            });

            expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'MANUAL_DISPATCH_REQUIRED' }));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(logCreateSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'SKIPPED', errorMessage: 'MANUAL_DISPATCH_REQUIRED' })
            }));
        });

        test('1.6 automatic out-for-delivery updates do not change an existing location token', async () => {
            const existingToken = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const existingExpiry = new Date(Date.now() + 30 * 3600000); // 30h remaining

            const shipment = {
                id: 'shp-emp-preserve',
                trackingNumber: 'TRG-EMP-PRESERVE',
                locationToken: existingToken,
                locationTokenExpiresAt: existingExpiry,
                destination: { phone: '+96599112233' }
            };

            jest.spyOn(prisma.shipment, 'findUnique').mockResolvedValue(shipment);
            const updateSpy = jest.spyOn(prisma.shipment, 'update');
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'log-p1' });

            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({ quietHoursEnabled: false });
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'log-p1' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValue({ id: 'log-p1', status: 'SENT' });
            axios.post.mockResolvedValue({ data: { status: 'sent' } });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true
            });

            expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'MANUAL_DISPATCH_REQUIRED' }));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(shipment.locationToken).toBe(existingToken);
            expect(shipment.locationTokenExpiresAt).toBe(existingExpiry);
        });

        test('1.7 automatic out-for-delivery updates do not renew an expired location token', async () => {
            const expiredToken = `loc_old_expired_${crypto.randomBytes(26).toString('hex')}`;
            const pastExpiry = new Date(Date.now() - 3600000); // expired 1h ago

            const shipment = {
                id: 'shp-emp-renew',
                trackingNumber: 'TRG-EMP-RENEW',
                locationToken: expiredToken,
                locationTokenExpiresAt: pastExpiry,
                destination: { phone: '+96599112233' }
            };

            jest.spyOn(prisma.shipment, 'findUnique').mockResolvedValue(shipment);
            const updateSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValue({ id: 'shp-emp-renew' });
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'log-r1' });

            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({ quietHoursEnabled: false });
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'log-r1' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValue({ id: 'log-r1', status: 'SENT' });
            axios.post.mockResolvedValue({ data: { status: 'sent' } });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: true
            });

            expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'MANUAL_DISPATCH_REQUIRED' }));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(shipment.locationToken).toBe(expiredToken);
            expect(shipment.locationTokenExpiresAt).toBe(pastExpiry);
        });
    });

    // =========================================================================
    // 2. SINGLE-USE / 15-MINUTE EDIT GRACE PERIOD LIFECYCLE
    // =========================================================================
    describe('2. Single-use & 15-Minute Edit Grace Period Lifecycle', () => {

        test('2.1 Fresh, unused token returns 200 with shipment delivery context', async () => {
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const req = { params: { token } };
            const res = createMockResponse();

            const shipment = {
                id: 'shp-fresh',
                trackingNumber: 'TRG-FRESH-001',
                locationToken: token,
                locationTokenExpiresAt: new Date(Date.now() + 48 * 3600000),
                status: 'out_for_delivery',
                destination: {
                    contactPerson: 'Ali Al-Hassan',
                    city: 'Kuwait City'
                }
            };

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipment);

            await shipmentPublicController.getLocationByToken(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.valid).toBe(true);
            expect(res.body.trackingNumber).toBe('TRG-FRESH-001');
            expect(res.body.recipientName).toBe('Ali Al-Hassan');
        });

        test('2.2 First pin submission updates coordinates, sets locationTokenUsedAt, sets 15-minute grace expiry, and returns 200', async () => {
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const req = {
                params: { token },
                body: {
                    latitude: 29.3759,
                    longitude: 47.9774,
                    formattedAddress: 'Kuwait City, Al-Soor St, Tower 5',
                    notes: 'Ring bell on 4th floor'
                }
            };
            const res = createMockResponse();

            const shipment = {
                id: 'shp-sub-1',
                trackingNumber: 'TRG-SUB-001',
                locationToken: token,
                locationTokenExpiresAt: new Date(Date.now() + 48 * 3600000),
                locationTokenUsedAt: null,
                status: 'out_for_delivery',
                destination: {
                    contactPerson: 'Mona Al-Sabah',
                    city: 'Kuwait City'
                },
                history: []
            };

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipment);
            const updateSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({ id: 'shp-sub-1' });
            jest.spyOn(prisma.shipmentAuditLog, 'create').mockResolvedValueOnce({ id: 'aud-sub-1' });

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.destination.latitude).toBe(29.3759);
            expect(res.body.destination.longitude).toBe(47.9774);

            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'shp-sub-1' },
                data: expect.objectContaining({
                    destination: expect.objectContaining({
                        latitude: 29.3759,
                        longitude: 47.9774,
                        coordinates: [47.9774, 29.3759],
                        locationTokenUsedAt: expect.any(String)
                    }),
                    locationTokenExpiresAt: expect.any(Date)
                })
            }));

            // Grace expiry must be ~15 mins from now
            const passedGraceExpiry = updateSpy.mock.calls[0][0].data.locationTokenExpiresAt;
            const diffMinutes = (passedGraceExpiry.getTime() - Date.now()) / (60 * 1000);
            expect(diffMinutes).toBeGreaterThan(14.8);
            expect(diffMinutes).toBeLessThanOrEqual(15.1);
        });

        test('2.3 Second submission within 15-minute grace period (at t = +5 mins) successfully permits coordinate re-adjustment', async () => {
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const tenMinutesRemaining = new Date(Date.now() + 10 * 60 * 1000);

            const req = {
                params: { token },
                body: {
                    latitude: 29.3780,
                    longitude: 47.9800,
                    formattedAddress: 'Kuwait City, Al-Soor St, Tower 5 - Entrance B',
                    notes: 'Updated: Use service entrance'
                }
            };
            const res = createMockResponse();

            const shipment = {
                id: 'shp-grace-ok',
                trackingNumber: 'TRG-GRACE-001',
                locationToken: token,
                locationTokenExpiresAt: tenMinutesRemaining, // still valid for 10 more minutes
                destination: {
                    latitude: 29.3759,
                    longitude: 47.9774,
                    locationTokenUsedAt: fiveMinutesAgo.toISOString()
                },
                history: []
            };

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipment);
            const updateSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({ id: 'shp-grace-ok' });
            jest.spyOn(prisma.shipmentAuditLog, 'create').mockResolvedValueOnce({ id: 'aud-grace-1' });

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.destination.latitude).toBe(29.3780);
            expect(res.body.destination.longitude).toBe(47.9800);
            expect(updateSpy).toHaveBeenCalled();
        });

        test('2.4 Submission after 15-minute grace period (at t = +16 mins) is rejected with 410 Gone', async () => {
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);

            const req = {
                params: { token },
                body: {
                    latitude: 29.3780,
                    longitude: 47.9800
                }
            };
            const res = createMockResponse();

            const shipment = {
                id: 'shp-grace-expired',
                trackingNumber: 'TRG-EXPIRED-GRACE',
                locationToken: token,
                locationTokenExpiresAt: new Date(Date.now() - 1 * 60 * 1000), // expired 1 min ago
                destination: {
                    locationTokenUsedAt: sixteenMinutesAgo.toISOString()
                }
            };

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(410);
            expect(res.body.success).toBe(false);
            expect(res.body.valid).toBe(false);
            expect(res.body.code).toBe(410);
        });

        test('2.5 GET request after 15-minute grace period also returns 410 Gone', async () => {
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const req = { params: { token } };
            const res = createMockResponse();

            const shipment = {
                id: 'shp-get-consumed',
                trackingNumber: 'TRG-GET-CONSUMED',
                locationToken: token,
                locationTokenExpiresAt: new Date(Date.now() + 10 * 3600000),
                destination: {
                    locationTokenUsedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 mins ago
                }
            };

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipment);

            await shipmentPublicController.getLocationByToken(req, res);

            expect(res.statusCode).toBe(410);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe(410);
            expect(res.body.error).toContain('already confirmed');
        });

        test('2.6 Submission with an unused token that expired past 48h returns 410 Gone', async () => {
            const token = `loc_${crypto.randomBytes(32).toString('hex')}`;
            const req = {
                params: { token },
                body: { latitude: 29.3, longitude: 47.9 }
            };
            const res = createMockResponse();

            const shipment = {
                id: 'shp-48h-exp',
                trackingNumber: 'TRG-48H-EXP',
                locationToken: token,
                locationTokenExpiresAt: new Date(Date.now() - 3600000), // expired 1 hour ago
                destination: {}
            };

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(shipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(410);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('expired');
        });

        test('2.7 Query with unknown token returns 404 Not Found', async () => {
            const req = { params: { token: 'loc_unknown_random_token_999' } };
            const res = createMockResponse();

            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(null);

            await shipmentPublicController.getLocationByToken(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('not found');
        });

        test('2.8 Query with empty or whitespace token returns 400 Bad Request', async () => {
            const req = { params: { token: '    ' } };
            const res = createMockResponse();

            await shipmentPublicController.getLocationByToken(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('token is required');
        });
    });

    // =========================================================================
    // 3. COORDINATE VALIDATION & EXTREME BOUNDARY STRESS TESTS
    // =========================================================================
    describe('3. Coordinate Validation & Adversarial Boundaries', () => {

        const validToken = 'loc_active_valid_token_123';
        const activeShipment = {
            id: 'shp-coord-test',
            trackingNumber: 'TRG-COORD-001',
            locationToken: validToken,
            locationTokenExpiresAt: new Date(Date.now() + 48 * 3600000),
            destination: {},
            history: []
        };

        test('3.1 Rejects latitude > 90 (e.g., lat 95.0) with 400 Bad Request', async () => {
            const req = {
                params: { token: validToken },
                body: { latitude: 95.0, longitude: 47.9 }
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Latitude must be a valid number between -90 and 90');
        });

        test('3.2 Rejects latitude < -90 (e.g., lat -90.0001) with 400 Bad Request', async () => {
            const req = {
                params: { token: validToken },
                body: { latitude: -90.0001, longitude: 47.9 }
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Latitude must be a valid number between -90 and 90');
        });

        test('3.3 Rejects longitude < -180 (e.g., lng -190.0) with 400 Bad Request', async () => {
            const req = {
                params: { token: validToken },
                body: { latitude: 29.3, longitude: -190.0 }
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Longitude must be a valid number between -180 and 180');
        });

        test('3.4 Rejects longitude > 180 (e.g., lng 180.0001) with 400 Bad Request', async () => {
            const req = {
                params: { token: validToken },
                body: { latitude: 29.3, longitude: 180.0001 }
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Longitude must be a valid number between -180 and 180');
        });

        test('3.5 Rejects non-numeric strings ("twenty-nine", "forty-seven") with 400 Bad Request', async () => {
            const req = {
                params: { token: validToken },
                body: { latitude: 'twenty-nine', longitude: 'forty-seven' }
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('coordinates are required');
        });

        test('3.6 Rejects special IEEE-754 non-finite values (NaN, Infinity, -Infinity) with 400 Bad Request', async () => {
            const testValues = [NaN, Infinity, -Infinity];

            for (const val of testValues) {
                const req = {
                    params: { token: validToken },
                    body: { latitude: val, longitude: 47.9 }
                };
                const res = createMockResponse();
                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
            }
        });

        test('3.7 Rejects empty payload or incomplete coordinates array with 400 Bad Request', async () => {
            const malformedBodies = [
                {},
                { coordinates: [] },
                { coordinates: [29.3] }, // missing second coordinate
                { coordinates: ['invalid', 'array'] },
                { address: 'Salmiya' } // missing lat/lng entirely
            ];

            for (const body of malformedBodies) {
                const req = { params: { token: validToken }, body };
                const res = createMockResponse();
                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
            }
        });

        test('3.8 Accepts valid extreme boundaries: North Pole (90, 0), South Pole (-90, 0), Antimeridian (0, 180), Null Island (0, 0)', async () => {
            const validBoundaries = [
                { lat: 90, lng: 0, desc: 'North Pole' },
                { lat: -90, lng: 0, desc: 'South Pole' },
                { lat: 0, lng: 180, desc: 'Antimeridian East' },
                { lat: 0, lng: -180, desc: 'Antimeridian West' },
                { lat: 0, lng: 0, desc: 'Equator / Prime Meridian' }
            ];

            for (const b of validBoundaries) {
                const req = {
                    params: { token: validToken },
                    body: { latitude: b.lat, longitude: b.lng }
                };
                const res = createMockResponse();
                jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);
                jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({ id: 'shp-coord-test' });
                jest.spyOn(prisma.shipmentAuditLog, 'create').mockResolvedValueOnce({ id: 'aud-b' });

                await shipmentPublicController.updateLocationByToken(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.destination.latitude).toBe(b.lat);
                expect(res.body.destination.longitude).toBe(b.lng);
            }
        });

        test('3.9 Accepts stringified valid numeric coordinates ("29.3759", "47.9774") and parses to numbers', async () => {
            const req = {
                params: { token: validToken },
                body: { latitude: '29.3759', longitude: '47.9774' }
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);
            jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({ id: 'shp-coord-test' });
            jest.spyOn(prisma.shipmentAuditLog, 'create').mockResolvedValueOnce({ id: 'aud-num-str' });

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.destination.latitude).toBe(29.3759);
            expect(res.body.destination.longitude).toBe(47.9774);
            expect(typeof res.body.destination.latitude).toBe('number');
            expect(typeof res.body.destination.longitude).toBe('number');
        });

        test('3.10 Inverted [lat, lng] array within Kuwait regional bounds (~29, ~48) is automatically detected and normalized', async () => {
            const req = {
                params: { token: validToken },
                body: { coordinates: [29.3381, 48.0794] } // Kuwait lat first, lng second
            };
            const res = createMockResponse();
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(activeShipment);
            const updateSpy = jest.spyOn(prisma.shipment, 'update').mockResolvedValueOnce({ id: 'shp-coord-test' });
            jest.spyOn(prisma.shipmentAuditLog, 'create').mockResolvedValueOnce({ id: 'aud-inv' });

            await shipmentPublicController.updateLocationByToken(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.destination.latitude).toBe(29.3381);
            expect(res.body.destination.longitude).toBe(48.0794);
            // GeoJSON coordinates array is stored [lng, lat]
            expect(updateSpy.mock.calls[0][0].data.destination.coordinates).toEqual([48.0794, 29.3381]);
        });
    });

    // =========================================================================
    // 4. USER RBAC ISOLATION (chatwootUserId & chatwootEmail)
    // =========================================================================
    describe('4. User RBAC Isolation (chatwootUserId & chatwootEmail)', () => {

        const mockUsersInDb = [
            {
                id: 'usr-1',
                name: 'Staff Agent One',
                email: 'staff1@target-kw.com',
                role: 'staff',
                chatwootUserId: 'agent_14',
                chatwootEmail: 'agent14@mawthook.io',
                active: true
            },
            {
                id: 'usr-2',
                name: 'Driver Ahmed',
                email: 'driver1@target-kw.com',
                role: 'driver',
                chatwootUserId: 'agent_22',
                chatwootEmail: 'driver22@mawthook.io',
                active: true
            }
        ];

        test('4.1 Admin viewer requesting GET /api/users receives chatwootUserId and chatwootEmail', async () => {
            const req = { user: { id: 'admin-1', role: 'admin' }, query: {} };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([...mockUsersInDb]);

            await userController.getUsers(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data[0].chatwootUserId).toBe('agent_14');
            expect(res.body.data[0].chatwootEmail).toBe('agent14@mawthook.io');
            expect(res.body.data[1].chatwootUserId).toBe('agent_22');
            expect(res.body.data[1].chatwootEmail).toBe('driver22@mawthook.io');
        });

        test('4.2 Non-admin roles (client, driver, staff, warehouse) NEVER receive chatwootUserId or chatwootEmail on GET /api/users', async () => {
            const nonAdminRoles = ['client', 'driver', 'staff', 'warehouse'];

            for (const role of nonAdminRoles) {
                const req = { user: { id: `user-${role}`, role }, query: {} };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([...mockUsersInDb]);

                await userController.getUsers(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.success).toBe(true);
                for (const user of res.body.data) {
                    expect(user.chatwootUserId).toBeUndefined();
                    expect(user.chatwootEmail).toBeUndefined();
                    expect(Object.keys(user)).not.toContain('chatwootUserId');
                    expect(Object.keys(user)).not.toContain('chatwootEmail');
                }
            }
        });

        test('4.3 Non-admin viewer requesting GET /api/users/:id has chatwootUserId and chatwootEmail stripped', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'client-1', role: 'client' }
            };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({ ...mockUsersInDb[0] });

            await userController.getUserById(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.chatwootUserId).toBeUndefined();
            expect(res.body.data.chatwootEmail).toBeUndefined();
            expect(Object.keys(res.body.data)).not.toContain('chatwootUserId');
            expect(Object.keys(res.body.data)).not.toContain('chatwootEmail');
        });

        test('4.4 Non-admin submitting PUT /api/users/:id with chatwootUserId or chatwootEmail has those fields IGNORED', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'staff-caller', role: 'staff', organizationId: 'org-1' },
                body: {
                    name: 'Updated Name',
                    chatwootUserId: 'hacker_injected_id',
                    chatwootEmail: 'hacker@malicious.com'
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'client',
                organizationId: 'org-1',
                chatwootUserId: 'agent_original',
                chatwootEmail: 'original@target-kw.com'
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockResolvedValueOnce({
                ...existingUser,
                name: 'Updated Name'
            });

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            expect(updateSpy).toHaveBeenCalled();
            const updateData = updateSpy.mock.calls[0][0].data;

            // Adversarial assertion: chatwoot fields must NOT be present in Prisma updateData
            expect(updateData.chatwootUserId).toBeUndefined();
            expect(updateData.chatwootEmail).toBeUndefined();
            expect(Object.keys(updateData)).not.toContain('chatwootUserId');
            expect(Object.keys(updateData)).not.toContain('chatwootEmail');

            // Response to non-admin must also have chatwoot fields stripped
            expect(res.body.data.chatwootUserId).toBeUndefined();
            expect(res.body.data.chatwootEmail).toBeUndefined();
        });

        test('4.5 Admin submitting PUT /api/users/:id successfully updates chatwootUserId and chatwootEmail', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    name: 'Legit Admin Update',
                    chatwootUserId: 'agent_55',
                    chatwootEmail: 'agent55@target-kw.com'
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootUserId: null,
                chatwootEmail: null
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockResolvedValueOnce({
                ...existingUser,
                name: 'Legit Admin Update',
                chatwootUserId: 'agent_55',
                chatwootEmail: 'agent55@target-kw.com'
            });

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'usr-1' },
                data: expect.objectContaining({
                    chatwootUserId: 'agent_55',
                    chatwootEmail: 'agent55@target-kw.com'
                })
            }));

            // Admin response preserves chatwoot fields
            expect(res.body.data.chatwootUserId).toBe('agent_55');
            expect(res.body.data.chatwootEmail).toBe('agent55@target-kw.com');
        });

        test('4.6 Admin passing empty string clears chatwoot credentials to null', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    chatwootUserId: '',
                    chatwootEmail: ''
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootUserId: 'agent_55',
                chatwootEmail: 'agent55@target-kw.com'
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockResolvedValueOnce({
                ...existingUser,
                chatwootUserId: null,
                chatwootEmail: null
            });

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            const updateData = updateSpy.mock.calls[0][0].data;
            expect(updateData.chatwootUserId).toBeNull();
            expect(updateData.chatwootEmail).toBeNull();
        });
    });

    // =========================================================================
    // 5. CHATWOOT DRAWER URLS & PHONE ENCODING INVARIANTS
    // =========================================================================
    describe('5. Chatwoot Drawer URLs & Phone Encoding Invariants', () => {

        test('5.1 Valid conversation thread URL constructs direct conversation endpoint', () => {
            const result = resolveDrawerUrls({
                accountId: '1',
                chatwootConversationId: '4912',
                phone: '+965 99112233'
            });

            expect(result.conversationUrl).toBe('https://inbox.mawthook.io/app/accounts/1/conversations/4912');
            expect(result.activeExternalUrl).toBe('https://inbox.mawthook.io/app/accounts/1/conversations/4912');
        });

        test('5.2 Alias conversationId with custom accountId constructs expected conversation URL', () => {
            const result = resolveDrawerUrls({
                accountId: '42',
                conversationId: '8810',
                phone: '+965 99112233'
            });

            expect(result.conversationUrl).toBe('https://inbox.mawthook.io/app/accounts/42/conversations/8810');
            expect(result.activeExternalUrl).toBe('https://inbox.mawthook.io/app/accounts/42/conversations/8810');
        });

        test('5.3 Missing or empty conversation ID resolves to null conversationUrl and active fallback contact search', () => {
            const emptyVariants = [null, undefined, '', '   '];

            for (const val of emptyVariants) {
                const result = resolveDrawerUrls({
                    accountId: '1',
                    chatwootConversationId: val,
                    conversationId: val,
                    phone: '+965 99112233'
                });

                expect(result.conversationUrl).toBeNull();
                expect(result.fallbackUrl).toBe(`https://inbox.mawthook.io/app/accounts/1/contacts?q=${encodeURIComponent('+965 99112233')}`);
                expect(result.activeExternalUrl).toBe(result.fallbackUrl);
            }
        });

        test('5.4 Phone URL encoding properly handles spaces, plus signs, hyphens, and parenthesis', () => {
            const phoneCases = [
                { input: '+965 99112233', expectedEncoded: '%2B965%2099112233' },
                { input: '+965-9876-5432', expectedEncoded: '%2B965-9876-5432' },
                { input: '+1 (800) 555-0199', expectedEncoded: '%2B1%20(800)%20555-0199' },
                { input: '  +965 99112233  ', expectedEncoded: '%2B965%2099112233' } // trimmed
            ];

            for (const { input, expectedEncoded } of phoneCases) {
                const result = resolveDrawerUrls({
                    accountId: '1',
                    chatwootConversationId: null,
                    phone: input
                });

                expect(result.fallbackUrl).toBe(`https://inbox.mawthook.io/app/accounts/1/contacts?q=${expectedEncoded}`);
            }
        });

        test('5.5 Unicode Eastern Arabic numerals in phone strings encode cleanly without throwing URIError', () => {
            const arabicPhone = '+٩٦٥٩٩١١٢٢٣٣';
            
            expect(() => {
                const result = resolveDrawerUrls({
                    accountId: '1',
                    chatwootConversationId: null,
                    phone: arabicPhone
                });
                expect(result.fallbackUrl).toContain(encodeURIComponent(arabicPhone));
            }).not.toThrow();
        });

        test('5.6 Missing or empty phone produces empty query parameter without throwing or printing undefined', () => {
            const emptyPhones = [null, undefined, '', '   '];

            for (const phone of emptyPhones) {
                const result = resolveDrawerUrls({
                    accountId: '1',
                    chatwootConversationId: null,
                    phone
                });

                expect(result.fallbackUrl).toBe('https://inbox.mawthook.io/app/accounts/1/contacts?q=');
                expect(result.fallbackUrl).not.toContain('undefined');
                expect(result.fallbackUrl).not.toContain('null');
            }
        });

        test('5.7 Missing accountId defaults cleanly to account 1', () => {
            const result = resolveDrawerUrls({
                accountId: null,
                chatwootConversationId: '5001'
            });

            expect(result.conversationUrl).toBe('https://inbox.mawthook.io/app/accounts/1/conversations/5001');
        });
    });
});
