const { prisma } = require('../config/database');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');
const generalLedgerService = require('./generalLedger.service');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const roundDec = (val) => {
  if (val instanceof Decimal) return val;
  return new Decimal(val || 0);
};

const toApiAmount = (val) => Number(roundDec(val).toFixed(3));

/**
 * Lists all company bank accounts with their linked GL accounts.
 */
const listBankAccounts = async ({ activeOnly = true } = {}) => {
  const where = {};
  if (activeOnly) where.active = true;

  const accounts = await prisma.bankAccount.findMany({
    where,
    include: {
      glAccount: {
        select: { id: true, code: true, name: true, type: true, balance: true }
      }
    },
    orderBy: { accountName: 'asc' }
  });

  return accounts.map(a => ({
    id: a.id,
    accountName: a.accountName,
    accountNumber: a.accountNumber,
    bankName: a.bankName,
    iban: a.iban,
    swiftCode: a.swiftCode,
    currency: a.currency,
    currentBalance: toApiAmount(a.currentBalance),
    glAccount: {
      id: a.glAccount.id,
      code: a.glAccount.code,
      name: a.glAccount.name,
      balance: toApiAmount(a.glAccount.balance)
    },
    active: a.active,
    createdAt: a.createdAt
  }));
};

/**
 * Creates a new Bank Account linked to a GL Account.
 */
const createBankAccount = async (data) => {
  const { accountName, accountNumber, bankName, iban, swiftCode, currency = 'KWD', glAccountId } = data;

  let glAccount = null;
  if (glAccountId) {
    glAccount = await prisma.account.findUnique({ where: { id: glAccountId } });
  }
  if (!glAccount) {
    // Default to 1010 NBK Operating Cash
    glAccount = await prisma.account.findUnique({ where: { code: '1010' } });
  }

  if (!glAccount) {
    const err = new Error('GL Account not found for Bank Account linkage');
    err.statusCode = 404;
    throw err;
  }

  return await prisma.bankAccount.create({
    data: {
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      bankName: bankName.trim(),
      iban: iban ? iban.trim() : null,
      swiftCode: swiftCode ? swiftCode.trim() : null,
      currency,
      glAccountId: glAccount.id,
      currentBalance: 0,
      active: true
    },
    include: {
      glAccount: true
    }
  });
};

/**
 * Lists Bank Transactions with pagination and reconciliation status.
 */
const getBankTransactions = async ({ bankAccountId, isReconciled, fromDate, toDate, page = 1, limit = 50 } = {}) => {
  const where = {};
  if (bankAccountId) where.bankAccountId = bankAccountId;
  if (isReconciled !== undefined && isReconciled !== null) where.isReconciled = isReconciled;
  if (fromDate || toDate) {
    where.transactionDate = {};
    if (fromDate) where.transactionDate.gte = new Date(fromDate);
    if (toDate) where.transactionDate.lte = new Date(toDate);
  }

  const [items, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      include: {
        bankAccount: { select: { accountName: true, currency: true } }
      },
      orderBy: { transactionDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.bankTransaction.count({ where })
  ]);

  return {
    transactions: items.map(t => ({
      id: t.id,
      bankAccountId: t.bankAccountId,
      bankAccountName: t.bankAccount.accountName,
      transactionDate: t.transactionDate,
      amount: toApiAmount(t.amount),
      currency: t.currency,
      reference: t.reference,
      description: t.description,
      matchedType: t.matchedType,
      matchedId: t.matchedId,
      isReconciled: t.isReconciled,
      reconciledAt: t.reconciledAt
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
 * Imports bank statement lines (from CSV/MT940/API).
 */
const importBankStatementLines = async ({ bankAccountId, lines = [] }) => {
  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!bankAccount) {
    const err = new Error('Bank Account not found');
    err.statusCode = 404;
    throw err;
  }

  const created = [];
  let totalInflow = new Decimal(0);
  let totalOutflow = new Decimal(0);

  for (const l of lines) {
    const amt = roundDec(l.amount);
    if (amt.isZero()) continue;

    if (amt.gt(0)) {
      totalInflow = totalInflow.plus(amt);
    } else {
      totalOutflow = totalOutflow.plus(amt.abs());
    }

    const tx = await prisma.bankTransaction.create({
      data: {
        bankAccountId,
        transactionDate: l.date ? new Date(l.date) : new Date(),
        amount: amt.toNumber(),
        currency: l.currency || bankAccount.currency,
        reference: l.reference ? String(l.reference).trim() : null,
        description: l.description ? String(l.description).trim() : 'Bank statement entry',
        isReconciled: false
      }
    });
    created.push(tx);
  }

  // Update bank account balance
  const netChange = totalInflow.minus(totalOutflow);
  await prisma.bankAccount.update({
    where: { id: bankAccountId },
    data: {
      currentBalance: {
        increment: netChange.toNumber()
      }
    }
  });

  return {
    importedCount: created.length,
    totalInflow: toApiAmount(totalInflow),
    totalOutflow: toApiAmount(totalOutflow),
    netChange: toApiAmount(netChange)
  };
};

/**
 * Reconciles a bank transaction with an internal system entity (Payment or BillPayment).
 */
const reconcileTransaction = async ({ transactionId, matchedType, matchedId, userId }) => {
  const tx = await prisma.bankTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) {
    const err = new Error('Bank transaction not found');
    err.statusCode = 404;
    throw err;
  }

  return await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      matchedType: matchedType || null,
      matchedId: matchedId || null,
      isReconciled: true,
      reconciledAt: new Date(),
      reconciledById: userId || null
    }
  });
};

/**
 * Treasury Position Summary:
 * - Bank Balances (Operating Accounts)
 * - Vault Safe Cash (1030)
 * - Cash in Transit with Drivers (1020)
 */
const getTreasurySummary = async () => {
  const [bankAccounts, vaultSafeAccount, transitAccount] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true },
      include: { glAccount: { select: { balance: true } } }
    }),
    prisma.account.findUnique({ where: { code: '1030' } }),
    prisma.account.findUnique({ where: { code: '1020' } })
  ]);

  const totalBankCash = bankAccounts.reduce((sum, b) => sum.plus(roundDec(b.currentBalance)), new Decimal(0));
  const vaultSafeCash = roundDec(vaultSafeAccount?.balance || 0);
  const cashInTransit = roundDec(transitAccount?.balance || 0);
  const totalLiquidAssets = totalBankCash.plus(vaultSafeCash).plus(cashInTransit);

  return {
    currency: 'KWD',
    totalLiquidAssets: toApiAmount(totalLiquidAssets),
    breakdown: {
      bankCash: toApiAmount(totalBankCash),
      vaultSafeCash: toApiAmount(vaultSafeCash),
      cashInTransitDrivers: toApiAmount(cashInTransit)
    },
    bankAccounts: bankAccounts.map(b => ({
      id: b.id,
      name: b.accountName,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      currency: b.currency,
      currentBalance: toApiAmount(b.currentBalance)
    }))
  };
};

module.exports = {
  listBankAccounts,
  createBankAccount,
  getBankTransactions,
  importBankStatementLines,
  reconcileTransaction,
  getTreasurySummary
};
