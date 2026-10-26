jest.mock('../src/config/database', () => ({
    prisma: {
        shipmentNotificationLog: {
            updateMany: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn()
        },
        shipment: { findFirst: jest.fn() }
    }
}));
jest.mock('../src/services/whatsAppConfig.service', () => ({ isQuietHours: jest.fn() }));
jest.mock('../src/services/chatwootNotificationService', () => ({
    getNotificationTargets: jest.fn(),
    sendShipmentNotification: jest.fn()
}));
jest.mock('../src/services/whatsappIntegration.service', () => ({ sendNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { prisma } = require('../src/config/database');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const chatwootNotificationService = require('../src/services/chatwootNotificationService');
const whatsappIntegration = require('../src/services/whatsappIntegration.service');
const drainer = require('../src/services/whatsappQueueDrainer.service');

describe('WhatsApp queued shipment dispatch', () => {
    const shipment = { id: 'shipment-1', trackingNumber: 'TRK-1' };

    beforeEach(() => {
        jest.clearAllMocks();
        drainer.isDraining = false;
        whatsAppConfigService.isQuietHours.mockResolvedValue(false);
        prisma.shipment.findFirst.mockResolvedValue(shipment);
        prisma.shipmentNotificationLog.updateMany.mockResolvedValue({ count: 0 });
        prisma.shipmentNotificationLog.update.mockResolvedValue({});
        chatwootNotificationService.getNotificationTargets.mockReturnValue([{ role: 'sender', phone: '+96590000000' }]);
        chatwootNotificationService.sendShipmentNotification.mockResolvedValue({ results: [{ status: 'submitted' }] });
    });

    test('replaces a queued legacy lifecycle template with the approved Chatwoot confirmation', async () => {
        prisma.shipmentNotificationLog.findMany.mockResolvedValue([{
            id: 'log-1', shipmentId: shipment.id, eventType: 'delivered',
            recipientRole: 'sender', templateName: 'new_shipment_created'
        }]);

        await drainer.drainQueue();

        expect(chatwootNotificationService.sendShipmentNotification).toHaveBeenCalledWith('delivered', shipment, {
            recipientRole: 'sender', templateName: 'shipment_confirmation_2',
            disableProviderFallback: true, force: true
        });
        expect(whatsappIntegration.sendNotification).not.toHaveBeenCalled();
    });

    test('terminates a queued lifecycle row when the shipper has no phone', async () => {
        prisma.shipmentNotificationLog.findMany.mockResolvedValue([{
            id: 'log-2', shipmentId: shipment.id, eventType: 'delivered', recipientRole: 'sender'
        }]);
        chatwootNotificationService.getNotificationTargets.mockReturnValue([]);

        await drainer.drainQueue();

        expect(prisma.shipmentNotificationLog.update).toHaveBeenCalledWith({
            where: { id: 'log-2' },
            data: { status: 'SKIPPED', errorMessage: 'SENDER_PHONE_NOT_FOUND' }
        });
        expect(chatwootNotificationService.sendShipmentNotification).not.toHaveBeenCalled();
        expect(whatsappIntegration.sendNotification).not.toHaveBeenCalled();
    });
});
