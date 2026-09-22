const { getSanitizedDatabaseUrl } = require('../src/config/database');
const { validateEnv, formatDiagnosticTable } = require('../src/config/envValidator');
const { JobQueue } = require('../src/services/queue/jobQueue');
const { isTrackingSyncDue, markTrackingSynced, clearCache } = require('../src/services/queue/trackingCache');
const { executeTransactionWithRetry } = require('../src/services/financeLedger.service');

describe('Milestone 1 - Infrastructure & Operational Hardening', () => {

    describe('F1: Database Connection Pooling & URL Sanitization', () => {
        it('appends connection_limit=10, pool_timeout=20, connect_timeout=10 to DATABASE_URL', () => {
            const raw = 'mysql://user:pass@127.0.0.1:3306/target_logistics';
            const sanitized = getSanitizedDatabaseUrl(raw);
            const url = new URL(sanitized);

            expect(url.searchParams.get('connection_limit')).toBe('10');
            expect(url.searchParams.get('pool_timeout')).toBe('20');
            expect(url.searchParams.get('connect_timeout')).toBe('10');
        });

        it('preserves existing connection pool parameters if already set in DATABASE_URL', () => {
            const raw = 'mysql://user:pass@127.0.0.1:3306/target_logistics?connection_limit=25&pool_timeout=45';
            const sanitized = getSanitizedDatabaseUrl(raw);
            const url = new URL(sanitized);

            expect(url.searchParams.get('connection_limit')).toBe('25');
            expect(url.searchParams.get('pool_timeout')).toBe('45');
            expect(url.searchParams.get('connect_timeout')).toBe('10');
        });

        it('returns raw URL gracefully if format is invalid', () => {
            expect(getSanitizedDatabaseUrl('invalid-url')).toBe('invalid-url');
            expect(getSanitizedDatabaseUrl(null)).toBe(null);
        });

        it('executeTransactionWithRetry retries on transient deadlock and succeeds', async () => {
            let attempts = 0;
            const mockTxFn = jest.fn(async () => {
                attempts++;
                if (attempts < 2) {
                    const deadlockError = new Error('ER_LOCK_DEADLOCK: Deadlock found when trying to get lock; try restarting transaction');
                    deadlockError.code = 'P2034';
                    throw deadlockError;
                }
                return { success: true, attempts };
            });

            // Mock prisma.$transaction for test
            const originalTransaction = require('../src/config/database').prisma.$transaction;
            require('../src/config/database').prisma.$transaction = jest.fn(async (fn) => fn({}));

            try {
                const result = await executeTransactionWithRetry(mockTxFn, 3);
                expect(result.success).toBe(true);
                expect(attempts).toBe(2);
            } finally {
                require('../src/config/database').prisma.$transaction = originalTransaction;
            }
        });
    });

    describe('F2: Tracking Cache & Decoupling TTL', () => {
        beforeEach(() => {
            clearCache();
        });

        it('identifies terminal shipments (delivered, cancelled, returned) as not due for tracking sync', () => {
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-1', status: 'delivered', carrierCode: 'DGR' })).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-2', status: 'cancelled', carrierCode: 'DGR' })).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-3', status: 'returned', carrierCode: 'DGR' })).toBe(false);
        });

        it('identifies draft or non-carrier shipments as not due for external tracking sync', () => {
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-4', status: 'draft', carrierCode: 'DGR' })).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-5', status: 'transit', carrierCode: 'MANUAL' })).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-6', status: 'transit', carrierCode: 'INTERNAL' })).toBe(false);
        });

        it('identifies in-transit carrier shipments as due on first check, then caches within TTL', () => {
            const shipment = { trackingNumber: 'TRK-DGR-100', status: 'transit', carrierCode: 'DGR' };
            
            // First check: not in cache -> due
            expect(isTrackingSyncDue(shipment, 10000)).toBe(true);

            // Mark synced
            markTrackingSynced('TRK-DGR-100');

            // Second check: within TTL -> not due
            expect(isTrackingSyncDue(shipment, 10000)).toBe(false);
        });
    });

    describe('F3: Durable Job Queue with Retries & Exponential Backoff', () => {
        it('enqueues and processes a job with a registered worker', async () => {
            const queue = new JobQueue();
            const processedJobs = [];

            queue.registerWorker('test_queue', async (payload, context) => {
                processedJobs.push({ payload, context });
                return { ok: true };
            });

            const job = await queue.enqueue('test_queue', { orderId: 12345 });
            expect(job.jobId).toBeDefined();
            expect(job.queueName).toBe('test_queue');

            await queue.processPendingJobs();

            expect(processedJobs.length).toBe(1);
            expect(processedJobs[0].payload.orderId).toBe(12345);

            const status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('completed');
        });

        it('retries with exponential backoff on transient failure and marks failed on max retries', async () => {
            const queue = new JobQueue();
            let attempts = 0;

            queue.registerWorker('failing_queue', async () => {
                attempts++;
                throw new Error('Remote carrier service unavailable (503)');
            });

            const job = await queue.enqueue('failing_queue', { data: 'test' }, { maxRetries: 2, backoffMs: 50 });

            // First attempt: should fail and reschedule
            await queue.processPendingJobs();
            expect(attempts).toBe(1);

            let status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(1);

            // Manually advance next_run_at in memory for test
            const memJob = queue.inMemoryJobs.get(job.jobId);
            if (memJob) memJob.next_run_at = new Date(Date.now() - 1000);

            // Second attempt: hits max retries -> marks failed
            await queue.processPendingJobs();
            expect(attempts).toBe(2);

            status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('failed');
            expect(status.last_error).toContain('503');
        });
    });

    describe('F4: Fail-Fast Environment Validation', () => {
        let savedEnv;

        beforeEach(() => {
            savedEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = savedEnv;
        });

        it('passes validation when all required production environment variables are correct', () => {
            process.env.NODE_ENV = 'production';
            process.env.DATABASE_URL = 'mysql://u:p@127.0.0.1:3306/target_prod';
            process.env.JWT_SECRET = 'a'.repeat(64);
            process.env.API_KEY_SECRET = 'secret-32-chars-long-api-key-test';
            process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            process.env.CORS_ORIGIN = 'https://app.target-logistics.com';

            const result = validateEnv({ exitOnError: false });
            expect(result.isValid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        it('fails validation when DATABASE_URL is not a mysql:// URI', () => {
            process.env.NODE_ENV = 'development';
            process.env.DATABASE_URL = 'postgres://u:p@host/db';

            expect(() => validateEnv({ exitOnError: false })).toThrow(/DATABASE_URL/);
        });

        it('fails validation in production when ENCRYPTION_KEY is not a 64-hex character string', () => {
            process.env.NODE_ENV = 'production';
            process.env.DATABASE_URL = 'mysql://u:p@127.0.0.1:3306/db';
            process.env.JWT_SECRET = 'a'.repeat(64);
            process.env.API_KEY_SECRET = 'secret';
            process.env.ENCRYPTION_KEY = 'not-a-64-hex-char-key';
            process.env.CORS_ORIGIN = 'https://app.example.com';

            expect(() => validateEnv({ exitOnError: false })).toThrow(/ENCRYPTION_KEY/);
        });

        it('formats a clean diagnostic ASCII error table', () => {
            const table = formatDiagnosticTable([
                { field: 'DATABASE_URL', reason: 'Must be a valid MySQL connection URI' },
                { field: 'ENCRYPTION_KEY', reason: 'Must be a 64-character hex string' }
            ]);

            expect(table).toContain('[CONFIG VALIDATION ERROR] Server failed to bootstrap');
            expect(table).toContain('DATABASE_URL');
            expect(table).toContain('ENCRYPTION_KEY');
            expect(table).toContain('Remediation:');
        });
    });
});
