jest.mock('../src/config/database', () => ({ prisma: {
    shipment: { findFirst: jest.fn() },
    shipmentNotificationLog: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() }
} }));
jest.mock('../src/services/whatsappIntegration.service', () => ({ sendNotification: jest.fn() }));
jest.mock('../src/services/chatwootNotificationService', () => ({
    isShipmentConfirmationEvent: jest.fn(), sendShipmentNotification: jest.fn(), getNotificationTargets: jest.fn()
}));
jest.mock('../src/services/whatsAppConfig.service', () => ({}));
jest.mock('../src/middleware/authorize.middleware', () => ({ canAccessShipment: jest.fn() }));
jest.mock('../src/middleware/rbac.policy', () => ({ hasCapability: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const chatwootNotificationService = require('../src/services/chatwootNotificationService');
const { canAccessShipment } = require('../src/middleware/authorize.middleware');
const { hasCapability } = require('../src/middleware/rbac.policy');
const { sendShipmentWhatsApp, resendNotification, dispatchQueuedNotifications } = require('../src/controllers/adminWhatsAppLogs.controller');

function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe('manual shipment WhatsApp access', () => {
    const shipment = {
        id: 'shipment-1', trackingNumber: 'TRK-1',
        origin: { phone: '+96590000001', contactPerson: 'Shipper' },
        destination: { phone: '+96590000002', contactPerson: 'Receiver' }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.shipment.findFirst.mockResolvedValue(shipment);
        whatsappService.sendNotification.mockResolvedValue({ status: 'submitted' });
        canAccessShipment.mockReturnValue(true);
        hasCapability.mockReturnValue(false);
        prisma.shipmentNotificationLog.findFirst.mockResolvedValue(null);
        prisma.shipmentNotificationLog.create.mockResolvedValue({ id: 'policy-log' });
        chatwootNotificationService.isShipmentConfirmationEvent.mockReturnValue(false);
        chatwootNotificationService.sendShipmentNotification.mockResolvedValue({ results: [{ status: 'submitted' }] });
    });

    test('denies access to another user\'s shipment', async () => {
        canAccessShipment.mockReturnValue(false);
        const res = response();
        await sendShipmentWhatsApp({ params: { trackingNumber: 'TRK-1' }, body: {}, user: { role: 'client' } }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    });

    test('rejects caller supplied phone overrides', async () => {
        const res = response();
        await sendShipmentWhatsApp({ params: { trackingNumber: 'TRK-1' }, body: { recipientPhone: '+96591111111' }, user: { role: 'client' } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNTRUSTED_DISPATCH_OVERRIDE' }));
        expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    });

    test('uses the approved Chatwoot template for an ordinary sender lifecycle send', async () => {
        chatwootNotificationService.isShipmentConfirmationEvent.mockReturnValue(true);
        const res = response();
        await sendShipmentWhatsApp({ params: { trackingNumber: 'TRK-1' }, body: { recipientRole: 'sender' }, user: { role: 'client' } }, res);
        expect(chatwootNotificationService.sendShipmentNotification).toHaveBeenCalledWith('shipment_created', shipment, {
            recipientRole: 'sender', templateName: 'shipment_confirmation_2',
            disableProviderFallback: true, manualDispatch: true
        });
        expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    });

    test('does not substitute the receiver phone when the shipper phone is missing', async () => {
        prisma.shipment.findFirst.mockResolvedValue({
            ...shipment, origin: {}, shipperPhone: null, customerPhone: null
        });
        const res = response();
        await sendShipmentWhatsApp({ params: { trackingNumber: 'TRK-1' }, body: { recipientRole: 'sender' }, user: { role: 'client' } }, res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    });
});

describe('admin queued WhatsApp dispatch', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prisma.shipmentNotificationLog.findFirst.mockResolvedValue(null);
        prisma.shipmentNotificationLog.create.mockResolvedValue({ id: 'policy-log' });
        prisma.shipmentNotificationLog.update.mockResolvedValue({});
        chatwootNotificationService.getNotificationTargets.mockReturnValue([{
            role: 'sender', name: 'Shipper', phone: '+96590000001'
        }]);
        chatwootNotificationService.sendShipmentNotification.mockResolvedValue({ results: [{ status: 'submitted' }] });
    });

    test('closes a queued lifecycle log instead of replaying it', async () => {
        prisma.shipmentNotificationLog.findMany.mockResolvedValue([{
            id: 'log-4', trackingNumber: 'TRK-1', eventType: 'delivered',
            recipientRole: 'sender', recipientPhone: '***0001', templateName: 'new_shipment_created',
            shipment: { id: 'shipment-1', trackingNumber: 'TRK-1', origin: { phone: '+96590000001' } }
        }]);
        chatwootNotificationService.isShipmentConfirmationEvent.mockReturnValue(true);
        const res = response();

        await dispatchQueuedNotifications({ body: { limit: 1 } }, res);

        expect(prisma.shipmentNotificationLog.update).toHaveBeenCalledWith({
            where: { id: 'log-4' },
            data: { status: 'SKIPPED', errorMessage: 'AUTOMATIC_SHIPMENT_MESSAGES_DISABLED' }
        });
        expect(chatwootNotificationService.sendShipmentNotification).not.toHaveBeenCalled();
        expect(whatsappService.sendNotification).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ dispatched: 0, skipped: 1 }));
    });
});

describe('admin WhatsApp resend', () => {
    const shipment = {
        id: 'shipment-1', trackingNumber: 'TRK-1',
        origin: { phone: '+96590000001' }, destination: { phone: '+96590000002' }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.shipment.findFirst.mockResolvedValue(shipment);
        prisma.shipmentNotificationLog.findFirst.mockResolvedValue(null);
        prisma.shipmentNotificationLog.create.mockResolvedValue({ id: 'policy-log' });
        chatwootNotificationService.sendShipmentNotification.mockResolvedValue({ results: [{ status: 'submitted' }] });
    });

    test('retries a legacy lifecycle log through the approved Chatwoot template', async () => {
        prisma.shipmentNotificationLog.findUnique.mockResolvedValue({
            id: 'log-1', trackingNumber: 'TRK-1', eventType: 'shipment_created',
            recipientRole: 'sender', recipientPhone: '***0001',
            templateName: 'new_shipment_created', status: 'FAILED'
        });
        chatwootNotificationService.isShipmentConfirmationEvent.mockReturnValue(true);
        const res = response();

        await resendNotification({ params: { id: 'log-1' }, body: {} }, res);

        expect(chatwootNotificationService.sendShipmentNotification).toHaveBeenCalledWith('shipment_created', shipment, {
            recipientRole: 'sender', templateName: 'shipment_confirmation_2',
            disableProviderFallback: true, existingLogId: 'log-1', manualDispatch: true
        });
        expect(whatsappService.sendNotification).not.toHaveBeenCalled();
    });

    test('resolves a non-lifecycle recipient from the shipment, not the masked log value', async () => {
        prisma.shipmentNotificationLog.findUnique.mockResolvedValue({
            id: 'log-2', trackingNumber: 'TRK-1', eventType: 'location_request',
            recipientRole: 'receiver', recipientPhone: '***0002', status: 'FAILED'
        });
        chatwootNotificationService.isShipmentConfirmationEvent.mockReturnValue(false);
        whatsappService.sendNotification.mockResolvedValue({ status: 'submitted' });
        const res = response();

        await resendNotification({ params: { id: 'log-2' }, body: {} }, res);

        expect(whatsappService.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
            recipientRole: 'receiver', recipientPhone: '+96590000002', existingLogId: 'log-2'
        }));
    });

    test('blocks a default resend after provider submission', async () => {
        prisma.shipmentNotificationLog.findUnique.mockResolvedValue({
            id: 'log-3', trackingNumber: 'TRK-1', eventType: 'delivered',
            recipientRole: 'sender', status: 'submitted'
        });
        prisma.shipmentNotificationLog.findFirst.mockResolvedValue({ status: 'submitted' });
        const res = response();

        await resendNotification({ params: { id: 'log-3' }, body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(chatwootNotificationService.sendShipmentNotification).not.toHaveBeenCalled();
    });
});
