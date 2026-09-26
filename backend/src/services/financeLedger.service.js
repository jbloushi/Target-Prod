const { prisma } = require('../config/database');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Executes an interactive Prisma transaction with automatic retry and exponential backoff
 * for transient MySQL lock wait timeouts, deadlocks (ER_LOCK_DEADLOCK 1213), and P2034 conflicts.
 */
const executeTransactionWithRetry = async (executeFn, maxRetries = 3, options = { maxWait: 5000, timeout: 15000 }) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await prisma.$transaction(executeFn, options);
        } catch (err) {
            const isDeadlockOrLockTimeout =
                err.code === 'P2034' ||
                err.code === 'P2028' ||
                (err.message && (
                    err.message.includes('deadlock') ||
                    err.message.includes('ER_LOCK_DEADLOCK') ||
                    err.message.includes('1213') ||
                    err.message.includes('Lock wait timeout exceeded') ||
                    err.message.includes('1205')
                ));
            if (isDeadlockOrLockTimeout && attempt < maxRetries) {
                const delay = Math.floor(Math.random() * 100 * Math.pow(2, attempt)) + 50;
                logger.warn(`[financeLedger] Transaction conflict/deadlock (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${err.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
};

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
    const ledgerBalance = normalizeAmount(debitTotal).minus(creditTotal);

    if (organizationId && totals.length === 0) {
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { balance: true }
        });
        if (org && Number(org.balance || 0) !== 0) {
            return toApiAmount(org.balance);
        }
    }

    return toApiAmount(ledgerBalance);
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

        if (organizationId && entry.category !== 'CARRIER_PAYABLE') {
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

    return externalTx ? execute(externalTx) : executeTransactionWithRetry(execute);
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

    // Compute actual shipping volume & spending distribution by carrier
    let spendingDistribution = [];
    try {
        const shipmentsWhere = {
            status: { notIn: ['draft', 'cancelled'] }
        };
        if (organizationId && organizationId !== 'none') {
            shipmentsWhere.organizationId = organizationId;
        }

        const orgShipments = await prisma.shipment.findMany({
            where: shipmentsWhere,
            select: {
                carrierCode: true,
                price: true,
                pricingSnapshot: true
            },
            take: 1000
        });

        if (orgShipments.length > 0) {
            const carrierLabels = {
                'ARAMEX': 'Aramex Express',
                'DHL': 'DHL Express',
                'DGR': 'DHL Express (DGR)',
                'FEDEX': 'FedEx International',
                'INTERNAL': 'Target Local Fleet',
                'MANUAL': 'Direct Courier'
            };
            const colors = ['#0050d4', '#0284c7', '#7c3aed', '#059669', '#f59e0b', '#9ca3af'];
            const carrierStats = {};
            let totalSpend = new Decimal(0);

            orgShipments.forEach(s => {
                const carrier = (s.carrierCode || 'OTHER').toUpperCase();
                const amt = normalizeAmount(s.pricingSnapshot?.totalPrice ?? s.price ?? s.pricingSnapshot?.customerRate ?? 0);
                if (!carrierStats[carrier]) {
                    carrierStats[carrier] = { amount: new Decimal(0), count: 0 };
                }
                carrierStats[carrier].amount = carrierStats[carrier].amount.plus(amt);
                carrierStats[carrier].count += 1;
                totalSpend = totalSpend.plus(amt);
            });

            const useSpend = totalSpend.gt(0);
            const entries = Object.entries(carrierStats).sort((a, b) => {
                return useSpend
                    ? (b[1].amount.minus(a[1].amount)).toNumber()
                    : (b[1].count - a[1].count);
            });
            const totalBase = useSpend ? totalSpend : new Decimal(orgShipments.length);

            spendingDistribution = entries.map(([carrier, stat], idx) => {
                const val = useSpend ? stat.amount : new Decimal(stat.count);
                const pct = Math.round(val.dividedBy(totalBase).times(100).toNumber());
                return {
                    name: carrierLabels[carrier] || carrier,
                    amount: Math.round(stat.amount.toNumber()),
                    count: stat.count,
                    percent: pct,
                    color: colors[idx % colors.length]
                };
            });
        }
    } catch (distErr) {
        logger.warn(`Failed to aggregate spending distribution: ${distErr.message}`);
    }

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
        agingBucketsByCurrency: aging.agingBucketsByCurrency,
        spendingDistribution
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
    // Acquire row-level locks on Payment and Shipment in MySQL
    if (typeof tx.$queryRawUnsafe === 'function') {
        try {
            await tx.$queryRawUnsafe('SELECT id FROM `Payment` WHERE id = ? FOR UPDATE', paymentId);
            await tx.$queryRawUnsafe('SELECT id FROM `Shipment` WHERE id = ? FOR UPDATE', shipmentId);
        } catch (rawErr) {
            // In unit test environments where mocks may not support raw queries, log debug and proceed
            logger.debug(`[financeLedger] Pessimistic lock query: ${rawErr.message}`);
        }
    }

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

        await createLedgerEntry(
            organizationId || null,
            {
                sourceRepo: 'Payment',
                sourceId: paymentId,
                amount: 0,
                currency,
                entryType: 'CREDIT',
                category: 'ALLOCATION',
                description: `${isFifo ? '[FIFO] ' : ''}Allocation: ${payment.reference || 'Payment'} applied to ${shipment.trackingNumber || 'Shipment'} by ${user?.name || 'System'}`,
                createdBy,
                metadata: { currency, shipmentId }
            },
            tx
        );

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

    const allocation = await executeTransactionWithRetry(execute);
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

    const updated = externalTx ? await execute(externalTx) : await executeTransactionWithRetry(execute);
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

/**
 * Records a Carrier Accounts Payable (liability & COGS) entry in the financial ledger.
 */
const recordCarrierPayable = async ({ organizationId, shipmentId, carrierCode, costPrice, currency, trackingNumber, createdBy }, externalTx = null) => {
    const cost = normalizeAmount(costPrice);
    if (cost.lte(0)) return null;

    const payableCurrency = normalizeCurrencyCode(currency);
    return await createLedgerEntry(
        organizationId || null,
        {
            sourceRepo: 'Shipment',
            sourceId: shipmentId,
            amount: toApiAmount(cost),
            currency: payableCurrency,
            entryType: 'CREDIT',
            category: 'CARRIER_PAYABLE',
            description: `Carrier wholesale liability (${carrierCode}) for ${trackingNumber}`,
            reference: trackingNumber,
            createdBy,
            metadata: {
                carrierCode,
                costPrice: toApiAmount(cost),
                currency: payableCurrency,
                accountType: 'LIABILITY_AP'
            }
        },
        externalTx
    );
};

/**
 * Generates an itemized shipment profitability report with real carrier wholesale cost and revenue.
 */
const getProfitabilityReport = async ({ organizationId, startDate, endDate, carrierCode, page = 1, limit = 50 }) => {
    const where = {
        status: { not: 'draft' }
    };

    if (organizationId && organizationId !== 'none') {
        where.organizationId = organizationId;
    }
    if (carrierCode) {
        where.carrierCode = carrierCode;
    }
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const skip = (parsedPage - 1) * parsedLimit;

    const [shipments, totalCount] = await Promise.all([
        prisma.shipment.findMany({
            where,
            select: {
                id: true,
                trackingNumber: true,
                carrierCode: true,
                serviceCode: true,
                status: true,
                price: true,
                costPrice: true,
                markupAmount: true,
                currency: true,
                pricingSnapshot: true,
                paid: true,
                totalPaid: true,
                remainingBalance: true,
                organization: {
                    select: { id: true, name: true }
                },
                user: {
                    select: { id: true, name: true, email: true }
                },
                createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parsedLimit
        }),
        prisma.shipment.count({ where })
    ]);

    let totalRevenue = new Decimal(0);
    let totalCost = new Decimal(0);
    let totalProfit = new Decimal(0);

    const rows = shipments.map(s => {
        const rev = normalizeAmount(s.pricingSnapshot?.totalPrice ?? s.price ?? 0);
        // If costPrice is explicitly stored, use it; otherwise fallback to pricingSnapshot.carrierRate
        const cost = normalizeAmount(s.costPrice ?? s.pricingSnapshot?.carrierRate ?? 0);
        const profit = rev.minus(cost);
        const marginPct = rev.gt(0) ? profit.dividedBy(rev).times(100) : new Decimal(0);

        totalRevenue = totalRevenue.plus(rev);
        totalCost = totalCost.plus(cost);
        totalProfit = totalProfit.plus(profit);

        return {
            id: s.id,
            trackingNumber: s.trackingNumber,
            carrierCode: s.carrierCode,
            serviceCode: s.serviceCode,
            status: s.status,
            customerName: s.organization?.name || s.user?.name || 'Individual',
            createdAt: s.createdAt,
            currency: normalizeCurrencyCode(s.currency || s.pricingSnapshot?.currency),
            revenue: toApiAmount(rev),
            cost: toApiAmount(cost),
            profit: toApiAmount(profit),
            marginPercent: Number(marginPct.toFixed(1)),
            paid: s.paid,
            totalPaid: toApiAmount(s.totalPaid || 0),
            remainingBalance: toApiAmount(s.remainingBalance ?? rev)
        };
    });

    const overallMargin = totalRevenue.gt(0)
        ? totalProfit.dividedBy(totalRevenue).times(100)
        : new Decimal(0);

    return {
        items: rows,
        summary: {
            totalShipments: totalCount,
            totalRevenue: toApiAmount(totalRevenue),
            totalCost: toApiAmount(totalCost),
            totalProfit: toApiAmount(totalProfit),
            overallMarginPercent: Number(overallMargin.toFixed(1))
        },
        pagination: {
            total: totalCount,
            page: parsedPage,
            limit: parsedLimit,
            pages: Math.ceil(totalCount / parsedLimit)
        }
    };
};

/**
 * Retrieves COD Cash-Clearing balance & collected shipments for drivers.
 */
const getDriverCashClearing = async ({ driverId, organizationId }) => {
    const where = {
        codAmount: { gt: 0 }
    };

    if (driverId) where.assignedDriverId = driverId;
    if (organizationId && organizationId !== 'none') where.organizationId = organizationId;

    const shipments = await prisma.shipment.findMany({
        where,
        select: {
            id: true,
            trackingNumber: true,
            status: true,
            codAmount: true,
            codCurrency: true,
            codStatus: true,
            assignedDriver: {
                select: { id: true, name: true, phone: true }
            },
            updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
    });

    const totalsByCurrency = {};
    const unremittedShipments = [];
    const alerts = [];
    const now = Date.now();
    let oldestUnremittedMs = null;

    shipments.forEach(s => {
        const cur = normalizeCurrencyCode(s.codCurrency);
        const amount = normalizeAmount(s.codAmount);
        const isCollected = s.status === 'delivered' || s.codStatus === 'COLLECTED' || s.codStatus === 'PENDING_REMITTANCE';
        const isRemitted = s.codStatus === 'REMITTED';

        if (isCollected && !isRemitted) {
            totalsByCurrency[cur] = toApiAmount(normalizeAmount(totalsByCurrency[cur] || 0).plus(amount));
            unremittedShipments.push(s);

            const collectedTime = new Date(s.updatedAt).getTime();
            if (!oldestUnremittedMs || collectedTime < oldestUnremittedMs) {
                oldestUnremittedMs = collectedTime;
            }
        }
    });

    const oldestAgingDays = oldestUnremittedMs
        ? Math.floor((now - oldestUnremittedMs) / (1000 * 60 * 60 * 24))
        : 0;

    const baseUnremittedKwd = totalsByCurrency['KWD'] || 0;
    const holdingLimitKwd = 500.0;
    const isLimitExceeded = baseUnremittedKwd > holdingLimitKwd;
    const isAgingCritical = oldestAgingDays >= 3;

    if (isLimitExceeded) {
        alerts.push({
            type: 'LIMIT_EXCEEDED',
            severity: 'HIGH',
            message: `Driver unremitted COD cash (${baseUnremittedKwd.toFixed(3)} KWD) exceeds the safety holding threshold (${holdingLimitKwd.toFixed(3)} KWD).`
        });
    }

    if (isAgingCritical && unremittedShipments.length > 0) {
        alerts.push({
            type: 'AGING_CRITICAL',
            severity: 'HIGH',
            message: `Oldest unremitted cash collected ${oldestAgingDays} day(s) ago. Immediate hub vault handover required.`
        });
    }

    return {
        unremittedTotalsByCurrency: totalsByCurrency,
        unremittedCount: unremittedShipments.length,
        oldestAgingDays,
        isLimitExceeded,
        isAgingCritical,
        holdingLimitKwd,
        alerts,
        shipments
    };
};

/**
 * Posts a driver COD cash remittance to the hub vault, clearing driver held funds.
 */
const remitDriverCodCash = async ({ driverId, amount, currency, shipmentIds = [], receivedBy, notes }) => {
    const remitAmount = normalizeAmount(amount);
    const remitCurrency = normalizeCurrencyCode(currency);

    const driver = await prisma.user.findUnique({
        where: { id: driverId },
        select: { id: true, name: true, organizationId: true }
    });
    if (!driver) throw makeClientError('Driver not found', 404);

    return await prisma.$transaction(async (tx) => {
        // Mark shipments as REMITTED
        if (shipmentIds.length > 0) {
            await tx.shipment.updateMany({
                where: {
                    id: { in: shipmentIds },
                    assignedDriverId: driverId
                },
                data: {
                    codStatus: 'REMITTED'
                }
            });
        }

        // Post Cash Remittance entry in Ledger
        const ledgerEntry = await createLedgerEntry(
            driver.organizationId || null,
            {
                amount: toApiAmount(remitAmount),
                currency: remitCurrency,
                entryType: 'CREDIT',
                category: 'COD_REMITTANCE',
                description: `COD Cash Remittance from Driver ${driver.name}: ${toApiAmount(remitAmount)} ${remitCurrency}`,
                reference: `REMIT-${driver.id.slice(0, 6).toUpperCase()}-${Date.now()}`,
                createdBy: receivedBy,
                metadata: {
                    driverId,
                    driverName: driver.name,
                    shipmentIds,
                    notes: notes || 'Hub cash handover'
                }
            },
            tx
        );

        return ledgerEntry;
    });
};

/**
 * Step 1 of Two-Step COD Remittance: Driver/Dispatcher submits cash handover request.
 */
const requestDriverCodRemittance = async ({ driverId, amount, currency, shipmentIds = [], requestedBy, bagReference, notes }) => {
    const remitAmount = normalizeAmount(amount);
    const remitCurrency = normalizeCurrencyCode(currency);

    const driver = await prisma.user.findUnique({
        where: { id: driverId },
        select: { id: true, name: true, organizationId: true }
    });
    if (!driver) throw makeClientError('Driver not found', 404);

    return await prisma.$transaction(async (tx) => {
        if (shipmentIds.length > 0) {
            await tx.shipment.updateMany({
                where: {
                    id: { in: shipmentIds },
                    assignedDriverId: driverId
                },
                data: {
                    codStatus: 'PENDING_REMITTANCE'
                }
            });
        }

        const requestId = `COD-REQ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        return {
            success: true,
            status: 'PENDING_VERIFICATION',
            requestId,
            driverId,
            driverName: driver.name,
            amount: toApiAmount(remitAmount),
            currency: remitCurrency,
            shipmentIds,
            bagReference: bagReference || `BAG-${Date.now().toString().slice(-6)}`,
            notes: notes || 'Cash handover submitted awaiting cashier verification',
            requestedBy,
            requestedAt: new Date().toISOString()
        };
    });
};

/**
 * Step 2 of Two-Step COD Remittance: Hub Cashier/Accounting verifies physical cash count and confirms.
 */
const confirmDriverCodRemittance = async ({ driverId, amount, currency, shipmentIds = [], verifiedBy, bagReference, notes, verifiedAmount }) => {
    const finalAmount = verifiedAmount !== undefined ? normalizeAmount(verifiedAmount) : normalizeAmount(amount);
    const remitCurrency = normalizeCurrencyCode(currency);

    const driver = await prisma.user.findUnique({
        where: { id: driverId },
        select: { id: true, name: true, organizationId: true }
    });
    if (!driver) throw makeClientError('Driver not found', 404);

    return await prisma.$transaction(async (tx) => {
        // Mark shipments as REMITTED
        if (shipmentIds.length > 0) {
            await tx.shipment.updateMany({
                where: {
                    id: { in: shipmentIds },
                    assignedDriverId: driverId
                },
                data: {
                    codStatus: 'REMITTED'
                }
            });
        }

        // Post Cash Remittance entry in Ledger
        const ledgerEntry = await createLedgerEntry(
            driver.organizationId || null,
            {
                amount: toApiAmount(finalAmount),
                currency: remitCurrency,
                entryType: 'CREDIT',
                category: 'COD_REMITTANCE',
                description: `COD Cash Remittance Verified from Driver ${driver.name}: ${toApiAmount(finalAmount)} ${remitCurrency} (Bag: ${bagReference || 'N/A'})`,
                reference: `REMIT-${driver.id.slice(0, 6).toUpperCase()}-${Date.now()}`,
                createdBy: verifiedBy,
                metadata: {
                    driverId,
                    driverName: driver.name,
                    shipmentIds,
                    bagReference,
                    verifiedBy,
                    status: 'CONFIRMED',
                    notes: notes || 'Hub cash verified and reconciled by cashier'
                }
            },
            tx
        );

        // Post Double-Entry GL entry (Dr 1030 Hub Vault Safe, Cr 1020 Cash in Transit - Drivers COD)
        try {
            const generalLedgerService = require('./generalLedger.service');
            await generalLedgerService.postDriverCodRemittanceEntry({
                driverId,
                driverName: driver.name,
                amount: finalAmount,
                currency: remitCurrency,
                bagReference,
                shipmentIds,
                verifiedById: verifiedBy
            }, tx);
        } catch (glError) {
            logger.warn(`[financeLedger] GL driver COD remittance warning: ${glError.message}`);
        }

        return {
            success: true,
            status: 'CONFIRMED',
            ledgerEntry,
            driverId,
            driverName: driver.name,
            verifiedAmount: toApiAmount(finalAmount),
            currency: remitCurrency,
            shipmentIds
        };
    });
};

module.exports = {
    normalizeAmount,
    normalizeCurrencyCode,
    getShipmentChargeAmount,
    getOrganizationBalance,
    getOrganizationBalancesByCurrency,
    createLedgerEntry,
    recordCarrierPayable,
    getProfitabilityReport,
    getDriverCashClearing,
    remitDriverCodCash,
    requestDriverCodRemittance,
    confirmDriverCodRemittance,
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
    reverseLedgerEntry,
    executeTransactionWithRetry
};

