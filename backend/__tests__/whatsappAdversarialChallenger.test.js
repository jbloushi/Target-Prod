const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const adminWhatsAppLogs = require('../src/controllers/adminWhatsAppLogs.controller');

function createMockResponse() {
    const res = { statusCode: 200 };
    res.status = jest.fn(code => { res.statusCode = code; return res; });
    res.json = jest.fn(data => { res.body = data; return res; });
    return res;
}

describe('WhatsApp dispatch policy and manual payment request validation', () => {
    let shipment;

    beforeEach(() => {
        jest.clearAllMocks();
        shipment = {
            id: 'shipment-policy-test',
            trackingNumber: 'TRK-POLICY-TEST',
            status: 'in_transit',
            remainingBalance: 25.5,
            currency: 'KWD',
            origin: { contactPerson: 'Shipper', phone: '+96597959567' },
            destination: { contactPerson: 'Receiver', phone: '+96599112233' },
            documents: {}
        };
        jest.spyOn(prisma.shipment, 'findUnique').mockImplementation(async () => shipment);
        jest.spyOn(prisma.shipment, 'findFirst').mockImplementation(async () => shipment);
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'shipment-policy-log' });
        jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValue({ id: 'shipment-policy-log' });
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({ enabled: true, provider: 'CHATWOOT' });
        jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
        jest.spyOn(whatsappService, 'sendPaymentLinkNotification').mockResolvedValue({ status: 'queued' });
    });

    afterEach(() => jest.restoreAllMocks());

    test('Kuwait quiet-hours calculation handles the overnight boundary', () => {
        whatsAppConfigService._computeQuietHours.mockRestore();
        const config = {
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00',
            quietHoursTimezone: 'Asia/Kuwait'
        };

        expect(whatsAppConfigService._computeQuietHours(config, new Date('2026-10-17T20:30:00.000Z'))).toBe(true);
        expect(whatsAppConfigService._computeQuietHours(config, new Date('2026-10-18T01:00:00.000Z'))).toBe(true);
        expect(whatsAppConfigService._computeQuietHours(config, new Date('2026-10-18T11:00:00.000Z'))).toBe(false);
    });

    test.each(['out_for_delivery', 'delivered', 'on_hold_customs_issue', 'payment_link_ready'])(
        'automatic %s dispatch is blocked, even with force enabled',
        async eventType => {
            const result = await whatsappService.sendNotification({
                shipment,
                recipientRole: 'receiver',
                recipientPhone: shipment.destination.phone,
                eventType,
                templateName: eventType === 'payment_link_ready' ? 'payment_request_v1' : 'shipment_confirmation_2',
                force: true
            });

            expect(result.status).toBe('SKIPPED');
            expect(result.reason).toBe('MANUAL_DISPATCH_REQUIRED');
        }
    );

    test('approved manual payment action reaches Chatwoot with the current shipment data', async () => {
        const req = {
            params: { trackingNumber: shipment.trackingNumber },
            user: { id: 'admin-1', role: 'admin' },
            body: {
                customPaymentUrl: 'https://pay.target-kw.com/checkout/123',
                amount: '25.5',
                recipientRole: 'receiver'
            }
        };
        const res = createMockResponse();

        await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Payment link notification queued');
        expect(whatsappService.sendPaymentLinkNotification).toHaveBeenCalledWith(expect.objectContaining({
            shipment,
            recipientRole: 'receiver',
            recipientPhone: null,
            paymentLink: 'https://pay.target-kw.com/checkout/123',
            amount: '25.500'
        }));
    });

    test.each([
        ['', 'Payment URL is required'],
        ['https://pay.target-kw.com/a\r\nInjected: true', 'CRLF injection rejected'],
        ['javascript:alert(1)', 'Payment URL must use secure HTTP or HTTPS protocol']
    ])('rejects unsafe payment URL input', async (url, expectedError) => {
        const req = {
            params: { trackingNumber: shipment.trackingNumber },
            user: { id: 'admin-1', role: 'admin' },
            body: { customPaymentUrl: url }
        };
        const res = createMockResponse();

        await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe(expectedError);
        expect(whatsappService.sendPaymentLinkNotification).not.toHaveBeenCalled();
    });

    test('rejects caller-supplied recipient phone overrides', async () => {
        const req = {
            params: { trackingNumber: shipment.trackingNumber },
            user: { id: 'admin-1', role: 'admin' },
            body: {
                customPaymentUrl: 'https://pay.target-kw.com/checkout/123',
                recipientRole: 'receiver',
                recipientPhone: '+96595555555'
            }
        };
        const res = createMockResponse();

        await adminWhatsAppLogs.sendManualPaymentLinkNotice(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('UNTRUSTED_DISPATCH_OVERRIDE');
        expect(whatsappService.sendPaymentLinkNotification).not.toHaveBeenCalled();
    });

    test('missing shipment returns 404 and invalid payment amounts return 400', async () => {
        const missingShipment = jest.spyOn(prisma.shipment, 'findFirst').mockResolvedValueOnce(null);
        const missingResponse = createMockResponse();
        await adminWhatsAppLogs.sendManualPaymentLinkNotice({
            params: { trackingNumber: 'MISSING' },
            user: { id: 'admin-1', role: 'admin' },
            body: { customPaymentUrl: 'https://pay.target-kw.com/checkout/123' }
        }, missingResponse);
        expect(missingResponse.statusCode).toBe(404);

        missingShipment.mockResolvedValue(shipment);
        const amountResponse = createMockResponse();
        await adminWhatsAppLogs.sendManualPaymentLinkNotice({
            params: { trackingNumber: shipment.trackingNumber },
            user: { id: 'admin-1', role: 'admin' },
            body: { customPaymentUrl: 'https://pay.target-kw.com/checkout/123', amount: '-1' }
        }, amountResponse);
        expect(amountResponse.statusCode).toBe(400);
        expect(amountResponse.body.error).toBe('Amount must be greater than zero');
    });

    test('settings responses keep WhatsApp secrets masked', () => {
        const masked = whatsAppConfigService.maskSecrets({
            apiKey: 'sec_prod_live_9988776655',
            phoneId: '1098234908234',
            accessToken: 'EAAB_LIVE_SECRET_TOKEN',
            metaAppSecret: 'private-app-secret',
            chatwootApiToken: 'private-chatwoot-token',
            provider: 'CHATWOOT'
        });

        expect(masked.apiKey).toBe('sec_••••6655');
        expect(masked.phoneId).toBe('••••••••');
        expect(masked.accessToken).toBe('EAAB••••••••[redacted]');
        expect(masked.metaAppSecret).toBe('••••••••');
        expect(masked.chatwootApiToken).toBe('••••••••');
        expect(masked.provider).toBe('CHATWOOT');
    });
});
