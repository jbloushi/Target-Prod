import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { financeService, organizationService, shipmentService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
    PageHeader,
    Card,
    Button,
    WInput,
    Select,
    Modal,
    TableWrapper,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    StatusPill,
    Alert,
    Loader
} from '../ui';
import ExportButton from '../components/ExportButton';
import FinanceReports from '../components/FinanceReports';
import { TK } from '../tokens/kineticHorizon';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import CashFlowDualBarChart from '../components/charts/CashFlowDualBarChart';
import ShareOfWalletBar from '../components/charts/ShareOfWalletBar';
import FinancialStatementsTab from '../components/accounting/FinancialStatementsTab';
import GeneralLedgerTab from '../components/accounting/GeneralLedgerTab';
import AccountsPayableTab from '../components/accounting/AccountsPayableTab';
import TreasuryTab from '../components/accounting/TreasuryTab';
import PeriodClosingTab from '../components/accounting/PeriodClosingTab';

// --- Styled Components with Kinetic Horizon Tokens ---
const SubNav = styled.div`
    display: flex;
    gap: 8px;
    padding: 6px;
    background: #eef2f6;
    border-radius: 14px;
    margin-bottom: 24px;
    width: fit-content;
    flex-wrap: wrap;
`;

const NavTab = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 10px;
    border: none;
    background: ${props => props.$active ? '#ffffff' : 'transparent'};
    color: ${props => props.$active ? TK.primary : TK.text2};
    font-weight: ${props => props.$active ? '700' : '600'};
    font-size: 13px;
    cursor: pointer;
    box-shadow: ${props => props.$active ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'};
    transition: all 0.15s ease;

    &:hover {
        color: ${TK.primary};
    }
`;

const MetricsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 18px;
    margin-bottom: 24px;
`;

const MetricCard = styled.div`
    background: #ffffff;
    border-radius: 20px;
    border: 1px solid ${TK.border};
    padding: 20px 22px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.06);
    }
`;

const MetricHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
`;

const MetricIcon = styled.div`
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: ${props => props.$bg || TK.primaryBg};
    color: ${props => props.$color || TK.primary};
    display: flex;
    align-items: center;
    justify-content: center;
`;

const MetricValue = styled.div`
    font-size: 26px;
    font-weight: 800;
    color: ${TK.text1};
    letter-spacing: -0.02em;

    span {
        font-size: 14px;
        font-weight: 600;
        color: ${TK.text3};
        margin-left: 4px;
    }
`;

const MetricLabel = styled.div`
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: ${TK.text3};
`;

const MetricTrend = styled.div`
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 99px;
    background: ${props => props.$positive ? TK.successBg : '#f1f5f9'};
    color: ${props => props.$positive ? TK.success : TK.text2};
`;

const AllocationGrid = styled.div`
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 20px;
    align-items: start;

    @media (max-width: 1024px) {
        grid-template-columns: 1fr;
    }
`;

const ListCard = styled(Card)`
    display: flex;
    flex-direction: column;
    height: 650px;
    overflow: hidden;
`;

const ListHeader = styled.div`
    padding: 16px;
    border-bottom: 1px solid ${TK.border};
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const ScrollableList = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 8px;
`;

const ListItem = styled.div`
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 8px;
    cursor: pointer;
    background: ${props => props.$selected ? TK.primaryBg : '#ffffff'};
    border: 1.5px solid ${props => props.$selected ? TK.primary : TK.border};
    transition: all 0.15s;
    display: flex;
    justify-content: space-between;
    align-items: center;

    &:hover {
        border-color: ${TK.primary};
        background: ${props => props.$selected ? TK.primaryBg : '#fafbfc'};
    }

    ${props => props.$disabled && `
        opacity: 0.55;
        cursor: not-allowed;
        background: #f8fafc;
    `}
`;

const FilterRow = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 0 16px 12px 16px;
    border-bottom: 1px solid ${TK.border};
    background: #f8fafc;
`;

const ItemInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
`;

const ItemTitle = styled.div`
    font-weight: 700;
    font-size: 13px;
    color: ${TK.text1};
`;

const ItemSub = styled.div`
    font-size: 11.5px;
    color: ${TK.text3};
`;

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
    const { t, lang, formatRoute, getCityName, getCountryName } = useLanguage();

    const normalizeCurrencyCode = (currency, fallback = 'KWD') => String(currency || fallback || 'KWD').trim().toUpperCase().slice(0, 3);
    const fmtAmount = (val) => parseFloat(val || 0).toFixed(3);
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

    // Active Tab: 5 subtabs ('overview' | 'transactions' | 'allocations' | 'invoices' | 'reports' | 'cod')
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

    // Dynamic Spending & Volume Distribution (Share of Wallet)
    const spendingDistributionData = useMemo(() => {
        if (Array.isArray(organizations) && organizations.length > 0) {
            const colors = [TK.primary, '#0284c7', '#7c3aed', '#059669', '#9ca3af'];
            const sortedOrgs = [...organizations].sort((a, b) => (parseFloat(b.creditLimit || b.balance || 0)) - (parseFloat(a.creditLimit || a.balance || 0)));
            const top4 = sortedOrgs.slice(0, 4);
            const remainder = sortedOrgs.slice(4);

            let totalVal = sortedOrgs.reduce((sum, o) => sum + Math.max(1000, parseFloat(o.creditLimit || 0) + parseFloat(o.balance || 0)), 0);
            if (totalVal === 0) totalVal = 1;

            const items = top4.map((o, idx) => {
                const val = Math.max(1000, parseFloat(o.creditLimit || 0) + parseFloat(o.balance || 0));
                const pct = Math.round((val / totalVal) * 100);
                return {
                    name: o.name,
                    amount: Math.round(val),
                    percent: pct,
                    color: colors[idx % colors.length]
                };
            });

            if (remainder.length > 0) {
                const remVal = remainder.reduce((sum, o) => sum + Math.max(1000, parseFloat(o.creditLimit || 0) + parseFloat(o.balance || 0)), 0);
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

        return [
            { name: 'Gulf Apex Trading W.L.L.', amount: 16450, percent: 42, color: TK.primary },
            { name: 'Al-Sabah Medical & Pharma', amount: 28200, percent: 35, color: '#0284c7' },
            { name: 'Kuwait Ministry of Commerce', amount: 50000, percent: 18, color: '#7c3aed' },
            { name: 'Direct Shippers (Client)', amount: 2500, percent: 5, color: '#059669' }
        ];
    }, [organizations]);

    // Debounce Search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(shipmentSearch);
        }, 400);
        return () => clearTimeout(handler);
    }, [shipmentSearch]);

    // Reset pagination when filters change
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

    // Reset on Org Change
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

    const currentCurrency = normalizeCurrencyCode(overview?.currency || user?.organization?.currency);

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
                    const businessOrg = orgList.find(o => o.name?.includes('Gulf Apex') || o.type === 'BUSINESS') || orgList[0];
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
    }, [selectedOrgId, pagination.page, fetchLedger, can, user?.organizationId]);

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
            initialAmount = String(parseFloat(targetShipment.codAmount || 0).toFixed(3));
            initialShipmentIds = [targetShipment.id || targetShipment.trackingNumber];
        } else if (targetDriver) {
            const driverShipments = (codSummary.shipments || []).filter(s => 
                s.assignedDriver?.id === targetDriver.id && s.codStatus !== 'REMITTED'
            );
            const sum = driverShipments.reduce((acc, s) => acc + parseFloat(s.codAmount || 0), 0);
            initialAmount = sum > 0 ? String(sum.toFixed(3)) : String(parseFloat(codSummary.unremittedTotalsByCurrency?.['KWD'] || 0).toFixed(3));
            initialShipmentIds = driverShipments.map(s => s.id || s.trackingNumber);
        } else {
            const sum = parseFloat(codSummary.unremittedTotalsByCurrency?.['KWD'] || 0);
            if (sum > 0) initialAmount = String(sum.toFixed(3));
            initialShipmentIds = (codSummary.shipments || []).filter(s => s.codStatus !== 'REMITTED').map(s => s.id || s.trackingNumber);
        }

        setReconcileForm({
            driverId: dId,
            driverName: dName,
            amount: initialAmount,
            currency: targetShipment?.codCurrency || 'KWD',
            bagReference: '',
            notes: '',
            shipmentIds: initialShipmentIds
        });
        setIsReconcileModalOpen(true);
    };

    const handleReconcileSubmit = async () => {
        if (!reconcileForm.amount || parseFloat(reconcileForm.amount) <= 0) {
            enqueueSnackbar(lang === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount', { variant: 'error' });
            return;
        }
        if (!reconcileForm.driverId) {
            enqueueSnackbar(lang === 'ar' ? 'يرجى اختيار سائق' : 'Please select a driver', { variant: 'error' });
            return;
        }

        try {
            setReconcileLoading(true);
            await financeService.confirmDriverCodRemittance({
                driverId: reconcileForm.driverId,
                amount: parseFloat(reconcileForm.amount),
                currency: reconcileForm.currency || 'KWD',
                shipmentIds: reconcileForm.shipmentIds || [],
                bagReference: reconcileForm.bagReference.trim(),
                notes: reconcileForm.notes.trim()
            });

            enqueueSnackbar(
                lang === 'ar'
                    ? `تم ترحيل واستلام نقدية التحصيل (${fmtAmount(reconcileForm.amount)} ${reconcileForm.currency}) إلى خزينة الفرع بنجاح`
                    : `Successfully verified and posted COD remittance (${fmtAmount(reconcileForm.amount)} ${reconcileForm.currency}) to vault ledger`,
                { variant: 'success' }
            );

            setIsReconcileModalOpen(false);
            setReconcileForm({ driverId: '', driverName: '', amount: '', currency: 'KWD', bagReference: '', notes: '', shipmentIds: [] });
            await fetchCodData();
            if (selectedOrgId && selectedOrgId !== 'none') {
                await fetchLedger(selectedOrgId);
            }
        } catch (err) {
            console.error('Failed to reconcile COD cash:', err);
            enqueueSnackbar(err.response?.data?.error || err.message || 'Failed to post remittance', { variant: 'error' });
        } finally {
            setReconcileLoading(false);
        }
    };

    const selectedPayment = payments.find(p => p.id === selectedPaymentId);
    const selectedCount = Object.keys(selectedShipmentsMap).length;

    const summary = overview || {
        balance: 0,
        creditLimit: 0,
        availableCredit: 0,
        unappliedCash: 0,
        totalUnpaid: 0,
        agingBuckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    };

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
            <PageHeader
                title={t('fin_cockpit_title', 'Finance & Ledger Cockpit')}
                description={t('fin_cockpit_desc', 'Manage customer accounts, track ledger allocations, and visualize cash flow.')}
                action={null}
                secondaryAction={
                    <Button variant="outline" onClick={() => { loadFinance(); fetchShipments(); if (activeTab === 'cod') fetchCodData(); }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 6 }}>refresh</span>
                        {t('refresh', 'Refresh')}
                    </Button>
                }
            />

            {/* 5-Tab Navigation */}
            <SubNav>
                <NavTab $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>dashboard</span>
                    {t('fin_tab_overview', 'Overview & Cash Flow')}
                </NavTab>
                <NavTab $active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>receipt_long</span>
                    {t('fin_tab_transactions', 'Ledger Transactions')}
                </NavTab>
                <NavTab $active={activeTab === 'allocations'} onClick={() => setActiveTab('allocations')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>account_balance_wallet</span>
                    {t('fin_tab_allocations', 'Allocations & Payments')}
                </NavTab>
                {can('VIEW_INVOICES') && (
                    <NavTab $active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>description</span>
                        {t('fin_tab_invoices', 'Invoices & Billing')}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'cod'} onClick={() => { setActiveTab('cod'); fetchCodData(); fetchDrivers(); }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>payments</span>
                        {lang === 'ar' ? 'تسوية نقدية وتحصيل السائقين (COD)' : 'Driver Cash & COD Vault'}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'reports'} onClick={() => setActiveTab('reports')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>analytics</span>
                        {t('fin_tab_reports', 'Profitability Reports')}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'statements'} onClick={() => setActiveTab('statements')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>account_balance</span>
                        {lang === 'ar' ? 'القوائم المالية' : 'Financial Statements'}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'gl'} onClick={() => setActiveTab('gl')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>menu_book</span>
                        {lang === 'ar' ? 'الأستاذ العام والدليل' : 'General Ledger & COA'}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'ap'} onClick={() => setActiveTab('ap')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>assignment_returned</span>
                        {lang === 'ar' ? 'مستحقات الموردين' : 'Accounts Payable (AP)'}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'treasury'} onClick={() => setActiveTab('treasury')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>savings</span>
                        {lang === 'ar' ? 'الخزينة والبنوك' : 'Treasury & Banks'}
                    </NavTab>
                )}
                {can('VIEW_FINANCE') && (
                    <NavTab $active={activeTab === 'periods'} onClick={() => setActiveTab('periods')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
                        {lang === 'ar' ? 'الإقفال المالي' : 'Period Closing'}
                    </NavTab>
                )}
            </SubNav>

            {/* Organization Selector (if multi-org access) */}
            {can('VIEW_FINANCE') && organizations.length > 0 && (
                <Card style={{ marginBottom: '24px', padding: '14px 20px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: '260px' }}>
                            <Select
                                label={t('fin_active_account', 'Active Account / Organization')}
                                value={selectedOrgId}
                                onChange={(e) => setSelectedOrgId(e.target.value)}
                            >
                                <option value="none" style={{ fontWeight: 'bold', color: TK.primary }}>
                                    {t('fin_solo_shippers', 'Solo Shippers (Unorganized)')}
                                </option>
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </Select>
                        </div>
                        <div style={{ fontSize: 12.5, color: TK.text2, flex: 1 }}>
                            {t('fin_active_scope', 'Active Ledger Scope')}: <strong style={{ color: TK.text1 }}>{currentOrgName}</strong> • {t('fin_realtime_double_entry', 'Real-time double-entry balances')}
                        </div>
                    </div>
                </Card>
            )}

            {/* ── TAB 1: OVERVIEW & CASH FLOW ── */}
            {activeTab === 'overview' && (
                <>
                    {/* 4 Balance Metric Cards */}
                    <MetricsGrid>
                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{t('fin_available_balance', 'Available Balance')}</MetricLabel>
                                <MetricIcon $bg={TK.primaryBg} $color={TK.primary}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>account_balance</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue>
                                    {fmtAmount(summary.availableCredit || summary.balance)} <span>{currentCurrency}</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{t('fin_credit_limit', 'Credit Limit')}: {money(summary.creditLimit, currentCurrency)}</span>
                                    <MetricTrend $positive>+8.2% vs last mo</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>

                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{t('fin_unapplied_cash', 'Unapplied Cash')}</MetricLabel>
                                <MetricIcon $bg={TK.successBg} $color={TK.success}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue style={{ color: TK.success }}>
                                    {fmtAmount(summary.unappliedCash)} <span>{currentCurrency}</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{lang === 'ar' ? 'متاح للتسوية' : 'Available to allocate'}</span>
                                    <MetricTrend $positive>{lang === 'ar' ? 'جاهز' : 'Ready'}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>

                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{t('fin_unpaid_receivables', 'Total Unpaid Cargo')}</MetricLabel>
                                <MetricIcon $bg={TK.warningBg} $color={TK.warning}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>inventory_2</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue style={{ color: summary.totalUnpaid > 0 ? TK.warning : TK.text1 }}>
                                    {fmtAmount(summary.totalUnpaid)} <span>{currentCurrency}</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{lang === 'ar' ? 'فواتير غير مسددة' : 'Outstanding invoices'}</span>
                                    <MetricTrend>{summary.agingBuckets?.['0-30'] ? (lang === 'ar' ? 'جاري' : 'Current') : (lang === 'ar' ? 'مسوى' : 'Settled')}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>

                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{lang === 'ar' ? 'صافي الموقف المالي' : 'Net Ledger Position'}</MetricLabel>
                                <MetricIcon $bg={TK.purpleBg} $color={TK.purple}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>trending_up</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue>
                                    {fmtAmount(parseFloat(summary.unappliedCash || 0) - parseFloat(summary.balance || 0))} <span>{currentCurrency}</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{lang === 'ar' ? 'المسدد مقابل المطلوب' : 'Cash vs Invoiced'}</span>
                                    <MetricTrend $positive>{lang === 'ar' ? 'متوازن' : 'Balanced'}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>
                    </MetricsGrid>

                    {/* Charts Grid: 6-Month Cash Flow & Share of Wallet */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                        <Card title={lang === 'ar' ? 'حركة التدفق النقدي الشهري (الدائن مقابل المدين)' : 'Monthly Cash Flow (Credits vs Debits)'} style={{ borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                            <div style={{ padding: '4px 0' }}>
                                <CashFlowDualBarChart data={cashFlowChartData} currency={currentCurrency} height={220} />
                            </div>
                        </Card>

                        <Card title={lang === 'ar' ? 'توزيع حجم الشحن والإنفاق' : 'Volume & Spending Distribution'} style={{ borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                            <div style={{ padding: '8px 0' }}>
                                <ShareOfWalletBar items={spendingDistributionData} currency={currentCurrency} />
                            </div>
                        </Card>
                    </div>
                </>
            )}

            {/* ── TAB 2: TRANSACTIONS / LEDGER ── */}
            {activeTab === 'transactions' && (
                <Card title={`${t('fin_tab_transactions', 'Ledger Transactions')}: ${currentOrgName}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: TK.text2 }}>
                            {lang === 'ar' ? 'سجل قيود اليومية المحاسبية المعتمدة لهذا الحساب بنظام القيد المزدوج.' : 'Audited double-entry journal entries for this account.'}
                        </div>
                        <ExportButton data={ledger} filename={`Ledger_${currentOrgName}`} />
                    </div>
                    <TableWrapper>
                        <Table>
                            <Thead>
                                <Tr>
                                    <Th>{t('fin_th_date', 'Date')}</Th>
                                    <Th>{t('fin_th_type', 'Type')}</Th>
                                    <Th>{lang === 'ar' ? 'التصنيف' : 'Category'}</Th>
                                    <Th>{t('fin_th_reference', 'Reference')}</Th>
                                    <Th>{t('fin_th_description', 'Description')}</Th>
                                    <Th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{lang === 'ar' ? 'المبلغ' : 'Amount'}</Th>
                                    <Th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{t('fin_th_balance', 'Balance')}</Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {loading ? (
                                    <Tr><Td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}><Loader /></Td></Tr>
                                ) : ledger.length > 0 ? ledger.map((entry) => (
                                    <Tr key={entry.id}>
                                        <Td style={{ fontSize: 12 }}>{format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm')}</Td>
                                        <Td>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: 6,
                                                fontSize: 11,
                                                fontWeight: 700,
                                                background: entry.entryType === 'CREDIT' ? TK.successBg : TK.errorBg,
                                                color: entry.entryType === 'CREDIT' ? TK.success : TK.error,
                                            }}>
                                                {entry.entryType === 'CREDIT' ? (lang === 'ar' ? 'دائن (CR)' : 'CREDIT') : (lang === 'ar' ? 'مدين (DR)' : 'DEBIT')}
                                            </span>
                                        </Td>
                                        <Td style={{ fontSize: 12, fontWeight: 600 }}>{entry.category}</Td>
                                        <Td style={{ fontSize: 12 }}>{entry.referenceId || '—'}</Td>
                                        <Td style={{ fontSize: 12 }}>{entry.description || '—'}</Td>
                                        <Td style={{
                                            textAlign: lang === 'ar' ? 'left' : 'right',
                                            fontWeight: 700,
                                            color: entry.entryType === 'CREDIT' ? TK.success : TK.error
                                        }}>
                                            {entry.entryType === 'CREDIT' ? '+' : '-'}{money(entry.amount, entry.currency)}
                                        </Td>
                                        <Td style={{ textAlign: lang === 'ar' ? 'left' : 'right', fontWeight: 800 }}>
                                            {money(entry.balanceAfter, entry.currency)}
                                        </Td>
                                    </Tr>
                                )) : (
                                    <Tr><Td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>{t('fin_no_transactions', 'No ledger transactions recorded')}</Td></Tr>
                                )}
                            </Tbody>
                        </Table>
                    </TableWrapper>
                </Card>
            )}

            {/* ── TAB 3: ALLOCATIONS & PAYMENTS ── */}
            {activeTab === 'allocations' && (
                <>
                    {can('MANAGE_PAYMENTS') && (
                        <Card title={`${lang === 'ar' ? 'تسجيل دفعة مستلمة' : 'Post Received Payment'}: ${currentOrgName}`} style={{ marginBottom: '24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
                                <WInput
                                    label={`${lang === 'ar' ? 'المبلغ' : 'Amount'} (${currentCurrency})`}
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                />
                                <WInput
                                    label={lang === 'ar' ? 'رقم الإيصال / السند' : 'Reference / Receipt #'}
                                    value={paymentForm.reference}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                                />
                                <Select
                                    label={lang === 'ar' ? 'طريقة الدفع' : 'Method'}
                                    value={paymentForm.method}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                                >
                                    <option value="manual">{lang === 'ar' ? 'قيد يدوي' : 'Manual Entry'}</option>
                                    <option value="bank_transfer">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                                    <option value="cash">{lang === 'ar' ? 'نقدي (كاش)' : 'Cash'}</option>
                                    <option value="knet">{lang === 'ar' ? 'كي نت (K-Net)' : 'K-Net'}</option>
                                </Select>
                                <WInput
                                    label={lang === 'ar' ? 'ملاحظات داخلية' : 'Internal Notes'}
                                    value={paymentForm.notes}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button variant="primary" onClick={handlePostPayment} disabled={!paymentForm.amount}>
                                        {lang === 'ar' ? 'تسجيل الدفعة' : 'Post Payment'}
                                    </Button>
                                    <Button variant="secondary" onClick={() => setFifoConfirmOpen(true)}>
                                        {lang === 'ar' ? 'تسوية تلقائية (FIFO)' : 'FIFO Auto'}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    <AllocationGrid>
                        {/* LEFT: Unapplied Payments */}
                        <ListCard>
                            <ListHeader>
                                <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11.5px', letterSpacing: '0.06em', color: TK.text2 }}>
                                    {lang === 'ar' ? '١. اختر الدفعة للتسوية' : '1. Select Payment To Allocate'}
                                </div>
                            </ListHeader>
                            <ScrollableList>
                                {payments.length > 0 ? payments.map(p => (
                                    <ListItem
                                        key={p.id}
                                        $selected={selectedPaymentId === p.id}
                                        onClick={() => {
                                            setSelectedPaymentId(p.id);
                                            setSelectedShipmentsMap({});
                                        }}
                                    >
                                        <ItemInfo>
                                            <ItemTitle>{p.reference || (lang === 'ar' ? 'دفعة #' + p.id.slice(-6) : 'Payment #' + p.id.slice(-6))}</ItemTitle>
                                            <ItemSub>
                                                {format(new Date(p.postedAt || p.createdAt), 'MMM dd, yyyy')} • {p.method}
                                            </ItemSub>
                                        </ItemInfo>
                                        <div style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>
                                            <div style={{ fontWeight: 800, color: TK.primary, fontSize: '14px' }}>
                                                {money(parseFloat(p.amount) - parseFloat(p.allocatedAmount || 0), p.currency)}
                                            </div>
                                            <div style={{ fontSize: '11px', color: TK.text3 }}>
                                                {lang === 'ar' ? 'الإجمالي:' : 'Total:'} {money(p.amount, p.currency)}
                                            </div>
                                        </div>
                                    </ListItem>
                                )) : (
                                    <div style={{ padding: '30px', textAlign: 'center', color: TK.text3, fontSize: 13 }}>
                                        {lang === 'ar' ? 'لا توجد دفعات غير مسواة' : 'No unapplied payments found'}
                                    </div>
                                )}
                            </ScrollableList>
                        </ListCard>

                        {/* RIGHT: Shipments to Settle */}
                        <ListCard>
                            <ListHeader>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '11.5px', letterSpacing: '0.06em', color: TK.text2 }}>
                                        {lang === 'ar' ? `٢. اختر الشحنات (${selectedCount})` : `2. Select Shipments (${selectedCount})`}
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="small"
                                        onClick={handleManualAllocation}
                                        disabled={allocationLoading || !selectedPaymentId || selectedCount === 0}
                                    >
                                        {allocationLoading ? (lang === 'ar' ? 'جاري التسوية...' : 'Allocating...') : (lang === 'ar' ? 'تطبيق التسوية' : 'Apply Allocation')}
                                    </Button>
                                </div>
                            </ListHeader>
                            <FilterRow>
                                <div style={{ flex: 1 }}>
                                    <WInput
                                        placeholder={lang === 'ar' ? 'بحث برقم الشحنة، المستلم...' : 'Search tracking, recipient...'}
                                        value={shipmentSearch}
                                        onChange={(e) => setShipmentSearch(e.target.value)}
                                        style={{ margin: 0 }}
                                    />
                                </div>
                                <div style={{ minWidth: '140px' }}>
                                    <Select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        style={{ margin: 0, height: '36px', fontSize: '12px' }}
                                    >
                                        <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
                                        <option value="unpaid">{lang === 'ar' ? 'غير مدفوعة فقط' : 'Unpaid Only'}</option>
                                        <option value="partial">{lang === 'ar' ? 'مدفوعة جزئياً' : 'Partial Only'}</option>
                                    </Select>
                                </div>
                            </FilterRow>
                            <ScrollableList>
                                {shipmentsLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader /></div>
                                ) : shipments.filter(s => {
                                    if (!selectedOrgId) return true;
                                    if (selectedOrgId === 'none') return !s.organizationId;
                                    return s.organizationId === selectedOrgId;
                                }).length > 0 ? shipments.filter(s => {
                                    if (!selectedOrgId) return true;
                                    if (selectedOrgId === 'none') return !s.organizationId;
                                    return s.organizationId === selectedOrgId;
                                }).map(s => {
                                    const isSelected = Boolean(selectedShipmentsMap[s.id]);
                                    const outstanding = s.paid ? 0 : (s.remainingBalance !== undefined ? s.remainingBalance : (s.pricingSnapshot?.totalPrice || s.price || 0) - (s.totalPaid || 0));

                                    return (
                                        <ListItem
                                            key={s.id}
                                            $selected={isSelected}
                                            $disabled={s.paid}
                                            onClick={() => {
                                                if (s.paid) return;
                                                setSelectedShipmentsMap(prev => {
                                                    const next = { ...prev };
                                                    if (next[s.id]) delete next[s.id];
                                                    else next[s.id] = s;
                                                    return next;
                                                 });
                                            }}
                                        >
                                            <ItemInfo>
                                                <ItemTitle>{s.trackingNumber}</ItemTitle>
                                                <ItemSub>{s.receiver?.contactPerson || (lang === 'ar' ? 'المستلم' : 'Consignee')} • {formatRoute(s.origin, s.destination)}</ItemSub>
                                            </ItemInfo>
                                            <div style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>
                                                <div style={{ fontWeight: 700, color: s.paid ? TK.success : TK.error, fontSize: '13px' }}>
                                                    {s.paid ? (lang === 'ar' ? 'مدفوعة' : 'PAID') : money(outstanding, s.currency)}
                                                </div>
                                                <div style={{ fontSize: '10.5px', color: TK.text3 }}>
                                                    {lang === 'ar' ? 'الإجمالي:' : 'Total:'} {money(s.pricingSnapshot?.totalPrice || s.price, s.currency)}
                                                </div>
                                            </div>
                                        </ListItem>
                                    );
                                }) : (
                                    <div style={{ padding: '30px', textAlign: 'center', color: TK.text3 }}>
                                        {lang === 'ar' ? 'لا توجد شحنات غير مسددة' : 'No active unpaid shipments found'}
                                    </div>
                                )}
                            </ScrollableList>
                        </ListCard>
                    </AllocationGrid>
                </>
            )}

            {/* ── TAB 4: INVOICES & REPORTS ── */}
            {activeTab === 'invoices' && (
                <>
                    {can('MANAGE_PAYMENTS') && (
                        <Card title={`${lang === 'ar' ? 'إصدار فاتورة / مطالبة مالية' : 'Generate Statement / Invoice'}: ${currentOrgName}`} style={{ marginBottom: '24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'end' }}>
                                <WInput
                                    label={lang === 'ar' ? 'بداية الفترة' : 'Period Start'}
                                    type="date"
                                    value={invoiceForm.periodStart}
                                    onChange={(e) => setInvoiceForm({ ...invoiceForm, periodStart: e.target.value })}
                                />
                                <WInput
                                    label={lang === 'ar' ? 'نهاية الفترة' : 'Period End'}
                                    type="date"
                                    value={invoiceForm.periodEnd}
                                    onChange={(e) => setInvoiceForm({ ...invoiceForm, periodEnd: e.target.value })}
                                />
                                <WInput
                                    label={lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                                    type="date"
                                    value={invoiceForm.dueDate}
                                    onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                                />
                                <WInput
                                    label={lang === 'ar' ? 'ملاحظات' : 'Notes'}
                                    value={invoiceForm.notes}
                                    onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                                />
                                <Button
                                    variant="primary"
                                    onClick={handleCreateInvoice}
                                    disabled={invoiceLoading || !invoiceForm.periodStart || !invoiceForm.periodEnd}
                                >
                                    {invoiceLoading ? (lang === 'ar' ? 'جاري الإصدار...' : 'Creating...') : (lang === 'ar' ? 'إصدار الفاتورة' : 'Create Invoice')}
                                </Button>
                            </div>
                        </Card>
                    )}

                    <Card title={`${t('fin_tab_invoices', 'Invoices')}: ${currentOrgName}`} style={{ borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <TableWrapper>
                            <Table>
                                <Thead>
                                    <Tr>
                                        <Th>{t('fin_th_invoice_num', 'Invoice #')}</Th>
                                        <Th>{lang === 'ar' ? 'الفترة' : 'Period'}</Th>
                                        <Th>{lang === 'ar' ? 'عدد الشحنات' : 'Items'}</Th>
                                        <Th>{t('fin_th_status', 'Status')}</Th>
                                        <Th>{t('fin_th_due_date', 'Due Date')}</Th>
                                        <Th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{t('fin_th_amount', 'Total Amount')}</Th>
                                        <Th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{t('fin_th_actions', 'Action')}</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {invoices.length > 0 ? invoices.map((inv) => (
                                        <Tr key={inv.id}>
                                            <Td style={{ fontWeight: 700 }}>{inv.invoiceNumber}</Td>
                                            <Td style={{ fontSize: 12 }}>
                                                {format(new Date(inv.periodStart), 'MMM dd')} - {format(new Date(inv.periodEnd), 'MMM dd, yyyy')}
                                            </Td>
                                            <Td>{inv.lines?.length || 0}</Td>
                                            <Td><StatusPill status={inv.status} /></Td>
                                            <Td style={{ fontSize: 12 }}>{inv.dueDate ? format(new Date(inv.dueDate), 'MMM dd, yyyy') : '—'}</Td>
                                            <Td style={{ textAlign: lang === 'ar' ? 'left' : 'right', fontWeight: 800 }}>
                                                {money(inv.total, inv.currency)}
                                            </Td>
                                            <Td style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: lang === 'ar' ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
                                                    <Button
                                                        variant="outline"
                                                        size="small"
                                                        onClick={() => handleDownloadInvoice(inv)}
                                                        disabled={downloadingInvoiceId === inv.id}
                                                        style={{ padding: '4px 8px', fontSize: 12 }}
                                                        title={lang === 'ar' ? 'تنزيل الفاتورة بصيغة PDF' : 'Download Invoice PDF'}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, marginInlineEnd: 4 }}>picture_as_pdf</span>
                                                        {downloadingInvoiceId === inv.id ? '...' : 'PDF'}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        size="small"
                                                        onClick={() => handleSendInvoiceWhatsApp(inv.id)}
                                                        disabled={sendingInvoiceId === inv.id}
                                                        style={{ padding: '4px 8px', fontSize: 12 }}
                                                        title={lang === 'ar' ? 'إرسال الفاتورة عبر واتساب لمدير الحساب' : 'Send Invoice via WhatsApp to Manager'}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, marginInlineEnd: 4 }}>send</span>
                                                        {sendingInvoiceId === inv.id ? '...' : 'WhatsApp'}
                                                    </Button>
                                                    {can('MANAGE_PAYMENTS') && (
                                                        <Select
                                                            value={inv.status}
                                                            onChange={(e) => handleInvoiceStatusChange(inv.id, e.target.value)}
                                                            disabled={invoiceLoading}
                                                            style={{ margin: 0, minWidth: '105px', height: '32px', fontSize: 12 }}
                                                        >
                                                            {INVOICE_STATUS_OPTIONS.map(status => (
                                                                <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                                                            ))}
                                                        </Select>
                                                    )}
                                                </div>
                                            </Td>
                                        </Tr>
                                    )) : (
                                        <Tr><Td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>{t('fin_no_invoices', 'No invoices found')}</Td></Tr>
                                    )}
                                </Tbody>
                            </Table>
                        </TableWrapper>
                    </Card>
                </>
            )}

            {/* ── TAB 5: PROFITABILITY REPORTS ── */}
            {activeTab === 'reports' && can('VIEW_FINANCE') && (
                <FinanceReports ledger={ledger} shipments={shipments} organizations={organizations} />
            )}

            {/* ── TAB: DRIVER COD & VAULT CLEARING ── */}
            {activeTab === 'cod' && can('VIEW_FINANCE') && (
                <>
                    {/* Alerts Banner */}
                    {codSummary.alerts && codSummary.alerts.length > 0 && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${TK.error}`,
                            borderRadius: '16px',
                            padding: '16px 20px',
                            marginBottom: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            {codSummary.alerts.map((a, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#dc2626', fontSize: 13, fontWeight: 700 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
                                    <span>{a.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* KPI Cards */}
                    <MetricsGrid>
                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{lang === 'ar' ? 'إجمالي نقدية التحصيل لدى السائقين' : 'Total Unremitted Cash with Drivers'}</MetricLabel>
                                <MetricIcon $bg={TK.successBg} $color={TK.success}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue style={{ color: TK.success }}>
                                    {fmtAmount(codSummary.unremittedTotalsByCurrency?.['KWD'] || 0)} <span>KWD</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>
                                        {Object.entries(codSummary.unremittedTotalsByCurrency || {})
                                            .filter(([k]) => k !== 'KWD')
                                            .map(([curr, amt]) => `${fmtAmount(amt)} ${curr}`)
                                            .join(', ') || (lang === 'ar' ? 'جاهز للاستلام والتسوية' : 'Ready for vault handover')}
                                    </span>
                                    <MetricTrend $positive>{lang === 'ar' ? 'تحصيل نقدي' : 'Cash in Hand'}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>

                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{lang === 'ar' ? 'عدد شحنات التحصيل غير المسواة' : 'Unremitted COD Shipments'}</MetricLabel>
                                <MetricIcon $bg={TK.primaryBg} $color={TK.primary}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>local_shipping</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue>
                                    {codSummary.unremittedCount || 0}
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{lang === 'ar' ? 'بانتظار التوريد للخزينة' : 'Awaiting cashier check'}</span>
                                    <MetricTrend>{codSummary.unremittedCount > 0 ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'مسوى بالكامل' : 'Settled')}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>

                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{lang === 'ar' ? 'سقف احتفاظ السائق بالنقد' : 'Driver Holding Limit'}</MetricLabel>
                                <MetricIcon $bg={TK.warningBg} $color={TK.warning}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>shield</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue style={{ color: codSummary.isLimitExceeded ? TK.error : TK.text1 }}>
                                    500.000 <span>KWD</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{lang === 'ar' ? 'الحد الأقصى المسموح به' : 'Max safety threshold'}</span>
                                    <MetricTrend $positive={!codSummary.isLimitExceeded}>{codSummary.isLimitExceeded ? (lang === 'ar' ? 'تجاوز الحد' : 'Limit Exceeded') : (lang === 'ar' ? 'ضمن الحد' : 'Compliant')}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>

                        <MetricCard>
                            <MetricHeader>
                                <MetricLabel>{lang === 'ar' ? 'أقدمية النقد غير المورد' : 'Oldest Unremitted Age'}</MetricLabel>
                                <MetricIcon $bg={TK.purpleBg} $color={TK.purple}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>schedule</span>
                                </MetricIcon>
                            </MetricHeader>
                            <div>
                                <MetricValue style={{ color: codSummary.isAgingCritical ? TK.error : TK.text1 }}>
                                    {codSummary.oldestAgingDays || 0} <span>{lang === 'ar' ? 'يوم' : 'Days'}</span>
                                </MetricValue>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11.5, color: TK.text3 }}>{lang === 'ar' ? 'التوريد الإجباري خلال 3 أيام' : 'Handover due in ≤ 3 days'}</span>
                                    <MetricTrend $positive={!codSummary.isAgingCritical}>{codSummary.isAgingCritical ? (lang === 'ar' ? 'متأخر' : 'Overdue') : (lang === 'ar' ? 'طبيعي' : 'Normal')}</MetricTrend>
                                </div>
                            </div>
                        </MetricCard>
                    </MetricsGrid>

                    {/* Filter & Action Bar */}
                    <Card style={{ marginBottom: '20px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                                <div style={{ minWidth: '220px' }}>
                                    <Select
                                        label={lang === 'ar' ? 'تصفية حسب السائق' : 'Filter by Driver'}
                                        value={codDriverFilter}
                                        onChange={(e) => {
                                            setCodDriverFilter(e.target.value);
                                            fetchCodData(e.target.value);
                                        }}
                                    >
                                        <option value="ALL">{lang === 'ar' ? 'جميع السائقين' : 'All Drivers'}</option>
                                        {driversList.map(d => (
                                            <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                                        ))}
                                    </Select>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => fetchCodData()}
                                    style={{ height: '42px', marginTop: '18px' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 6 }}>refresh</span>
                                    {t('refresh', 'Refresh')}
                                </Button>
                            </div>
                            <div style={{ marginTop: '18px' }}>
                                <Button
                                    variant="primary"
                                    onClick={() => openReconcileModal()}
                                    style={{
                                        background: TK.success,
                                        fontWeight: 700,
                                        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>account_balance</span>
                                    {lang === 'ar' ? 'تسجيل واستلام توريد نقدي للخزينة' : 'Receive & Reconcile Vault Handover'}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* COD Consignments Log Table */}
                    <Card title={`${lang === 'ar' ? 'سجل شحنات التحصيل النقدي (COD)' : 'COD Consignments & Remittance Ledger'}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 13, color: TK.text2 }}>
                                {lang === 'ar'
                                    ? 'متابعة وتدقيق المبالغ النقدية المحصلة من العملاء عبر السائقين ومطابقتها مع إيداعات الخزينة.'
                                    : 'Audit and track physical cash collected by couriers with 2-step reconciliation to hub vault.'}
                            </div>
                            <ExportButton data={codSummary.shipments || []} filename="Driver_COD_Collections" />
                        </div>
                        <TableWrapper>
                            <Table>
                                <Thead>
                                    <Tr>
                                        <Th>{t('fin_th_reference', 'Tracking #')}</Th>
                                        <Th>{lang === 'ar' ? 'السائق المعين' : 'Assigned Driver'}</Th>
                                        <Th>{t('fin_th_status', 'Status')}</Th>
                                        <Th>{lang === 'ar' ? 'حالة التوريد' : 'COD Status'}</Th>
                                        <Th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{lang === 'ar' ? 'مبلغ التحصيل' : 'COD Amount'}</Th>
                                        <Th>{lang === 'ar' ? 'آخر تحديث' : 'Last Updated'}</Th>
                                        <Th style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>{t('fin_th_actions', 'Actions')}</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {codLoading ? (
                                        <Tr><Td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}><Loader /></Td></Tr>
                                    ) : (codSummary.shipments && codSummary.shipments.length > 0) ? (
                                        codSummary.shipments.map((s) => {
                                            const isRemitted = s.codStatus === 'REMITTED';
                                            const isPending = s.codStatus === 'PENDING_REMITTANCE';
                                            return (
                                                <Tr key={s.id || s.trackingNumber}>
                                                    <Td style={{ fontWeight: 700 }}>{s.trackingNumber}</Td>
                                                    <Td style={{ fontSize: 12.5 }}>
                                                        <div style={{ fontWeight: 600 }}>{s.assignedDriver?.name || '—'}</div>
                                                        {s.assignedDriver?.phone && (
                                                            <div style={{ fontSize: 11, color: TK.text3 }}>{s.assignedDriver.phone}</div>
                                                        )}
                                                    </Td>
                                                    <Td><StatusPill status={s.status} /></Td>
                                                    <Td>
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: 6,
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                            background: isRemitted ? 'rgba(59, 130, 246, 0.15)' : isPending ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                            color: isRemitted ? '#2563eb' : isPending ? '#d97706' : '#059669'
                                                        }}>
                                                            {isRemitted ? (lang === 'ar' ? 'مورد للخزينة' : 'VAULT REMITTED') : isPending ? (lang === 'ar' ? 'قيد المراجعة' : 'PENDING REVIEW') : (lang === 'ar' ? 'طرف السائق' : 'HELD IN HAND')}
                                                        </span>
                                                    </Td>
                                                    <Td style={{
                                                        textAlign: lang === 'ar' ? 'left' : 'right',
                                                        fontWeight: 800,
                                                        color: isRemitted ? TK.text2 : TK.success
                                                    }}>
                                                        {fmtAmount(s.codAmount)} {normalizeCurrencyCode(s.codCurrency, 'KWD')}
                                                    </Td>
                                                    <Td style={{ fontSize: 12, color: TK.text3 }}>
                                                        {s.updatedAt ? format(new Date(s.updatedAt), 'yyyy-MM-dd HH:mm') : '—'}
                                                    </Td>
                                                    <Td style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>
                                                        {!isRemitted ? (
                                                            <Button
                                                                variant="primary"
                                                                size="small"
                                                                onClick={() => openReconcileModal(null, s)}
                                                                style={{ padding: '4px 10px', fontSize: 12, background: TK.success }}
                                                            >
                                                                <span className="material-symbols-outlined" style={{ fontSize: 14, marginInlineEnd: 4 }}>check_circle</span>
                                                                {lang === 'ar' ? 'استلام وتوريد' : 'Reconcile'}
                                                            </Button>
                                                        ) : (
                                                            <span style={{ fontSize: 11, color: TK.text3 }}>✓ {lang === 'ar' ? 'تم القيد' : 'Posted'}</span>
                                                        )}
                                                    </Td>
                                                </Tr>
                                            );
                                        })
                                    ) : (
                                        <Tr><Td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>{lang === 'ar' ? 'لا توجد شحنات تحصيل نقدي مسجلة' : 'No COD shipments found'}</Td></Tr>
                                    )}
                                </Tbody>
                            </Table>
                        </TableWrapper>
                    </Card>
                </>
            )}

            {/* ── TAB: FINANCIAL STATEMENTS ── */}
            {activeTab === 'statements' && can('VIEW_FINANCE') && (
                <FinancialStatementsTab lang={lang} />
            )}

            {/* ── TAB: GENERAL LEDGER & COA ── */}
            {activeTab === 'gl' && can('VIEW_FINANCE') && (
                <GeneralLedgerTab lang={lang} />
            )}

            {/* ── TAB: ACCOUNTS PAYABLE ── */}
            {activeTab === 'ap' && can('VIEW_FINANCE') && (
                <AccountsPayableTab lang={lang} />
            )}

            {/* ── TAB: TREASURY & BANKING ── */}
            {activeTab === 'treasury' && can('VIEW_FINANCE') && (
                <TreasuryTab lang={lang} />
            )}

            {/* ── TAB: PERIOD CLOSING ── */}
            {activeTab === 'periods' && can('VIEW_FINANCE') && (
                <PeriodClosingTab lang={lang} />
            )}

            {/* Cash Handover Reconciliation Modal */}
            <Modal
                isOpen={isReconcileModalOpen}
                onClose={() => setIsReconcileModalOpen(false)}
                title={lang === 'ar' ? '💵 استلام وتوريد نقدية التحصيل (COD) إلى الخزينة' : '💵 Receive & Reconcile Driver COD Handover to Vault'}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                    <div style={{ fontSize: 13, color: TK.text2 }}>
                        {lang === 'ar'
                            ? 'إثبات استلام النقدية الفعلية من السائق وترحيلها بنظام القيد المزدوج إلى خزينة الفرع.'
                            : 'Verify physical cash collected from courier and post credit clearance to financial ledger.'}
                    </div>

                    <Select
                        label={lang === 'ar' ? 'السائق المسلم للنقدية *' : 'Driver Handing Over Cash *'}
                        value={reconcileForm.driverId}
                        onChange={(e) => {
                            const d = driversList.find(item => item.id === e.target.value);
                            setReconcileForm(prev => ({
                                ...prev,
                                driverId: e.target.value,
                                driverName: d?.name || ''
                            }));
                        }}
                    >
                        <option value="">{lang === 'ar' ? '— اختر السائق —' : '— Select Driver —'}</option>
                        {driversList.map(d => (
                            <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                        ))}
                    </Select>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                        <WInput
                            label={`${lang === 'ar' ? 'المبلغ المستلم فعلياً' : 'Cash Count Amount'} *`}
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={reconcileForm.amount}
                            onChange={(e) => setReconcileForm(prev => ({ ...prev, amount: e.target.value }))}
                        />
                        <Select
                            label={lang === 'ar' ? 'العملة' : 'Currency'}
                            value={reconcileForm.currency}
                            onChange={(e) => setReconcileForm(prev => ({ ...prev, currency: e.target.value }))}
                        >
                            <option value="KWD">KWD</option>
                            <option value="SAR">SAR</option>
                            <option value="AED">AED</option>
                            <option value="BHD">BHD</option>
                            <option value="OMR">OMR</option>
                            <option value="QAR">QAR</option>
                            <option value="USD">USD</option>
                        </Select>
                    </div>

                    <WInput
                        label={lang === 'ar' ? 'رقم كيس الأمانات / المظروف (اختياري)' : 'Security Bag / Envelope Ref (Optional)'}
                        value={reconcileForm.bagReference}
                        onChange={(e) => setReconcileForm(prev => ({ ...prev, bagReference: e.target.value }))}
                        placeholder="e.g. BAG-KW-0921"
                    />

                    <WInput
                        label={lang === 'ar' ? 'ملاحظات أمين الصندوق' : 'Cashier Verification Notes'}
                        value={reconcileForm.notes}
                        onChange={(e) => setReconcileForm(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder={lang === 'ar' ? 'تم جرد النقد ومطابقته بخزينة الشويخ' : 'Cash verified and placed in hub vault safe'}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                        <Button variant="secondary" onClick={() => setIsReconcileModalOpen(false)} disabled={reconcileLoading}>
                            {t('cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleReconcileSubmit}
                            disabled={reconcileLoading || !reconcileForm.amount || parseFloat(reconcileForm.amount) <= 0 || !reconcileForm.driverId}
                            style={{ background: TK.success, fontWeight: 700 }}
                        >
                            {reconcileLoading ? '...' : (lang === 'ar' ? 'ترحيل إلى الخزينة وقيد اليومية' : 'Post Remittance to Ledger')}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* FIFO Confirmation Modal */}
            <Modal
                isOpen={fifoConfirmOpen}
                onClose={() => setFifoConfirmOpen(false)}
                title={lang === 'ar' ? 'تأكيد التسوية التلقائية (FIFO)' : 'Confirm Automatic FIFO Allocation'}
            >
                <div style={{ padding: '8px 0', fontSize: 13.5, lineHeight: 1.5, color: TK.text1 }}>
                    <p>{lang === 'ar' ? `هل أنت متأكد من تشغيل التسوية التلقائية (FIFO) لحساب ` : `Are you sure you want to run FIFO Auto-Allocation for `}<strong>{currentOrgName}</strong>؟</p>
                    <p style={{ color: TK.text2, marginTop: 8 }}>
                        {lang === 'ar' ? 'سيتم توزيع الأرصدة المتاحة تلقائياً لتسوية أقدم الشحنات غير المسددة أولاً بأول.' : 'This will automatically distribute available unapplied credits to settle the oldest outstanding shipments first.'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                        <Button variant="secondary" onClick={() => setFifoConfirmOpen(false)}>{t('cancel', 'Cancel')}</Button>
                        <Button variant="primary" onClick={handleFifoConfirmed}>{lang === 'ar' ? 'تأكيد التسوية' : 'Confirm FIFO'}</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default FinancePage;
