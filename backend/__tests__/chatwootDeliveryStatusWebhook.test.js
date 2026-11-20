const crypto = require('crypto');
const { createMockRes } = require('../testUtils');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipmentNotificationLog: {
            findMany: jest.fn(),
            update: jest.fn()
        }
    }
}));
jest.mock('../src/services/chatwootNotificationService', () => ({}));
jest.mock('../src/controllers/shipment.helpers', () => ({}));
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const { prisma } = require('../src/config/database');
const config = require('../src/config/config');
const integrationController = require('../src/controllers/integration.controller');

describe('Chatwoot delivery status webhook', () => {
    const secret = 'test-chatwoot-webhook-secret';

    beforeEach(() => {
        jest.clearAllMocks();
        config.chatwoot = { webhookSecret: secret, accountId: 'account-1' };
    });

    const dispatch = async (body) => {
        const rawBody = JSON.stringify(body);
        const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const req = {
            headers: { 'x-chatwoot-signature': signature },
            rawBody,
            body
        };
        const res = createMockRes();
        await integrationController.handleChatwootWebhook(req, res);
        return res;
    };

    it('records delivered/read statuses and their provider timestamps', async () => {
        prisma.shipmentNotificationLog.findMany
            .mockResolvedValueOnce([{ id: 'log-1', status: 'SUBMITTED', responseJson: { messageId: 'cw-1' } }])
            .mockResolvedValueOnce([{ id: 'log-1', status: 'DELIVERED', responseJson: { messageId: 'cw-1', deliveredAt: 'existing-delivery-time' } }]);
        prisma.shipmentNotificationLog.update.mockResolvedValue({});

        const deliveredAt = '2026-11-20T10:00:00.000Z';
        const deliveredResponse = await dispatch({
            event: 'message_updated', id: 'cw-1', status: 'delivered', updated_at: deliveredAt,
            account: { id: 'account-1' }
        });
        expect(deliveredResponse.status).toHaveBeenCalledWith(200);
        expect(prisma.shipmentNotificationLog.update).toHaveBeenNthCalledWith(1, {
            where: { id: 'log-1' },
            data: {
                status: 'DELIVERED',
                responseJson: { messageId: 'cw-1', chatwootStatusUpdatedAt: deliveredAt, deliveredAt }
            }
        });

        const readAt = '2026-11-20T10:05:00.000Z';
        const readResponse = await dispatch({
            event: 'message_updated', id: 'cw-1', content_attributes: { status: 'READ' }, updated_at: readAt,
            account: { id: 'account-1' }
        });
        expect(readResponse.status).toHaveBeenCalledWith(200);
        expect(prisma.shipmentNotificationLog.update).toHaveBeenNthCalledWith(2, {
            where: { id: 'log-1' },
            data: {
                status: 'READ',
                responseJson: {
                    messageId: 'cw-1',
                    deliveredAt: 'existing-delivery-time',
                    chatwootStatusUpdatedAt: readAt,
                    readAt
                }
            }
        });
    });

    it('does not let a delayed sent callback downgrade a delivered message', async () => {
        prisma.shipmentNotificationLog.findMany.mockResolvedValue([
            { id: 'log-2', status: 'DELIVERED', responseJson: { deliveredAt: 'confirmed' } }
        ]);

        const response = await dispatch({
            event: 'message_updated', id: 'cw-2', status: 'sent', account: { id: 'account-1' }
        });

        expect(response.status).toHaveBeenCalledWith(200);
        expect(prisma.shipmentNotificationLog.update).not.toHaveBeenCalled();
    });

    it('returns an error so Chatwoot can retry if status persistence fails', async () => {
        prisma.shipmentNotificationLog.findMany.mockRejectedValue(new Error('database unavailable'));

        const response = await dispatch({
            event: 'message_updated', id: 'cw-3', status: 'read', account: { id: 'account-1' }
        });

        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith({ ok: false, error: 'Failed to update message status' });
    });
});
