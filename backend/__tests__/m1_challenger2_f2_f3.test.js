/**
 * Milestone 1 Challenger 2 Empirical Test Suite
 * Stress-testing & Adversarial Verification of:
 * 1. Async Carrier Dispatch & Tracking Decoupling (F2)
 *    - bookWithCarrier response semantics (202 async default vs 200 sync=false)
 *    - Tracking TTL cache behavior & non-blocking read decoupling
 * 2. Durable Job Queue & Webhook/Chatwoot Retries (F3)
 *    - JobQueue enqueue, worker execution, exponential backoff calculation
 *    - Error handling, terminal retry failure, recovery on retry
 *    - WebhookDispatcher and Chatwoot notification queue behavior
 */

const { JobQueue } = require('../src/services/queue/jobQueue');
const {
    isTrackingSyncDue,
    markTrackingSynced,
    triggerBackgroundTrackingSync,
    clearCache
} = require('../src/services/queue/trackingCache');
const shipmentBookingController = require('../src/controllers/shipment-booking.controller');
const shipmentPublicController = require('../src/controllers/shipment-public.controller');
const ShipmentBookingService = require('../src/services/ShipmentBookingService');
const WebhookDispatcher = require('../src/services/WebhookDispatcher');
const chatwootNotificationService = require('../src/services/chatwootNotificationService');
const CarrierFactory = require('../src/services/CarrierFactory');
const { prisma } = require('../src/config/database');

describe('Milestone 1 Challenger 2: F2 & F3 Empirical Stress Suite', () => {

    // =========================================================================
    // SECTION 1: Async Carrier Dispatch Response Semantics (F2)
    // =========================================================================
    describe('F2: Async Carrier Dispatch (bookWithCarrier)', () => {
        let mockShipment;
        let originalFindUnique;
        let originalUpdate;
        let originalBookShipment;
        let originalBookShipmentAsync;

        beforeEach(() => {
            mockShipment = {
                id: 'ship-100',
                trackingNumber: 'TRK-ASYNC-TEST-001',
                carrierCode: 'DGR',
                status: 'ready_for_pickup',
                price: 15.000,
                userId: 'user-001',
                organizationId: 'org-001',
                pricingSnapshot: {
                    expiresAt: new Date(Date.now() + 3600000).toISOString(),
                    totalPrice: 15.000,
                    currency: 'KWD'
                },
                bookingAttempts: []
            };

            originalFindUnique = prisma.shipment.findUnique;
            originalUpdate = prisma.shipment.update;
            originalBookShipment = ShipmentBookingService.bookShipment;
            originalBookShipmentAsync = ShipmentBookingService.bookShipmentAsync;

            prisma.shipment.update = jest.fn().mockResolvedValue(mockShipment);
        });

        afterEach(() => {
            prisma.shipment.findUnique = originalFindUnique;
            prisma.shipment.update = originalUpdate;
            ShipmentBookingService.bookShipment = originalBookShipment;
            ShipmentBookingService.bookShipmentAsync = originalBookShipmentAsync;
        });

        it('returns HTTP 202 Accepted by default when no async parameter is provided', async () => {
            prisma.shipment.findUnique = jest.fn().mockResolvedValue(mockShipment);
            ShipmentBookingService.bookShipmentAsync = jest.fn().mockResolvedValue({
                success: true,
                status: 'processing',
                jobId: 'job-uuid-1234',
                trackingNumber: 'TRK-ASYNC-TEST-001',
                carrierCode: 'DGR',
                message: 'Carrier booking initiated in background'
            });
            ShipmentBookingService.bookShipment = jest.fn();

            const req = {
                params: { trackingNumber: 'TRK-ASYNC-TEST-001' },
                query: {},
                body: { carrierCode: 'DGR' },
                user: { id: 'user-001', role: 'admin' }
            };

            const jsonMock = jest.fn();
            const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
            const res = { status: statusMock };

            await shipmentBookingController.bookWithCarrier(req, res);

            // Assertions
            expect(statusMock).toHaveBeenCalledWith(202);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                status: 'processing',
                data: expect.objectContaining({
                    jobId: 'job-uuid-1234',
                    trackingNumber: 'TRK-ASYNC-TEST-001',
                    carrierCode: 'DGR'
                }),
                message: 'Carrier booking initiated in background'
            }));

            // Crucial: bookShipmentAsync was called, synchronous bookShipment was NOT called
            expect(ShipmentBookingService.bookShipmentAsync).toHaveBeenCalledTimes(1);
            expect(ShipmentBookingService.bookShipment).not.toHaveBeenCalled();
        });

        it('returns HTTP 200 OK when async=false is passed as query parameter', async () => {
            prisma.shipment.findUnique = jest.fn().mockResolvedValue(mockShipment);
            ShipmentBookingService.bookShipment = jest.fn().mockResolvedValue({
                success: true,
                shipment: { ...mockShipment, status: 'booked', dhlConfirmed: true }
            });
            ShipmentBookingService.bookShipmentAsync = jest.fn();

            const req = {
                params: { trackingNumber: 'TRK-ASYNC-TEST-001' },
                query: { async: 'false' },
                body: { carrierCode: 'DGR' },
                user: { id: 'user-001', role: 'admin' }
            };

            const jsonMock = jest.fn();
            const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
            const res = { status: statusMock };

            await shipmentBookingController.bookWithCarrier(req, res);

            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    success: true,
                    shipment: expect.objectContaining({ status: 'booked' })
                }),
                message: expect.stringContaining('successfully booked')
            }));

            // bookShipment was called, bookShipmentAsync was NOT called
            expect(ShipmentBookingService.bookShipment).toHaveBeenCalledTimes(1);
            expect(ShipmentBookingService.bookShipmentAsync).not.toHaveBeenCalled();
        });

        it('returns HTTP 200 OK when async: false is passed in JSON body', async () => {
            prisma.shipment.findUnique = jest.fn().mockResolvedValue(mockShipment);
            ShipmentBookingService.bookShipment = jest.fn().mockResolvedValue({
                success: true,
                shipment: { ...mockShipment, status: 'booked' }
            });
            ShipmentBookingService.bookShipmentAsync = jest.fn();

            const req = {
                params: { trackingNumber: 'TRK-ASYNC-TEST-001' },
                query: {},
                body: { carrierCode: 'DGR', async: false },
                user: { id: 'user-001', role: 'admin' }
            };

            const jsonMock = jest.fn();
            const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
            const res = { status: statusMock };

            await shipmentBookingController.bookWithCarrier(req, res);

            expect(statusMock).toHaveBeenCalledWith(200);
            expect(ShipmentBookingService.bookShipment).toHaveBeenCalledTimes(1);
            expect(ShipmentBookingService.bookShipmentAsync).not.toHaveBeenCalled();
        });

        it('returns HTTP 404 when shipment does not exist', async () => {
            prisma.shipment.findUnique = jest.fn().mockResolvedValue(null);

            const req = {
                params: { trackingNumber: 'NON_EXISTENT' },
                query: {},
                body: {},
                user: { id: 'user-001', role: 'admin' }
            };

            const jsonMock = jest.fn();
            const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
            const res = { status: statusMock };

            await shipmentBookingController.bookWithCarrier(req, res);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: 'Shipment not found'
            }));
        });

        it('prevents concurrent double-booking in _prepareBooking within 60s cooldown', async () => {
            const now = new Date();
            const activePendingAttempt = {
                attemptId: 'attempt-active',
                status: 'pending',
                createdAt: new Date(now.getTime() - 10000) // 10s ago (< 60s)
            };

            const lockedShipment = {
                ...mockShipment,
                bookingAttempts: [activePendingAttempt]
            };

            prisma.shipment.findUnique = jest.fn().mockResolvedValue(lockedShipment);

            await expect(
                ShipmentBookingService._prepareBooking('TRK-ASYNC-TEST-001', 'DGR', [], 'admin')
            ).rejects.toThrow('A booking request is currently being processed by the carrier');
        });

        it('handles already-booked shipment in bookShipmentAsync idempotently', async () => {
            const succeededAttempt = {
                attemptId: 'attempt-succeeded',
                status: 'succeeded',
                createdAt: new Date(Date.now() - 100000)
            };

            const bookedShipment = {
                ...mockShipment,
                status: 'booked',
                bookingAttempts: [succeededAttempt]
            };

            prisma.shipment.findUnique = jest.fn().mockResolvedValue(bookedShipment);

            const result = await ShipmentBookingService.bookShipmentAsync('TRK-ASYNC-TEST-001', 'DGR', [], 'admin');

            expect(result.success).toBe(true);
            expect(result.status).toBe('succeeded');
            expect(result.message).toBe('Shipment already booked.');
            expect(result.jobId).toBe('attempt-succeeded');
        });
    });

    // =========================================================================
    // SECTION 2: Tracking TTL Cache & Decoupling (F2)
    // =========================================================================
    describe('F2: Tracking TTL Cache & Non-blocking Read Decoupling', () => {
        beforeEach(() => {
            clearCache();
            delete process.env.TRACKING_CACHE_TTL_MS;
        });

        afterEach(() => {
            clearCache();
            delete process.env.TRACKING_CACHE_TTL_MS;
        });

        it('isTrackingSyncDue returns true on first check, false within TTL, and true after TTL expiration', () => {
            const shipment = { trackingNumber: 'TRK-TTL-001', status: 'in_transit', carrierCode: 'DGR' };
            const ttlMs = 5000; // 5 seconds

            // 1. Initial check (cold cache): must be due
            expect(isTrackingSyncDue(shipment, ttlMs)).toBe(true);

            // 2. Mark synced: should be cached
            markTrackingSynced('TRK-TTL-001');
            expect(isTrackingSyncDue(shipment, ttlMs)).toBe(false);

            // 3. Fast-forward cache timestamp to simulate expiration beyond TTL
            const originalDateNow = Date.now;
            try {
                Date.now = () => originalDateNow() + 6000; // 6 seconds later (> 5000ms TTL)
                expect(isTrackingSyncDue(shipment, ttlMs)).toBe(true);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it('isTrackingSyncDue respects TRACKING_CACHE_TTL_MS environment variable', () => {
            process.env.TRACKING_CACHE_TTL_MS = '60000'; // 60s
            const shipment = { trackingNumber: 'TRK-ENV-TTL', status: 'in_transit', carrierCode: 'DGR' };

            expect(isTrackingSyncDue(shipment)).toBe(true);
            markTrackingSynced('TRK-ENV-TTL');

            // 30s elapsed: still within 60s TTL
            const originalDateNow = Date.now;
            try {
                Date.now = () => originalDateNow() + 30000;
                expect(isTrackingSyncDue(shipment)).toBe(false);

                // 65s elapsed: exceeded 60s TTL
                Date.now = () => originalDateNow() + 65000;
                expect(isTrackingSyncDue(shipment)).toBe(true);
            } finally {
                Date.now = originalDateNow;
            }
        });

        it('never considers terminal status shipments due for sync regardless of TTL', () => {
            const statuses = ['delivered', 'cancelled', 'returned', 'rejected', 'DELIVERED', 'Cancelled'];
            for (const status of statuses) {
                const shipment = { trackingNumber: `TRK-${status}`, status, carrierCode: 'DGR' };
                expect(isTrackingSyncDue(shipment, 1000)).toBe(false);
            }
        });

        it('never considers non-carrier or draft shipments due for sync', () => {
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-DRAFT', status: 'draft', carrierCode: 'DGR' })).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-MANUAL', status: 'in_transit', carrierCode: 'MANUAL' })).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: 'TRK-INTERNAL', status: 'in_transit', carrierCode: 'INTERNAL' })).toBe(false);
        });

        it('handles null, undefined, or missing tracking numbers gracefully', () => {
            expect(isTrackingSyncDue(null)).toBe(false);
            expect(isTrackingSyncDue(undefined)).toBe(false);
            expect(isTrackingSyncDue({})).toBe(false);
            expect(isTrackingSyncDue({ trackingNumber: '' })).toBe(false);
        });

        it('triggerBackgroundTrackingSync prevents thundering herd with duplicate in-flight requests', (done) => {
            const shipment = { id: 'ship-thundering', trackingNumber: 'TRK-HERD-001' };
            let syncExecutionCount = 0;

            const syncFn = jest.fn(async () => {
                syncExecutionCount++;
                return { history: [], status: 'in_transit' };
            });

            // Fire 5 rapid concurrent calls for the same tracking number
            triggerBackgroundTrackingSync(shipment, syncFn);
            triggerBackgroundTrackingSync(shipment, syncFn);
            triggerBackgroundTrackingSync(shipment, syncFn);
            triggerBackgroundTrackingSync(shipment, syncFn);
            triggerBackgroundTrackingSync(shipment, syncFn);

            // Wait for event loop ticks
            setTimeout(() => {
                expect(syncExecutionCount).toBe(1);
                expect(syncFn).toHaveBeenCalledTimes(1);
                done();
            }, 50);
        });

        it('triggerBackgroundTrackingSync handles sync errors gracefully without crashing or throwing', (done) => {
            const shipment = { id: 'ship-err', trackingNumber: 'TRK-ERR-001' };
            const failingSyncFn = jest.fn(async () => {
                throw new Error('Remote carrier network timeout (ECONNRESET)');
            });

            // Must not throw synchronously
            expect(() => {
                triggerBackgroundTrackingSync(shipment, failingSyncFn);
            }).not.toThrow();

            setTimeout(() => {
                expect(failingSyncFn).toHaveBeenCalled();
                // Cache was updated to avoid immediate retry storm
                expect(isTrackingSyncDue(shipment, 10000)).toBe(false);
                done();
            }, 50);
        });

        it('getPublicShipment serves cached history without synchronous carrier API blocking', async () => {
            const mockShipment = {
                id: 'ship-pub-1',
                trackingNumber: 'TRK-PUB-001',
                status: 'in_transit',
                carrierCode: 'DGR',
                dhlTrackingNumber: 'DHL-123456',
                origin: { city: 'Kuwait City', formattedAddress: 'Sharq, Kuwait' },
                destination: { city: 'Riyadh', formattedAddress: 'Olaya, Riyadh' },
                history: [
                    {
                        status: 'in_transit',
                        source: 'carrier',
                        description: 'Departed Facility',
                        timestamp: new Date().toISOString(),
                        location: 'Kuwait Airport'
                    }
                ]
            };

            const originalFindUnique = prisma.shipment.findUnique;
            prisma.shipment.findUnique = jest.fn().mockResolvedValue(mockShipment);

            // Spy on CarrierFactory adapter to assert getTracking is NOT called synchronously
            const originalGetAdapter = CarrierFactory.getAdapter;
            const mockGetTracking = jest.fn();
            CarrierFactory.getAdapter = jest.fn().mockReturnValue({
                getTracking: mockGetTracking
            });

            try {
                const req = {
                    params: { trackingNumber: 'TRK-PUB-001' },
                    query: {} // No explicit ?refresh=true
                };

                const jsonMock = jest.fn();
                const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
                const res = { status: statusMock };

                await shipmentPublicController.getPublicShipment(req, res);

                expect(statusMock).toHaveBeenCalledWith(200);
                const responseData = jsonMock.mock.calls[0][0].data;
                expect(responseData.trackingNumber).toBe('TRK-PUB-001');
                expect(responseData.status).toBe('in_transit');
                expect(responseData.events.length).toBeGreaterThan(0);

                // Crucial: Carrier API getTracking was NOT called synchronously because persisted history exists
                expect(mockGetTracking).not.toHaveBeenCalled();
            } finally {
                prisma.shipment.findUnique = originalFindUnique;
                CarrierFactory.getAdapter = originalGetAdapter;
            }
        });
    });

    // =========================================================================
    // SECTION 3: Durable Job Queue & Worker Retries (F3)
    // =========================================================================
    describe('F3: Durable Job Queue (JobQueue) Retries & Exponential Backoff', () => {

        it('correctly initializes JobQueue with expected defaults', () => {
            const queue = new JobQueue();
            expect(queue.pollIntervalMs).toBe(1500);
            expect(queue.isRunning).toBe(false);
            expect(queue.isProcessing).toBe(false);
            expect(queue.workers instanceof Map).toBe(true);
            expect(queue.inMemoryJobs instanceof Map).toBe(true);
        });

        it('enqueues jobs with generated UUID, pending status, and configured options', async () => {
            const queue = new JobQueue();
            const payload = { shipmentId: 's-123', event: 'test' };

            const job = await queue.enqueue('test_queue', payload, {
                maxRetries: 3,
                backoffMs: 8000,
                delayMs: 2000
            });

            expect(job.jobId).toBeDefined();
            expect(typeof job.jobId).toBe('string');
            expect(job.queueName).toBe('test_queue');
            expect(job.status).toBe('pending');
            expect(new Date(job.nextRunAt).getTime()).toBeGreaterThan(Date.now() + 1500);

            const retrieved = await queue.getJobStatus(job.jobId);
            expect(retrieved.max_retries).toBe(3);
            expect(retrieved.backoff_ms).toBe(8000);
            expect(retrieved.attempts).toBe(0);
        });

        it('does not process future-delayed jobs before next_run_at', async () => {
            const queue = new JobQueue();
            let executed = false;

            queue.registerWorker('future_queue', async () => {
                executed = true;
            });

            // Enqueue with 10s delay
            const job = await queue.enqueue('future_queue', { x: 1 }, { delayMs: 10000 });

            await queue.processPendingJobs();

            expect(executed).toBe(false);
            const status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(0);
        });

        it('reschedules with 60s delay and increments attempts when worker is unregistered', async () => {
            const queue = new JobQueue();
            const job = await queue.enqueue('unregistered_queue', { data: 123 });

            await queue.processPendingJobs();

            const status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(1);
            expect(status.last_error).toContain('No worker registered for queue');
            expect(new Date(status.next_run_at).getTime()).toBeGreaterThan(Date.now() + 50000);
        });

        it('mathematically verifies exponential backoff retry progression', async () => {
            const queue = new JobQueue();
            const backoffMs = 1000;
            const maxRetries = 5;

            queue.registerWorker('backoff_math_queue', async () => {
                throw new Error('Temporary API error 502');
            });

            const job = await queue.enqueue('backoff_math_queue', {}, { maxRetries, backoffMs });

            // Test Attempt 1 failure: backoff = 1000 * 2^0 + [0..500) = [1000, 1500)
            const beforeAttempt1 = Date.now();
            await queue.processPendingJobs();

            let status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(1);
            const delay1 = new Date(status.next_run_at).getTime() - beforeAttempt1;
            expect(delay1).toBeGreaterThanOrEqual(950);
            expect(delay1).toBeLessThanOrEqual(1600);

            // Simulate timer advance for Attempt 2: backoff = 1000 * 2^1 + [0..500) = [2000, 2500)
            const memJob = queue.inMemoryJobs.get(job.jobId);
            memJob.next_run_at = new Date(Date.now() - 100);
            const beforeAttempt2 = Date.now();
            await queue.processPendingJobs();

            status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(2);
            const delay2 = new Date(status.next_run_at).getTime() - beforeAttempt2;
            expect(delay2).toBeGreaterThanOrEqual(1950);
            expect(delay2).toBeLessThanOrEqual(2600);

            // Simulate timer advance for Attempt 3: backoff = 1000 * 2^2 + [0..500) = [4000, 4500)
            memJob.next_run_at = new Date(Date.now() - 100);
            const beforeAttempt3 = Date.now();
            await queue.processPendingJobs();

            status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(3);
            const delay3 = new Date(status.next_run_at).getTime() - beforeAttempt3;
            expect(delay3).toBeGreaterThanOrEqual(3950);
            expect(delay3).toBeLessThanOrEqual(4600);

            // Simulate timer advance for Attempt 4: backoff = 1000 * 2^3 + [0..500) = [8000, 8500)
            memJob.next_run_at = new Date(Date.now() - 100);
            const beforeAttempt4 = Date.now();
            await queue.processPendingJobs();

            status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('pending');
            expect(status.attempts).toBe(4);
            const delay4 = new Date(status.next_run_at).getTime() - beforeAttempt4;
            expect(delay4).toBeGreaterThanOrEqual(7950);
            expect(delay4).toBeLessThanOrEqual(8600);

            // Simulate timer advance for Attempt 5 (maxRetries = 5 reached): MUST mark as 'failed'
            memJob.next_run_at = new Date(Date.now() - 100);
            await queue.processPendingJobs();

            status = await queue.getJobStatus(job.jobId);
            expect(status.status).toBe('failed');
            expect(status.attempts).toBe(5);
            expect(status.next_run_at).toBeNull();
            expect(status.last_error).toBe('Temporary API error 502');
        });

        it('recovers to completed when a failing worker succeeds on subsequent retry', async () => {
            const queue = new JobQueue();
            let attemptsCount = 0;

            queue.registerWorker('recovering_queue', async () => {
                attemptsCount++;
                if (attemptsCount < 3) {
                    throw new Error('Transient network glitch');
                }
                return { success: true, processedOnAttempt: attemptsCount };
            });

            const job = await queue.enqueue('recovering_queue', {}, { maxRetries: 5, backoffMs: 50 });

            // Run 1 (fails)
            await queue.processPendingJobs();
            expect(attemptsCount).toBe(1);
            expect((await queue.getJobStatus(job.jobId)).status).toBe('pending');

            // Fast-forward next_run_at and Run 2 (fails)
            queue.inMemoryJobs.get(job.jobId).next_run_at = new Date(Date.now() - 10);
            await queue.processPendingJobs();
            expect(attemptsCount).toBe(2);
            expect((await queue.getJobStatus(job.jobId)).status).toBe('pending');

            // Fast-forward next_run_at and Run 3 (succeeds!)
            queue.inMemoryJobs.get(job.jobId).next_run_at = new Date(Date.now() - 10);
            await queue.processPendingJobs();
            expect(attemptsCount).toBe(3);

            const finalStatus = await queue.getJobStatus(job.jobId);
            expect(finalStatus.status).toBe('completed');
            expect(finalStatus.attempts).toBe(3);
            expect(finalStatus.next_run_at).toBeNull();
            expect(finalStatus.last_error).toBeNull();
        });

        it('WebhookDispatcher.processQueuedDelivery rethrows on delivery failure to engage JobQueue backoff retry', async () => {
            const originalFindEvent = prisma.webhookEvent.findUnique;
            const originalFindSub = prisma.webhookSubscription.findUnique;
            const originalUpdateEvent = prisma.webhookEvent.update;

            prisma.webhookEvent.findUnique = jest.fn().mockResolvedValue({
                id: 'ev-1',
                event: 'shipment.created',
                payload: { trackingNumber: 'TRK-WH-01' }
            });
            prisma.webhookSubscription.findUnique = jest.fn().mockResolvedValue({
                id: 'sub-1',
                targetUrl: 'https://unreachable.target-webhook.invalid/hook',
                isActive: true,
                secret: 'whsec_test'
            });
            prisma.webhookEvent.update = jest.fn().mockResolvedValue({
                id: 'ev-1',
                event: 'shipment.created',
                payload: { trackingNumber: 'TRK-WH-01' }
            });

            // Mock axios to simulate network error
            const axios = require('axios');
            const originalPost = axios.post;
            axios.post = jest.fn().mockRejectedValue(new Error('Connection refused (ECONNREFUSED)'));

            try {
                // Must throw because processQueuedDelivery passes throwOnError = true
                await expect(
                    WebhookDispatcher.processQueuedDelivery({ webhookEventId: 'ev-1', subscriptionId: 'sub-1' })
                ).rejects.toThrow('Connection refused');

                // Verify the event was recorded with status failed
                expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
                    where: { id: 'ev-1' },
                    data: expect.objectContaining({ status: 'failed' })
                }));
            } finally {
                prisma.webhookEvent.findUnique = originalFindEvent;
                prisma.webhookSubscription.findUnique = originalFindSub;
                prisma.webhookEvent.update = originalUpdateEvent;
                axios.post = originalPost;
            }
        });

        it('Adversarial Test: Chatwoot notification failure behavior in queue worker', async () => {
            // Test how ChatwootNotificationService.processQueuedNotification behaves when targets fail
            const shipment = {
                id: 'ship-cw-fail',
                trackingNumber: 'TRK-CW-FAIL',
                status: 'in_transit',
                origin: { phone: '+96599999999', name: 'Sender' },
                destination: { phone: '+96655555555', name: 'Receiver' }
            };

            const originalSend = chatwootNotificationService.sendShipmentNotification;
            
            // Case A: When sendShipmentNotification returns failed results without throwing
            chatwootNotificationService.sendShipmentNotification = jest.fn().mockResolvedValue({
                skipped: false,
                results: [
                    { target: 'sender', status: 'failed', error: 'Chatwoot API 500 Internal Error' },
                    { target: 'receiver', status: 'failed', error: 'Chatwoot API 500 Internal Error' }
                ]
            });

            try {
                const result = await chatwootNotificationService.processQueuedNotification({
                    eventType: 'out_for_delivery',
                    shipment
                });

                // Empirical observation: Does processQueuedNotification throw when results are failed?
                // If it resolves without throwing, JobQueue marks it 'completed' instead of retrying!
                expect(result.skipped).toBe(false);
                expect(result.results.every(r => r.status === 'failed')).toBe(true);

                // Now test what JobQueue does when worker handler returns this result
                const queue = new JobQueue();
                queue.registerWorker('chatwoot_notify', async (payload) => {
                    return await chatwootNotificationService.processQueuedNotification(payload);
                });

                const job = await queue.enqueue('chatwoot_notify', { eventType: 'out_for_delivery', shipment });
                await queue.processPendingJobs();

                const jobStatus = await queue.getJobStatus(job.jobId);
                // Documenting the empirical behavior:
                // If sendShipmentNotification swallows target errors and does not re-throw,
                // JobQueue considers the job 'completed'.
                expect(jobStatus.status).toBe('completed');
            } finally {
                chatwootNotificationService.sendShipmentNotification = originalSend;
            }
        });

        it('JobQueue re-entrancy lock prevents concurrent execution cycles', async () => {
            const queue = new JobQueue();
            queue.isProcessing = true; // Simulate cycle already running

            let workerExecuted = false;
            queue.registerWorker('concurrent_queue', async () => {
                workerExecuted = true;
            });

            await queue.enqueue('concurrent_queue', { a: 1 });
            await queue.processPendingJobs();

            // Must NOT process because isProcessing was true
            expect(workerExecuted).toBe(false);

            // Once flag cleared, processing resumes
            queue.isProcessing = false;
            await queue.processPendingJobs();
            expect(workerExecuted).toBe(true);
        });

        it('JobQueue ensureTableExists generates correct MySQL 8 DDL with index', async () => {
            const queue = new JobQueue();
            const executeRawMock = jest.fn().mockResolvedValue(1);
            queue.setPrismaClient({
                $executeRawUnsafe: executeRawMock
            });

            const result = await queue.ensureTableExists();
            expect(result).toBe(true);
            expect(executeRawMock).toHaveBeenCalledTimes(1);

            const sql = executeRawMock.mock.calls[0][0];
            expect(sql).toContain('CREATE TABLE IF NOT EXISTS `_background_jobs`');
            expect(sql).toContain('`id` VARCHAR(64) NOT NULL PRIMARY KEY');
            expect(sql).toContain('`queue_name` VARCHAR(100) NOT NULL');
            expect(sql).toContain('`payload` JSON NOT NULL');
            expect(sql).toContain('`status` VARCHAR(32) NOT NULL DEFAULT \'pending\'');
            expect(sql).toContain('`attempts` INT NOT NULL DEFAULT 0');
            expect(sql).toContain('`max_retries` INT NOT NULL DEFAULT 5');
            expect(sql).toContain('`backoff_ms` INT NOT NULL DEFAULT 10000');
            expect(sql).toContain('`next_run_at` DATETIME NOT NULL');
            expect(sql).toContain('INDEX `idx_queue_status_run` (`queue_name`, `status`, `next_run_at`)');
            expect(sql).toContain('ENGINE=InnoDB');
        });

        it('WebhookDispatcher.dispatch enqueues to webhook_delivery queue and falls back gracefully on queue error', async () => {
            const originalFindMany = prisma.webhookSubscription.findMany;
            const originalCreateEvent = prisma.webhookEvent.create;
            const originalDeliver = WebhookDispatcher._deliver;

            const mockSub = {
                id: 'sub-org-1',
                organizationId: 'org-test',
                events: ['shipment.created'],
                isActive: true,
                targetUrl: 'https://example.com/webhook',
                secret: 'sec'
            };

            const mockEvent = {
                id: 'wev-100',
                subscriptionId: 'sub-org-1',
                event: 'shipment.created',
                payload: { trackingNumber: 'TRK-WH-100' }
            };

            prisma.webhookSubscription.findMany = jest.fn().mockResolvedValue([mockSub]);
            prisma.webhookEvent.create = jest.fn().mockResolvedValue(mockEvent);

            const jobQueue = require('../src/services/queue/jobQueue');
            const originalEnqueue = jobQueue.enqueue;
            jobQueue.enqueue = jest.fn().mockResolvedValue({ jobId: 'wh-job-1' });

            try {
                // Test normal dispatch
                await WebhookDispatcher.dispatch('shipment.created', 'org-test', { trackingNumber: 'TRK-WH-100' });

                expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
                    where: { organizationId: 'org-test', isActive: true }
                });
                expect(prisma.webhookEvent.create).toHaveBeenCalled();
                expect(jobQueue.enqueue).toHaveBeenCalledWith('webhook_delivery', {
                    webhookEventId: 'wev-100',
                    subscriptionId: 'sub-org-1'
                }, {
                    maxRetries: 5,
                    backoffMs: 15000
                });

                // Test fallback to direct delivery when enqueue rejects
                jobQueue.enqueue = jest.fn().mockRejectedValue(new Error('Queue unavailable'));
                WebhookDispatcher._deliver = jest.fn().mockResolvedValue();

                await WebhookDispatcher.dispatch('shipment.created', 'org-test', { trackingNumber: 'TRK-WH-100' });
                expect(WebhookDispatcher._deliver).toHaveBeenCalledWith(mockSub, mockEvent);
            } finally {
                prisma.webhookSubscription.findMany = originalFindMany;
                prisma.webhookEvent.create = originalCreateEvent;
                WebhookDispatcher._deliver = originalDeliver;
                jobQueue.enqueue = originalEnqueue;
            }
        });
    });
});
