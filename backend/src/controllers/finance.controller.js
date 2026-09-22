const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const financeLedgerService = require('../services/financeLedger.service');
const financeInvoiceService = require('../services/financeInvoice.service');
const carrierReconciliationService = require('../services/carrierReconciliation.service');
const currencyRateService = require('../services/currencyRate.service');
const chatwootNotificationService = require('../services/chatwootNotificationService');
const slaTrackerService = require('../services/slaTracker.service');
const eomStatementCronService = require('../services/eomStatementCron.service');
const generalLedgerService = require('../services/generalLedger.service');
const accountsPayableService = require('../services/accountsPayable.service');
const treasuryService = require('../services/treasury.service');
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

const recordFinancialAuditLog = async ({ userId, action, resource, resourceId, details, req }) => {
    try {
        await prisma.systemAuditLog.create({
            data: {
                userId: userId || null,
                action,
                resource,
                resourceId: resourceId ? String(resourceId) : null,
                newValues: details || null,
                ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
                userAgent: req?.headers?.['user-agent'] || null
            }
        });
    } catch (e) {
        logger.warn(`[Finance Audit] Failed to write SystemAuditLog: ${e.message}`);
    }
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

            // 3. Post Double-Entry GL Entry (Dr 1010 Bank/Cash, Cr 1100 AR)
            try {
                const generalLedgerService = require('../services/generalLedger.service');
                await generalLedgerService.postPaymentReceiptEntry({
                    paymentId: payment.id,
                    reference: payment.reference,
                    organizationId,
                    amount: Number(amount),
                    currency,
                    createdById: req.user.id
                }, tx);
            } catch (glError) {
                logger.warn(`[finance.controller] GL payment posting warning: ${glError.message}`);
            }

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

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'POST_PAYMENT',
            resource: 'Payment',
            resourceId: result.id,
            details: { amount: Number(amount), currency, organizationId, reference },
            req
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

        const isInternalOrg = (await prisma.organization?.findUnique?.({ where: { id: orgId }, select: { type: true } }))?.type === 'internal';
        
        const invalidShipment = shipmentOrgChecks.find(shipment => {
            if (shipment.organizationId === orgId) return false;
            if (isInternalOrg && (!shipment.organizationId || shipment.organizationId === orgId)) return false;
            return true;
        });

        if (shipmentOrgChecks.length !== shipmentIds.length || invalidShipment) {
            return res.status(403).json({ success: false, error: 'One or more shipments are not accessible for this organization'
            });
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

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'ALLOCATE_PAYMENT',
            resource: 'PaymentAllocation',
            resourceId: paymentId,
            details: { paymentId, shipmentIds, totalAllocated: amount, allocationsCount: results.length },
            req
        });

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

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'REVERSE_ALLOCATION',
            resource: 'PaymentAllocation',
            resourceId: req.params.allocationId,
            details: { reason: req.body?.reason },
            req
        });

        res.status(200).json({ success: true, data: allocation });
    } catch (error) {
        logger.error('Error reversing allocation:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Get comprehensive shipment profitability report with true carrier costs and margins
 */
exports.getProfitabilityReport = async (req, res) => {
    try {
        const { orgId, startDate, endDate, carrierCode, page, limit } = req.query;
        let organizationId = null;

        if (isOrgRole(req.user.role)) {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user?.organizationId) return res.status(404).json({ success: false, error: 'User is not linked' });
            organizationId = user.organizationId;
        } else if (orgId) {
            organizationId = normalizeOrgParam(orgId);
        }

        const report = await financeLedgerService.getProfitabilityReport({
            organizationId,
            startDate,
            endDate,
            carrierCode,
            page,
            limit
        });

        res.status(200).json({ success: true, data: report });
    } catch (error) {
        return handleControllerError(res, error, 'Profitability report');
    }
};

/**
 * Get COD cash-clearing summary for drivers
 */
exports.getDriverCodSummary = async (req, res) => {
    try {
        const { driverId, orgId } = req.query;
        const effectiveDriverId = req.user.role === 'driver' ? req.user.id : (driverId && driverId !== 'ALL' ? driverId : undefined);
        const organizationId = isOrgRole(req.user.role)
            ? (await prisma.user.findUnique({ where: { id: req.user.id } }))?.organizationId
            : normalizeOrgParam(orgId);

        const summary = await financeLedgerService.getDriverCashClearing({
            driverId: effectiveDriverId,
            organizationId
        });

        res.status(200).json({ success: true, data: summary });
    } catch (error) {
        return handleControllerError(res, error, 'Driver COD summary');
    }
};

/**
 * Remit driver COD collected cash to the hub vault (Instant 1-step reconciliation)
 */
exports.remitDriverCod = async (req, res) => {
    try {
        const { driverId, amount, currency, shipmentIds, notes } = req.body;
        let targetDriverId = driverId || (req.user.role === 'driver' ? req.user.id : null);

        let resolvedShipmentIds = Array.isArray(shipmentIds) ? [...shipmentIds] : [];
        if (resolvedShipmentIds.length > 0 && prisma.shipment?.findMany) {
            const matched = await prisma.shipment.findMany({
                where: {
                    OR: [
                        { id: { in: resolvedShipmentIds } },
                        { trackingNumber: { in: resolvedShipmentIds } }
                    ]
                },
                select: { id: true, assignedDriverId: true }
            });
            if (matched.length > 0) {
                if (!targetDriverId) {
                    targetDriverId = matched.find(s => s.assignedDriverId)?.assignedDriverId || null;
                }
                if (targetDriverId && prisma.shipment?.updateMany) {
                    const unassigned = matched.filter(s => s.assignedDriverId !== targetDriverId);
                    if (unassigned.length > 0) {
                        await prisma.shipment.updateMany({
                            where: { id: { in: unassigned.map(s => s.id) } },
                            data: { assignedDriverId: targetDriverId }
                        });
                    }
                }
                resolvedShipmentIds = matched.map(s => s.id);
            }
        }

        if (!targetDriverId || !amount) {
            return res.status(400).json({ success: false, error: 'driverId and amount are required' });
        }

        const entry = await financeLedgerService.remitDriverCodCash({
            driverId: targetDriverId,
            amount,
            currency: currency || 'KWD',
            shipmentIds: resolvedShipmentIds,
            receivedBy: req.user.id,
            notes
        });

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'REMIT_COD_CASH',
            resource: 'DriverCodRemittance',
            resourceId: entry.id,
            details: { driverId: targetDriverId, amount: Number(amount), currency, shipmentIds: resolvedShipmentIds },
            req
        });

        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        return handleControllerError(res, error, 'Driver COD remittance');
    }
};

/**
 * Step 1: Request driver COD remittance (Driver / Dispatcher handover submission)
 */
exports.requestDriverCodRemittance = async (req, res) => {
    try {
        const { driverId, amount, currency, shipmentIds, bagReference, notes } = req.body;
        let targetDriverId = driverId || (req.user.role === 'driver' ? req.user.id : null);

        let resolvedShipmentIds = Array.isArray(shipmentIds) ? [...shipmentIds] : [];
        if (resolvedShipmentIds.length > 0 && prisma.shipment?.findMany) {
            const matched = await prisma.shipment.findMany({
                where: {
                    OR: [
                        { id: { in: resolvedShipmentIds } },
                        { trackingNumber: { in: resolvedShipmentIds } }
                    ]
                },
                select: { id: true, assignedDriverId: true }
            });
            if (matched.length > 0) {
                if (!targetDriverId) {
                    targetDriverId = matched.find(s => s.assignedDriverId)?.assignedDriverId || null;
                }
                if (targetDriverId && prisma.shipment?.updateMany) {
                    const unassigned = matched.filter(s => s.assignedDriverId !== targetDriverId);
                    if (unassigned.length > 0) {
                        await prisma.shipment.updateMany({
                            where: { id: { in: unassigned.map(s => s.id) } },
                            data: { assignedDriverId: targetDriverId }
                        });
                    }
                }
                resolvedShipmentIds = matched.map(s => s.id);
            }
        }

        if (!targetDriverId || !amount) {
            return res.status(400).json({ success: false, error: 'driverId and amount are required' });
        }

        const result = await financeLedgerService.requestDriverCodRemittance({
            driverId: targetDriverId,
            amount,
            currency: currency || 'KWD',
            shipmentIds: resolvedShipmentIds,
            requestedBy: req.user.id,
            bagReference,
            notes
        });

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'REQUEST_COD_REMITTANCE',
            resource: 'DriverCodRemittance',
            resourceId: result.requestId,
            details: { driverId: targetDriverId, amount: Number(amount), bagReference, shipmentIds: resolvedShipmentIds },
            req
        });

        res.status(200).json({ success: true, data: result, message: 'COD remittance request submitted awaiting cashier verification' });
    } catch (error) {
        return handleControllerError(res, error, 'Request Driver COD remittance');
    }
};

/**
 * Step 2: Confirm driver COD remittance (Cashier / Hub officer physical verification)
 */
exports.confirmDriverCodRemittance = async (req, res) => {
    try {
        const { driverId, amount, currency, shipmentIds, bagReference, notes, verifiedAmount } = req.body;
        let targetDriverId = driverId || (req.user.role === 'driver' ? req.user.id : null);

        let resolvedShipmentIds = Array.isArray(shipmentIds) ? [...shipmentIds] : [];
        if (resolvedShipmentIds.length > 0 && prisma.shipment?.findMany) {
            const matched = await prisma.shipment.findMany({
                where: {
                    OR: [
                        { id: { in: resolvedShipmentIds } },
                        { trackingNumber: { in: resolvedShipmentIds } }
                    ]
                },
                select: { id: true, assignedDriverId: true }
            });
            if (matched.length > 0) {
                if (!targetDriverId) {
                    targetDriverId = matched.find(s => s.assignedDriverId)?.assignedDriverId || null;
                }
                if (targetDriverId && prisma.shipment?.updateMany) {
                    const unassigned = matched.filter(s => s.assignedDriverId !== targetDriverId);
                    if (unassigned.length > 0) {
                        await prisma.shipment.updateMany({
                            where: { id: { in: unassigned.map(s => s.id) } },
                            data: { assignedDriverId: targetDriverId }
                        });
                    }
                }
                resolvedShipmentIds = matched.map(s => s.id);
            }
        }

        if (!targetDriverId || (!amount && !verifiedAmount)) {
            return res.status(400).json({ success: false, error: 'driverId and amount/verifiedAmount are required' });
        }

        const result = await financeLedgerService.confirmDriverCodRemittance({
            driverId: targetDriverId,
            amount: amount || verifiedAmount,
            currency: currency || 'KWD',
            shipmentIds: resolvedShipmentIds,
            verifiedBy: req.user.id,
            bagReference,
            notes,
            verifiedAmount
        });

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CONFIRM_COD_REMITTANCE',
            resource: 'DriverCodRemittance',
            resourceId: result.ledgerEntry?.id || targetDriverId,
            details: { driverId: targetDriverId, verifiedAmount: result.verifiedAmount, currency: result.currency, bagReference, shipmentIds: resolvedShipmentIds },
            req
        });

        res.status(201).json({ success: true, data: result, message: 'COD remittance verified and posted to financial ledger' });
    } catch (error) {
        return handleControllerError(res, error, 'Confirm Driver COD remittance');
    }
};

/**
 * Reconcile parsed carrier invoice records against internal shipments & carrier payables
 */
exports.reconcileCarrierInvoice = async (req, res) => {
    try {
        const { records, carrier } = req.body;
        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ success: false, error: 'records array is required' });
        }

        const result = await carrierReconciliationService.reconcileInvoiceRows(records, carrier || 'GENERIC');
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        return handleControllerError(res, error, 'Carrier invoice reconciliation');
    }
};

/**
 * Post reconciliation adjustments to the ledger
 */
exports.postCarrierReconciliationAdjustments = async (req, res) => {
    try {
        const { adjustments } = req.body;
        if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
            return res.status(400).json({ success: false, error: 'adjustments array is required' });
        }

        const result = await carrierReconciliationService.postAdjustments(adjustments, req.user.id);

        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'POST_CARRIER_ADJUSTMENTS',
            resource: 'CarrierReconciliation',
            resourceId: null,
            details: { adjustmentsCount: adjustments.length, postedCount: result.count },
            req
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        return handleControllerError(res, error, 'Carrier reconciliation adjustments');
    }
};

/**
 * Get customer account statement summary
 */
exports.getOrganizationStatement = async (req, res) => {
    try {
        const orgId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, orgId)) return;

        const { startDate, endDate } = req.query;
        const whereClause = { organizationId: orgId };
        if (startDate || endDate) {
            whereClause.createdAt = {};
            if (startDate) whereClause.createdAt.gte = new Date(startDate);
            if (endDate) whereClause.createdAt.lte = new Date(endDate);
        }

        const [ledgerEntries, invoices, payments, organization] = await Promise.all([
            prisma.organizationLedger.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                take: 200
            }),
            prisma.invoice.findMany({
                where: { organizationId: orgId },
                orderBy: { createdAt: 'desc' },
                take: 50
            }),
            prisma.payment.findMany({
                where: { organizationId: orgId },
                orderBy: { postedAt: 'desc' },
                take: 50
            }),
            orgId ? prisma.organization.findUnique({ where: { id: orgId } }) : null
        ]);

        const currency = normalizeCurrencyCode(organization?.currency || 'KWD');
        const orgBalance = organization ? Number(organization.balance || 0) : 0;
        let totalDebits = 0;
        let totalCredits = 0;

        const formattedEntries = ledgerEntries.map(entry => {
            const amt = parseFloat(entry.amount || 0);
            const isDebit = entry.entryType === 'DEBIT';
            if (isDebit) {
                totalDebits += amt;
            } else {
                totalCredits += amt;
            }
            return {
                ...entry,
                debit: isDebit ? amt : 0,
                credit: !isDebit ? amt : 0
            };
        });

        // Handle case where ledger entries are empty or do not cover the full balance
        if (formattedEntries.length === 0) {
            // Fetch organization shipments to include as itemized charges
            const shipments = await prisma.shipment.findMany({
                where: { organizationId: orgId },
                orderBy: { createdAt: 'asc' },
                take: 100,
                select: {
                    id: true,
                    trackingNumber: true,
                    price: true,
                    currency: true,
                    status: true,
                    createdAt: true
                }
            });

            let shipmentCharges = 0;
            shipments.forEach(s => {
                const sPrice = Number(s.price || 0);
                shipmentCharges += sPrice;
                formattedEntries.push({
                    id: `SHIP-${s.id}`,
                    organizationId: orgId,
                    entryType: 'DEBIT',
                    category: 'FREIGHT_CHARGE',
                    reference: s.trackingNumber,
                    description: `Freight Charges - ${s.trackingNumber} (${(s.status || 'ACTIVE').toUpperCase()})`,
                    amount: sPrice,
                    currency: normalizeCurrencyCode(s.currency || currency),
                    debit: sPrice,
                    credit: 0,
                    createdAt: s.createdAt
                });
                totalDebits += sPrice;
            });

            // Carried forward opening balance
            const carriedForward = orgBalance - shipmentCharges;
            if (Math.abs(carriedForward) > 0.001 || formattedEntries.length === 0) {
                const openingAmt = formattedEntries.length === 0 ? orgBalance : carriedForward;
                formattedEntries.unshift({
                    id: `OB-${orgId || 'GEN'}`,
                    organizationId: orgId,
                    entryType: openingAmt >= 0 ? 'DEBIT' : 'CREDIT',
                    category: 'OPENING_BALANCE',
                    reference: 'OPENING_BAL',
                    description: 'Carried Forward Opening Balance (B/Fwd)',
                    amount: Math.abs(openingAmt),
                    currency,
                    debit: openingAmt >= 0 ? Math.abs(openingAmt) : 0,
                    credit: openingAmt < 0 ? Math.abs(openingAmt) : 0,
                    createdAt: organization?.createdAt || new Date(Date.now() - 30 * 86400000)
                });
                if (openingAmt >= 0) totalDebits += openingAmt;
                else totalCredits += Math.abs(openingAmt);
            }
        } else {
            // If ledger entries exist, ensure opening balance difference is tracked if org.balance differs
            const ledgerNet = totalDebits - totalCredits;
            const diff = orgBalance - ledgerNet;
            if (Math.abs(diff) > 0.001 && orgBalance !== 0) {
                formattedEntries.push({
                    id: `OB-${orgId || 'GEN'}`,
                    organizationId: orgId,
                    entryType: diff >= 0 ? 'DEBIT' : 'CREDIT',
                    category: 'OPENING_BALANCE',
                    reference: 'OPENING_BAL',
                    description: 'Carried Forward Opening Balance (B/Fwd)',
                    amount: Math.abs(diff),
                    currency,
                    debit: diff >= 0 ? Math.abs(diff) : 0,
                    credit: diff < 0 ? Math.abs(diff) : 0,
                    createdAt: organization?.createdAt || new Date(Date.now() - 30 * 86400000)
                });
                if (diff >= 0) totalDebits += diff;
                else totalCredits += Math.abs(diff);
            }
        }

        const netBalance = Number((orgBalance !== 0 ? orgBalance : (totalDebits - totalCredits)).toFixed(4));

        res.status(200).json({
            success: true,
            data: {
                organization: organization ? { id: organization.id, name: organization.name, code: organization.code } : null,
                currency,
                period: { startDate: startDate || null, endDate: endDate || null },
                summary: {
                    totalDebits: Number(totalDebits.toFixed(4)),
                    totalCredits: Number(totalCredits.toFixed(4)),
                    netBalance,
                    creditLimit: organization ? Number(organization.creditLimit) : 0,
                    unappliedBalance: organization ? Number(organization.unappliedBalance) : 0
                },
                ledgerEntries: formattedEntries,
                invoices,
                payments
            }
        });
    } catch (error) {
        return handleControllerError(res, error, 'Organization statement');
    }
};

/**
 * Get active multi-currency exchange rates relative to KWD
 */
exports.getExchangeRates = async (req, res) => {
    try {
        const rates = await currencyRateService.getRates();
        res.status(200).json({ success: true, data: rates });
    } catch (error) {
        return handleControllerError(res, error, 'Exchange rates');
    }
};

/**
 * Update multi-currency exchange rates
 */
exports.updateExchangeRates = async (req, res) => {
    try {
        const { rates } = req.body;
        if (!rates || typeof rates !== 'object') {
            return res.status(400).json({ success: false, error: 'Valid rates object is required' });
        }

        const updated = await currencyRateService.updateRates(rates, req.user?.id);
        res.status(200).json({ success: true, data: updated, message: 'Exchange rates updated successfully' });
    } catch (error) {
        return handleControllerError(res, error, 'Update exchange rates');
    }
};

/**
 * Send customer account statement summary via WhatsApp (Meta Cloud API)
 */
exports.sendStatementNotification = async (req, res) => {
    try {
        const orgId = normalizeOrgParam(req.params.orgId);
        if (!assertFinanceOrgAccess(req, res, orgId)) return;

        const organization = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { members: { select: { phone: true, name: true, role: true } } }
        });
        if (!organization) return res.status(404).json({ success: false, error: 'Organization not found' });

        const phone = organization.billingWhatsappNumber
            || organization.members?.find(m => m.role === 'org_manager')?.phone
            || organization.members?.find(m => m.phone)?.phone;

        if (!phone) {
            return res.status(400).json({ success: false, error: 'No contact phone number found for this organization manager' });
        }

        const currency = normalizeCurrencyCode(organization.currency || 'KWD');
        const overview = await financeLedgerService.getOrganizationOverview(orgId, Number(organization.creditLimit || 0), currency);
        const netBalance = Number(organization.balance !== null && organization.balance !== undefined ? organization.balance : (overview?.balance || 0));
        const summary = {
            netBalance,
            creditLimit: Number(organization.creditLimit || 0),
            unappliedBalance: Number(organization.unappliedBalance ?? overview?.unappliedCash ?? 0)
        };

        const { templateName } = req.body || {};
        const whatsappIntegration = require('../services/whatsappIntegration.service');
        const result = await whatsappIntegration.sendStatementNotification({
            organization,
            recipientPhone: phone,
            summary,
            currency,
            templateName
        });

        logger.info(`[Finance] Dispatched account statement notification for ${organization.name} (${orgId}) to ${result.phone || phone} (Template: ${result.template || templateName || 'DEFAULT'})`);
        res.status(200).json({
            success: true,
            message: `Account statement dispatched via WhatsApp to ${organization.name} (${result.phone || phone})${result.template ? ` via template [${result.template}]` : ''}`,
            data: result
        });
    } catch (error) {
        return handleControllerError(res, error, 'Send statement notification');
    }
};

/**
 * Send invoice details via WhatsApp (Meta Cloud API)
 */
exports.sendInvoiceWhatsApp = async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: req.params.invoiceId },
            include: {
                organization: {
                    include: { members: { select: { phone: true, name: true, role: true } } }
                },
                lines: true
            }
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!assertFinanceOrgAccess(req, res, invoice.organizationId)) return;

        const org = invoice.organization;
        const managerPhone = org?.billingWhatsappNumber
            || org?.members?.find(m => m.role === 'org_manager')?.phone
            || org?.members?.find(m => m.phone)?.phone;

        if (!managerPhone) {
            return res.status(400).json({ success: false, error: 'No contact phone number found for this organization manager' });
        }

        const { templateName } = req.body || {};
        const whatsappIntegration = require('../services/whatsappIntegration.service');
        const result = await whatsappIntegration.sendInvoiceNotification({
            invoice,
            organization: org,
            recipientPhone: managerPhone,
            templateName
        });

        // Record delivery log
        await prisma.invoiceDeliveryLog.create({
            data: {
                invoiceId: invoice.id,
                organizationId: invoice.organizationId,
                sentById: req.user.id,
                provider: result.provider || 'meta',
                recipientPhone: result.phone || managerPhone,
                status: result.status || 'sent',
                chatwootMessageId: result.externalMessageId || null,
                payloadJson: { invoiceNumber: invoice.invoiceNumber, total: invoice.total },
                responseJson: result.response || null,
                sentAt: new Date()
            }
        }).catch(err => logger.warn(`[Invoice] Failed to record delivery log: ${err.message}`));

        // Update invoice status from draft to sent if applicable
        if (invoice.status === 'draft') {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: 'sent', sentAt: new Date() }
            }).catch(() => null);
        }

        res.status(200).json({
            success: true,
            message: `Invoice ${invoice.invoiceNumber} sent via WhatsApp to ${result.phone || managerPhone}`
        });
    } catch (error) {
        return handleControllerError(res, error, 'Send invoice WhatsApp');
    }
};

/**
 * Get single invoice with details
 */
exports.getInvoice = async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: req.params.invoiceId },
            include: {
                organization: true,
                lines: { orderBy: { shipmentDate: 'asc' } },
                createdBy: { select: { id: true, name: true, email: true } }
            }
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
        if (!assertFinanceOrgAccess(req, res, invoice.organizationId)) return;
        res.status(200).json({ success: true, data: invoice });
    } catch (error) {
        return handleControllerError(res, error, 'Get invoice');
    }
};

/**
 * Get Carrier SLA & Late Delivery Penalty Performance Report
 */
exports.getSlaPerformanceReport = async (req, res) => {
    try {
        const { orgId, carrierCode, startDate, endDate } = req.query;
        let organizationId = null;

        if (isOrgRole(req.user.role)) {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user?.organizationId) return res.status(404).json({ success: false, error: 'User is not linked' });
            organizationId = user.organizationId;
        } else if (orgId) {
            organizationId = normalizeOrgParam(orgId);
        }

        const report = await slaTrackerService.getCarrierSlaReport({
            organizationId,
            carrierCode,
            startDate,
            endDate
        });

        res.status(200).json({ success: true, data: report });
    } catch (error) {
        return handleControllerError(res, error, 'SLA Performance report');
    }
};

/**
 * Manually trigger End-of-Month (EOM) statement cron run
 */
exports.triggerEomStatements = async (req, res) => {
    try {
        const { targetOrgId, statementDate } = req.body || {};
        const result = await eomStatementCronService.constructor.runEomStatementSync({
            targetOrgId: targetOrgId || null,
            statementDate: statementDate || null
        });

        res.status(200).json({ success: true, data: result, message: 'EOM Account Statement batch completed' });
    } catch (error) {
        return handleControllerError(res, error, 'Trigger EOM statements');
    }
};

// ==========================================
// Double-Entry General Ledger & Chart of Accounts
// ==========================================

exports.listAccounts = async (req, res) => {
    try {
        const { type, activeOnly } = req.query;
        const accounts = await generalLedgerService.listAccounts({
            type: type || undefined,
            activeOnly: activeOnly !== 'false'
        });
        res.status(200).json({ success: true, accounts });
    } catch (error) {
        return handleControllerError(res, error, 'List accounts');
    }
};

exports.createAccount = async (req, res) => {
    try {
        const account = await generalLedgerService.createAccount(req.body);
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CREATE_GL_ACCOUNT',
            resource: 'Account',
            resourceId: account.id,
            details: req.body,
            req
        });
        res.status(201).json({ success: true, account });
    } catch (error) {
        return handleControllerError(res, error, 'Create account');
    }
};

exports.listJournalEntries = async (req, res) => {
    try {
        const { page = 1, limit = 20, sourceType, status, fromDate, toDate } = req.query;
        const result = await generalLedgerService.listJournalEntries({
            page: Number(page),
            limit: Number(limit),
            sourceType,
            status,
            fromDate,
            toDate
        });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'List journal entries');
    }
};

exports.createJournalEntry = async (req, res) => {
    try {
        const entry = await generalLedgerService.postJournalEntry({
            ...req.body,
            createdById: req.user.id
        });
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CREATE_JOURNAL_ENTRY',
            resource: 'JournalEntry',
            resourceId: entry.id,
            details: { entryNumber: entry.entryNumber, totalDebit: entry.totalDebit },
            req
        });
        res.status(201).json({ success: true, entry });
    } catch (error) {
        return handleControllerError(res, error, 'Create journal entry');
    }
};

exports.reverseJournalEntry = async (req, res) => {
    try {
        const reversal = await generalLedgerService.reverseJournalEntry(req.params.id, {
            reason: req.body.reason,
            reversedBy: req.user.id
        });
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'REVERSE_JOURNAL_ENTRY',
            resource: 'JournalEntry',
            resourceId: req.params.id,
            details: { reversalId: reversal.id, reason: req.body.reason },
            req
        });
        res.status(200).json({ success: true, reversal });
    } catch (error) {
        return handleControllerError(res, error, 'Reverse journal entry');
    }
};

exports.getAccountLedger = async (req, res) => {
    try {
        const { accountCode, fromDate, toDate, page = 1, limit = 50 } = req.query;
        if (!accountCode) {
            return res.status(400).json({ success: false, error: 'accountCode query parameter is required' });
        }
        const ledger = await generalLedgerService.getAccountLedger({
            accountCode,
            fromDate,
            toDate,
            page: Number(page),
            limit: Number(limit)
        });
        res.status(200).json({ success: true, ...ledger });
    } catch (error) {
        return handleControllerError(res, error, 'Get account ledger');
    }
};

// ==========================================
// Financial Statements & Reports
// ==========================================

exports.getTrialBalance = async (req, res) => {
    try {
        const { asOfDate, currency } = req.query;
        const report = await generalLedgerService.getTrialBalance({ asOfDate, currency });
        res.status(200).json({ success: true, report });
    } catch (error) {
        return handleControllerError(res, error, 'Get trial balance');
    }
};

exports.getBalanceSheet = async (req, res) => {
    try {
        const { asOfDate } = req.query;
        const report = await generalLedgerService.getBalanceSheet({ asOfDate });
        res.status(200).json({ success: true, report });
    } catch (error) {
        return handleControllerError(res, error, 'Get balance sheet');
    }
};

exports.getIncomeStatement = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        const report = await generalLedgerService.getIncomeStatement({ fromDate, toDate });
        res.status(200).json({ success: true, report });
    } catch (error) {
        return handleControllerError(res, error, 'Get income statement');
    }
};

// ==========================================
// Accounts Payable (AP)
// ==========================================

exports.listVendors = async (req, res) => {
    try {
        const vendors = await accountsPayableService.listVendors({
            activeOnly: req.query.activeOnly !== 'false'
        });
        res.status(200).json({ success: true, vendors });
    } catch (error) {
        return handleControllerError(res, error, 'List vendors');
    }
};

exports.createVendor = async (req, res) => {
    try {
        const vendor = await accountsPayableService.createVendor(req.body);
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CREATE_VENDOR',
            resource: 'Vendor',
            resourceId: vendor.id,
            details: req.body,
            req
        });
        res.status(201).json({ success: true, vendor });
    } catch (error) {
        return handleControllerError(res, error, 'Create vendor');
    }
};

exports.listBills = async (req, res) => {
    try {
        const { vendorId, status, fromDate, toDate, page = 1, limit = 20 } = req.query;
        const result = await accountsPayableService.listBills({
            vendorId,
            status,
            fromDate,
            toDate,
            page: Number(page),
            limit: Number(limit)
        });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'List bills');
    }
};

exports.createBill = async (req, res) => {
    try {
        const bill = await accountsPayableService.createBill(req.body, req.user.id);
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CREATE_BILL',
            resource: 'Bill',
            resourceId: bill.id,
            details: { billNumber: bill.billNumber, total: bill.total },
            req
        });
        res.status(201).json({ success: true, bill });
    } catch (error) {
        return handleControllerError(res, error, 'Create bill');
    }
};

exports.payBill = async (req, res) => {
    try {
        const result = await accountsPayableService.payBill({
            billId: req.params.id,
            bankAccountId: req.body.bankAccountId,
            amount: req.body.amount,
            paymentDate: req.body.paymentDate,
            reference: req.body.reference,
            method: req.body.method,
            notes: req.body.notes,
            userId: req.user.id
        });
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'PAY_BILL',
            resource: 'Bill',
            resourceId: req.params.id,
            details: { amount: req.body.amount, bankAccountId: req.body.bankAccountId },
            req
        });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'Pay bill');
    }
};

exports.reconcileCarrierBill = async (req, res) => {
    try {
        const { vendorId, lines } = req.body;
        if (!vendorId || !Array.isArray(lines)) {
            return res.status(400).json({ success: false, error: 'vendorId and lines array are required' });
        }
        const result = await accountsPayableService.reconcileCarrierInvoice({ vendorId, csvLines: lines });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'Reconcile carrier bill');
    }
};

// ==========================================
// Treasury & Banking
// ==========================================

exports.listBankAccounts = async (req, res) => {
    try {
        const accounts = await treasuryService.listBankAccounts({
            activeOnly: req.query.activeOnly !== 'false'
        });
        res.status(200).json({ success: true, accounts });
    } catch (error) {
        return handleControllerError(res, error, 'List bank accounts');
    }
};

exports.createBankAccount = async (req, res) => {
    try {
        const account = await treasuryService.createBankAccount(req.body);
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CREATE_BANK_ACCOUNT',
            resource: 'BankAccount',
            resourceId: account.id,
            details: req.body,
            req
        });
        res.status(201).json({ success: true, account });
    } catch (error) {
        return handleControllerError(res, error, 'Create bank account');
    }
};

exports.getBankTransactions = async (req, res) => {
    try {
        const { bankAccountId, isReconciled, fromDate, toDate, page = 1, limit = 50 } = req.query;
        const result = await treasuryService.getBankTransactions({
            bankAccountId,
            isReconciled: isReconciled !== undefined ? isReconciled === 'true' : undefined,
            fromDate,
            toDate,
            page: Number(page),
            limit: Number(limit)
        });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'Get bank transactions');
    }
};

exports.importBankStatement = async (req, res) => {
    try {
        const { bankAccountId, lines } = req.body;
        if (!bankAccountId || !Array.isArray(lines)) {
            return res.status(400).json({ success: false, error: 'bankAccountId and lines array are required' });
        }
        const result = await treasuryService.importBankStatementLines({ bankAccountId, lines });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        return handleControllerError(res, error, 'Import bank statement');
    }
};

exports.reconcileBankTransaction = async (req, res) => {
    try {
        const { transactionId, matchedType, matchedId } = req.body;
        const tx = await treasuryService.reconcileTransaction({
            transactionId,
            matchedType,
            matchedId,
            userId: req.user.id
        });
        res.status(200).json({ success: true, transaction: tx });
    } catch (error) {
        return handleControllerError(res, error, 'Reconcile bank transaction');
    }
};

exports.getTreasurySummary = async (req, res) => {
    try {
        const summary = await treasuryService.getTreasurySummary();
        res.status(200).json({ success: true, ...summary });
    } catch (error) {
        return handleControllerError(res, error, 'Get treasury summary');
    }
};

// ==========================================
// Accounting Periods & Month-End Closing
// ==========================================

exports.listAccountingPeriods = async (req, res) => {
    try {
        const periods = await generalLedgerService.listAccountingPeriods();
        res.status(200).json({ success: true, periods });
    } catch (error) {
        return handleControllerError(res, error, 'List accounting periods');
    }
};

exports.closeAccountingPeriod = async (req, res) => {
    try {
        const period = await generalLedgerService.closeAccountingPeriod(req.params.id, req.user.id);
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'CLOSE_ACCOUNTING_PERIOD',
            resource: 'AccountingPeriod',
            resourceId: period.id,
            details: { periodName: period.name },
            req
        });
        res.status(200).json({ success: true, period, message: `Accounting period ${period.name} locked successfully` });
    } catch (error) {
        return handleControllerError(res, error, 'Close accounting period');
    }
};

exports.reopenAccountingPeriod = async (req, res) => {
    try {
        const period = await generalLedgerService.reopenAccountingPeriod(req.params.id);
        await recordFinancialAuditLog({
            userId: req.user.id,
            action: 'REOPEN_ACCOUNTING_PERIOD',
            resource: 'AccountingPeriod',
            resourceId: period.id,
            details: { periodName: period.name },
            req
        });
        res.status(200).json({ success: true, period, message: `Accounting period ${period.name} re-opened successfully` });
    } catch (error) {
        return handleControllerError(res, error, 'Reopen accounting period');
    }
};




