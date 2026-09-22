const integrationController = require('../src/controllers/integration.controller');
const { prisma } = require('../src/config/database');
const WebhookDispatcher = require('../src/services/WebhookDispatcher');

jest.mock('../src/config/database', () => ({
    prisma: {
        user: {
            findUnique: jest.fn()
        },
        webhookSubscription: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        },
        webhookEvent: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn()
        }
    }
}));

jest.mock('../src/services/WebhookDispatcher', () => ({
    _deliver: jest.fn().mockResolvedValue()
}));

describe('Merchant Webhook Integration Controller', () => {
    let mockReq, mockRes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = {
            user: { id: 'usr-1', organizationId: 'org-1', role: 'org_agent' },
            body: {},
            params: {},
            query: {}
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    });

    describe('listWebhooks', () => {
        it('lists all subscriptions for the organization', async () => {
            const mockSubs = [
                { id: 'sub-1', targetUrl: 'https://example.com/wh', events: ['*'], isActive: true, _count: { deliveryEvents: 5 } }
            ];
            prisma.webhookSubscription.findMany.mockResolvedValue(mockSubs);

            await integrationController.listWebhooks(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: mockSubs });
        });
    });

    describe('createWebhook', () => {
        it('rejects invalid target URLs', async () => {
            mockReq.body = { targetUrl: 'ftp://bad-url' };
            await integrationController.createWebhook(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it('creates webhook subscription with generated signing secret', async () => {
            mockReq.body = {
                targetUrl: 'https://client.com/webhook',
                events: ['shipment.created', 'shipment.delivered']
            };
            const created = {
                id: 'sub-new',
                organizationId: 'org-1',
                targetUrl: 'https://client.com/webhook',
                events: ['shipment.created', 'shipment.delivered'],
                secret: 'random-secret',
                isActive: true
            };
            prisma.webhookSubscription.create.mockResolvedValue(created);

            await integrationController.createWebhook(mockReq, mockRes);
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: created });
        });
    });

    describe('testWebhook', () => {
        it('creates a test ping event and delivers payload', async () => {
            mockReq.params = { id: 'sub-1' };
            const mockSub = {
                id: 'sub-1',
                organizationId: 'org-1',
                targetUrl: 'https://client.com/webhook',
                secret: 'sec-123'
            };
            prisma.webhookSubscription.findUnique.mockResolvedValue(mockSub);
            prisma.webhookEvent.create.mockResolvedValue({ id: 'ev-test-1', subscriptionId: 'sub-1', event: 'ping' });
            prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'ev-test-1', status: 'success' });

            await integrationController.testWebhook(mockReq, mockRes);
            expect(WebhookDispatcher._deliver).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
    });
});
