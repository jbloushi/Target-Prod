const { prisma } = require('../config/database');
const { Decimal } = require('decimal.js');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const BASE_CURRENCY = 'KWD';
const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'];

const normalizeAmount = (value) => {
    if (value instanceof Decimal) return value;
    return new Decimal(value || 0);
};

const normalizeCurrencyCode = (currency, fallback = BASE_CURRENCY) => {
    const value = String(currency || fallback || BASE_CURRENCY).trim().toUpperCase().slice(0, 3);
    return value || BASE_CURRENCY;
};

const toApiAmount = (decimalValue) => {
    return Number(normalizeAmount(decimalValue).toFixed(3));
};

const makeClientError = (message, statusCode = 400, code = 'FINANCE_VALIDATION_ERROR') => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const getShipmentCurrency = (shipment) => normalizeCurrencyCode(
    shipment?.pricingSnapshot?.billingCurrency || shipment?.pricingSnapshot?.currency || shipment?.currency
);

const getShipmentChargeAmount = (shipment) => {
    if (!shipment) return new Decimal(0);
    if (shipment.pricingSnapshot?.totalPrice !== undefined && shipment.pricingSnapshot?.totalPrice !== null) {
        return normalizeAmount(shipment.pricingSnapshot.totalPrice);
    }
    if (shipment.price !== undefined && shipment.price !== null) {
        return normalizeAmount(shipment.price);
    }
    return new Decimal(0);
};

const getOrganizationCurrency = async (organizationId, txClient = prisma) => {
    if (!organizationId) return BASE_CURRENCY;
    const org = await txClient.organization.findUnique({
        where: { id: organizationId },
        select: { currency: true }
    });
    return normalizeCurrencyCode(org?.currency);
};

const emptyBuckets = () => AGING_BUCKETS.reduce((acc, bucket) => ({ ...acc, [bucket]: 0 }), {});

const signedAmount = (entryType, amount) => normalizeAmount(amount).times(entryType === 'DEBIT' ? 1 : -1);

const getOrganizationBalance = async (organizationId, currency = null) => {
    if (!organizationId && organizationId !== null) return 0;
    const balanceCurrency = normalizeCurrencyCode(currency || await getOrganizationCurrency(organizationId));

    const totals = await prisma.organizationLedger.groupBy({
        by: ['entryType'],
        where: { organizationId: organizationId || null, currency: balanceCurrency },
        _sum: { amount: true }
    });

    const debitTotal = totals.find(row => row.entryType === 'DEBIT')?._sum.amount || 0;
    const creditTotal = totals.find(row => row.entryType === 'CREDIT')?._sum.amount || 0;
    return toApiAmount(normalizeAmount(debitTotal).minus(creditTotal));
};

const getOrganizationBalancesByCurrency = async (organizationId) => {
    const totals = await prisma.organizationLedger.groupBy({
        by: ['currency', 'entryType'],
        where: { organizationId: organizationId || null },
        _sum: { amount: true }
    });

    return totals.reduce((acc, row) => {
        const currency = normalizeCurrencyCode(row.currency);
        const current = normalizeAmount(acc[currency] || 0);
        const delta = signedAmount(row.entryType, row._sum.amount || 0);
        acc[currency] = toApiAmount(current.plus(delta));
        return acc;
    }, {});
};

const createLedgerEntry = async (organizationId, entry, externalTx = null) => {
    const amount = normalizeAmount(entry.amount);
    const ledgerCurrency = normalizeCurrencyCode(
        entry.currency || entry.metadata?.currency || entry.metadata?.billingCurrency || entry.metadata?.declaredCurrency
    );
    const transactionAmount = signedAmount(entry.entryType, amount);

    const execute = async (tx) => {
        const lastEntry = await tx.organizationLedger.findFirst({
            where: {
                organizationId: organizationId || null,
                currency: ledgerCurrency
            },
            orderBy: { createdAt: 'desc' }
        });
        const balanceAfter = normalizeAmount(lastEntry?.balanceAfter || 0).plus(transactionAmount);

        if (organizationId) {
            const org = await tx.organization.findUnique({
                where: { id: organizationId },
                select: { currency: true }
            });
            if (normalizeCurrencyCode(org?.currency) === ledgerCurrency) {
                await tx.organization.update({
                    where: { id: organizationId },
                    data: {
                        balance: {
                            increment: toApiAmount(transactionAmount)
                        }
                    }
                });
            }
        }

        return await tx.organizationLedger.create({
            data: {
                organizationId: organizationId || null,
                amount: toApiAmount(amount),
                currency: ledgerCurrency,
                entryType: entry.entryType,
                category: entry.category,
                description: entry.description,
                reference: entry.reference,
                sourceRepo: entry.sourceRepo,
                sourceId: entry.sourceId,
                parentEntryId: entry.parentEntryId,
                balanceAfter: toApiAmount(balanceAfter),
                createdBy: entry.createdBy,
                metadata: {
                    ...(entry.metadata || {}),
                    currency: ledgerCurrency
                }
            }
        });
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
};

const getAccountCredit = async (organizationId, currency = null) => {
    return getUnappliedCash(organizationId, currency);
};

const getAllocationTotal = async ({ organizationId, shipmentId, paymentId, currency }, txClient = prisma) => {
    const where = { status: 'ACTIVE' };
    if (organizationId !== undefined) where.organizationId = organizationId;
    if (shipmentId) where.shipmentId = shipmentId;
    if (paymentId) where.paymentId = paymentId;
    if (currency) where.currency = normalizeCurrencyCode(currency);

    const summary = await txClient.paymentAllocation.aggregate({
        where,
        _sum: { amount: true }
    });

    return normalizeAmount(summary._sum.amount || 0);
};

const getUnappliedCashByCurrency = async (organizationId) => {
    const payments = await prisma.payment.findMany({
        where: { organizationId: organizationId || null },
        select: { id: true, amount: true, currency: true }
    });
    const allocations = await prisma.paymentAllocation.groupBy({
        by: ['paymentId'],
        where: { organizationId: organizationId || null, status: 'ACTIVE' },
        _sum: { amount: true }
    });

    const allocationMap = allocations.reduce((acc, item) => {
        acc[item.paymentId] = normalizeAmount(item._sum.amount);
        return acc;
    }, {});

    return payments.reduce((acc, payment) => {
        const currency = normalizeCurrencyCode(payment.currency);
        const unapplied = normalizeAmount(payment.amount).minus(allocationMap[payment.id] || 0);
        acc[currency] = toApiAmount(normalizeAmount(acc[currency] || 0).plus(unapplied));
        return acc;
    }, {});
};

const getUnappliedCash = async (organizationId, currency = null) => {
    const balances = await getUnappliedCashByCurrency(organizationId);
    const targetCurrency = normalizeCurrencyCode(currency || await getOrganizationCurrency(organizationId));
    return toApiAmount(balances[targetCurrency] || 0);
};

const getShipmentAccounting = async (shipmentId, txClient = prisma) => {
    const shipment = await txClient.shipment.findUnique({
        where: { id: shipmentId },
        select: {
            id: true,
            trackingNumber: true,
            organizationId: true,
            status: true,
            price: true,
            pricingSnapshot: true,
            currency: true,
            paid: true,
            totalPaid: true,
            remainingBalance: true,
            createdAt: true
        }
    });
    if (!shipment) return null;

    const currency = getShipmentCurrency(shipment);
    const totalCharge = getShipmentChargeAmount(shipment);
    const allocated = await getAllocationTotal({ shipmentId, currency }, txClient);
    const remaining = totalCharge.minus(allocated);
    const daysOutstanding = Math.floor((Date.now() - new Date(shipment.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    let status = 'unpaid';
    if (allocated.gt(0) && remaining.gt(0)) status = 'partial';
    if (remaining.lte(0.001) && totalCharge.gt(0)) status = 'paid';
    if (remaining.gt(0) && daysOutstanding > 30) status = 'overdue';

    return {
        shipment,
        currency,
        totalCharge: toApiAmount(totalCharge),
        totalPaid: toApiAmount(allocated),
        remainingBalance: toApiAmount(remaining),
        status,
        daysOutstanding
    };
};

const getAgingReport = async (organizationId, currency = null) => {
    const requestedCurrency = currency ? normalizeCurrencyCode(currency) : null;
    const bucketsByCurrency = {};
    const totalsByCurrency = {};

    const shipments = await prisma.shipment.findMany({
        where: { organizationId: organizationId || null },
        select: {
            id: true,
            price: true,
            pricingSnapshot: true,
            currency: true,
            createdAt: true,
            allocations: {
                where: { status: 'ACTIVE' },
                select: { amount: true, currency: true }
            }
        }
    });

    const now = new Date();
    for (const shipment of shipments) {
        const shipmentCurrency = getShipmentCurrency(shipment);
        if (requestedCurrency && shipmentCurrency !== requestedCurrency) continue;

        const totalCharge = getShipmentChargeAmount(shipment);
        const totalAllocated = shipment.allocations
            .filter(allocation => normalizeCurrencyCode(allocation.currency, shipmentCurrency) === shipmentCurrency)
            .reduce((sum, allocation) => sum.plus(normalizeAmount(allocation.amount)), new Decimal(0));
        const remaining = totalCharge.minus(totalAllocated);

        if (remaining.lte(0.001)) continue;

        if (!bucketsByCurrency[shipmentCurrency]) bucketsByCurrency[shipmentCurrency] = emptyBuckets();
        totalsByCurrency[shipmentCurrency] = toApiAmount(normalizeAmount(totalsByCurrency[shipmentCurrency] || 0).plus(remaining));

        const daysOld = Math.floor((now - new Date(shipment.createdAt)) / (1000 * 60 * 60 * 24));
        const bucket = daysOld <= 30 ? '0-30' : daysOld <= 60 ? '31-60' : daysOld <= 90 ? '61-90' : '90+';
        bucketsByCurrency[shipmentCurrency][bucket] = toApiAmount(normalizeAmount(bucketsByCurrency[shipmentCurrency][bucket]).plus(remaining));
    }

    const defaultCurrency = requestedCurrency || normalizeCurrencyCode(await getOrganizationCurrency(organizationId));
    return {
        totalUnpaid: toApiAmount(totalsByCurrency[defaultCurrency] || 0),
        buckets: bucketsByCurrency[defaultCurrency] || emptyBuckets(),
        totalUnpaidByCurrency: totalsByCurrency,
        agingBucketsByCurrency: bucketsByCurrency
    };
};

const getOrganizationOverview = async (organizationId, creditLimit = 0, currency = BASE_CURRENCY) => {
    const baseCurrency = normalizeCurrencyCode(currency || await getOrganizationCurrency(organizationId));
    const [balance, balancesByCurrency, unappliedCash, unappliedCashByCurrency, aging] = await Promise.all([
        getOrganizationBalance(organizationId, baseCurrency),
        getOrganizationBalancesByCurrency(organizationId),
        getUnappliedCash(organizationId, baseCurrency),
        getUnappliedCashByCurrency(organizationId),
        getAgingReport(organizationId, baseCurrency)
    ]);

    const limit = normalizeAmount(creditLimit);
    const bal = normalizeAmount(balance);

    return {
        currency: baseCurrency,
        balance,
        balancesByCurrency: { ...balancesByCurrency, [baseCurrency]: balancesByCurrency[baseCurrency] ?? balance },
        creditLimit: toApiAmount(limit),
        availableCredit: toApiAmount(limit.minus(bal)),
        unappliedCash,
        unappliedCashByCurrency: { ...unappliedCashByCurrency, [baseCurrency]: unappliedCashByCurrency[baseCurrency] ?? unappliedCash },
        totalUnpaid: aging.totalUnpaid,
        totalUnpaidByCurrency: aging.totalUnpaidByCurrency,
        agingBuckets: aging.buckets,
        agingBucketsByCurrency: aging.agingBucketsByCurrency
    };
};

const getRevenueSnapshot = async ({ startDate, endDate, orgId }) => {
    const where = { sourceRepo: 'Shipment' };
    if (orgId) where.organizationId = orgId;
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const ledgerEntries = await prisma.organizationLedger.findMany({
        where,
        select: {
            organizationId: true,
            entryType: true,
            amount: true,
            currency: true,
            createdAt: true
        }
    });

    const snapshotMap = {};
    ledgerEntries.forEach(entry => {
        const date = new Date(entry.createdAt);
        const currency = normalizeCurrencyCode(entry.currency);
        const key = `${date.getFullYear()}-${date.getMonth() + 1}-${entry.organizationId || 'solo'}-${currency}`;

        if (!snapshotMap[key]) {
            snapshotMap[key] = {
                _id: { year: date.getFullYear(), month: date.getMonth() + 1, organization: entry.organizationId, currency },
                totalRevenue: new Decimal(0),
                shipmentCount: 0
            };
        }

        const amount = normalizeAmount(entry.amount);
        if (entry.entryType === 'DEBIT') {
            snapshotMap[key].totalRevenue = snapshotMap[key].totalRevenue.plus(amount);
            snapshotMap[key].shipmentCount++;
        } else {
            snapshotMap[key].totalRevenue = snapshotMap[key].totalRevenue.minus(amount);
        }
    });

    return Object.values(snapshotMap).map(s => ({
        ...s,
        totalRevenue: toApiAmount(s.totalRevenue)
    })).sort((a, b) => (b._id.year - a._id.year) || (b._id.month - a._id.month));
};

const updatePaymentStatus = async (paymentId, txClient = prisma) => {
    const payment = await txClient.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, amount: true, currency: true }
    });
    if (!payment) return null;

    const allocated = await getAllocationTotal({ paymentId, currency: payment.currency }, txClient);
    const remaining = normalizeAmount(payment.amount).minus(allocated);

    let status = 'UNAPPLIED';
    if (remaining.lte(0.001)) status = 'APPLIED';
    else if (allocated.gt(0)) status = 'PARTIALLY_APPLIED';

    return await txClient.payment.update({
        where: { id: paymentId },
        data: { status }
    });
};

const updateShipmentPaidStatus = async (shipmentId, txClient = prisma) => {
    const accounting = await getShipmentAccounting(shipmentId, txClient);
    if (!accounting) return;

    return await txClient.shipment.update({
        where: { id: shipmentId },
        data: {
            paid: accounting.remainingBalance <= 0.001,
            totalPaid: accounting.totalPaid,
            remainingBalance: accounting.remainingBalance
        }
    });
};

const assertAllocationCurrencies = async ({ tx, organizationId, paymentId, shipmentId, allocAmount }) => {
    const [payment, shipment] = await Promise.all([
        tx.payment.findUnique({
            where: { id: paymentId },
            select: { id: true, organizationId: true, amount: true, currency: true, reference: true }
        }),
        tx.shipment.findUnique({
            where: { id: shipmentId },
            select: { id: true, organizationId: true, trackingNumber: true, currency: true, price: true, pricingSnapshot: true, createdAt: true }
        })
    ]);

    if (!payment) throw makeClientError('Payment not found', 404);
    if (!shipment) throw makeClientError('Shipment not found', 404);
    if ((payment.organizationId || null) !== (organizationId || null) || (shipment.organizationId || null) !== (organizationId || null)) {
        throw makeClientError('Payment and shipment must belong to the same organization', 403);
    }

    const paymentCurrency = normalizeCurrencyCode(payment.currency);
    const shipmentCurrency = getShipmentCurrency(shipment);
    if (paymentCurrency !== shipmentCurrency) {
        throw makeClientError(
            `Currency mismatch: ${paymentCurrency} payment cannot be allocated to ${shipmentCurrency} shipment. Post or select a ${shipmentCurrency} payment instead.`,
            400,
            'CURRENCY_MISMATCH'
        );
    }

    const paymentAllocated = await getAllocationTotal({ paymentId, currency: paymentCurrency }, tx);
    const paymentRemaining = normalizeAmount(payment.amount).minus(paymentAllocated);
    if (allocAmount.gt(paymentRemaining.plus(0.001))) {
        throw makeClientError(`Insufficient unapplied ${paymentCurrency} balance on this payment`, 400, 'INSUFFICIENT_PAYMENT_BALANCE');
    }

    const shipmentAccounting = await getShipmentAccounting(shipmentId, tx);
    if (!shipmentAccounting || allocAmount.gt(normalizeAmount(shipmentAccounting.remainingBalance).plus(0.001))) {
        throw makeClientError(`Allocation exceeds the remaining ${shipmentCurrency} shipment balance`, 400, 'ALLOCATION_EXCEEDS_SHIPMENT_BALANCE');
    }

    return { payment, shipment, currency: paymentCurrency };
};

const adjustUnappliedOrganizationBalance = async ({ tx, organizationId, currency, amount, direction }) => {
    if (!organizationId) return;
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { currency: true }
    });
    if (normalizeCurrencyCode(org?.currency) !== normalizeCurrencyCode(currency)) return;

    await tx.organization.update({
        where: { id: organizationId },
        data: {
            unappliedBalance: {
                [direction]: toApiAmount(amount)
            }
        }
    });
};

const allocatePayment = async ({ organizationId, paymentId, shipmentId, amount, createdBy, isFifo = false }, externalTx = null) => {
    const allocAmount = normalizeAmount(amount);

    const execute = async (tx) => {
        const { payment, shipment, currency } = await assertAllocationCurrencies({
            tx,
            organizationId,
            paymentId,
            shipmentId,
            allocAmount
        });

        const allocation = await tx.paymentAllocation.create({
            data: {
                organizationId: organizationId || null,
                paymentId,
                shipmentId,
                amount: toApiAmount(allocAmount),
                currency,
                createdBy,
                isFifo,
                status: 'ACTIVE'
            }
        });

        const user = createdBy
            ? await tx.user.findUnique({ where: { id: createdBy }, select: { name: true } })
            : null;

        await tx.organizationLedger.create({
            data: {
                organizationId: organizationId || null,
                sourceRepo: 'Payment',
                sourceId: paymentId,
                amount: 0,
                currency,
                entryType: 'CREDIT',
                category: 'ALLOCATION',
                description: `${isFifo ? '[FIFO] ' : ''}Allocation: ${payment.reference || 'Payment'} applied to ${shipment.trackingNumber || 'Shipment'} by ${user?.name || 'System'}`,
                createdBy,
                balanceAfter: 0,
                metadata: { currency, shipmentId }
            }
        });

        await adjustUnappliedOrganizationBalance({
            tx,
            organizationId,
            currency,
            amount: allocAmount,
            direction: 'decrement'
        });

        return allocation;
    };

    const runPostAction = async (allocation, txClient) => {
        await updatePaymentStatus(paymentId, txClient);
        await updateShipmentPaidStatus(shipmentId, txClient);
        return allocation;
    };

    if (externalTx) {
        const allocation = await execute(externalTx);
        return await runPostAction(allocation, externalTx);
    }

    const allocation = await prisma.$transaction(execute);
    return await runPostAction(allocation, prisma);
};

const reverseAllocation = async ({ allocationId, reversedBy, reason }, externalTx = null) => {
    let originalAllocation = null;

    const execute = async (tx) => {
        const allocation = await tx.paymentAllocation.findUnique({ where: { id: allocationId } });
        if (!allocation) return null;
        originalAllocation = allocation;

        const updatedAlloc = await tx.paymentAllocation.update({
            where: { id: allocationId },
            data: {
                status: 'REVERSED',
                reversedAt: new Date(),
                reversalReason: reason || 'Reversal requested',
                reversedBy
            }
        });

        await adjustUnappliedOrganizationBalance({
            tx,
            organizationId: allocation.organizationId,
            currency: allocation.currency,
            amount: normalizeAmount(allocation.amount),
            direction: 'increment'
        });

        return updatedAlloc;
    };

    const updated = externalTx ? await execute(externalTx) : await prisma.$transaction(execute);
    if (updated && originalAllocation) {
        await updatePaymentStatus(originalAllocation.paymentId);
        await updateShipmentPaidStatus(originalAllocation.shipmentId);
    }
    return updated;
};

const reverseLedgerEntry = async (entryId, reversedBy, reason) => {
    const originalEntry = await prisma.organizationLedger.findUnique({ where: { id: entryId } });
    if (!originalEntry) throw makeClientError('Original ledger entry not found', 404);

    const amount = normalizeAmount(originalEntry.amount);
    const entryType = originalEntry.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    const currency = normalizeCurrencyCode(originalEntry.currency || originalEntry.metadata?.currency);
    const description = `REVERSAL: ${originalEntry.description} (Reason: ${reason || 'Manual reversal'})`;

    const reversalEntry = await createLedgerEntry(originalEntry.organizationId, {
        sourceRepo: 'Reversal',
        sourceId: originalEntry.sourceId,
        parentEntryId: originalEntry.id,
        amount: toApiAmount(amount),
        currency,
        entryType,
        category: 'REVERSAL',
        description,
        reference: originalEntry.reference,
        createdBy: reversedBy,
        metadata: { currency }
    });

    if (originalEntry.category === 'PAYMENT' && originalEntry.organizationId) {
        const unappliedMultiplier = entryType === 'DEBIT' ? -1 : 1;
        await adjustUnappliedOrganizationBalance({
            tx: prisma,
            organizationId: originalEntry.organizationId,
            currency,
            amount: amount.times(unappliedMultiplier),
            direction: 'increment'
        });
    }

    return reversalEntry;
};

const allocatePaymentsFifo = async ({ organizationId, createdBy }) => {
    const payments = await prisma.payment.findMany({
        where: {
            organizationId: organizationId || null,
            status: { in: ['UNAPPLIED', 'PARTIALLY_APPLIED'] }
        },
        orderBy: { postedAt: 'asc' }
    });

    const shipments = await prisma.shipment.findMany({
        where: {
            organizationId: organizationId || null,
            paid: false,
            status: { not: 'draft' }
        },
        orderBy: { createdAt: 'asc' }
    });

    const results = [];
    for (const payment of payments) {
        const paymentCurrency = normalizeCurrencyCode(payment.currency);
        const allocatedAmount = await getAllocationTotal({ paymentId: payment.id, currency: paymentCurrency });
        let remainingInPayment = normalizeAmount(payment.amount).minus(allocatedAmount);

        if (remainingInPayment.lte(0.001)) continue;

        for (const shipment of shipments) {
            if (remainingInPayment.lte(0.001)) break;
            if (getShipmentCurrency(shipment) !== paymentCurrency) continue;

            const shipmentAccounting = await getShipmentAccounting(shipment.id);
            if (!shipmentAccounting || shipmentAccounting.remainingBalance <= 0.001) continue;

            const amountToApply = Decimal.min(remainingInPayment, new Decimal(shipmentAccounting.remainingBalance));

            const allocation = await allocatePayment({
                organizationId,
                paymentId: payment.id,
                shipmentId: shipment.id,
                amount: amountToApply,
                createdBy,
                isFifo: true
            });

            results.push(allocation);
            remainingInPayment = remainingInPayment.minus(amountToApply);
        }
    }

    return results;
};

module.exports = {
    normalizeAmount,
    normalizeCurrencyCode,
    getShipmentChargeAmount,
    getOrganizationBalance,
    getOrganizationBalancesByCurrency,
    createLedgerEntry,
    getAccountCredit,
    getAllocationTotal,
    getUnappliedCash,
    getUnappliedCashByCurrency,
    getShipmentAccounting,
    getAgingReport,
    getOrganizationOverview,
    getRevenueSnapshot,
    updatePaymentStatus,
    updateShipmentPaidStatus,
    allocatePayment,
    allocatePaymentsFifo,
    reverseAllocation,
    reverseLedgerEntry
};
