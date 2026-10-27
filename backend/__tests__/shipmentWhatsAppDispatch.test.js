const { prisma } = require('../src/config/database');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const whatsappService = require('../src/services/whatsappIntegration.service');
const chatwootService = require('../src/services/chatwootNotificationService');

describe('shipment WhatsApp send boundary', () => {
    const currentShipment = {
        id: 'shipment-whatsapp-test',
        trackingNumber: 'TRK-WA-TEST',
        status: 'in_transit',
        updatedAt: new Date('2026-10-27T10:00:00.000Z'),
        origin: { name: 'Sender', phone: '+96597959567', phoneCountryCode: '965' },
        destination: { name: 'Receiver', phone: '+97455123456', phoneCountryCode: '974' },
        documents: {}
    };

    let logCreate;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(prisma.shipment, 'findUnique').mockResolvedValue(currentShipment);
        logCreate = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockImplementation(async ({ data }) => ({ id: 'skip-log', ...data }));
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({ enabled: true, provider: 'CHATWOOT' });
    });

    afterEach(() => jest.restoreAllMocks());

    test('suppresses lifecycle dispatch unless explicitly initiated', async () => {
        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'sender',
            recipientPhone: currentShipment.origin.phone,
            eventType: 'shipment_created',
            templateName: 'shipment_confirmation_2'
        });

        expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'MANUAL_DISPATCH_REQUIRED' }));
        expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'SKIPPED', errorMessage: 'MANUAL_DISPATCH_REQUIRED' })
        }));
    });

    test('blocks a manual action after delivery and records the policy reason', async () => {
        prisma.shipment.findUnique.mockResolvedValueOnce({ ...currentShipment, status: 'delivered' });

        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'receiver',
            recipientPhone: currentShipment.destination.phone,
            eventType: 'location_request',
            templateName: 'location_request_v1',
            manualDispatch: true
        });

        expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'SHIPMENT_TERMINAL' }));
        expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'SKIPPED', errorMessage: 'SHIPMENT_TERMINAL:delivered' })
        }));
    });

    test('rejects a recipient phone that differs from the latest shipment record', async () => {
        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'receiver',
            recipientPhone: '+97455120000',
            eventType: 'location_request',
            templateName: 'location_request_v1',
            manualDispatch: true
        });

        expect(result).toEqual(expect.objectContaining({ status: 'SKIPPED', reason: 'RECIPIENT_OVERRIDE_NOT_ALLOWED' }));
        expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'SKIPPED', errorMessage: 'RECIPIENT_OVERRIDE_NOT_ALLOWED' })
        }));
    });

    test('manual shipment actions are not suppressed by disabled automatic event rules', async () => {
        whatsAppConfigService.getConfig.mockResolvedValue({ enabled: true, provider: 'CHATWOOT' });
        jest.spyOn(whatsAppConfigService, 'isEventEnabled').mockResolvedValue(false);
        jest.spyOn(whatsAppConfigService, '_computeQuietHours').mockReturnValue(false);
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        jest.spyOn(prisma.shipmentNotificationLog, 'update').mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
        jest.spyOn(chatwootService, 'dispatchSingleNotification').mockResolvedValue({ status: 'submitted', messageId: 'cw-manual-1' });

        const result = await whatsappService.sendNotification({
            shipment: currentShipment,
            recipientRole: 'receiver',
            recipientPhone: currentShipment.destination.phone,
            eventType: 'location_request',
            templateName: 'location_request_v1',
            manualDispatch: true
        });

        expect(result).toEqual(expect.objectContaining({ status: 'submitted', provider: 'chatwoot', externalMessageId: 'cw-manual-1' }));
        expect(whatsAppConfigService.isEventEnabled).not.toHaveBeenCalled();
        expect(chatwootService.dispatchSingleNotification).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'location_request',
            templateName: 'location_request_v1',
            recipientRole: 'receiver',
            sourceRecipientPhone: currentShipment.destination.phone
        }));
    });
});
