jest.mock('../src/config/database', () => ({
    prisma: {
        shipmentNotificationLog: {
            updateMany: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
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
        prisma.shipmentNotificationLog.findMany.mockResolvedValue([]);
        prisma.shipmentNotificationLog.update.mockResolvedValue({});
        prisma.shipmentNotificationLog.findFirst.mockResolvedValue(null);
        chatwootNotificationService.getNotificationTargets.mockReturnValue([{ role: 'sender', phone: '+96590000000' }]);
        chatwootNotificationService.sendShipmentNotification.mockResolvedValue({ results: [{ status: 'submitted' }] });
    });

    test('closes a queued lifecycle notification without sending it', async () => {
        await drainer.drainQueue();

        expect(prisma.shipmentNotificationLog.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
            where: expect.objectContaining({ eventType: { in: expect.arrayContaining(['delivered']) } }),
            data: { status: 'SKIPPED', errorMessage: 'AUTOMATIC_SHIPMENT_MESSAGES_DISABLED' }
        }));
        expect(chatwootNotificationService.sendShipmentNotification).not.toHaveBeenCalled();
        expect(whatsappIntegration.sendNotification).not.toHaveBeenCalled();
    });

    test('does not attempt queued lifecycle delivery when the shipper has no phone', async () => {
        await drainer.drainQueue();

        expect(chatwootNotificationService.getNotificationTargets).not.toHaveBeenCalled();
        expect(chatwootNotificationService.sendShipmentNotification).not.toHaveBeenCalled();
        expect(whatsappIntegration.sendNotification).not.toHaveBeenCalled();
    });

    test('does not inspect duplicate rows for a disabled lifecycle retry', async () => {
        await drainer.drainQueue();

        expect(prisma.shipmentNotificationLog.findFirst).not.toHaveBeenCalled();
        expect(chatwootNotificationService.sendShipmentNotification).not.toHaveBeenCalled();
    });
});
