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
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });

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
    const [shipmentPagination, setShipmentPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [shipmentsLoading, setShipmentsLoading] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Active Tab
    const [activeTab, setActiveTab] = useState('overview');

    // Period & Timeframe State
    const [selectedPeriod, setSelectedPeriod] = useState('this_month'); // 'today' | '7days' | 'this_month' | 'last_month' | 'all' | 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);

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

        return months;
    }, [ledger]);

    // Dynamic Spending & Volume Distribution
    const spendingDistributionData = useMemo(() => {
        // 1. Prefer real aggregated spending distribution from backend overview
        if (Array.isArray(overview?.spendingDistribution) && overview.spendingDistribution.length > 0) {
            return overview.spendingDistribution;
        }

        // 2. Client-side fallback: aggregate from loaded shipments
        if (Array.isArray(shipments) && shipments.length > 0) {
            const colors = ['#0050d4', '#0284c7', '#7c3aed', '#059669', '#f59e0b', '#9ca3af'];
            const carrierLabels = {
                'ARAMEX': 'Aramex Express',
                'DHL': 'DHL Express',
                'DGR': 'DHL Express (DGR)',
                'FEDEX': 'FedEx International',
                'INTERNAL': 'Target Local Fleet',
                'MANUAL': 'Direct Courier'
            };
            const carrierStats = {};
            let totalVal = 0;

            shipments.forEach(s => {
                const carrier = (s.carrierCode || s.carrier || 'OTHER').toUpperCase();
                const amt = parseFloat(s.pricingSnapshot?.totalPrice ?? s.price ?? s.customerFee ?? s.totalCharge ?? 0);
                if (!carrierStats[carrier]) {
                    carrierStats[carrier] = { amount: 0, count: 0 };
                }
                carrierStats[carrier].amount += amt;
                carrierStats[carrier].count += 1;
                totalVal += amt;
            });

            const useAmount = totalVal > 0;
            const entries = Object.entries(carrierStats).sort((a, b) => {
                return useAmount ? b[1].amount - a[1].amount : b[1].count - a[1].count;
            });
            const divisor = useAmount ? totalVal : shipments.length;

            return entries.map(([carrier, data], idx) => {
                const val = useAmount ? data.amount : data.count;
                const pct = Math.round((val / divisor) * 100);
                return {
                    name: carrierLabels[carrier] || carrier,
                    amount: Math.round(data.amount),
                    count: data.count,
                    percent: pct,
                    color: colors[idx % colors.length]
                };
            });
        }

        return [];
    }, [overview, shipments]);

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
        const targetOrg = orgId || selectedOrgId;
        if (!targetOrg) return;
        try {
            setLoading(true);
            const params = {
                page: pagination.page,
                limit: pagination.limit,
                orgId: targetOrg,
                period: selectedPeriod === 'custom' ? undefined : selectedPeriod,
                startDate: selectedPeriod === 'custom' ? customStartDate : undefined,
                endDate: selectedPeriod === 'custom' ? customEndDate : undefined
            };
            const response = await financeService.getLedger(params);
            setLedger(response.data || []);
            setPagination(prev => ({
                ...prev,
                total: response.pagination?.total || 0,
                pages: response.pagination?.pages || Math.ceil((response.pagination?.total || 0) / (prev.limit || 50)) || 1
            }));
            await refreshUser();
        } catch (error) {
            console.error('Failed to fetch ledger:', error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, selectedOrgId, selectedPeriod, customStartDate, customEndDate, refreshUser]);

    useEffect(() => {
        if (selectedOrgId) {
            fetchLedger(selectedOrgId);
        }
    }, [pagination.page, pagination.limit]);

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
                sortOrder: 'desc',
                period: selectedPeriod === 'custom' ? undefined : selectedPeriod,
                startDate: selectedPeriod === 'custom' ? customStartDate : undefined,
                endDate: selectedPeriod === 'custom' ? customEndDate : undefined
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
    }, [selectedOrgId, shipmentPagination.page, shipmentPagination.limit, debouncedSearch, statusFilter, selectedPeriod, customStartDate, customEndDate]);

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

    const currentOrgName = selectedOrgId === 'all'
        ? (lang === 'ar' ? 'جميع المنظمات والعملاء (عرض موحد شامل)' : 'All Organizations (Consolidated Global View)')
        : selectedOrgId === 'none'
            ? (lang === 'ar' ? 'شاحنون أفراد (بدون منظمة)' : 'Solo Shippers (Unorganized)')
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
                    setSelectedOrgId('all');
                }
                return;
            }

            if (selectedOrgId) {
                const filterParams = {
                    period: selectedPeriod === 'custom' ? undefined : selectedPeriod,
                    startDate: selectedPeriod === 'custom' ? customStartDate : undefined,
                    endDate: selectedPeriod === 'custom' ? customEndDate : undefined
                };
                const [balanceRes, paymentsRes, invoicesRes] = await Promise.all([
                    financeService.getOrganizationBalance(selectedOrgId, filterParams),
                    financeService.listPayments(selectedOrgId, filterParams),
                    financeService.listInvoices(selectedOrgId, filterParams)
                ]);

                setOverview(balanceRes.data);
                await fetchLedger(selectedOrgId);

                const unappliedPayments = (paymentsRes.data || []).filter(p => p.status !== 'APPLIED');
                setPayments(unappliedPayments);
                setInvoices(invoicesRes.data || []);
            }
        } catch (err) {
            console.error('Failed to load finance data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedOrgId, selectedPeriod, customStartDate, customEndDate, fetchLedger, can, user?.organizationId, user?.role]);

    useEffect(() => {
        loadFinance();
    }, [loadFinance, selectedPeriod, customStartDate, customEndDate]);

    const handlePostPayment = async () => {
        if (!paymentForm.amount) return;
        const targetOrg = selectedOrgId === 'all' ? (paymentForm.targetOrgId || organizations[0]?.id) : selectedOrgId;
        if (!targetOrg || targetOrg === 'none') {
            enqueueSnackbar(lang === 'ar' ? 'يرجى اختيار منظمة لتسجيل الدفعة' : 'Please select an organization to post payment', { variant: 'warning' });
            return;
        }
        try {
            await financeService.postPayment(targetOrg, {
                ...paymentForm,
                amount: parseFloat(paymentForm.amount),
                currency: currentCurrency
            });
            enqueueSnackbar('Payment posted successfully', { variant: 'success' });
            setPaymentForm(prev => ({ ...prev, amount: '', reference: '', notes: '' }));
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

        const targetOrg = selectedOrgId === 'all' ? (invoiceForm.targetOrgId || organizations[0]?.id) : selectedOrgId;
        if (!targetOrg || targetOrg === 'none') {
            enqueueSnackbar(lang === 'ar' ? 'يرجى اختيار منظمة لإصدار الفاتورة' : 'Please select an organization to invoice', { variant: 'warning' });
            return;
        }

        setInvoiceLoading(true);
        try {
            await financeService.createInvoice(targetOrg, {
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
        if (selectedOrgId === 'all') {
            enqueueSnackbar(lang === 'ar' ? 'يرجى اختيار منظمة محددة من القائمة بالأعلى لإجراء التسوية التلقائية FIFO' : 'Please select a specific organization from the top selector for FIFO allocation', { variant: 'warning' });
            return;
        }
        try {
            await financeService.allocatePaymentsFifo(selectedOrgId);
            enqueueSnackbar('FIFO Allocation completed', { variant: 'success' });
            await loadFinance();
        } catch (error) {
            enqueueSnackbar(error.message || 'Failed to allocate FIFO', { variant: 'error' });
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

        const targetOrg = payment.organizationId || (selectedOrgId === 'all' ? 'none' : selectedOrgId);

        setAllocationLoading(true);
        try {
            await financeService.allocatePaymentManual(targetOrg, {
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

    // Workspace Suites & Scope Categorization
    const arTabs = ['overview', 'transactions', 'allocations', 'invoices', 'all_sections'];
    const codTabs = ['cod'];
    const erpTabs = ['gl', 'statements', 'ap', 'treasury', 'reports', 'periods'];

    const isOrgScopedTab = arTabs.includes(activeTab);
    const currentSuite = arTabs.includes(activeTab)
        ? 'ar'
        : (codTabs.includes(activeTab) ? 'cod' : 'erp');

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
                    {can('VIEW_FINANCE') && (
                        <div className="flex items-center gap-2">
                            {isOrgScopedTab ? (
                                organizations.length > 0 && (
                                    <div className="relative">
                                        <select
                                            value={selectedOrgId}
                                            onChange={(e) => setSelectedOrgId(e.target.value)}
                                            className="select select-sm select-bordered font-bold text-xs bg-base-100 max-w-[270px] pl-8 rtl:pr-8 rtl:pl-3"
                                        >
                                            <option value="all">
                                                {lang === 'ar' ? '🌐 جميع المنظمات والعملاء (عرض شامل)' : '🌐 All Organizations (Consolidated)'}
                                            </option>
                                            <option value="none">
                                                {t('fin_solo_shippers', 'Solo Shippers (Unorganized)')}
                                            </option>
                                            {organizations.map((org) => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                        <span className="material-symbols-outlined text-[16px] text-base-content/50 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                            corporate_fare
                                        </span>
                                    </div>
                                )
                            ) : (
                                <div
                                    className="relative tooltip tooltip-bottom"
                                    data-tip={
                                        activeTab === 'cod'
                                            ? (lang === 'ar' ? 'نقدية وعُهد السائقين تتبع أسطول المنصة بالكامل ولا تقتصر على عميل محدد' : 'Driver COD Remittance operates across the fleet vault, not filtered by customer org')
                                            : (lang === 'ar' ? 'دفاتر الأستاذ العام والقوائم المالية تخص حسابات الشركة الشاملة' : 'Corporate General Ledger & Statements reflect company-wide accounts')
                                    }
                                >
                                    <select
                                        disabled
                                        className="select select-sm select-bordered font-bold text-xs bg-base-200/70 border-base-300 text-base-content/60 opacity-80 cursor-not-allowed max-w-[270px] pl-8 rtl:pr-8 rtl:pl-3"
                                    >
                                        <option>
                                            {activeTab === 'cod'
                                                ? (lang === 'ar' ? '🔒 خزينة تحصيل السائقين (شامل الأسطول)' : '🔒 Driver Fleet Vault (Platform-wide)')
                                                : (lang === 'ar' ? '🔒 الأستاذ العام للمؤسسة (شامل الشركة)' : '🔒 Corporate Ledger (Platform-wide)')}
                                        </option>
                                    </select>
                                    <span className="material-symbols-outlined text-[16px] text-base-content/40 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                        lock
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            loadFinance();
                            if (activeTab === 'cod' || activeTab === 'all_sections') {
                                fetchCodData();
                                fetchDrivers();
                            }
                        }}
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

            {/* Timeframe & Period Control Deck */}
            <div className="bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-lg">calendar_month</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-base-content">
                                {lang === 'ar' ? 'نطاق الفترة الزمنية المحاسبية' : 'Financial Accounting Period'}
                            </span>
                            <span className="badge badge-primary badge-outline badge-xs font-bold">
                                {selectedPeriod === 'today' && (lang === 'ar' ? 'اليوم' : 'Today')}
                                {selectedPeriod === '7days' && (lang === 'ar' ? 'آخر 7 أيام' : 'Past 7 Days')}
                                {selectedPeriod === 'this_month' && (lang === 'ar' ? 'هذا الشهر' : 'This Month')}
                                {selectedPeriod === 'last_month' && (lang === 'ar' ? 'الشهر الماضي' : 'Last Month')}
                                {selectedPeriod === 'all' && (lang === 'ar' ? 'جميع البيانات التاريخية' : 'All-Time')}
                                {selectedPeriod === 'custom' && (lang === 'ar' ? 'نطاق مخصص' : 'Custom Range')}
                            </span>
                        </div>
                        <p className="text-[11px] text-base-content/60 font-medium mt-0.5">
                            {selectedPeriod === 'today' && (lang === 'ar' ? 'عرض حركات وسجلات اليوم المالية فقط' : 'Displaying ledger entries and invoices recorded today')}
                            {selectedPeriod === '7days' && (lang === 'ar' ? 'عرض العمليات المالية لآخر 7 أيام تشغيلية' : 'Displaying transactions for the past 7 operational days')}
                            {selectedPeriod === 'this_month' && (lang === 'ar' ? 'عرض حركات دورة الشهر الحالي المحاسبية' : 'Displaying transactions for current monthly financial cycle')}
                            {selectedPeriod === 'last_month' && (lang === 'ar' ? 'عرض حركات الشهر الماضي كاملاً' : 'Displaying transactions for full previous calendar month')}
                            {selectedPeriod === 'all' && (lang === 'ar' ? 'نظرة شاملة لكافة القيود التاريخية المسجلة' : 'Complete historical ledger and financial overview')}
                            {selectedPeriod === 'custom' && (lang === 'ar' ? `الفترة المحددة: ${customStartDate || 'من البداية'} إلى ${customEndDate || 'اليوم'}` : `Selected range: ${customStartDate || 'Start'} to ${customEndDate || 'End'}`)}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Preset Period Buttons */}
                    <div className="join w-full sm:w-auto overflow-x-auto">
                        {[
                            { id: 'today', label: lang === 'ar' ? 'اليوم' : 'Today', icon: 'today' },
                            { id: '7days', label: lang === 'ar' ? '7 أيام' : '7 Days', icon: 'date_range' },
                            { id: 'this_month', label: lang === 'ar' ? 'هذا الشهر' : 'This Month', icon: 'calendar_today' },
                            { id: 'last_month', label: lang === 'ar' ? 'الشهر الماضي' : 'Last Month', icon: 'history' },
                            { id: 'all', label: lang === 'ar' ? 'الكل' : 'All Time', icon: 'all_inclusive' },
                            { id: 'custom', label: lang === 'ar' ? 'مخصص' : 'Custom', icon: 'tune' },
                        ].map((p) => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setSelectedPeriod(p.id);
                                    if (p.id === 'custom') setIsCustomDateOpen(true);
                                    else setIsCustomDateOpen(false);
                                }}
                                className={`btn btn-xs sm:btn-sm join-item font-bold text-xs gap-1 ${
                                    selectedPeriod === p.id ? 'btn-primary shadow-sm' : 'btn-ghost border-base-200 text-base-content/70'
                                }`}
                            >
                                <span className="material-symbols-outlined text-sm">{p.icon}</span>
                                <span>{p.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Pickers Popover / Controls */}
                    {(selectedPeriod === 'custom' || isCustomDateOpen) && (
                        <div className="flex items-center gap-1.5 bg-base-200/70 p-1.5 rounded-xl border border-base-300 w-full sm:w-auto animate-in fade-in duration-200">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => {
                                    setCustomStartDate(e.target.value);
                                    setSelectedPeriod('custom');
                                }}
                                className="input input-bordered input-xs rounded-lg font-mono text-xs bg-base-100"
                                title={lang === 'ar' ? 'تاريخ البدء' : 'Start Date'}
                            />
                            <span className="text-xs font-bold text-base-content/50">{isRTL ? '←' : '→'}</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => {
                                    setCustomEndDate(e.target.value);
                                    setSelectedPeriod('custom');
                                }}
                                className="input input-bordered input-xs rounded-lg font-mono text-xs bg-base-100"
                                title={lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}
                            />
                            {(customStartDate || customEndDate) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCustomStartDate('');
                                        setCustomEndDate('');
                                        setSelectedPeriod('this_month');
                                        setIsCustomDateOpen(false);
                                    }}
                                    className="btn btn-ghost btn-xs text-base-content/60 hover:text-error"
                                    title={lang === 'ar' ? 'مسح' : 'Clear'}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── WORKSPACE SUITE SWITCHER (TIER 1) ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Suite 1: Customer AR & Billing */}
                <button
                    type="button"
                    onClick={() => {
                        if (!arTabs.includes(activeTab)) {
                            setActiveTab('overview');
                        }
                    }}
                    className={`relative p-3.5 rounded-2xl border transition-all text-left rtl:text-right flex items-center gap-3.5 ${
                        currentSuite === 'ar'
                            ? 'bg-base-100 border-primary shadow-sm ring-1 ring-primary/20'
                            : 'bg-base-100/60 border-base-200 hover:bg-base-100 hover:border-base-300'
                    }`}
                >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        currentSuite === 'ar'
                            ? 'bg-primary text-primary-content shadow-xs'
                            : 'bg-base-200 text-base-content/60'
                    }`}>
                        <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-black uppercase tracking-wider text-base-content">
                                {lang === 'ar' ? 'العملاء والذمم المدينة (AR)' : 'Customer AR & Billing'}
                            </span>
                            {currentSuite === 'ar' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    {lang === 'ar' ? 'نشط' : 'Active'}
                                </span>
                            ) : (
                                <span className="text-[10px] text-base-content/40 font-mono">5 {lang === 'ar' ? 'أقسام' : 'views'}</span>
                            )}
                        </div>
                        <p className="text-[11px] text-base-content/60 truncate">
                            {lang === 'ar' ? 'الأرصدة، الفواتير، التحصيلات، وتسويات FIFO' : 'Invoices, aging, balances, FIFO payments'}
                        </p>
                    </div>
                </button>

                {/* Suite 2: Driver COD Vault */}
                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('cod');
                            fetchCodData();
                            fetchDrivers();
                        }}
                        className={`relative p-3.5 rounded-2xl border transition-all text-left rtl:text-right flex items-center gap-3.5 ${
                            currentSuite === 'cod'
                                ? 'bg-base-100 border-primary shadow-sm ring-1 ring-primary/20'
                                : 'bg-base-100/60 border-base-200 hover:bg-base-100 hover:border-base-300'
                        }`}
                    >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            currentSuite === 'cod'
                                ? 'bg-primary text-primary-content shadow-xs'
                                : 'bg-base-200 text-base-content/60'
                        }`}>
                            <span className="material-symbols-outlined text-2xl">payments</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-black uppercase tracking-wider text-base-content">
                                    {lang === 'ar' ? 'نقدية وعُهد السائقين (COD)' : 'Driver Cash & COD Vault'}
                                </span>
                                {currentSuite === 'cod' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                        {lang === 'ar' ? 'نشط' : 'Active'}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-base-content/40 font-mono">{lang === 'ar' ? 'خزينة' : 'Vault'}</span>
                                )}
                            </div>
                            <p className="text-[11px] text-base-content/60 truncate">
                                {lang === 'ar' ? 'توريد الكاش، مطابقة الأكياس، وفروقات العُهد' : 'Cash remittance, bag audits, vault clearing'}
                            </p>
                        </div>
                    </button>
                )}

                {/* Suite 3: Corporate ERP & Accounting */}
                {can('VIEW_FINANCE') && (
                    <button
                        type="button"
                        onClick={() => {
                            if (!erpTabs.includes(activeTab)) {
                                setActiveTab('gl');
                            }
                        }}
                        className={`relative p-3.5 rounded-2xl border transition-all text-left rtl:text-right flex items-center gap-3.5 ${
                            currentSuite === 'erp'
                                ? 'bg-base-100 border-primary shadow-sm ring-1 ring-primary/20'
                                : 'bg-base-100/60 border-base-200 hover:bg-base-100 hover:border-base-300'
                        }`}
                    >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            currentSuite === 'erp'
                                ? 'bg-primary text-primary-content shadow-xs'
                                : 'bg-base-200 text-base-content/60'
                        }`}>
                            <span className="material-symbols-outlined text-2xl">domain</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-black uppercase tracking-wider text-base-content">
                                    {lang === 'ar' ? 'الإدارة المالية والمحاسبة (ERP)' : 'Corporate ERP & Ledgers'}
                                </span>
                                {currentSuite === 'erp' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                        {lang === 'ar' ? 'نشط' : 'Active'}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-base-content/40 font-mono">6 {lang === 'ar' ? 'دفاتر' : 'ledgers'}</span>
                                )}
                            </div>
                            <p className="text-[11px] text-base-content/60 truncate">
                                {lang === 'ar' ? 'الأستاذ العام، AP، القوائم، البنوك والإقفال' : 'General ledger, AP, statements, banking, closing'}
                            </p>
                        </div>
                    </button>
                )}
            </div>

            {/* ── CONTEXTUAL SUBTABS STRIP (TIER 2) ── */}
            <div className="tabs tabs-boxed bg-base-200/60 p-1.5 rounded-2xl flex flex-wrap items-center gap-1.5 border border-base-200">
                {currentSuite === 'ar' && (
                    <>
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

                        <div className="h-4 w-px bg-base-300 mx-1 hidden sm:block" />

                        {can('VIEW_FINANCE') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('all_sections');
                                    fetchCodData();
                                    fetchDrivers();
                                }}
                                className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                                    activeTab === 'all_sections' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[17px]">grid_view</span>
                                {lang === 'ar' ? 'عرض الكل معاً (لوحة شاملة)' : 'View All at Once (Master Hub)'}
                            </button>
                        )}
                    </>
                )}

                {currentSuite === 'cod' && (
                    <button
                        type="button"
                        onClick={() => { setActiveTab('cod'); fetchCodData(); fetchDrivers(); }}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            activeTab === 'cod' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">payments</span>
                        {lang === 'ar' ? 'خزينة عُهد وتحصيل السائقين (Driver COD Vault)' : 'Driver Cash & COD Vault Clearing'}
                    </button>
                )}

                {currentSuite === 'erp' && (
                    <>
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

                        <button
                            type="button"
                            onClick={() => setActiveTab('ap')}
                            className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                                activeTab === 'ap' ? 'tab-active !bg-primary !text-primary-content shadow-xs' : 'text-base-content/70 hover:text-base-content'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[17px]">assignment_returned</span>
                            {lang === 'ar' ? 'مستحقات الموردين (AP)' : 'Accounts Payable'}
                        </button>

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
                    </>
                )}
            </div>

            {/* Active Ledger Scope Banner */}
            <div className="bg-base-200/40 border border-base-200 rounded-2xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-base-content/60 font-semibold">{t('fin_active_scope', 'Active Ledger Scope')}:</span>
                    {isOrgScopedTab ? (
                        <>
                            <strong className="text-base-content font-bold">{currentOrgName}</strong>
                            {selectedOrgId === 'all' && (
                                <span className="badge badge-xs badge-primary font-mono font-bold">
                                    {summary.totalOrganizationsCount || organizations.length} {lang === 'ar' ? 'منظمات' : 'Orgs'}
                                </span>
                            )}
                        </>
                    ) : activeTab === 'cod' ? (
                        <div className="flex items-center gap-1.5">
                            <strong className="text-base-content font-bold">
                                {lang === 'ar' ? 'خزينة تحصيل الكاش وعُهد السائقين' : 'Driver COD Central Vault & Fleet Clearing'}
                            </strong>
                            <span className="badge badge-xs badge-warning font-bold">
                                {lang === 'ar' ? 'أسطول العمليات' : 'Fleet Operations'}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <strong className="text-base-content font-bold">
                                {lang === 'ar' ? 'الأستاذ العام والقوائم المالية الموحدة' : 'Corporate General Ledger & Financial Statements'}
                            </strong>
                            <span className="badge badge-xs badge-secondary font-bold">
                                {lang === 'ar' ? 'حسابات الشركة الشاملة' : 'Internal Corporate Books'}
                            </span>
                        </div>
                    )}
                </div>
                <div className="text-base-content/50 font-mono text-xs">
                    {isOrgScopedTab
                        ? t('fin_realtime_double_entry', 'Real-time audited double-entry balances')
                        : activeTab === 'cod'
                            ? (lang === 'ar' ? 'تسوية عُهد السائقين وتوريدات الكاش' : 'Driver remittance & cash vault audits')
                            : (lang === 'ar' ? 'دفتر اليومية العامة والقيد المزدوج' : 'Double-entry journal & GAAP compliance')}
                </div>
            </div>

            {/* ── SECTION 1: OVERVIEW & CASH FLOW ── */}
            {(activeTab === 'overview' || activeTab === 'all_sections') && (
                <div className="space-y-6">
                    {activeTab === 'all_sections' && (
                        <div className="flex items-center justify-between p-3.5 bg-base-100 rounded-2xl border border-base-200 shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">dashboard</span>
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-black text-base-content">
                                        {lang === 'ar' ? '١. نظرة عامة والتدفق النقدي' : '1. Overview & Cash Flow Metrics'}
                                    </h2>
                                    <p className="text-[11px] text-base-content/60">
                                        {lang === 'ar' ? 'مؤشرات الأرصدة، النقد المتاح، ومستحقات الشحن' : 'Audited balance indicators, unapplied cash, and freight receivables'}
                                    </p>
                                </div>
                            </div>
                            <span className="badge badge-sm badge-primary font-mono font-bold">KPI HUB</span>
                        </div>
                    )}

                    {/* 4 Balance Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Card 1: Available / Period Net Balance */}
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">
                                    {selectedPeriod !== 'all'
                                        ? (lang === 'ar' ? 'صافي رصيد الفترة' : 'Period Net Balance')
                                        : t('fin_available_balance', 'Available Balance')}
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">account_balance</span>
                                </div>
                            </div>
                            <div className="text-2xl font-black font-mono text-base-content">
                                {fmtAmount(selectedPeriod !== 'all' ? summary.balance : (selectedOrgId === 'all' ? summary.balance : (Number(summary.creditLimit || 0) > 0 ? summary.availableCredit : summary.balance)))} <span className="text-xs font-semibold text-base-content/60">{currentCurrency}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-2">
                                <span>
                                    {selectedPeriod !== 'all'
                                        ? (selectedPeriod === 'today' ? (lang === 'ar' ? 'حركات اليوم المالية' : 'Activity recorded today')
                                            : selectedPeriod === '7days' ? (lang === 'ar' ? 'حركات آخر 7 أيام' : 'Activity in past 7 days')
                                            : selectedPeriod === 'this_month' ? (lang === 'ar' ? 'حركات هذا الشهر' : 'Activity this month')
                                            : selectedPeriod === 'last_month' ? (lang === 'ar' ? 'حركات الشهر الماضي' : 'Activity last month')
                                            : (lang === 'ar' ? 'حركات الفترة المحددة' : 'Activity in custom range'))
                                        : (selectedOrgId === 'all'
                                            ? `${summary.totalOrganizationsCount || organizations.length} ${lang === 'ar' ? 'منظمات' : 'Organizations'}`
                                            : `${t('fin_credit_limit', 'Credit Limit')}: ${money(summary.creditLimit, currentCurrency)}`)}
                                </span>
                                <span className="badge badge-success badge-xs font-bold text-white">Active</span>
                            </div>
                        </div>

                        {/* Card 2: Unapplied Cash */}
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
                                <span>
                                    {summary.unappliedPaymentsCount ?? payments.length} {lang === 'ar' ? 'دفعات متاحة' : 'Payments'}
                                </span>
                                <span className="badge badge-primary badge-xs font-bold">{lang === 'ar' ? 'جاهز' : 'Ready'}</span>
                            </div>
                        </div>

                        {/* Card 3: Total Unpaid Cargo */}
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
                                <span>
                                    {summary.unpaidShipmentsCount ?? shipments.filter(s => !s.paid).length} {lang === 'ar' ? 'شحنات غير مسددة' : 'Outstanding shipments'}
                                </span>
                                <span className="badge badge-ghost badge-xs font-mono">{summary.agingBuckets?.['0-30'] ? '0-30D' : 'CURRENT'}</span>
                            </div>
                        </div>

                        {/* Card 4: Net Ledger Position */}
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
                                <span>
                                    {Number(summary.totalInvoicesAmount || 0) > 0
                                        ? `${fmtAmount(summary.totalInvoicesAmount)} ${currentCurrency}`
                                        : `${summary.totalInvoicesCount ?? invoices.length} ${lang === 'ar' ? 'فواتير ومطالبات' : 'Statements'}`}
                                </span>
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

            {/* ── SECTION 2: TRANSACTIONS / LEDGER ── */}
            {(activeTab === 'transactions' || activeTab === 'all_sections') && (
                <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                    <div className="card-body p-5 space-y-4">
                        {activeTab === 'all_sections' && (
                            <div className="flex items-center justify-between pb-3 border-b border-base-200">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                                    </div>
                                    <div>
                                        <h2 className="text-sm sm:text-base font-black text-base-content">
                                            {lang === 'ar' ? '٢. دفتر الأستاذ العام وقيود اليومية' : '2. Ledger Transactions & Journal Entries'}
                                        </h2>
                                        <p className="text-[11px] text-base-content/60">
                                            {lang === 'ar' ? 'سجل قيود اليومية المحاسبية المعتمدة بنظام القيد المزدوج' : 'Audited double-entry journal entries and chronological financial audit trail'}
                                        </p>
                                    </div>
                                </div>
                                <span className="badge badge-sm badge-outline font-mono font-bold">
                                    {pagination.total} {lang === 'ar' ? 'قيد' : 'Entries'}
                                </span>
                            </div>
                        )}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h3 className="card-title text-base font-bold text-base-content">
                                    {t('fin_tab_transactions', 'Ledger Transactions')}: {currentOrgName}
                                </h3>
                                <p className="text-xs text-base-content/60">
                                    {lang === 'ar' ? 'سجل قيود اليومية المحاسبية المعتمدة لهذا الحساب بنظام القيد المزدوج.' : 'Audited double-entry journal entries for this account.'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs text-base-content/70">
                                    <span>{lang === 'ar' ? 'عرض:' : 'Show:'}</span>
                                    <select
                                        value={pagination.limit}
                                        onChange={(e) => setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
                                        className="select select-xs select-bordered font-bold text-xs"
                                    >
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                        <option value={1000}>{lang === 'ar' ? 'الكل (١٠٠٠)' : 'All (1,000)'}</option>
                                    </select>
                                </div>
                                <ExportButton data={ledger} filename={`Ledger_${currentOrgName}`} />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="table table-zebra w-full text-xs">
                                <thead>
                                    <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                        <th>{t('fin_th_date', 'Date')}</th>
                                        {selectedOrgId === 'all' && <th>{lang === 'ar' ? 'المنظمة / العميل' : 'Organization'}</th>}
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
                                            <td colSpan={selectedOrgId === 'all' ? 8 : 7} className="py-16 text-center text-base-content/50">
                                                <span className="loading loading-spinner loading-md text-primary"></span>
                                            </td>
                                        </tr>
                                    ) : ledger.length > 0 ? (
                                        ledger.map((entry) => (
                                            <tr key={entry.id} className="hover">
                                                <td className="font-mono text-xs">{format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                                                {selectedOrgId === 'all' && (
                                                    <td>
                                                        <span className="badge badge-sm badge-outline font-semibold text-[11px]">
                                                            {entry.organization?.name || (lang === 'ar' ? 'شاحن فردي' : 'Solo Shipper')}
                                                        </span>
                                                    </td>
                                                )}
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
                                            <td colSpan={selectedOrgId === 'all' ? 8 : 7} className="py-12 text-center text-base-content/50">
                                                {t('fin_no_transactions', 'No ledger transactions recorded')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Ledger Pagination Controls */}
                        <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-base-200 text-xs text-base-content/70">
                            <div>
                                {lang === 'ar'
                                    ? `عرض ${ledger.length} من إجمالي ${pagination.total} قيد`
                                    : `Showing ${ledger.length} of ${pagination.total} entries`}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={pagination.page <= 1 || loading}
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                    className="btn btn-xs btn-ghost border border-base-200"
                                >
                                    {lang === 'ar' ? 'السابق' : 'Prev'}
                                </button>
                                <span className="font-mono px-2">
                                    {pagination.page} / {Math.max(1, pagination.pages || Math.ceil((pagination.total || 0) / (pagination.limit || 50)))}
                                </span>
                                <button
                                    type="button"
                                    disabled={pagination.page >= (pagination.pages || Math.ceil((pagination.total || 0) / (pagination.limit || 50))) || loading}
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                    className="btn btn-xs btn-ghost border border-base-200"
                                >
                                    {lang === 'ar' ? 'التالي' : 'Next'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SECTION 3: ALLOCATIONS & PAYMENTS ── */}
            {(activeTab === 'allocations' || activeTab === 'all_sections') && (
                <div className="space-y-6">
                    {activeTab === 'all_sections' && (
                        <div className="flex items-center justify-between p-3.5 bg-base-100 rounded-2xl border border-base-200 shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-success/10 text-success flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-black text-base-content">
                                        {lang === 'ar' ? '٣. تسوية الدفعات وتخصيص الشحنات' : '3. Payment Allocations & Settlement'}
                                    </h2>
                                    <p className="text-[11px] text-base-content/60">
                                        {lang === 'ar' ? 'مطابقة السندات النقدية مع بوالص الشحن والتسوية التلقائية FIFO' : 'Match unapplied credits with unpaid consignments and auto-FIFO clearing'}
                                    </p>
                                </div>
                            </div>
                            <span className="badge badge-sm badge-success text-white font-mono font-bold">
                                {payments.length} {lang === 'ar' ? 'دفعات جاهزة' : 'Payments'}
                            </span>
                        </div>
                    )}
                    {can('MANAGE_PAYMENTS') && (
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-5">
                            <h3 className="card-title text-base font-bold text-base-content mb-3">
                                {lang === 'ar' ? 'تسجيل دفعة مستلمة' : 'Post Received Payment'}: {currentOrgName}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                                {selectedOrgId === 'all' && (
                                    <div>
                                        <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                            {lang === 'ar' ? 'المنظمة / العميل' : 'Organization'}
                                        </label>
                                        <select
                                            value={paymentForm.targetOrgId || (organizations[0]?.id || '')}
                                            onChange={(e) => setPaymentForm({ ...paymentForm, targetOrgId: e.target.value })}
                                            className="select select-sm select-bordered w-full text-xs font-semibold"
                                        >
                                            {organizations.map(org => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
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
                                                    <div className="font-bold text-xs text-base-content flex items-center gap-1.5 flex-wrap">
                                                        <span>{p.reference || (lang === 'ar' ? `دفعة #${p.id.slice(-6)}` : `Payment #${p.id.slice(-6)}`)}</span>
                                                        {selectedOrgId === 'all' && (
                                                            <span className="badge badge-xs badge-outline font-sans text-[10px]">
                                                                {p.organization?.name || (lang === 'ar' ? 'شاحن فردي' : 'Solo Shipper')}
                                                            </span>
                                                        )}
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

                            <div className="p-3 bg-base-200/30 border-b border-base-200 flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
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
                                <div className="flex items-center gap-1.5 text-xs text-base-content/70">
                                    <span>{lang === 'ar' ? 'عرض:' : 'Show:'}</span>
                                    <select
                                        value={shipmentPagination.limit}
                                        onChange={(e) => setShipmentPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
                                        className="select select-xs select-bordered font-bold text-xs"
                                    >
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                        <option value={1000}>{lang === 'ar' ? 'الكل (١٠٠٠)' : 'All (1,000)'}</option>
                                    </select>
                                </div>
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
                                                        <div className="font-mono font-bold text-xs text-base-content flex items-center gap-1.5 flex-wrap">
                                                            <span>{s.trackingNumber}</span>
                                                            {selectedOrgId === 'all' && s.organization?.name && (
                                                                <span className="badge badge-xs badge-outline font-sans text-[10px]">
                                                                    {s.organization.name}
                                                                </span>
                                                            )}
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

                            {/* Shipments Pagination Footer */}
                            <div className="p-2.5 bg-base-200/50 border-t border-base-200 flex items-center justify-between text-xs text-base-content/70">
                                <div>
                                    {lang === 'ar'
                                        ? `عرض ${shipments.length} من إجمالي ${shipmentPagination.total}`
                                        : `Showing ${shipments.length} of ${shipmentPagination.total}`}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        disabled={shipmentPagination.page <= 1 || shipmentsLoading}
                                        onClick={() => setShipmentPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                        className="btn btn-xs btn-ghost border border-base-200"
                                    >
                                        ‹
                                    </button>
                                    <span className="font-mono text-[11px] px-1">
                                        {shipmentPagination.page} / {Math.max(1, shipmentPagination.pages || Math.ceil((shipmentPagination.total || 0) / (shipmentPagination.limit || 50)))}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={shipmentPagination.page >= Math.max(1, shipmentPagination.pages || Math.ceil((shipmentPagination.total || 0) / (shipmentPagination.limit || 50))) || shipmentsLoading}
                                        onClick={() => setShipmentPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                        className="btn btn-xs btn-ghost border border-base-200"
                                    >
                                        ›
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SECTION 4: INVOICES & BILLING ── */}
            {(activeTab === 'invoices' || activeTab === 'all_sections') && can('VIEW_INVOICES') && (
                <div className="space-y-6">
                    {activeTab === 'all_sections' && (
                        <div className="flex items-center justify-between p-3.5 bg-base-100 rounded-2xl border border-base-200 shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">description</span>
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-black text-base-content">
                                        {lang === 'ar' ? '٤. الفواتير والمطالبات المالية' : '4. Invoices & Billing Statements'}
                                    </h2>
                                    <p className="text-[11px] text-base-content/60">
                                        {lang === 'ar' ? 'إصدار الفواتير الدورية، تصدير ملفات PDF، والمطابقة' : 'Periodic invoice generation, PDF exports, and customer statements'}
                                    </p>
                                </div>
                            </div>
                            <span className="badge badge-sm badge-outline font-mono font-bold">
                                {invoices.length} {lang === 'ar' ? 'فواتير' : 'Invoices'}
                            </span>
                        </div>
                    )}
                    {can('MANAGE_PAYMENTS') && (
                        <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-5">
                            <h3 className="card-title text-base font-bold text-base-content mb-3">
                                {lang === 'ar' ? 'إصدار فاتورة / مطالبة مالية' : 'Generate Statement / Invoice'}: {currentOrgName}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                                {selectedOrgId === 'all' && (
                                    <div>
                                        <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                            {lang === 'ar' ? 'المنظمة / العميل' : 'Organization'}
                                        </label>
                                        <select
                                            value={invoiceForm.targetOrgId || (organizations[0]?.id || '')}
                                            onChange={(e) => setInvoiceForm({ ...invoiceForm, targetOrgId: e.target.value })}
                                            className="select select-sm select-bordered w-full text-xs font-semibold"
                                        >
                                            {organizations.map(org => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
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
                                            {selectedOrgId === 'all' && <th>{lang === 'ar' ? 'المنظمة / العميل' : 'Organization'}</th>}
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
                                                    {selectedOrgId === 'all' && (
                                                        <td>
                                                            <span className="badge badge-sm badge-outline font-semibold text-[11px]">
                                                                {inv.organization?.name || (lang === 'ar' ? 'شاحن فردي' : 'Solo Shipper')}
                                                            </span>
                                                        </td>
                                                    )}
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
                                                <td colSpan={selectedOrgId === 'all' ? 8 : 7} className="py-12 text-center text-base-content/50">
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

            {/* ── SECTION 5: DRIVER COD & VAULT CLEARING ── */}
            {(activeTab === 'cod' || activeTab === 'all_sections') && can('VIEW_FINANCE') && (
                <div className="space-y-6">
                    {activeTab === 'all_sections' && (
                        <div className="flex items-center justify-between p-3.5 bg-base-100 rounded-2xl border border-base-200 shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">payments</span>
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-black text-base-content">
                                        {lang === 'ar' ? '٥. نقدية السائقين وخزينة التحصيل (COD)' : '5. Driver Cash & COD Vault Clearing'}
                                    </h2>
                                    <p className="text-[11px] text-base-content/60">
                                        {lang === 'ar' ? 'متابعة العهد النقدية طرف المناديب وتوريد الخزينة' : 'Physical cash monitoring with drivers and hub vault clearance'}
                                    </p>
                                </div>
                            </div>
                            <span className="badge badge-sm badge-success text-white font-mono font-bold">
                                {fmtAmount(codSummary.unremittedTotalsByCurrency?.['KWD'] || 0)} KWD
                            </span>
                        </div>
                    )}
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
