describe('financeInvoice service', () => {
    const prisma = {
        organization: { findUnique: jest.fn() },
        organizationLedger: { findMany: jest.fn() },
        shipment: { findMany: jest.fn() },
        invoiceLine: { findMany: jest.fn() },
        invoice: {
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        }
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
    });

    it('returns an empty invoice list when the invoice schema is not available yet', async () => {
        const missingTableError = new Error('The table `invoice` does not exist in the current database.');
        missingTableError.code = 'P2021';
        missingTableError.meta = { table: 'invoice' };

        prisma.invoice.findMany.mockRejectedValue(missingTableError);
        prisma.invoice.count.mockRejectedValue(missingTableError);

        const financeInvoiceService = require('../src/services/financeInvoice.service');
        const result = await financeInvoiceService.listInvoices({ organizationId: 'org-1' });

        expect(result).toEqual({
            data: [],
            pagination: {
                total: 0,
                page: 1,
                limit: 20,
                pages: 0
            }
        });
    });
});
