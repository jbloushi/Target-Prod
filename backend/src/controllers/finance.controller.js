const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const financeLedgerService = require('../services/financeLedger.service');
const financeInvoiceService = require('../services/financeInvoice.service');
const { isOrgRole } = require('../middleware/rbac.policy');
const { canAccessOrganization } = require('../middleware/authorize.middleware');
const { handleControllerError } = require('../utils/controllerError');

const normalizeOrgParam = (orgId) => orgId === 'none' ? null : orgId;
const normalizeCurrencyCode = (currency, fallback = 'KWD') => String(currency || fallback || 'KWD').trim().toUpperCase().slice(0, 3);
const getShipmentBillingCurrency = (shipment, fallback = 'KWD') => normalizeCurrencyCode(
    shipment?.pricingSnapshot?.billingCurrency || shipment?.pricingSnapshot?.currency || shipment?.currency,
    fallback
);

const currencyFromLedgerEntry = (entry, fallback = 'KWD') => normalizeCurrencyCode(
    entry?.currency || entry?.metadata?.currency || entry?.metadata?.billingCurrency || entry?.metadata?.declaredCurrency,
    fallback
);

const assertFinanceOrgAccess = (req, res, organizationId) => {
    if (!canAccessOrganization(req, organizationId)) {
        res.status(403).json({ success: false, error: 'Unauthorized' });
        return false;
    }
    return true;
};

exports.listOrganizationInvoices = async (req, res) => {
    try {
        const organizationId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, organizationId)) return;

        const result = await financeInvoiceService.listInvoices({
            organizationId,
            status: req.query.status,
            page: req.query.page,
            limit: req.query.limit
        });

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'Invoice listing');
    }
};

exports.createOrganizationInvoice = async (req, res) => {
    try {
        const organizationId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, organizationId)) return;

        const { periodStart, periodEnd, dueDate, notes, vatRate } = req.body;
        if (!periodStart || !periodEnd) {
            return res.status(400).json({ success: false, error: 'periodStart and periodEnd are required' });
        }

        const invoice = await financeInvoiceService.createInvoiceFromPeriod({
            organizationId,
            periodStart,
            periodEnd,
            dueDate,
            notes,
            vatRate,
            currency: req.body.currency,
            createdBy: req.user.id
        });

        res.status(201).json({ success: true, data: invoice });
    } catch (error) {
        return handleControllerError(res, error, 'Invoice creation');
    }
};

exports.updateInvoiceStatus = async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: req.params.invoiceId },
            select: { id: true, organizationId: true }
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!assertFinanceOrgAccess(req, res, invoice.organizationId)) return;

        const result = await financeInvoiceService.updateInvoiceStatus({
            invoiceId: req.params.invoiceId,
            status: req.body.status,
            updatedBy: req.user.id
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        return handleControllerError(res, error, 'Invoice status update');
    }
};

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
        const currency = normalizeCurrencyCode(org.currency);
        const balance = await financeLedgerService.getOrganizationBalance(org.id, currency);
        const availableCredit = Number(org.creditLimit || 0) - Number(balance);
        const unappliedCash = await financeLedgerService.getUnappliedCash(org.id, currency);

        res.status(200).json({
            success: true,
            data: {
                balance: Number(balance),
                creditLimit: Number(org.creditLimit || 0),
                availableCredit: Number(availableCredit),
                unappliedCash: Number(unappliedCash),
                currency
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
        }

        const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const skip = (parsedPage - 1) * parsedLimit;

        const organization = organizationId
            ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } })
            : null;
        const fallbackCurrency = normalizeCurrencyCode(organization?.currency);

        const [transactions, total] = await Promise.all([
            prisma.organizationLedger.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parsedLimit
            }),
            prisma.organizationLedger.count({ where: { organizationId } })
        ]);

        const data = transactions.map(entry => ({
            ...entry,
            currency: currencyFromLedgerEntry(entry, fallbackCurrency)
        }));

        res.status(200).json({
            success: true,
            data,
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
        const orgId = normalizeOrgParam(req.params.orgId);

        if (!assertFinanceOrgAccess(req, res, orgId)) return;

        let organization = null;
        if (!isNone) {
            organization = await prisma.organization.findUnique({ where: { id: req.params.orgId } });
            if (!organization) return res.status(404).json({ success: false, error: 'Not found' });
        }

        const creditLimit = organization ? Number(organization.creditLimit) : 0;

        const overview = await financeLedgerService.getOrganizationOverview(orgId, creditLimit, organization?.currency);

        res.status(200).json({
            success: true,
            data: {
                ...overview,
                currency: normalizeCurrencyCode(overview.currency || organization?.currency)
            }
        });
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
        if (!assertFinanceOrgAccess(req, res, accounting.shipment?.organizationId || null)) return;

        const allocations = await prisma.paymentAllocation.findMany({
            where: { shipmentId: req.params.shipmentId },
            include: {
                payment: {
                    select: { reference: true, amount: true, currency: true, postedAt: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: {
                ...accounting,
                currency: getShipmentBillingCurrency(accounting.shipment, accounting.currency),
                allocations
            }
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
        const organizationId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, organizationId)) return;

        const payments = await prisma.payment.findMany({
            where: { organizationId },
            include: {
                allocations: {
                    where: { status: 'ACTIVE' },
                    select: { amount: true, currency: true }
                }
            },
            orderBy: { postedAt: 'desc' }
        });

        // Add virtual field for allocatedAmount
        const data = payments.map(p => {
            const paymentCurrency = normalizeCurrencyCode(p.currency);
            const allocatedAmount = p.allocations
                .filter(a => normalizeCurrencyCode(a.currency, paymentCurrency) === paymentCurrency)
                .reduce((sum, a) => sum + Number(a.amount), 0);
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
        const organizationId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, organizationId)) return;

        if (amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });
        const currency = normalizeCurrencyCode(req.body.currency);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Payment
            const payment = await tx.payment.create({
                data: {
                    organizationId,
                    amount: Number(amount),
                    currency,
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
                createdBy: req.user.id,
                metadata: { currency }
            }, tx);

            if (organizationId) {
                const org = await tx.organization.findUnique({
                    where: { id: organizationId },
                    select: { currency: true }
                });
                if (normalizeCurrencyCode(org?.currency) === currency) {
                    await tx.organization.update({
                        where: { id: organizationId },
                        data: {
                            unappliedBalance: { increment: Number(amount) }
                        }
                    });
                }
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
        const orgId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, orgId)) return;

        if (!paymentId || !shipmentIds || !amount) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            select: { id: true, organizationId: true, currency: true }
        });
        if (!payment || payment.organizationId !== orgId) {
            return res.status(403).json({ success: false, error: 'Payment is not accessible for this organization' });
        }

        const shipmentOrgChecks = await prisma.shipment.findMany({
            where: { id: { in: shipmentIds } },
            select: { id: true, organizationId: true, currency: true, pricingSnapshot: true }
        });
        if (shipmentOrgChecks.length !== shipmentIds.length || shipmentOrgChecks.some(shipment => shipment.organizationId !== orgId)) {
            return res.status(403).json({ success: false, error: 'One or more shipments are not accessible for this organization' });
        }
        const paymentCurrency = normalizeCurrencyCode(payment.currency);
        const mismatchedShipment = shipmentOrgChecks.find(shipment => {
            const shipmentCurrency = getShipmentBillingCurrency(shipment, paymentCurrency);
            return shipmentCurrency !== paymentCurrency;
        });
        if (mismatchedShipment) {
            return res.status(400).json({
                success: false,
                error: `Currency mismatch: ${paymentCurrency} payment cannot be allocated to ${getShipmentBillingCurrency(mismatchedShipment, paymentCurrency)} shipment. Select shipments in ${paymentCurrency} or post a matching payment.`
            });
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
        const orgId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, orgId)) return;
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
        const existingAllocation = await prisma.paymentAllocation.findUnique({
            where: { id: req.params.allocationId },
            select: { organizationId: true }
        });
        if (!existingAllocation) return res.status(404).json({ success: false, error: 'Not found' });
        if (!assertFinanceOrgAccess(req, res, existingAllocation.organizationId)) return;

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
