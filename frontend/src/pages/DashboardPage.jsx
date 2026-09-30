import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useShipmentStats } from '../utils/useShipmentStats';
import { useShipmentTriage } from '../utils/useShipmentTriage';
import { useShipments } from '../utils/useShipments';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { STATUS_CONFIG } from '../tokens/kineticHorizon';
import { getRoleLabel } from '../utils/roleLabels';
import { organizationService } from '../services/api';
import VolumeBarChart from '../components/charts/VolumeBarChart';
import TradeLaneBarChart from '../components/charts/TradeLaneBarChart';
import CarrierNetworkHealth from '../components/CarrierNetworkHealth';
import StatusBadge from '../components/common/StatusBadge';
import TradeRouteDisplay from '../components/common/TradeRouteDisplay';
import ShipmentInspectorDrawer from '../components/common/ShipmentInspectorDrawer';

/**
 * Animated Number Counter
 */
const AnimatedNumber = ({ value = 0, duration = 800 }) => {
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
 * Velocity Progress Indicator using DaisyUI
 */
const VelocityIndicator = ({ label, value, displayValue, target, targetLabel = 'Target', progressClass = 'progress-primary', icon = 'speed' }) => {
    const pct = Math.min(100, Math.max(0, value));
    return (
        <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5 font-bold text-base-content">
                    <span className="material-symbols-outlined text-sm opacity-75">{icon}</span>
                    <span>{label}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="font-extrabold text-sm text-base-content">{displayValue || `${value}%`}</span>
                    {target && <span className="text-[10.5px] text-base-content/50 font-medium">({targetLabel}: {target})</span>}
                </div>
            </div>
            <progress className={`progress ${progressClass} w-full h-2`} value={pct} max="100"></progress>
        </div>
    );
};

/**
 * Target Logistics Global - Hybrid Operations & Client Management Cockpit
 * Role-tailored: Superadmin, Target Owner, Target Accounting, Target Ops, & Client Accounts.
 */
const DashboardPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { t, lang } = useLanguage();
    const isRTL = lang === 'ar';
    
    // User Role Hierarchy Analysis
    const userRole = user?.role || 'staff';
    const isSuperadmin = userRole === 'admin';
    const isTargetOwner = userRole === 'manager';
    const isTargetAccounting = userRole === 'accounting';
    const isTargetManagement = ['admin', 'manager', 'accounting', 'staff'].includes(userRole);
    const isClientUser = ['org_manager', 'org_agent', 'client'].includes(userRole);
    const canViewFinancials = ['admin', 'manager', 'accounting'].includes(userRole);

    // Context & Perspective State
    const [perspective, setPerspective] = useState(isClientUser ? 'client' : isTargetAccounting ? 'accounting' : 'target');
    const [selectedOrgId, setSelectedOrgId] = useState('all');
    const [organizations, setOrganizations] = useState([
        { id: 'all', name: isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations', balance: 0, creditLimit: 0 }
    ]);

    // Data filtering & inspection state
    const [pipelineStage, setPipelineStage] = useState('all'); // 'all' | 'pending' | 'in_transit' | 'exception' | 'delivered'
    const [selectedPeriod, setSelectedPeriod] = useState('this_month'); // 'today' | '7days' | 'this_month' | 'last_month' | 'all' | 'custom'
    const [kviCarrier, setKviCarrier] = useState('all'); // 'all' | 'DGR' | 'ARM' | 'FDX' | 'MAN'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
    const [timeframe, setTimeframe] = useState('weekly');
    const [selectedShipment, setSelectedShipment] = useState(null); // Inspector drawer state
    const [copiedWaybill, setCopiedWaybill] = useState(false);

    // Fetch dynamic organizations from backend
    useEffect(() => {
        let isMounted = true;
        organizationService.getOrganizations()
            .then(res => {
                const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                if (list.length > 0 && isMounted) {
                    const totalBal = list.reduce((acc, o) => acc + (Number(o.balance) || 0), 0);
                    const totalCred = list.reduce((acc, o) => acc + (Number(o.creditLimit) || 0), 0);
                    const mapped = list.map(o => ({
                        id: o.id,
                        name: o.name,
                        balance: Number(o.balance) || 0,
                        creditLimit: Number(o.creditLimit) || 0,
                        contact: o.billingWhatsappNumber || o.billingEmail || '+965 9000 1000'
                    }));
                    setOrganizations([
                        { id: 'all', name: isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations', balance: totalBal, creditLimit: totalCred },
                        ...mapped
                    ]);
                }
            })
            .catch(() => {
                // Keep initial state
            });
        return () => { isMounted = false; };
    }, [isRTL]);

    const activeOrg = useMemo(() => {
        return organizations.find(o => o.id === selectedOrgId) || organizations[0];
    }, [organizations, selectedOrgId]);

    const PIPELINE_STATUS_MAP = {
        all: undefined,
        pending: 'pending,ready_for_pickup,created,draft,updated',
        in_transit: 'in_transit,picked_up,received_at_hub,verified,booked',
        out_for_delivery: 'out_for_delivery',
        exception: 'exception,failed,returned,cancelled',
        delivered: 'delivered,completed'
    };

    const statsParams = useMemo(() => ({
        organizationId: selectedOrgId !== 'all' ? selectedOrgId : undefined,
        period: selectedPeriod === 'custom' ? undefined : selectedPeriod,
        startDate: selectedPeriod === 'custom' ? customStartDate : undefined,
        endDate: selectedPeriod === 'custom' ? customEndDate : undefined
    }), [selectedOrgId, selectedPeriod, customStartDate, customEndDate]);

    const { stats, loading: statsLoading } = useShipmentStats(statsParams);
    const { triageItems, count: triageCount, loading: triageLoading } = useShipmentTriage(selectedOrgId);
    const { shipments: rawShipments, loading: recentLoading } = useShipments({ 
        limit: 25, 
        statusIn: PIPELINE_STATUS_MAP[pipelineStage],
        organizationId: selectedOrgId !== 'all' ? selectedOrgId : undefined,
        period: selectedPeriod === 'custom' ? undefined : selectedPeriod,
        startDate: selectedPeriod === 'custom' ? customStartDate : undefined,
        endDate: selectedPeriod === 'custom' ? customEndDate : undefined
    });

    const filteredShipments = useMemo(() => {
        return rawShipments || [];
    }, [rawShipments]);

    // Dynamic Trade Lanes / Corridors Telemetry from live database
    const tradeCorridors = useMemo(() => {
        if (Array.isArray(stats?.corridors) && stats.corridors.length > 0) {
            return stats.corridors.filter(c => (c.volume || 0) > 0);
        }
        return [];
    }, [stats?.corridors]);

    // Top active corridor by volume
    const topCorridor = useMemo(() => {
        if (!tradeCorridors || tradeCorridors.length === 0) return null;
        const active = [...tradeCorridors].filter(c => (c.volume || 0) > 0).sort((a, b) => b.volume - a.volume);
        return active[0] || null;
    }, [tradeCorridors]);

    const maxCorridorVol = useMemo(() => {
        if (!tradeCorridors || tradeCorridors.length === 0) return 1;
        return Math.max(...tradeCorridors.map(c => c.volume || 0), 1);
    }, [tradeCorridors]);

    // Live Carrier Network Breakdown from database (Ranked by volume)
    const carrierBreakdown = useMemo(() => {
        if (Array.isArray(stats?.carriers) && stats.carriers.length > 0) {
            return stats.carriers
                .filter(c => (c.count || 0) > 0)
                .sort((a, b) => (b.count || 0) - (a.count || 0));
        }
        return [];
    }, [stats?.carriers]);

    // Active KVI object (switches dynamically based on selected carrier pill)
    const activeKvi = useMemo(() => {
        if (kviCarrier !== 'all' && Array.isArray(stats?.carriers)) {
            const selectedCar = stats.carriers.find(c => c.code === kviCarrier);
            if (selectedCar?.kvi) return { ...selectedCar.kvi, carrier: selectedCar };
        }
        return stats?.kvi || {};
    }, [kviCarrier, stats]);

    // Live Financial Aggregates from database
    const financials = stats?.financials || null;

    // Live Total B2B Receivables dynamically scoped by selected organization and selected period
    const totalReceivables = useMemo(() => {
        // If a specific period is selected (other than 'all') and financials are loaded from backend stats
        if (selectedPeriod !== 'all') {
            if (financials?.outstandingBalance !== undefined && financials?.outstandingBalance !== null) {
                return Number(financials.outstandingBalance) || 0;
            }
        }
        // If all-time is selected for a specific organization
        if (selectedOrgId !== 'all') {
            return Number(activeOrg?.balance) || 0;
        }
        // All organizations across all-time: sum of all active organization ledger balances
        return organizations.reduce((acc, o) => acc + (o.id !== 'all' ? (Number(o.balance) || 0) : 0), 0);
    }, [organizations, selectedOrgId, activeOrg, selectedPeriod, financials]);

    // Dynamic On-Time SLA from live database
    const networkSla = useMemo(() => {
        if (stats?.kvi?.healthyPipelineSla) return stats.kvi.healthyPipelineSla;
        if (stats?.kvi?.onTimeRate) return stats.kvi.onTimeRate;
        const totalTracked = (stats?.delivered || 0) + (stats?.inTransit || 0) + (stats?.exceptions || 0);
        if (totalTracked === 0) return '—';
        const rate = (((stats?.delivered || 0) + (stats?.inTransit || 0)) / totalTracked) * 100;
        return `${rate.toFixed(1)}%`;
    }, [stats]);

    // Client Perspective stats
    const clientActiveCount = useMemo(() => {
        return (stats?.inTransit || 0) + (stats?.pickedUp || 0);
    }, [stats]);

    // Live Volume Chart Data from backend stats
    const weeklyChartData = useMemo(() => {
        if (Array.isArray(stats?.weekly) && stats.weekly.length > 0) {
            return stats.weekly.map(w => ({
                label: isRTL ? (w.labelAr || w.label) : w.label,
                count: w.count
            }));
        }
        const days = isRTL 
            ? ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return days.map(day => ({ label: day, count: 0 }));
    }, [stats?.weekly, isRTL]);

    const monthlyChartData = useMemo(() => {
        const monthNames = isRTL
            ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (Array.isArray(stats?.monthly) && stats.monthly.length > 0) {
            return stats.monthly.map(m => ({
                label: monthNames[(m.month - 1) % 12],
                count: m.count
            }));
        }
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ label: monthNames[d.getMonth()], count: 0 });
        }
        return months;
    }, [stats?.monthly, isRTL]);

    const copyTracking = (num) => {
        navigator.clipboard.writeText(num);
        setCopiedWaybill(true);
        setTimeout(() => setCopiedWaybill(false), 2000);
    };

    if (statsLoading && !stats.total) {
        return (
            <div className="flex justify-center items-center min-h-[70vh]">
                <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-3 space-y-6">
            {/* Command Header: Role Clearance & Dynamic Context Switcher */}
            <div className="bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                
                {/* Operator Profile & Role Indicator */}
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-2xl">
                            {isSuperadmin ? 'admin_panel_settings' : isTargetOwner ? 'crown' : isTargetAccounting ? 'account_balance' : 'hub'}
                        </span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-base-content">
                                {t('dash_hello', 'Hello,')} {user?.name?.split(' ')[0] || (isRTL ? 'المشغل' : 'Operator')}
                            </h1>
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-primary text-white shadow-xs">
                                {getRoleLabel(userRole)}
                            </span>
                            {isTargetOwner && (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-amber-600 text-white shadow-xs">
                                    Executive Authority
                                </span>
                            )}
                            {isTargetAccounting && (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-teal-600 text-white shadow-xs">
                                    Finance Controller
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-base-content/60 font-semibold mt-0.5">
                            {isTargetManagement 
                                ? (isRTL ? 'مركز العمليات الدولية والربط الجمركي • مطار الكويت الدولي (KWI)' : 'Global Air Cargo Telemetry & Customs Gate • Kuwait Hub (KWI)')
                                : (isRTL ? 'بوابة إدارة حساب الشركة والشحنات الصادرة والواردة' : 'B2B Enterprise Portal & Consignment Dispatcher')}
                        </p>
                    </div>
                </div>

                {/* Perspective & Organization Context Selector */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    
                    {/* Organization Dropdown */}
                    {isTargetManagement && (
                        <div className="form-control">
                            <label className="label py-0.5 px-1">
                                <span className="label-text text-[10.5px] font-black uppercase tracking-wider text-base-content/60">
                                    {isRTL ? 'نطاق الحساب المحدد' : 'Selected Account Scope'}
                                </span>
                            </label>
                            <select 
                                value={selectedOrgId} 
                                onChange={(e) => setSelectedOrgId(e.target.value)}
                                className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100 text-base-content w-full sm:w-64"
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Dual Mode Switcher (Target Management vs Client View) */}
                    {isTargetManagement && (
                        <div className="form-control">
                            <label className="label py-0.5 px-1">
                                <span className="label-text text-[10.5px] font-black uppercase tracking-wider text-base-content/60">
                                    {isRTL ? 'منظور الواجهة' : 'Cockpit Perspective'}
                                </span>
                            </label>
                            <div className="join w-full">
                                <button
                                    onClick={() => setPerspective('target')}
                                    className={`btn btn-sm join-item font-bold text-xs flex-1 ${
                                        perspective === 'target' ? 'btn-primary' : 'btn-ghost border-base-300'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">hub</span>
                                    {isRTL ? 'إدارة تارغت' : 'Target Ops'}
                                </button>
                                <button
                                    onClick={() => setPerspective('client')}
                                    className={`btn btn-sm join-item font-bold text-xs flex-1 ${
                                        perspective === 'client' ? 'btn-primary' : 'btn-ghost border-base-300'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">apartment</span>
                                    {isRTL ? 'حساب العميل' : 'Client View'}
                                </button>
                                {isTargetAccounting && (
                                    <button
                                        onClick={() => setPerspective('accounting')}
                                        className={`btn btn-sm join-item font-bold text-xs flex-1 ${
                                            perspective === 'accounting' ? 'btn-primary' : 'btn-ghost border-base-300'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-sm">account_balance</span>
                                        {isRTL ? 'المحاسبة' : 'Finance'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Quick Action Button */}
                    <div className="sm:self-end">
                        <button 
                            onClick={() => navigate('/shipment/new')}
                            className="btn btn-primary btn-sm rounded-xl font-extrabold shadow-sm w-full gap-1.5 px-4"
                        >
                            <span className="material-symbols-outlined text-base">add_circle</span>
                            {isRTL ? 'شحنة جديدة' : 'New Waybill'}
                        </button>
                    </div>
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
                                {isRTL ? 'نطاق الفترة الزمنية' : 'Dashboard Period'}
                            </span>
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-primary text-white shadow-xs">
                                {selectedPeriod === 'today' && (isRTL ? 'اليوم' : 'Today')}
                                {selectedPeriod === '7days' && (isRTL ? 'آخر 7 أيام' : 'Past 7 Days')}
                                {selectedPeriod === 'this_month' && (isRTL ? 'هذا الشهر' : 'This Month')}
                                {selectedPeriod === 'last_month' && (isRTL ? 'الشهر الماضي' : 'Last Month')}
                                {selectedPeriod === 'all' && (isRTL ? 'جميع البيانات التاريخية' : 'All-Time')}
                                {selectedPeriod === 'custom' && (isRTL ? 'نطاق مخصص' : 'Custom Range')}
                            </span>
                        </div>
                        <p className="text-[11px] text-base-content/60 font-medium mt-0.5">
                            {selectedPeriod === 'today' && (isRTL ? 'عرض إحصائيات وشحنات اليوم فقط' : 'Displaying metrics and shipments recorded today')}
                            {selectedPeriod === '7days' && (isRTL ? 'عرض إحصائيات آخر 7 أيام تشغيلية' : 'Displaying metrics for the past 7 operational days')}
                            {selectedPeriod === 'this_month' && (isRTL ? 'عرض إحصائيات دورة الشهر الحالي' : 'Displaying metrics for current monthly billing & shipping cycle')}
                            {selectedPeriod === 'last_month' && (isRTL ? 'عرض إحصائيات الشهر الماضي كاملاً' : 'Displaying metrics for full previous calendar month')}
                            {selectedPeriod === 'all' && (isRTL ? 'نظرة شاملة لكافة البيانات المسجلة' : 'Complete historical ledger and operational overview')}
                            {selectedPeriod === 'custom' && (isRTL ? `الفترة المحددة: ${customStartDate || 'من البداية'} إلى ${customEndDate || 'اليوم'}` : `Selected range: ${customStartDate || 'Start'} to ${customEndDate || 'End'}`)}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Preset Period Buttons */}
                    <div className="join w-full sm:w-auto overflow-x-auto">
                        {[
                            { id: 'today', label: isRTL ? 'اليوم' : 'Today', icon: 'today' },
                            { id: '7days', label: isRTL ? '7 أيام' : '7 Days', icon: 'date_range' },
                            { id: 'this_month', label: isRTL ? 'هذا الشهر' : 'This Month', icon: 'calendar_today' },
                            { id: 'last_month', label: isRTL ? 'الشهر الماضي' : 'Last Month', icon: 'history' },
                            { id: 'all', label: isRTL ? 'الكل' : 'All Time', icon: 'all_inclusive' },
                            { id: 'custom', label: isRTL ? 'مخصص' : 'Custom', icon: 'tune' },
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
                                title={isRTL ? 'تاريخ البدء' : 'Start Date'}
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
                                title={isRTL ? 'تاريخ الانتهاء' : 'End Date'}
                            />
                            {(customStartDate || customEndDate) && (
                                <button
                                    onClick={() => {
                                        setCustomStartDate('');
                                        setCustomEndDate('');
                                        setSelectedPeriod('this_month');
                                        setIsCustomDateOpen(false);
                                    }}
                                    className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-error"
                                    title={isRTL ? 'إعادة ضبط' : 'Reset Range'}
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* DYNAMIC PULSE & ACTIVE TRADE LANES ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* LEFT (7 or 8 cols): 4 Compact Metric Cards (2x2 Grid) */}
                <div className="lg:col-span-7 xl:col-span-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
                        {perspective === 'target' ? (
                            <>
                                {/* 1. Active Pipeline */}
                                <div 
                                    onClick={() => navigate('/shipments?status=active')}
                                    className="card bg-base-100 border border-base-200/90 hover:border-primary/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                        <span>{isRTL ? 'إجمالي خط النقل النشط' : 'Active Pipeline'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">flight_takeoff</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">
                                            <AnimatedNumber value={(stats?.inTransit || 0) + (stats?.pickedUp || 0)} />
                                        </span>
                                        {stats?.total > 0 ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                                                {Math.round((((stats?.inTransit || 0) + (stats?.pickedUp || 0)) / stats.total) * 100)}% {isRTL ? 'نشط' : 'active'}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                                                Nominal
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-base-content/60 mt-1 truncate">{isRTL ? 'طرد قيد الشحن العابر للحدود (اضغط للعرض)' : 'Packages in flight/transit (Click to view)'}</span>
                                </div>

                                {/* 2. Urgent Triage Queue */}
                                <div 
                                    onClick={() => navigate('/shipments?status=exceptions')}
                                    className="card bg-base-100 border border-error/30 hover:border-error shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between bg-error/5 cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-error font-extrabold uppercase tracking-wider">
                                        <span>{isRTL ? 'طابور التدخل والاستثناءات' : 'Urgent Triage Queue'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-error/15 text-error flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">warning</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-error">
                                            <AnimatedNumber value={triageCount || triageItems.length} />
                                        </span>
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black shadow-xs text-white ${triageItems.length > 0 ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                            {triageItems.length > 0 ? (isRTL ? 'يتطلب إجراء فوري' : 'Action Required') : (isRTL ? 'طبيعي' : 'Nominal')}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-error/80 mt-1 truncate">
                                        {triageItems.length === 0 ? (isRTL ? '0 استثناءات معطلة' : '0 delivery blockers') : (isRTL ? `${triageItems.length} شحنة تتطلب إجراء (اضغط للعرض)` : `${triageItems.length} shipments requiring action`)}
                                    </span>
                                </div>

                                {/* 3. Network On-Time SLA */}
                                <div 
                                    onClick={() => navigate('/shipments')}
                                    className="card bg-base-100 border border-base-200/90 hover:border-success/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                        <span>{isRTL ? 'دقة الالتزام بالمواعيد (SLA)' : 'Network On-Time SLA'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">verified</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">{networkSla}</span>
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                                            Nominal
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-base-content/60 mt-1 truncate">{isRTL ? 'معدل التسليم الدولي بالموعد' : 'Live delivery performance across network'}</span>
                                </div>

                                {/* 4. Total B2B Receivables */}
                                {canViewFinancials ? (
                                    <div 
                                        onClick={() => navigate('/finance')}
                                        className="card bg-base-100 border border-base-200/90 hover:border-warning/60 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                    >
                                        <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                            <span>
                                                {selectedOrgId !== 'all'
                                                    ? (isRTL ? 'مستحقات الحساب (ذمم)' : 'Account Receivables')
                                                    : (isRTL ? 'مستحقات الحسابات (ذمم)' : 'Total B2B Receivables')}
                                            </span>
                                            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                                <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-2 mt-1">
                                            <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">
                                                <AnimatedNumber value={Math.round(totalReceivables)} />
                                            </span>
                                            <span className="text-xs font-bold text-base-content/60 font-mono">
                                                .{((totalReceivables % 1) * 1000).toFixed(0).padStart(3, '0')} KWD
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-base-content/60 mt-1 truncate">
                                            {selectedOrgId !== 'all'
                                                ? (selectedPeriod !== 'all'
                                                    ? (isRTL ? `المستحقات غير المحصلة لحساب ${activeOrg.name}` : `Uncollected receivables for ${activeOrg.name}`)
                                                    : (isRTL ? `رصيد حساب ${activeOrg.name}` : `Active ledger balance for ${activeOrg.name}`))
                                                : (selectedPeriod !== 'all'
                                                    ? (isRTL ? 'إجمالي المستحقات غير المحصلة' : 'Outstanding period receivables')
                                                    : (isRTL ? 'رصيد الشركات الفعلي غير المحصل' : 'Active ledger balances across accounts'))
                                            }
                                        </span>
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => navigate('/shipments?status=delivered')}
                                        className="card bg-base-100 border border-base-200/90 hover:border-success/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                    >
                                        <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                            <span>{isRTL ? 'الشحنات المسلمة بنجاح' : 'Delivered Consignments'}</span>
                                            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                                <span className="material-symbols-outlined text-2xl">check_circle</span>
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-2 mt-1">
                                            <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">
                                                <AnimatedNumber value={stats?.delivered || 0} />
                                            </span>
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                                                {isRTL ? 'مكتمل' : 'Fulfilled'}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-base-content/60 mt-1 truncate">{isRTL ? 'إجمالي الشحنات المنجزة' : 'Total consignments delivered'}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            // Client perspective
                            <>
                                <div 
                                    onClick={() => navigate('/shipments?status=active')}
                                    className="card bg-base-100 border border-base-200/90 hover:border-primary/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                        <span>{isRTL ? 'شحنات الشركة النشطة' : 'Active Company Shipments'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">local_shipping</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-base-content"><AnimatedNumber value={clientActiveCount} /></span>
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-xs">{activeOrg.name.slice(0, 15)}...</span>
                                    </div>
                                    <span className="text-[11px] text-base-content/60 mt-1 truncate">{isRTL ? 'شحنات قيد التوصيل والجمارك' : 'Consignments moving globally'}</span>
                                </div>

                                <div 
                                    onClick={() => navigate('/finance')}
                                    className="card bg-base-100 border border-base-200/90 hover:border-accent/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                        <span>{isRTL ? 'رصيد الحساب المالي' : 'Account Balance'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">payments</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">{activeOrg.balance.toFixed(3)}</span>
                                        <span className="text-xs font-bold text-base-content/60 font-mono">KWD</span>
                                    </div>
                                    <span className="text-[11px] text-base-content/60 mt-1 truncate">
                                        {isRTL ? `الحد الائتماني: ${activeOrg.creditLimit.toLocaleString()} د.ك` : `Credit Limit: ${activeOrg.creditLimit.toLocaleString()} KWD`}
                                    </span>
                                </div>

                                <div 
                                    onClick={() => navigate('/shipments?status=pending')}
                                    className="card bg-base-100 border border-base-200/90 hover:border-info/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                        <span>{isRTL ? 'طلبات الاستلام اليوم' : 'Pickups Scheduled Today'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-info/10 text-info flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">schedule</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">
                                            <AnimatedNumber value={stats?.pending || 0} />
                                        </span>
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-sky-600 text-white shadow-xs">{isRTL ? 'مجدول' : 'Scheduled'}</span>
                                    </div>
                                    <span className="text-[11px] text-base-content/60 mt-1 truncate">{isRTL ? 'موعد الاستلام القادم: خلال يوم العمل' : 'Standard courier pickup dispatch'}</span>
                                </div>

                                <div 
                                    onClick={() => navigate('/finance')}
                                    className="card bg-base-100 border border-base-200/90 hover:border-success/50 shadow-sm p-3.5 sm:p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group"
                                >
                                    <div className="flex justify-between items-center text-xs text-base-content/60 font-bold uppercase tracking-wider">
                                        <span>{isRTL ? 'الفواتير والبيانات الجمركية' : 'Invoices & Customs'}</span>
                                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">receipt_long</span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-2xl sm:text-3xl font-black font-mono text-base-content">{networkSla}</span>
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">{isRTL ? 'معتمد' : 'Verified'}</span>
                                    </div>
                                    <span className="text-[11px] text-base-content/60 mt-1 truncate">{isRTL ? 'جميع البيانات الجمركية مصادقة' : 'Customs declarations in good standing'}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT (5 or 4 cols): Active Trade Lane Corridors Bar Chart Widget (Top Right Corner) */}
                <div className="lg:col-span-5 xl:col-span-4">
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 flex flex-col justify-between h-full hover:shadow-md transition-all">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-lg">bar_chart</span>
                                </div>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-black text-base-content flex items-center gap-1.5">
                                        <span>{isRTL ? 'مسارات الشحن والربط الدولي' : 'Active Trade Lanes'}</span>
                                    </h3>
                                    <p className="text-[10.5px] text-base-content/60 font-medium">
                                        {isRTL ? 'مقارنة حجم التدفق عبر المسارات' : 'Throughput comparison across corridors'}
                                    </p>
                                </div>
                            </div>
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-xs">
                                {tradeCorridors.reduce((acc, c) => acc + (c.volume || 0), 0).toLocaleString()} {isRTL ? 'طرد' : 'pkgs'}
                            </span>
                        </div>

                        <div className="flex-1 flex flex-col justify-end pt-1">
                            <TradeLaneBarChart 
                                data={tradeCorridors}
                                height={155}
                                unit={isRTL ? 'طرد' : 'pkgs'}
                                onSelect={(destCode) => navigate(`/shipments?q=${destCode}`)}
                                isRTL={isRTL}
                            />
                        </div>
                    </div>
                </div>

            </div>

            {/* TWO-COLUMN COMMAND WORKSPACE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* LEFT WING (65%): Carrier Network, Pipeline Lifecycle, & Manifest Grid */}
                <div className="lg:col-span-8 space-y-5">

                    {/* Carrier Network Health */}
                    {isTargetManagement && perspective === 'target' && carrierBreakdown.length > 0 && (
                        <CarrierNetworkHealth 
                            carriers={carrierBreakdown} 
                            isRTL={isRTL} 
                            onCarrierClick={(code) => navigate(`/shipments?carrier=${code}`)} 
                        />
                    )}

                    {/* Operational Manifest Table with Pipeline Stage Filter */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl overflow-hidden">
                        
                        {/* Table Header & Pipeline Stage Tabs */}
                        <div className="p-4 sm:p-5 border-b border-base-200/80 space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <h3 className="text-base font-black text-base-content flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-xl">inventory_2</span>
                                        {isRTL ? 'بيان الشحنات والمانيفست التشغيلي' : 'Active Consignment Manifests'}
                                    </h3>
                                    <p className="text-xs text-base-content/60 font-medium">
                                        {isRTL 
                                            ? `عرض شحنات: ${activeOrg.name} (${filteredShipments.length} شحنة معروضة)` 
                                            : `Displaying consignments for ${activeOrg.name} (${filteredShipments.length} shown)`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => navigate(`/shipments?org=${selectedOrgId}&status=${pipelineStage === 'exception' ? 'exceptions' : pipelineStage}`)} 
                                        className="btn btn-outline btn-xs font-bold rounded-lg"
                                    >
                                        {isRTL ? 'عرض الجدول الموسع' : 'Full Table View'}
                                    </button>
                                </div>
                            </div>

                            {/* Lifecycle Stage Filter Buttons with Live Badges */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
                                {[
                                    { id: 'all', label: isRTL ? 'الكل' : 'All', count: stats?.total || 0 },
                                    { id: 'pending', label: isRTL ? 'استلام وبوابة' : 'Pending Gate', count: stats?.pending || 0 },
                                    { id: 'in_transit', label: isRTL ? 'نقل جوي' : 'In Flight', count: (stats?.inTransit || 0) + (stats?.pickedUp || 0) },
                                    { id: 'out_for_delivery', label: isRTL ? 'مع المندوب' : 'Out for Delivery', count: stats?.outForDelivery || 0 },
                                    { id: 'exception', label: isRTL ? 'استثناء / جمارك' : 'Customs Hold', count: stats?.exceptions || 0, isError: true },
                                    { id: 'delivered', label: isRTL ? 'تم التسليم' : 'Delivered', count: stats?.delivered || 0, isSuccess: true },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setPipelineStage(tab.id)}
                                        className={`btn btn-sm rounded-xl font-bold shrink-0 gap-2 h-8 min-h-8 text-xs ${
                                            pipelineStage === tab.id 
                                                ? 'btn-primary shadow-xs' 
                                                : 'btn-ghost bg-base-200/50 border-base-200 text-base-content/80 hover:bg-base-200'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-mono font-black ${
                                            pipelineStage === tab.id 
                                                ? 'bg-white/25 text-white' 
                                                : tab.isError && tab.count > 0 
                                                    ? 'bg-rose-600 text-white shadow-xs' 
                                                    : tab.isSuccess && tab.count > 0
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : 'bg-base-300 text-base-content font-bold'
                                        }`}>
                                            {tab.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Manifest Data Table */}
                        <div className="overflow-x-auto">
                            <table className="table table-zebra table-hover w-full text-xs">
                                <thead>
                                    <tr className="text-xs uppercase text-base-content/60 border-b border-base-200 font-extrabold bg-base-200/30">
                                        <th className="py-3 px-4">{isRTL ? 'رقم البوليصة والخدمة' : 'Tracking & Service'}</th>
                                        <th>{isRTL ? 'المسار والاتجاه' : 'Trade Route'}</th>
                                        <th>{isRTL ? 'الجهة والمستلم' : 'Consignee'}</th>
                                        <th className={isRTL ? 'text-left' : 'text-right'}>{isRTL ? 'الحالة الجمركية' : 'Status'}</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentLoading ? (
                                        <tr>
                                            <td colSpan="5" className="text-center py-10">
                                                <span className="loading loading-spinner text-primary loading-md"></span>
                                            </td>
                                        </tr>
                                    ) : filteredShipments.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="text-center py-10 text-base-content/60 font-semibold">
                                                {isRTL ? 'لا توجد شحنات في هذه المرحلة' : 'No consignments found in this stage.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredShipments.map((s) => {
                                            const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.in_transit;
                                            return (
                                                <tr 
                                                    key={s.id}
                                                    onClick={() => setSelectedShipment(s)}
                                                    className="cursor-pointer transition-colors hover:bg-primary/5"
                                                >
                                                    <td className="py-2.5 px-4 font-bold text-base-content">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="hover:text-primary transition-colors font-mono">{s.trackingNumber}</span>
                                                        </div>
                                                        <span className="text-[10.5px] text-base-content/50 block font-normal">
                                                            {s.carrierCode || 'Express Air Cargo'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <TradeRouteDisplay origin={s.origin} destination={s.destination} />
                                                    </td>
                                                    <td>
                                                        <span className="font-semibold text-base-content block truncate max-w-[140px]">
                                                            {s.receiver?.contactPerson || s.receiver?.name || s.receiver?.company || (isRTL ? 'المستلم' : 'Consignee')}
                                                        </span>
                                                        <span className="text-[10px] text-base-content/50 block">
                                                            {s.receiver?.phone || '+965 ********'}
                                                        </span>
                                                    </td>
                                                    <td className={isRTL ? 'text-left' : 'text-right'}>
                                                        <StatusBadge status={s.status} size="sm" />
                                                    </td>
                                                    <td className="text-right px-3">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setSelectedShipment(s); }}
                                                            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                                                            title={isRTL ? 'معاينة سريعة' : 'Quick Inspect'}
                                                        >
                                                            <span className="material-symbols-outlined text-base">visibility</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Operational Throughput Bar Chart */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                            <div>
                                <h3 className="text-sm sm:text-base font-black text-base-content flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">bar_chart</span>
                                    {isRTL ? 'حجم المناولة والشحن (Global Volume)' : 'Consignment Volume Distribution'}
                                </h3>
                                <p className="text-xs text-base-content/60 font-medium">
                                    {isRTL ? 'توزيع الطرود والشحنات عبر منافذ الترحيل' : 'Throughput comparison across dispatch cycles'}
                                </p>
                            </div>
                            <div className="join">
                                <button onClick={() => setTimeframe('weekly')} className={`btn btn-xs join-item font-bold ${timeframe === 'weekly' ? 'btn-primary' : 'btn-ghost'}`}>
                                    {isRTL ? 'أسبوعي' : 'Weekly'}
                                </button>
                                <button onClick={() => setTimeframe('monthly')} className={`btn btn-xs join-item font-bold ${timeframe === 'monthly' ? 'btn-primary' : 'btn-ghost'}`}>
                                    {isRTL ? 'شهري' : 'Monthly'}
                                </button>
                            </div>
                        </div>
                        <VolumeBarChart data={timeframe === 'weekly' ? weeklyChartData : monthlyChartData} height={190} unit={isRTL ? 'طرد' : 'pkgs'} />
                    </div>

                </div>

                {/* RIGHT WING (35%): Financial Intelligence & Velocity Telemetry */}
                <div className="lg:col-span-4 space-y-5">

                    {/* Live Financial Performance & Collections Card (Strictly Gated: Accounting, Target Owner, Admin) */}
                    {canViewFinancials && financials && (
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-base-200/70 pb-2.5">
                                <div>
                                    <h3 className="text-sm font-black text-base-content flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-primary text-lg">account_balance_wallet</span>
                                        {isRTL ? 'الملخص المالي والتحصيل' : 'Financial Ledger & Collections'}
                                    </h3>
                                    <p className="text-xs text-base-content/60 font-medium">
                                        {isRTL ? 'إجمالي الفواتير والمبالغ المحصلة والذمم' : 'Live billed revenue, collections & receivables'}
                                    </p>
                                </div>
                                <button onClick={() => navigate('/finance')} className="btn btn-ghost btn-xs text-primary font-bold">
                                    {isRTL ? 'تفاصيل' : 'Ledger'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-base-200/50 rounded-xl border border-base-200 space-y-1">
                                    <span className="text-[11px] text-base-content/60 font-bold block">{isRTL ? 'إجمالي المفوتر' : 'Total Invoiced'}</span>
                                    <span className="font-black text-sm text-base-content block font-mono">{financials.totalBilled} <span className="text-[10px] font-sans text-base-content/50">KWD</span></span>
                                </div>
                                <div className="p-3 bg-success/10 rounded-xl border border-success/20 space-y-1">
                                    <span className="text-[11px] text-success font-bold block">{isRTL ? 'تم التحصيل' : 'Collected / Paid'}</span>
                                    <span className="font-black text-sm text-success block font-mono">{financials.totalPaid} <span className="text-[10px] font-sans opacity-70">KWD</span></span>
                                </div>
                            </div>

                            <div className="p-3 bg-warning/10 rounded-xl border border-warning/20 flex justify-between items-center">
                                <div>
                                    <span className="text-[11px] text-warning-content font-bold block">{isRTL ? 'الذمم والديون القائمة' : 'Outstanding Receivables'}</span>
                                    <span className="font-black text-base text-warning-content font-mono">{financials.outstandingBalance} <span className="text-[10px] font-sans opacity-70">KWD</span></span>
                                </div>
                                {financials.unpaidCount > 0 && (
                                    <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-black bg-amber-600 text-white shadow-xs">
                                        {financials.unpaidCount} {isRTL ? 'غير مسدد' : 'unpaid'}
                                    </span>
                                )}
                            </div>

                            {financials.totalCost && (
                                <div className="p-3 bg-base-200/40 rounded-xl border border-base-200 space-y-2 text-xs">
                                    <div className="flex justify-between items-center font-semibold">
                                        <span className="text-base-content/60">{isRTL ? 'تكلفة الناقلين:' : 'Carrier Cost:'}</span>
                                        <span className="font-mono font-bold text-base-content">{financials.totalCost} KWD</span>
                                    </div>
                                    <div className="flex justify-between items-center font-semibold">
                                        <span className="text-base-content/60">{isRTL ? 'هامش الربح الإجمالي:' : 'Gross Margin:'}</span>
                                        <span className="font-mono font-black text-success">{financials.grossMargin} KWD ({financials.marginPercentage})</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button onClick={() => navigate('/finance')} className="btn btn-outline btn-xs flex-1 rounded-lg font-bold">
                                    {isRTL ? 'سجل المحاسبة' : 'Open Finance'}
                                </button>
                                <button onClick={() => navigate('/shipments')} className="btn btn-primary btn-xs flex-1 rounded-lg font-bold">
                                    {isRTL ? 'عرض الفواتير' : 'Billing Manifest'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Key Velocity Indicators (KVIs) - 100% Data-Driven with Carrier Split */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col gap-2 border-b border-base-200/70 pb-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-sm font-black text-base-content flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-primary text-lg">speed</span>
                                        {isRTL ? 'مؤشرات كفاءة وسرعة العمليات (KVI)' : 'Key Velocity Indicators (KVI)'}
                                    </h3>
                                    <p className="text-xs text-base-content/60 font-medium">
                                        {isRTL ? 'تحليل الأداء الفعلي والسرعة التشغيلية مقسمة حسب الناقل' : '100% data-driven metrics split by integrated carrier'}
                                    </p>
                                </div>
                                {kviCarrier !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => setKviCarrier('all')}
                                        className="btn btn-ghost btn-xs text-primary font-bold"
                                    >
                                        {isRTL ? 'عرض الكل' : 'Reset All'}
                                    </button>
                                )}
                            </div>

                            {/* Carrier Filter Pills for Target Management */}
                            {isTargetManagement && perspective === 'target' && carrierBreakdown.length > 0 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
                                    <button
                                        type="button"
                                        onClick={() => setKviCarrier('all')}
                                        className={`btn btn-xs rounded-lg font-extrabold ${
                                            kviCarrier === 'all' 
                                                ? 'btn-primary shadow-xs' 
                                                : 'btn-ghost bg-base-200/60 text-base-content/70 hover:bg-base-200'
                                        }`}
                                    >
                                        {isRTL ? 'كامل الشبكة' : 'All Carriers'}
                                    </button>
                                    {carrierBreakdown.map(car => (
                                        <button
                                            key={car.code}
                                            type="button"
                                            onClick={() => setKviCarrier(car.code)}
                                            className={`btn btn-xs rounded-lg font-bold gap-1 ${
                                                kviCarrier === car.code 
                                                    ? 'btn-primary shadow-xs' 
                                                    : 'btn-ghost bg-base-200/60 text-base-content/70 hover:bg-base-200'
                                            }`}
                                        >
                                            <span className={`badge ${car.badge} badge-xs font-black text-white px-2 py-0.5 shadow-2xs`}>{car.code}</span>
                                            <span>{isRTL ? car.nameAr : car.name}</span>
                                            <span className="text-[10px] opacity-70 font-mono">({car.health}%)</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {stats?.total > 0 ? (
                            <div className="space-y-3.5">
                                <VelocityIndicator 
                                    label={isRTL ? 'استجابة الناقل والمعالجة' : 'Carrier Response Rate'} 
                                    value={activeKvi?.carrierResponseRate ? Number(String(activeKvi.carrierResponseRate).replace('%', '')) : (((stats.total - (stats.exceptions || 0)) / stats.total) * 100)} 
                                    displayValue={activeKvi?.carrierResponseRate || `${(((stats.total - (stats.exceptions || 0)) / stats.total) * 100).toFixed(1)}%`} 
                                    target=">95%" 
                                    progressClass="progress-success" 
                                    icon="speed" 
                                />
                                <VelocityIndicator 
                                    label={isRTL ? 'نسبة نجاح التسليم النهائي' : 'Delivery Success Rate'} 
                                    value={activeKvi?.airFreightPunctuality ? Number(String(activeKvi.airFreightPunctuality).replace('%', '')) : 95} 
                                    displayValue={activeKvi?.airFreightPunctuality || '95.0%'} 
                                    target=">90%" 
                                    progressClass="progress-primary" 
                                    icon="task_alt" 
                                />
                                <VelocityIndicator 
                                    label={isRTL ? 'نسبة خط الأنابيب النشط' : 'Active Pipeline Ratio'} 
                                    value={activeKvi?.activeTransitRatio ? Number(String(activeKvi.activeTransitRatio).replace('%', '')) : 15} 
                                    displayValue={activeKvi?.activeTransitRatio || '15.0%'} 
                                    target="Live" 
                                    progressClass="progress-info" 
                                    icon="flight_takeoff" 
                                />
                                {activeKvi?.deliveryLeadTimeAvg && (
                                    <VelocityIndicator 
                                        label={isRTL ? 'متوسط مدة التوصيل من الاستلام' : 'Avg. Delivery Lead Time'} 
                                        value={85} 
                                        displayValue={activeKvi.deliveryLeadTimeAvg} 
                                        target="<48h" 
                                        progressClass="progress-accent" 
                                        icon="timer" 
                                    />
                                )}
                                <VelocityIndicator 
                                    label={isRTL ? 'الالتزام بمعايير الخدمة (SLA)' : 'Network SLA Health'} 
                                    value={Number(String(activeKvi?.healthyPipelineSla || activeKvi?.onTimeRate || networkSla).replace('%', '')) || 98} 
                                    displayValue={activeKvi?.healthyPipelineSla || activeKvi?.onTimeRate || networkSla} 
                                    target=">95%" 
                                    progressClass="progress-success" 
                                    icon="verified" 
                                />

                                {/* Per-Carrier Mini Split Matrix (When All Carriers view is active) */}
                                {isTargetManagement && perspective === 'target' && carrierBreakdown.length > 1 && kviCarrier === 'all' && (
                                    <div className="pt-2 border-t border-base-200/70 space-y-2">
                                        <div className="flex justify-between items-center text-[11px] font-extrabold text-base-content/70">
                                            <span>{isRTL ? 'مقارنة كفاءة الناقلين (SLA Split)' : 'Carrier SLA Performance Split'}</span>
                                            <span className="text-[10px] text-base-content/50 font-normal">{isRTL ? 'اضغط للتخصيص' : 'Click to isolate'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {carrierBreakdown.map(car => (
                                                <div 
                                                    key={car.code}
                                                    onClick={() => setKviCarrier(car.code)}
                                                    className="p-2 rounded-xl bg-base-200/50 hover:bg-base-200 border border-base-200 hover:border-primary/40 cursor-pointer transition-all flex justify-between items-center"
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className={`badge ${car.badge} badge-xs font-black text-white px-2 py-0.5 shadow-2xs`}>{car.code}</span>
                                                        <span className="text-xs font-bold text-base-content truncate">{isRTL ? car.nameAr : car.name}</span>
                                                    </div>
                                                    <span className="text-xs font-mono font-black text-success ms-1">
                                                        {car.health}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-5 text-center bg-base-200/30 rounded-xl border border-dashed border-base-300">
                                <span className="material-symbols-outlined text-2xl text-base-content/40 block mb-1">speed</span>
                                <p className="text-xs font-bold text-base-content/60">
                                    {isRTL ? 'لا توجد مؤشرات مسجلة حتى الآن' : 'No performance telemetry recorded yet'}
                                </p>
                                <span className="text-[11px] text-base-content/40 block mt-0.5">
                                    {isRTL ? 'ستظهر المؤشرات آلياً فور استيراد الشحنات' : 'Metrics calculate live once consignments are active'}
                                </span>
                            </div>
                        )}

                        {/* Corridor Telemetry Alert Box */}
                        <div className="alert bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary text-primary-content flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-base">trending_up</span>
                            </div>
                            <div className="text-xs">
                                <span className="font-black text-primary uppercase tracking-wider block">
                                    {isRTL ? 'أعلى ممر شحن نشاطاً' : 'Top Traffic Corridor'}
                                </span>
                                <span className="font-semibold text-base-content text-[11px]">
                                    {topCorridor ? (
                                        isRTL 
                                            ? `${topCorridor.nameAr || topCorridor.name}: ${topCorridor.volume} طرد (التزام بالمواعيد ${topCorridor.onTime})`
                                            : `High-Traffic Lane: ${topCorridor.name} (${topCorridor.volume} pkgs • ${topCorridor.onTime} SLA)`
                                    ) : (
                                        isRTL 
                                            ? 'لا توجد بيانات مسارات مسجلة حالياً'
                                            : 'No active trade lane telemetry recorded'
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* B2B Client Posture Card / Account Dossier */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-black text-base-content flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-accent text-lg">apartment</span>
                                {isRTL ? 'ملف الحساب والذمم' : 'Corporate Account Dossier'}
                            </h3>
                            {(isSuperadmin || isTargetOwner) && (
                                <button onClick={() => navigate('/admin/organizations')} className="btn btn-ghost btn-xs text-primary font-bold">
                                    {isRTL ? 'إدارة' : 'Manage'}
                                </button>
                            )}
                        </div>

                        <div className="p-3 bg-base-200/40 rounded-xl border border-base-200 space-y-2 text-xs">
                            <div className="flex justify-between items-center font-bold">
                                <span className="text-base-content/70">{isRTL ? 'اسم الشركة:' : 'Organization:'}</span>
                                <span className="text-base-content font-extrabold truncate max-w-[180px]">{activeOrg.name}</span>
                            </div>
                            {(canViewFinancials || isClientUser) && (
                                <>
                                    <div className="flex justify-between items-center font-bold">
                                        <span className="text-base-content/70">{isRTL ? 'الرصيد القائم:' : 'Ledger Balance:'}</span>
                                        <span className="text-primary font-black">{activeOrg.balance.toFixed(3)} KWD</span>
                                    </div>
                                    <div className="flex justify-between items-center font-bold">
                                        <span className="text-base-content/70">{isRTL ? 'الحد الائتماني:' : 'Credit Limit:'}</span>
                                        <span className="text-base-content font-black">{activeOrg.creditLimit.toLocaleString()} KWD</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center font-bold">
                                <span className="text-base-content/70">{isRTL ? 'التواصل المعتمد:' : 'Contact:'}</span>
                                <span className="text-base-content font-mono text-[11px]">{activeOrg.contact || (isRTL ? 'غير مسجل' : 'Not recorded')}</span>
                            </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                            {(canViewFinancials || isClientUser) && (
                                <button onClick={() => navigate('/finance')} className="btn btn-outline btn-xs flex-1 rounded-lg font-bold">
                                    {isRTL ? 'كشف الحساب' : 'Statement (PDF)'}
                                </button>
                            )}
                            <button onClick={() => navigate('/create')} className="btn btn-primary btn-xs flex-1 rounded-lg font-bold">
                                {isRTL ? 'طلب استلام' : 'Book Pickup'}
                            </button>
                        </div>
                    </div>

                </div>

            </div>

            {/* SLIDE-OVER SHIPMENT INSPECTOR DRAWER (Shared Canonical Component) */}
            <ShipmentInspectorDrawer
                shipment={selectedShipment}
                onClose={() => setSelectedShipment(null)}
                onDownloadLabel={async (s) => {
                    const { generateWaybillPDF } = await import('../utils/pdfGenerator');
                    await generateWaybillPDF(s.raw || s);
                }}
            />

        </div>
    );
};

export default DashboardPage;
