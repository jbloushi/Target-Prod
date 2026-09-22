const crypto = require('crypto');
const logger = require('../../utils/logger');
let prismaClient;

try {
    const db = require('../../config/database');
    prismaClient = db.prisma;
} catch (e) {
    prismaClient = null;
}

class JobQueue {
    constructor(options = {}) {
        this.workers = new Map();
        this.inMemoryJobs = new Map();
        this.isRunning = false;
        this.pollIntervalMs = 1500;
        this.pollTimer = null;
        this.dbTableVerified = false;
        this.isProcessing = false;
        this.forceInMemory = options.inMemoryOnly ?? (process.env.NODE_ENV === 'test');
    }

    /**
     * Set explicit prisma client (useful for mocking/testing)
     */
    setPrismaClient(client) {
        prismaClient = client;
        if (client) {
            this.forceInMemory = false;
        }
    }

    /**
     * Initializes the MySQL _background_jobs table if it does not exist.
     */
    async ensureTableExists() {
        if (this.forceInMemory) return false;
        if (this.dbTableVerified) return true;
        if (!prismaClient || typeof prismaClient.$executeRawUnsafe !== 'function') {
            return false;
        }

        try {
            await prismaClient.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS \`_background_jobs\` (
                    \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
                    \`queue_name\` VARCHAR(100) NOT NULL,
                    \`payload\` JSON NOT NULL,
                    \`status\` VARCHAR(32) NOT NULL DEFAULT 'pending',
                    \`attempts\` INT NOT NULL DEFAULT 0,
                    \`max_retries\` INT NOT NULL DEFAULT 5,
                    \`backoff_ms\` INT NOT NULL DEFAULT 10000,
                    \`next_run_at\` DATETIME NOT NULL,
                    \`last_error\` TEXT NULL,
                    \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX \`idx_queue_status_run\` (\`queue_name\`, \`status\`, \`next_run_at\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
            this.dbTableVerified = true;
            return true;
        } catch (error) {
            logger.debug(`[jobQueue] Database table check fallback to in-memory: ${error.message}`);
            return false;
        }
    }

    /**
     * Enqueue a job into the queue
     * @param {string} queueName - Name of the queue (e.g. 'carrier_dispatch', 'chatwoot_notify', 'webhook_delivery')
     * @param {Object} payload - Data needed for job processing
     * @param {Object} [options]
     * @param {number} [options.maxRetries=5]
     * @param {number} [options.backoffMs=10000]
     * @param {number} [options.delayMs=0]
     * @returns {Promise<Object>} Job details with jobId
     */
    async enqueue(queueName, payload, options = {}) {
        const jobId = options.jobId || crypto.randomUUID();
        const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 5;
        const backoffMs = Number.isInteger(options.backoffMs) ? options.backoffMs : 10000;
        const delayMs = Number.isInteger(options.delayMs) ? options.delayMs : 0;
        const nextRunAt = new Date(Date.now() + delayMs);
        const createdAt = new Date();

        const canUseDb = await this.ensureTableExists();

        if (canUseDb) {
            try {
                const payloadJson = JSON.stringify(payload || {});
                const nextRunStr = nextRunAt.toISOString().slice(0, 19).replace('T', ' ');

                await prismaClient.$executeRawUnsafe(
                    `INSERT INTO \`_background_jobs\` 
                     (\`id\`, \`queue_name\`, \`payload\`, \`status\`, \`attempts\`, \`max_retries\`, \`backoff_ms\`, \`next_run_at\`, \`created_at\`, \`updated_at\`)
                     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, NOW(), NOW())`,
                    jobId,
                    queueName,
                    payloadJson,
                    maxRetries,
                    backoffMs,
                    nextRunStr
                );

                logger.debug(`[jobQueue] Enqueued job ${jobId} to DB queue ${queueName}`);
                if (this.isRunning) {
                    setImmediate(() => this.processPendingJobs());
                }
                return { jobId, queueName, status: 'pending', createdAt, nextRunAt };
            } catch (err) {
                logger.warn(`[jobQueue] DB enqueue failed, falling back to memory for job ${jobId}: ${err.message}`);
            }
        }

        // In-memory fallback
        const jobRecord = {
            id: jobId,
            queue_name: queueName,
            payload,
            status: 'pending',
            attempts: 0,
            max_retries: maxRetries,
            backoff_ms: backoffMs,
            next_run_at: nextRunAt,
            last_error: null,
            created_at: createdAt,
            updated_at: createdAt
        };
        this.inMemoryJobs.set(jobId, jobRecord);
        logger.debug(`[jobQueue] Enqueued job ${jobId} to in-memory queue ${queueName}`);

        if (this.isRunning) {
            setImmediate(() => this.processPendingJobs());
        }
        return { jobId, queueName, status: 'pending', createdAt, nextRunAt };
    }

    /**
     * Register a worker function for a specific queue
     * @param {string} queueName
     * @param {Function} handler - async (payload, jobContext) => Promise<any>
     */
    registerWorker(queueName, handler) {
        this.workers.set(queueName, handler);
        logger.info(`[jobQueue] Registered worker for queue: ${queueName}`);
    }

    /**
     * Get status of a job
     */
    async getJobStatus(jobId) {
        const canUseDb = await this.ensureTableExists();
        if (canUseDb) {
            try {
                const rows = await prismaClient.$queryRawUnsafe(
                    `SELECT id, queue_name, status, attempts, max_retries, backoff_ms, next_run_at, last_error, created_at, updated_at 
                     FROM \`_background_jobs\` WHERE id = ? LIMIT 1`,
                    jobId
                );
                if (Array.isArray(rows) && rows.length > 0) {
                    return rows[0];
                }
            } catch (e) {
                logger.debug(`[jobQueue] DB getJobStatus query failed: ${e.message}`);
            }
        }

        const memJob = this.inMemoryJobs.get(jobId);
        if (memJob) {
            return {
                id: memJob.id,
                queue_name: memJob.queue_name,
                status: memJob.status,
                attempts: memJob.attempts,
                max_retries: memJob.max_retries,
                backoff_ms: memJob.backoff_ms,
                next_run_at: memJob.next_run_at,
                last_error: memJob.last_error,
                created_at: memJob.created_at,
                updated_at: memJob.updated_at
            };
        }

        return null;
    }

    /**
     * Start background worker polling loop
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('[jobQueue] Background job processor started');

        this.pollTimer = setInterval(() => {
            this.processPendingJobs().catch(err => {
                logger.error(`[jobQueue] Error in processing cycle: ${err.message}`);
            });
        }, this.pollIntervalMs);

        // Ensure pollTimer does not prevent Node process exit
        if (this.pollTimer && typeof this.pollTimer.unref === 'function') {
            this.pollTimer.unref();
        }
    }

    /**
     * Stop background worker polling loop
     */
    stop() {
        this.isRunning = false;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        logger.info('[jobQueue] Background job processor stopped');
    }

    /**
     * Main execution pass to fetch and execute pending jobs
     */
    async processPendingJobs() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            await this._processDbJobs();
            await this._processMemoryJobs();
        } finally {
            this.isProcessing = false;
        }
    }

    async _processDbJobs() {
        const canUseDb = await this.ensureTableExists();
        if (!canUseDb) return;

        try {
            // Lock and fetch up to 5 pending jobs that are ready to run
            const jobs = await prismaClient.$transaction(async (tx) => {
                const candidates = await tx.$queryRawUnsafe(`
                    SELECT id, queue_name, payload, attempts, max_retries, backoff_ms
                    FROM \`_background_jobs\`
                    WHERE status = 'pending' AND next_run_at <= NOW()
                    ORDER BY next_run_at ASC
                    LIMIT 5
                    FOR UPDATE SKIP LOCKED
                `);

                if (!Array.isArray(candidates) || candidates.length === 0) {
                    return [];
                }

                const ids = candidates.map(c => `'${c.id}'`).join(',');
                await tx.$executeRawUnsafe(`
                    UPDATE \`_background_jobs\`
                    SET status = 'processing', updated_at = NOW()
                    WHERE id IN (${ids})
                `);

                return candidates;
            }, { maxWait: 4000, timeout: 10000 });

            for (const job of jobs) {
                await this._executeJob(job, true);
            }
        } catch (err) {
            logger.debug(`[jobQueue] DB job polling cycle skipped: ${err.message}`);
        }
    }

    async _processMemoryJobs() {
        const now = new Date();
        const pendingJobs = [];

        for (const job of this.inMemoryJobs.values()) {
            if (job.status === 'pending' && new Date(job.next_run_at) <= now) {
                job.status = 'processing';
                job.updated_at = new Date();
                pendingJobs.push(job);
            }
        }

        for (const job of pendingJobs) {
            await this._executeJob(job, false);
        }
    }

    async _executeJob(job, isDbJob) {
        const worker = this.workers.get(job.queue_name);
        const attempts = (job.attempts || 0) + 1;
        const maxRetries = job.max_retries || 5;
        const backoffMs = job.backoff_ms || 10000;

        let payload = job.payload;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch (_) {}
        }

        if (!worker) {
            logger.warn(`[jobQueue] No worker registered for queue: ${job.queue_name}`);
            if (attempts >= maxRetries) {
                await this._updateJobStatus(job.id, isDbJob, {
                    status: 'failed',
                    attempts,
                    nextRunAt: null,
                    lastError: `No worker registered for queue: ${job.queue_name}`
                });
            } else {
                await this._updateJobStatus(job.id, isDbJob, {
                    status: 'pending',
                    attempts,
                    nextRunAt: new Date(Date.now() + 60000),
                    lastError: `No worker registered for queue: ${job.queue_name}`
                });
            }
            return;
        }

        try {
            logger.debug(`[jobQueue] Executing job ${job.id} on queue ${job.queue_name} (attempt ${attempts}/${maxRetries})`);
            await worker(payload, { jobId: job.id, attempts, queueName: job.queue_name });
            
            // Success
            await this._updateJobStatus(job.id, isDbJob, {
                status: 'completed',
                attempts,
                nextRunAt: null,
                lastError: null
            });
            logger.info(`[jobQueue] Job ${job.id} completed successfully on ${job.queue_name}`);
        } catch (error) {
            logger.error(`[jobQueue] Job ${job.id} failed on ${job.queue_name}: ${error.message}`);
            
            if (attempts >= maxRetries) {
                // Permanent failure
                await this._updateJobStatus(job.id, isDbJob, {
                    status: 'failed',
                    attempts,
                    nextRunAt: null,
                    lastError: error.message
                });
                logger.error(`[jobQueue] Job ${job.id} reached max retries (${maxRetries}). Marked as failed.`);
            } else {
                // Exponential backoff retry
                const backoffDelay = Math.floor(backoffMs * Math.pow(2, attempts - 1)) + Math.floor(Math.random() * 500);
                const nextRunAt = new Date(Date.now() + backoffDelay);
                
                await this._updateJobStatus(job.id, isDbJob, {
                    status: 'pending',
                    attempts,
                    nextRunAt,
                    lastError: error.message
                });
                logger.warn(`[jobQueue] Job ${job.id} rescheduled for attempt ${attempts + 1} at ${nextRunAt.toISOString()} (delay ${backoffDelay}ms)`);
            }
        }
    }

    async _updateJobStatus(jobId, isDbJob, { status, attempts, nextRunAt, lastError }) {
        if (isDbJob && prismaClient && typeof prismaClient.$executeRawUnsafe === 'function') {
            try {
                const nextRunStr = nextRunAt ? nextRunAt.toISOString().slice(0, 19).replace('T', ' ') : null;
                await prismaClient.$executeRawUnsafe(
                    `UPDATE \`_background_jobs\`
                     SET status = ?, attempts = ?, next_run_at = COALESCE(?, next_run_at), last_error = ?, updated_at = NOW()
                     WHERE id = ?`,
                    status,
                    attempts,
                    nextRunStr,
                    lastError || null,
                    jobId
                );
                return;
            } catch (err) {
                logger.warn(`[jobQueue] Failed to update DB job status for ${jobId}: ${err.message}`);
            }
        }

        const memJob = this.inMemoryJobs.get(jobId);
        if (memJob) {
            memJob.status = status;
            memJob.attempts = attempts;
            memJob.next_run_at = nextRunAt;
            memJob.last_error = lastError;
            memJob.updated_at = new Date();
            if (status === 'completed' || status === 'failed') {
                // Keep completed/failed memory jobs for 10 minutes then prune
                setTimeout(() => this.inMemoryJobs.delete(jobId), 10 * 60 * 1000).unref?.();
            }
        }
    }
}

const defaultQueue = new JobQueue();
module.exports = defaultQueue;
module.exports.JobQueue = JobQueue;
