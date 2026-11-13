// This test exercises dispatch-claim behavior, not feature-flag behavior.
// Keep the Chatwoot client enabled and configured even in CI environments
// that intentionally omit production integrations.
process.env.CHATWOOT_ENABLED = 'true';
process.env.CHATWOOT_API_ACCESS_TOKEN = 'test-chatwoot-token';
process.env.CHATWOOT_BASE_URL = 'https://chatwoot.example.test';

const { prisma } = require('../src/config/database');
const whatsAppConfigService = require('../src/services/whatsAppConfig.service');
const chatwootService = require('../src/services/chatwootNotificationService');

describe('shipment WhatsApp retry claim', () => {
    const shipment = {
        id: 'shipment-claim-test',
        trackingNumber: 'TRK-CLAIM-TEST',
        status: 'in_transit',
        updatedAt: new Date('2026-10-27T10:00:00.000Z'),
        origin: { name: 'Sender', phone: '+96597959567', phoneCountryCode: '965' },
        destination: {},
        documents: {}
    };

    let skipLogCreate;
    let updateMany;

    beforeEach(() => {
        jest.restoreAllMocks();
        chatwootService.resetClient();
        jest.spyOn(prisma.shipment, 'findUnique').mockResolvedValue(shipment);
        jest.spyOn(whatsAppConfigService, 'getConfig').mockResolvedValue({ enabled: true, provider: 'CHATWOOT' });
        skipLogCreate = jest.spyOn(prisma.shipmentNotificationLog, 'create').mockImplementation(async ({ data }) => ({ id: 'skip-log', ...data }));
        updateMany = jest.spyOn(prisma.shipmentNotificationLog, 'updateMany').mockResolvedValue({ count: 0 });
    });

    afterEach(() => jest.restoreAllMocks());

    test('does not dispatch a queued retry when another worker already claimed it', async () => {
        const queuedLog = {
            id: 'queued-log',
            shipmentId: shipment.id,
            eventType: 'shipment_created',
            recipientRole: 'sender',
            templateName: 'shipment_confirmation_2',
            status: 'QUEUED'
        };
        const processingLog = { ...queuedLog, status: 'PROCESSING' };
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst')
            .mockResolvedValueOnce(queuedLog)
            .mockResolvedValueOnce(processingLog);

        const result = await chatwootService.sendShipmentNotification('shipment_created', shipment, {
            recipientRole: 'sender',
            templateName: 'shipment_confirmation_2',
            manualDispatch: true,
            existingLogId: queuedLog.id
        });

        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: queuedLog.id,
                status: { in: expect.arrayContaining(['QUEUED', 'queued']) }
            })
        }));
        expect(result).toEqual(expect.objectContaining({
            results: [expect.objectContaining({ status: 'skipped', reason: 'dispatch_already_in_flight' })]
        }));
        expect(skipLogCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'SKIPPED', errorMessage: 'DISPATCH_ALREADY_IN_FLIGHT' })
        }));
    });
});
