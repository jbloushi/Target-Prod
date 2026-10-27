const crypto = require('crypto');

const mockPrisma = {
    shipmentNotificationLog: {
        findFirst: jest.fn(),
        updateMany: jest.fn()
    }
};

jest.mock('../src/config/database', () => ({ prisma: mockPrisma }));
jest.mock('../src/services/systemSettings.service', () => ({ getSystemSettings: jest.fn() }));
jest.mock('../src/services/whatsappIntegration.service', () => ({}));
jest.mock('../src/services/supportEvents', () => ({ broadcastUnreadUpdate: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const { getSystemSettings } = require('../src/services/systemSettings.service');
const logger = require('../src/utils/logger');
const webhook = require('../src/controllers/whatsappWebhook.controller');

function makeResponse() {
    const response = {};
    response.status = jest.fn().mockReturnValue(response);
    response.json = jest.fn().mockReturnValue(response);
    response.send = jest.fn().mockReturnValue(response);
    return response;
}

function makeMetaRequest(body, secret = 'meta-secret') {
    const rawBody = Buffer.from(JSON.stringify(body));
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return {
        body,
        rawBody,
        headers: { 'x-hub-signature-256': `sha256=${digest}` }
    };
}

describe('legacy WhatsApp receipt webhook authentication', () => {
    const originalSharedSecret = process.env.WHATSAPP_WEBHOOK_SHARED_SECRET;
    const originalMetaAppSecret = process.env.WHATSAPP_META_APP_SECRET;
    const originalVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.WHATSAPP_WEBHOOK_SHARED_SECRET;
        delete process.env.WHATSAPP_META_APP_SECRET;
        delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        getSystemSettings.mockReturnValue({
            whatsapp: {
                metaAppSecret: 'meta-secret',
                webhookVerifyToken: 'configured-verify-token'
            }
        });
        mockPrisma.shipmentNotificationLog.findFirst.mockResolvedValue({
            id: 'log-1',
            status: 'submitted',
            responseJson: {},
            trackingNumber: 'TRK-1'
        });
    mockPrisma.shipmentNotificationLog.updateMany.mockResolvedValue({ count: 1 });
    });

    afterAll(() => {
        if (originalSharedSecret === undefined) delete process.env.WHATSAPP_WEBHOOK_SHARED_SECRET;
        else process.env.WHATSAPP_WEBHOOK_SHARED_SECRET = originalSharedSecret;
        if (originalMetaAppSecret === undefined) delete process.env.WHATSAPP_META_APP_SECRET;
        else process.env.WHATSAPP_META_APP_SECRET = originalMetaAppSecret;
        if (originalVerifyToken === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = originalVerifyToken;
    });

    test('rejects a Meta receipt without a valid raw-body signature before log lookup', async () => {
        const body = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }]
        };
        const req = makeMetaRequest(body);
        req.headers['x-hub-signature-256'] = 'sha256=invalid';
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockPrisma.shipmentNotificationLog.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.shipmentNotificationLog.updateMany).not.toHaveBeenCalled();
    });

    test('fails closed when the Meta app secret is not configured', async () => {
        getSystemSettings.mockReturnValue({ whatsapp: {} });
        const body = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }]
        };
        const req = makeMetaRequest(body);
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockPrisma.shipmentNotificationLog.findFirst).not.toHaveBeenCalled();
    });

    test('accepts a valid Meta signature and applies the matching receipt', async () => {
        const body = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }]
        };
        const req = makeMetaRequest(body);
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockPrisma.shipmentNotificationLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [{ chatwootMessageId: 'wamid.1' }, { id: 'wamid.1' }] }
        }));
        expect(mockPrisma.shipmentNotificationLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'log-1', status: { in: expect.arrayContaining(['SUBMITTED', 'submitted', 'SENT', 'sent', 'DELIVERED', 'delivered']) } },
            data: expect.objectContaining({ status: 'DELIVERED' })
        }));
    });

    test('rejects legacy service receipts when their shared secret is missing or invalid', async () => {
        const req = { body: { messageId: 'wamid.2', status: 'read' }, headers: {} };
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockPrisma.shipmentNotificationLog.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.shipmentNotificationLog.updateMany).not.toHaveBeenCalled();
    });

    test('rejects a legacy service receipt with the wrong shared secret', async () => {
        process.env.WHATSAPP_WEBHOOK_SHARED_SECRET = 'service-secret';
        const req = {
            body: { messageId: 'wamid.2', status: 'read' },
            headers: { 'x-whatsapp-webhook-secret': 'wrong-secret' }
        };
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockPrisma.shipmentNotificationLog.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.shipmentNotificationLog.updateMany).not.toHaveBeenCalled();
    });

    test('accepts a legacy service receipt with the configured shared secret', async () => {
        process.env.WHATSAPP_WEBHOOK_SHARED_SECRET = 'service-secret';
        const req = {
            body: { messageId: 'wamid.2', status: 'read' },
            headers: { 'x-whatsapp-webhook-secret': 'service-secret' }
        };
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockPrisma.shipmentNotificationLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'READ' })
        }));
    });

    test.each([
        ['DELIVERED', 'sent'],
        ['DELIVERED', 'failed'],
        ['READ', 'delivered'],
        ['FAILED', 'sent']
    ])('does not downgrade %s when an out-of-order %s receipt arrives', async (currentStatus, rawStatus) => {
        mockPrisma.shipmentNotificationLog.findFirst.mockResolvedValue({
            id: 'log-1',
            status: currentStatus,
            responseJson: {},
            trackingNumber: 'TRK-1'
        });
        const body = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: rawStatus }] } }] }]
        };
        const req = makeMetaRequest(body);
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockPrisma.shipmentNotificationLog.updateMany).not.toHaveBeenCalled();
    });

    test('uses an atomic status condition so concurrent receipts cannot downgrade delivery', async () => {
        let currentStatus = 'submitted';
        let lookups = 0;
        let releaseLookups;
        const bothLookups = new Promise(resolve => { releaseLookups = resolve; });
        mockPrisma.shipmentNotificationLog.findFirst.mockImplementation(async () => {
            lookups += 1;
            if (lookups === 2) releaseLookups();
            await bothLookups;
            return { id: 'log-1', status: 'submitted', responseJson: {}, trackingNumber: 'TRK-1' };
        });
        mockPrisma.shipmentNotificationLog.updateMany.mockImplementation(async ({ where, data }) => {
            if (!where.status.in.includes(currentStatus)) return { count: 0 };
            currentStatus = data.status;
            return { count: 1 };
        });

        const sentBody = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'sent' }] } }] }]
        };
        const deliveredBody = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }]
        };

        await Promise.all([
            webhook.handleWebhookEvent(makeMetaRequest(sentBody), makeResponse()),
            webhook.handleWebhookEvent(makeMetaRequest(deliveredBody), makeResponse())
        ]);

        expect(currentStatus).toBe('DELIVERED');
        expect(mockPrisma.shipmentNotificationLog.updateMany).toHaveBeenCalledTimes(2);
    });

    test('ignores unknown provider status labels instead of recording them as sent', async () => {
        const body = {
            object: 'whatsapp_business_account',
            entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'provider_state_unknown' }] } }] }]
        };
        const req = makeMetaRequest(body);
        const res = makeResponse();

        await webhook.handleWebhookEvent(req, res);

        expect(mockPrisma.shipmentNotificationLog.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.shipmentNotificationLog.updateMany).not.toHaveBeenCalled();
    });

    test('does not accept or log the former hard-coded Meta verification token', async () => {
        getSystemSettings.mockReturnValue({
            whatsapp: { webhookVerifyToken: 'target_logistics_meta_verify_secret_2026' }
        });
        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'target_logistics_meta_verify_secret_2026',
                'hub.challenge': 'challenge'
            }
        };
        const res = makeResponse();

        await webhook.verifyWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('target_logistics_meta_verify_secret_2026'));
        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('target_logistics_meta_verify_secret_2026'));
    });

    test('continues to accept an explicitly configured replacement verification token', async () => {
        getSystemSettings.mockReturnValue({ whatsapp: { webhookVerifyToken: 'rotated-verification-token' } });
        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'rotated-verification-token',
                'hub.challenge': 'challenge'
            }
        };
        const res = makeResponse();

        await webhook.verifyWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('challenge');
    });
});
