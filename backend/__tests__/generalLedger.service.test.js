const generalLedgerService = require('../src/services/generalLedger.service');
const accountsPayableService = require('../src/services/accountsPayable.service');
const treasuryService = require('../src/services/treasury.service');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => {
  const mPrisma = {
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    accountingPeriod: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    journalEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    journalEntryLine: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    vendor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn()
    },
    bill: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    billLine: {
      create: jest.fn()
    },
    billPayment: {
      create: jest.fn()
    },
    bankAccount: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    bankTransaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    shipment: {
      findFirst: jest.fn()
    },
    $transaction: jest.fn()
  };
  mPrisma.$transaction.mockImplementation((callback) => callback(mPrisma));
  return { prisma: mPrisma };
});

describe('Native Full Double-Entry Accounting ERP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('General Ledger & Double-Entry Verification', () => {
    it('strictly rejects unbalanced journal entries (Debits != Credits)', async () => {
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p-1',
        name: '2026-09',
        isClosed: false
      });

      prisma.account.findUnique.mockImplementation(({ where }) => {
        if (where.code === '1100') return Promise.resolve({ id: 'acc-1100', code: '1100', type: 'ASSET', currency: 'KWD' });
        if (where.code === '4010') return Promise.resolve({ id: 'acc-4010', code: '4010', type: 'REVENUE', currency: 'KWD' });
        return Promise.resolve(null);
      });

      await expect(
        generalLedgerService.postJournalEntry({
          lines: [
            { accountCode: '1100', debit: 10.000, credit: 0 },
            { accountCode: '4010', debit: 0, credit: 8.500 } // Unbalanced!
          ]
        })
      ).rejects.toThrow(/Unbalanced Journal Entry/);
    });

    it('rejects postings to closed accounting periods', async () => {
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p-1',
        name: '2026-09',
        isClosed: true // CLOSED
      });

      await expect(
        generalLedgerService.postJournalEntry({
          lines: [
            { accountCode: '1100', debit: 10, credit: 0 },
            { accountCode: '4010', debit: 0, credit: 10 }
          ]
        })
      ).rejects.toThrow(/period "2026-09" is closed/);
    });

    it('posts a balanced journal entry and increments account balances correctly', async () => {
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p-1',
        name: '2026-09',
        isClosed: false
      });

      prisma.account.findUnique.mockImplementation(({ where }) => {
        if (where.code === '1010') return Promise.resolve({ id: 'acc-1010', code: '1010', type: 'ASSET', currency: 'KWD' });
        if (where.code === '1100') return Promise.resolve({ id: 'acc-1100', code: '1100', type: 'ASSET', currency: 'KWD' });
        return Promise.resolve(null);
      });

      prisma.journalEntry.create.mockResolvedValue({
        id: 'je-1',
        entryNumber: 'JE-202609-001',
        totalDebit: 50.000,
        totalCredit: 50.000,
        status: 'POSTED',
        lines: []
      });

      const entry = await generalLedgerService.postJournalEntry({
        reference: 'PAY-100',
        sourceType: 'PAYMENT',
        lines: [
          { accountCode: '1010', debit: 50.000, credit: 0 },
          { accountCode: '1100', debit: 0, credit: 50.000 }
        ]
      });

      expect(entry.entryNumber).toBe('JE-202609-001');
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      // Verify account balance updates
      expect(prisma.account.update).toHaveBeenCalledTimes(2);
    });

    it('reverses a posted journal entry with contra lines', async () => {
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p-1',
        name: '2026-09',
        isClosed: false
      });

      prisma.journalEntry.findUnique.mockResolvedValue({
        id: 'je-orig',
        entryNumber: 'JE-ORIG-01',
        status: 'POSTED',
        lines: [
          { accountId: 'acc-1010', account: { code: '1010' }, debit: 25, credit: 0, currency: 'KWD', exchangeRate: 1 },
          { accountId: 'acc-1100', account: { code: '1100' }, debit: 0, credit: 25, currency: 'KWD', exchangeRate: 1 }
        ]
      });

      prisma.account.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'acc-1010' || where.code === '1010') return Promise.resolve({ id: 'acc-1010', code: '1010', type: 'ASSET', currency: 'KWD' });
        if (where.id === 'acc-1100' || where.code === '1100') return Promise.resolve({ id: 'acc-1100', code: '1100', type: 'ASSET', currency: 'KWD' });
        return Promise.resolve(null);
      });

      prisma.journalEntry.create.mockResolvedValue({
        id: 'je-rev',
        entryNumber: 'REV-JE-ORIG-01',
        status: 'POSTED'
      });

      const reversal = await generalLedgerService.reverseJournalEntry('je-orig', {
        reason: 'Customer refund',
        reversedBy: 'user-admin'
      });

      expect(reversal.entryNumber).toBe('REV-JE-ORIG-01');
      expect(prisma.journalEntry.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'je-orig' },
        data: expect.objectContaining({ status: 'VOID' })
      }));
    });
  });

  describe('Trial Balance & Financial Statements', () => {
    it('computes a balanced Trial Balance where Debits == Credits', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          code: '1010',
          name: 'NBK Operating Cash',
          type: 'ASSET',
          subType: 'CASH',
          currency: 'KWD',
          journalLines: [{ baseDebit: 100, baseCredit: 20 }]
        },
        {
          id: 'acc-2',
          code: '4010',
          name: 'Freight Revenue',
          type: 'REVENUE',
          subType: 'REVENUE',
          currency: 'KWD',
          journalLines: [{ baseDebit: 0, baseCredit: 80 }]
        }
      ]);

      const tb = await generalLedgerService.getTrialBalance({ asOfDate: new Date() });

      expect(tb.isBalanced).toBe(true);
      expect(tb.totalDebits).toBe(100);
      expect(tb.totalCredits).toBe(100);
      expect(tb.accounts.length).toBe(2);
    });

    it('generates Income Statement with Gross Margin and Net Operating Income', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'acc-4010',
          code: '4010',
          name: 'Freight Revenue',
          type: 'REVENUE',
          journalLines: [{ baseDebit: 0, baseCredit: 500 }]
        },
        {
          id: 'acc-5010',
          code: '5010',
          name: 'Carrier Wholesale Expense',
          type: 'COGS',
          journalLines: [{ baseDebit: 300, baseCredit: 0 }]
        },
        {
          id: 'acc-6010',
          code: '6010',
          name: 'Fleet Fuel',
          type: 'EXPENSE',
          journalLines: [{ baseDebit: 50, baseCredit: 0 }]
        }
      ]);

      const incomeStmt = await generalLedgerService.getIncomeStatement({
        fromDate: new Date('2026-09-01'),
        toDate: new Date('2026-09-30')
      });

      expect(incomeStmt.revenue.total).toBe(500);
      expect(incomeStmt.costOfGoodsSold.total).toBe(300);
      expect(incomeStmt.grossProfit).toBe(200);
      expect(incomeStmt.grossMarginPercent).toBe(40.0);
      expect(incomeStmt.operatingExpenses.total).toBe(50);
      expect(incomeStmt.netIncome).toBe(150);
    });
  });

  describe('Accounts Payable (AP) & Vendor Bills', () => {
    it('creates a carrier vendor bill and posts AP journal entry', async () => {
      prisma.vendor.findUnique.mockResolvedValue({
        id: 'v-dhl',
        code: 'DHL',
        name: 'DHL Express Kuwait',
        carrierCode: 'DHL',
        termsDays: 30
      });

      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-5010',
        code: '5010',
        type: 'COGS'
      });

      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p-1',
        name: '2026-09',
        isClosed: false
      });

      prisma.bill.create.mockResolvedValue({
        id: 'bill-1',
        billNumber: 'BILL-DHL-SEP',
        subtotal: 120,
        total: 120,
        paidAmount: 0,
        status: 'OPEN'
      });

      const bill = await accountsPayableService.createBill({
        vendorId: 'v-dhl',
        billNumber: 'BILL-DHL-SEP',
        lines: [
          { accountCode: '5010', description: 'September Linehaul', amount: 120 }
        ]
      }, 'user-admin');

      expect(bill.billNumber).toBe('BILL-DHL-SEP');
      expect(prisma.bill.create).toHaveBeenCalled();
      expect(prisma.billLine.create).toHaveBeenCalled();
      expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it('settles a vendor bill via bank account disbursement', async () => {
      prisma.bill.findUnique.mockResolvedValue({
        id: 'bill-1',
        billNumber: 'BILL-DHL-SEP',
        total: 120,
        paidAmount: 0,
        status: 'OPEN',
        currency: 'KWD',
        vendor: { code: 'DHL', name: 'DHL Express', carrierCode: 'DHL' }
      });

      prisma.bankAccount.findUnique.mockResolvedValue({
        id: 'bank-1',
        accountName: 'NBK Main Operations',
        glAccount: { id: 'acc-1010', code: '1010' }
      });

      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p-1',
        name: '2026-09',
        isClosed: false
      });

      prisma.billPayment.create.mockResolvedValue({
        id: 'bpay-1',
        amount: 120,
        reference: 'WIRE-9921'
      });

      const result = await accountsPayableService.payBill({
        billId: 'bill-1',
        bankAccountId: 'bank-1',
        amount: 120,
        reference: 'WIRE-9921',
        userId: 'user-admin'
      });

      expect(result.billStatus).toBe('PAID');
      expect(result.paidAmount).toBe(120);
      expect(prisma.bankAccount.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'bank-1' },
        data: expect.objectContaining({ currentBalance: { decrement: 120 } })
      }));
    });
  });

  describe('Treasury & Bank Reconciliation', () => {
    it('returns treasury position breakdown across bank accounts and vault safe', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([
        {
          id: 'b-1',
          accountName: 'NBK Operating KWD',
          bankName: 'National Bank of Kuwait',
          accountNumber: '11002233',
          currency: 'KWD',
          currentBalance: 15400.500
        }
      ]);

      prisma.account.findUnique.mockImplementation(({ where }) => {
        if (where.code === '1030') return Promise.resolve({ code: '1030', balance: 2500.000 }); // Hub vault safe
        if (where.code === '1020') return Promise.resolve({ code: '1020', balance: 850.250 });  // Cash in transit drivers
        return Promise.resolve(null);
      });

      const summary = await treasuryService.getTreasurySummary();

      expect(summary.totalLiquidAssets).toBe(18750.750);
      expect(summary.breakdown.bankCash).toBe(15400.500);
      expect(summary.breakdown.vaultSafeCash).toBe(2500.000);
      expect(summary.breakdown.cashInTransitDrivers).toBe(850.250);
    });

    it('reconciles bank transactions with internal payment IDs', async () => {
      prisma.bankTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: 50.000,
        isReconciled: false
      });

      prisma.bankTransaction.update.mockResolvedValue({
        id: 'tx-1',
        isReconciled: true,
        matchedType: 'PAYMENT',
        matchedId: 'pay-55'
      });

      const reconciled = await treasuryService.reconcileTransaction({
        transactionId: 'tx-1',
        matchedType: 'PAYMENT',
        matchedId: 'pay-55',
        userId: 'cashier-1'
      });

      expect(reconciled.isReconciled).toBe(true);
      expect(reconciled.matchedId).toBe('pay-55');
    });
  });
});
