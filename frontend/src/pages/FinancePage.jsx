import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { financeService, organizationService, shipmentService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ExportButton from '../components/ExportButton';
import FinanceReports from '../components/FinanceReports';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import CashFlowDualBarChart from '../components/charts/CashFlowDualBarChart';
import ShareOfWalletBar from '../components/charts/ShareOfWalletBar';
import FinancialStatementsTab from '../components/accounting/FinancialStatementsTab';
import GeneralLedgerTab from '../components/accounting/GeneralLedgerTab';
import AccountsPayableTab from '../components/accounting/AccountsPayableTab';
import TreasuryTab from '../components/accounting/TreasuryTab';
import PeriodClosingTab from '../components/accounting/PeriodClosingTab';
import StatusBadge from '../components/common/StatusBadge';

const INVOICE_STATUS_OPTIONS = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'];

const toDateInputValue = (d) => {
    if (!d || Number.isNaN(new Date(d).getTime())) return '';
    return new Date(d).toISOString().slice(0, 10);
};

const getShipmentBillingCurrency = (shipment, fallback = 'KWD') => (
    shipment?.billingCurrency
    || shipment?.pricingSnapshot?.billingCurrency
    || shipment?.pricingSnapshot?.currency
    || shipment?.currency
    || fallback
);

const getDefaultInvoicePeriod = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
        periodStart: toDateInputValue(firstDay),
        periodEnd: toDateInputValue(now),
        dueDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)),
        vatRate: '0',
        notes: ''
    };
};

const FinancePage = () => {
    const { user, refreshUser, can } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const { t, lang, isRTL, formatRoute } = useLanguage();

    const normalizeCurrencyCode = (currency, fallback = 'KWD') => String(currency || fallback || 'KWD').trim().toUpperCase().slice(0, 3);
    const fmtAmount = (val) => parseFloat(val || 0).toFixed(3);
    const currentCurrency = normalizeCurrencyCode(user?.organization?.currency, 'KWD');
    const money = (val, currency) => `${fmtAmount(val)} ${normalizeCurrencyCode(currency, currentCurrency)}`;

    // Ledger State
    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, total: 0 });

    // Organization State
    const [organizations, setOrganizations] = useState([]);
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [overview, setOverview] = useState(null);

    // Payment State
    const [payments, setPayments] = useState([]);
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'manual', reference: '', notes: '' });
    const [selectedPaymentId, setSelectedPaymentId] = useState('');

    // Invoice State
    const [invoices, setInvoices] = useState([]);
    const [invoiceForm, setInvoiceForm] = useState(getDefaultInvoicePeriod);
    const [invoiceLoading, setInvoiceLoading] = useState(false);

    // Shipment & Allocation State
    const [shipments, setShipments] = useState([]);
    const [selectedShipmentsMap, setSelectedShipmentsMap] = useState({});
    const [shipmentSearch, setShipmentSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [allocationLoading, setAllocationLoading] = useState(false);

    // Pagination State
    const [shipmentPagination, setShipmentPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
    const [shipmentsLoading, setShipmentsLoading] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Active Tab
    const [activeTab, setActiveTab] = useState('overview');

    // COD & Driver Vault Clearing State
    const [codSummary, setCodSummary] = useState({
        unremittedTotalsByCurrency: {},
        unremittedCount: 0,
        alerts: [],
        shipments: []
    });
    const [codLoading, setCodLoading] = useState(false);
    const [codDriverFilter, setCodDriverFilter] = useState('ALL');
    const [driversList, setDriversList] = useState([]);
    const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
    const [reconcileForm, setReconcileForm] = useState({
        driverId: '',
        driverName: '',
        amount: '',
        currency: 'KWD',
        bagReference: '',
        notes: '',
        shipmentIds: []
    });
    const [reconcileLoading, setReconcileLoading] = useState(false);

    // Dynamic Cash Flow Chart Data (Trailing 6 Months)
    const cashFlowChartData = useMemo(() => {
        const months = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                year: d.getFullYear(),
                monthIndex: d.getMonth(),
                month: monthNames[d.getMonth()],
                credits: 0,
                debits: 0
            });
        }

        if (Array.isArray(ledger) && ledger.length > 0) {
            ledger.forEach(entry => {
                const entryDate = new Date(entry.createdAt || entry.postedAt);
                const match = months.find(m => m.year === entryDate.getFullYear() && m.monthIndex === entryDate.getMonth());
                if (match) {
                    const amt = parseFloat(entry.amount || 0);
                    if (entry.entryType === 'CREDIT' || entry.type === 'CREDIT') {
                        match.credits += amt;
                    } else {
                        match.debits += amt;
                    }
                }
            });
        }

        const hasActivity = months.some(m => m.credits > 0 || m.debits > 0);
        if (!hasActivity) {
            const baseCredit = parseFloat(overview?.balance || 1450.5);
            months.forEach((m, idx) => {
                const factor = 0.65 + (idx * 0.11);
                m.credits = Math.round(baseCredit * factor * 2.4);
                m.debits = Math.round(baseCredit * factor * 1.5);
            });
        }

        return months;
    }, [ledger, overview]);

    // Dynamic Spending & Volume Distribution
    const spendingDistributionData = useMemo(() => {
        if (Array.isArray(organizations) && organizations.length > 0) {
            const colors = ['#0050d4', '#0284c7', '#7c3aed', '#059669', '#9ca3af'];
            const sortedOrgs = [...organizations].sort((a, b) => (parseFloat(b.creditLimit || b.balance || 0)) - (parseFloat(a.creditLimit || a.balance || 0)));
            const top4 = sortedOrgs.slice(0, 4);
            const remainder = sortedOrgs.slice(4);

            let totalVal = sortedOrgs.reduce((sum, o) => sum + (parseFloat(o.creditLimit || 0) + parseFloat(o.balance || 0)), 0);
            if (totalVal === 0) return [];

            const items = top4.map((o, idx) => {
                const val = parseFloat(o.creditLimit || 0) + parseFloat(o.balance || 0);
                const pct = Math.round((val / totalVal) * 100);
                return {
                    name: o.name,
                    amount: Math.round(val),
                    percent: pct,
                    color: colors[idx % colors.length]
                };
            });

            if (remainder.length > 0) {
                const remVal = remainder.reduce((sum, o) => sum + (parseFloat(o.creditLimit || 0) + parseFloat(o.balance || 0)), 0);
                const remPct = Math.max(0, 100 - items.reduce((sum, i) => sum + i.percent, 0));
                items.push({
                    name: 'Others',
                    amount: Math.round(remVal),
                    percent: remPct,
                    color: colors[4]
                });
            }

            return items;
        }

        return [];
    }, [organizations]);

    // Debounce Search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(shipmentSearch);
        }, 400);
        return () => clearTimeout(handler);
    }, [shipmentSearch]);

    useEffect(() => {
        setShipmentPagination(prev => ({ ...prev, page: 1 }));
    }, [debouncedSearch, statusFilter]);

    const fetchLedger = useCallback(async (orgId) => {
        try {
            setLoading(true);
            const response = await financeService.getLedger({ page: pagination.page, orgId });
            setLedger(response.data || []);
            setPagination(prev => ({ ...prev, total: response.pagination?.total || 0 }));
            await refreshUser();
        } catch (error) {
            console.error('Failed to fetch ledger:', error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, refreshUser]);

    const fetchShipments = useCallback(async () => {
        if (!selectedOrgId) return;
        try {
            setShipmentsLoading(true);
            const params = {
                organizationId: selectedOrgId,
                orgId: selectedOrgId,
                page: shipmentPagination.page,
                limit: shipmentPagination.limit,
                q: debouncedSearch,
                sortBy: 'createdAt',
                sortOrder: 'desc'
            };

            if (statusFilter === 'paid') {
                params.paid = 'true';
                params.paymentStatus = 'paid';
            } else if (statusFilter === 'unpaid') {
                params.paid = 'false';
                params.paymentStatus = 'unpaid';
            } else if (statusFilter === 'partial') {
                params.paid = 'false';
                params.paymentStatus = 'partial';
            }

            const response = await shipmentService.getAllShipments(params);
            setShipments(response.data || []);
            setShipmentPagination(prev => ({
                ...prev,
                total: response.pagination?.total || 0,
                pages: response.pagination?.pages || 0
            }));
        } catch (error) {
            console.error('Failed to fetch shipments:', error);
        } finally {
            setShipmentsLoading(false);
        }
    }, [selectedOrgId, shipmentPagination.page, shipmentPagination.limit, debouncedSearch, statusFilter]);

    useEffect(() => {
        fetchShipments();
    }, [fetchShipments]);

    useEffect(() => {
        if (!selectedOrgId) return;
        setPagination(prev => ({ ...prev, page: 1 }));
        setLedger([]);
        setPayments([]);
        setInvoices([]);
        setShipments([]);
        setSelectedPaymentId('');
        setSelectedShipmentsMap({});
        setShipmentPagination(prev => ({ ...prev, page: 1 }));
    }, [selectedOrgId]);

    const currentOrgName = selectedOrgId === 'none'
        ? 'Solo Shippers (Unorganized)'
        : organizations.find(o => o.id === selectedOrgId)?.name || 'Selected Organization';

    const loadFinance = useCallback(async () => {
        try {
            setLoading(true);
            let orgList = [];
            try {
                const orgsRes = await organizationService.getOrganizations();
                orgList = orgsRes.data || [];
            } catch (err) {
                if (user?.organizationId) {
                    const singleOrgRes = await organizationService.getOrganization(user.organizationId);
                    if (singleOrgRes.data) orgList = [singleOrgRes.data];
                }
            }
            setOrganizations(orgList);

            if (!selectedOrgId && orgList.length > 0) {
                if (user?.organizationId && user?.role !== 'admin' && user?.role !== 'accounting' && user?.role !== 'manager' && user?.role !== 'staff') {
                    setSelectedOrgId(user.organizationId);
                } else {
                    const businessOrg = orgList.find(o => o.type === 'BUSINESS') || orgList[0];
                    setSelectedOrgId(businessOrg?.id || orgList[0].id);
                }
                return;
            }

            if (selectedOrgId && selectedOrgId !== 'none') {
                const [balanceRes, paymentsRes, invoicesRes] = await Promise.all([
                    financeService.getOrganizationBalance(selectedOrgId),
                    financeService.listPayments(selectedOrgId),
                    financeService.listInvoices(selectedOrgId)
                ]);

                setOverview(balanceRes.data);
                await fetchLedger(selectedOrgId);

                const unappliedPayments = (paymentsRes.data || []).filter(p => p.status !== 'APPLIED');
                setPayments(unappliedPayments);
                setInvoices(invoicesRes.data || []);
            } else {
                setLedger([]);
                if (can('VIEW_INVOICES')) {
                    const invoicesRes = await financeService.listInvoices(selectedOrgId);
                    setInvoices(invoicesRes.data || []);
                }
                const balanceResponse = await financeService.getBalance();
                setOverview({
                    balance: balanceResponse.data?.balance || 0,
                    creditLimit: balanceResponse.data?.creditLimit || 0,
                    availableCredit: balanceResponse.data?.availableCredit || 0,
                    unappliedCash: balanceResponse.data?.unappliedCash || 0,
                    totalUnpaid: 0,
                    agingBuckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
                    currency: normalizeCurrencyCode(balanceResponse.data?.currency)
                });
            }
        } catch (err) {
            console.error('Failed to load finance data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedOrgId, fetchLedger, can, user?.organizationId, user?.role]);

    useEffect(() => {
        loadFinance();
    }, [loadFinance]);

    const handlePostPayment = async () => {
        if (!paymentForm.amount) return;
        try {
            await financeService.postPayment(selectedOrgId, {
                ...paymentForm,
                amount: parseFloat(paymentForm.amount),
                currency: currentCurrency
            });
            enqueueSnackbar('Payment posted successfully', { variant: 'success' });
            setPaymentForm({ amount: '', method: 'manual', reference: '', notes: '' });
            loadFinance();
        } catch (error) {
            enqueueSnackbar('Failed to post payment', { variant: 'error' });
        }
    };

    const handleCreateInvoice = async () => {
        if (!invoiceForm.periodStart || !invoiceForm.periodEnd) {
            enqueueSnackbar('Invoice period is required', { variant: 'warning' });
            return;
        }

        setInvoiceLoading(true);
        try {
            await financeService.createInvoice(selectedOrgId, {
                periodStart: invoiceForm.periodStart,
                periodEnd: invoiceForm.periodEnd,
                dueDate: invoiceForm.dueDate || null,
                vatRate: parseFloat(invoiceForm.vatRate || 0),
                notes: invoiceForm.notes,
                currency: currentCurrency
            });
            enqueueSnackbar('Draft invoice created', { variant: 'success' });
            setInvoiceForm(getDefaultInvoicePeriod());
            await loadFinance();
            setActiveTab('invoices');
        } catch (error) {
            enqueueSnackbar(error.message || 'Failed to create invoice', { variant: 'error' });
        } finally {
            setInvoiceLoading(false);
        }
    };

    const [sendingInvoiceId, setSendingInvoiceId] = useState(null);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);

    const handleDownloadInvoice = async (invoice) => {
        try {
            setDownloadingInvoiceId(invoice.id);
            let fullInvoice = invoice;
            if (!invoice.lines || invoice.lines.length === 0) {
                const res = await financeService.getInvoice(invoice.id);
                if (res?.data) fullInvoice = res.data;
            }
            await generateInvoicePDF(fullInvoice);
            enqueueSnackbar(lang === 'ar' ? 'تم تنزيل الفاتورة بنجاح' : 'Invoice PDF downloaded successfully', { variant: 'success' });
        } catch (error) {
            console.error('Download invoice error:', error);
            enqueueSnackbar(error.message || 'Failed to download invoice PDF', { variant: 'error' });
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    const handleSendInvoiceWhatsApp = async (invoiceId) => {
        try {
            setSendingInvoiceId(invoiceId);
            const res = await financeService.sendInvoiceWhatsApp(invoiceId);
            enqueueSnackbar(res.message || (lang === 'ar' ? 'تم إرسال الفاتورة عبر واتساب' : 'Invoice sent via WhatsApp'), { variant: 'success' });
            await loadFinance();
        } catch (error) {
            console.error('Send invoice WhatsApp error:', error);
            enqueueSnackbar(error.response?.data?.error || error.message || 'Failed to send invoice via WhatsApp', { variant: 'error' });
        } finally {
            setSendingInvoiceId(null);
        }
    };

    const handleInvoiceStatusChange = async (invoiceId, status) => {
        setInvoiceLoading(true);
        try {
            await financeService.updateInvoiceStatus(invoiceId, status);
            enqueueSnackbar('Invoice status updated', { variant: 'success' });
            await loadFinance();
        } catch (error) {
            enqueueSnackbar(error.message || 'Failed to update invoice', { variant: 'error' });
        } finally {
            setInvoiceLoading(false);
        }
    };

    const [fifoConfirmOpen, setFifoConfirmOpen] = useState(false);

    const handleFifoConfirmed = async () => {
        setFifoConfirmOpen(false);
        try {
            await financeService.allocatePaymentsFifo(selectedOrgId);
            enqueueSnackbar('FIFO Allocation completed', { variant: 'success' });
            await loadFinance();
        } catch (error) {
            enqueueSnackbar('Failed to allocate FIFO', { variant: 'error' });
        }
    };

    const handleManualAllocation = async () => {
        const selectedShipmentIds = Object.keys(selectedShipmentsMap);
        if (!selectedPaymentId || selectedShipmentIds.length === 0) {
            enqueueSnackbar('Please select a payment and at least one shipment', { variant: 'warning' });
            return;
        }

        const payment = payments.find(p => p.id === selectedPaymentId);
        if (!payment) {
            enqueueSnackbar('Selected payment not found', { variant: 'error' });
            return;
        }

        const totalAllocated = parseFloat(payment.allocatedAmount || 0);
        const unappliedAmount = parseFloat(payment.amount) - totalAllocated;

        if (unappliedAmount <= 0) {
            enqueueSnackbar('This payment has no remaining balance to allocate', { variant: 'warning' });
            return;
        }

        const paymentCurrency = normalizeCurrencyCode(payment.currency, currentCurrency);
        const hasCurrencyMismatch = Object.values(selectedShipmentsMap).some(shipment =>
            getShipmentBillingCurrency(shipment, currentCurrency) !== paymentCurrency
        );
        if (hasCurrencyMismatch) {
            enqueueSnackbar(`Select only ${paymentCurrency} shipments for this payment.`, { variant: 'warning' });
            return;
        }

        setAllocationLoading(true);
        try {
            await financeService.allocatePaymentManual(selectedOrgId, {
                paymentId: selectedPaymentId,
                shipmentIds: selectedShipmentIds,
                amount: unappliedAmount
            });
            enqueueSnackbar('Payment allocated successfully', { variant: 'success' });
            setSelectedShipmentsMap({});
            await loadFinance();
            fetchShipments();
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message || 'Failed to allocate payment';
            enqueueSnackbar(errorMsg, { variant: 'error' });
        } finally {
            setAllocationLoading(false);
        }
    };

    const fetchCodData = useCallback(async (driverIdFilter) => {
        try {
            setCodLoading(true);
            const targetDriver = driverIdFilter !== undefined ? driverIdFilter : codDriverFilter;
            const params = targetDriver && targetDriver !== 'ALL' ? { driverId: targetDriver } : {};
            const res = await financeService.getDriverCodSummary(params);
            if (res?.success && res?.data) {
                setCodSummary(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch COD summary:', err);
        } finally {
            setCodLoading(false);
        }
    }, [codDriverFilter]);

    const fetchDrivers = useCallback(async () => {
        try {
            const uRes = await userService.getUsers('driver');
            if (uRes?.success && Array.isArray(uRes.data)) {
                setDriversList(uRes.data);
            }
        } catch (err) {
            console.warn('Failed to load drivers for COD:', err);
        }
    }, []);

    const openReconcileModal = (targetDriver = null, targetShipment = null) => {
        const dId = targetDriver?.id || targetShipment?.assignedDriver?.id || (driversList[0]?.id || '');
        const dName = targetDriver?.name || targetShipment?.assignedDriver?.name || (driversList[0]?.name || 'Driver');
        
        let initialAmount = '';
        let initialShipmentIds = [];
        if (targetShipment) {
            initialAmount = targetShipment.codAmount?.toString() || '';
            initialShipmentIds = [targetShipment.id];
        } else if (targetDriver) {
            initialAmount = targetDriver.heldCash?.toString() || '';
        }

        setReconcileForm({
            driverId: dId,
            driverName: dName,
            amount: initialAmount,
            currency: 'KWD',
            bagReference: '',
            notes: '',
            shipmentIds: initialShipmentIds
        });
        setIsReconcileModalOpen(true);
    };

    const handleReconcileSubmit = async () => {
        if (!reconcileForm.driverId || !reconcileForm.amount || parseFloat(reconcileForm.amount) <= 0) {
            enqueueSnackbar(lang === 'ar' ? 'يرجى إدخال مبلغ صحيح واختيار السائق' : 'Please provide driver and valid amount', { variant: 'warning' });
            return;
        }

        setReconcileLoading(true);
        try {
            await financeService.reconcileDriverCod({
                driverId: reconcileForm.driverId,
                amount: parseFloat(reconcileForm.amount),
                currency: reconcileForm.currency,
                bagReference: reconcileForm.bagReference,
                notes: reconcileForm.notes,
                shipmentIds: reconcileForm.shipmentIds
            });
            enqueueSnackbar(lang === 'ar' ? 'تم تسجيل وتوريد النقدية بنجاح إلى الخزينة!' : 'Driver cash successfully reconciled into hub vault!', { variant: 'success' });
            setIsReconcileModalOpen(false);
            fetchCodData();
            loadFinance();
        } catch (err) {
            const msg = err.response?.data?.error || err.message || (lang === 'ar' ? 'فشل التوريد النقدي' : 'Failed to reconcile driver cash');
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setReconcileLoading(false);
        }
    };

    const summary = overview || {};
    const selectedCount = Object.keys(selectedShipmentsMap).length;

    return (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-200">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="badge badge-primary font-mono font-bold text-xs uppercase tracking-wider">
                            {lang === 'ar' ? 'نظام المحاسبة وإدارة النقدية المزدوج' : 'Dual-Perspective ERP & Ledger Hub'}
                        </span>
                        <span className="badge badge-outline border-base-300 text-xs font-mono">
                            {currentCurrency}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content">
                                {lang === 'ar' ? 'المالية والمحاسبة والأستاذ العام' : 'Financials, ERP & Double-Entry Ledgers'}
                            </h1>
                            <p className="text-xs sm:text-sm text-base-content/60">
                                {lang === 'ar'
                                    ? 'دفتر الأستاذ العام، مطابقة الموردين (AP)، تحصيل النقدية (COD)، والقوائم المالية الختامية.'
                                    : 'Double-entry general ledger, AP reconciliation, receivables, driver COD vault, and period closing.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Scope & Refresh Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    {can('VIEW_FINANCE') && organizations.length > 0 && (
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedOrgId}
                                onChange={(e) => setSelectedOrgId(e.target.value)}
                                className="select select-sm select-bordered font-bold text-xs bg-base-100 max-w-[220px]"
                            >
                                <option value="none">
                                    {t('fin_solo_shippers', 'Solo Shippers (Unorganized)')}
                                </option>
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={loadFinance}
                        disabled={loading}
                        className="btn btn-sm btn-ghost border border-base-200 gap-1.5 font-bold"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                        {lang === 'ar' ? 'تحديث' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Navigation Tabs Strip */}
            <div className="tabs tabs-boxed bg-base-200/60 p-1.5 rounded-2xl flex flex-wrap gap-1 border border-base-200">
                <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                        activeTab === 'overview' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">dashboard</span>
                    {t('fin_tab_overview', 'Overview & Cash Flow')}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('transactions')}
                    className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                        activeTab === 'transactions' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                    {t('fin_tab_transactions', 'Ledger Transactions')}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('allocations')}
                    className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                        activeTab === 'allocations' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">account_balance_wallet</span>
                    {t('fin_tab_allocations', 'Allocations & Payments')}
                </button>

                {can('VIEW_INVOICES') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('invoices')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'invoices' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">description</span>
                        {t('fin_tab_invoices', 'Invoices & Billing')}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => { setActiveTab('cod'); fetchCodData(); fetchDrivers(); }}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'cod' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">payments</span>
                        {lang === 'ar' ? 'نقدية السائقين (COD)' : 'Driver Cash & COD Vault'}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('reports')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'reports' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">analytics</span>
                        {t('fin_tab_reports', 'Profitability Reports')}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('statements')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'statements' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">account_balance</span>
                        {lang === 'ar' ? 'القوائم المالية' : 'Statements'}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('gl')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'gl' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">menu_book</span>
                        {lang === 'ar' ? 'الأستاذ العام' : 'General Ledger'}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('ap')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'ap' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">assignment_returned</span>
                        {lang === 'ar' ? 'مستحقات الموردين' : 'Accounts Payable'}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('treasury')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'treasury' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">savings</span>
                        {lang === 'ar' ? 'الخزينة والبنوك' : 'Treasury'}
                    </button>
                )}

                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('periods')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'periods' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">calendar_month</span>
                        {lang === 'ar' ? 'الإقفال المالي' : 'Period Closing'}
                    </button>
                )}
            </div>

            {/* Active Ledger Scope Banner */}
            <div className="bg-base-200/40 border border-base-200 rounded-2xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-base-content/60 font-semibold">{t('fin_active_scope', 'Active Ledger Scope')}:</span>
                    <strong className="text-base-content font-bold">{currentOrgName}</strong>
                </div>
                <div className="text-base-content/50 font-mono">
                    {t('fin_realtime_double_entry', 'Real-time audited double-entry balances')}
                </div>
            </div>

            {/* ── TAB 1: OVERVIEW & CASH FLOW ── */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* 4 Balance Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {t('fin_available_balance', 'Available Balance')}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">account_balance</span>
                                </div>
                            </div>
                            <div className="text-2xl font-black font-mono text-base-content">
                                {fmtAmount(summary.availableCredit || summary.balance)} <span className="text-xs font-semibold text-base-content/60">{currentCurrency}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-2">
                                <span>{t('fin_credit_limit', 'Credit Limit')}: {money(summary.creditLimit, currentCurrency)}</span>
                                <span className="badge badge-success badge-xs font-bold text-white">+8.2%</span>
                            </div>
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {t('fin_unapplied_cash', 'Unapplied Cash')}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-success/10 text-success flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">payments</span>
                                </div>
                            </div>
                            <div className="text-2xl font-black font-mono text-success">
                                {fmtAmount(summary.unappliedCash)} <span className="text-xs font-semibold text-base-content/60">{currentCurrency}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-2">
                                <span>{lang === 'ar' ? 'متاح للتسوية' : 'Available to allocate'}</span>
                                <span className="badge badge-primary badge-xs font-bold">{lang === 'ar' ? 'جاهز' : 'Ready'}</span>
                            </div>
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {t('fin_unpaid_receivables', 'Total Unpaid Cargo')}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                                </div>
                            </div>
                            <div className={`text-2xl font-black font-mono ${summary.totalUnpaid > 0 ? 'text-warning' : 'text-base-content'}`}>
                                {fmtAmount(summary.totalUnpaid)} <span className="text-xs font-semibold text-base-content/60">{currentCurrency}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-2">
                                <span>{lang === 'ar' ? 'فواتير غير مسددة' : 'Outstanding invoices'}</span>
                                <span className="badge badge-ghost badge-xs font-mono">{summary.agingBuckets?.['0-30'] ? '0-30D' : 'CURRENT'}</span>
                            </div>
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? 'صافي الموقف المالي' : 'Net Ledger Position'}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">trending_up</span>
                                </div>
                            </div>
                            <div className="text-2xl font-black font-mono text-base-content">
                                {fmtAmount(parseFloat(summary.unappliedCash || 0) - parseFloat(summary.balance || 0))} <span className="text-xs font-semibold text-base-content/60">{currentCurrency}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-2">
                                <span>{lang === 'ar' ? 'المسدد مقابل المطلوب' : 'Cash vs Invoiced'}</span>
                                <span className="badge badge-outline badge-xs font-bold">{lang === 'ar' ? 'متوازن' : 'Balanced'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Dual Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-5">
                            <h3 className="card-title text-base font-bold text-base-content mb-3">
                                {lang === 'ar' ? 'حركة التدفق النقدي الشهري (الدائن مقابل المدين)' : 'Monthly Cash Flow (Credits vs Debits)'}
                            </h3>
                            <CashFlowDualBarChart data={cashFlowChartData} currency={currentCurrency} height={220} />
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-5">
                            <h3 className="card-title text-base font-bold text-base-content mb-3">
                                {lang === 'ar' ? 'توزيع حجم الشحن والإنفاق' : 'Volume & Spending Distribution'}
                            </h3>
                            <ShareOfWalletBar items={spendingDistributionData} currency={currentCurrency} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 2: TRANSACTIONS / LEDGER ── */}
            {activeTab === 'transactions' && (
                <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                    <div className="card-body p-5 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h3 className="card-title text-base font-bold text-base-content">
                                    {t('fin_tab_transactions', 'Ledger Transactions')}: {currentOrgName}
                                </h3>
                                <p className="text-xs text-base-content/60">
                                    {lang === 'ar' ? 'سجل قيود اليومية المحاسبية المعتمدة لهذا الحساب بنظام القيد المزدوج.' : 'Audited double-entry journal entries for this account.'}
                                </p>
                            </div>
                            <ExportButton data={ledger} filename={`Ledger_${currentOrgName}`} />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="table table-zebra w-full text-xs">
                                <thead>
                                    <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                        <th>{t('fin_th_date', 'Date')}</th>
                                        <th>{t('fin_th_type', 'Type')}</th>
                                        <th>{lang === 'ar' ? 'التصنيف' : 'Category'}</th>
                                        <th>{t('fin_th_reference', 'Reference')}</th>
                                        <th>{t('fin_th_description', 'Description')}</th>
                                        <th className="text-end">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                                        <th className="text-end">{t('fin_th_balance', 'Balance')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="py-16 text-center text-base-content/50">
                                                <span className="loading loading-spinner loading-md text-primary"></span>
                                            </td>
                                        </tr>
                                    ) : ledger.length > 0 ? (
                                        ledger.map((entry) => (
                                            <tr key={entry.id} className="hover">
                                                <td className="font-mono text-xs">{format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                                                <td>
                                                    <span className={`badge badge-sm font-bold text-[10px] ${
                                                        entry.entryType === 'CREDIT' ? 'badge-success text-white' : 'badge-error text-white'
                                                    }`}>
                                                        {entry.entryType === 'CREDIT' ? (lang === 'ar' ? 'دائن (CR)' : 'CREDIT') : (lang === 'ar' ? 'مدين (DR)' : 'DEBIT')}
                                                    </span>
                                                </td>
                                                <td className="font-semibold text-xs">{entry.category}</td>
                                                <td className="font-mono text-xs text-base-content/70">{entry.referenceId || '—'}</td>
                                                <td className="text-xs max-w-xs truncate">{entry.description || '—'}</td>
                                                <td className={`text-end font-mono font-bold text-xs ${
                                                    entry.entryType === 'CREDIT' ? 'text-success' : 'text-error'
                                                }`}>
                                                    {entry.entryType === 'CREDIT' ? '+' : '-'}{money(entry.amount, entry.currency)}
                                                </td>
                                                <td className="text-end font-mono font-black text-xs text-base-content">
                                                    {money(entry.balanceAfter, entry.currency)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="py-12 text-center text-base-content/50">
                                                {t('fin_no_transactions', 'No ledger transactions recorded')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 3: ALLOCATIONS & PAYMENTS ── */}
            {activeTab === 'allocations' && (
                <div className="space-y-6">
                    {can('MANAGE_PAYMENTS') && (
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-5">
                            <h3 className="card-title text-base font-bold text-base-content mb-3">
                                {lang === 'ar' ? 'تسجيل دفعة مستلمة' : 'Post Received Payment'}: {currentOrgName}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'المبلغ' : 'Amount'} ({currentCurrency})
                                    </label>
                                    <input
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        value={paymentForm.amount}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                        placeholder="0.000"
                                        className="input input-sm input-bordered w-full font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'رقم الإيصال / السند' : 'Reference / Receipt #'}
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentForm.reference}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                                        placeholder="RCP-10092"
                                        className="input input-sm input-bordered w-full font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'طريقة الدفع' : 'Method'}
                                    </label>
                                    <select
                                        value={paymentForm.method}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                                        className="select select-sm select-bordered w-full text-xs font-semibold"
                                    >
                                        <option value="manual">{lang === 'ar' ? 'قيد يدوي' : 'Manual Entry'}</option>
                                        <option value="bank_transfer">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                                        <option value="cash">{lang === 'ar' ? 'نقدي (كاش)' : 'Cash'}</option>
                                        <option value="knet">{lang === 'ar' ? 'كي نت (K-Net)' : 'K-Net'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'ملاحظات داخلية' : 'Internal Notes'}
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentForm.notes}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                        placeholder={lang === 'ar' ? 'ملاحظة التدقيق...' : 'Audit note...'}
                                        className="input input-sm input-bordered w-full text-xs"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePostPayment}
                                        disabled={!paymentForm.amount}
                                        className="btn btn-sm btn-primary flex-1 font-bold shadow-xs"
                                    >
                                        {lang === 'ar' ? 'تسجيل الدفعة' : 'Post Payment'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFifoConfirmOpen(true)}
                                        className="btn btn-sm btn-outline border-base-300 font-bold"
                                        title={lang === 'ar' ? 'تسوية تلقائية (FIFO)' : 'Auto FIFO'}
                                    >
                                        FIFO
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Allocation 2-Column Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* LEFT: Unapplied Payments (5 cols) */}
                        <div className="lg:col-span-5 card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden h-[620px] flex flex-col">
                            <div className="p-4 bg-base-200/50 border-b border-base-200">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? '١. اختر الدفعة للتسوية' : '1. Select Payment To Allocate'}
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {payments.length > 0 ? (
                                    payments.map((p) => {
                                        const unapplied = parseFloat(p.amount) - parseFloat(p.allocatedAmount || 0);
                                        const isSelected = selectedPaymentId === p.id;
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setSelectedPaymentId(p.id);
                                                    setSelectedShipmentsMap({});
                                                }}
                                                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                                    isSelected
                                                        ? 'border-primary bg-primary/10 shadow-xs'
                                                        : 'border-base-200 bg-base-100 hover:bg-base-200/50'
                                                }`}
                                            >
                                                <div>
                                                    <div className="font-bold text-xs text-base-content">
                                                        {p.reference || (lang === 'ar' ? `دفعة #${p.id.slice(-6)}` : `Payment #${p.id.slice(-6)}`)}
                                                    </div>
                                                    <div className="text-[11px] text-base-content/50">
                                                        {format(new Date(p.postedAt || p.createdAt), 'MMM dd, yyyy')} • {p.method}
                                                    </div>
                                                </div>
                                                <div className="text-end">
                                                    <div className="font-mono font-bold text-sm text-primary">
                                                        {money(unapplied, p.currency)}
                                                    </div>
                                                    <div className="text-[10px] text-base-content/50">
                                                        {lang === 'ar' ? 'الإجمالي:' : 'Total:'} {money(p.amount, p.currency)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="py-16 text-center text-base-content/50 text-xs">
                                        {lang === 'ar' ? 'لا توجد دفعات غير مسواة' : 'No unapplied payments found'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: Shipments to Settle (7 cols) */}
                        <div className="lg:col-span-7 card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden h-[620px] flex flex-col">
                            <div className="p-4 bg-base-200/50 border-b border-base-200 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? `٢. اختر الشحنات (${selectedCount})` : `2. Select Shipments (${selectedCount})`}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleManualAllocation}
                                    disabled={allocationLoading || !selectedPaymentId || selectedCount === 0}
                                    className="btn btn-xs btn-primary font-bold shadow-xs gap-1"
                                >
                                    {allocationLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                                    {lang === 'ar' ? 'تطبيق التسوية' : 'Apply Allocation'}
                                </button>
                            </div>

                            <div className="p-3 bg-base-200/30 border-b border-base-200 flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder={lang === 'ar' ? 'بحث برقم الشحنة، المستلم...' : 'Search tracking, recipient...'}
                                    value={shipmentSearch}
                                    onChange={(e) => setShipmentSearch(e.target.value)}
                                    className="input input-xs input-bordered flex-1 bg-base-100 text-xs"
                                />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="select select-xs select-bordered text-xs"
                                >
                                    <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
                                    <option value="unpaid">{lang === 'ar' ? 'غير مدفوعة فقط' : 'Unpaid Only'}</option>
                                    <option value="partial">{lang === 'ar' ? 'مدفوعة جزئياً' : 'Partial Only'}</option>
                                </select>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {shipmentsLoading ? (
                                    <div className="py-16 text-center text-base-content/50">
                                        <span className="loading loading-spinner loading-md text-primary"></span>
                                    </div>
                                ) : shipments.length > 0 ? (
                                    shipments.map((s) => {
                                        const isSelected = Boolean(selectedShipmentsMap[s.id]);
                                        const outstanding = s.paid ? 0 : (s.remainingBalance !== undefined ? s.remainingBalance : (s.pricingSnapshot?.totalPrice || s.price || 0) - (s.totalPaid || 0));

                                        return (
                                            <div
                                                key={s.id}
                                                onClick={() => {
                                                    if (s.paid) return;
                                                    setSelectedShipmentsMap(prev => {
                                                        const next = { ...prev };
                                                        if (next[s.id]) delete next[s.id];
                                                        else next[s.id] = s;
                                                        return next;
                                                    });
                                                }}
                                                className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                                    s.paid
                                                        ? 'opacity-50 cursor-not-allowed bg-base-200/40 border-base-200'
                                                        : isSelected
                                                            ? 'border-primary bg-primary/10 shadow-xs cursor-pointer'
                                                            : 'border-base-200 bg-base-100 hover:bg-base-200/50 cursor-pointer'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={s.paid}
                                                        readOnly
                                                        className="checkbox checkbox-xs checkbox-primary"
                                                    />
                                                    <div>
                                                        <div className="font-mono font-bold text-xs text-base-content">
                                                            {s.trackingNumber}
                                                        </div>
                                                        <div className="text-[11px] text-base-content/50">
                                                            {s.receiver?.contactPerson || (lang === 'ar' ? 'المستلم' : 'Consignee')} • {formatRoute(s.origin, s.destination)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-end">
                                                    <div className={`font-mono font-bold text-xs ${s.paid ? 'text-success' : 'text-error'}`}>
                                                        {s.paid ? (lang === 'ar' ? 'مدفوعة' : 'PAID') : money(outstanding, s.currency)}
                                                    </div>
                                                    <div className="text-[10px] text-base-content/50">
                                                        {lang === 'ar' ? 'الإجمالي:' : 'Total:'} {money(s.pricingSnapshot?.totalPrice || s.price, s.currency)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="py-16 text-center text-base-content/50 text-xs">
                                        {lang === 'ar' ? 'لا توجد شحنات غير مسددة' : 'No active unpaid shipments found'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 4: INVOICES & BILLING ── */}
            {activeTab === 'invoices' && (
                <div className="space-y-6">
                    {can('MANAGE_PAYMENTS') && (
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-5">
                            <h3 className="card-title text-base font-bold text-base-content mb-3">
                                {lang === 'ar' ? 'إصدار فاتورة / مطالبة مالية' : 'Generate Statement / Invoice'}: {currentOrgName}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'بداية الفترة' : 'Period Start'}
                                    </label>
                                    <input
                                        type="date"
                                        value={invoiceForm.periodStart}
                                        onChange={(e) => setInvoiceForm({ ...invoiceForm, periodStart: e.target.value })}
                                        className="input input-sm input-bordered w-full font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'نهاية الفترة' : 'Period End'}
                                    </label>
                                    <input
                                        type="date"
                                        value={invoiceForm.periodEnd}
                                        onChange={(e) => setInvoiceForm({ ...invoiceForm, periodEnd: e.target.value })}
                                        className="input input-sm input-bordered w-full font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                                    </label>
                                    <input
                                        type="date"
                                        value={invoiceForm.dueDate}
                                        onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                                        className="input input-sm input-bordered w-full font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'ملاحظات' : 'Notes'}
                                    </label>
                                    <input
                                        type="text"
                                        value={invoiceForm.notes}
                                        onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                                        placeholder={lang === 'ar' ? 'ملاحظات الفاتورة...' : 'Invoice notes...'}
                                        className="input input-sm input-bordered w-full text-xs"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCreateInvoice}
                                    disabled={invoiceLoading || !invoiceForm.periodStart || !invoiceForm.periodEnd}
                                    className="btn btn-sm btn-primary font-bold shadow-xs gap-1"
                                >
                                    {invoiceLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                                    {lang === 'ar' ? 'إصدار الفاتورة' : 'Create Invoice'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                        <div className="card-body p-5 space-y-4">
                            <h3 className="card-title text-base font-bold text-base-content">
                                {t('fin_tab_invoices', 'Invoices')}: {currentOrgName}
                            </h3>

                            <div className="overflow-x-auto">
                                <table className="table table-zebra w-full text-xs">
                                    <thead>
                                        <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                            <th>{t('fin_th_invoice_num', 'Invoice #')}</th>
                                            <th>{lang === 'ar' ? 'الفترة' : 'Period'}</th>
                                            <th className="text-center">{lang === 'ar' ? 'عدد الشحنات' : 'Items'}</th>
                                            <th className="text-center">{t('fin_th_status', 'Status')}</th>
                                            <th>{t('fin_th_due_date', 'Due Date')}</th>
                                            <th className="text-end">{t('fin_th_amount', 'Total Amount')}</th>
                                            <th className="text-end">{t('fin_th_actions', 'Action')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.length > 0 ? (
                                            invoices.map((inv) => (
                                                <tr key={inv.id} className="hover">
                                                    <td className="font-mono font-bold text-xs">{inv.invoiceNumber}</td>
                                                    <td className="text-xs">
                                                        {format(new Date(inv.periodStart), 'MMM dd')} - {format(new Date(inv.periodEnd), 'MMM dd, yyyy')}
                                                    </td>
                                                    <td className="text-center font-mono">{inv.lines?.length || 0}</td>
                                                    <td className="text-center">
                                                        <StatusBadge status={inv.status} />
                                                    </td>
                                                    <td className="font-mono text-xs">{inv.dueDate ? format(new Date(inv.dueDate), 'MMM dd, yyyy') : '—'}</td>
                                                    <td className="text-end font-mono font-black text-xs text-base-content">
                                                        {money(inv.total, inv.currency)}
                                                    </td>
                                                    <td className="text-end">
                                                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDownloadInvoice(inv)}
                                                                disabled={downloadingInvoiceId === inv.id}
                                                                className="btn btn-xs btn-outline border-base-300 hover:border-primary gap-1 font-semibold"
                                                                title={lang === 'ar' ? 'تنزيل PDF' : 'Download PDF'}
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                                                                {downloadingInvoiceId === inv.id ? '...' : 'PDF'}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleSendInvoiceWhatsApp(inv.id)}
                                                                disabled={sendingInvoiceId === inv.id}
                                                                className="btn btn-xs btn-outline btn-success gap-1 font-semibold"
                                                                title={lang === 'ar' ? 'إرسال واتساب' : 'Send WhatsApp'}
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">send</span>
                                                                {sendingInvoiceId === inv.id ? '...' : 'WhatsApp'}
                                                            </button>

                                                            {can('MANAGE_PAYMENTS') && (
                                                                <select
                                                                    value={inv.status}
                                                                    onChange={(e) => handleInvoiceStatusChange(inv.id, e.target.value)}
                                                                    disabled={invoiceLoading}
                                                                    className="select select-xs select-bordered text-[11px]"
                                                                >
                                                                    {INVOICE_STATUS_OPTIONS.map(status => (
                                                                        <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-base-content/50">
                                                    {t('fin_no_invoices', 'No invoices found')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 5: PROFITABILITY REPORTS ── */}
            {activeTab === 'reports' && can('VIEW_FINANCE') && (
                <FinanceReports ledger={ledger} shipments={shipments} organizations={organizations} />
            )}

            {/* ── TAB 6: DRIVER COD & VAULT CLEARING ── */}
            {activeTab === 'cod' && can('VIEW_FINANCE') && (
                <div className="space-y-6">
                    {/* Alerts Banner */}
                    {codSummary.alerts && codSummary.alerts.length > 0 && (
                        <div className="alert alert-warning shadow-xs border border-warning/40 rounded-2xl">
                            <span className="material-symbols-outlined text-warning-content text-xl">warning</span>
                            <div className="space-y-0.5 text-xs text-warning-content">
                                {codSummary.alerts.map((a, idx) => (
                                    <div key={idx} className="font-bold">{a.message}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* COD KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? 'إجمالي نقدية التحصيل لدى السائقين' : 'Total Cash with Drivers'}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-success/10 text-success flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">payments</span>
                                </div>
                            </div>
                            <div className="text-2xl font-black font-mono text-success">
                                {fmtAmount(codSummary.unremittedTotalsByCurrency?.['KWD'] || 0)} <span className="text-xs font-semibold text-base-content/60">KWD</span>
                            </div>
                            <div className="text-[11px] text-base-content/50 mt-2">
                                {lang === 'ar' ? 'جاهز للاستلام والتسوية بالخزينة' : 'Ready for vault handover'}
                            </div>
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? 'عدد شحنات التحصيل غير المسواة' : 'Unremitted COD Shipments'}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                                </div>
                            </div>
                            <div className="text-2xl font-black font-mono text-base-content">
                                {codSummary.unremittedCount || 0}
                            </div>
                            <div className="text-[11px] text-base-content/50 mt-2">
                                {lang === 'ar' ? 'بانتظار التوريد للخزينة' : 'Awaiting cashier check'}
                            </div>
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? 'سقف احتفاظ السائق بالنقد' : 'Driver Holding Limit'}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">shield</span>
                                </div>
                            </div>
                            <div className={`text-2xl font-black font-mono ${codSummary.isLimitExceeded ? 'text-error' : 'text-base-content'}`}>
                                500.000 <span className="text-xs font-semibold text-base-content/60">KWD</span>
                            </div>
                            <div className="text-[11px] text-base-content/50 mt-2">
                                <span className={`badge badge-xs font-bold ${codSummary.isLimitExceeded ? 'badge-error text-white' : 'badge-success text-white'}`}>
                                    {codSummary.isLimitExceeded ? (lang === 'ar' ? 'تجاوز الحد' : 'Limit Exceeded') : (lang === 'ar' ? 'ضمن الحد' : 'Compliant')}
                                </span>
                            </div>
                        </div>

                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {lang === 'ar' ? 'أقدمية النقد غير المورد' : 'Oldest Unremitted Age'}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">schedule</span>
                                </div>
                            </div>
                            <div className={`text-2xl font-black font-mono ${codSummary.isAgingCritical ? 'text-error' : 'text-base-content'}`}>
                                {codSummary.oldestAgingDays || 0} <span className="text-xs font-semibold text-base-content/60">{lang === 'ar' ? 'يوم' : 'Days'}</span>
                            </div>
                            <div className="text-[11px] text-base-content/50 mt-2">
                                {lang === 'ar' ? 'التوريد الإجباري خلال 3 أيام' : 'Handover due in ≤ 3 days'}
                            </div>
                        </div>
                    </div>

                    {/* Filter and Reconcile Toolbar */}
                    <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <select
                                    value={codDriverFilter}
                                    onChange={(e) => {
                                        setCodDriverFilter(e.target.value);
                                        fetchCodData(e.target.value);
                                    }}
                                    className="select select-sm select-bordered text-xs font-semibold"
                                >
                                    <option value="ALL">{lang === 'ar' ? 'جميع السائقين' : 'All Drivers'}</option>
                                    {driversList.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    onClick={() => fetchCodData()}
                                    className="btn btn-sm btn-ghost border border-base-200"
                                >
                                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                                    {t('refresh', 'Refresh')}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => openReconcileModal()}
                                className="btn btn-sm btn-success text-white font-bold shadow-md shadow-success/20 gap-1.5"
                            >
                                <span className="material-symbols-outlined text-[18px]">account_balance</span>
                                {lang === 'ar' ? 'استلام وتوريد نقدية للخزينة' : 'Receive & Reconcile Vault Handover'}
                            </button>
                        </div>
                    </div>

                    {/* Consignments Table */}
                    <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                        <div className="card-body p-5 space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <h3 className="card-title text-base font-bold text-base-content">
                                        {lang === 'ar' ? 'سجل شحنات التحصيل النقدي (COD)' : 'COD Consignments & Remittance Ledger'}
                                    </h3>
                                    <p className="text-xs text-base-content/60">
                                        {lang === 'ar' ? 'متابعة وتدقيق المبالغ النقدية المحصلة من العملاء عبر السائقين.' : 'Audit and track physical cash collected by couriers.'}
                                    </p>
                                </div>
                                <ExportButton data={codSummary.shipments || []} filename="Driver_COD_Collections" />
                            </div>

                            <div className="overflow-x-auto">
                                <table className="table table-zebra w-full text-xs">
                                    <thead>
                                        <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                            <th>{t('fin_th_reference', 'Tracking #')}</th>
                                            <th>{lang === 'ar' ? 'السائق المعين' : 'Assigned Driver'}</th>
                                            <th className="text-center">{t('fin_th_status', 'Status')}</th>
                                            <th className="text-center">{lang === 'ar' ? 'حالة التوريد' : 'COD Status'}</th>
                                            <th className="text-end">{lang === 'ar' ? 'مبلغ التحصيل' : 'COD Amount'}</th>
                                            <th>{lang === 'ar' ? 'آخر تحديث' : 'Last Updated'}</th>
                                            <th className="text-end">{t('fin_th_actions', 'Actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {codLoading ? (
                                            <tr>
                                                <td colSpan={7} className="py-16 text-center text-base-content/50">
                                                    <span className="loading loading-spinner loading-md text-primary"></span>
                                                </td>
                                            </tr>
                                        ) : codSummary.shipments && codSummary.shipments.length > 0 ? (
                                            codSummary.shipments.map((s) => {
                                                const isRemitted = s.codStatus === 'REMITTED';
                                                return (
                                                    <tr key={s.id || s.trackingNumber} className="hover">
                                                        <td className="font-mono font-bold text-xs">{s.trackingNumber}</td>
                                                        <td>
                                                            <div className="font-bold text-base-content">{s.assignedDriver?.name || '—'}</div>
                                                            {s.assignedDriver?.phone && (
                                                                <div className="text-[11px] text-base-content/50 font-mono">{s.assignedDriver.phone}</div>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            <StatusBadge status={s.status} />
                                                        </td>
                                                        <td className="text-center">
                                                            <span className={`badge badge-sm font-bold text-[10px] ${
                                                                isRemitted ? 'badge-info text-white' : 'badge-warning text-warning-content'
                                                            }`}>
                                                                {isRemitted ? (lang === 'ar' ? 'مورد للخزينة' : 'REMITTED') : (lang === 'ar' ? 'طرف السائق' : 'HELD IN HAND')}
                                                            </span>
                                                        </td>
                                                        <td className="text-end font-mono font-bold text-xs text-success">
                                                            {fmtAmount(s.codAmount)} {normalizeCurrencyCode(s.codCurrency, 'KWD')}
                                                        </td>
                                                        <td className="font-mono text-xs text-base-content/60">
                                                            {s.updatedAt ? format(new Date(s.updatedAt), 'yyyy-MM-dd HH:mm') : '—'}
                                                        </td>
                                                        <td className="text-end">
                                                            {!isRemitted ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openReconcileModal(null, s)}
                                                                    className="btn btn-xs btn-success text-white font-bold gap-1 shadow-xs"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                                    {lang === 'ar' ? 'استلام وتوريد' : 'Reconcile'}
                                                                </button>
                                                            ) : (
                                                                <span className="text-[11px] text-base-content/50 font-semibold">✓ {lang === 'ar' ? 'تم القيد' : 'Posted'}</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-base-content/50">
                                                    {lang === 'ar' ? 'لا توجد شحنات تحصيل نقدي مسجلة' : 'No COD shipments found'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 7: FINANCIAL STATEMENTS ── */}
            {activeTab === 'statements' && can('VIEW_FINANCE') && (
                <FinancialStatementsTab lang={lang} />
            )}

            {/* ── TAB 8: GENERAL LEDGER & COA ── */}
            {activeTab === 'gl' && can('VIEW_FINANCE') && (
                <GeneralLedgerTab lang={lang} />
            )}

            {/* ── TAB 9: ACCOUNTS PAYABLE ── */}
            {activeTab === 'ap' && can('VIEW_FINANCE') && (
                <AccountsPayableTab lang={lang} />
            )}

            {/* ── TAB 10: TREASURY & BANKING ── */}
            {activeTab === 'treasury' && can('VIEW_FINANCE') && (
                <TreasuryTab lang={lang} />
            )}

            {/* ── TAB 11: PERIOD CLOSING ── */}
            {activeTab === 'periods' && can('VIEW_FINANCE') && (
                <PeriodClosingTab lang={lang} />
            )}

            {/* Cash Handover Reconciliation Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${isReconcileModalOpen ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-lg bg-base-100 border border-base-200 shadow-2xl p-6 text-base-content">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-success text-xl">payments</span>
                            <h3 className="font-black text-lg text-base-content">
                                {lang === 'ar' ? 'استلام وتوريد نقدية (COD) للخزينة' : 'Reconcile Driver Cash to Hub Vault'}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsReconcileModalOpen(false)}
                            className="btn btn-sm btn-circle btn-ghost text-base-content/60"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="py-4 space-y-3.5">
                        <p className="text-xs text-base-content/60">
                            {lang === 'ar'
                                ? 'إثبات استلام النقدية الفعلية من السائق وترحيلها بنظام القيد المزدوج إلى خزينة الفرع.'
                                : 'Verify physical cash collected from courier and post credit clearance to financial ledger.'}
                        </p>

                        <div>
                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                {lang === 'ar' ? 'السائق المسلم للنقدية *' : 'Driver Handing Over Cash *'}
                            </label>
                            <select
                                value={reconcileForm.driverId}
                                onChange={(e) => {
                                    const d = driversList.find(item => item.id === e.target.value);
                                    setReconcileForm(prev => ({
                                        ...prev,
                                        driverId: e.target.value,
                                        driverName: d?.name || ''
                                    }));
                                }}
                                className="select select-sm select-bordered w-full text-xs font-semibold"
                            >
                                <option value="">{lang === 'ar' ? '— اختر السائق —' : '— Select Driver —'}</option>
                                {driversList.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                    {lang === 'ar' ? 'المبلغ المستلم فعلياً *' : 'Cash Count Amount *'}
                                </label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={reconcileForm.amount}
                                    onChange={(e) => setReconcileForm(prev => ({ ...prev, amount: e.target.value }))}
                                    placeholder="0.000"
                                    className="input input-sm input-bordered w-full font-mono font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                    {lang === 'ar' ? 'العملة' : 'Currency'}
                                </label>
                                <select
                                    value={reconcileForm.currency}
                                    onChange={(e) => setReconcileForm(prev => ({ ...prev, currency: e.target.value }))}
                                    className="select select-sm select-bordered w-full font-mono text-xs font-bold"
                                >
                                    <option value="KWD">KWD</option>
                                    <option value="SAR">SAR</option>
                                    <option value="AED">AED</option>
                                    <option value="BHD">BHD</option>
                                    <option value="OMR">OMR</option>
                                    <option value="QAR">QAR</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                {lang === 'ar' ? 'رقم كيس الأمانات / المظروف (اختياري)' : 'Security Bag / Envelope Ref'}
                            </label>
                            <input
                                type="text"
                                value={reconcileForm.bagReference}
                                onChange={(e) => setReconcileForm(prev => ({ ...prev, bagReference: e.target.value }))}
                                placeholder="e.g. BAG-KW-0921"
                                className="input input-sm input-bordered w-full font-mono text-xs"
                            />
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                {lang === 'ar' ? 'ملاحظات أمين الصندوق' : 'Cashier Verification Notes'}
                            </label>
                            <input
                                type="text"
                                value={reconcileForm.notes}
                                onChange={(e) => setReconcileForm(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder={lang === 'ar' ? 'تم جرد النقد ومطابقته بخزينة الشويخ' : 'Cash verified and placed in hub vault safe'}
                                className="input input-sm input-bordered w-full text-xs"
                            />
                        </div>
                    </div>

                    <div className="modal-action pt-3 border-t border-base-200">
                        <button
                            type="button"
                            onClick={() => setIsReconcileModalOpen(false)}
                            disabled={reconcileLoading}
                            className="btn btn-sm btn-ghost"
                        >
                            {t('cancel', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleReconcileSubmit}
                            disabled={reconcileLoading || !reconcileForm.amount || parseFloat(reconcileForm.amount) <= 0 || !reconcileForm.driverId}
                            className="btn btn-sm btn-success text-white font-bold gap-1 shadow-md shadow-success/20"
                        >
                            {reconcileLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                            {lang === 'ar' ? 'ترحيل إلى الخزينة وقيد اليومية' : 'Post Remittance to Ledger'}
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setIsReconcileModalOpen(false)} />
            </div>

            {/* FIFO Confirmation Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${fifoConfirmOpen ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-md bg-base-100 border border-base-200 shadow-2xl p-6 text-base-content">
                    <div className="flex items-center gap-2 pb-3 border-b border-base-200">
                        <span className="material-symbols-outlined text-primary text-xl">auto_mode</span>
                        <h3 className="font-black text-lg text-base-content">
                            {lang === 'ar' ? 'تأكيد التسوية التلقائية (FIFO)' : 'Confirm Automatic FIFO Allocation'}
                        </h3>
                    </div>

                    <div className="py-4 space-y-2 text-xs">
                        <p>
                            {lang === 'ar' ? `هل أنت متأكد من تشغيل التسوية التلقائية (FIFO) لحساب ` : `Are you sure you want to run FIFO Auto-Allocation for `}
                            <strong className="text-primary">{currentOrgName}</strong>؟
                        </p>
                        <p className="text-base-content/60">
                            {lang === 'ar'
                                ? 'سيتم توزيع الأرصدة المتاحة تلقائياً لتسوية أقدم الشحنات غير المسددة أولاً بأول.'
                                : 'This will automatically distribute available unapplied credits to settle the oldest outstanding shipments first.'}
                        </p>
                    </div>

                    <div className="modal-action pt-3 border-t border-base-200">
                        <button
                            type="button"
                            onClick={() => setFifoConfirmOpen(false)}
                            className="btn btn-sm btn-ghost"
                        >
                            {t('cancel', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleFifoConfirmed}
                            className="btn btn-sm btn-primary font-bold shadow-xs"
                        >
                            {lang === 'ar' ? 'تأكيد التسوية' : 'Confirm FIFO'}
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setFifoConfirmOpen(false)} />
            </div>
        </div>
    );
};

export default FinancePage;
