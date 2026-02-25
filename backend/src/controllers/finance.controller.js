const mongoose = require('mongoose');
const User = require('../models/user.model');
const Organization = require('../models/organization.model');
const OrganizationLedger = require('../models/organizationLedger.model');
const Payment = require('../models/payment.model');
const PaymentAllocation = require('../models/paymentAllocation.model');
const logger = require('../utils/logger');
const financeLedgerService = require('../services/financeLedger.service');
const { isOrgRole } = require('../middleware/rbac.policy');

/**
 * Get current user balance
 */
exports.getBalance = async (req, res) => {
    try {
        // Fetch User and populate Organization
        const user = await User.findById(req.user._id).populate('organization');
        const org = user.organization;

        if (!org) {
            return res.status(404).json({ success: false, error: 'User is not linked to an organization' });
        }

        const balance = await financeLedgerService.getOrganizationBalance(org._id);
        const availableCredit = (org.creditLimit || 0) - balance;
        const unappliedCash = await financeLedgerService.getUnappliedCash(org._id);

        res.status(200).json({
            success: true,
            data: {
                balance,
                creditLimit: org.creditLimit || 0,
                availableCredit,
                unappliedCash,
                currency: org.currency || 'KWD'
            }
        });
    } catch (error) {
        logger.error('Error getting balance:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve balance' });
    }
};

/**
 * Get transaction history (Ledger)
 */
exports.getLedger = async (req, res) => {
    try {
        const { page = 1, limit = 20, orgId } = req.query;

        const query = {};

        const currentUser = await User.findById(req.user._id);

        if (isOrgRole(req.user.role)) {
            if (!currentUser.organization) {
                return res.status(404).json({ success: false, error: 'User is not linked to an organization' });
            }
            query.organization = currentUser.organization;
        } else if (orgId) {
            query.organization = orgId === 'none' ? null : orgId;
        }

        const skip = (page - 1) * limit;

        const rawTransactions = await OrganizationLedger.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate({
                path: 'sourceId',
                select: 'trackingNumber status reference amount'
            });

        // Map results for backward compatibility with frontend
        const transactions = rawTransactions.map(t => {
            const doc = t.toObject();
            if (doc.sourceRepo === 'Shipment') doc.shipment = doc.sourceId;
            if (doc.sourceRepo === 'Payment') doc.payment = doc.sourceId;
            return doc;
        });

        const total = await OrganizationLedger.countDocuments(query);

        res.status(200).json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Error getting ledger:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve transaction history' });
    }
};

/**
 * Manual Balance Adjustment (Admin Only)
 */


exports.getOrganizationOverview = async (req, res) => {
    try {
        const isNone = req.params.orgId === 'none';

        if (isNone && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only administrators can view the global unorganized overview' });
        }

        let organization = null;
        if (!isNone) {
            organization = await Organization.findById(req.params.orgId);
            if (!organization) {
                return res.status(404).json({ success: false, error: 'Organization not found' });
            }
        }

        const orgId = organization ? organization._id : null;
        const creditLimit = organization ? organization.creditLimit : 0;

        const overview = await financeLedgerService.getOrganizationOverview(orgId, creditLimit);

        res.status(200).json({ success: true, data: overview });
    } catch (error) {
        logger.error('Error getting organization overview:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve organization overview' });
    }
};

exports.getShipmentAccounting = async (req, res) => {
    try {
        const accounting = await financeLedgerService.getShipmentAccounting(req.params.shipmentId);
        if (!accounting) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        const allocations = await PaymentAllocation.find({ shipment: req.params.shipmentId })
            .populate('payment', 'reference amount postedAt')
            .sort({ allocatedAt: -1 });

        res.status(200).json({
            success: true,
            data: {
                ...accounting,
                allocations
            }
        });
    } catch (error) {
        logger.error('Error getting shipment accounting:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve shipment accounting' });
    }
};

exports.listPayments = async (req, res) => {
    try {
        const isNone = req.params.orgId === 'none';
        if (isNone && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only administrators can view the global unorganized ledger' });
        }

        const query = {
            organization: isNone ? null : new mongoose.Types.ObjectId(req.params.orgId)
        };

        const payments = await Payment.aggregate([
            { $match: query },
            {
                $lookup: {
                    from: 'paymentallocations',
                    localField: '_id',
                    foreignField: 'payment',
                    as: 'allocations'
                }
            },
            {
                $addFields: {
                    allocatedAmount: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: '$allocations',
                                        as: 'a',
                                        cond: { $eq: ['$$a.status', 'ACTIVE'] }
                                    }
                                },
                                as: 'activeAlloc',
                                in: '$$activeAlloc.amount'
                            }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'organizationledgers',
                    localField: 'ledgerEntry',
                    foreignField: '_id',
                    as: 'ledgerEntry'
                }
            },
            { $unwind: { path: '$ledgerEntry', preserveNullAndEmptyArrays: true } },
            { $sort: { postedAt: -1 } }
        ]);

        res.status(200).json({ success: true, data: payments });
    } catch (error) {
        logger.error('Error listing payments:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve payments' });
    }
};

exports.postPayment = async (req, res) => {
    try {
        const { amount, method, reference, notes } = req.body;
        const isNone = req.params.orgId === 'none';

        if (amount <= 0) {
            return res.status(400).json({ success: false, error: 'Payment amount must be greater than zero' });
        }

        if (isNone && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only administrators can post payments to the global ledger' });
        }

        let organization = null;
        if (!isNone) {
            organization = await Organization.findById(req.params.orgId);
            if (!organization) {
                return res.status(404).json({ success: false, error: 'Organization not found' });
            }
        }

        const payment = await Payment.create({
            organization: organization ? organization._id : null,
            amount,
            method,
            reference,
            notes,
            createdBy: req.user._id
        });

        const ledgerEntry = await financeLedgerService.createLedgerEntry(isNone ? null : organization._id, {
            sourceRepo: 'Payment',
            sourceId: payment._id,
            amount,
            entryType: 'CREDIT',
            category: 'PAYMENT',
            description: `Payment posted${reference ? ` (${reference})` : ''} by ${req.user.name || 'Staff'}`,
            reference,
            createdBy: req.user._id
        });

        // Atomically update the unappliedBalance on the organization
        if (organization) {
            await Organization.findByIdAndUpdate(organization._id, {
                $inc: { unappliedBalance: amount }
            });
        }

        payment.ledgerEntry = ledgerEntry._id;
        await payment.save();

        res.status(201).json({ success: true, data: payment });
    } catch (error) {
        logger.error('Error posting payment:', error);
        res.status(500).json({ success: false, error: 'Failed to post payment' });
    }
};

exports.allocatePaymentManual = async (req, res) => {
    let session = null;
    let useTransaction = false;

    try {
        const topologyType = mongoose.connection.client?.topology?.description?.type || 'Unknown';

        // HARD-DISABLED FOR DEBUGGING
        useTransaction = false;

        console.log(`[DEBUG] FORCE NON-TX STRATEGY. Topology: ${topologyType}`);

        // In development/test, default to non-transactional to avoid standalone server issues
        // const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

        // Only use transactions if we are in production and it's a replica set/sharded
        // useTransaction = !isDev && ['ReplicaSetWithPrimary', 'Sharded'].includes(topologyType);

        // if (process.env.FORCE_TRANSACTIONS === 'true') useTransaction = true;

        // console.log(`[DEBUG] Topology: ${topologyType}, Strategy: ${useTransaction ? 'TX' : 'NON-TX'}`);

        if (useTransaction) {
            session = await mongoose.startSession();
            session.startTransaction();
        } else {
            session = undefined;
        }
    } catch (txError) {
        logger.warn('Failed to initialize session, proceeding without one:', txError.message);
        session = undefined;
        useTransaction = false;
    }

    try {
        const { paymentId, shipmentId, shipmentIds, amount } = req.body;

        // Ensure we have at least one shipment ID
        const finalShipmentIds = Array.isArray(shipmentIds) ? shipmentIds : (shipmentId ? [shipmentId] : []);

        if (!paymentId || finalShipmentIds.length === 0 || amount === undefined || amount === null) {
            logger.warn('Allocation attempt with missing fields:', { paymentId, finalShipmentIds, amount });
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, error: 'Allocation amount must be greater than zero' });
        }

        let remainingToAllocate = parseFloat(amount);
        const results = [];

        logger.info(`Starting manual allocation [STRATEGY=${useTransaction ? 'TX' : 'NON-TX'}]: Payment ${paymentId}, Amount ${amount}`);

        for (const id of finalShipmentIds) {
            if (remainingToAllocate <= 0) break;

            const orgId = req.params.orgId === 'none' ? null : req.params.orgId;

            if (!orgId && req.user.role !== 'admin') {
                throw new Error('Only administrators can allocate funds for solo shippers');
            }

            // Get shipment accounting to see how much is needed
            const accounting = await financeLedgerService.getShipmentAccounting(id);
            if (!accounting) continue;

            const allocationAmount = Math.min(remainingToAllocate, accounting.remainingBalance);
            if (allocationAmount <= 0.001) continue;

            const allocationPayload = {
                organizationId: orgId,
                paymentId,
                shipmentId: id,
                amount: allocationAmount,
                createdBy: req.user._id
            };
            if (session) allocationPayload.session = session;

            const allocation = await financeLedgerService.allocatePayment(allocationPayload);

            results.push(allocation);
            remainingToAllocate -= allocationAmount;
        }

        if (session && useTransaction) {
            await session.commitTransaction();
        }
        res.status(201).json({ success: true, data: results });
    } catch (error) {
        if (session && useTransaction) {
            try { await session.abortTransaction(); } catch (abortErr) { /* ignore */ }
        }

        // Check for the specific "Transaction numbers" error to provide a better user message or fallback
        if (error.message.includes('Transaction numbers') || error.code === 20) {
            logger.error('CRITICAL: Transaction failed on standalone DB. Retrying WITHOUT transaction...');
            // In a production app, we might retry here, but for now we'll return a clear error
            // telling them the DB is standalone.
            return res.status(500).json({
                success: false,
                error: 'Database does not support transactions. Please ensure MongoDB is running as a Replica Set.'
            });
        }

        logger.error('Error allocating payment:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to allocate payment' });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

exports.allocatePaymentsFifo = async (req, res) => {
    try {
        const orgId = req.params.orgId === 'none' ? null : req.params.orgId;
        const allocations = await financeLedgerService.allocatePaymentsFifo({
            organizationId: orgId,
            createdBy: req.user._id
        });

        res.status(201).json({ success: true, data: allocations });
    } catch (error) {
        logger.error('Error allocating payments FIFO:', error);
        res.status(500).json({ success: false, error: 'Failed to allocate payments' });
    }
};

exports.reverseAllocation = async (req, res) => {
    try {
        const allocation = await financeLedgerService.reverseAllocation({
            allocationId: req.params.allocationId,
            reversedBy: req.user._id,
            reason: req.body?.reason
        });
        if (!allocation) {
            return res.status(404).json({ success: false, error: 'Allocation not found' });
        }

        res.status(200).json({ success: true, data: allocation });
    } catch (error) {
        logger.error('Error reversing allocation:', error);
        res.status(500).json({ success: false, error: 'Failed to reverse allocation' });
    }
};
