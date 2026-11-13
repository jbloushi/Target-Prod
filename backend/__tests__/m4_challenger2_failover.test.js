/**
 * Shipment WhatsApp policy regression coverage.
 *
 * Shipment dispatch no longer falls back to the standalone sender. Automatic
 * lifecycle events are suppressed; only an explicitly authorized action using
 * its approved event/template/recipient contract may reach Chatwoot.
 */

process.env.DATABASE_URL ||= 'mysql://test:test@127.0.0.1:3306/test';
process.env.CHATWOOT_ENABLED = 'true';
process.env.CHATWOOT_API_ACCESS_TOKEN = 'test-chatwoot-token';
process.env.CHATWOOT_BASE_URL = 'https://chatwoot.example.test';

const axios = require('axios');
const { prisma } = require('../src/config/database');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const whatsAppService = require('../src/services/whatsappIntegration.service');
const chatwootService = require('../src/services/chatwootNotificationService');

jest.mock('axios');

describe('shipment WhatsApp policy prevents lifecycle failover', () => {
    const shipment = {
        id: 'shipment-policy-test',
        trackingNumber: 'TRK-POLICY-TEST',
        status: 'in_transit',
        origin: { name: 'Shipper', phone: '+96597959567', phoneCountryCode: '965' },
        destination: { name: 'Receiver', phone: '+97455123456', phoneCountryCode: '974' },
        documents: {}
    };

    let createLog;
    let dispatchChatwoot;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        chatwootService.resetClient();
        jest.spyOn(prisma.shipment, 'findUnique').mockResolvedValue(shipment);
        createLog = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockImplementation(async ({ data }) => ({ id: 'policy-log', ...data }));
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({
            enabled: true,
            provider: 'SHIPMENT_WHATSAPP',
            fallbackProvider: 'SHIPMENT_WHATSAPP'
        });
        jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
        dispatchChatwoot = jest.spyOn(chatwootService, 'dispatchSingleNotification');
    });

    afterEach(() => jest.restoreAllMocks());

    test.each(['shipment_created', 'out_for_delivery', 'delivered', 'on_hold_customs_issue'])(
        'blocks automatic %s sends even when the caller sets force',
        async eventType => {
            const result = await whatsAppService.sendNotification({
                shipment,
                eventType,
                recipientRole: 'receiver',
                recipientPhone: shipment.destination.phone,
                templateName: 'shipment_confirmation_2',
                force: true,
                provider: 'SHIPMENT_WHATSAPP'
            });

            expect(result).toEqual(expect.objectContaining({
                status: 'SKIPPED',
                reason: 'MANUAL_DISPATCH_REQUIRED'
            }));
            expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    status: 'SKIPPED',
                    errorMessage: 'MANUAL_DISPATCH_REQUIRED'
                })
            }));
            expect(dispatchChatwoot).not.toHaveBeenCalled();
            expect(axios.post).not.toHaveBeenCalled();
        }
    );

    test('force cannot send an approved manual action after shipment delivery', async () => {
        prisma.shipment.findUnique.mockResolvedValueOnce({ ...shipment, status: 'delivered' });

        const result = await whatsAppService.sendNotification({
            shipment,
            eventType: 'payment_link_ready',
            templateName: 'payment_request_v1',
            recipientRole: 'receiver',
            recipientPhone: shipment.destination.phone,
            manualDispatch: true,
            force: true,
            provider: 'SHIPMENT_WHATSAPP'
        });

        expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'SHIPMENT_TERMINAL' }));
        expect(dispatchChatwoot).not.toHaveBeenCalled();
        expect(axios.post).not.toHaveBeenCalled();
    });

    test('rejects an event/template/recipient mismatch before either provider is contacted', async () => {
        const result = await whatsAppService.sendNotification({
            shipment,
            eventType: 'location_request',
            templateName: 'payment_request_v1',
            recipientRole: 'receiver',
            recipientPhone: shipment.destination.phone,
            manualDispatch: true,
            provider: 'SHIPMENT_WHATSAPP'
        });

        expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'UNAPPROVED_MANUAL_ACTION' }));
        expect(dispatchChatwoot).not.toHaveBeenCalled();
        expect(axios.post).not.toHaveBeenCalled();
    });
});
