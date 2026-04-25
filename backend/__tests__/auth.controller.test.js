const { createMockRes } = require('../testUtils');

describe('auth.controller security', () => {
    const prisma = {
        user: {
            findUnique: jest.fn()
        },
        $transaction: jest.fn()
    };
    const logger = {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    };
    const hashPassword = jest.fn();
    const comparePassword = jest.fn();

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret';
        delete process.env.ALLOW_PUBLIC_SIGNUP;

        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/utils/logger', () => logger);
        jest.doMock('../src/utils/security', () => ({
            hashPassword,
            comparePassword,
            generateUserApiKey: jest.fn()
        }));
    });

    it('rejects self-signup when public signup is disabled', async () => {
        const authController = require('../src/controllers/auth.controller');
        const req = {
            body: {
                name: 'New User',
                email: 'new@demo.com',
                password: 'password123'
            }
        };
        const res = createMockRes();

        await authController.signup(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects login for inactive users before password comparison', async () => {
        const authController = require('../src/controllers/auth.controller');
        const req = {
            body: {
                email: 'inactive@demo.com',
                password: 'password123'
            }
        };
        const res = createMockRes();

        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            email: 'inactive@demo.com',
            active: false,
            password: '$2a$12$examplehash'
        });

        await authController.login(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(comparePassword).not.toHaveBeenCalled();
    });
});
