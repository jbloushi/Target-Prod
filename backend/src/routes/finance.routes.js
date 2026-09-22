const express = require('express');
const router = express.Router();
const financeController = require('../controllers/finance.controller');
const authController = require('../controllers/auth.controller');
const { authorize, authorizeAny } = require('../middleware/authorize.middleware');
const { requireIdempotency } = require('../middleware/idempotency.middleware');

// All finance routes require authentication
router.use(authController.protect);

// User Routes (self-service balance/ledger - available to all authenticated users)
router.get('/balance', financeController.getBalance);
router.get('/ledger', authorize('VIEW_FINANCE'), financeController.getLedger);

// Organization Finance (platform finance roles only)
router.get('/organizations/:orgId/overview', authorize('VIEW_FINANCE'), financeController.getOrganizationOverview);
router.get('/organizations/:orgId/balance', authorize('VIEW_FINANCE'), financeController.getOrganizationOverview);
router.get('/organizations/:orgId/invoices', authorize('VIEW_INVOICES'), financeController.listOrganizationInvoices);
router.post('/organizations/:orgId/invoices', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.createOrganizationInvoice);
router.get('/organizations/:orgId/payments', authorize('VIEW_FINANCE'), financeController.listPayments);
router.post('/organizations/:orgId/payments', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.postPayment);
router.post('/organizations/:orgId/allocations', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.allocatePaymentManual);
router.post('/organizations/:orgId/allocations/fifo', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.allocatePaymentsFifo);
router.get('/shipments/:shipmentId/accounting', authorize('VIEW_FINANCE'), financeController.getShipmentAccounting);
router.patch('/invoices/:invoiceId/status', authorize('MANAGE_PAYMENTS'), financeController.updateInvoiceStatus);
router.get('/invoices/:invoiceId', authorizeAny('VIEW_FINANCE', 'VIEW_INVOICES'), financeController.getInvoice);
router.post('/invoices/:invoiceId/send-whatsapp', authorizeAny('MANAGE_PAYMENTS', 'VIEW_INVOICES'), financeController.sendInvoiceWhatsApp);
router.post('/allocations/:allocationId/reverse', authorize('REVERSE_PAYMENTS'), requireIdempotency, financeController.reverseAllocation);

// Reports & Analytics
router.get('/reports/profitability', authorize('VIEW_FINANCE'), financeController.getProfitabilityReport);
router.get('/reports/sla-performance', authorize('VIEW_FINANCE'), financeController.getSlaPerformanceReport);

// COD Cash-Clearing & Driver Remittance
router.get('/cod/driver-summary', authorizeAny('VIEW_FINANCE', 'DRIVER_OPS'), financeController.getDriverCodSummary);
router.post('/cod/remit', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.remitDriverCod);
router.post('/cod/request-remittance', requireIdempotency, financeController.requestDriverCodRemittance);
router.post('/cod/confirm-remittance', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.confirmDriverCodRemittance);

// Carrier Invoice CSV Reconciliation
router.post('/reconciliation/carrier-invoice', authorize('VIEW_FINANCE'), financeController.reconcileCarrierInvoice);
router.post('/reconciliation/adjustments', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.postCarrierReconciliationAdjustments);

// Multi-Currency Exchange Rates & FX
router.get('/rates', authorize('VIEW_FINANCE'), financeController.getExchangeRates);
router.put('/rates', authorize('MANAGE_PAYMENTS'), financeController.updateExchangeRates);

// Customer Account Statement
router.get('/organizations/:orgId/statement', authorizeAny('VIEW_FINANCE', 'VIEW_INVOICES'), financeController.getOrganizationStatement);
router.post('/organizations/:orgId/send-statement', authorizeAny('MANAGE_PAYMENTS', 'VIEW_INVOICES'), financeController.sendStatementNotification);
router.post('/cron/eom-statements', authorize('MANAGE_PAYMENTS'), financeController.triggerEomStatements);

// --- Core Double-Entry General Ledger & Accounts ---
router.get('/gl/accounts', authorize('VIEW_FINANCE'), financeController.listAccounts);
router.post('/gl/accounts', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.createAccount);
router.get('/gl/journal-entries', authorize('VIEW_FINANCE'), financeController.listJournalEntries);
router.post('/gl/journal-entries', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.createJournalEntry);
router.post('/gl/journal-entries/:id/reverse', authorize('REVERSE_PAYMENTS'), requireIdempotency, financeController.reverseJournalEntry);
router.get('/gl/account-ledger', authorize('VIEW_FINANCE'), financeController.getAccountLedger);

// --- Financial Statements & Reports ---
router.get('/reports/trial-balance', authorize('VIEW_FINANCE'), financeController.getTrialBalance);
router.get('/reports/balance-sheet', authorize('VIEW_FINANCE'), financeController.getBalanceSheet);
router.get('/reports/income-statement', authorize('VIEW_FINANCE'), financeController.getIncomeStatement);

// --- Accounts Payable (AP) ---
router.get('/ap/vendors', authorize('VIEW_FINANCE'), financeController.listVendors);
router.post('/ap/vendors', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.createVendor);
router.get('/ap/bills', authorize('VIEW_FINANCE'), financeController.listBills);
router.post('/ap/bills', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.createBill);
router.post('/ap/bills/:id/pay', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.payBill);
router.post('/ap/reconcile', authorize('VIEW_FINANCE'), financeController.reconcileCarrierBill);

// --- Treasury & Bank Accounts ---
router.get('/treasury/accounts', authorize('VIEW_FINANCE'), financeController.listBankAccounts);
router.post('/treasury/accounts', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.createBankAccount);
router.get('/treasury/transactions', authorize('VIEW_FINANCE'), financeController.getBankTransactions);
router.post('/treasury/import-statement', authorize('MANAGE_PAYMENTS'), financeController.importBankStatement);
router.post('/treasury/reconcile-transaction', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.reconcileBankTransaction);
router.get('/treasury/summary', authorize('VIEW_FINANCE'), financeController.getTreasurySummary);

// --- Accounting Periods ---
router.get('/periods', authorize('VIEW_FINANCE'), financeController.listAccountingPeriods);
router.post('/periods/:id/close', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.closeAccountingPeriod);
router.post('/periods/:id/reopen', authorize('MANAGE_PAYMENTS'), requireIdempotency, financeController.reopenAccountingPeriod);

module.exports = router;



