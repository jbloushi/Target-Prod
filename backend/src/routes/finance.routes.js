const express = require('express');
const router = express.Router();
const financeController = require('../controllers/finance.controller');
const authController = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');

// All finance routes require authentication
router.use(authController.protect);

// User Routes (self-service balance/ledger — available to all authenticated users)
router.get('/balance', financeController.getBalance);
router.get('/ledger', authorize('VIEW_FINANCE'), financeController.getLedger);

// Organization Finance (platform finance roles only)
router.get('/organizations/:orgId/overview', authorize('VIEW_FINANCE'), financeController.getOrganizationOverview);
router.get('/organizations/:orgId/invoices', authorize('VIEW_INVOICES'), financeController.listOrganizationInvoices);
router.post('/organizations/:orgId/invoices', authorize('MANAGE_PAYMENTS'), financeController.createOrganizationInvoice);
router.get('/organizations/:orgId/payments', authorize('VIEW_FINANCE'), financeController.listPayments);
router.post('/organizations/:orgId/payments', authorize('MANAGE_PAYMENTS'), financeController.postPayment);
router.post('/organizations/:orgId/allocations', authorize('MANAGE_PAYMENTS'), financeController.allocatePaymentManual);
router.post('/organizations/:orgId/allocations/fifo', authorize('MANAGE_PAYMENTS'), financeController.allocatePaymentsFifo);
router.get('/shipments/:shipmentId/accounting', authorize('VIEW_FINANCE'), financeController.getShipmentAccounting);
router.patch('/invoices/:invoiceId/status', authorize('MANAGE_PAYMENTS'), financeController.updateInvoiceStatus);
router.post('/allocations/:allocationId/reverse', authorize('REVERSE_PAYMENTS'), financeController.reverseAllocation);

module.exports = router;
