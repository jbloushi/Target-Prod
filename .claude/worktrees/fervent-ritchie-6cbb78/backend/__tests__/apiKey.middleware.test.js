const { createMockRes } = require('../testUtils');

describe('API key middleware', () => {
    const prisma = {
        user: {
            findFirst: jest.fn()
        }
    };
    const compareApiKey = jest.fn();
    const next = jest.fn();

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/utils/security', () => ({ compareApiKey }));
        jest.doMock('../src/utils/RequestContext', () => ({
            run: (_context, callback) => callback()
        }));
    });

    it('rejects missing and malformed API keys', async () => {
        const { validateApiKey } = require('../src/middleware/apiKey.middleware');

        const missingRes = createMockRes();
        await validateApiKey({ headers: {} }, missingRes, next);
        expect(missingRes.status).toHaveBeenCalledWith(401);

        const malformedRes = createMockRes();
        await validateApiKey({ headers: { 'x-api-key': 'bad-key' } }, malformedRes, next);
        expect(malformedRes.status).toHaveBeenCalledWith(401);
    });

    it('attaches authenticated API user context for valid keys', async () => {
        const { validateApiKey } = require('../src/middleware/apiKey.middleware');
        const req = { headers: { 'x-api-key': 'user-1.secret' } };
        const res = createMockRes();

        prisma.user.findFirst.mockResolvedValue({
            id: 'user-1',
            role: 'client',
            organizationId: 'org-1',
            apiKeyHash: 'hash',
            active: true,
            agentPolicy: {},
            organization: { id: 'org-1', allowedCarriers: ['DGR'] }
        });
        compareApiKey.mockReturnValue(true);

        await validateApiKey(req, res, next);

        expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-1', active: true }
        }));
        expect(req.user.id).toBe('user-1');
        expect(req.isExternalApi).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects inactive, missing, or mismatched API keys', async () => {
        const { validateApiKey } = require('../src/middleware/apiKey.middleware');
        const req = { headers: { 'x-api-key': 'user-1.secret' } };
        const res = createMockRes();

        prisma.user.findFirst.mockResolvedValue({ id: 'user-1', apiKeyHash: 'hash' });
        compareApiKey.mockReturnValue(false);

        await validateApiKey(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
