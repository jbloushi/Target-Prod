const mongoose = require('mongoose');
const Organization = require('../models/organization.model');
const OrganizationLedger = require('../models/organizationLedger.model');
const Payment = require('../models/payment.model');
const PaymentAllocation = require('../models/paymentAllocation.model');
const Shipment = require('../models/shipment.model');
const financeLedgerService = require('../services/financeLedger.service');
const logger = require('../utils/logger');

/**
 * Financial Reconciliation Worker
 * 
 * Objectives:
 * 1. Verify Organization Account Balances (Ledger vs Organization model)
 * 2. Verify Unapplied Cash Balances (Calculated Allocations vs Organization model cached field)
 * 3. [Optional] Repair Shipment Paid Statuses
 */
const reconcileOrganization = async (orgId, repair = false) => {
    const org = await Organization.findById(orgId);
    if (!org) return { success: false, error: 'Org not found' };

    // 1. Balance Check (Ledger History vs Org Balance)
    const ledgerSummary = await OrganizationLedger.aggregate([
        { $match: { organization: org._id } },
        {
            $group: {
                _id: null,
                total: {
                    $sum: {
                        $cond: [{ $eq: ['$entryType', 'DEBIT'] }, '$amount', { $subtract: [0, '$amount'] }]
                    }
                }
            }
        }
    ]);

    const calculatedBalance = ledgerSummary[0]?.total || 0;
    const balanceDiscrepancy = Math.abs(calculatedBalance - org.balance);

    // 2. Unapplied Cash Check (Payments - Allocations vs Org cached field)
    const payments = await Payment.find({ organization: org._id });
    const allocations = await PaymentAllocation.aggregate([
        { $match: { organization: org._id, status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalPaidIn = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalAllocated = allocations[0]?.total || 0;
    const calculatedUnapplied = totalPaidIn - totalAllocated;
    const unappliedDiscrepancy = Math.abs(calculatedUnapplied - (org.unappliedBalance || 0));

    const result = {
        organization: org.name,
        balance: {
            actual: org.balance,
            calculated: calculatedBalance,
            discrepancy: balanceDiscrepancy,
            inSync: balanceDiscrepancy < 0.001
        },
        unapplied: {
            actual: org.unappliedBalance,
            calculated: calculatedUnapplied,
            discrepancy: unappliedDiscrepancy,
            inSync: unappliedDiscrepancy < 0.001
        }
    };

    if (repair && (!result.balance.inSync || !result.unapplied.inSync)) {
        logger.info(`Repairing financial state for ${org.name}...`);
        org.balance = calculatedBalance;
        org.unappliedBalance = calculatedUnapplied;
        await org.save();
        result.repaired = true;
    }

    return result;
};

const reconcileAll = async (repair = false) => {
    const orgs = await Organization.find({});
    const reports = [];
    for (const org of orgs) {
        reports.push(await reconcileOrganization(org._id, repair));
    }
    return reports;
};

module.exports = {
    reconcileOrganization,
    reconcileAll
};
