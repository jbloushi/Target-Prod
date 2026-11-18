import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { fleetService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const MODULE_DEFINITIONS = {
    analytics: {
        icon: 'monitoring',
        titleEn: 'Operations & Revenue Analytics',
        titleAr: 'تحليلات العمليات والإيرادات',
        subtitleEn: 'Live shipment volume, carrier SLA health, and financial ledger telemetry are served in the V2 cockpits.',
        subtitleAr: 'يتم عرض مؤشرات الشحنات الحية وأداء الناقلين والبيانات المالية في لوحات V2.',
        statusEn: 'Served by V2 Cockpits',
        statusAr: 'متاح عبر لوحات V2',
        links: [
            { to: '/dashboard-v2', labelEn: 'Open Dashboard V2', labelAr: 'فتح لوحة القيادة V2', icon: 'dashboard', primary: true },
            { to: '/finance-v2', labelEn: 'Open Finance V2', labelAr: 'فتح المالية V2', icon: 'payments', capability: CAPABILITIES.VIEW_FINANCE },
            { to: '/shipments-v2', labelEn: 'View Shipments V2', labelAr: 'عرض الشحنات V2', icon: 'inventory_2' }
        ]
    },
    calendar: {
        icon: 'calendar_month',
        titleEn: 'Pickup & Dispatch Schedule',
        titleAr: 'جدول الاستلام والتوصيل',
        subtitleEn: 'Dedicated calendar grid is not yet enabled. Book new pickups or track scheduled runs in active V2 workflows.',
        subtitleAr: 'التقويم المخصص غير مفعل بعد. يمكنك جدولة الاستلام ومتابعة الرحلات عبر مسارات V2 النشطة.',
        statusEn: 'Workflow Redirect',
        statusAr: 'توجيه لمسار نشط',
        links: [
            { to: '/shipment/new-v2', labelEn: 'New Shipment V2', labelAr: 'شحنة جديدة V2', icon: 'add_box', capability: CAPABILITIES.CREATE_SHIPMENTS, primary: true },
            { to: '/shipments-v2', labelEn: 'Active Shipments V2', labelAr: 'الشحنات النشطة V2', icon: 'inventory_2' },
            { to: '/dashboard-v2', labelEn: 'Return to Dashboard V2', labelAr: 'العودة للوحة القيادة V2', icon: 'dashboard' }
        ]
    },
    warehouse: {
        icon: 'warehouse',
        titleEn: 'Warehouse & Hub Operations',
        titleAr: 'عمليات المستودع والفرز',
        subtitleEn: 'Inbound waybill scanning and checkpoint handover are active in the Warehouse Scan workflow.',
        subtitleAr: 'مسح البوالص الواردة وتسليم نقاط الفرز متاح عبر أداة مسح المستودع.',
        statusEn: 'Active Scan Tool',
        statusAr: 'أداة المسح نشطة',
        links: [
            { to: '/warehouse/scan-v2', labelEn: 'Open Warehouse Scan V2', labelAr: 'فتح مسح المستودع V2', icon: 'qr_code_scanner', capability: CAPABILITIES.MANAGE_SHIPMENT_CHECKPOINTS, primary: true },
            { to: '/warehouse/scan', labelEn: 'Legacy Warehouse Scan (V1)', labelAr: 'مسح المستودع V1', icon: 'barcode_reader', capability: CAPABILITIES.MANAGE_SHIPMENT_CHECKPOINTS },
            { to: '/shipments-v2', labelEn: 'View Shipments V2', labelAr: 'عرض الشحنات V2', icon: 'inventory_2' }
        ]
    },
    fleets: {
        icon: 'local_shipping',
        titleEn: 'Fleet & Dispatch Management',
        titleAr: 'إدارة الأسطول والتوزيع',
        subtitleEn: 'Vehicle dispatch, run creation, and COD settlement are active in Fleet Dispatch V2.',
        subtitleAr: 'توزيع المركبات وإنشاء الرحلات وتسوية الدفع عند الاستلام متاحة في توزيع الأسطول V2.',
        statusEn: 'Live Fleet API',
        statusAr: 'واجهة الأسطول متصلة',
        fetchFleet: true,
        links: [
            { to: '/fleet/dispatch-v2', labelEn: 'Open Fleet Dispatch V2', labelAr: 'فتح توزيع الأسطول V2', icon: 'route', capability: CAPABILITIES.MANAGE_FLEET, primary: true },
            { to: '/driver/runs-v2', labelEn: 'Driver Runs V2', labelAr: 'رحلات السائق V2', icon: 'directions_car', capability: CAPABILITIES.VIEW_FLEET },
            { to: '/dashboard-v2', labelEn: 'Dashboard V2', labelAr: 'لوحة القيادة V2', icon: 'dashboard' }
        ]
    },
    drivers: {
        icon: 'badge',
        titleEn: 'Driver Runs & Field Operations',
        titleAr: 'رحلات السائقين والعمليات الميدانية',
        subtitleEn: 'Active driver run sheets, stop completion, and delivery exceptions are live in Driver Runs V2.',
        subtitleAr: 'جداول رحلات السائقين وإتمام نقاط التسليم وتسجيل الاستثناءات متاحة في رحلات السائق V2.',
        statusEn: 'Live Driver API',
        statusAr: 'واجهة السائقين متصلة',
        fetchFleet: true,
        links: [
            { to: '/driver/runs-v2', labelEn: 'Open Driver Runs V2', labelAr: 'فتح رحلات السائق V2', icon: 'directions_car', capability: CAPABILITIES.VIEW_FLEET, primary: true },
            { to: '/fleet/dispatch-v2', labelEn: 'Fleet Dispatch V2', labelAr: 'توزيع الأسطول V2', icon: 'local_shipping', capability: CAPABILITIES.MANAGE_FLEET },
            { to: '/dashboard-v2', labelEn: 'Dashboard V2', labelAr: 'لوحة القيادة V2', icon: 'dashboard' }
        ]
    },
    notifications: {
        icon: 'notifications',
        titleEn: 'Alerts & Message Delivery Logs',
        titleAr: 'التنبيهات وسجل تسليم الرسائل',
        subtitleEn: 'There is no separate system notification center. Live customer alerts and WhatsApp delivery logs are tracked below.',
        subtitleAr: 'لا يوجد مركز إشعارات منفصل حالياً. يمكنك متابعة محادثات العملاء وسجلات واتساب عبر الروابط التالية.',
        statusEn: 'Logs & Inbox Active',
        statusAr: 'السجلات وصندوق الوارد نشطان',
        links: [
            { to: '/support-v2', labelEn: 'Open Support Center V2', labelAr: 'فتح مركز الدعم V2', icon: 'support_agent', primary: true },
            { to: '/admin/whatsapp-logs-v2', labelEn: 'WhatsApp Delivery Logs V2', labelAr: 'سجل رسائل واتساب V2', icon: 'chat', capability: CAPABILITIES.MANAGE_USERS },
            { to: '/dashboard-v2', labelEn: 'Dashboard V2', labelAr: 'لوحة القيادة V2', icon: 'dashboard' }
        ]
    },
    'forgot-password': {
        icon: 'lock_reset',
        titleEn: 'Account Access & Password Recovery',
        titleAr: 'استعادة الوصول وكلمة المرور',
        subtitleEn: 'Self-service email password reset is not enabled on this portal. Use WhatsApp OTP sign-in or contact your Organization Manager / Target Admin to reset your password.',
        subtitleAr: 'إعادة التعيين الذاتي عبر البريد الإلكتروني غير مفعلة. استخدم تسجيل الدخول برمز واتساب (OTP) أو تواصل مع مدير شركتك / إدارة تارجت لإعادة تعيين كلمة المرور.',
        statusEn: 'OTP / Admin Reset',
        statusAr: 'دخول OTP أو عبر الإدارة',
        publicSafe: true,
        links: [
            { to: '/login', labelEn: 'Go to Sign In (WhatsApp OTP)', labelAr: 'الذهاب لتسجيل الدخول (OTP)', icon: 'login', primary: true },
            { to: '/track', labelEn: 'Track a Shipment', labelAr: 'تتبع شحنة', icon: 'search' }
        ]
    }
};

export const ModuleHubV2Page = ({ module: propModule }) => {
    const location = useLocation();
    const { user } = useAuth();
    const { isRTL } = useLanguage();

    const inferredKey = useMemo(() => {
        if (propModule && MODULE_DEFINITIONS[propModule]) return propModule;
        const slug = location.pathname.replace(/^\//, '').replace(/-v2$/, '').split('/')[0];
        return MODULE_DEFINITIONS[slug] ? slug : 'analytics';
    }, [location.pathname, propModule]);

    const config = MODULE_DEFINITIONS[inferredKey];
    const userRole = user?.role || null;
    const canViewFleet = Boolean(userRole && hasCapability(userRole, CAPABILITIES.VIEW_FLEET));

    const [fleetSnapshot, setFleetSnapshot] = useState(null);
    const [loadingFleet, setLoadingFleet] = useState(false);
    const [fleetError, setFleetError] = useState(null);

    const loadFleetSnapshot = useCallback(async () => {
        if (!config.fetchFleet || !canViewFleet) return;
        setLoadingFleet(true);
        setFleetError(null);
        try {
            const [vehiclesRes, runsRes] = await Promise.all([
                fleetService.getVehicles(),
                fleetService.getRuns()
            ]);
            const vehicles = Array.isArray(vehiclesRes?.data)
                ? vehiclesRes.data
                : Array.isArray(vehiclesRes)
                    ? vehiclesRes
                    : [];
            const runs = Array.isArray(runsRes?.data)
                ? runsRes.data
                : Array.isArray(runsRes)
                    ? runsRes
                    : [];
            setFleetSnapshot({ vehicleCount: vehicles.length, runCount: runs.length });
        } catch (err) {
            setFleetError(
                err?.response?.data?.error ||
                    err?.message ||
                    (isRTL ? 'تعذر تحميل بيانات الأسطول الحية.' : 'Unable to load live fleet status.')
            );
        } finally {
            setLoadingFleet(false);
        }
    }, [canViewFleet, config.fetchFleet, isRTL]);

    useEffect(() => {
        loadFleetSnapshot();
    }, [loadFleetSnapshot]);

    const visibleLinks = useMemo(() => {
        return config.links.filter((item) => {
            if (!item.capability) return true;
            if (!userRole) return false;
            return hasCapability(userRole, item.capability);
        });
    }, [config.links, userRole]);

    return (
        <div className="w-full min-h-screen pb-14 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-5">
                {/* V2 Switcher Banner */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'مركز المسارات V2' : 'Module Hub V2'}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {isRTL ? config.statusAr : config.statusEn}
                        </span>
                    </div>
                    <Link
                        to={user ? '/dashboard-v2' : '/login'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                            {isRTL ? 'arrow_forward' : 'arrow_back'}
                        </span>
                        <span>
                            {user
                                ? isRTL ? 'العودة للوحة القيادة V2' : 'Back to Dashboard V2'
                                : isRTL ? 'صفحة تسجيل الدخول' : 'Back to Sign In'}
                        </span>
                    </Link>
                </div>

                {/* Main Honest Module Card */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                                {config.icon}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                                {isRTL ? config.titleAr : config.titleEn}
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                                {isRTL ? config.subtitleAr : config.subtitleEn}
                            </p>
                        </div>
                    </div>

                    {fleetError && (
                        <ErrorBannerV2
                            message={fleetError}
                            onRetry={loadFleetSnapshot}
                            isRetrying={loadingFleet}
                        />
                    )}

                    {/* Real live fleet counts only when backend fleet API responds */}
                    {config.fetchFleet && canViewFleet && !fleetError && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                                <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                                    {isRTL ? 'المركبات المسجلة' : 'Registered Vehicles'}
                                </div>
                                <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                                    {loadingFleet ? '—' : fleetSnapshot?.vehicleCount ?? 0}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                                <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                                    {isRTL ? 'رحلات التوزيع' : 'Dispatch Runs'}
                                </div>
                                <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                                    {loadingFleet ? '—' : fleetSnapshot?.runCount ?? 0}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actionable Workflow Links */}
                    {visibleLinks.length === 0 ? (
                        <EmptyStateV2
                            icon="lock"
                            title={isRTL ? 'لا توجد مسارات متاحة لدورك' : 'No Workflows Available for Your Role'}
                            description={
                                isRTL
                                    ? 'حسابك الحالي لا يملك صلاحية الوصول إلى أدوات هذا القسم.'
                                    : 'Your current account role does not include permissions for this module.'
                            }
                        />
                    ) : (
                        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                            {visibleLinks.map((link) => (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                                        link.primary
                                            ? 'bg-primary hover:bg-primary/90 text-white shadow-xs'
                                            : 'border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                                        {link.icon}
                                    </span>
                                    <span>{isRTL ? link.labelAr : link.labelEn}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModuleHubV2Page;
