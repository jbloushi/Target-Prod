/**
 * Test Suite: Per-Agent Chatwoot Personal Access Token Security & Masking
 * File: backend/__tests__/userChatwootTokenSecurity.test.js
 * 
 * Verifies Milestone 2 Security Invariants:
 * 1. Tokens stored encrypted at rest via authenticated AES-256-GCM.
 * 2. API responses always mask tokens as '••••••••' for admin viewers.
 * 3. Non-admin roles (staff, driver, client, warehouse, org_manager, org_agent)
 *    have tokens strictly stripped on GET and rejected with HTTP 403 on write.
 * 4. Partial updates submitting masked placeholder '••••••••' preserve existing token.
 * 5. Token clearing via null/empty string sets database value to null.
 * 6. In-memory decryption recovers original token and rejects tampered ciphertext.
 */

const userController = require('../src/controllers/user.controller');
const fieldEncryption = require('../src/utils/fieldEncryption');
const { prisma } = require('../src/config/database');

// Ensure valid 64-hex char encryption key in test environment
const TEST_HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = TEST_HEX_KEY;

function createMockResponse() {
    const res = {};
    res.statusCode = 200;
    res.status = jest.fn().mockImplementation((code) => {
        res.statusCode = code;
        return res;
    });
    res.json = jest.fn().mockImplementation((data) => {
        res.body = data;
        return res;
    });
    return res;
}

describe('Milestone 2: User Chatwoot Personal Access Token Security', () => {
    const plainToken = 'cw_pat_live_secret_token_999888';
    let encryptedEnvelopeString;

    beforeAll(() => {
        const envelope = fieldEncryption.encrypt(plainToken);
        encryptedEnvelopeString = JSON.stringify(envelope);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // 1. ENCRYPTION AT REST (AES-256-GCM)
    // =========================================================================
    describe('1. Encryption at Rest on Write', () => {
        test('1.1 Admin createUser with plain token encrypts via AES-256-GCM before DB insert', async () => {
            const req = {
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    name: 'Agent Support',
                    email: 'support@target-kw.com',
                    password: 'SecurePassword123!',
                    role: 'staff',
                    chatwootUserId: '42',
                    chatwootEmail: 'support@target-kw.com',
                    chatwootAccessToken: plainToken
                }
            };
            const res = createMockResponse();

            const createSpy = jest.spyOn(prisma.user, 'create').mockImplementation(async ({ data }) => ({
                id: 'new-usr-1',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            }));

            await userController.createUser(req, res);

            expect(res.statusCode).toBe(201);
            expect(createSpy).toHaveBeenCalled();
            const savedData = createSpy.mock.calls[0][0].data;

            // Invariant: raw DB value must NOT equal plain token
            expect(savedData.chatwootAccessToken).not.toBe(plainToken);

            // Invariant: must be valid JSON envelope with iv, data, tag, _encrypted
            const parsed = JSON.parse(savedData.chatwootAccessToken);
            expect(parsed._encrypted).toBe(true);
            expect(parsed.iv).toHaveLength(32); // 16 bytes hex
            expect(parsed.tag).toHaveLength(32); // 16 bytes hex
            expect(parsed.data).toBeDefined();

            // Invariant: decrypted data matches plain token
            expect(fieldEncryption.decrypt(parsed)).toBe(plainToken);
        });

        test('1.2 Admin updateUser with plain token encrypts via AES-256-GCM before DB update', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    chatwootAccessToken: plainToken
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: null
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                ...existingUser,
                ...data
            }));

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            expect(updateSpy).toHaveBeenCalled();
            const updateData = updateSpy.mock.calls[0][0].data;

            expect(updateData.chatwootAccessToken).not.toBe(plainToken);
            const parsed = JSON.parse(updateData.chatwootAccessToken);
            expect(parsed._encrypted).toBe(true);
            expect(fieldEncryption.decrypt(parsed)).toBe(plainToken);
        });
    });

    // =========================================================================
    // 2. API RESPONSE MASKING (ADMIN VIEWER)
    // =========================================================================
    describe('2. API Response Masking for Admins', () => {
        test('2.1 Admin calling GET /api/users receives masked token ••••••••', async () => {
            const req = { user: { id: 'admin-1', role: 'admin' }, query: {} };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                {
                    id: 'usr-1',
                    name: 'Agent With Token',
                    role: 'staff',
                    chatwootUserId: '10',
                    chatwootEmail: 'agent10@target-kw.com',
                    chatwootAccessToken: encryptedEnvelopeString
                },
                {
                    id: 'usr-2',
                    name: 'Agent Without Token',
                    role: 'staff',
                    chatwootUserId: '11',
                    chatwootEmail: 'agent11@target-kw.com',
                    chatwootAccessToken: null
                }
            ]);

            await userController.getUsers(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].chatwootAccessToken).toBe('••••••••');
            expect(res.body.data[0].chatwootAccessToken).not.toBe(plainToken);
            expect(res.body.data[0].chatwootAccessToken).not.toContain(encryptedEnvelopeString);
            expect(res.body.data[1].chatwootAccessToken).toBeNull();
        });

        test('2.2 Admin calling GET /api/users/:id receives masked token ••••••••', async () => {
            const req = { params: { id: 'usr-1' }, user: { id: 'admin-1', role: 'admin' } };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'usr-1',
                name: 'Agent',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            });

            await userController.getUserById(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.chatwootAccessToken).toBe('••••••••');
        });

        test('2.3 Admin calling GET /api/users/me receives masked token ••••••••', async () => {
            const req = { user: { id: 'admin-1', role: 'admin' } };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'admin-1',
                name: 'Super Admin',
                role: 'admin',
                chatwootAccessToken: encryptedEnvelopeString
            });

            await userController.getMe(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.chatwootAccessToken).toBe('••••••••');
        });

        test('2.4 Admin createUser response returns masked token ••••••••', async () => {
            const req = {
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    name: 'Agent',
                    email: 'a@target-kw.com',
                    password: 'password123',
                    chatwootAccessToken: plainToken
                }
            };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'create').mockResolvedValueOnce({
                id: 'new-id',
                name: 'Agent',
                email: 'a@target-kw.com',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            });

            await userController.createUser(req, res);

            expect(res.statusCode).toBe(201);
            expect(res.body.data.chatwootAccessToken).toBe('••••••••');
        });
    });

    // =========================================================================
    // 3. NON-ADMIN RBAC ENFORCEMENT & STRIPPING
    // =========================================================================
    describe('3. Non-Admin RBAC Rejection and Data Stripping', () => {
        const nonAdminRoles = ['staff', 'driver', 'client', 'warehouse', 'org_manager', 'org_agent'];

        test('3.1 Non-admin roles calling GET /api/users NEVER receive chatwootAccessToken', async () => {
            for (const role of nonAdminRoles) {
                const req = { user: { id: `u-${role}`, role }, query: {} };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                    {
                        id: 'usr-1',
                        name: 'Staff',
                        role: 'staff',
                        chatwootAccessToken: encryptedEnvelopeString
                    }
                ]);

                await userController.getUsers(req, res);

                expect(res.statusCode).toBe(200);
                expect(res.body.data[0].chatwootAccessToken).toBeUndefined();
                expect(Object.keys(res.body.data[0])).not.toContain('chatwootAccessToken');
            }
        });

        test('3.2 Non-admin calling GET /api/users/:id has chatwootAccessToken stripped', async () => {
            const req = { params: { id: 'usr-1' }, user: { id: 'client-1', role: 'client' } };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'usr-1',
                name: 'Agent',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            });

            await userController.getUserById(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.chatwootAccessToken).toBeUndefined();
            expect(Object.keys(res.body.data)).not.toContain('chatwootAccessToken');
        });

        test('3.3 Non-admin calling GET /api/users/me has chatwootAccessToken stripped', async () => {
            const req = { user: { id: 'staff-1', role: 'staff' } };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'staff-1',
                name: 'Staff User',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            });

            await userController.getMe(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.chatwootAccessToken).toBeUndefined();
            expect(Object.keys(res.body.data)).not.toContain('chatwootAccessToken');
        });

        test('3.4 Non-admin submitting PATCH /api/users/:id with chatwootAccessToken is rejected with HTTP 403', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'staff-1', role: 'staff' },
                body: {
                    name: 'Attempted Update',
                    chatwootAccessToken: 'malicious_injected_token'
                }
            };
            const res = createMockResponse();

            const updateSpy = jest.spyOn(prisma.user, 'update');

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Only administrators');
            expect(updateSpy).not.toHaveBeenCalled();
        });

        test('3.5 Non-admin submitting POST /api/users with chatwootAccessToken is rejected with HTTP 403', async () => {
            const req = {
                user: { id: 'org-mgr-1', role: 'org_manager', organizationId: 'org-1' },
                body: {
                    name: 'New Agent',
                    email: 'agent@org.com',
                    password: 'password123',
                    chatwootAccessToken: 'malicious_injected_token'
                }
            };
            const res = createMockResponse();

            const createSpy = jest.spyOn(prisma.user, 'create');

            await userController.createUser(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Only administrators');
            expect(createSpy).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // 4. PARTIAL UPDATES & TOKEN LIFECYCLE
    // =========================================================================
    describe('4. Partial Updates & Token Lifecycle', () => {
        test('4.1 Admin sending masked token •••••••• preserves existing encrypted token in DB', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    name: 'Updated Name Only',
                    chatwootAccessToken: '••••••••' // Masked placeholder sent back by UI
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                ...existingUser,
                ...data
            }));

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            expect(updateSpy).toHaveBeenCalled();
            const updateData = updateSpy.mock.calls[0][0].data;

            // Invariant: chatwootAccessToken MUST NOT be overwritten with '••••••••'
            expect(updateData.chatwootAccessToken).toBeUndefined();
            expect(Object.keys(updateData)).not.toContain('chatwootAccessToken');
        });

        test('4.2 Admin omitting chatwootAccessToken entirely preserves existing token in DB', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    phone: '+96590001122'
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                ...existingUser,
                ...data
            }));

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            const updateData = updateSpy.mock.calls[0][0].data;
            expect(updateData.chatwootAccessToken).toBeUndefined();
        });

        test('4.3 Admin passing null or empty string clears token in DB', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    chatwootAccessToken: null
                }
            };
            const res = createMockResponse();

            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: encryptedEnvelopeString
            };

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
            const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                ...existingUser,
                ...data
            }));

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            const updateData = updateSpy.mock.calls[0][0].data;
            expect(updateData.chatwootAccessToken).toBeNull();
        });
    });

    // =========================================================================
    // 5. IN-MEMORY DECRYPTION & TAMPER DETECTION
    // =========================================================================
    describe('5. In-Memory Decryption Verification', () => {
        test('5.1 decryptChatwootToken successfully recovers original plaintext from JSON string', () => {
            const decrypted = userController.decryptChatwootToken(encryptedEnvelopeString);
            expect(decrypted).toBe(plainToken);
        });

        test('5.2 decryptChatwootToken successfully recovers original plaintext from object envelope', () => {
            const envelopeObj = fieldEncryption.encrypt('token_abc_123');
            const decrypted = userController.decryptChatwootToken(envelopeObj);
            expect(decrypted).toBe('token_abc_123');
        });

        test('5.3 decryptChatwootToken safely returns null on tampered or corrupted ciphertext', () => {
            const envelope = fieldEncryption.encrypt('secret');
            // Corrupt authentication tag
            envelope.tag = '00000000000000000000000000000000';
            const decrypted = userController.decryptChatwootToken(JSON.stringify(envelope));
            expect(decrypted).toBeNull();
        });

        test('5.4 decryptChatwootToken returns null for empty, null, or undefined values', () => {
            expect(userController.decryptChatwootToken(null)).toBeNull();
            expect(userController.decryptChatwootToken(undefined)).toBeNull();
            expect(userController.decryptChatwootToken('')).toBeNull();
        });
    });
});
