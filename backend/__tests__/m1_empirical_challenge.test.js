const { getSanitizedDatabaseUrl } = require('../src/config/database');
const { validateEnv, formatDiagnosticTable } = require('../src/config/envValidator');
const { executeTransactionWithRetry } = require('../src/services/financeLedger.service');

describe('Milestone 1 Empirical Challenge Suite (Challenger 1)', () => {
    
    // =========================================================================
    // SECTION 1: Environment Validation (F4) Stress Testing & Edge Cases
    // =========================================================================
    describe('1. Environment Validation (F4) Stress Testing', () => {
        let savedEnv;

        beforeEach(() => {
            savedEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = savedEnv;
        });

        describe('DATABASE_URL edge cases', () => {
            it('fails fast when DATABASE_URL is completely missing', () => {
                delete process.env.DATABASE_URL;
                process.env.NODE_ENV = 'development';

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Missing required database connection string/);
            });

            it('fails fast when DATABASE_URL is an empty string', () => {
                process.env.DATABASE_URL = '';
                process.env.NODE_ENV = 'development';

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Missing required database connection string/);
            });

            it('fails fast when DATABASE_URL uses postgres:// scheme', () => {
                process.env.DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/target_db';
                process.env.NODE_ENV = 'development';

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be a valid MySQL connection URI/);
            });

            it('fails fast when DATABASE_URL is a plain string without mysql:// or mysqlx://', () => {
                process.env.DATABASE_URL = 'localhost:3306/target_db';
                process.env.NODE_ENV = 'development';

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be a valid MySQL connection URI/);
            });

            it('accepts both mysql:// and mysqlx:// valid connection URIs', () => {
                process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/target_db';
                process.env.NODE_ENV = 'development';
                const resultMysql = validateEnv({ exitOnError: false });
                expect(resultMysql.isValid).toBe(true);

                process.env.DATABASE_URL = 'mysqlx://user:pass@localhost:33060/target_db';
                const resultMysqlx = validateEnv({ exitOnError: false });
                expect(resultMysqlx.isValid).toBe(true);
            });
        });

        describe('ENCRYPTION_KEY edge cases in production', () => {
            beforeEach(() => {
                process.env.NODE_ENV = 'production';
                process.env.DATABASE_URL = 'mysql://u:p@127.0.0.1:3306/db';
                process.env.JWT_SECRET = 's'.repeat(64);
                process.env.API_KEY_SECRET = 'api-key-hash-secret-value-32chars';
                process.env.CORS_ORIGIN = 'https://app.target-logistics.com';
            });

            it('fails when ENCRYPTION_KEY is missing in production', () => {
                delete process.env.ENCRYPTION_KEY;

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Missing required encryption key in production/);
            });

            it('fails when ENCRYPTION_KEY is 63 characters (one char short of 32 bytes)', () => {
                process.env.ENCRYPTION_KEY = 'a'.repeat(63);

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be a 64-character hex string/);
            });

            it('fails when ENCRYPTION_KEY is 65 characters (one char too long)', () => {
                process.env.ENCRYPTION_KEY = 'b'.repeat(65);

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be a 64-character hex string/);
            });

            it('fails when ENCRYPTION_KEY has 64 characters but contains non-hex characters (g-z)', () => {
                process.env.ENCRYPTION_KEY = 'g'.repeat(64);

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be a 64-character hex string/);
            });

            it('fails when ENCRYPTION_KEY contains spaces or symbols even if total length is 64', () => {
                process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef 123456789abcdef0123456789abcdef';

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be a 64-character hex string/);
            });

            it('passes when ENCRYPTION_KEY is exactly 64 valid uppercase/lowercase hex characters', () => {
                process.env.ENCRYPTION_KEY = '0123456789abcdefABCDEF0123456789abcdefABCDEF0123456789abcdefABCD';
                expect(process.env.ENCRYPTION_KEY.length).toBe(64);

                const result = validateEnv({ exitOnError: false });
                expect(result.isValid).toBe(true);
                expect(result.errors.length).toBe(0);
            });
        });

        describe('JWT_SECRET edge cases in production', () => {
            beforeEach(() => {
                process.env.NODE_ENV = 'production';
                process.env.DATABASE_URL = 'mysql://u:p@127.0.0.1:3306/db';
                process.env.ENCRYPTION_KEY = '0'.repeat(64);
                process.env.API_KEY_SECRET = 'api-key-secret-test-value-32chars';
                process.env.CORS_ORIGIN = 'https://app.target-logistics.com';
            });

            it('fails when JWT_SECRET is missing in production', () => {
                delete process.env.JWT_SECRET;

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Missing required secret in production/);
            });

            it('fails when JWT_SECRET is empty string', () => {
                process.env.JWT_SECRET = '';

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Missing required secret in production/);
            });

            it('fails when JWT_SECRET is 32 characters (< 64 characters required for production HMAC)', () => {
                process.env.JWT_SECRET = 'x'.repeat(32);

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be at least 64 characters long in production/);
            });

            it('fails when JWT_SECRET is 63 characters', () => {
                process.env.JWT_SECRET = 'y'.repeat(63);

                expect(() => validateEnv({ exitOnError: false })).toThrow(/Must be at least 64 characters long in production/);
            });

            it('passes when JWT_SECRET is exactly 64 characters in production', () => {
                process.env.JWT_SECRET = 'z'.repeat(64);

                const result = validateEnv({ exitOnError: false });
                expect(result.isValid).toBe(true);
            });

            it('passes when JWT_SECRET exceeds 64 characters (e.g. 128 chars)', () => {
                process.env.JWT_SECRET = 'w'.repeat(128);

                const result = validateEnv({ exitOnError: false });
                expect(result.isValid).toBe(true);
            });
        });

        describe('Fail-fast mechanism and diagnostic reporting', () => {
            it('calls process.exit(1) when exitOnError is true and validation fails', () => {
                process.env.NODE_ENV = 'production';
                delete process.env.DATABASE_URL;

                const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
                    throw new Error(`process.exit called with ${code}`);
                });

                expect(() => validateEnv({ exitOnError: true })).toThrow('process.exit called with 1');
                expect(exitSpy).toHaveBeenCalledWith(1);
                exitSpy.mockRestore();
            });

            it('accumulates multiple missing fields into diagnostic output', () => {
                process.env.NODE_ENV = 'production';
                delete process.env.DATABASE_URL;
                delete process.env.JWT_SECRET;
                delete process.env.ENCRYPTION_KEY;
                delete process.env.API_KEY_SECRET;
                delete process.env.CORS_ORIGIN;

                expect(() => validateEnv({ exitOnError: false })).toThrow(/DATABASE_URL.*JWT_SECRET.*API_KEY_SECRET.*ENCRYPTION_KEY.*CORS_ORIGIN/s);
            });

            it('formats ASCII table with borders, padding, headers, and remediation message', () => {
                const errors = [
                    { field: 'DATABASE_URL', reason: 'Missing required database connection string' },
                    { field: 'JWT_SECRET', reason: 'Must be at least 64 characters long in production' }
                ];
                const table = formatDiagnosticTable(errors);

                expect(table).toContain('======================================================================');
                expect(table).toContain('[CONFIG VALIDATION ERROR] Server failed to bootstrap');
                expect(table).toContain('Field:');
                expect(table).toContain('Reason:');
                expect(table).toContain('DATABASE_URL');
                expect(table).toContain('JWT_SECRET');
                expect(table).toContain('Remediation: Fix the issues above in your .env file or server environment.');
            });

            it('validates conditional Chatwoot settings only when CHATWOOT_ENABLED=true', () => {
                process.env.NODE_ENV = 'development';
                process.env.DATABASE_URL = 'mysql://u:p@localhost:3306/db';

                // Disabled: missing chatwoot vars should NOT trigger error
                process.env.CHATWOOT_ENABLED = 'false';
                delete process.env.CHATWOOT_BASE_URL;
                expect(validateEnv({ exitOnError: false }).isValid).toBe(true);

                // Enabled: missing chatwoot vars MUST trigger error
                process.env.CHATWOOT_ENABLED = 'true';
                expect(() => validateEnv({ exitOnError: false })).toThrow(/CHATWOOT_BASE_URL/);
            });
        });
    });

    // =========================================================================
    // SECTION 2: Connection Pooling & Transaction Retry Resilience (F1)
    // =========================================================================
    describe('2. Connection Pooling & Transaction Retry Resilience (F1)', () => {
        let savedEnv;

        beforeEach(() => {
            savedEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = savedEnv;
        });

        describe('getSanitizedDatabaseUrl URL Format Variations', () => {
            it('correctly appends pool params to standard MySQL URL without params', () => {
                const raw = 'mysql://app_user:s3cr3t@127.0.0.1:3306/target_db';
                const sanitized = getSanitizedDatabaseUrl(raw);
                const parsed = new URL(sanitized);

                expect(parsed.hostname).toBe('127.0.0.1');
                expect(parsed.port).toBe('3306');
                expect(parsed.pathname).toBe('/target_db');
                expect(parsed.searchParams.get('connection_limit')).toBe('10');
                expect(parsed.searchParams.get('pool_timeout')).toBe('20');
                expect(parsed.searchParams.get('connect_timeout')).toBe('10');
            });

            it('correctly handles hostname instead of IPv4', () => {
                const raw = 'mysql://target_admin:prodPass@mysql-master.target-vpc.internal:3306/prod_logistics';
                const sanitized = getSanitizedDatabaseUrl(raw);
                const parsed = new URL(sanitized);

                expect(parsed.hostname).toBe('mysql-master.target-vpc.internal');
                expect(parsed.searchParams.get('connection_limit')).toBe('10');
                expect(parsed.searchParams.get('pool_timeout')).toBe('20');
                expect(parsed.searchParams.get('connect_timeout')).toBe('10');
            });

            it('preserves existing non-pool query parameters (e.g. charset, ssl)', () => {
                const raw = 'mysql://user:pass@localhost:3306/db?charset=utf8mb4&sslaccept=strict';
                const sanitized = getSanitizedDatabaseUrl(raw);
                const parsed = new URL(sanitized);

                expect(parsed.searchParams.get('charset')).toBe('utf8mb4');
                expect(parsed.searchParams.get('sslaccept')).toBe('strict');
                expect(parsed.searchParams.get('connection_limit')).toBe('10');
                expect(parsed.searchParams.get('pool_timeout')).toBe('20');
                expect(parsed.searchParams.get('connect_timeout')).toBe('10');
            });

            it('does NOT overwrite custom connection pool parameters already specified in URL', () => {
                const raw = 'mysql://user:pass@127.0.0.1:3306/db?connection_limit=32&pool_timeout=60&connect_timeout=15';
                const sanitized = getSanitizedDatabaseUrl(raw);
                const parsed = new URL(sanitized);

                expect(parsed.searchParams.get('connection_limit')).toBe('32');
                expect(parsed.searchParams.get('pool_timeout')).toBe('60');
                expect(parsed.searchParams.get('connect_timeout')).toBe('15');
            });

            it('preserves one custom parameter while setting missing ones', () => {
                const raw = 'mysql://user:pass@127.0.0.1:3306/db?connection_limit=40';
                const sanitized = getSanitizedDatabaseUrl(raw);
                const parsed = new URL(sanitized);

                expect(parsed.searchParams.get('connection_limit')).toBe('40');
                expect(parsed.searchParams.get('pool_timeout')).toBe('20');
                expect(parsed.searchParams.get('connect_timeout')).toBe('10');
            });

            it('respects environment variable overrides DB_CONNECTION_LIMIT, DB_POOL_TIMEOUT, DB_CONNECT_TIMEOUT', () => {
                process.env.DB_CONNECTION_LIMIT = '25';
                process.env.DB_POOL_TIMEOUT = '45';
                process.env.DB_CONNECT_TIMEOUT = '15';

                const raw = 'mysql://user:pass@127.0.0.1:3306/db';
                const sanitized = getSanitizedDatabaseUrl(raw);
                const parsed = new URL(sanitized);

                expect(parsed.searchParams.get('connection_limit')).toBe('25');
                expect(parsed.searchParams.get('pool_timeout')).toBe('45');
                expect(parsed.searchParams.get('connect_timeout')).toBe('15');
            });

            it('gracefully handles null, undefined, empty string, and malformed strings', () => {
                expect(getSanitizedDatabaseUrl(null)).toBeNull();
                expect(getSanitizedDatabaseUrl(undefined)).toBeUndefined();
                expect(getSanitizedDatabaseUrl('')).toBe('');
                expect(getSanitizedDatabaseUrl('malformed-uri://&&--')).toBe('malformed-uri://&&--');
            });
        });

        describe('executeTransactionWithRetry Simulation & Stress Testing', () => {
            let originalTransaction;

            beforeEach(() => {
                originalTransaction = require('../src/config/database').prisma.$transaction;
            });

            afterEach(() => {
                require('../src/config/database').prisma.$transaction = originalTransaction;
            });

            it('succeeds on first attempt without retrying when no error occurs', async () => {
                let callCount = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    callCount++;
                    return fn({});
                });

                const mockWork = jest.fn(async (tx) => ({ done: true, balance: 100 }));
                const result = await executeTransactionWithRetry(mockWork, 3);

                expect(result).toEqual({ done: true, balance: 100 });
                expect(callCount).toBe(1);
                expect(mockWork).toHaveBeenCalledTimes(1);
            });

            it('retries and recovers from Prisma P2034 transaction conflict', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    attempts++;
                    if (attempts === 1) {
                        const err = new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction');
                        err.code = 'P2034';
                        throw err;
                    }
                    return fn({});
                });

                const mockWork = jest.fn(async (tx) => 'recovered');
                const result = await executeTransactionWithRetry(mockWork, 3);

                expect(result).toBe('recovered');
                expect(attempts).toBe(2);
            });

            it('retries and recovers from Prisma P2028 transaction timeout', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    attempts++;
                    if (attempts <= 2) {
                        const err = new Error('Transaction API error: Transaction already closed: Transaction is no longer valid');
                        err.code = 'P2028';
                        throw err;
                    }
                    return fn({});
                });

                const mockWork = jest.fn(async (tx) => 'timeout-recovered');
                const result = await executeTransactionWithRetry(mockWork, 3);

                expect(result).toBe('timeout-recovered');
                expect(attempts).toBe(3);
            });

            it('retries and recovers from MySQL ER_LOCK_DEADLOCK 1213 error message', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    attempts++;
                    if (attempts === 1) {
                        throw new Error('Raw MySQL error: 1213: ER_LOCK_DEADLOCK: Deadlock found when trying to get lock');
                    }
                    return fn({});
                });

                const mockWork = jest.fn(async () => 'deadlock-cleared');
                const result = await executeTransactionWithRetry(mockWork, 3);

                expect(result).toBe('deadlock-cleared');
                expect(attempts).toBe(2);
            });

            it('retries and recovers from MySQL Lock wait timeout exceeded (1205) error message', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    attempts++;
                    if (attempts === 1) {
                        throw new Error('Lock wait timeout exceeded; try restarting transaction (errno 1205)');
                    }
                    return fn({});
                });

                const mockWork = jest.fn(async () => 'lock-wait-cleared');
                const result = await executeTransactionWithRetry(mockWork, 3);

                expect(result).toBe('lock-wait-cleared');
                expect(attempts).toBe(2);
            });

            it('exhausts maxRetries when deadlocks persist and throws the final error', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async () => {
                    attempts++;
                    const err = new Error(`Persistent deadlock attempt ${attempts}`);
                    err.code = 'P2034';
                    throw err;
                });

                const mockWork = jest.fn();
                await expect(executeTransactionWithRetry(mockWork, 3))
                    .rejects.toThrow('Persistent deadlock attempt 3');

                expect(attempts).toBe(3);
            });

            it('fails immediately WITHOUT retrying on non-transient errors (e.g. P2002 unique constraint)', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async () => {
                    attempts++;
                    const err = new Error('Unique constraint failed on the fields: (`trackingNumber`)');
                    err.code = 'P2002';
                    throw err;
                });

                const mockWork = jest.fn();
                await expect(executeTransactionWithRetry(mockWork, 3))
                    .rejects.toThrow('Unique constraint failed');

                expect(attempts).toBe(1); // Crucial: did NOT retry
            });

            it('fails immediately on business logic / validation errors thrown inside the transaction function', async () => {
                let attempts = 0;
                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    attempts++;
                    return fn({});
                });

                const businessLogicFailure = jest.fn(async () => {
                    throw new Error('Insufficient funds: account balance cannot be negative');
                });

                await expect(executeTransactionWithRetry(businessLogicFailure, 3))
                    .rejects.toThrow('Insufficient funds');

                expect(attempts).toBe(1); // Must not retry on validation error
            });

            it('verifies exponential backoff introduces delay on retries', async () => {
                let attempts = 0;
                const timestamps = [];

                require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => {
                    attempts++;
                    timestamps.push(Date.now());
                    if (attempts < 3) {
                        const err = new Error('ER_LOCK_DEADLOCK 1213');
                        err.code = 'P2034';
                        throw err;
                    }
                    return fn({});
                });

                await executeTransactionWithRetry(async () => 'ok', 3);

                expect(timestamps.length).toBe(3);
                // Attempt 1 -> Attempt 2 had backoff >= 50ms
                const delta1 = timestamps[1] - timestamps[0];
                expect(delta1).toBeGreaterThanOrEqual(40); // small tolerance for timer tick

                // Attempt 2 -> Attempt 3 had backoff >= 50ms
                const delta2 = timestamps[2] - timestamps[1];
                expect(delta2).toBeGreaterThanOrEqual(40);
            });

            it('passes options { maxWait, timeout } properly to prisma.$transaction', async () => {
                const mockTx = jest.fn(async (fn, opts) => {
                    expect(opts).toEqual({ maxWait: 8000, timeout: 20000 });
                    return fn({});
                });
                require('../src/config/database').prisma.$transaction = mockTx;

                await executeTransactionWithRetry(async () => 'ok', 3, { maxWait: 8000, timeout: 20000 });
                expect(mockTx).toHaveBeenCalled();
            });
        });
    });
});
