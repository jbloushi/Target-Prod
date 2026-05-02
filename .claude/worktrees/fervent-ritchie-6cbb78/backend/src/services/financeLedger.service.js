const { prisma } = require('../config/database');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');

// Initialize Decimal precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const normalizeAmount = (value) => {
    if (value instanceof Decimal) return value;
    return new Decimal(value || 0);
};

// Helper to return standardized JS number for API responses (3 decimal places)
const toApiAmount = (decimalValue) => {
    return Number(normalizeAmount(decimalValue).toFixed(3));
};

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

/**
 * Calculates current organization balance from ledger history
 */
const getOrganizationBalance = async (organizationId) => {
    if (!organizationId) return 0;

    const totals = await prisma.organizationLedger.groupBy({
        by: ['entryType'],
        where: { organizationId },
        _sum: { amount: true }
    });

    const debitTotal = totals.find(row => row.entryType === 'DEBIT')?._sum.amount || 0;
    const creditTotal = totals.find(row => row.entryType === 'CREDIT')?._sum.amount || 0;
    const dVal = normalizeAmount(debitTotal);
    const cVal = normalizeAmount(creditTotal);

    return toApiAmount(dVal.minus(cVal));
};

/**
 * Atomic creation of ledger entries with balance updates
 */
const createLedgerEntry = async (organizationId, entry, externalTx = null) => {
    const amount = normalizeAmount(entry.amount);
    const multiplier = entry.entryType === 'DEBIT' ? 1 : -1;
    const transactionAmount = amount.times(multiplier);

    const execute = async (tx) => {
        let balanceAfter = new Decimal(0);

        if (organizationId) {
            // Update the organization balance atomically in MySQL
            const org = await tx.organization.update({
                where: { id: organizationId },
                data: {
                    balance: {
                        increment: toApiAmount(transactionAmount)
                    }
                }
            });
            balanceAfter = normalizeAmount(org.balance);
        } else {
            // For Solo Shippers (null org), use previous ledger entry to track balance
            const lastEntry = await tx.organizationLedger.findFirst({
                where: { organizationId: null },
                orderBy: { createdAt: 'desc' }
            });
            balanceAfter = normalizeAmount(lastEntry?.balanceAfter || 0).plus(transactionAmount);
        }

        // Create the immutable ledger record
        return await tx.organizationLedger.create({
            data: {
                organizationId: organizationId || null,
                amount: toApiAmount(amount),
                entryType: entry.entryType,
                category: entry.category,
                description: entry.description,
                reference: entry.reference,
                sourceRepo: entry.sourceRepo,
                sourceId: entry.sourceId,
                parentEntryId: entry.parentEntryId,
                balanceAfter: toApiAmount(balanceAfter),
                createdBy: entry.createdBy,
                metadata: entry.metadata
            }
        });
    };

    if (externalTx) {
        return await execute(externalTx);
    } else {
        return await prisma.$transaction(execute);
    }
};

const getAccountCredit = async (organizationId) => {
    if (!organizationId) return 0;
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { unappliedBalance: true }
    });
    return toApiAmount(org?.unappliedBalance || 0);
};

const getAllocationTotal = async ({ organizationId, shipmentId, paymentId }, txClient = prisma) => {
    const where = { status: 'ACTIVE' };
    if (organizationId !== undefined) where.organizationId = organizationId;
    if (shipmentId) where.shipmentId = shipmentId;
    if (paymentId) where.paymentId = paymentId;

    const summary = await txClient.paymentAllocation.aggregate({
        where,
        _sum: { amount: true }
    });

    return normalizeAmount(summary._sum.amount || 0);
};

const getUnappliedCash = async (organizationId) => {
    if (!organizationId) {
        // Solo Shippers aggregation
        const payments = await prisma.payment.findMany({ where: { organizationId: null } });
        const allocations = await prisma.paymentAllocation.groupBy({
            by: ['paymentId'],
            where: { organizationId: null, status: 'ACTIVE' },
            _sum: { amount: true }
        });

        const allocationMap = allocations.reduce((acc, item) => {
            acc[item.paymentId] = normalizeAmount(item._sum.amount);
            return acc;
        }, {});

        const totalUnapplied = payments.reduce((sum, payment) => {
            const pAmount = normalizeAmount(payment.amount);
            const allocated = allocationMap[payment.id] || new Decimal(0);
            return sum.plus(pAmount.minus(allocated));
        }, new Decimal(0));

        return toApiAmount(totalUnapplied);
    }

    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { unappliedBalance: true }
    });
    return toApiAmount(org?.unappliedBalance || 0);
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

    const totalCharge = getShipmentChargeAmount(shipment);
    const allocated = await getAllocationTotal({ shipmentId }, txClient);
    const remaining = totalCharge.minus(allocated);
    const daysOutstanding = Math.floor((Date.now() - new Date(shipment.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    let status = 'unpaid';
    if (allocated.gt(0) && remaining.gt(0)) status = 'partial';
    if (remaining.lte(0.001) && totalCharge.gt(0)) status = 'paid';
    if (remaining.gt(0) && daysOutstanding > 30) status = 'overdue';

    return {
        shipment,
        totalCharge: toApiAmount(totalCharge),
        totalPaid: toApiAmount(allocated),
        remainingBalance: toApiAmount(remaining),
        status,
        daysOutstanding
    };
};

const getAgingReport = async (organizationId) => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    
    // Fetch shipments with their active allocations via Prisma
    const shipments = await prisma.shipment.findMany({
        where: { organizationId: organizationId || null },
        select: {
            id: true,
            price: true,
            pricingSnapshot: true,
            createdAt: true,
            allocations: {
                where: { status: 'ACTIVE' },
                select: { amount: true }
            }
        }
    });

    let totalUnpaid = new Decimal(0);
    const now = new Date();

    for (const shipment of shipments) {
        const totalCharge = getShipmentChargeAmount(shipment);
        const totalAllocated = shipment.allocations.reduce((sum, a) => sum.plus(normalizeAmount(a.amount)), new Decimal(0));
        const remaining = totalCharge.minus(totalAllocated);

        if (remaining.lte(0.001)) continue;

        totalUnpaid = totalUnpaid.plus(remaining);
        const daysOld = Math.floor((now - new Date(shipment.createdAt)) / (1000 * 60 * 60 * 24));

        if (daysOld <= 30) buckets['0-30'] = toApiAmount(normalizeAmount(buckets['0-30']).plus(remaining));
        else if (daysOld <= 60) buckets['31-60'] = toApiAmount(normalizeAmount(buckets['31-60']).plus(remaining));
        else if (daysOld <= 90) buckets['61-90'] = toApiAmount(normalizeAmount(buckets['61-90']).plus(remaining));
        else buckets['90+'] = toApiAmount(normalizeAmount(buckets['90+']).plus(remaining));
    }

    return { totalUnpaid: toApiAmount(totalUnpaid), buckets };
};

const getOrganizationOverview = async (organizationId, creditLimit = 0) => {
    const [balance, unappliedCash, aging] = await Promise.all([
        getOrganizationBalance(organizationId),
        getUnappliedCash(organizationId),
        getAgingReport(organizationId)
    ]);

    const limit = normalizeAmount(creditLimit);
    const bal = normalizeAmount(balance);
    const availableCredit = toApiAmount(limit.minus(bal));

    return {
        balance,
        creditLimit: toApiAmount(limit),
        availableCredit,
        unappliedCash,
        totalUnpaid: aging.totalUnpaid,
        agingBuckets: aging.buckets
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

    // Use raw query for MySQL specialized grouping by year/month if complex, or findMany
    const ledgerEntries = await prisma.organizationLedger.findMany({
        where,
        select: {
            organizationId: true,
            entryType: true,
            amount: true,
            createdAt: true
        }
    });

    // Process in memory for monthly grouping (or use queryRaw for high volume)
    const snapshotMap = {};
    ledgerEntries.forEach(entry => {
        const date = new Date(entry.createdAt);
        const key = `${date.getFullYear()}-${date.getMonth() + 1}-${entry.organizationId || 'solo'}`;
        
        if (!snapshotMap[key]) {
            snapshotMap[key] = {
                _id: { year: date.getFullYear(), month: date.getMonth() + 1, organization: entry.organizationId },
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
        select: { id: true, amount: true }
    });
    if (!payment) return null;

    const allocated = await getAllocationTotal({ paymentId }, txClient);
    const pAmount = normalizeAmount(payment.amount);
    const remaining = pAmount.minus(allocated);

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

const allocatePayment = async ({ organizationId, paymentId, shipmentId, amount, createdBy, isFifo = false }, externalTx = null) => {
    const allocAmount = normalizeAmount(amount);

    const execute = async (tx) => {
        // 1. Create Allocation
        const allocation = await tx.paymentAllocation.create({
            data: {
                organizationId: organizationId || null,
                paymentId,
                shipmentId,
                amount: toApiAmount(allocAmount),
                createdBy,
                isFifo,
                status: 'ACTIVE'
            }
        });

        // 2. Resolve Names for Audit
        const [payment, shipment, user] = await Promise.all([
            tx.payment.findUnique({ where: { id: paymentId }, select: { reference: true } }),
            tx.shipment.findUnique({ where: { id: shipmentId }, select: { trackingNumber: true } }),
            createdBy ? tx.user.findUnique({ where: { id: createdBy }, select: { name: true } }) : null
        ]);

        // 3. Create Audit Entry (DEBIT 0 amount as marker)
        await tx.organizationLedger.create({
            data: {
                organizationId: organizationId || null,
                sourceRepo: 'Payment',
                sourceId: paymentId,
                amount: 0,
                entryType: 'CREDIT',
                category: 'ALLOCATION',
                description: `${isFifo ? '[FIFO] ' : ''}Allocation: ${payment?.reference || 'Payment'} applied to ${shipment?.trackingNumber || 'Shipment'} by ${user?.name || 'System'}`,
                createdBy,
                balanceAfter: 0 // No balance impact for allocation marker
            }
        });

        if (organizationId) {
            await tx.organization.update({
                where: { id: organizationId },
                data: {
                    unappliedBalance: {
                        decrement: toApiAmount(allocAmount)
                    }
                }
            });
        }

        return allocation;
    };

    const runPostAction = async (allocation, txClient) => {
        // Status updates run inside or post-transaction depending on caller
        await updatePaymentStatus(paymentId, txClient);
        await updateShipmentPaidStatus(shipmentId, txClient);
        return allocation;
    };

    if (externalTx) {
        const allocation = await execute(externalTx);
        return await runPostAction(allocation, externalTx);
    } else {
        const allocation = await prisma.$transaction(execute);
        return await runPostAction(allocation, prisma);
    }
};

const reverseAllocation = async ({ allocationId, reversedBy, reason }, externalTx = null) => {
    const execute = async (tx) => {
        const allocation = await tx.paymentAllocation.findUnique({ where: { id: allocationId } });
        if (!allocation) return null;

        const updatedAlloc = await tx.paymentAllocation.update({
            where: { id: allocationId },
            data: {
                status: 'REVERSED',
                reversedAt: new Date(),
                reversalReason: reason || 'Reversal requested',
                reversedBy
            }
        });

        if (allocation.organizationId) {
            await tx.organization.update({
                where: { id: allocation.organizationId },
                data: {
                    unappliedBalance: {
                        increment: allocation.amount
                    }
                }
            });
        }

        return updatedAlloc;
    };

    if (externalTx) {
        return await execute(externalTx);
    } else {
        return await prisma.$transaction(execute);
    }
};

const reverseLedgerEntry = async (entryId, reversedBy, reason) => {
    const originalEntry = await prisma.organizationLedger.findUnique({ where: { id: entryId } });
    if (!originalEntry) throw new Error('Original ledger entry not found');

    const amount = normalizeAmount(originalEntry.amount);
    const entryType = originalEntry.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    const description = `REVERSAL: ${originalEntry.description} (Reason: ${reason || 'Manual reversal'})`;

    const reversalEntry = await createLedgerEntry(originalEntry.organizationId, {
        sourceRepo: 'Reversal',
        sourceId: originalEntry.sourceId,
        parentEntryId: originalEntry.id,
        amount: toApiAmount(amount),
        entryType,
        category: 'REVERSAL',
        description,
        reference: originalEntry.reference,
        createdBy: reversedBy
    });

    if (originalEntry.category === 'PAYMENT' && originalEntry.organizationId) {
        const unappliedMultiplier = entryType === 'DEBIT' ? -1 : 1;
        await prisma.organization.update({
            where: { id: originalEntry.organizationId },
            data: {
                unappliedBalance: {
                    increment: toApiAmount(amount.times(unappliedMultiplier))
                }
            }
        });
    }

    return reversalEntry;
};

const allocatePaymentsFifo = async ({ organizationId, createdBy }) => {
    // 1. Get Unapplied Payments
    const payments = await prisma.payment.findMany({
        where: { 
            organizationId: organizationId || null,
            status: { in: ['UNAPPLIED', 'PARTIALLY_APPLIED'] }
        },
        orderBy: { postedAt: 'asc' }
    });

    // 2. Get Unpaid Shipments
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
        // Calculate remaining in payment
        const allocatedAmount = await getAllocationTotal({ paymentId: payment.id });
        let remainingInPayment = normalizeAmount(payment.amount).minus(allocatedAmount);
        
        if (remainingInPayment.lte(0.001)) continue;

        for (const shipment of shipments) {
            if (remainingInPayment.lte(0.001)) break;

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
    getShipmentChargeAmount,
    getOrganizationBalance,
    createLedgerEntry,
    getAccountCredit,
    getUnappliedCash,
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
