/**
 * Empirical Adversarial Test Harness: Milestone 2 Cryptography & RBAC Challenger
 * File: backend/__tests__/m2_challenger1_empirical.test.js
 * 
 * Verifies Milestone 2 Security & Tamper Resistance:
 * 1. Ciphertext Tampering & Corruption (Bit flips, modified tags, truncated IVs, invalid hex, malformed JSON)
 * 2. Plaintext Leakage Audit across all User endpoints (getUsers, getUserById, getMe, createUser, updateUser, updateProfile, getAssignableClients)
 * 3. RBAC Privilege Escalation & Parameter Injection across all non-admin roles
 * 4. Raw Database Storage Invariants & Token Lifecycle
 * 5. Key Rotation & Missing Key Degradation
 * 6. Auth Controller Login/Verify-OTP Behavior
 */

const crypto = require('crypto');
const userController = require('../src/controllers/user.controller');
const fieldEncryption = require('../src/utils/fieldEncryption');
const authController = require('../src/controllers/auth.controller');
const { prisma } = require('../src/config/database');

const TEST_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ALT_KEY = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

process.env.ENCRYPTION_KEY = TEST_KEY;
process.env.JWT_SECRET = 'test_jwt_secret_m2_empirical_challenger';

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

describe('M2 Adversarial Challenger 1: Cryptographic Integrity & RBAC Defense', () => {
    const originalEnv = process.env.ENCRYPTION_KEY;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = TEST_KEY;
    });

    afterEach(() => {
        process.env.ENCRYPTION_KEY = originalEnv;
        jest.restoreAllMocks();
    });

    // =========================================================================
    // 1. CIPHERTEXT TAMPERING & CORRUPTION HARNESS
    // =========================================================================
    describe('1. Ciphertext Tampering & Corruption Harness (decryptChatwootToken)', () => {
        const samplePlain = 'chatwoot_token_secret_1234567890';
        let validEnvelope;
        let validJson;

        beforeEach(() => {
            validEnvelope = fieldEncryption.encrypt(samplePlain);
            validJson = JSON.stringify(validEnvelope);
        });

        test('1.1 Bit flipping in ciphertext data safely returns null and does not throw', () => {
            const dataBuffer = Buffer.from(validEnvelope.data, 'hex');

            // Flip bit in first byte
            const flippedFirst = Buffer.from(dataBuffer);
            flippedFirst[0] ^= 0x01;
            const env1 = { ...validEnvelope, data: flippedFirst.toString('hex') };
            expect(userController.decryptChatwootToken(JSON.stringify(env1))).toBeNull();
            expect(userController.decryptChatwootToken(env1)).toBeNull();

            // Flip bit in middle byte
            const mid = Math.floor(dataBuffer.length / 2);
            const flippedMid = Buffer.from(dataBuffer);
            flippedMid[mid] ^= 0x80;
            const env2 = { ...validEnvelope, data: flippedMid.toString('hex') };
            expect(userController.decryptChatwootToken(JSON.stringify(env2))).toBeNull();

            // Flip bit in last byte
            const flippedLast = Buffer.from(dataBuffer);
            flippedLast[flippedLast.length - 1] ^= 0x04;
            const env3 = { ...validEnvelope, data: flippedLast.toString('hex') };
            expect(userController.decryptChatwootToken(JSON.stringify(env3))).toBeNull();
        });

        test('1.2 Auth tag tampering & swapping safely returns null', () => {
            // Flip byte in auth tag
            const tagBuffer = Buffer.from(validEnvelope.tag, 'hex');
            tagBuffer[0] ^= 0xff;
            const tamperedTagEnv = { ...validEnvelope, tag: tagBuffer.toString('hex') };
            expect(userController.decryptChatwootToken(JSON.stringify(tamperedTagEnv))).toBeNull();

            // Replace tag with all zeros
            const zeroTagEnv = { ...validEnvelope, tag: '00000000000000000000000000000000' };
            expect(userController.decryptChatwootToken(JSON.stringify(zeroTagEnv))).toBeNull();

            // Replay tag from another message
            const otherEnvelope = fieldEncryption.encrypt('completely_different_token_xyz');
            const swappedTagEnv = { ...validEnvelope, tag: otherEnvelope.tag };
            expect(userController.decryptChatwootToken(JSON.stringify(swappedTagEnv))).toBeNull();
        });

        test('1.3 Truncated, extended, or invalid length auth tags return null without crash', () => {
            const badLengths = [
                '',
                '0',
                '0011',
                '00112233445566778899aabbccdd', // 14 bytes (28 chars)
                '00112233445566778899aabbccddeeff00', // 17 bytes (34 chars)
                '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' // 32 bytes (64 chars)
            ];

            for (const badTag of badLengths) {
                const env = { ...validEnvelope, tag: badTag };
                expect(() => {
                    const result = userController.decryptChatwootToken(JSON.stringify(env));
                    expect(result).toBeNull();
                }).not.toThrow();
            }
        });

        test('1.4 Truncated, extended, or non-hex IV safely returns null', () => {
            const badIVs = [
                '',
                '12',
                '0123456789abcdef', // 8 bytes (16 hex chars)
                '0123456789abcdef0123456789abcdef00', // 17 bytes (34 hex chars)
                'not-a-valid-hex-string-for-iv!!',
                'gggggggggggggggggggggggggggggggg'
            ];

            for (const badIV of badIVs) {
                const env = { ...validEnvelope, iv: badIV };
                expect(() => {
                    const result = userController.decryptChatwootToken(JSON.stringify(env));
                    expect(result).toBeNull();
                }).not.toThrow();
            }
        });

        test('1.5 Corrupted ciphertext data (odd-length hex, non-hex, empty) safely returns null', () => {
            const badData = [
                '',
                'a', // odd length
                'abc',
                validEnvelope.data.slice(0, -1), // odd length
                'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
                '!!@@##$$%%^^&&**'
            ];

            for (const corrupted of badData) {
                const env = { ...validEnvelope, data: corrupted };
                expect(() => {
                    const result = userController.decryptChatwootToken(JSON.stringify(env));
                    expect(result).toBeNull();
                }).not.toThrow();
            }
        });

        test('1.6 Malformed JSON and non-envelope strings return null or unencrypted value', () => {
            // Null, undefined, empty string safely return null
            expect(userController.decryptChatwootToken(null)).toBeNull();
            expect(userController.decryptChatwootToken(undefined)).toBeNull();
            expect(userController.decryptChatwootToken('')).toBeNull();
            expect(userController.decryptChatwootToken('   ')).toBeNull();

            // Broken JSON strings safely return null via catch block
            expect(userController.decryptChatwootToken('{')).toBeNull();
            expect(userController.decryptChatwootToken('{"iv":}')).toBeNull();
            expect(userController.decryptChatwootToken('plain_unencrypted_token_string')).toBeNull();

            // Note on fieldEncryption backward compatibility:
            // If storedToken parses to JSON but lacks `_encrypted: true`, fieldEncryption.decrypt
            // returns it as-is (backward compatibility for unencrypted JSON columns).
            const rawObjectJson = JSON.stringify({ data: '1234' });
            const rawParsed = userController.decryptChatwootToken(rawObjectJson);
            // It returns the parsed object because _encrypted is missing:
            expect(rawParsed).toEqual({ data: '1234' });
        });

        test('1.7 Key rotation or wrong key returns null gracefully', () => {
            // Encrypted with TEST_KEY
            const env = fieldEncryption.encrypt(samplePlain);

            // Change environment to ALT_KEY
            process.env.ENCRYPTION_KEY = ALT_KEY;
            expect(userController.decryptChatwootToken(JSON.stringify(env))).toBeNull();

            // Missing ENCRYPTION_KEY
            delete process.env.ENCRYPTION_KEY;
            expect(userController.decryptChatwootToken(JSON.stringify(env))).toBeNull();

            // Malformed ENCRYPTION_KEY (too short)
            process.env.ENCRYPTION_KEY = 'shortkey123';
            expect(userController.decryptChatwootToken(JSON.stringify(env))).toBeNull();
        });
    });

    // =========================================================================
    // 2. PLAINTEXT LEAKAGE AUDIT ACROSS ALL USER CONTROLLER ENDPOINTS
    // =========================================================================
    describe('2. Plaintext Leakage Audit Across User Controller Endpoints', () => {
        const secretPlainToken = 'live_secret_pat_9988776655';
        let secretEnvelopeJson;

        beforeAll(() => {
            process.env.ENCRYPTION_KEY = TEST_KEY;
            secretEnvelopeJson = JSON.stringify(fieldEncryption.encrypt(secretPlainToken));
        });

        test('2.1 getUsers NEVER exposes plaintext token to any role', async () => {
            const roles = ['admin', 'staff', 'driver', 'client', 'warehouse', 'org_manager', 'org_agent'];

            for (const role of roles) {
                const req = {
                    user: { id: `usr-${role}`, role, organizationId: role.startsWith('org') ? 'org-1' : null },
                    query: {}
                };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                    {
                        id: 'usr-target',
                        name: 'Target Staff',
                        email: 'staff@target-kw.com',
                        role: 'staff',
                        chatwootAccessToken: secretEnvelopeJson,
                        chatwootUserId: '10',
                        chatwootEmail: 'staff@target-kw.com'
                    }
                ]);

                await userController.getUsers(req, res);

                expect(res.statusCode).toBe(200);
                const item = res.body.data[0];

                // INVARIANT: Plaintext token MUST NEVER appear anywhere in response
                const rawString = JSON.stringify(res.body);
                expect(rawString).not.toContain(secretPlainToken);

                if (role === 'admin') {
                    // Admin receives masked placeholder
                    expect(item.chatwootAccessToken).toBe('••••••••');
                } else {
                    // Non-admins must have field stripped completely
                    expect(item.chatwootAccessToken).toBeUndefined();
                    expect(item).not.toHaveProperty('chatwootAccessToken');
                    expect(item).not.toHaveProperty('chatwootUserId');
                    expect(item).not.toHaveProperty('chatwootEmail');
                }
            }
        });

        test('2.2 getUserById NEVER exposes plaintext token', async () => {
            const roles = ['admin', 'staff', 'driver', 'client', 'org_manager'];

            for (const role of roles) {
                const req = {
                    params: { id: 'usr-target' },
                    user: { id: `usr-${role}`, role, organizationId: 'org-1' }
                };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                    id: 'usr-target',
                    name: 'Target User',
                    role: 'client',
                    organizationId: 'org-1',
                    chatwootAccessToken: secretEnvelopeJson
                });

                await userController.getUserById(req, res);

                expect(res.statusCode).toBe(200);
                const rawString = JSON.stringify(res.body);
                expect(rawString).not.toContain(secretPlainToken);

                if (role === 'admin') {
                    expect(res.body.data.chatwootAccessToken).toBe('••••••••');
                } else {
                    expect(res.body.data.chatwootAccessToken).toBeUndefined();
                    expect(res.body.data).not.toHaveProperty('chatwootAccessToken');
                }
            }
        });

        test('2.3 getMe NEVER exposes plaintext token', async () => {
            // Admin test
            const adminReq = { user: { id: 'admin-1', role: 'admin' } };
            const adminRes = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'admin-1',
                name: 'Super Admin',
                role: 'admin',
                chatwootAccessToken: secretEnvelopeJson
            });

            await userController.getMe(adminReq, adminRes);

            expect(adminRes.statusCode).toBe(200);
            expect(JSON.stringify(adminRes.body)).not.toContain(secretPlainToken);
            expect(adminRes.body.data.chatwootAccessToken).toBe('••••••••');

            // Staff test
            const staffReq = { user: { id: 'staff-1', role: 'staff' } };
            const staffRes = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'staff-1',
                name: 'Support Agent',
                role: 'staff',
                chatwootAccessToken: secretEnvelopeJson
            });

            await userController.getMe(staffReq, staffRes);

            expect(staffRes.statusCode).toBe(200);
            expect(JSON.stringify(staffRes.body)).not.toContain(secretPlainToken);
            expect(staffRes.body.data.chatwootAccessToken).toBeUndefined();
            expect(staffRes.body.data).not.toHaveProperty('chatwootAccessToken');
        });

        test('2.4 createUser response masks token for admin and never leaks plaintext', async () => {
            const req = {
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    name: 'New Agent',
                    email: 'agent@target-kw.com',
                    password: 'SecurePassword123!',
                    chatwootAccessToken: secretPlainToken
                }
            };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'create').mockImplementation(async ({ data }) => ({
                id: 'new-agent-id',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            }));

            await userController.createUser(req, res);

            expect(res.statusCode).toBe(201);
            expect(JSON.stringify(res.body)).not.toContain(secretPlainToken);
            expect(res.body.data.chatwootAccessToken).toBe('••••••••');
        });

        test('2.5 updateUser response masks token for admin and never leaks plaintext', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: {
                    chatwootAccessToken: secretPlainToken
                }
            };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: null
            });
            jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                id: 'usr-1',
                role: 'staff',
                ...data
            }));

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            expect(JSON.stringify(res.body)).not.toContain(secretPlainToken);
            expect(res.body.data.chatwootAccessToken).toBe('••••••••');
        });

        test('2.6 updateProfile and getAssignableClients never return chatwootAccessToken', async () => {
            // updateProfile
            const profReq = {
                user: { id: 'staff-1', role: 'staff' },
                body: { name: 'Updated Staff' }
            };
            const profRes = createMockResponse();
            jest.spyOn(prisma.user, 'update').mockResolvedValueOnce({
                id: 'staff-1',
                name: 'Updated Staff',
                email: 'staff@target-kw.com',
                role: 'staff'
            });
            await userController.updateProfile(profReq, profRes);
            expect(profRes.statusCode).toBe(200);
            expect(profRes.body.data).not.toHaveProperty('chatwootAccessToken');

            // getAssignableClients
            const assignReq = { user: { id: 'staff-1', role: 'staff' } };
            const assignRes = createMockResponse();
            jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
                {
                    id: 'client-1',
                    name: 'Client A',
                    role: 'client'
                }
            ]);
            await userController.getAssignableClients(assignReq, assignRes);
            expect(assignRes.statusCode).toBe(200);
            expect(assignRes.body.data[0]).not.toHaveProperty('chatwootAccessToken');
        });
    });

    // =========================================================================
    // 3. RBAC PRIVILEGE ESCALATION & PARAMETER INJECTION HARNESS
    // =========================================================================
    describe('3. RBAC Privilege Escalation & Parameter Injection Harness', () => {
        const nonAdminRoles = ['staff', 'driver', 'client', 'warehouse', 'org_manager', 'org_agent'];
        const maliciousPayloads = [
            'injected_access_token_exploit',
            '••••••••',
            '',
            null,
            { evil: 'payload' },
            12345
        ];

        test('3.1 All non-admin roles are rejected with HTTP 403 when submitting chatwootAccessToken to updateUser', async () => {
            for (const role of nonAdminRoles) {
                for (const payload of maliciousPayloads) {
                    const req = {
                        params: { id: 'target-user' },
                        user: { id: `u-${role}`, role },
                        body: {
                            name: 'Innocent Name',
                            chatwootAccessToken: payload
                        }
                    };
                    const res = createMockResponse();
                    const updateSpy = jest.spyOn(prisma.user, 'update');

                    await userController.updateUser(req, res);

                    expect(res.statusCode).toBe(403);
                    expect(res.body.success).toBe(false);
                    expect(res.body.error).toMatch(/Only administrators can configure Chatwoot access tokens/i);
                    expect(updateSpy).not.toHaveBeenCalled();
                }
            }
        });

        test('3.2 All non-admin roles are rejected with HTTP 403 when submitting chatwootAccessToken to createUser', async () => {
            for (const role of nonAdminRoles) {
                for (const payload of maliciousPayloads) {
                    const req = {
                        user: { id: `u-${role}`, role, organizationId: 'org-1' },
                        body: {
                            name: 'Injected User',
                            email: 'injected@target-kw.com',
                            password: 'SecurePassword123!',
                            chatwootAccessToken: payload
                        }
                    };
                    const res = createMockResponse();
                    const createSpy = jest.spyOn(prisma.user, 'create');

                    await userController.createUser(req, res);

                    expect(res.statusCode).toBe(403);
                    expect(res.body.success).toBe(false);
                    expect(res.body.error).toMatch(/Only administrators can configure Chatwoot access tokens/i);
                    expect(createSpy).not.toHaveBeenCalled();
                }
            }
        });

        test('3.3 Role forgery in request body does NOT bypass admin check', async () => {
            const req = {
                params: { id: 'target-user' },
                user: { id: 'staff-attacker', role: 'staff' }, // Authenticated as staff
                body: {
                    role: 'admin', // Forged role in body
                    chatwootAccessToken: 'forged_admin_token'
                }
            };
            const res = createMockResponse();
            const updateSpy = jest.spyOn(prisma.user, 'update');

            await userController.updateUser(req, res);

            // Invariant: Must still be rejected with 403 because req.user.role governs
            expect(res.statusCode).toBe(403);
            expect(res.body.error).toMatch(/Only administrators/i);
            expect(updateSpy).not.toHaveBeenCalled();
        });

        test('3.4 Non-admin cannot inject chatwootUserId or chatwootEmail', async () => {
            // In createUser
            const createReq = {
                user: { id: 'staff-1', role: 'staff' },
                body: {
                    name: 'Agent',
                    email: 'agent2@target-kw.com',
                    password: 'SecurePassword123!',
                    chatwootUserId: '999',
                    chatwootEmail: 'admin@chatwoot.io'
                }
            };
            const createRes = createMockResponse();
            const createSpy = jest.spyOn(prisma.user, 'create').mockImplementation(async ({ data }) => ({
                id: 'new-id',
                ...data
            }));

            await userController.createUser(createReq, createRes);

            expect(createRes.statusCode).toBe(201);
            const savedCreate = createSpy.mock.calls[0][0].data;
            expect(savedCreate).not.toHaveProperty('chatwootUserId');
            expect(savedCreate).not.toHaveProperty('chatwootEmail');

            // In updateUser
            const updateReq = {
                params: { id: 'target-id' },
                user: { id: 'staff-1', role: 'staff' },
                body: {
                    name: 'Updated Name',
                    chatwootUserId: '999',
                    chatwootEmail: 'admin@chatwoot.io'
                }
            };
            const updateRes = createMockResponse();
            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'target-id',
                role: 'staff'
            });
            const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                id: 'target-id',
                ...data
            }));

            await userController.updateUser(updateReq, updateRes);

            expect(updateRes.statusCode).toBe(200);
            const savedUpdate = updateSpy.mock.calls[0][0].data;
            expect(savedUpdate).not.toHaveProperty('chatwootUserId');
            expect(savedUpdate).not.toHaveProperty('chatwootEmail');
        });
    });

    // =========================================================================
    // 4. DATABASE STORAGE & DATA INTEGRITY INVARIANTS
    // =========================================================================
    describe('4. Raw Database Storage & Lifecycle Invariants', () => {
        const plainToken = 'cw_live_sec_token_alpha_omega_445566';

        test('4.1 Plaintext is NEVER stored in database on write', async () => {
            const req = {
                params: { id: 'usr-1' },
                user: { id: 'admin-1', role: 'admin' },
                body: { chatwootAccessToken: plainToken }
            };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: null
            });
            const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                id: 'usr-1',
                role: 'staff',
                ...data
            }));

            await userController.updateUser(req, res);

            expect(res.statusCode).toBe(200);
            const rawDbValue = updateSpy.mock.calls[0][0].data.chatwootAccessToken;

            // Invariant: Raw DB value must NOT contain plaintext
            expect(rawDbValue).not.toContain(plainToken);

            // Invariant: Must be valid JSON string
            expect(typeof rawDbValue).toBe('string');
            const envelope = JSON.parse(rawDbValue);

            expect(envelope._encrypted).toBe(true);
            expect(envelope.iv).toMatch(/^[0-9a-f]{32}$/);
            expect(envelope.tag).toMatch(/^[0-9a-f]{32}$/);
            expect(envelope.data).toMatch(/^[0-9a-f]+$/);

            // Invariant: Decrypt recovers exact plain token
            expect(userController.decryptChatwootToken(rawDbValue)).toBe(plainToken);
        });

        test('4.2 Partial updates preserve existing token in database', async () => {
            const initialEnvelope = JSON.stringify(fieldEncryption.encrypt(plainToken));
            const existingUser = {
                id: 'usr-1',
                role: 'staff',
                chatwootAccessToken: initialEnvelope
            };

            const maskedInputs = ['••••••••', '••••', '[redacted]'];

            for (const masked of maskedInputs) {
                const req = {
                    params: { id: 'usr-1' },
                    user: { id: 'admin-1', role: 'admin' },
                    body: {
                        name: 'New Name',
                        chatwootAccessToken: masked
                    }
                };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(existingUser);
                const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                    ...existingUser,
                    ...data
                }));

                await userController.updateUser(req, res);

                expect(res.statusCode).toBe(200);
                const updateData = updateSpy.mock.calls[0][0].data;
                // Invariant: chatwootAccessToken must not be in updateData (untouched in DB)
                expect(updateData).not.toHaveProperty('chatwootAccessToken');
            }
        });

        test('4.3 Clearing token sets database field to null', async () => {
            const clearInputs = [null, '', '   '];

            for (const clearVal of clearInputs) {
                const req = {
                    params: { id: 'usr-1' },
                    user: { id: 'admin-1', role: 'admin' },
                    body: { chatwootAccessToken: clearVal }
                };
                const res = createMockResponse();

                jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                    id: 'usr-1',
                    role: 'staff',
                    chatwootAccessToken: 'existing-envelope'
                });
                const updateSpy = jest.spyOn(prisma.user, 'update').mockImplementation(async ({ data }) => ({
                    id: 'usr-1',
                    role: 'staff',
                    ...data
                }));

                await userController.updateUser(req, res);

                expect(res.statusCode).toBe(200);
                const updateData = updateSpy.mock.calls[0][0].data;
                expect(updateData.chatwootAccessToken).toBeNull();
            }
        });
    });

    // =========================================================================
    // 5. CROSS-CONTROLLER AUDIT: AUTH CONTROLLER LOGIN & OTP BEHAVIOR
    // =========================================================================
    describe('5. Cross-Controller Behavior (authController)', () => {
        test('5.1 authController login does not expose plaintext token even if present in user record', async () => {
            const securityUtils = require('../src/utils/security');
            const realHashedPassword = await securityUtils.hashPassword('password123');
            const encryptedEnvelope = JSON.stringify(fieldEncryption.encrypt('secret_token'));
            const req = {
                body: { email: 'staff@target-kw.com', password: 'password123' }
            };
            const res = createMockResponse();

            jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
                id: 'staff-1',
                email: 'staff@target-kw.com',
                password: realHashedPassword,
                role: 'staff',
                chatwootAccessToken: encryptedEnvelope
            });

            await authController.login(req, res);

            expect(res.statusCode).toBe(200);
            // INVARIANT: Plaintext token must never appear anywhere in the login response
            expect(JSON.stringify(res.body)).not.toContain('secret_token');

            // Audit finding: The login endpoint returns `res.body.data.user`. Because authController
            // does not strip or mask `chatwootAccessToken`, the encrypted ciphertext envelope is present in data.user.
            // Verify that while ciphertext is present, it is an encrypted JSON envelope, NOT plaintext.
            expect(res.body.data.user.chatwootAccessToken).toBe(encryptedEnvelope);
        });
    });
});
