const axios = require('axios');
const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const chatwootService = require('../src/services/chatwootNotificationService');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');

jest.mock('axios');

describe('Shipment WhatsApp dispatch policy', () => {
    let currentShipment;
    let chatwootRequest;

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();
        currentShipment = {
            id: 'shipment-policy-1',
            trackingNumber: 'TRK-POLICY-1',
            status: 'in_transit',
            origin: { contactPerson: 'Shipper', phone: '+96597959567' },
            destination: { contactPerson: 'Receiver', phone: '+96599112233' },
            documents: {}
        };
        chatwootRequest = jest.fn().mockResolvedValue({ data: {} });
        axios.create.mockReturnValue({ defaults: { baseURL: 'https://inbox.mawthook.io' }, request: chatwootRequest });
        jest.spyOn(prisma.shipment, 'findUnique').mockImplementation(async () => currentShipment);
        jest.spyOn(prisma.shipmentNotificationLog, 'create').mockResolvedValue({ id: 'policy-log' });
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        jest.spyOn(prisma.shipmentNotificationLog, 'update').mockResolvedValue({ id: 'policy-log' });
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({ enabled: true, provider: 'CHATWOOT' });
        jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
    });

    afterEach(() => jest.restoreAllMocks());

    test.each(['out_for_delivery', 'delivered', 'on_hold_customs_issue', 'received_at_hub'])(
        'automatic %s shipment updates are skipped even when force is requested',
        async eventType => {
            const result = await whatsappService.sendNotification({
                shipment: currentShipment,
                recipientRole: 'receiver',
                recipientPhone: currentShipment.destination.phone,
                eventType,
                templateName: 'shipment_confirmation_2',
                force: true
            });

            expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'MANUAL_DISPATCH_REQUIRED' }));
            expect(axios.post).not.toHaveBeenCalled();
            expect(chatwootRequest).not.toHaveBeenCalled();
        }
    );

    test('manual dispatch requires the approved event, template, and recipient combination', async () => {
        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'receiver',
            recipientPhone: currentShipment.destination.phone,
            eventType: 'payment_link_ready',
            templateName: 'location_request_v1',
            manualDispatch: true,
            force: true
        });

        expect(result.status).toBe('SKIPPED');
        expect(result.reason).toBe('UNAPPROVED_MANUAL_ACTION');
        expect(chatwootRequest).not.toHaveBeenCalled();
    });

    test('terminal shipment state blocks an otherwise approved manual action, including force', async () => {
        currentShipment = { ...currentShipment, status: 'delivered' };

        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'receiver',
            recipientPhone: currentShipment.destination.phone,
            eventType: 'payment_link_ready',
            templateName: 'payment_request_v1',
            manualDispatch: true,
            force: true
        });

        expect(result.status).toBe('SKIPPED');
        expect(result.reason).toBe('SHIPMENT_TERMINAL');
        expect(chatwootRequest).not.toHaveBeenCalled();
    });

    test('manual dispatch cannot override the current shipment recipient phone', async () => {
        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'receiver',
            recipientPhone: '+96595555555',
            eventType: 'payment_link_ready',
            templateName: 'payment_request_v1',
            manualDispatch: true,
            force: true
        });

        expect(result.status).toBe('SKIPPED');
        expect(result.reason).toBe('RECIPIENT_OVERRIDE_NOT_ALLOWED');
        expect(chatwootRequest).not.toHaveBeenCalled();
    });
});
