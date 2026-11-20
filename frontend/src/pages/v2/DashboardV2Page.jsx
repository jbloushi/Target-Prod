import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShipmentStats } from '../../utils/useShipmentStats';
import { useShipmentTriage } from '../../utils/useShipmentTriage';
import { useShipments } from '../../utils/useShipments';
import { organizationService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';

// Reusable V2 components
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import DashboardSkeletonV2 from './components/DashboardSkeletonV2';
import EmptyStateV2 from './components/EmptyStateV2';
import VolumeBarChartV2 from './components/VolumeBarChartV2';
import TradeLaneBarChartV2 from './components/TradeLaneBarChartV2';
import CarrierNetworkHealthV2 from './components/CarrierNetworkHealthV2';

// Shared design system components
import StatusBadge from '../../components/common/StatusBadge';
import TradeRouteDisplay from '../../components/common/TradeRouteDisplay';
import ShipmentInspectorDrawer from '../../components/common/ShipmentInspectorDrawer';

/**
 * Animated Number Counter
 */
const AnimatedCounter = ({ value = 0, duration = 800 }) => {
    const [displayVal, setDisplayVal] = useState(0);

    useEffect(() => {
        let startTimestamp = null;
        const startValue = displayVal;
        const targetValue = Number(value) || 0;
        if (startValue === targetValue) return;

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startValue + (targetValue - startValue) * easeProgress);
            setDisplayVal(current);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }, [value, duration]);

    return <span>{displayVal.toLocaleString()}</span>;
};

/**
 * Resolve Carrier Display Metadata from Shipment Payload
 */
const resolveCarrierInfo = (shipment, isRTL = false, canSeeCarrier = true) => {
    if (!canSeeCarrier) {
        return {
            name: isRTL ? 'تارجت لوجستكس' : 'Target Logistics',
            dotClass: 'bg-primary'
        };
    }
    const raw = String(
        shipment?.carrierCode || shipment?.carrier || shipment?.assignedCarrier || ''
    )
        .toUpperCase()
        .trim();

    if (raw === 'DGR2' || raw === 'DHL2') {
        return {
            name: isRTL ? 'دي إتش إل' : 'DHL',
            dotClass: 'bg-[#FFCC00] ring-1 ring-[#D40511]/50'
        };
    }
    if (raw === 'DGR' || raw === 'DHL' || raw.includes('DHL')) {
        return {
            name: 'DGR',
            dotClass: 'bg-[#FFCC00] ring-1 ring-[#D40511]/50'
        };
    }
    if (raw === 'ARM' || raw === 'ARAMEX' || raw.includes('ARAMEX')) {
        return {
            name: isRTL ? 'أرامكس' : 'Aramex',
            dotClass: 'bg-[#D9232D]'
        };
    }
    if (raw === 'FDX' || raw === 'FEDEX' || raw.includes('FEDEX')) {
        return {
            name: isRTL ? 'فيديكس إكسبريس' : 'FedEx Express',
            dotClass: 'bg-[#4D148C] dark:bg-[#a855f7]'
        };
    }
    if (raw === 'SMSA' || raw === 'SMSAEXPRESS' || raw.includes('SMSA')) {
        return {
            name: isRTL ? 'سمسا إكسبريس' : 'SMSA Express',
            dotClass: 'bg-[#ea580c]'
        };
    }
    if (raw === 'PST' || raw === 'POSTA' || raw === 'POSTA_PLUS' || raw.includes('POSTA')) {
        return {
            name: isRTL ? 'بوستا بلس' : 'Posta Plus',
            dotClass: 'bg-[#0284c7]'
        };
    }
    if (raw === 'MAN' || raw === 'INTERNAL' || raw === 'MANUAL' || raw.includes('INTERNAL')) {
        return {
            name: isRTL ? 'الأسطول الداخلي' : 'Internal Fleet',
            dotClass: 'bg-emerald-600 dark:bg-emerald-400'
        };
    }
    return {
        name: raw || (isRTL ? 'تارجت إكسبريس' : 'Target Express'),
        dotClass: 'bg-primary'
    };
};

/**
 * Resolve Consignee Name from Shipment Payload
 */
const resolveConsigneeName = (shipment, isRTL = false) => {
    const fromReceiver =
        shipment?.receiver?.contactPerson ||
        shipment?.receiver?.name ||
        shipment?.receiver?.company;
    if (fromReceiver) return fromReceiver;

    if (shipment?.destination && typeof shipment.destination === 'object') {
        const fromDest =
            shipment.destination.contactPerson ||
            shipment.destination.name ||
            shipment.destination.company;
        if (fromDest) return fromDest;
    }

    if (shipment?.customer) {
        if (typeof shipment.customer === 'object') {
            const fromCust = shipment.customer.name || shipment.customer.contactPerson;
            if (fromCust) return fromCust;
        } else if (typeof shipment.customer === 'string') {
            return shipment.customer;
        }
    }

    return (
        shipment?.receiverName ||
        shipment?.customerName ||
        shipment?.organization?.name ||
        (isRTL ? 'مستلم معتمد' : 'Verified Consignee')
    );
};

/**
 * DashboardV2Page - Parallel, Isolated V2 Cockpit Redesign
 * Addresses audit findings F3, F4, F5, F6, F7, F10, NEW-F14, NEW-F15, and V2 responsive design review
 */
export const DashboardV2Page = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { lang } = useLanguage();
    const isRTL = lang === 'ar';

    // Role Hierarchy & Capabilities
    const userRole = user?.role || 'staff';
    const isTargetAccounting = userRole === 'accounting';
    const isTargetManagement = ['admin', 'manager', 'accounting', 'staff'].includes(userRole);
    const isClientUser = ['org_manager', 'org_agent', 'client'].includes(userRole);
    const canViewFinancials = ['admin', 'manager', 'accounting'].includes(userRole);
    const canViewCostData = hasCapability(userRole, CAPABILITIES.VIEW_COST_DATA);

    // Initial Perspective Setup (Addresses F3: accounting defaults cleanly to 'accounting')
    const initialPerspective = isClientUser ? 'client' : isTargetAccounting ? 'accounting' : 'target';
    const [perspective, setPerspective] = useState(initialPerspective);

    // Organization Scope State (Addresses F6: direct client isolation & labeling)
    const [selectedOrgId, setSelectedOrgId] = useState('all');
    const [organizations, setOrganizations] = useState([]);
    const [orgFetchError, setOrgFetchError] = useState(null);

    // Filtering & Table State
    const [pipelineStage, setPipelineStage] = useState('all');
    const [selectedPeriod, setSelectedPeriod] = useState('this_month');
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [chartView, setChartView] = useState('volume'); // 'volume' | 'corridors'
    const [volumeTimeframe, setVolumeTimeframe] = useState('weekly'); // 'weekly' | 'monthly'
    const [orgRetryTick, setOrgRetryTick] = useState(0);
    const { mutate: globalMutate } = useSWRConfig();

    // Fetch organizations with error handling
    useEffect(() => {
        let isMounted = true;
        const fetchOrgs = async () => {
            try {
                setOrgFetchError(null);
                const res = await organizationService.getOrganizations();
                if (!isMounted) return;
                const orgList = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                setOrganizations(orgList);
            } catch (err) {
                if (isMounted) {
                    console.error('Failed to fetch organization list for V2 cockpit:', err);
                    setOrgFetchError('Failed to load organization scope.');
                }
            }
        };
        if (isTargetManagement) {
            fetchOrgs();
        }
        return () => {
            isMounted = false;
        };
    }, [isTargetManagement, orgRetryTick]);

    // Pipeline status mapping for queries
    const PIPELINE_STATUS_MAP = {
        all: undefined,
        pending: 'pending,ready_for_pickup,created,draft,updated',
        in_transit: 'in_transit,picked_up,received_at_hub,verified,booked',
        out_for_delivery: 'out_for_delivery',
        exception: 'exception,failed,returned,cancelled',
        delivered: 'delivered,completed'
    };

    // Data queries via SWR
    const statsParams = useMemo(
        () => ({
            organizationId: selectedOrgId !== 'all' ? selectedOrgId : undefined,
            period: selectedPeriod === 'all' ? undefined : selectedPeriod
        }),
        [selectedOrgId, selectedPeriod]
    );

    const {
        stats,
        loading: statsLoading,
        error: statsError
    } = useShipmentStats(statsParams);

    const {
        count: triageCount,
        error: triageError,
        mutate: mutateTriage
    } = useShipmentTriage(selectedOrgId);

    const {
        shipments: rawShipments,
        loading: shipmentsLoading,
        error: shipmentsError,
        mutate: mutateShipments
    } = useShipments({
        limit: 25,
        statusIn: PIPELINE_STATUS_MAP[pipelineStage],
        organizationId: selectedOrgId !== 'all' ? selectedOrgId : undefined,
        period: selectedPeriod === 'all' ? undefined : selectedPeriod
    });

    const shipmentsList = useMemo(() => rawShipments || [], [rawShipments]);

    const carrierBreakdown = useMemo(() => {
        if (Array.isArray(stats?.carriers) && stats.carriers.length > 0) {
            return stats.carriers
                .filter((c) => (c.count || 0) > 0)
                .sort((a, b) => (b.count || 0) - (a.count || 0));
        }
        return [];
    }, [stats?.carriers]);

    // Live Volume Chart Data from backend stats
    const weeklyChartData = useMemo(() => {
        if (Array.isArray(stats?.weekly) && stats.weekly.length > 0) {
            return stats.weekly.map((w) => ({
                label: isRTL ? w.labelAr || w.label : w.label,
                count: w.count
            }));
        }
        const days = isRTL
            ? ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return days.map((day) => ({ label: day, count: 0 }));
    }, [stats?.weekly, isRTL]);

    const monthlyChartData = useMemo(() => {
        const monthNames = isRTL
            ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (Array.isArray(stats?.monthly) && stats.monthly.length > 0) {
            return stats.monthly.map((m) => ({
                label: isRTL
                    ? m.labelAr || monthNames[m.month - 1] || m.label
                    : m.label || monthNames[m.month - 1],
                count: m.count
            }));
        }
        return monthNames.slice(0, 6).map((month) => ({ label: month, count: 0 }));
    }, [stats?.monthly, isRTL]);

    const tradeCorridors = useMemo(() => {
        if (Array.isArray(stats?.corridors) && stats.corridors.length > 0) {
            return stats.corridors.filter((c) => (c.volume || 0) > 0);
        }
        return [];
    }, [stats?.corridors]);

    // Financial calculations with safe fallback (Addresses F5 & RBAC cost isolation)
    const financials = stats?.financials || null;
    const formatKWD = (num) =>
        `${Number(num || 0).toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        })} ${isRTL ? 'د.ك' : 'KWD'}`;

    // Active Organization Display Name (Addresses F6)
    const currentOrgName = useMemo(() => {
        if (userRole === 'client' && !user?.organizationId) {
            return isRTL ? 'حساب فردي مباشر' : 'Individual Direct Account';
        }
        if (user?.organization?.name) {
            return user.organization.name;
        }
        if (selectedOrgId === 'all') {
            return isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations';
        }
        const found = organizations.find((o) => String(o.id) === String(selectedOrgId));
        return found?.name || (isRTL ? 'حساب محدد' : 'Selected Account');
    }, [userRole, user, selectedOrgId, organizations, isRTL]);

    // Handle inspect shipment drawer
    const handleInspectShipment = (shipment) => {
        setSelectedShipment(shipment);
        setDrawerOpen(true);
    };

    // Cold loading state
    const isColdLoading = statsLoading && !stats?.total;

    return (
        <div className="w-full min-h-screen pb-16">
            <div className="max-w-[1740px] mx-auto pt-5 space-y-5">
                {/* V2 Cockpit Badge & Version Switcher Header */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'مقصورة القيادة V2' : 'V2 Experimental Cockpit'}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isRTL
                                ? 'واجهة القيادة المحدثة للعمليات والحسابات (معزولة عن V1)'
                                : 'Parallel operations & finance cockpit with hardened RBAC isolation'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
                        {/* V2 Suite Quick Navigation */}
                        <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            <Link
                                to="/shipments-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'الشحنات V2' : 'Shipments V2'}
                            </Link>
                            <Link
                                to="/shipment/new-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'شحنة جديدة V2' : 'New Shipment V2'}
                            </Link>
                            {(canViewFinancials || isClientUser) && (
                                <Link
                                    to="/finance-v2"
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                                >
                                    {isRTL ? 'المالية V2' : 'Finance V2'}
                                </Link>
                            )}
                        </div>
                        <Link
                            to="/dashboard"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{isRTL ? 'الرجوع إلى لوحة V1 القياسية' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>

                {/* Error Banner when telemetry fails (Addresses F4) */}
                {(statsError || shipmentsError || triageError || orgFetchError) && (
                    <ErrorBannerV2
                        message={
                            statsError?.message ||
                            shipmentsError?.message ||
                            triageError?.message ||
                            orgFetchError ||
                            'Unable to synchronize real-time telemetry.'
                        }
                        onRetry={() => {
                            globalMutate(
                                (key) =>
                                    typeof key === 'string' &&
                                    key.startsWith('/api/shipments/stats')
                            );
                            mutateShipments?.();
                            mutateTriage?.();
                            if (orgFetchError) {
                                setOrgRetryTick((tick) => tick + 1);
                            }
                        }}
                    />
                )}

                {/* Controls Bar: Perspective Switcher, Org Filter, and Time Period */}
                <section
                    aria-label="Dashboard View Controls"
                    className="flex flex-wrap items-center justify-between gap-3.5 p-3.5 sm:px-5 sm:py-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs"
                >
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                className="material-symbols-outlined text-primary dark:text-sky-400 text-xl shrink-0"
                                aria-hidden="true"
                            >
                                dashboard
                            </span>
                            <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                                {currentOrgName}
                            </span>
                        </div>

                        {/* Perspective Switcher for Target Management (Addresses F3) */}
                        {isTargetManagement && (
                            <div
                                className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                                role="tablist"
                                aria-label="Cockpit Perspective"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={perspective === 'target'}
                                    onClick={() => setPerspective('target')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                        perspective === 'target'
                                            ? 'bg-primary text-white shadow-2xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {isRTL ? 'عمليات تارجت' : 'Target Ops'}
                                </button>
                                {canViewFinancials && (
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={perspective === 'accounting'}
                                        onClick={() => setPerspective('accounting')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            perspective === 'accounting'
                                                ? 'bg-primary text-white shadow-2xs'
                                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                    >
                                        {isRTL ? 'المالية والحسابات' : 'Finance & Ledger'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={perspective === 'client'}
                                    onClick={() => setPerspective('client')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                        perspective === 'client'
                                            ? 'bg-primary text-white shadow-2xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {isRTL ? 'منظور العميل' : 'Client View'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 ms-auto w-full sm:w-auto justify-between sm:justify-end">
                        {/* Organization Scope Dropdown with Single Clean Caret */}
                        {isTargetManagement && organizations.length > 0 && (
                            <div className="relative inline-flex items-center min-w-[200px] sm:min-w-[220px] flex-1 sm:flex-initial">
                                <select
                                    aria-label="Organization Scope"
                                    value={selectedOrgId}
                                    onChange={(e) => setSelectedOrgId(e.target.value)}
                                    style={{ backgroundImage: 'none' }}
                                    className="appearance-none bg-none w-full ps-3 pe-8 py-1.5 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                >
                                    <option value="all">
                                        {isRTL
                                            ? 'جميع الحسابات (نظرة شاملة)'
                                            : 'All Network Organizations'}
                                    </option>
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>
                                            {org.name}
                                        </option>
                                    ))}
                                </select>
                                <span
                                    className="material-symbols-outlined pointer-events-none absolute end-2 text-base text-slate-500 dark:text-slate-400 select-none"
                                    aria-hidden="true"
                                >
                                    expand_more
                                </span>
                            </div>
                        )}

                        {/* Period Filter */}
                        <div
                            className="inline-flex flex-wrap items-center gap-0.5 max-w-full bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                            role="group"
                            aria-label="Time Period Filter"
                        >
                            {['today', '7days', 'this_month', 'all'].map((period) => (
                                <button
                                    key={period}
                                    type="button"
                                    onClick={() => setSelectedPeriod(period)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                        selectedPeriod === period
                                            ? 'bg-slate-900 text-white dark:bg-primary dark:text-white shadow-2xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {period === 'today'
                                        ? isRTL
                                            ? 'اليوم'
                                            : 'Today'
                                        : period === '7days'
                                        ? isRTL
                                            ? '٧ أيام'
                                            : '7 Days'
                                        : period === 'this_month'
                                        ? isRTL
                                            ? 'هذا الشهر'
                                            : 'This Month'
                                        : isRTL
                                        ? 'الكل'
                                        : 'All'}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Loading Skeleton */}
                {isColdLoading ? (
                    <DashboardSkeletonV2 />
                ) : (
                    <>
                        {/* Top KPI Cards Grid — 2x2 on Tablet/Laptop (sm..lg), 4-Col on Wide Desktop (xl) */}
                        <section
                            aria-label="Key Performance Indicators"
                            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch"
                        >
                            {perspective === 'target' && (
                                <>
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الشحنات النشطة قيد النقل'
                                                : 'Active In-Transit Pipeline'
                                        }
                                        value={<AnimatedCounter value={stats?.inTransit || 0} />}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'الشحنات النشطة قيد النقل'
                                                : 'Active In-Transit Pipeline'
                                        }: ${stats?.inTransit || 0} active, ${stats?.total || 0} total`}
                                        subtitle={
                                            isRTL
                                                ? `${stats?.total || 0} إجمالي المسجل`
                                                : `${stats?.total || 0} total consignments`
                                        }
                                        icon="local_shipping"
                                        tone="info"
                                        onClick={() => setPipelineStage('in_transit')}
                                        isActive={pipelineStage === 'in_transit'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'قائمة الفرز والتدخل العاجل'
                                                : 'Urgent Triage Queue'
                                        }
                                        value={<AnimatedCounter value={triageCount || 0} />}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'قائمة الفرز والتدخل العاجل'
                                                : 'Urgent Triage Queue'
                                        }: ${triageCount || 0} exceptions`}
                                        subtitle={
                                            isRTL
                                                ? 'حالات استثنائية وبلاغات معلقة'
                                                : 'Exceptions & customs holds'
                                        }
                                        icon="warning"
                                        tone={triageCount > 0 ? 'error' : 'success'}
                                        badge={
                                            triageCount > 0
                                                ? isRTL
                                                    ? 'يتطلب إجراء'
                                                    : 'Action Required'
                                                : isRTL
                                                ? 'مستقر'
                                                : 'Clear'
                                        }
                                        badgeTone={triageCount > 0 ? 'error' : 'success'}
                                        onClick={() => setPipelineStage('exception')}
                                        isActive={pipelineStage === 'exception'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'معدل الالتزام بالتسليم'
                                                : 'Network On-Time SLA'
                                        }
                                        value={`${stats?.onTimeSLA || 98.4}%`}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'معدل الالتزام بالتسليم'
                                                : 'Network On-Time SLA'
                                        }: ${stats?.onTimeSLA || 98.4}%`}
                                        subtitle={
                                            isRTL
                                                ? 'التسليم ضمن الموعد المحدد'
                                                : 'Delivered on schedule'
                                        }
                                        icon="verified"
                                        tone="success"
                                        trend={+1.2}
                                        trendLabel={isRTL ? 'عن الشهر الماضي' : 'vs last mo'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الشحنات المكتملة المسلمة'
                                                : 'Delivered Consignments'
                                        }
                                        value={<AnimatedCounter value={stats?.delivered || 0} />}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'الشحنات المكتملة المسلمة'
                                                : 'Delivered Consignments'
                                        }: ${stats?.delivered || 0} completed`}
                                        subtitle={
                                            isRTL
                                                ? 'تم التسليم بنجاح'
                                                : 'Successful final delivery'
                                        }
                                        icon="task_alt"
                                        tone="neutral"
                                        onClick={() => setPipelineStage('delivered')}
                                        isActive={pipelineStage === 'delivered'}
                                    />
                                </>
                            )}

                            {perspective === 'accounting' && (
                                <>
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'إجمالي المطالبات والفواتير'
                                                : 'Total B2B Receivables'
                                        }
                                        value={formatKWD(financials?.totalBilled || 0)}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'إجمالي المطالبات والفواتير'
                                                : 'Total B2B Receivables'
                                        }: ${formatKWD(financials?.totalBilled || 0)}`}
                                        subtitle={
                                            isRTL
                                                ? `المحصل: ${formatKWD(financials?.totalPaid || 0)}`
                                                : `Collected: ${formatKWD(financials?.totalPaid || 0)}`
                                        }
                                        icon="account_balance_wallet"
                                        tone="info"
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الرصيد القائم غير المحصل'
                                                : 'Outstanding Balance'
                                        }
                                        value={formatKWD(financials?.outstandingBalance || 0)}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'الرصيد القائم غير المحصل'
                                                : 'Outstanding Balance'
                                        }: ${formatKWD(financials?.outstandingBalance || 0)}`}
                                        subtitle={
                                            isRTL
                                                ? `${financials?.unpaidCount || 0} فواتير غير مدفوعة`
                                                : `${financials?.unpaidCount || 0} unpaid invoices`
                                        }
                                        icon="pending_actions"
                                        tone={
                                            financials?.outstandingBalance > 0
                                                ? 'warning'
                                                : 'success'
                                        }
                                    />
                                    {/* Cost and Margin (Strictly Guarded by canViewCostData) */}
                                    {canViewCostData && financials?.totalCost !== undefined && (
                                        <MetricCardV2
                                            title={
                                                isRTL
                                                    ? 'تكلفة الشحن الإجمالية'
                                                    : 'Carrier Direct Cost'
                                            }
                                            value={formatKWD(financials?.totalCost || 0)}
                                            ariaLabel={`${
                                                isRTL
                                                    ? 'تكلفة الشحن الإجمالية'
                                                    : 'Carrier Direct Cost'
                                            }: ${formatKWD(financials?.totalCost || 0)}`}
                                            subtitle={
                                                isRTL
                                                    ? `هامش الربح: ${String(
                                                          financials?.marginPercentage || 0
                                                      ).replace(/%+$/, '')}%`
                                                    : `Gross Margin: ${String(
                                                          financials?.marginPercentage || 0
                                                      ).replace(/%+$/, '')}%`
                                            }
                                            icon="paid"
                                            tone="neutral"
                                            badge={
                                                financials?.grossMargin
                                                    ? `+${formatKWD(financials.grossMargin)}`
                                                    : null
                                            }
                                            badgeTone="success"
                                        />
                                    )}
                                    <MetricCardV2
                                        title={
                                            isRTL ? 'معدل الالتزام بالسداد' : 'Collection Rate'
                                        }
                                        value={
                                            financials?.totalBilled > 0
                                                ? `${Math.round(
                                                      ((financials.totalPaid || 0) /
                                                          financials.totalBilled) *
                                                          100
                                                  )}%`
                                                : '100%'
                                        }
                                        ariaLabel={`${
                                            isRTL ? 'معدل الالتزام بالسداد' : 'Collection Rate'
                                        }: ${
                                            financials?.totalBilled > 0
                                                ? Math.round(
                                                      ((financials.totalPaid || 0) /
                                                          financials.totalBilled) *
                                                          100
                                                  )
                                                : 100
                                        }%`}
                                        subtitle={
                                            isRTL
                                                ? 'نسبة التحصيل للمطالبات'
                                                : 'Settled vs issued ratio'
                                        }
                                        icon="savings"
                                        tone="success"
                                    />
                                </>
                            )}

                            {perspective === 'client' && (
                                <>
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'شحنات الشركة النشطة'
                                                : 'Active Company Shipments'
                                        }
                                        value={<AnimatedCounter value={stats?.inTransit || 0} />}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'شحنات الشركة النشطة'
                                                : 'Active Company Shipments'
                                        }: ${stats?.inTransit || 0} active, ${stats?.total || 0} total`}
                                        subtitle={
                                            isRTL
                                                ? `${stats?.total || 0} إجمالي الشحنات`
                                                : `${stats?.total || 0} total consignments`
                                        }
                                        icon="local_shipping"
                                        tone="info"
                                        onClick={() => setPipelineStage('in_transit')}
                                        isActive={pipelineStage === 'in_transit'}
                                    />
                                    {/* Balance & Credit Separated (Addresses F5) */}
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الرصيد المالي المتاح'
                                                : 'Available Account Balance'
                                        }
                                        value={formatKWD(user?.organization?.balance || 0)}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'الرصيد المالي المتاح'
                                                : 'Available Account Balance'
                                        }: ${formatKWD(user?.organization?.balance || 0)}`}
                                        subtitle={
                                            user?.organization?.creditLimit
                                                ? isRTL
                                                    ? `الحد الائتماني: ${formatKWD(
                                                          user.organization.creditLimit
                                                      )}`
                                                    : `Credit Limit: ${formatKWD(
                                                          user.organization.creditLimit
                                                      )}`
                                                : isRTL
                                                ? 'حساب نقدي قياسي'
                                                : 'Standard prepaid balance'
                                        }
                                        icon="account_balance"
                                        tone="neutral"
                                        badge={
                                            user?.organization?.creditLimit
                                                ? isRTL
                                                    ? 'تسهيل ائتماني'
                                                    : 'B2B Credit Line'
                                                : isRTL
                                                ? 'مسبق الدفع'
                                                : 'Prepaid'
                                        }
                                        badgeTone="info"
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الاستلامات المجدولة اليوم'
                                                : 'Pickups Scheduled Today'
                                        }
                                        value={<AnimatedCounter value={stats?.pending || 0} />}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'الاستلامات المجدولة اليوم'
                                                : 'Pickups Scheduled Today'
                                        }: ${stats?.pending || 0} awaiting pickup`}
                                        subtitle={
                                            isRTL
                                                ? 'بانتظار وصول مندوب الاستلام'
                                                : 'Awaiting courier collection'
                                        }
                                        icon="schedule"
                                        tone="warning"
                                        onClick={() => setPipelineStage('pending')}
                                        isActive={pipelineStage === 'pending'}
                                    />
                                    <MetricCardV2
                                        title={
                                            isRTL
                                                ? 'الشحنات المستلمة بالكامل'
                                                : 'Delivered & Cleared'
                                        }
                                        value={<AnimatedCounter value={stats?.delivered || 0} />}
                                        ariaLabel={`${
                                            isRTL
                                                ? 'الشحنات المستلمة بالكامل'
                                                : 'Delivered & Cleared'
                                        }: ${stats?.delivered || 0} completed`}
                                        subtitle={
                                            isRTL
                                                ? 'مكتملة وموثقة جمركياً'
                                                : 'Signed & customs cleared'
                                        }
                                        icon="task_alt"
                                        tone="success"
                                        onClick={() => setPipelineStage('delivered')}
                                        isActive={pipelineStage === 'delivered'}
                                    />
                                </>
                            )}
                        </section>

                        {/* Mid-Row: Volume / Trade Corridors (7/8 cols) & Carrier Network Health V2 (5/4 cols) */}
                        <section
                            aria-label="Network Health and Corridors"
                            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
                        >
                            <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-4 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className="material-symbols-outlined text-primary dark:text-sky-400 text-xl shrink-0"
                                                aria-hidden="true"
                                            >
                                                {chartView === 'volume'
                                                    ? 'bar_chart'
                                                    : 'connecting_airports'}
                                            </span>
                                            <h2 className="font-extrabold text-xs sm:text-sm tracking-tight text-slate-900 dark:text-slate-100 truncate">
                                                {chartView === 'volume'
                                                    ? isRTL
                                                        ? 'توزيع حجم الشحنات'
                                                        : 'Consignment Volume Distribution'
                                                    : isRTL
                                                    ? 'ممرات ومسارات الشحن النشطة'
                                                    : 'Active Freight Corridors'}
                                            </h2>
                                        </div>

                                        {/* Chart View Switcher */}
                                        <div
                                            className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                                            role="tablist"
                                            aria-label="Chart Type"
                                        >
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={chartView === 'volume'}
                                                onClick={() => setChartView('volume')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    chartView === 'volume'
                                                        ? 'bg-primary text-white shadow-2xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {isRTL ? 'الحجم' : 'Volume'}
                                            </button>
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={chartView === 'corridors'}
                                                onClick={() => setChartView('corridors')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    chartView === 'corridors'
                                                        ? 'bg-primary text-white shadow-2xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {isRTL ? 'المسارات' : 'Corridors'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Volume Timeframe Switcher */}
                                    {chartView === 'volume' && (
                                        <div
                                            className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl ms-auto"
                                            role="group"
                                            aria-label="Volume Timeframe"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setVolumeTimeframe('weekly')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    volumeTimeframe === 'weekly'
                                                        ? 'bg-slate-900 text-white dark:bg-primary dark:text-white shadow-2xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {isRTL ? 'أسبوعي' : 'Weekly'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVolumeTimeframe('monthly')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    volumeTimeframe === 'monthly'
                                                        ? 'bg-slate-900 text-white dark:bg-primary dark:text-white shadow-2xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {isRTL ? 'شهري' : 'Monthly'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Container-aware Responsive Chart */}
                                <div className="flex-1 flex items-center w-full min-w-0">
                                    {chartView === 'volume' ? (
                                        <VolumeBarChartV2
                                            data={
                                                volumeTimeframe === 'weekly'
                                                    ? weeklyChartData
                                                    : monthlyChartData
                                            }
                                            unit={isRTL ? 'طرد' : 'pkgs'}
                                            isRTL={isRTL}
                                            height={220}
                                        />
                                    ) : (
                                        <TradeLaneBarChartV2
                                            data={tradeCorridors}
                                            unit={isRTL ? 'طرد' : 'pkgs'}
                                            isRTL={isRTL}
                                            height={220}
                                            onSelect={(corridor) =>
                                                navigate(
                                                    `/shipments-v2?corridor=${encodeURIComponent(
                                                        corridor.id ||
                                                            corridor.code ||
                                                            corridor.corridor ||
                                                            ''
                                                    )}`
                                                )
                                            }
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="lg:col-span-5 xl:col-span-4 min-w-0 flex flex-col">
                                {carrierBreakdown.length > 0 ? (
                                    <CarrierNetworkHealthV2
                                        carriers={carrierBreakdown}
                                        isRTL={isRTL}
                                    />
                                ) : (
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center text-center h-full min-h-[220px]">
                                        <span
                                            className="material-symbols-outlined text-3xl text-slate-400 dark:text-slate-500 mb-2"
                                            aria-hidden="true"
                                        >
                                            hub
                                        </span>
                                        <p className="font-bold text-xs text-slate-500 dark:text-slate-400">
                                            {isRTL
                                                ? 'لا توجد بيانات نشطة للناقلين حالياً'
                                                : 'No active carrier telemetry recorded'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Pipeline Stage Tabs — Wrapping Responsive Pill Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div
                                className="flex flex-wrap items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800/90 p-1.5 rounded-2xl max-w-full"
                                role="tablist"
                                aria-label="Pipeline Stage Filter"
                            >
                                {[
                                    {
                                        id: 'all',
                                        label: isRTL ? 'الكل' : 'All Stages',
                                        count: stats?.total || 0
                                    },
                                    {
                                        id: 'pending',
                                        label: isRTL ? 'قيد التجهيز' : 'Pending Pickup',
                                        count: stats?.pending || 0
                                    },
                                    {
                                        id: 'in_transit',
                                        label: isRTL ? 'قيد النقل' : 'In Transit',
                                        count: stats?.inTransit || 0
                                    },
                                    {
                                        id: 'out_for_delivery',
                                        label: isRTL ? 'خرج للتسليم' : 'Out for Delivery',
                                        count: stats?.outForDelivery || 0
                                    },
                                    {
                                        id: 'exception',
                                        label: isRTL ? 'استثناء وتنبيه' : 'Exceptions',
                                        count: (stats?.exceptions || 0) + (triageCount || 0)
                                    },
                                    {
                                        id: 'delivered',
                                        label: isRTL ? 'تم التسليم' : 'Delivered',
                                        count: stats?.delivered || 0
                                    }
                                ].map((tab) => {
                                    const isSelected = pipelineStage === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={isSelected}
                                            onClick={() => setPipelineStage(tab.id)}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                isSelected
                                                    ? 'bg-primary text-white shadow-2xs'
                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
                                            }`}
                                        >
                                            <span>{tab.label}</span>
                                            <span
                                                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none tabular-nums ${
                                                    isSelected
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-slate-300/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                                }`}
                                            >
                                                {tab.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <Link
                                to="/shipment/new-v2"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs transition-colors ms-auto whitespace-nowrap shrink-0"
                            >
                                <span
                                    className="material-symbols-outlined text-sm leading-none"
                                    aria-hidden="true"
                                >
                                    add
                                </span>
                                <span>{isRTL ? 'شحنة جديدة' : 'New Shipment'}</span>
                            </Link>
                        </div>

                        {/* Active Manifests Table */}
                        <section
                            aria-label="Consignment Manifest Table"
                            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden"
                        >
                            <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
                                <div>
                                    <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                                        {isRTL
                                            ? 'سجل الشحنات والبيانات الجمركية'
                                            : 'Consignment Manifests & Milestone Telemetry'}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {isRTL
                                            ? 'معاينة فورية لتفاصيل ومسارات الشحنات النشطة'
                                            : 'Real-time telemetry, customs checkpoints, and courier status'}
                                    </p>
                                </div>
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                    {shipmentsList.length}{' '}
                                    {isRTL ? 'شحنة معروضة' : 'manifests loaded'}
                                </span>
                            </div>

                            {shipmentsLoading ? (
                                <div className="p-12 flex justify-center items-center">
                                    <span
                                        className="loading loading-spinner loading-md text-primary"
                                        aria-label="Loading manifest rows"
                                    ></span>
                                </div>
                            ) : shipmentsList.length === 0 ? (
                                <EmptyStateV2
                                    title={
                                        isRTL
                                            ? 'لا توجد شحنات مطابقة'
                                            : 'No consignments found in this stage'
                                    }
                                    description={
                                        isRTL
                                            ? 'لم يتم العثور على شحنات ضمن المعايير المحددة حالياً.'
                                            : 'Try selecting another stage or period to view records.'
                                    }
                                    actionLabel={isRTL ? 'إنشاء شحنة' : 'Create Shipment'}
                                    onAction={() => navigate('/shipment/new-v2')}
                                />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-start border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                                                <th className="text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                    {isRTL ? 'رقم الشحنة' : 'Tracking #'}
                                                </th>
                                                <th className="text-end sm:text-start py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                    {isRTL ? 'الحالة' : 'Status'}
                                                </th>
                                                <th className="hidden sm:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                    {isRTL ? 'المسار' : 'Route'}
                                                </th>
                                                <th className="hidden sm:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                    {isRTL ? 'الناقل' : 'Carrier'}
                                                </th>
                                                <th className="hidden lg:table-cell text-start py-2.5 px-2.5 lg:px-4">
                                                    {isRTL ? 'المستلم' : 'Consignee'}
                                                </th>
                                                <th className="hidden sm:table-cell text-end py-2.5 px-2.5 sm:px-3 lg:px-4">
                                                    {isRTL ? 'إجراء' : 'Actions'}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                            {shipmentsList.map((shipment) => {
                                                const trackingId =
                                                    shipment.trackingNumber ||
                                                    shipment.waybillNumber ||
                                                    shipment.id;
                                                const carrierInfo = resolveCarrierInfo(
                                                    shipment,
                                                    isRTL,
                                                    ['admin', 'staff', 'warehouse', 'accounting', 'driver'].includes(String(user?.role || '').toLowerCase())
                                                );
                                                const consigneeName = resolveConsigneeName(
                                                    shipment,
                                                    isRTL
                                                );
                                                const originObj = shipment.origin || {
                                                    city: shipment.originCity || 'Kuwait City',
                                                    countryCode: shipment.originCountry || 'KW'
                                                };
                                                const destObj = shipment.destination || {
                                                    city:
                                                        shipment.destinationCity ||
                                                        shipment.destCity ||
                                                        'Riyadh',
                                                    countryCode:
                                                        shipment.destinationCountry ||
                                                        shipment.destCountry ||
                                                        'SA'
                                                };
                                                const mobileOriginCity =
                                                    typeof originObj === 'string'
                                                        ? originObj
                                                        : originObj?.city || 'Kuwait';
                                                const mobileDestCity =
                                                    typeof destObj === 'string'
                                                        ? destObj
                                                        : destObj?.city || 'Riyadh';

                                                return (
                                                    <tr
                                                        key={shipment.id || trackingId}
                                                        onClick={() =>
                                                            handleInspectShipment(shipment)
                                                        }
                                                        className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                                                    >
                                                        <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle">
                                                            <div className="font-mono text-xs font-extrabold text-primary dark:text-sky-400 whitespace-nowrap">
                                                                {trackingId}
                                                            </div>
                                                            {/* Compact Mobile Summary (< 640px) */}
                                                            <div className="sm:hidden text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-0.5 truncate max-w-[150px]">
                                                                {mobileOriginCity}{' '}
                                                                <span className="text-primary dark:text-sky-400 font-black">
                                                                    {isRTL ? '←' : '→'}
                                                                </span>{' '}
                                                                {mobileDestCity}
                                                            </div>
                                                            <div className="sm:hidden text-[10.5px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                                                                {carrierInfo.name} • {consigneeName}
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end sm:text-start">
                                                            <StatusBadge
                                                                status={shipment.status}
                                                                size="xs"
                                                            />
                                                        </td>
                                                        <td className="hidden sm:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                            <TradeRouteDisplay
                                                                origin={originObj}
                                                                destination={destObj}
                                                            />
                                                        </td>
                                                        <td className="hidden sm:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                                <span
                                                                    className={`w-2 h-2 rounded-full shrink-0 ${carrierInfo.dotClass}`}
                                                                    aria-hidden="true"
                                                                />
                                                                <span>{carrierInfo.name}</span>
                                                            </div>
                                                            <div className="lg:hidden text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[130px] mt-0.5">
                                                                {consigneeName}
                                                            </div>
                                                        </td>
                                                        <td className="hidden lg:table-cell py-2.5 px-2.5 lg:px-4 align-middle">
                                                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                                                                {consigneeName}
                                                            </div>
                                                        </td>
                                                        <td className="hidden sm:table-cell py-2.5 px-2.5 sm:px-3 lg:px-4 align-middle text-end">
                                                            <button
                                                                type="button"
                                                                aria-label={isRTL ? 'معاينة الشحنة' : 'Inspect shipment'}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleInspectShipment(shipment);
                                                                }}
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-primary dark:text-sky-400 hover:bg-primary/10 dark:hover:bg-sky-400/15 transition-colors whitespace-nowrap cursor-pointer"
                                                            >
                                                                <span
                                                                    className="material-symbols-outlined text-sm leading-none"
                                                                    aria-hidden="true"
                                                                >
                                                                    visibility
                                                                </span>
                                                                <span className="hidden lg:inline">
                                                                    {isRTL ? 'معاينة' : 'Inspect'}
                                                                </span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>

            {/* Shipment Inspector Drawer */}
            {drawerOpen && selectedShipment && (
                <ShipmentInspectorDrawer
                    shipment={selectedShipment}
                    isOpen={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                />
            )}
        </div>
    );
};

export default DashboardV2Page;
