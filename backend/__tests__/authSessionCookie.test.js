const { createMockRes } = require('../testUtils');

jest.mock('../src/config/database', () => ({
    prisma: { user: { findUnique: jest.fn() } }
}));
jest.mock('../src/utils/security', () => ({
    hashPassword: jest.fn(),
    comparePassword: jest.fn(),
    generateUserApiKey: jest.fn()
}));

const { prisma } = require('../src/config/database');
const { comparePassword } = require('../src/utils/security');
const authController = require('../src/controllers/auth.controller');

describe('browser auth session issuance', () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.JWT_SECRET = 'session-cookie-test-secret';
        process.env.NODE_ENV = 'test';
        prisma.user.findUnique.mockReset();
        comparePassword.mockReset();
    });

    afterAll(() => {
        if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalJwtSecret;
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('sets the session as HttpOnly cookie and omits the JWT from JSON', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1', email: 'agent@example.test', password: 'hash', active: true,
            apiKeyHash: 'api-hash', chatwootAccessToken: 'chatwoot-secret'
        });
        comparePassword.mockResolvedValue(true);
        const res = createMockRes();
        res.cookie = jest.fn();

        await authController.login({ body: { email: 'agent@example.test', password: 'password' } }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.cookie).toHaveBeenCalledWith('target_session', expect.any(String), expect.objectContaining({
            httpOnly: true, sameSite: 'strict', path: '/', secure: false
        }));
        const response = res.json.mock.calls[0][0];
        expect(response.token).toBeUndefined();
        expect(JSON.stringify(response)).not.toContain('session-cookie-test-secret');
    });
});
