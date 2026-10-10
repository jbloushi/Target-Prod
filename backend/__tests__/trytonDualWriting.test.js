const trytonClient = require('../src/services/tryton/trytonClient');
const { jobQueue } = require('../src/services/queue');
const ShipmentLifecycleService = require('../src/services/ShipmentLifecycleService');
const ShipmentDraftService = require('../src/services/ShipmentDraftService');
const { prisma } = require('../src/config/database');

describe('Ticket 07: Express Gateway JSON-RPC Client & Dual-Writing Queue', () => {

    test('TrytonClient connects via JSON-RPC, logs in, and caches session', async () => {
        const version = await trytonClient.checkHealth();
        expect(version).toBe('8.2');

        const session = await trytonClient.login(true);
        expect(session).toBeDefined();
        expect(session.userId).toBeGreaterThan(0);
        expect(typeof session.sessionToken).toBe('string');
        expect(session.sessionToken.length).toBe(64);
        expect(session.authHeader).toMatch(/^Session [A-Za-z0-9+/=]+$/);

        // Verify session caching
        const cached = await trytonClient.login(false);
        expect(cached.sessionToken).toBe(session.sessionToken);

        // Model search call
        const parties = await trytonClient.modelCall('party.party', 'search', [], 0, 5, null);
        expect(Array.isArray(parties)).toBe(true);
        expect(parties.length).toBeGreaterThan(0);
    });

    test('TrytonClient handles automatic re-authentication when session expires', async () => {
        // Invalidate cached token with fake expired header
        trytonClient.cachedSession = {
            userId: 9999,
            sessionToken: 'invalid_expired_token_00000000000000000000000000000000000000000000',
            authHeader: 'Session aW52YWxpZDoxMjM6NDU2',
            expiresAt: Date.now() + 100000
        };

        // Execution should catch the 401, re-login transparently, and succeed
        const parties = await trytonClient.modelCall('party.party', 'search', [], 0, 1, null);
        expect(Array.isArray(parties)).toBe(true);
        expect(trytonClient.cachedSession.userId).toBeGreaterThan(0);
    });

    test('Primary write completes in sub-100ms while shadow dual-write is queued asynchronously', async () => {
        const mockDraft = {
            id: 'test-shipment-dual-write-001',
            trackingNumber: 'TRK-TRYTON-TEST-001',
            totalWeight: 2.5,
            carrierCode: 'DGR'
        };

        const mockActor = { id: 1, name: 'Operations Staff', role: 'staff' };
        const mockCommand = { reference: 'ORDER-101' };

        // Mock createDraft to verify sub-100ms latency and non-blocking queueing
        jest.spyOn(ShipmentDraftService, 'createDraft').mockResolvedValue(mockDraft);
        const enqueueSpy = jest.spyOn(jobQueue, 'enqueue');

        const start = Date.now();
        const result = await ShipmentLifecycleService.submitShipment(mockCommand, mockActor);
        const elapsedMs = Date.now() - start;

        expect(result).toEqual(mockDraft);
        // Sub-100ms response time guarantee
        expect(elapsedMs).toBeLessThan(100);

        // Verify tryton_dual_write job was enqueued with maxRetries
        expect(enqueueSpy).toHaveBeenCalledWith(
            'tryton_dual_write',
            expect.objectContaining({
                action: 'CREATE_SHIPMENT',
                shipmentId: 'test-shipment-dual-write-001',
                trackingNumber: 'TRK-TRYTON-TEST-001'
            }),
            expect.objectContaining({ maxRetries: 3 })
        );

        ShipmentDraftService.createDraft.mockRestore();
        enqueueSpy.mockRestore();
    });

    test('TrytonClient mirrors party, shipment, and package records to live Tryton backend', async () => {
        const testShipment = {
            id: 'mock-shipment-999',
            trackingNumber: `TRK-LIVE-${Date.now().toString().slice(-6)}`,
            totalWeight: 2.2,
            carrierCode: 'DGR',
            sender: {
                name: 'Kuwait Merchant W.L.L.',
                company: 'Kuwait Merchant W.L.L.'
            },
            parcels: [
                {
                    weight: 2.2,
                    dimensions: { length: 30, width: 25, height: 15 }
                }
            ]
        };

        const result = await trytonClient.mirrorShipment(testShipment);
        expect(result).toBeDefined();
        expect(result.trytonShipmentId).toBeGreaterThan(0);

        // Verify shipment exists in Tryton via JSON-RPC
        const searchRes = await trytonClient.modelCall(
            'stock.shipment.out',
            'search',
            [['id', '=', result.trytonShipmentId]],
            0,
            1,
            null
        );
        expect(searchRes).toContain(result.trytonShipmentId);
    });

    test('TrytonClient mirrors warehouse scale intake scan to Tryton process_scale_intake', async () => {
        const trackingNum = `TRK-SCAN-${Date.now().toString().slice(-6)}`;
        const testShipment = {
            id: 'mock-scan-999',
            trackingNumber: trackingNum,
            totalWeight: 1.5,
            carrierCode: 'DGR',
            sender: { name: 'Amani Boutique' }
        };

        // Mirror shipment first
        const mirrored = await trytonClient.mirrorShipment(testShipment);
        expect(mirrored.trytonShipmentId).toBeGreaterThan(0);

        // Mirror scale scan
        const scanResult = await trytonClient.mirrorWarehouseScan(trackingNum, {
            weight: 1.52,
            dimensions: { length: 25, width: 20, height: 10 },
            shelfLocation: 'SHW-BAY-A1',
            notes: 'Operational Review Completed'
        });

        expect(scanResult).toBeDefined();
        expect(scanResult.success).toBe(true);
        expect(scanResult.trytonShipmentId).toBe(mirrored.trytonShipmentId);
    });
});
