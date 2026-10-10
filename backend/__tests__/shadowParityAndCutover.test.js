const parityAuditor = require('../src/services/tryton/parityAuditor');
const cutoverManager = require('../src/services/tryton/cutoverManager');
const trytonClient = require('../src/services/tryton/trytonClient');

describe('Ticket 09: Shadow Parity Auditor & Zero-Downtime Cutover Switch', () => {

    test('Shipment Parity Auditor reconciles MySQL shipments with Tryton stock.shipment.out (zero drift)', async () => {
        const audit = await parityAuditor.auditShipmentParity();
        
        expect(audit).toBeDefined();
        expect(audit.total).toBeGreaterThanOrEqual(80);
        expect(audit.matched).toBeGreaterThanOrEqual(80);
        expect(audit.missing).toBe(0);
        expect(audit.mismatched).toBe(0);
        expect(audit.drift).toBe(0);
        expect(audit.matchRate).toBe(100);
        expect(audit.zeroDrift).toBe(true);
    });

    test('Pricing Validator compares Express quotes and Tryton AST rate cards down to 0.001 KWD parity', async () => {
        const testWeights = [1.0, 2.5, 5.0, 10.0];

        for (const weight of testWeights) {
            const quoteAudit = await parityAuditor.validateQuoteParity({ weight, country: 'SA' });
            
            expect(quoteAudit).toBeDefined();
            expect(quoteAudit.expressPrice).toBeGreaterThan(0);
            expect(quoteAudit.trytonPrice).toBeGreaterThan(0);
            // Must match within 0.001 KWD (1 fils)
            expect(quoteAudit.deltaKwd).toBeLessThanOrEqual(0.001);
            expect(quoteAudit.isParity).toBe(true);
        }
    });

    test('Financial Parity Auditor verifies organization balances against Tryton party ledgers', async () => {
        const financialAudit = await parityAuditor.auditFinancialParity();

        expect(financialAudit).toBeDefined();
        expect(financialAudit.auditedOrgs).toBeGreaterThanOrEqual(5);
        expect(financialAudit.matched).toBeGreaterThanOrEqual(5);
        expect(financialAudit.driftCount).toBe(0);
        expect(financialAudit.zeroDrift).toBe(true);
    });

    test('Comprehensive 7-day shadow reconciliation produces zero-drift attestation report', async () => {
        const report = await parityAuditor.runFullAudit();

        expect(report).toBeDefined();
        expect(report.zeroDrift).toBe(true);
        expect(report.shipments.zeroDrift).toBe(true);
        expect(report.pricing.isParity).toBe(true);
        expect(report.financial.zeroDrift).toBe(true);
        expect(typeof report.timestamp).toBe('string');
    });

    test('Cutover Switch routes primary writes to Tryton when PRIMARY_BACKEND=TRYTON', async () => {
        const initialBackend = cutoverManager.getPrimaryBackend();
        
        try {
            // Activate Tryton cutover
            cutoverManager.setPrimaryBackend('TRYTON');
            expect(cutoverManager.isTrytonPrimary()).toBe(true);
            expect(cutoverManager.getPrimaryBackend()).toBe('TRYTON');

            const mockCommand = {
                trackingNumber: `TRK-CUTOVER-${Date.now().toString().slice(-6)}`,
                weight: 2.0,
                carrierCode: 'DGR'
            };
            const mockActor = { name: 'Cutover Staff', email: 'staff@demo.com' };
            const fallbackSpy = jest.fn().mockResolvedValue({ id: 'mock-mysql-id' });

            const result = await cutoverManager.routeShipmentSubmission(mockCommand, mockActor, fallbackSpy);

            expect(result).toBeDefined();
            expect(result.backend).toBe('TRYTON');
            expect(result.trytonShipmentId).toBeGreaterThan(0);
            expect(result.primarySuccess).toBe(true);
            expect(result.status).toBe('client_submitted');

        } finally {
            // Restore initial state
            cutoverManager.setPrimaryBackend(initialBackend);
        }
    });

    test('Instant fallback runbook reverts primary traffic to LEGACY_MYSQL with zero downtime', async () => {
        cutoverManager.setPrimaryBackend('TRYTON');
        expect(cutoverManager.isTrytonPrimary()).toBe(true);

        // Execute instant rollback
        const rollbackResult = cutoverManager.fallbackToLegacyMysql();
        expect(rollbackResult.previous).toBe('TRYTON');
        expect(rollbackResult.current).toBe('LEGACY_MYSQL');
        expect(cutoverManager.isTrytonPrimary()).toBe(false);

        const mockCommand = { trackingNumber: 'TRK-FALLBACK-001' };
        const mockActor = { name: 'Operations' };
        const legacyHandler = jest.fn().mockResolvedValue({ id: 'legacy-mysql-001', status: 'draft' });

        const routeResult = await cutoverManager.routeShipmentSubmission(mockCommand, mockActor, legacyHandler);
        expect(routeResult.backend).toBe('LEGACY_MYSQL');
        expect(legacyHandler).toHaveBeenCalledWith(mockCommand, mockActor);
    });
});
