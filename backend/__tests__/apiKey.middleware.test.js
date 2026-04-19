const { createMockRes } = require('../testUtils');

describe('API key middleware', () => {
    const prisma = {
        user: {
            findUnique: jest.fn()
        },
        organization: {
            findUnique: jest.fn()
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
        const req = { headers: { 'x-api-key': 'user-1.secret' }, originalUrl: '/api/v1/quotes', method: 'POST' };
        const res = createMockRes();

        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            role: 'client',
            organizationId: 'org-1',
            apiKeyHash: 'hash',
            active: true,
            agentPolicy: {}
        });
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', active: true, name: 'Org 1' });
        compareApiKey.mockReturnValue(true);

        await validateApiKey(req, res, next);

        expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-1' }
        }));
        expect(req.user.id).toBe('user-1');
        expect(req.isExternalApi).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 for unknown or mismatched API keys', async () => {
        const { validateApiKey } = require('../src/middleware/apiKey.middleware');

        const unknownReq = { headers: { 'x-api-key': 'user-404.secret' }, originalUrl: '/api/v1/quotes', method: 'POST' };
        const unknownRes = createMockRes();
        prisma.user.findUnique.mockResolvedValueOnce(null);
        await validateApiKey(unknownReq, unknownRes, next);
        expect(unknownRes.status).toHaveBeenCalledWith(401);

        const mismatchReq = { headers: { 'x-api-key': 'user-1.secret' }, originalUrl: '/api/v1/quotes', method: 'POST' };
        const mismatchRes = createMockRes();
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', apiKeyHash: 'hash', active: true });
        compareApiKey.mockReturnValue(false);
        await validateApiKey(mismatchReq, mismatchRes, next);
        expect(mismatchRes.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 for inactive users and inactive organizations', async () => {
        const { validateApiKey } = require('../src/middleware/apiKey.middleware');

        const inactiveUserReq = { headers: { 'x-api-key': 'user-1.secret' }, originalUrl: '/api/v1/quotes', method: 'POST' };
        const inactiveUserRes = createMockRes();
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', apiKeyHash: 'hash', active: false });
        compareApiKey.mockReturnValue(true);
        await validateApiKey(inactiveUserReq, inactiveUserRes, next);
        expect(inactiveUserRes.status).toHaveBeenCalledWith(403);

        const inactiveOrgReq = { headers: { 'x-api-key': 'user-2.secret' }, originalUrl: '/api/v1/quotes', method: 'POST' };
        const inactiveOrgRes = createMockRes();
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-2', apiKeyHash: 'hash', active: true, organizationId: 'org-2' });
        prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-2', active: false });
        await validateApiKey(inactiveOrgReq, inactiveOrgRes, next);
        expect(inactiveOrgRes.status).toHaveBeenCalledWith(403);
    });
});

