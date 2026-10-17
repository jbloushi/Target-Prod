/**
 * Empirical Verification of Production Backfill CLI Script Contract
 * File: backend/__tests__/challengerBackfillScript.test.js
 */

const { runFinancialParityAudit } = require('../scripts/reconcile-financial-parity');
const { prisma } = require('../src/config/database');

jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn()
}));

jest.mock('../src/config/database', () => {
    const mockPrisma = {
        user: {
            findFirst: jest.fn().mockResolvedValue({ id: 'admin-1', role: 'admin' })
        },
        shipment: {
            findMany: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: 's-1' })
        },
        organizationLedger: {
            findFirst: jest.fn(),
            create: jest.fn().mockResolvedValue({ id: 'led-1' })
        },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ id: 'org-1', currency: 'KWD' }),
            update: jest.fn().mockResolvedValue({ id: 'org-1' })
        },
        invoice: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'inv-1' })
        },
        invoiceLine: {
            findFirst: jest.fn().mockResolvedValue(null)
        },
        journalEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'je-1' })
        },
        accountingPeriod: {
            findUnique: jest.fn().mockResolvedValue({ id: 'p-1', name: '2026-10', isClosed: false })
        },
        account: {
            findUnique: jest.fn().mockImplementation(async ({ where }) => ({
                id: `acc-${where.code || '1'}`,
                code: where.code || '1100',
                currency: 'KWD'
            })),
            update: jest.fn().mockResolvedValue({})
        },
        $transaction: jest.fn(async (cb) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn().mockResolvedValue([])
    };
    return { prisma: mockPrisma };
});

describe('Challenger 2: Production Backfill CLI Script Empirical Audit', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('dry-run mode identifies discrepancies across sub-ledger, GL, and invoices without performing mutations', async () => {
        prisma.shipment.findMany.mockResolvedValue([
            {
                id: 's-desync',
                trackingNumber: 'TRK-DESYNC-01',
                organizationId: 'org-client-1',
                price: 100,
                costPrice: 60,
                totalPaid: 100,
                remainingBalance: 50, // Should be 0 since paid is true
                paid: true,
                currency: 'KWD'
            }
        ]);

        const result = await runFinancialParityAudit(true); // dryRun = true

        expect(result.auditedCount).toBe(1);
        expect(result.discrepanciesCount).toBeGreaterThan(0);
        expect(result.fixedCount).toBe(0);
        expect(result.dryRun).toBe(true);

        // Verify zero database mutations were executed
        expect(prisma.shipment.update).not.toHaveBeenCalled();
        expect(prisma.organizationLedger.create).not.toHaveBeenCalled();
        expect(prisma.invoice.create).not.toHaveBeenCalled();
        expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('commit mode repairs discrepancies and re-running against repaired records achieves strict idempotency (zero discrepancies)', async () => {
        // Run 1: Corrupted shipment
        prisma.shipment.findMany.mockResolvedValueOnce([
            {
                id: 's-fix',
                trackingNumber: 'TRK-FIX-01',
                organizationId: 'org-client-1',
                price: 50,
                costPrice: 30,
                totalPaid: 0,
                remainingBalance: 0, // Desync: should be 50
                paid: false,
                currency: 'KWD'
            }
        ]);

        const commitResult = await runFinancialParityAudit(false); // commit mode (dryRun = false)
        expect(commitResult.discrepanciesCount).toBeGreaterThan(0);
        expect(commitResult.fixedCount).toBeGreaterThan(0);

        // Run 2: Re-running audit on repaired database state
        prisma.shipment.findMany.mockResolvedValueOnce([
            {
                id: 's-fix',
                trackingNumber: 'TRK-FIX-01',
                organizationId: 'org-client-1',
                price: 50,
                costPrice: 30,
                totalPaid: 0,
                remainingBalance: 50, // Repaired!
                paid: false,
                currency: 'KWD'
            }
        ]);
        // All artifacts already exist
        prisma.organizationLedger.findFirst.mockResolvedValue({ id: 'led-existing' });
        prisma.invoiceLine.findFirst.mockResolvedValue({ id: 'line-existing' });
        prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-existing' });

        jest.clearAllMocks();

        const secondPass = await runFinancialParityAudit(false);
        expect(secondPass.discrepanciesCount).toBe(0);
        expect(secondPass.fixedCount).toBe(0);
        expect(prisma.shipment.update).not.toHaveBeenCalled();
        expect(prisma.organizationLedger.create).not.toHaveBeenCalled();
        expect(prisma.invoice.create).not.toHaveBeenCalled();
        expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });
});
