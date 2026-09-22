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
 * Lists all registered Vendors.
 */
const listVendors = async ({ activeOnly = true } = {}) => {
  const where = {};
  if (activeOnly) where.active = true;
  return await prisma.vendor.findMany({
    where,
    orderBy: { name: 'asc' }
  });
};

/**
 * Creates a new vendor (e.g. Carrier, Broker, Airline, Fleet).
 */
const createVendor = async (data) => {
  return await prisma.vendor.create({
    data: {
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      carrierCode: data.carrierCode ? data.carrierCode.trim().toUpperCase() : null,
      currency: data.currency || 'KWD',
      contactPerson: data.contactPerson || null,
      email: data.email || null,
      phone: data.phone || null,
      termsDays: Number(data.termsDays || 30),
      active: true
    }
  });
};

/**
 * Lists Accounts Payable bills with filters and pagination.
 */
const listBills = async ({ vendorId, status, fromDate, toDate, page = 1, limit = 20 } = {}) => {
  const where = {};
  if (vendorId) where.vendorId = vendorId;
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.issueDate = {};
    if (fromDate) where.issueDate.gte = new Date(fromDate);
    if (toDate) where.issueDate.lte = new Date(toDate);
  }

  const [items, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true, code: true, carrierCode: true } },
        lines: { select: { id: true, description: true, amount: true, trackingNumber: true } },
        payments: {
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            reference: true,
            method: true,
            bankAccount: { select: { accountName: true } }
          }
        }
      },
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.bill.count({ where })
  ]);

  return {
    bills: items.map(b => {
      const subtotal = toApiAmount(b.subtotal);
      const tax = toApiAmount(b.tax);
      const totalAmount = toApiAmount(b.total);
      const paidAmount = toApiAmount(b.paidAmount);
      const remainingBalance = Number(Math.max(0, totalAmount - paidAmount).toFixed(3));

      return {
        id: b.id,
        billNumber: b.billNumber,
        vendor: b.vendor,
        issueDate: b.issueDate,
        dueDate: b.dueDate,
        currency: b.currency,
        subtotal,
        tax,
        total: totalAmount,
        paidAmount,
        remainingBalance,
        status: b.status,
        notes: b.notes,
        linesCount: b.lines.length,
        lines: b.lines.map(l => ({ ...l, amount: toApiAmount(l.amount) })),
        payments: b.payments.map(p => ({ ...p, amount: toApiAmount(p.amount) }))
      };
    }),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Creates a Vendor Bill and posts corresponding Double-Entry Journal Entry.
 * Dr 5010 Carrier Direct Expense / 60xx OpEx
 * Cr 2010 Carrier AP / 2020 Trade Vendor AP
 */
const createBill = async (billData, userId) => {
  const {
    vendorId,
    billNumber,
    issueDate = new Date(),
    dueDate,
    currency = 'KWD',
    tax = 0,
    notes,
    lines = []
  } = billData;

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  if (!lines || lines.length === 0) {
    const err = new Error('Bill must contain at least one line item');
    err.statusCode = 400;
    throw err;
  }

  let subtotal = new Decimal(0);
  for (const line of lines) {
    const amt = roundDec(line.amount);
    if (amt.lte(0)) {
      const err = new Error('Line amount must be greater than zero');
      err.statusCode = 400;
      throw err;
    }
    subtotal = subtotal.plus(amt);
  }

  const decTax = roundDec(tax);
  const total = subtotal.plus(decTax);

  // Default due date: issueDate + vendor.termsDays
  const calculatedDueDate = dueDate
    ? new Date(dueDate)
    : new Date(new Date(issueDate).getTime() + (vendor.termsDays || 30) * 24 * 60 * 60 * 1000);

  // Determine AP account: if carrier-linked use 2010, else 2020
  const apAccountCode = vendor.carrierCode ? '2010' : '2020';

  return await prisma.$transaction(async (tx) => {
    // 1. Create Bill
    const bill = await tx.bill.create({
      data: {
        billNumber: billNumber || `BILL-${vendor.code}-${Date.now().toString().slice(-6)}`,
        vendorId,
        issueDate: new Date(issueDate),
        dueDate: calculatedDueDate,
        subtotal: subtotal.toNumber(),
        tax: decTax.toNumber(),
        total: total.toNumber(),
        paidAmount: 0,
        currency,
        status: 'OPEN',
        notes,
        createdById: userId || null
      }
    });

    // 2. Create Bill Lines
    for (const line of lines) {
      let lineAccount = null;
      if (line.accountCode) {
        lineAccount = await tx.account.findUnique({ where: { code: line.accountCode } });
      }
      if (!lineAccount) {
        // Fallback: 5010 for carrier or 6020 for general
        const defaultCode = vendor.carrierCode ? '5010' : '6020';
        lineAccount = await tx.account.findUnique({ where: { code: defaultCode } });
      }

      await tx.billLine.create({
        data: {
          billId: bill.id,
          accountId: lineAccount.id,
          shipmentId: line.shipmentId || null,
          trackingNumber: line.trackingNumber || null,
          description: line.description || `Charge from ${vendor.name}`,
          amount: roundDec(line.amount).toNumber()
        }
      });
    }

    // 3. Post Double-Entry Journal Entry
    const jeLines = [];
    for (const line of lines) {
      jeLines.push({
        accountCode: line.accountCode || (vendor.carrierCode ? '5010' : '6020'),
        debit: roundDec(line.amount),
        credit: 0,
        currency,
        memo: line.description || `Bill line for ${bill.billNumber}`
      });
    }

    if (decTax.gt(0)) {
      jeLines.push({
        accountCode: '1150', // Customs / Input Tax Advances
        debit: decTax,
        credit: 0,
        currency,
        memo: `Tax/customs on bill ${bill.billNumber}`
      });
    }

    // Credit AP
    jeLines.push({
      accountCode: apAccountCode,
      debit: 0,
      credit: total,
      currency,
      memo: `AP payable to ${vendor.name} for ${bill.billNumber}`
    });

    await generalLedgerService.postJournalEntry({
      entryNumber: `JE-${bill.billNumber}`,
      date: new Date(issueDate),
      reference: bill.billNumber,
      sourceType: 'CARRIER_BILL',
      sourceId: bill.id,
      notes: `Vendor Bill from ${vendor.name}: ${bill.billNumber}`,
      createdById: userId,
      lines: jeLines
    }, tx);

    return bill;
  });
};

/**
 * Disburses a payment for a Vendor Bill.
 * Dr 2010 / 2020 Accounts Payable
 * Cr 1010 Bank / Cash
 */
const payBill = async ({
  billId,
  bankAccountId,
  amount,
  paymentDate = new Date(),
  reference,
  method = 'bank_transfer',
  notes,
  userId
}) => {
  const payAmount = roundDec(amount);
  if (payAmount.lte(0)) {
    const err = new Error('Payment amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  return await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: { vendor: true }
    });

    if (!bill) {
      const err = new Error('Bill not found');
      err.statusCode = 404;
      throw err;
    }

    if (bill.status === 'PAID') {
      const err = new Error('Bill is already fully paid');
      err.statusCode = 400;
      throw err;
    }

    const bankAccount = await tx.bankAccount.findUnique({
      where: { id: bankAccountId },
      include: { glAccount: true }
    });

    if (!bankAccount) {
      const err = new Error('Bank Account not found');
      err.statusCode = 404;
      throw err;
    }

    const currentPaid = roundDec(bill.paidAmount);
    const newPaid = currentPaid.plus(payAmount);
    const totalBill = roundDec(bill.total);

    const isFullyPaid = newPaid.gte(totalBill.minus(0.001));
    const newStatus = isFullyPaid ? 'PAID' : 'PARTIALLY_PAID';

    // 1. Record BillPayment
    const billPayment = await tx.billPayment.create({
      data: {
        billId: bill.id,
        bankAccountId,
        paymentDate: new Date(paymentDate),
        amount: payAmount.toNumber(),
        currency: bill.currency,
        reference: reference || `PAY-${bill.billNumber}-${Date.now().toString().slice(-4)}`,
        method,
        notes,
        createdById: userId || null
      }
    });

    // 2. Update Bill paid amount & status
    await tx.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: newPaid.toNumber(),
        status: newStatus
      }
    });

    // 3. Decrement Bank Account balance
    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        currentBalance: {
          decrement: payAmount.toNumber()
        }
      }
    });

    // 4. Record Bank Transaction record
    await tx.bankTransaction.create({
      data: {
        bankAccountId,
        transactionDate: new Date(paymentDate),
        amount: payAmount.times(-1).toNumber(), // negative for disbursement
        currency: bill.currency,
        reference: billPayment.reference,
        description: `Payment to ${bill.vendor.name} for ${bill.billNumber}`,
        matchedType: 'BILL_PAYMENT',
        matchedId: billPayment.id,
        isReconciled: true,
        reconciledAt: new Date(),
        reconciledById: userId || null
      }
    });

    // 5. Post Double-Entry Journal Entry
    // Dr AP, Cr Bank GL Account
    const apAccountCode = bill.vendor.carrierCode ? '2010' : '2020';
    const bankGlCode = bankAccount.glAccount.code;

    await generalLedgerService.postJournalEntry({
      entryNumber: `JE-BPAY-${Date.now().toString().slice(-6)}`,
      date: new Date(paymentDate),
      reference: billPayment.reference,
      sourceType: 'CARRIER_BILL',
      sourceId: bill.id,
      notes: `Bill payment to ${bill.vendor.name} for ${bill.billNumber} via ${bankAccount.accountName}`,
      createdById: userId,
      lines: [
        {
          accountCode: apAccountCode,
          debit: payAmount,
          credit: 0,
          currency: bill.currency,
          memo: `AP settlement for ${bill.billNumber}`
        },
        {
          accountCode: bankGlCode,
          debit: 0,
          credit: payAmount,
          currency: bill.currency,
          memo: `Disbursement from ${bankAccount.accountName}`
        }
      ]
    }, tx);

    return {
      billPayment,
      billStatus: newStatus,
      paidAmount: toApiAmount(newPaid),
      remainingBalance: toApiAmount(Decimal.max(0, totalBill.minus(newPaid)))
    };
  });
};

/**
 * 3-Way Carrier Invoice Reconciliation.
 * Matches invoice line AWBs against DB shipments and checks expected wholesale cost.
 */
const reconcileCarrierInvoice = async ({ vendorId, csvLines = [] }) => {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) {
    const err = new Error('Vendor not found');
    err.statusCode = 404;
    throw err;
  }

  const results = [];
  let totalBilled = new Decimal(0);
  let totalExpected = new Decimal(0);
  let matchedCount = 0;
  let mismatchedCount = 0;
  let notFoundCount = 0;

  for (const line of csvLines) {
    const tracking = String(line.trackingNumber || line.awb || '').trim();
    const billedAmount = roundDec(line.amount || line.cost || 0);
    totalBilled = totalBilled.plus(billedAmount);

    if (!tracking) continue;

    const shipment = await prisma.shipment.findFirst({
      where: {
        OR: [
          { trackingNumber: tracking },
          { carrierTrackingNumber: tracking }
        ]
      },
      select: {
        id: true,
        trackingNumber: true,
        carrierTrackingNumber: true,
        carrierCode: true,
        costPrice: true,
        pricingSnapshot: true,
        status: true
      }
    });

    if (!shipment) {
      notFoundCount++;
      results.push({
        trackingNumber: tracking,
        status: 'NOT_FOUND',
        billedAmount: toApiAmount(billedAmount),
        expectedAmount: 0,
        difference: toApiAmount(billedAmount),
        notes: 'Shipment not found in Target platform'
      });
      continue;
    }

    const expectedCost = roundDec(shipment.pricingSnapshot?.carrierRate || shipment.costPrice || 0);
    totalExpected = totalExpected.plus(expectedCost);

    const diff = billedAmount.minus(expectedCost);
    const isMatched = diff.abs().lte(0.005);

    if (isMatched) {
      matchedCount++;
    } else {
      mismatchedCount++;
    }

    results.push({
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierTrackingNumber: shipment.carrierTrackingNumber,
      carrierCode: shipment.carrierCode,
      status: isMatched ? 'MATCHED' : 'DISCREPANCY',
      billedAmount: toApiAmount(billedAmount),
      expectedAmount: toApiAmount(expectedCost),
      difference: toApiAmount(diff),
      notes: isMatched ? 'Exact match' : `Discrepancy of ${toApiAmount(diff)} KWD`
    });
  }

  return {
    vendor: { id: vendor.id, name: vendor.name, code: vendor.code },
    totalLines: csvLines.length,
    matchedCount,
    mismatchedCount,
    notFoundCount,
    totalBilled: toApiAmount(totalBilled),
    totalExpected: toApiAmount(totalExpected),
    totalDiscrepancy: toApiAmount(totalBilled.minus(totalExpected)),
    lines: results
  };
};

module.exports = {
  listVendors,
  createVendor,
  listBills,
  createBill,
  payBill,
  reconcileCarrierInvoice
};
