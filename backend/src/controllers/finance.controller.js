const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const financeLedgerService = require('../services/financeLedger.service');
const { isOrgRole } = require('../middleware/rbac.policy');
const { handleControllerError } = require('../utils/controllerError');

/**
 * Get current user balance
 */
exports.getBalance = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                organization: {
                    select: {
                        id: true,
                        creditLimit: true,
                        currency: true
                    }
                }
            }
        });

        if (!user || !user.organization) {
            return res.status(404).json({ success: false, error: 'User is not linked to an organization' });
        }

        const org = user.organization;
        const balance = await financeLedgerService.getOrganizationBalance(org.id);
        const availableCredit = Number(org.creditLimit || 0) - Number(balance);
        const unappliedCash = await financeLedgerService.getUnappliedCash(org.id);

        res.status(200).json({
            success: true,
            data: {
                balance: Number(balance),
                creditLimit: Number(org.creditLimit || 0),
                availableCredit: Number(availableCredit),
                unappliedCash: Number(unappliedCash),
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
        let organizationId = null;

        if (isOrgRole(req.user.role)) {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user.organizationId) {
                return res.status(404).json({ success: false, error: 'User is not linked' });
            }
            organizationId = user.organizationId;
        } else if (orgId) {
            organizationId = orgId === 'none' ? null : orgId;
            // Log cross-org finance queries by staff/admin (F-17)
            if (organizationId) {
                logger.info(`Finance query: user=${req.user.email} (${req.user.role}) queried org=${organizationId}`);
            }
        }

        const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const skip = (parsedPage - 1) * parsedLimit;

        const [transactions, total] = await Promise.all([
            prisma.organizationLedger.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parsedLimit
            }),
            prisma.organizationLedger.count({ where: { organizationId } })
        ]);

        res.status(200).json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                pages: Math.ceil(total / parsedLimit)
            }
        });
    } catch (error) {
        logger.error('Error getting ledger:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve transaction history' });
    }
};

/**
 * Organization Overview for accounting dashboard
 */
exports.getOrganizationOverview = async (req, res) => {
    try {
        const isNone = req.params.orgId === 'none';

        if (isNone && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        let organization = null;
        if (!isNone) {
            organization = await prisma.organization.findUnique({ where: { id: req.params.orgId } });
            if (!organization) return res.status(404).json({ success: false, error: 'Not found' });
        }

        const orgId = organization ? organization.id : null;
        const creditLimit = organization ? Number(organization.creditLimit) : 0;

        const overview = await financeLedgerService.getOrganizationOverview(orgId, creditLimit);

        res.status(200).json({ success: true, data: overview });
    } catch (error) {
        logger.error('Error getting organization overview:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Get detailed accounting for a single shipment
 */
exports.getShipmentAccounting = async (req, res) => {
    try {
        const accounting = await financeLedgerService.getShipmentAccounting(req.params.shipmentId);
        if (!accounting) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const allocations = await prisma.paymentAllocation.findMany({
            where: { shipmentId: req.params.shipmentId },
            include: {
                payment: {
                    select: { reference: true, amount: true, postedAt: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: { ...accounting, allocations }
        });
    } catch (error) {
        logger.error('Error getting shipment accounting:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * List all payments for an organization
 */
exports.listPayments = async (req, res) => {
    try {
        const isNone = req.params.orgId === 'none';
        const organizationId = isNone ? null : req.params.orgId;

        const payments = await prisma.payment.findMany({
            where: { organizationId },
            include: {
                allocations: {
                    where: { status: 'ACTIVE' },
                    select: { amount: true }
                }
            },
            orderBy: { postedAt: 'desc' }
        });

        // Add virtual field for allocatedAmount
        const data = payments.map(p => {
            const allocatedAmount = p.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
            return { ...p, allocatedAmount };
        });

        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error('Error listing payments:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Post a new payment
 */
exports.postPayment = async (req, res) => {
    try {
        const { amount, method, reference, notes } = req.body;
        const isNone = req.params.orgId === 'none';
        const organizationId = isNone ? null : req.params.orgId;

        if (amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Payment
            const payment = await tx.payment.create({
                data: {
                    organizationId,
                    amount: Number(amount),
                    method,
                    reference,
                    notes,
                    createdById: req.user.id
                }
            });

            // 2. Create Ledger Entry
            await financeLedgerService.createLedgerEntry(organizationId, {
                sourceRepo: 'Payment',
                sourceId: payment.id,
                amount: Number(amount),
                entryType: 'CREDIT',
                category: 'PAYMENT',
                description: `Payment posted${reference ? ` (${reference})` : ''}`,
                reference,
                createdBy: req.user.id
            }, tx);

            // 3. Update Organization Balance
            if (organizationId) {
                await tx.organization.update({
                    where: { id: organizationId },
                    data: {
                        unappliedBalance: { increment: Number(amount) }
                    }
                });
            }

            return payment;
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error('Error posting payment:', error);
        res.status(500).json({ success: false, error: 'Failed to post payment' });
    }
};

/**
 * Manually allocate payment funds to specific shipments
 */
exports.allocatePaymentManual = async (req, res) => {
    try {
        const { paymentId, shipmentIds, amount } = req.body;
        const orgId = req.params.orgId === 'none' ? null : req.params.orgId;

        if (!paymentId || !shipmentIds || !amount) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        let remainingToAllocate = parseFloat(amount);
        const results = [];

        // We run these in a transaction to ensure all or nothing
        await prisma.$transaction(async (tx) => {
            for (const id of shipmentIds) {
                if (remainingToAllocate <= 0.001) break;

                const accounting = await financeLedgerService.getShipmentAccounting(id, tx);
                if (!accounting) continue;

                const allocationAmount = Math.min(remainingToAllocate, accounting.remainingBalance);
                if (allocationAmount <= 0.001) continue;

                const allocation = await financeLedgerService.allocatePayment({
                    organizationId: orgId,
                    paymentId,
                    shipmentId: id,
                    amount: allocationAmount,
                    createdBy: req.user.id
                }, tx);

                results.push(allocation);
                remainingToAllocate -= allocationAmount;
            }
        }, { timeout: 20000, maxWait: 10000 });

        res.status(201).json({ success: true, data: results });
    } catch (error) {
        return handleControllerError(res, error, 'Payment allocation');
    }
};

/**
 * Automate allocations using FIFO logic
 */
exports.allocatePaymentsFifo = async (req, res) => {
    try {
        const orgId = req.params.orgId === 'none' ? null : req.params.orgId;
        const allocations = await financeLedgerService.allocatePaymentsFifo({
            organizationId: orgId,
            createdBy: req.user.id
        });

        res.status(201).json({ success: true, data: allocations });
    } catch (error) {
        logger.error('Error allocating payments FIFO:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Reverse a previous allocation
 */
exports.reverseAllocation = async (req, res) => {
    try {
        const allocation = await financeLedgerService.reverseAllocation({
            allocationId: req.params.allocationId,
            reversedBy: req.user.id,
            reason: req.body?.reason
        });
        if (!allocation) return res.status(404).json({ success: false, error: 'Not found' });

        res.status(200).json({ success: true, data: allocation });
    } catch (error) {
        logger.error('Error reversing allocation:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
