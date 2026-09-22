const { prisma } = require('../config/database');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const BASE_CURRENCY = 'KWD';

const roundDec = (val, dec = 4) => {
  if (val instanceof Decimal) return val;
  return new Decimal(val || 0);
};

const toApiAmount = (decimalValue) => {
  return Number(roundDec(decimalValue).toFixed(3));
};

/**
 * Validates that an accounting period exists and is open for the given date.
 */
const getOrCreateOpenPeriod = async (date = new Date(), txClient = prisma) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const periodName = `${year}-${month}`;

  let period = await txClient.accountingPeriod.findUnique({
    where: { name: periodName }
  });

  if (!period) {
    const startDate = new Date(year, d.getMonth(), 1);
    const endDate = new Date(year, d.getMonth() + 1, 0, 23, 59, 59);
    period = await txClient.accountingPeriod.create({
      data: {
        name: periodName,
        startDate,
        endDate,
        isClosed: false
      }
    });
  }

  if (period.isClosed) {
    const error = new Error(`Accounting period "${periodName}" is closed. Cannot post transactions to closed periods.`);
    error.statusCode = 400;
    error.code = 'PERIOD_CLOSED';
    throw error;
  }

  return period;
};

/**
 * Core Double-Entry Poster.
 * Strictly enforces SUM(Debits) == SUM(Credits) in Base Currency (KWD).
 */
const postJournalEntry = async (entryData, txClient = prisma) => {
  const {
    entryNumber,
    date = new Date(),
    reference,
    sourceType = 'MANUAL',
    sourceId,
    notes,
    status = 'POSTED',
    createdById,
    approvedById,
    lines = []
  } = entryData;

  if (!lines || lines.length < 2) {
    const error = new Error('Journal Entry must contain at least two balancing lines (Double-Entry).');
    error.statusCode = 400;
    error.code = 'INVALID_JOURNAL_LINES';
    throw error;
  }

  // Ensure period is open
  const period = await getOrCreateOpenPeriod(date, txClient);

  // Validate and resolve lines
  let sumBaseDebit = new Decimal(0);
  let sumBaseCredit = new Decimal(0);
  const resolvedLines = [];

  for (const line of lines) {
    let account = null;
    if (line.accountId) {
      account = await txClient.account.findUnique({ where: { id: line.accountId } });
    } else if (line.accountCode) {
      account = await txClient.account.findUnique({ where: { code: line.accountCode } });
    }

    if (!account) {
      const error = new Error(`Account "${line.accountCode || line.accountId}" does not exist in Chart of Accounts.`);
      error.statusCode = 404;
      error.code = 'ACCOUNT_NOT_FOUND';
      throw error;
    }

    const cur = line.currency || account.currency || BASE_CURRENCY;
    const rate = roundDec(line.exchangeRate || 1.0);
    const debit = roundDec(line.debit || 0);
    const credit = roundDec(line.credit || 0);

    if (debit.lt(0) || credit.lt(0)) {
      const error = new Error('Debit and credit amounts cannot be negative.');
      error.statusCode = 400;
      throw error;
    }

    if (debit.gt(0) && credit.gt(0)) {
      const error = new Error('A single journal line cannot have both debit and credit amounts.');
      error.statusCode = 400;
      throw error;
    }

    const baseDebit = cur === BASE_CURRENCY ? debit : debit.times(rate);
    const baseCredit = cur === BASE_CURRENCY ? credit : credit.times(rate);

    sumBaseDebit = sumBaseDebit.plus(baseDebit);
    sumBaseCredit = sumBaseCredit.plus(baseCredit);

    resolvedLines.push({
      accountId: account.id,
      accountCode: account.code,
      accountType: account.type,
      organizationId: line.organizationId || null,
      shipmentId: line.shipmentId || null,
      debit,
      credit,
      currency: cur,
      exchangeRate: rate,
      baseDebit,
      baseCredit,
      memo: line.memo || notes || ''
    });
  }

  // STRICT INVARIANT: Sum(Debits) == Sum(Credits)
  const diff = sumBaseDebit.minus(sumBaseCredit).abs();
  if (diff.gt(0.001)) {
    const error = new Error(
      `Unbalanced Journal Entry: Total Base Debits (${sumBaseDebit.toFixed(3)}) do not equal Total Base Credits (${sumBaseCredit.toFixed(3)}). Difference: ${diff.toFixed(3)} KWD`
    );
    error.statusCode = 400;
    error.code = 'UNBALANCED_JOURNAL_ENTRY';
    throw error;
  }

  // Auto-generate entryNumber if not supplied
  const autoNumber = entryNumber || `JE-${period.name}-${Date.now().toString().slice(-6)}`;

  // Create Journal Entry & Lines
  const journalEntry = await txClient.journalEntry.create({
    data: {
      entryNumber: autoNumber,
      date: new Date(date),
      periodId: period.id,
      reference,
      sourceType,
      sourceId: sourceId ? String(sourceId) : null,
      notes,
      status,
      totalDebit: sumBaseDebit,
      totalCredit: sumBaseCredit,
      createdById: createdById || null,
      approvedById: approvedById || null,
      lines: {
        create: resolvedLines.map(l => ({
          accountId: l.accountId,
          organizationId: l.organizationId,
          shipmentId: l.shipmentId,
          debit: l.debit,
          credit: l.credit,
          currency: l.currency,
          exchangeRate: l.exchangeRate,
          baseDebit: l.baseDebit,
          baseCredit: l.baseCredit,
          memo: l.memo
        }))
      }
    },
    include: {
      lines: {
        include: {
          account: true
        }
      }
    }
  });

  // Update Account Balances in Chart of Accounts
  for (const l of resolvedLines) {
    // ASSET, COGS, EXPENSE normal balance is Debit (+Dr, -Cr)
    // LIABILITY, EQUITY, REVENUE normal balance is Credit (+Cr, -Dr)
    let netEffect = new Decimal(0);
    if (['ASSET', 'COGS', 'EXPENSE'].includes(l.accountType)) {
      netEffect = l.baseDebit.minus(l.baseCredit);
    } else {
      netEffect = l.baseCredit.minus(l.baseDebit);
    }

    await txClient.account.update({
      where: { id: l.accountId },
      data: {
        balance: {
          increment: netEffect
        }
      }
    });
  }

  logger.info(`[GL] Posted ${journalEntry.entryNumber} | ${sourceType} | Total: ${sumBaseDebit.toFixed(3)} KWD`);
  return journalEntry;
};

/**
 * Reverses a posted Journal Entry cleanly with an immutable audit trail.
 */
const reverseJournalEntry = async (journalEntryId, { reason, reversedBy }, txClient = prisma) => {
  const original = await txClient.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: { include: { account: true } } }
  });

  if (!original) {
    const error = new Error('Journal Entry not found.');
    error.statusCode = 404;
    throw error;
  }

  if (original.status === 'VOID') {
    const error = new Error('Journal Entry is already voided/reversed.');
    error.statusCode = 400;
    throw error;
  }

  // Create mirrored reversal lines
  const reversalLines = original.lines.map(line => ({
    accountId: line.accountId,
    accountCode: line.account.code,
    organizationId: line.organizationId,
    shipmentId: line.shipmentId,
    debit: line.credit, // Invert
    credit: line.debit, // Invert
    currency: line.currency,
    exchangeRate: line.exchangeRate,
    memo: `Reversal of ${original.entryNumber}: ${reason || 'Correction'}`
  }));

  const reversalEntry = await postJournalEntry({
    entryNumber: `REV-${original.entryNumber}`,
    date: new Date(),
    reference: original.reference,
    sourceType: 'REVERSAL',
    sourceId: original.id,
    notes: `Reversal of ${original.entryNumber}. Reason: ${reason || 'Not specified'}`,
    createdById: reversedBy,
    approvedById: reversedBy,
    lines: reversalLines
  }, txClient);

  await txClient.journalEntry.update({
    where: { id: original.id },
    data: {
      status: 'VOID',
      reversalOfId: reversalEntry.id
    }
  });

  return reversalEntry;
};

/**
 * Generates the Trial Balance as of a given date.
 */
const getTrialBalance = async ({ asOfDate = new Date(), currency = BASE_CURRENCY }) => {
  const dateFilter = new Date(asOfDate);

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    include: {
      journalLines: {
        where: {
          journalEntry: {
            date: { lte: dateFilter },
            status: 'POSTED'
          }
        },
        select: {
          baseDebit: true,
          baseCredit: true
        }
      }
    }
  });

  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);

  const rows = accounts.map(acc => {
    let accDebits = new Decimal(0);
    let accCredits = new Decimal(0);

    acc.journalLines.forEach(l => {
      accDebits = accDebits.plus(roundDec(l.baseDebit));
      accCredits = accCredits.plus(roundDec(l.baseCredit));
    });

    totalDebits = totalDebits.plus(accDebits);
    totalCredits = totalCredits.plus(accCredits);

    let netBalance = new Decimal(0);
    if (['ASSET', 'COGS', 'EXPENSE'].includes(acc.type)) {
      netBalance = accDebits.minus(accCredits);
    } else {
      netBalance = accCredits.minus(accDebits);
    }

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      subType: acc.subType,
      currency: acc.currency,
      debits: toApiAmount(accDebits),
      credits: toApiAmount(accCredits),
      netBalance: toApiAmount(netBalance)
    };
  });

  const diff = totalDebits.minus(totalCredits).abs();
  const isBalanced = diff.lte(0.001);

  return {
    asOfDate: dateFilter.toISOString(),
    currency,
    isBalanced,
    totalDebits: toApiAmount(totalDebits),
    totalCredits: toApiAmount(totalCredits),
    difference: toApiAmount(diff),
    accounts: rows
  };
};

/**
 * Generates the Balance Sheet (Assets = Liabilities + Equity).
 */
const getBalanceSheet = async ({ asOfDate = new Date() }) => {
  const tb = await getTrialBalance({ asOfDate });
  
  // Also calculate current period net income to roll into Equity
  const incomeStmt = await getIncomeStatement({
    fromDate: new Date(new Date(asOfDate).getFullYear(), 0, 1),
    toDate: asOfDate
  });

  const assets = tb.accounts.filter(a => a.type === 'ASSET');
  const liabilities = tb.accounts.filter(a => a.type === 'LIABILITY');
  const equity = tb.accounts.filter(a => a.type === 'EQUITY');

  const totalAssets = assets.reduce((sum, a) => sum + a.netBalance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.netBalance, 0);
  const totalEquityBase = equity.reduce((sum, a) => sum + a.netBalance, 0);

  // Current year retained earnings / net profit
  const currentPeriodProfit = incomeStmt.netIncome;
  const totalEquity = totalEquityBase + currentPeriodProfit;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  const diff = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = diff < 0.01;

  return {
    asOfDate: new Date(asOfDate).toISOString(),
    currency: BASE_CURRENCY,
    isBalanced,
    assets: {
      items: assets,
      total: Number(totalAssets.toFixed(3))
    },
    liabilities: {
      items: liabilities,
      total: Number(totalLiabilities.toFixed(3))
    },
    equity: {
      items: [
        ...equity,
        {
          code: '3099',
          name: 'Current Period Net Income (P&L)',
          type: 'EQUITY',
          subType: 'EQUITY',
          netBalance: currentPeriodProfit
        }
      ],
      total: Number(totalEquity.toFixed(3))
    },
    totalAssets: Number(totalAssets.toFixed(3)),
    totalLiabilitiesAndEquity: Number(totalLiabilitiesAndEquity.toFixed(3)),
    difference: Number(diff.toFixed(3))
  };
};

/**
 * Generates the Income Statement (Profit & Loss / P&L).
 */
const getIncomeStatement = async ({ fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1), toDate = new Date() }) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const accounts = await prisma.account.findMany({
    where: {
      type: { in: ['REVENUE', 'COGS', 'EXPENSE'] },
      isActive: true
    },
    include: {
      journalLines: {
        where: {
          journalEntry: {
            date: { gte: from, lte: to },
            status: 'POSTED'
          }
        },
        select: {
          baseDebit: true,
          baseCredit: true
        }
      }
    }
  });

  const revenues = [];
  const cogs = [];
  const expenses = [];

  let totalRevenue = new Decimal(0);
  let totalCogs = new Decimal(0);
  let totalExpenses = new Decimal(0);

  accounts.forEach(acc => {
    let debits = new Decimal(0);
    let credits = new Decimal(0);

    acc.journalLines.forEach(l => {
      debits = debits.plus(roundDec(l.baseDebit));
      credits = credits.plus(roundDec(l.baseCredit));
    });

    let net = new Decimal(0);
    if (acc.type === 'REVENUE') {
      net = credits.minus(debits);
      totalRevenue = totalRevenue.plus(net);
      revenues.push({ code: acc.code, name: acc.name, amount: toApiAmount(net) });
    } else if (acc.type === 'COGS') {
      net = debits.minus(credits);
      totalCogs = totalCogs.plus(net);
      cogs.push({ code: acc.code, name: acc.name, amount: toApiAmount(net) });
    } else if (acc.type === 'EXPENSE') {
      net = debits.minus(credits);
      totalExpenses = totalExpenses.plus(net);
      expenses.push({ code: acc.code, name: acc.name, amount: toApiAmount(net) });
    }
  });

  const grossProfit = totalRevenue.minus(totalCogs);
  const grossMarginPercent = totalRevenue.gt(0)
    ? Number(grossProfit.dividedBy(totalRevenue).times(100).toFixed(1))
    : 0;

  const netIncome = grossProfit.minus(totalExpenses);

  return {
    period: {
      fromDate: from.toISOString(),
      toDate: to.toISOString()
    },
    currency: BASE_CURRENCY,
    revenue: {
      items: revenues,
      total: toApiAmount(totalRevenue)
    },
    costOfGoodsSold: {
      items: cogs,
      total: toApiAmount(totalCogs)
    },
    grossProfit: toApiAmount(grossProfit),
    grossMarginPercent,
    operatingExpenses: {
      items: expenses,
      total: toApiAmount(totalExpenses)
    },
    netIncome: toApiAmount(netIncome)
  };
};

/**
 * Itemized General Ledger drill-down for a single account.
 */
const getAccountLedger = async ({ accountCode, fromDate, toDate, page = 1, limit = 50 }) => {
  const account = await prisma.account.findUnique({
    where: { code: accountCode }
  });
  if (!account) {
    const error = new Error(`Account "${accountCode}" not found.`);
    error.statusCode = 404;
    throw error;
  }

  const where = {
    accountId: account.id,
    journalEntry: {
      status: 'POSTED'
    }
  };

  if (fromDate || toDate) {
    where.journalEntry.date = {};
    if (fromDate) where.journalEntry.date.gte = new Date(fromDate);
    if (toDate) where.journalEntry.date.lte = new Date(toDate);
  }

  const [lines, total] = await Promise.all([
    prisma.journalEntryLine.findMany({
      where,
      include: {
        journalEntry: {
          select: {
            entryNumber: true,
            date: true,
            reference: true,
            sourceType: true,
            notes: true
          }
        },
        organization: {
          select: { id: true, name: true }
        },
        shipment: {
          select: { id: true, trackingNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.journalEntryLine.count({ where })
  ]);

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      currency: account.currency,
      currentBalance: toApiAmount(account.balance)
    },
    lines: lines.map(l => ({
      id: l.id,
      date: l.journalEntry.date,
      entryNumber: l.journalEntry.entryNumber,
      sourceType: l.journalEntry.sourceType,
      reference: l.journalEntry.reference,
      trackingNumber: l.shipment?.trackingNumber,
      organizationName: l.organization?.name,
      debit: toApiAmount(l.baseDebit),
      credit: toApiAmount(l.baseCredit),
      memo: l.memo
    })),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Lists Journal Entries with pagination & filter.
 */
const listJournalEntries = async ({ page = 1, limit = 20, sourceType, status, fromDate, toDate }) => {
  const where = {};
  if (sourceType) where.sourceType = sourceType;
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.date = {};
    if (fromDate) where.date.gte = new Date(fromDate);
    if (toDate) where.date.lte = new Date(toDate);
  }

  const [items, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: {
            account: { select: { code: true, name: true, type: true } },
            organization: { select: { name: true } }
          }
        },
        createdByUser: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.journalEntry.count({ where })
  ]);

  return {
    items: items.map(e => ({
      id: e.id,
      entryNumber: e.entryNumber,
      date: e.date,
      reference: e.reference,
      sourceType: e.sourceType,
      status: e.status,
      notes: e.notes,
      totalAmount: toApiAmount(e.totalDebit),
      createdBy: e.createdByUser?.name || 'System',
      lines: e.lines.map(l => ({
        id: l.id,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountType: l.account.type,
        orgName: l.organization?.name,
        debit: toApiAmount(l.baseDebit),
        credit: toApiAmount(l.baseCredit),
        memo: l.memo
      }))
    })),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Lists Chart of Accounts.
 */
const listAccounts = async ({ type, activeOnly = true } = {}) => {
  const where = {};
  if (type) where.type = type;
  if (activeOnly) where.isActive = true;
  return await prisma.account.findMany({
    where,
    orderBy: { code: 'asc' }
  });
};

/**
 * Creates a new custom Account in Chart of Accounts.
 */
const createAccount = async (data) => {
  return await prisma.account.create({
    data: {
      code: String(data.code).trim(),
      name: String(data.name).trim(),
      type: data.type,
      subType: data.subType || null,
      currency: data.currency || BASE_CURRENCY,
      description: data.description || null,
      isActive: true,
      isSystem: false
    }
  });
};

/**
 * Lists all accounting periods.
 */
const listAccountingPeriods = async () => {
  return await prisma.accountingPeriod.findMany({
    orderBy: { startDate: 'desc' }
  });
};

/**
 * Closes an accounting period (locks against modifications).
 */
const closeAccountingPeriod = async (periodId, closedById) => {
  const period = await prisma.accountingPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    const error = new Error('Accounting period not found.');
    error.statusCode = 404;
    throw error;
  }
  if (period.isClosed) {
    const error = new Error('Accounting period is already closed.');
    error.statusCode = 400;
    throw error;
  }
  return await prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      isClosed: true,
      closedAt: new Date(),
      closedById: closedById || null
    }
  });
};

/**
 * Re-opens a closed accounting period (Admin only).
 */
const reopenAccountingPeriod = async (periodId) => {
  const period = await prisma.accountingPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    const error = new Error('Accounting period not found.');
    error.statusCode = 404;
    throw error;
  }
  return await prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      isClosed: false,
      closedAt: null,
      closedById: null
    }
  });
};

/**
 * Operational Auto-Posting: Shipment Booking
 * Dr 1100 Accounts Receivable (Customer Price)
 * Cr 4010 Freight Revenue (Customer Price)
 * Dr 5010 Carrier Direct Expense (Wholesale Rate)
 * Cr 2010 Accounts Payable - Carrier (Wholesale Rate)
 */
const postShipmentBookingEntry = async ({
  shipmentId,
  trackingNumber,
  organizationId,
  customerPrice = 0,
  carrierCost = 0,
  carrierCode = 'INTERNAL',
  currency = BASE_CURRENCY,
  createdById
}, txClient = prisma) => {
  const custPrice = roundDec(customerPrice);
  const costPrice = roundDec(carrierCost);
  const lines = [];

  if (custPrice.gt(0)) {
    lines.push({
      accountCode: '1100', // Accounts Receivable
      organizationId,
      shipmentId,
      debit: custPrice,
      credit: 0,
      currency,
      memo: `AR for shipment ${trackingNumber}`
    });
    lines.push({
      accountCode: '4010', // Freight Revenue
      organizationId,
      shipmentId,
      debit: 0,
      credit: custPrice,
      currency,
      memo: `Freight revenue for ${trackingNumber}`
    });
  }

  if (costPrice.gt(0) && carrierCode !== 'INTERNAL') {
    lines.push({
      accountCode: '5010', // Carrier Direct Expense
      organizationId,
      shipmentId,
      debit: costPrice,
      credit: 0,
      currency,
      memo: `Carrier wholesale expense for ${trackingNumber} (${carrierCode})`
    });
    lines.push({
      accountCode: '2010', // Carrier Accounts Payable
      organizationId,
      shipmentId,
      debit: 0,
      credit: costPrice,
      currency,
      memo: `Carrier AP payable for ${trackingNumber} (${carrierCode})`
    });
  }

  if (lines.length < 2) {
    return null; // Nothing to post (e.g. 0 price test)
  }

  return await postJournalEntry({
    entryNumber: `JE-SHP-${trackingNumber}-${Date.now().toString().slice(-4)}`,
    date: new Date(),
    reference: trackingNumber,
    sourceType: 'SHIPMENT_BOOKING',
    sourceId: shipmentId,
    notes: `Automated booking entry for AWB ${trackingNumber} (${carrierCode})`,
    createdById,
    lines
  }, txClient);
};

/**
 * Operational Auto-Posting: Customer Payment Receipt
 * Dr 1010 Bank / Safe Cash
 * Cr 1100 Accounts Receivable
 */
const postPaymentReceiptEntry = async ({
  paymentId,
  reference,
  organizationId,
  amount,
  currency = BASE_CURRENCY,
  bankAccountGlCode = '1010',
  createdById
}, txClient = prisma) => {
  const decAmount = roundDec(amount);
  if (decAmount.lte(0)) return null;

  return await postJournalEntry({
    entryNumber: `JE-PAY-${Date.now().toString().slice(-6)}`,
    date: new Date(),
    reference: reference || `PAY-${paymentId}`,
    sourceType: 'PAYMENT',
    sourceId: paymentId,
    notes: `Customer payment received: ${reference || paymentId}`,
    createdById,
    lines: [
      {
        accountCode: bankAccountGlCode,
        organizationId,
        debit: decAmount,
        credit: 0,
        currency,
        memo: `Receipt into ${bankAccountGlCode} for ${reference || paymentId}`
      },
      {
        accountCode: '1100', // Accounts Receivable
        organizationId,
        debit: 0,
        credit: decAmount,
        currency,
        memo: `AR reduction for payment ${reference || paymentId}`
      }
    ]
  }, txClient);
};

/**
 * Operational Auto-Posting: Driver COD Remittance Handover to Hub Vault
 * Dr 1030 Hub Vault Safe
 * Cr 1020 Cash in Transit - Drivers COD
 */
const postDriverCodRemittanceEntry = async ({
  driverId,
  driverName,
  amount,
  currency = BASE_CURRENCY,
  bagReference,
  shipmentIds = [],
  verifiedById
}, txClient = prisma) => {
  const decAmount = roundDec(amount);
  if (decAmount.lte(0)) return null;

  return await postJournalEntry({
    entryNumber: `JE-COD-${Date.now().toString().slice(-6)}`,
    date: new Date(),
    reference: bagReference || `DRIVER-${driverId}`,
    sourceType: 'COD_SETTLEMENT',
    sourceId: driverId,
    notes: `Driver COD handover to Hub Vault from ${driverName} (Bag: ${bagReference || 'N/A'})`,
    createdById: verifiedById,
    approvedById: verifiedById,
    lines: [
      {
        accountCode: '1030', // Hub Vault Safe
        debit: decAmount,
        credit: 0,
        currency,
        memo: `Vault safe deposit from driver ${driverName} (${shipmentIds.length} shipments)`
      },
      {
        accountCode: '1020', // Cash in Transit Driver COD
        debit: 0,
        credit: decAmount,
        currency,
        memo: `Clear driver cash-in-transit for ${driverName}`
      }
    ]
  }, txClient);
};

/**
 * Operational Auto-Posting: Merchant COD Settlement Payout
 * Dr 2100 Merchant Escrow Payable (Gross COD)
 * Cr 1100 Accounts Receivable (Freight Deductions)
 * Cr 4040 COD Handling Fee Revenue (Platform commission)
 * Cr 1010 Bank (Net wire to merchant)
 */
const postMerchantSettlementEntry = async ({
  organizationId,
  grossCodAmount,
  freightDeductions = 0,
  handlingFee = 0,
  netPayout,
  currency = BASE_CURRENCY,
  bankAccountGlCode = '1010',
  reference,
  createdById
}, txClient = prisma) => {
  const gross = roundDec(grossCodAmount);
  const freight = roundDec(freightDeductions);
  const fee = roundDec(handlingFee);
  const payout = roundDec(netPayout);

  const lines = [
    {
      accountCode: '2100', // Merchant Escrow Payable
      organizationId,
      debit: gross,
      credit: 0,
      currency,
      memo: `Release merchant escrow: ${reference}`
    }
  ];

  if (freight.gt(0)) {
    lines.push({
      accountCode: '1100', // Accounts Receivable
      organizationId,
      debit: 0,
      credit: freight,
      currency,
      memo: `Freight deduction from COD settlement: ${reference}`
    });
  }

  if (fee.gt(0)) {
    lines.push({
      accountCode: '4040', // COD Handling Fee Revenue
      organizationId,
      debit: 0,
      credit: fee,
      currency,
      memo: `COD handling fee charged: ${reference}`
    });
  }

  if (payout.gt(0)) {
    lines.push({
      accountCode: bankAccountGlCode,
      organizationId,
      debit: 0,
      credit: payout,
      currency,
      memo: `Net wire payout to merchant: ${reference}`
    });
  }

  return await postJournalEntry({
    entryNumber: `JE-SETTL-${Date.now().toString().slice(-6)}`,
    date: new Date(),
    reference: reference || `SETTL-${Date.now()}`,
    sourceType: 'COD_SETTLEMENT',
    sourceId: organizationId,
    notes: `Merchant COD settlement payout: Gross ${gross.toFixed(3)}, Freight ${freight.toFixed(3)}, Fee ${fee.toFixed(3)}, Net ${payout.toFixed(3)} ${currency}`,
    createdById,
    lines
  }, txClient);
};

module.exports = {
  postJournalEntry,
  reverseJournalEntry,
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  getAccountLedger,
  listJournalEntries,
  listAccounts,
  createAccount,
  listAccountingPeriods,
  closeAccountingPeriod,
  reopenAccountingPeriod,
  postShipmentBookingEntry,
  postPaymentReceiptEntry,
  postDriverCodRemittanceEntry,
  postMerchantSettlementEntry,
  getOrCreateOpenPeriod,
  BASE_CURRENCY
};
