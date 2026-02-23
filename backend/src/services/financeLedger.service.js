const mongoose = require('mongoose');
const { Decimal } = require('decimal.js');
const OrganizationLedger = require('../models/organizationLedger.model');
const Payment = require('../models/payment.model');
const PaymentAllocation = require('../models/paymentAllocation.model');
const Shipment = require('../models/shipment.model');
const Organization = require('../models/organization.model');
const User = require('../models/user.model');

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

const getOrganizationBalance = async (organizationId) => {
    const matchId = organizationId ? (organizationId instanceof mongoose.Types.ObjectId ? organizationId : new mongoose.Types.ObjectId(organizationId)) : null;
    const summary = await OrganizationLedger.aggregate([
        { $match: { organization: matchId } },
        {
            $group: {
                _id: '$organization',
                totalDebits: {
                    $sum: {
                        $cond: [{ $eq: ['$entryType', 'DEBIT'] }, '$amount', 0]
                    }
                },
                totalCredits: {
                    $sum: {
                        $cond: [{ $eq: ['$entryType', 'CREDIT'] }, '$amount', 0]
                    }
                }
            }
        }
    ]);

    if (!summary.length) return 0;

    const debits = normalizeAmount(summary[0].totalDebits);
    const credits = normalizeAmount(summary[0].totalCredits);

    // Balance = Debits (Charges) - Credits (Payments)
    return toApiAmount(debits.minus(credits));
};

const getLatestBalance = async (organizationId) => {
    const lastEntry = await OrganizationLedger.findOne({ organization: organizationId })
        .sort({ createdAt: -1 })
        .select('balanceAfter');

    return toApiAmount(lastEntry?.balanceAfter || 0);
};

const createLedgerEntry = async (organizationId, entry, session = null) => {
    const amount = normalizeAmount(entry.amount);
    const multiplier = entry.entryType === 'DEBIT' ? 1 : -1;
    const transactionAmount = amount.times(multiplier);

    let balanceAfter = new Decimal(0);

    if (organizationId) {
        // Update the organization balance atomically
        // Note: MongoDB $inc works with native numbers, so we convert back for the DB operation
        // For absolute precision, we should ideally fetch, calculate, and set, but $inc is concurrency-safe.
        // We stick to $inc for safety, utilizing the standardized 3-decimal precision.
        const incValue = Number(transactionAmount.toFixed(3));

        const org = await Organization.findOneAndUpdate(
            { _id: organizationId },
            { $inc: { balance: incValue } },
            { new: true, session }
        );

        if (!org) throw new Error('Organization not found for ledger entry');
        balanceAfter = normalizeAmount(org.balance);
    } else {
        // For Solo Shippers, we maintain a logical balance from the ledger
        const lastEntry = await OrganizationLedger.findOne({ organization: null })
            .sort({ createdAt: -1 })
            .select('balanceAfter');

        const currentBalance = normalizeAmount(lastEntry?.balanceAfter || 0);
        balanceAfter = currentBalance.plus(transactionAmount);
    }

    // Create the immutable ledger record
    const [ledgerRecord] = await OrganizationLedger.create([{
        organization: organizationId,
        ...entry,
        amount: toApiAmount(amount),
        balanceAfter: toApiAmount(balanceAfter)
    }], { session });

    return ledgerRecord;
};

/**
 * High-performance balance retrieval
 * Returns the "Credit" (cash on hand) available to the organization.
 */
const getAccountCredit = async (organizationId) => {
    const org = await Organization.findById(organizationId).select('unappliedBalance');
    return toApiAmount(org?.unappliedBalance || 0);
};

const getAllocationTotal = async ({ organizationId, shipmentId, paymentId }) => {
    const match = { status: 'ACTIVE' };
    if (organizationId !== undefined) {
        match.organization = (organizationId === null) ? null : (organizationId instanceof mongoose.Types.ObjectId ? organizationId : new mongoose.Types.ObjectId(organizationId));
    }
    if (shipmentId) match.shipment = shipmentId instanceof mongoose.Types.ObjectId ? shipmentId : new mongoose.Types.ObjectId(shipmentId);
    if (paymentId) match.payment = paymentId instanceof mongoose.Types.ObjectId ? paymentId : new mongoose.Types.ObjectId(paymentId);

    const allocations = await PaymentAllocation.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    return normalizeAmount(allocations[0]?.total || 0);
};

const getUnappliedCash = async (organizationId) => {
    if (!organizationId) {
        // For Solo Shippers, we aggregate payments directly
        const payments = await Payment.find({ organization: null });
        const allocations = await PaymentAllocation.aggregate([
            { $match: { organization: null, status: 'ACTIVE' } },
            { $group: { _id: '$payment', total: { $sum: '$amount' } } }
        ]);

        const allocationMap = allocations.reduce((acc, item) => {
            acc[item._id.toString()] = normalizeAmount(item.total);
            return acc;
        }, {});

        const totalUnapplied = payments.reduce((sum, payment) => {
            const pAmount = normalizeAmount(payment.amount);
            const allocated = allocationMap[payment._id.toString()] || new Decimal(0);
            return sum.plus(pAmount.minus(allocated));
        }, new Decimal(0));

        return toApiAmount(totalUnapplied);
    }

    const org = await Organization.findById(organizationId).select('unappliedBalance');
    return toApiAmount(org?.unappliedBalance || 0);
};

const getShipmentAccounting = async (shipmentId, session = null) => {
    const shipment = await Shipment.findById(shipmentId).session(session);
    if (!shipment) return null;

    const totalCharge = getShipmentChargeAmount(shipment);
    const allocated = await getAllocationTotal({ shipmentId });
    const remaining = totalCharge.minus(allocated);
    const daysOutstanding = Math.floor((Date.now() - new Date(shipment.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    let status = 'unpaid';
    if (allocated > 0 && remaining.gt(0)) status = 'partial';
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
    const now = new Date();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

    const agingData = await Shipment.aggregate([
        { $match: { organization: organizationId ? (organizationId instanceof mongoose.Types.ObjectId ? organizationId : new mongoose.Types.ObjectId(organizationId)) : null } },
        {
            $lookup: {
                from: 'paymentallocations',
                localField: '_id',
                foreignField: 'shipment',
                as: 'allocations'
            }
        },
        {
            $addFields: {
                totalAllocated: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: '$allocations',
                                    as: 'a',
                                    cond: { $eq: ['$$a.status', 'ACTIVE'] }
                                }
                            },
                            as: 'f',
                            in: '$$f.amount'
                        }
                    }
                },
                totalCharge: { $ifNull: ['$pricingSnapshot.totalPrice', '$price'] }
            }
        },
        {
            $addFields: {
                remaining: { $subtract: ['$totalCharge', '$totalAllocated'] },
                daysOld: {
                    $divide: [
                        { $subtract: [now, '$createdAt'] },
                        1000 * 60 * 60 * 24
                    ]
                }
            }
        },
        { $match: { remaining: { $gt: 0.001 } } }
    ]);

    let totalUnpaid = new Decimal(0);

    for (const item of agingData) {
        const remaining = normalizeAmount(item.remaining);
        totalUnpaid = totalUnpaid.plus(remaining);

        if (item.daysOld <= 30) buckets['0-30'] = toApiAmount(normalizeAmount(buckets['0-30']).plus(remaining));
        else if (item.daysOld <= 60) buckets['31-60'] = toApiAmount(normalizeAmount(buckets['31-60']).plus(remaining));
        else if (item.daysOld <= 90) buckets['61-90'] = toApiAmount(normalizeAmount(buckets['61-90']).plus(remaining));
        else buckets['90+'] = toApiAmount(normalizeAmount(buckets['90+']).plus(remaining));
    }

    return { totalUnpaid: toApiAmount(totalUnpaid), buckets };
};

const getOrganizationOverview = async (organizationId, creditLimit = 0) => {
    const balance = await getOrganizationBalance(organizationId);
    const unappliedCash = await getUnappliedCash(organizationId);

    // Re-sync shipment financial fields to ensure UI reflects correct statuses (for legacy data)
    await syncOrganizationShipmentFinancials(organizationId);

    // Standardized AR Aging
    const { totalUnpaid, buckets } = await getAgingReport(organizationId);

    // Decimal arithmetic for available credit
    const limit = normalizeAmount(creditLimit);
    const bal = normalizeAmount(balance);
    const availableCredit = toApiAmount(limit.minus(bal));

    return {
        balance,
        creditLimit: toApiAmount(limit),
        availableCredit,
        unappliedCash,
        totalUnpaid,
        agingBuckets: buckets
    };
};

const getRevenueSnapshot = async ({ startDate, endDate, orgId }) => {
    const match = {
        sourceRepo: 'Shipment'
    };
    if (orgId) match.organization = orgId instanceof mongoose.Types.ObjectId ? orgId : new mongoose.Types.ObjectId(orgId);
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const snapshot = await OrganizationLedger.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    organization: '$organization'
                },
                totalRevenue: { $sum: { $cond: [{ $eq: ['$entryType', 'DEBIT'] }, '$amount', { $subtract: [0, '$amount'] }] } },
                shipmentCount: { $sum: { $cond: [{ $eq: ['$entryType', 'DEBIT'] }, 1, 0] } }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    return snapshot;
};

const updatePaymentStatus = async (paymentId, session = null) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) return null;

    const allocated = await getAllocationTotal({ paymentId });
    const pAmount = normalizeAmount(payment.amount);
    const remaining = pAmount.minus(allocated);

    if (remaining.lte(0.001)) payment.status = 'APPLIED';
    else if (allocated.gt(0)) payment.status = 'PARTIALLY_APPLIED';
    else payment.status = 'UNAPPLIED';

    await payment.save({ session });
    return payment;
};

const updateShipmentPaidStatus = async (shipmentId, session = null) => {
    const id = typeof shipmentId === 'string' ? new mongoose.Types.ObjectId(shipmentId) : shipmentId;
    const accounting = await getShipmentAccounting(id, session);
    if (!accounting) return;

    // Use string/number comparison for db update
    const isPaid = accounting.remainingBalance <= 0.001;
    await Shipment.findByIdAndUpdate(shipmentId, {
        paid: isPaid,
        totalPaid: accounting.totalPaid,
        remainingBalance: accounting.remainingBalance
    }, { session });
};

const allocatePayment = async ({ organizationId, paymentId, shipmentId, amount, createdBy, isFifo = false, session = null }) => {
    // Allocation amount is passed as number, normalize it
    const allocAmount = normalizeAmount(amount);

    const [allocation] = await PaymentAllocation.create([{
        organization: organizationId,
        payment: paymentId,
        shipment: shipmentId,
        amount: toApiAmount(allocAmount),
        createdBy,
        isFifo
    }], { session });

    const p = await Payment.findById(paymentId).session(session);
    const s = await Shipment.findById(shipmentId).session(session);
    const u = createdBy ? await User.findById(createdBy).select('name') : null;

    // Create a 0-amount audit entry in the ledger for visibility
    await createLedgerEntry(organizationId, {
        sourceRepo: 'Payment',
        sourceId: paymentId,
        amount: 0,
        entryType: 'CREDIT',
        category: 'ALLOCATION',
        description: `${isFifo ? '[FIFO] ' : ''}Allocation: ${p?.reference || 'Payment'} applied to ${s?.trackingNumber || 'Shipment'} by ${u?.name || 'System'}`,
        createdBy,
        session
    });

    // Update statuses
    await updatePaymentStatus(paymentId, session);
    await updateShipmentPaidStatus(shipmentId, session);

    // Atomically decrement the unapplied balance
    if (organizationId) {
        const decValue = Number(allocAmount.toFixed(3));
        await Organization.findByIdAndUpdate(organizationId, {
            $inc: { unappliedBalance: -decValue }
        }, { session });
    }

    return allocation;
};

const reverseAllocation = async ({ allocationId, reversedBy, reason }) => {
    const allocation = await PaymentAllocation.findById(allocationId);
    if (!allocation) return null;

    allocation.status = 'REVERSED';
    allocation.reversedAt = new Date();
    allocation.reversalReason = reason || 'Reversal requested';
    allocation.reversedBy = reversedBy;
    await allocation.save();

    await updatePaymentStatus(allocation.payment);
    await updateShipmentPaidStatus(allocation.shipment);

    // Atomically increment the unapplied balance back
    if (allocation.organization) {
        const incValue = Number(normalizeAmount(allocation.amount).toFixed(3));

        await Organization.findByIdAndUpdate(allocation.organization, {
            $inc: { unappliedBalance: incValue }
        });
    }

    return allocation;
};

/**
 * Audit-Hardened Reversal: Creates an offsetting record for a specific ledger entry.
 * Ensures the ledger remains immutable and append-only.
 */
const reverseLedgerEntry = async (entryId, reversedBy, reason) => {
    const originalEntry = await OrganizationLedger.findById(entryId);
    if (!originalEntry) throw new Error('Original ledger entry not found');

    const amount = normalizeAmount(originalEntry.amount);
    // Reverse the entry type: DEBIT -> CREDIT, CREDIT -> DEBIT
    const entryType = originalEntry.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    const description = `REVERSAL: ${originalEntry.description} (Reason: ${reason || 'Manual reversal'})`;

    // Create the offsetting entry using atomic service
    const reversalEntry = await createLedgerEntry(originalEntry.organization, {
        sourceRepo: 'Reversal',
        sourceId: originalEntry.sourceId,
        parentEntryId: originalEntry._id,
        amount: toApiAmount(amount),
        entryType,
        category: 'REVERSAL',
        description,
        reference: originalEntry.reference,
        createdBy: reversedBy
    });

    // Special Case: If we reverse a Payment Credit, we must decrement the Unapplied Balance
    if (originalEntry.category === 'PAYMENT') {
        const unappliedMultiplier = entryType === 'DEBIT' ? -1 : 1;
        const incValue = Number(amount.times(unappliedMultiplier).toFixed(3));

        await Organization.findByIdAndUpdate(originalEntry.organization, {
            $inc: { unappliedBalance: incValue }
        });
    }

    return reversalEntry;
};

const allocatePaymentsFifo = async ({ organizationId, createdBy }) => {
    const payments = await Payment.find({ organization: organizationId }).sort({ postedAt: 1 });
    const shipments = await Shipment.find({ organization: organizationId }).sort({ createdAt: 1 });

    const allocations = [];

    for (const payment of payments) {
        const allocatedTotal = await getAllocationTotal({ paymentId: payment._id });
        let remainingPayment = normalizeAmount(payment.amount).minus(allocatedTotal);
        if (remainingPayment.lte(0)) continue;

        for (const shipment of shipments) {
            if (remainingPayment.lte(0)) break;
            const totalCharge = getShipmentChargeAmount(shipment);
            if (totalCharge.lte(0)) continue;

            const shipmentAllocated = await getAllocationTotal({ shipmentId: shipment._id });
            const remainingShipment = totalCharge.minus(shipmentAllocated);
            if (remainingShipment.lte(0)) continue;

            const allocationAmount = Decimal.min(remainingPayment, remainingShipment);

            // Only allocate if amount is meaningful (> 0.001)
            if (allocationAmount.lte(0.001)) continue;

            const allocation = await allocatePayment({
                organizationId,
                paymentId: payment._id,
                shipmentId: shipment._id,
                amount: toApiAmount(allocationAmount),
                createdBy,
                isFifo: true
            });
            allocations.push(allocation);
            remainingPayment = remainingPayment.minus(allocationAmount);
        }
    }

    return allocations;
};

const syncOrganizationShipmentFinancials = async (organizationId) => {
    const orgQuery = (organizationId === 'none' || !organizationId) ? null : organizationId;
    const shipments = await Shipment.find({ organization: orgQuery });
    for (const shipment of shipments) {
        await updateShipmentPaidStatus(shipment._id);
    }
};

module.exports = {
    normalizeAmount,
    getShipmentChargeAmount,
    getOrganizationBalance,
    getLatestBalance,
    createLedgerEntry,
    getAccountCredit,
    getUnappliedCash,
    getShipmentAccounting,
    getAgingReport,
    getOrganizationOverview,
    getRevenueSnapshot,
    updatePaymentStatus,
    updateShipmentPaidStatus,
    syncOrganizationShipmentFinancials,
    allocatePayment,
    reverseAllocation,
    reverseLedgerEntry,
    allocatePaymentsFifo
};
