jest.mock('../src/config/database', () => ({
    prisma: { shipmentNotificationLog: { count: jest.fn(), findMany: jest.fn() } }
}));
jest.mock('../src/services/whatsappIntegration.service', () => ({}));
jest.mock('../src/services/chatwootNotificationService', () => ({}));
jest.mock('../src/services/whatsAppConfig.service', () => ({}));
jest.mock('../src/middleware/authorize.middleware', () => ({ canAccessShipment: jest.fn() }));
jest.mock('../src/middleware/rbac.policy', () => ({ hasCapability: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const { prisma } = require('../src/config/database');
const { getNotificationLogs } = require('../src/controllers/adminWhatsAppLogs.controller');

describe('WhatsApp log status reporting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prisma.shipmentNotificationLog.findMany.mockResolvedValue([]);
    });

    it('counts uppercase SUBMITTED rows as sent and does not invent delivery receipts', async () => {
        [2, 2, 2, 2, 2, 0, 0, 0, 0].forEach(value => {
            prisma.shipmentNotificationLog.count.mockResolvedValueOnce(value);
        });
        const res = { json: jest.fn() };

        await getNotificationLogs({ query: { status: 'SENT' } }, res);

        const listQuery = prisma.shipmentNotificationLog.findMany.mock.calls[0][0];
        expect(listQuery.where.status.in).toEqual(expect.arrayContaining(['SUBMITTED', 'submitted', 'SUBMIT', 'submit', 'ACCEPTED', 'accepted', 'SENT', 'sent']));
        expect(res.json.mock.calls[0][0].stats).toEqual(expect.objectContaining({
            totalDispatched: 2,
            totalDelivered: 0,
            totalFailed: 0,
            deliveryRate: 0
        }));
    });
});
