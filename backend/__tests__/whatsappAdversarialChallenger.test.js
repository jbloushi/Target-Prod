/**
 * Target Logistics 3PL Platform - WhatsApp & Chatwoot Adversarial Challenger Suite
 * File: backend/__tests__/whatsappAdversarialChallenger.test.js
 *
 * EMPIRICAL ADVERSARIAL CHALLENGES:
 * 1. Quiet-Hours Midnight Boundary Engine:
 *    - Evaluation across midnight (23:30, 02:00, 07:59 in Kuwait vs 08:01, 14:00, 21:59)
 *    - Exact boundary points: 22:00:00 (inside), 21:59:59 (outside), 07:59:59 (inside), 08:00:00 (outside)
 *    - Same-day non-midnight windows (13:00 to 17:00), zero-window, and non-default timezones
 * 2. Quiet-Hours Delivery Suppression vs Bypass Rules:
 *    - Customs holds (allowQuietHoursBypass: true) bypass suppression during quiet hours
 *    - Out-for-delivery & delivered: suppressed when allowDeliveryQuietHours: false; allowed when true
 *    - Non-delivery milestones (payment_link_ready): suppressed even if allowDeliveryQuietHours: true
 *    - Manual payment link dispatch with force: true overrides quiet hours
 * 3. Age Guard (36-Hour Ceiling) & Microservice Deduplication:
 *    - Fresh shipments (2h, 35.5h) permitted; historical (>36h, 48h, 72h) suppressed
 *    - Phenix DD/MM/YYYY date strings parsed and guarded
 *    - Microservice checkMicroserviceSent (https://msg.target-kw.com) deduplication and fallback safety
 *    - Local database idempotency deduplication across recipient roles
 * 4. Manual Payment Link Validation & Security:
 *    - Rejection of empty/whitespace URL, CRLF injection (\r, \n, \r\n), non-HTTP schemes (javascript:, data:, file:, ftp:)
 *    - Amount boundary validation (<=0, non-numeric rejected; formatted to 3 decimals)
 *    - Missing shipment 404 and successful dispatch 200
 * 5. Secret Masking & Preservation on Partial Updates:
 *    - Bullet masking of apiKey, phoneId, accessToken, metaAppSecret, chatwootApiToken
 *    - Preservation of existing secrets when masked, empty, or null values are submitted in partial updates
 *    - Proper updating when fresh plaintext secret credentials are provided
 * 6. Empirical Vulnerability Surface:
 *    - Demonstrates that WhatsAppConfig DB model lacking 'enabled' causes silent suppression at line 720
 */

const axios = require('axios');
const whatsappService = require('../src/services/whatsappIntegration.service');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const adminWhatsAppLogs = require('../src/controllers/adminWhatsAppLogs.controller');
const { prisma } = require('../src/config/database');

jest.mock('axios');

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

describe('Empirical Adversarial Challenges: WhatsApp, Quiet Hours, Payment Link & Secrets', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        axios.post.mockReset();
        axios.get.mockReset();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // 1. QUIET-HOURS CALCULATION ACROSS THE MIDNIGHT BOUNDARY
    // =========================================================================
    describe('1. Quiet-Hours Midnight Boundary Engine', () => {
        const standardConfig = {
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00',
            quietHoursTimezone: 'Asia/Kuwait'
        };

        test('1.1 Disabled quiet hours returns false for any timestamp', () => {
            const disabledConfig = { ...standardConfig, quietHoursEnabled: false };
            // 23:30 in Kuwait (20:30 UTC)
            const lateNight = new Date('2026-10-17T20:30:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(disabledConfig, lateNight)).toBe(false);

            // 02:00 in Kuwait (23:00 UTC previous day)
            const deepNight = new Date('2026-10-17T23:00:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(disabledConfig, deepNight)).toBe(false);
        });

        test('1.2 Overnight quiet hours correctly identifies 23:30, 02:00, and 07:59 in Kuwait as QUIET (true)', () => {
            // Kuwait is UTC+3 (no DST)
            // 23:30 Kuwait = 20:30 UTC
            const t2330 = new Date('2026-10-17T20:30:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t2330)).toBe(true);

            // 02:00 Kuwait = 23:00 UTC previous day
            const t0200 = new Date('2026-10-17T23:00:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t0200)).toBe(true);

            // 07:59 Kuwait = 04:59 UTC
            const t0759 = new Date('2026-10-18T04:59:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t0759)).toBe(true);
        });

        test('1.3 Overnight quiet hours correctly identifies 08:01, 14:00, and 21:59 in Kuwait as ACTIVE (false)', () => {
            // 08:01 Kuwait = 05:01 UTC
            const t0801 = new Date('2026-10-18T05:01:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t0801)).toBe(false);

            // 14:00 Kuwait = 11:00 UTC
            const t1400 = new Date('2026-10-18T11:00:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t1400)).toBe(false);

            // 21:59 Kuwait = 18:59 UTC
            const t2159 = new Date('2026-10-18T18:59:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t2159)).toBe(false);
        });

        test('1.4 Exact boundary checks at 22:00:00 (start) and 08:00:00 (end)', () => {
            // 22:00:00 Kuwait = 19:00:00 UTC -> exactly on start boundary, must be QUIET (true)
            const t2200 = new Date('2026-10-18T19:00:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t2200)).toBe(true);

            // 21:59:59 Kuwait = 18:59:59 UTC -> 1 second before start boundary, must be ACTIVE (false)
            const t215959 = new Date('2026-10-18T18:59:59.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t215959)).toBe(false);

            // 07:59:59 Kuwait = 04:59:59 UTC -> 1 second before end boundary, must be QUIET (true)
            const t075959 = new Date('2026-10-18T04:59:59.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t075959)).toBe(true);

            // 08:00:00 Kuwait = 05:00:00 UTC -> exactly on end boundary, quiet hours cease, must be ACTIVE (false)
            const t0800 = new Date('2026-10-18T05:00:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, t0800)).toBe(false);
        });

        test('1.5 Exact midnight transition (00:00:00 in Kuwait) is within quiet hours', () => {
            // 00:00:00 Kuwait = 21:00:00 UTC previous day
            const tMidnight = new Date('2026-10-17T21:00:00.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, tMidnight)).toBe(true);

            // 00:00:30 Kuwait = 21:00:30 UTC
            const tJustAfterMidnight = new Date('2026-10-17T21:00:30.000Z');
            expect(whatsAppConfigService._computeQuietHours(standardConfig, tJustAfterMidnight)).toBe(true);
        });

        test('1.6 Same-day non-midnight window (e.g., 13:00 to 17:00 AST)', () => {
            const daytimeConfig = {
                quietHoursEnabled: true,
                quietHoursStart: '13:00',
                quietHoursEnd: '17:00',
                quietHoursTimezone: 'Asia/Kuwait'
            };

            // 12:59 Kuwait = 09:59 UTC -> false
            expect(whatsAppConfigService._computeQuietHours(daytimeConfig, new Date('2026-10-18T09:59:00.000Z'))).toBe(false);
            // 13:00 Kuwait = 10:00 UTC -> true
            expect(whatsAppConfigService._computeQuietHours(daytimeConfig, new Date('2026-10-18T10:00:00.000Z'))).toBe(true);
            // 15:30 Kuwait = 12:30 UTC -> true
            expect(whatsAppConfigService._computeQuietHours(daytimeConfig, new Date('2026-10-18T12:30:00.000Z'))).toBe(true);
            // 16:59 Kuwait = 13:59 UTC -> true
            expect(whatsAppConfigService._computeQuietHours(daytimeConfig, new Date('2026-10-18T13:59:00.000Z'))).toBe(true);
            // 17:00 Kuwait = 14:00 UTC -> false
            expect(whatsAppConfigService._computeQuietHours(daytimeConfig, new Date('2026-10-18T14:00:00.000Z'))).toBe(false);
            // 23:30 Kuwait = 20:30 UTC -> false
            expect(whatsAppConfigService._computeQuietHours(daytimeConfig, new Date('2026-10-18T20:30:00.000Z'))).toBe(false);
        });

        test('1.7 isQuietHours method without config override pulls from DB and handles midnight', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValueOnce({
                ...standardConfig,
                id: 'cfg-db-1'
            });

            // 03:00 Kuwait = 00:00 UTC
            const result = await whatsAppConfigService.isQuietHours(new Date('2026-10-18T00:00:00.000Z'));
            expect(result).toBe(true);
        });
    });

    // =========================================================================
    // 2. QUIET-HOURS DELIVERY SUPPRESSION VS BYPASS RULES
    // =========================================================================
    describe('2. Quiet-Hours Delivery Suppression vs Bypass Rules', () => {
        const mockShipment = {
            id: 'shp-adv-q1',
            trackingNumber: 'TRG-ADV-QUIET',
            destination: { phone: '+96599112233', contactPerson: 'Hamad' },
            origin: { phone: '+96597959567' },
            createdAt: new Date()
        };

        beforeEach(() => {
            // Force quiet hours to be ACTIVE right now
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(true);
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        });

        test('2.1 Customs hold exception (on_hold_customs_issue) BYPASSES quiet-hours delivery suppression', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-test-1',
                provider: 'SHIPMENT_WHATSAPP',
                quietHoursEnabled: true,
                allowDeliveryQuietHours: false,
                enabled: true
            });
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({
                eventType: 'on_hold_customs_issue',
                recipientRole: 'receiver',
                enabled: true,
                allowQuietHoursBypass: true
            });
            jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);

            const createLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({
                id: 'log-customs-bypass'
            });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({
                id: 'log-customs-bypass',
                status: 'SENT'
            });

            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.CUSTOMS_BYPASS_1"}\n'
            });

            const result = await whatsappService.sendNotification({
                shipment: mockShipment,
                eventType: 'on_hold_customs_issue',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            // Must NOT be QUEUED with QUIET_HOURS_SUPPRESSED; it bypassed quiet hours!
            expect(result.status).toBe('SENT');
            expect(result.reason).not.toBe('QUIET_HOURS_SUPPRESSED');
            expect(createLogSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    eventType: 'on_hold_customs_issue',
                    status: 'QUEUED'
                })
            }));
        });

        test('2.2 out_for_delivery is SUPPRESSED when allowDeliveryQuietHours is false', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-test-2',
                provider: 'SHIPMENT_WHATSAPP',
                quietHoursEnabled: true,
                allowDeliveryQuietHours: false,
                enabled: true
            });
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                enabled: true,
                allowQuietHoursBypass: false
            });

            jest.spyOn(prisma.shipment, 'update').mockResolvedValue({});
            const createLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({
                id: 'log-ofd-suppressed'
            });

            const result = await whatsappService.sendNotification({
                shipment: mockShipment,
                eventType: 'out_for_delivery',
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

        test('2.3 out_for_delivery is PERMITTED when allowDeliveryQuietHours is true', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-test-3',
                provider: 'SHIPMENT_WHATSAPP',
                quietHoursEnabled: true,
                allowDeliveryQuietHours: true,
                enabled: true
            });
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                enabled: true,
                allowQuietHoursBypass: false
            });
            jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);

            jest.spyOn(prisma.shipment, 'update').mockResolvedValue({});
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-ofd-allowed' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-ofd-allowed', status: 'SENT' });

            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.OFD_ALLOWED_1"}\n'
            });

            const result = await whatsappService.sendNotification({
                shipment: mockShipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SENT');
            expect(result.reason).not.toBe('QUIET_HOURS_SUPPRESSED');
        });

        test('2.4 Non-delivery milestone (payment_link_ready) is SUPPRESSED even if allowDeliveryQuietHours is true', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-test-4',
                provider: 'SHIPMENT_WHATSAPP',
                quietHoursEnabled: true,
                allowDeliveryQuietHours: true,
                enabled: true
            });
            jest.spyOn(whatsAppConfigService, 'getRule').mockResolvedValue({
                eventType: 'payment_link_ready',
                recipientRole: 'receiver',
                enabled: true,
                allowQuietHoursBypass: false
            });

            const createLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({
                id: 'log-pl-suppressed'
            });

            const result = await whatsappService.sendNotification({
                shipment: mockShipment,
                eventType: 'payment_link_ready',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('QUEUED');
            expect(result.reason).toBe('QUIET_HOURS_SUPPRESSED');
        });

        test('2.5 Manual payment link dispatch with force: true overrides quiet hours', async () => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-test-5',
                provider: 'SHIPMENT_WHATSAPP',
                quietHoursEnabled: true,
                allowDeliveryQuietHours: false,
                enabled: true
            });
            jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);

            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-pl-force' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-pl-force', status: 'SENT' });

            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.PAYMENT_LINK_FORCE"}\n'
            });

            const result = await whatsappService.sendPaymentLinkNotification({
                shipment: mockShipment,
                recipientPhone: '+96599112233',
                recipientRole: 'receiver',
                paymentLink: 'https://checkout.target-kw.com/pay/inv-99',
                amount: '20.000'
            });

            expect(result.status).toBe('SENT');
            expect(result.reason).not.toBe('QUIET_HOURS_SUPPRESSED');
        });
    });

    // =========================================================================
    // 3. AGE GUARD (36-HOUR CEILING) AND MICROSERVICE DEDUPLICATION
    // =========================================================================
    describe('3. Age Guard (36-Hour Ceiling) & Microservice Deduplication', () => {
        beforeEach(() => {
            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
                id: 'cfg-age-1',
                provider: 'SHIPMENT_WHATSAPP',
                quietHoursEnabled: false,
                enabled: true
            });
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
            jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);
        });

        test('3.1 Age Guard: suppresses outbound notification for shipment created 48 hours ago (>36h)', async () => {
            const historicalShipment = {
                id: 'shp-hist-48',
                trackingNumber: 'TRG-HIST-48',
                createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
                destination: { phone: '+96599112233' },
                origin: { phone: '+96597959567' }
            };

            const result = await whatsappService.sendNotification({
                shipment: historicalShipment,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('HISTORICAL_SHIPMENT');
            expect(result.message).toContain('>36 hours ago');
        });

        test('3.2 Age Guard: permits outbound notification for shipment created 2 hours ago (<=36h)', async () => {
            const freshShipment = {
                id: 'shp-fresh-2',
                trackingNumber: 'TRG-FRESH-2',
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                destination: { phone: '+96599112233' },
                origin: { phone: '+96597959567' }
            };

            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-fresh' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-fresh', status: 'SENT' });

            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.FRESH_SHIPMENT"}\n'
            });

            const result = await whatsappService.sendNotification({
                shipment: freshShipment,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SENT');
        });

        test('3.3 Age Guard: correctly parses Phenix DD/MM/YYYY date format strings', async () => {
            const phenixHistoricalShipment = {
                id: 'shp-phenix-old',
                trackingNumber: 'TRG-PHENIX-OLD',
                documents: {
                    rawDate: '01/01/2026' // Historical date in DD/MM/YYYY format
                },
                createdAt: new Date(),
                destination: { phone: '+96599112233' }
            };

            const result = await whatsappService.sendNotification({
                shipment: phenixHistoricalShipment,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('HISTORICAL_SHIPMENT');
        });

        test('3.4 Age Guard: bypassAgeGuard: true allows dispatch for historical shipment', async () => {
            const historicalShipment = {
                id: 'shp-hist-bypass',
                trackingNumber: 'TRG-HIST-BYPASS',
                createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
                destination: { phone: '+96599112233' }
            };

            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-hist-bypassed' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-hist-bypassed', status: 'SENT' });

            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.HIST_BYPASS"}\n'
            });

            const result = await whatsappService.sendNotification({
                shipment: historicalShipment,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false,
                bypassAgeGuard: true
            });

            expect(result.status).toBe('SENT');
        });

        test('3.5 Microservice Deduplication: suppresses send when msg.target-kw.com reports already sent', async () => {
            const shipmentWithBill = {
                id: 'shp-bill-dedup',
                trackingNumber: 'TRG-BILL-1001',
                documents: { phenixBillId: 'BILL-1001' },
                createdAt: new Date(),
                destination: { phone: '+96599112233' }
            };

            // Local DB has no record
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            const createLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({
                id: 'log-micro-autosend'
            });

            // Microservice check-sent reports ALREADY SENT
            axios.get.mockResolvedValueOnce({
                data: { sent: true, sentAt: '2026-10-17T12:00:00Z', billId: 'BILL-1001' }
            });

            const result = await whatsappService.sendNotification({
                shipment: shipmentWithBill,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.alreadySent).toBe(true);
            expect(result.message).toContain('via auto-send service');
            expect(createLogSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    status: 'SENT',
                    chatwootMessageId: expect.stringContaining('msg-autosend-')
                })
            }));
        });

        test('3.6 Microservice Deduplication: handles microservice network failure gracefully and does not throw', async () => {
            const shipmentWithBill = {
                id: 'shp-bill-failover',
                trackingNumber: 'TRG-BILL-1002',
                documents: { phenixBillId: 'BILL-1002' },
                createdAt: new Date(),
                destination: { phone: '+96599112233' }
            };

            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-failover' });
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-failover', status: 'SENT' });

            // Microservice check-sent fails with timeout/network error
            axios.get.mockRejectedValueOnce(new Error('Network timeout'));

            // Dispatch post succeeds
            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.DISPATCH_AFTER_CHECK_ERR"}\n'
            });

            const result = await whatsappService.sendNotification({
                shipment: shipmentWithBill,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SENT');
        });

        test('3.7 Local DB Deduplication: suppresses duplicate send if status is SENT for same recipient role', async () => {
            const shipment = {
                id: 'shp-local-dup',
                trackingNumber: 'TRG-DUP-1',
                createdAt: new Date(),
                destination: { phone: '+96599112233' }
            };

            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValueOnce({
                id: 'log-existing-sent',
                status: 'SENT',
                sentAt: new Date(Date.now() - 3600 * 1000)
            });

            const result = await whatsappService.sendNotification({
                shipment,
                eventType: 'shipment_created',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.alreadySent).toBe(true);
            expect(result.message).toContain('Notification was already sent');
        });
    });

    // =========================================================================
    // 4. MANUAL PAYMENT LINK VALIDATION (CONTROLLER INTEGRATION)
    // =========================================================================
    describe('4. Manual Payment Link Validation & Injection Defense', () => {
        const mockShipment = {
            id: 'shp-pl-valid',
            trackingNumber: 'TRG-PL-VALID',
            remainingBalance: 18.750,
            currency: 'KWD',
            destination: { phone: '+96599112233', contactPerson: 'Nasser' }
        };

        beforeEach(() => {
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValue(mockShipment);
            jest.spyOn(whatsappService, 'sendPaymentLinkNotification').mockResolvedValue({
                status: 'SENT',
                messageId: 'wamid.PAYMENT_LINK_SUCCESS'
            });
        });

        test('4.1 Rejects empty or whitespace-only payment URLs', async () => {
            const reqEmpty = { params: { trackingNumber: 'TRG-PL-VALID' }, body: { customPaymentUrl: '' } };
            const resEmpty = createMockResponse();
            await adminWhatsAppLogs.sendManualPaymentLinkNotice(reqEmpty, resEmpty);
            expect(resEmpty.statusCode).toBe(400);
            expect(resEmpty.body.error).toContain('Payment URL is required');

            const reqWhitespace = { params: { trackingNumber: 'TRG-PL-VALID' }, body: { customPaymentUrl: '   ' } };
            const resWhitespace = createMockResponse();
            await adminWhatsAppLogs.sendManualPaymentLinkNotice(reqWhitespace, resWhitespace);
            expect(resWhitespace.statusCode).toBe(400);
            expect(resWhitespace.body.error).toContain('Payment URL cannot be empty');
        });

        test('4.2 Rejects CRLF injection attempts (\\r, \\n, \\r\\n)', async () => {
            const payloads = [
                'https://pay.ottu.com/checkout\r\nSet-Cookie:malicious=1',
                'https://pay.ottu.com/checkout\rX-Injected:true',
                'https://pay.ottu.com/checkout\nX-Injected:true'
            ];

            for (const url of payloads) {
                const req = { params: { trackingNumber: 'TRG-PL-VALID' }, body: { customPaymentUrl: url } };
                const res = createMockResponse();
                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);
                expect(res.statusCode).toBe(400);
                expect(res.body.error).toBe('CRLF injection rejected');
            }
        });

        test('4.3 Rejects non-HTTP schemes: javascript:, data:, file:, ftp:, vbscript:', async () => {
            const maliciousUrls = [
                'javascript:alert(document.cookie)',
                'javascript:void(0)',
                'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
                'file:///etc/passwd',
                'ftp://files.target-kw.com/pay',
                'vbscript:msgbox(1)'
            ];

            for (const url of maliciousUrls) {
                const req = { params: { trackingNumber: 'TRG-PL-VALID' }, body: { customPaymentUrl: url } };
                const res = createMockResponse();
                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);
                expect(res.statusCode).toBe(400);
                expect(res.body.error).toContain('Payment URL must use secure HTTP or HTTPS protocol');
            }
        });

        test('4.4 Rejects malformed and protocol-relative URLs', async () => {
            const badUrls = [
                'not-a-url',
                '//target.ottu.com/pay',
                'https://'
            ];

            for (const url of badUrls) {
                const req = { params: { trackingNumber: 'TRG-PL-VALID' }, body: { customPaymentUrl: url } };
                const res = createMockResponse();
                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);
                expect(res.statusCode).toBe(400);
                expect(res.body.success).toBe(false);
            }
        });

        test('4.5 Validates amount defensively: rejects <=0 or non-numeric', async () => {
            const badAmounts = [0, -5, 'not-a-number', -0.001];

            for (const amt of badAmounts) {
                const req = {
                    params: { trackingNumber: 'TRG-PL-VALID' },
                    body: { customPaymentUrl: 'https://pay.ottu.com/pay/123', amount: amt }
                };
                const res = createMockResponse();
                await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);
                expect(res.statusCode).toBe(400);
                expect(res.body.error).toBe('Amount must be greater than zero');
            }
        });

        test('4.6 Returns 404 when shipment does not exist', async () => {
            jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(null);

            const req = {
                params: { trackingNumber: 'NON-EXISTENT-AWB' },
                body: { customPaymentUrl: 'https://pay.ottu.com/pay/123' }
            };
            const res = createMockResponse();
            await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body.error).toBe('Shipment not found');
        });

        test('4.7 Successfully accepts and dispatches valid HTTPS payment URL with formatted amount', async () => {
            const req = {
                params: { trackingNumber: 'TRG-PL-VALID' },
                body: {
                    customPaymentUrl: 'https://pay.ottu.com/checkout/sess_891238912',
                    amount: '25.5',
                    recipientRole: 'receiver'
                }
            };
            const res = createMockResponse();
            await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Payment link notification dispatched');
            expect(whatsappService.sendPaymentLinkNotification).toHaveBeenCalledWith(expect.objectContaining({
                paymentLink: 'https://pay.ottu.com/checkout/sess_891238912',
                amount: '25.500',
                recipientRole: 'receiver'
            }));
        });
    });

    // =========================================================================
    // 5. SECRET MASKING AND PRESERVATION ON PARTIAL CONFIG UPDATES
    // =========================================================================
    describe('5. Secret Masking & Preservation on Partial Config Updates', () => {
        test('5.1 maskSecrets masks sensitive fields according to length rules', () => {
            const rawConfig = {
                provider: 'META',
                apiKey: 'sec_prod_live_9988776655', // >8 chars: first 4, ••••, last 4
                phoneId: '1098234908234',
                accessToken: 'EAAB_LIVE_SECRET_TOKEN',
                metaAppSecret: 'app_secret_123',
                chatwootApiToken: 'cw_token_live_abc',
                quietHoursEnabled: true
            };

            const masked = whatsAppConfigService.maskSecrets(rawConfig);

            expect(masked.apiKey).toBe('sec_••••6655');
            expect(masked.phoneId).toBe('••••••••');
            expect(masked.accessToken).toBe('EAAB••••••••[redacted]');
            expect(masked.metaAppSecret).toBe('••••••••');
            expect(masked.chatwootApiToken).toBe('••••••••');
            // Non-sensitive fields preserved as-is
            expect(masked.provider).toBe('META');
            expect(masked.quietHoursEnabled).toBe(true);
        });

        test('5.2 maskSecrets masks short apiKeys (<=8 chars) completely with bullets', () => {
            const rawConfig = {
                apiKey: 'short12'
            };
            const masked = whatsAppConfigService.maskSecrets(rawConfig);
            expect(masked.apiKey).toBe('••••••••');
        });

        test('5.3 updateConfig preserves existing secrets when incoming payload contains masked bullets', async () => {
            const existingConfig = {
                id: 'cfg-sec-1',
                provider: 'SHIPMENT_WHATSAPP',
                apiKey: 'ORIGINAL_RAW_API_KEY_12345',
                phoneId: 'ORIGINAL_PHONE_ID_67890',
                chatwootApiToken: 'ORIGINAL_CW_TOKEN_99999',
                quietHoursEnabled: false
            };

            jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(existingConfig);
            const updateSpy = jest.spyOn(prisma.whatsAppConfig, 'update').mockImplementationOnce(async ({ data }) => ({
                ...existingConfig,
                ...data
            }));

            // Client sends back masked values with a change to quietHoursEnabled
            const clientPayload = {
                apiKey: 'ORIG••••2345',
                phoneId: '••••••••',
                chatwootApiToken: '••••••••',
                quietHoursEnabled: true,
                quietHoursStart: '23:00'
            };

            const result = await whatsAppConfigService.updateConfig(clientPayload);

            // Verify update was called WITHOUT overwriting secrets with masked bullets
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.not.objectContaining({
                    apiKey: expect.any(String),
                    phoneId: expect.any(String),
                    chatwootApiToken: expect.any(String)
                })
            }));
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    quietHoursEnabled: true,
                    quietHoursStart: '23:00'
                })
            }));
        });

        test('5.4 updateConfig preserves existing secrets when incoming payload sends empty string or null', async () => {
            const existingConfig = {
                id: 'cfg-sec-2',
                provider: 'SHIPMENT_WHATSAPP',
                apiKey: 'KEEP_THIS_KEY',
                phoneId: 'KEEP_THIS_PHONE',
                chatwootApiToken: 'KEEP_THIS_TOKEN'
            };

            jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(existingConfig);
            const updateSpy = jest.spyOn(prisma.whatsAppConfig, 'update').mockImplementationOnce(async ({ data }) => ({
                ...existingConfig,
                ...data
            }));

            const clientPayload = {
                apiKey: '',
                phoneId: null,
                chatwootApiToken: ''
            };

            await whatsAppConfigService.updateConfig(clientPayload);

            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.not.objectContaining({
                    apiKey: '',
                    phoneId: null,
                    chatwootApiToken: ''
                })
            }));
        });

        test('5.5 updateConfig updates secrets when a new unmasked plaintext value is explicitly provided', async () => {
            const existingConfig = {
                id: 'cfg-sec-3',
                provider: 'SHIPMENT_WHATSAPP',
                apiKey: 'OLD_API_KEY',
                phoneId: 'OLD_PHONE_ID',
                chatwootApiToken: 'OLD_TOKEN'
            };

            jest.spyOn(prisma.whatsAppConfig, 'findFirst').mockResolvedValueOnce(existingConfig);
            const updateSpy = jest.spyOn(prisma.whatsAppConfig, 'update').mockImplementationOnce(async ({ data }) => ({
                ...existingConfig,
                ...data
            }));

            const clientPayload = {
                apiKey: 'NEW_PLAINTEXT_SECRET_KEY_2026',
                chatwootApiToken: 'NEW_CHATWOOT_TOKEN_2026'
            };

            await whatsAppConfigService.updateConfig(clientPayload);

            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    apiKey: 'NEW_PLAINTEXT_SECRET_KEY_2026',
                    chatwootApiToken: 'NEW_CHATWOOT_TOKEN_2026'
                })
            }));
        });
    });

    // =========================================================================
    // 6. EMPIRICAL VULNERABILITY SURFACE (DEFECT PROOF)
    // =========================================================================
    describe('6. Empirical Vulnerability Surface & Invariant Verification', () => {
        test('6.1 Invariant Verification: Prisma WhatsAppConfig model lacks enabled column, but settings merging preserves enabled: true so dispatch succeeds (SENT) without false skip', async () => {
            // When WhatsAppConfig record from DB (which conforms to Prisma schema: no 'enabled' column)
            // is returned by whatsAppConfigService.getConfig(), settings.enabled resolves to true via merging.
            const prismaSchemaConformingConfig = {
                id: 'cfg-schema-conforming',
                provider: 'SHIPMENT_WHATSAPP',
                serviceUrl: 'https://msg.target-kw.com',
                apiKey: 'sec_key_123',
                phoneId: '1098234',
                chatwootBaseUrl: 'https://inbox.mawthook.io',
                chatwootAccountId: '1',
                quietHoursEnabled: false,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
                quietHoursTimezone: 'Asia/Kuwait',
                allowDeliveryQuietHours: false
                // NOTE: 'enabled' is NOT part of WhatsAppConfig schema in Prisma!
            };

            jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValueOnce(prismaSchemaConformingConfig);
            jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
            jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(true);
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
            const createLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValueOnce({ id: 'log-bug-proof' });
            const updateLogSpy = jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValueOnce({ id: 'log-bug-proof', status: 'SENT' });

            axios.post.mockResolvedValueOnce({
                data: 'data: {"status":"sent","messageId":"wamid.REMEDIATED_6_1"}\n'
            });

            const freshShipment = {
                id: 'shp-bug-proof',
                trackingNumber: 'TRG-BUG-PROOF',
                createdAt: new Date(),
                destination: { phone: '+96599112233' }
            };

            const result = await whatsappService.sendNotification({
                shipment: freshShipment,
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96599112233',
                force: false
            });

            // Empirically confirms that line 720: if (settings.enabled === false) no longer falsely marks SKIPPED
            expect(result.status).toBe('SENT');
            expect(result.status).not.toBe('SKIPPED');
            expect(updateLogSpy).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    status: 'SENT'
                })
            }));
        });
    });
});
