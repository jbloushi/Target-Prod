import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { whatsappService } from '../../services/api';
import { formatExactMessageCopy } from '../AdminWhatsAppLogsPage';
import NativeChatDrawer from '../../components/support/NativeChatDrawer';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const STATUS_BADGE_MAP = {
    DELIVERED: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    READ: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    SENT: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    QUEUED: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    FAILED: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
};

export const AdminWhatsAppLogsV2Page = () => {
    const { lang, isRTL } = useLanguage();
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    const hasPageAccess = ['admin', 'manager', 'accounting'].includes(user?.role);

    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({
        totalLogs: 0,
        totalDispatched: 0,
        sentToday: 0,
        totalDelivered: 0,
        totalRead: 0,
        totalFailed: 0,
        totalQueued: 0,
        deliveryRate: 100
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);

    const [statusFilter, setStatusFilter] = useState('ALL');
    const [providerFilter, setProviderFilter] = useState('ALL');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [dateRangeFilter, setDateRangeFilter] = useState('ALL');
    const [search, setSearch] = useState('');

    const [selectedLog, setSelectedLog] = useState(null);
    const [previewLog, setPreviewLog] = useState(null);
    const [chatwootDrawerLog, setChatwootDrawerLog] = useState(null);
    const [copiedMessageText, setCopiedMessageText] = useState(false);
    const [copiedJson, setCopiedJson] = useState(false);
    const [syncingTelemetry, setSyncingTelemetry] = useState(false);
    const [dispatchingQueued, setDispatchingQueued] = useState(false);
    const [resendingId, setResendingId] = useState(null);

    const fetchLogs = useCallback(async (page = 1) => {
        if (!hasPageAccess) return;
        setLoading(true);
        setFetchError(null);
        try {
            const res = await whatsappService.getLogs({
                page,
                limit: pagination.limit,
                status: statusFilter,
                provider: providerFilter,
                role: roleFilter,
                dateRange: dateRangeFilter,
                search
            });
            const data = res?.data || res;
            setLogs(data?.logs || []);
            if (data?.stats) setStats(data.stats);
            if (data?.pagination) setPagination(data.pagination);
        } catch (err) {
            setFetchError(err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل تحميل سجلات واتساب' : 'Failed to load WhatsApp logs'));
        } finally {
            setLoading(false);
        }
    }, [hasPageAccess, pagination.limit, statusFilter, providerFilter, roleFilter, dateRangeFilter, search, lang]);

    useEffect(() => {
        fetchLogs(1);
    }, [fetchLogs]);

    const handleDispatchQueued = async () => {
        setDispatchingQueued(true);
        try {
            const res = await whatsappService.dispatchQueued(200);
            enqueueSnackbar(
                lang === 'ar' ? `تم إرسال ${res.dispatched || 0} رسالة` : `Dispatched ${res.dispatched || 0} queued messages`,
                { variant: res.dispatched > 0 ? 'success' : 'info' }
            );
            fetchLogs(1);
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Dispatch failed', { variant: 'error' });
        } finally {
            setDispatchingQueued(false);
        }
    };

    const handleSyncTelemetry = async () => {
        setSyncingTelemetry(true);
        try {
            const res = await whatsappService.syncTelemetry();
            enqueueSnackbar(
                lang === 'ar' ? `تم تحديث ${res.updatedCount || 0} سجل` : `Synchronized ${res.updatedCount || 0} delivery records`,
                { variant: 'success' }
            );
            fetchLogs(pagination.page);
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Sync failed', { variant: 'error' });
        } finally {
            setSyncingTelemetry(false);
        }
    };

    const handleResend = async (id) => {
        setResendingId(id);
        try {
            await whatsappService.resendNotification(id);
            enqueueSnackbar(lang === 'ar' ? 'تمت إعادة الإرسال بنجاح' : 'Notification resent successfully', { variant: 'success' });
            fetchLogs(pagination.page);
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Resend failed', { variant: 'error' });
        } finally {
            setResendingId(null);
        }
    };

    if (!hasPageAccess) {
        return (
            <div dir={isRTL ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 py-12">
                <EmptyStateV2
                    icon="lock"
                    title={lang === 'ar' ? 'صلاحية الوصول مقيدة' : 'Access Restricted'}
                    description={lang === 'ar' ? 'سجلات إشعارات واتساب متاحة فقط لمسؤولي النظام والإدارة.' : 'Platform WhatsApp audit logs are restricted to Admin, Manager, and Accounting roles.'}
                />
            </div>
        );
    }

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="w-full min-h-screen pb-14">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            V2 Governance
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? 'سجلات تدقيق إشعارات واتساب مع حماية الوصول' : 'Hardened WhatsApp telemetry & delivery audit cockpit'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                            to="/dashboard-v2"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">dashboard</span>
                            <span>{lang === 'ar' ? 'لوحة V2' : 'V2 Cockpit'}</span>
                        </Link>
                        <Link
                            to="/admin/whatsapp-logs"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{lang === 'ar' ? 'الرجوع إلى V1' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>

                {/* Page Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                            {lang === 'ar' ? 'تدقيق إشعارات واتساب' : 'WhatsApp Notification Logs'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {lang === 'ar' ? 'مراقبة الإرسال، إيصالات الاستلام، وإعادة إرسال الرسائل المتعثرة.' : 'Audit outbound dispatches, delivery receipts, and failure recovery.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {stats.totalQueued > 0 && (
                            <button type="button" onClick={handleDispatchQueued} disabled={dispatchingQueued || loading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                <span className={`material-symbols-outlined text-base ${dispatchingQueued ? 'animate-spin' : ''}`} aria-hidden="true">send_and_archive</span>
                                <span>{lang === 'ar' ? `إرسال المعلق (${stats.totalQueued})` : `Dispatch (${stats.totalQueued})`}</span>
                            </button>
                        )}
                        <button type="button" onClick={handleSyncTelemetry} disabled={syncingTelemetry || loading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold cursor-pointer disabled:opacity-50">
                            <span className={`material-symbols-outlined text-base ${syncingTelemetry ? 'animate-spin' : ''}`} aria-hidden="true">sync_alt</span>
                            <span>{lang === 'ar' ? 'مزامنة الإيصالات' : 'Sync Receipts'}</span>
                        </button>
                        <button type="button" onClick={() => fetchLogs(pagination.page)} disabled={loading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                            <span>{lang === 'ar' ? 'تحديث' : 'Refresh'}</span>
                        </button>
                    </div>
                </div>

                {fetchError && <ErrorBannerV2 message={fetchError} onRetry={() => fetchLogs(pagination.page)} isRetrying={loading} />}

                {/* KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        { label: lang === 'ar' ? 'إجمالي الصادر' : 'Total Dispatches', value: stats.totalDispatched || stats.totalLogs || 0, icon: 'send', color: 'text-primary' },
                        { label: lang === 'ar' ? 'نسبة النجاح' : 'Delivery Rate', value: `${stats.deliveryRate ?? 100}%`, icon: 'done_all', color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: lang === 'ar' ? 'تمت قراءتها' : 'Read Receipts', value: stats.totalRead || 0, icon: 'visibility', color: 'text-sky-600 dark:text-sky-400' },
                        { label: lang === 'ar' ? 'فشل / معلق' : 'Failed / Queued', value: `${stats.totalFailed || 0} / ${stats.totalQueued || 0}`, icon: 'error_outline', color: 'text-rose-600 dark:text-rose-400' }
                    ].map((kpi) => (
                        <div key={kpi.label} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">{kpi.label}</span>
                                <span className={`material-symbols-outlined text-xl shrink-0 ${kpi.color}`} aria-hidden="true">{kpi.icon}</span>
                            </div>
                            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1.5 font-mono tabular-nums truncate" dir="ltr">
                                {kpi.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1 min-w-0">
                        <span className="material-symbols-outlined text-lg text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={lang === 'ar' ? 'بحث برقم التتبع، الهاتف، أو القالب...' : 'Search by tracking #, phone, or template...'}
                            className="w-full ps-9 pe-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                            <option value="ALL">{lang === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
                            <option value="DELIVERED">Delivered</option>
                            <option value="READ">Read</option>
                            <option value="SENT">Sent</option>
                            <option value="QUEUED">Queued</option>
                            <option value="FAILED">Failed</option>
                        </select>
                        <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                            <option value="ALL">{lang === 'ar' ? 'كل المزودين' : 'All Providers'}</option>
                            <option value="META">Meta Cloud</option>
                            <option value="MSG_GATEWAY">MSG Gateway</option>
                        </select>
                        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                            <option value="ALL">{lang === 'ar' ? 'كافة الأطراف' : 'All Parties'}</option>
                            <option value="RECEIVER">{lang === 'ar' ? 'المستلم' : 'Consignee'}</option>
                            <option value="SENDER">{lang === 'ar' ? 'الراسل' : 'Shipper'}</option>
                        </select>
                        <select value={dateRangeFilter} onChange={(e) => setDateRangeFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                            <option value="ALL">{lang === 'ar' ? 'كل الأوقات' : 'All Time'}</option>
                            <option value="TODAY">{lang === 'ar' ? 'اليوم' : 'Today'}</option>
                            <option value="7D">{lang === 'ar' ? 'آخر 7 أيام' : 'Last 7 Days'}</option>
                            <option value="30D">{lang === 'ar' ? 'آخر 30 يوم' : 'Last 30 Days'}</option>
                        </select>
                    </div>
                </div>

                {/* Logs Content */}
                {loading ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center">
                        <span className="loading loading-spinner loading-md text-primary" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                            {lang === 'ar' ? 'جارٍ تحميل سجلات واتساب...' : 'Loading WhatsApp telemetry...'}
                        </p>
                    </div>
                ) : logs.length === 0 && !fetchError ? (
                    <EmptyStateV2
                        icon="chat"
                        title={lang === 'ar' ? 'لا توجد سجلات مطابقة' : 'No WhatsApp logs found'}
                        description={lang === 'ar' ? 'لم يتم العثور على رسائل مطابقة لمعايير البحث.' : 'No outbound notifications match the current filters.'}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (< md) */}
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {logs.map((log) => {
                                const st = (log.status || 'SENT').toUpperCase();
                                return (
                                    <div key={log.id} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-mono font-bold text-xs text-primary truncate" dir="ltr">{log.recipientPhone || '—'}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{log.templateName || 'notification'}</div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold shrink-0 ${STATUS_BADGE_MAP[st] || STATUS_BADGE_MAP.SENT}`}>
                                                {st}
                                            </span>
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 flex justify-between gap-2" dir="ltr">
                                            <span>{log.trackingNumber || 'No AWB'}</span>
                                            <span>{log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}</span>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <button type="button" onClick={() => setChatwootDrawerLog(log)} className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-xs font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer">
                                                {lang === 'ar' ? 'شات ووت' : 'Chatwoot'}
                                            </button>
                                            <button type="button" onClick={() => setPreviewLog(log)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                {lang === 'ar' ? 'النص' : 'Copy'}
                                            </button>
                                            <button type="button" onClick={() => setSelectedLog(log)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                JSON
                                            </button>
                                            <button type="button" disabled={resendingId === log.id} onClick={() => handleResend(log.id)} className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold cursor-pointer">
                                                {lang === 'ar' ? 'إعادة إرسال' : 'Resend'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-start">
                                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المستلم' : 'Recipient'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'التتبع / القالب' : 'Tracking & Template'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المزود' : 'Provider'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'التوقيت' : 'Timestamp'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {logs.map((log) => {
                                            const st = (log.status || 'SENT').toUpperCase();
                                            return (
                                                <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100" dir="ltr">{log.recipientPhone || '—'}</div>
                                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.recipientName || '—'}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-mono font-bold text-primary" dir="ltr">{log.trackingNumber || '—'}</div>
                                                        <div className="text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">{log.templateName || '—'}</div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono font-semibold text-slate-700 dark:text-slate-300" dir="ltr">{log.provider || 'MSG'}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[11px] font-bold ${STATUS_BADGE_MAP[st] || STATUS_BADGE_MAP.SENT}`}>
                                                            {st}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums" dir="ltr">
                                                        {log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-end">
                                                        <div className="inline-flex items-center justify-end gap-1">
                                                            <button type="button" onClick={() => setChatwootDrawerLog(log)} title={lang === 'ar' ? 'فتح محادثة شات ووت' : 'Open Chatwoot'} className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">support_agent</span>
                                                            </button>
                                                            <button type="button" onClick={() => setPreviewLog(log)} title="Preview Message" className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">article</span>
                                                            </button>
                                                            <button type="button" onClick={() => setSelectedLog(log)} title="Inspect JSON" className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">data_object</span>
                                                            </button>
                                                            <button type="button" disabled={resendingId === log.id} onClick={() => handleResend(log.id)} title="Resend" className="p-1.5 rounded-lg text-primary hover:bg-primary/10 cursor-pointer disabled:opacity-50">
                                                                <span className="material-symbols-outlined text-base">replay</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        {pagination.pages > 1 && (
                            <div className="flex items-center justify-between pt-2">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400" dir="ltr">
                                    Page {pagination.page} / {pagination.pages} ({pagination.total})
                                </span>
                                <div className="flex gap-2">
                                    <button type="button" disabled={pagination.page <= 1} onClick={() => fetchLogs(pagination.page - 1)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer">
                                        {lang === 'ar' ? 'السابق' : 'Prev'}
                                    </button>
                                    <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => fetchLogs(pagination.page + 1)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer">
                                        {lang === 'ar' ? 'التالي' : 'Next'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Message Preview Modal */}
            {previewLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{lang === 'ar' ? 'معاينة الرسالة' : 'Message Copy Preview'}</h3>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(formatExactMessageCopy(previewLog));
                                        setCopiedMessageText(true);
                                        setTimeout(() => setCopiedMessageText(false), 2000);
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                >
                                    {copiedMessageText ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : (lang === 'ar' ? 'نسخ' : 'Copy')}
                                </button>
                                <button type="button" onClick={() => setPreviewLog(null)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                        </div>
                        <pre dir="ltr" className="whitespace-pre-wrap text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-3 rounded-xl border border-slate-200 dark:border-slate-700 max-h-72 overflow-y-auto">
                            {formatExactMessageCopy(previewLog)}
                        </pre>
                    </div>
                </div>
            )}

            {/* Raw JSON Inspector Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{lang === 'ar' ? 'فحص البيانات الخام' : 'Raw Gateway Payload'}</h3>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setChatwootDrawerLog(selectedLog)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold cursor-pointer"
                                >
                                    {lang === 'ar' ? 'فتح شات ووت' : 'Open Chatwoot'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify({ payload: selectedLog.payloadJson, response: selectedLog.responseJson }, null, 2));
                                        setCopiedJson(true);
                                        setTimeout(() => setCopiedJson(false), 2000);
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                >
                                    {copiedJson ? 'Copied' : 'Copy JSON'}
                                </button>
                                <button type="button" onClick={() => setSelectedLog(null)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                        </div>
                        <pre dir="ltr" className="text-[11px] font-mono bg-slate-950 text-slate-100 p-3.5 rounded-xl overflow-x-auto max-h-80">
                            {JSON.stringify({ payload: selectedLog.payloadJson, response: selectedLog.responseJson }, null, 2)}
                        </pre>
                    </div>
                </div>
            )}

            {/* Native Shipment Chat Drawer */}
            <NativeChatDrawer
                isOpen={Boolean(chatwootDrawerLog)}
                onClose={() => setChatwootDrawerLog(null)}
                accountId={chatwootDrawerLog?.chatwootAccountId || '1'}
                chatwootConversationId={chatwootDrawerLog?.chatwootConversationId || null}
                phone={chatwootDrawerLog?.recipientPhone || ''}
                recipientName={chatwootDrawerLog?.recipientName || ''}
                trackingNumber={
                    chatwootDrawerLog?.trackingNumber ||
                    chatwootDrawerLog?.shipment?.trackingNumber ||
                    chatwootDrawerLog?.shipment?.dhlTrackingNumber ||
                    ''
                }
                shipment={chatwootDrawerLog?.shipment}
            />
        </div>
    );
};

export default AdminWhatsAppLogsV2Page;
