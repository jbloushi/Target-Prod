const EomStatementCronService = require('../src/services/eomStatementCron.service');
const { prisma } = require('../src/config/database');
const financeLedgerService = require('../src/services/financeLedger.service');

jest.mock('../src/config/database', () => ({
    prisma: {
        organization: {
            findMany: jest.fn()
        },
        organizationLedger: {
            findMany: jest.fn()
        }
    }
}));

jest.mock('../src/services/financeLedger.service', () => ({
    getOrganizationBalance: jest.fn()
}));

describe('EomStatementCronService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('runEomStatementSync', () => {
        it('processes organizations and aggregates debits, credits, and closing balances', async () => {
            const mockOrgs = [
                {
                    id: 'org-1',
                    name: 'Acme Traders',
                    currency: 'KWD',
                    billingWhatsappNumber: '+96590001122',
                    billingEmail: 'billing@acme.com',
                    members: []
                },
                {
                    id: 'org-2',
                    name: 'Zero Activity Org',
                    currency: 'KWD',
                    billingWhatsappNumber: null,
                    members: []
                }
            ];

            prisma.organization.findMany.mockResolvedValue(mockOrgs);

            // Mock ledger and balance for org-1
            prisma.organizationLedger.findMany
                .mockResolvedValueOnce([
                    { amount: 50.0, entryType: 'DEBIT' },
                    { amount: 20.0, entryType: 'CREDIT' }
                ])
                // Mock ledger for org-2 (no entries)
                .mockResolvedValueOnce([]);

            financeLedgerService.getOrganizationBalance
                .mockResolvedValueOnce(30.0) // org-1 balance
                .mockResolvedValueOnce(0.0);  // org-2 balance (0)

            const summary = await EomStatementCronService.constructor.runEomStatementSync({
                statementDate: '2026-09-01T00:00:00Z'
            });

            expect(summary.totalOrganizations).toBe(2);
            expect(summary.processedCount).toBe(1);
            expect(summary.notifiedCount).toBe(1);
            expect(summary.skippedCount).toBe(1);
            expect(summary.errors).toHaveLength(0);
        });
    });
});
