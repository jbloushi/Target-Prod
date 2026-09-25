import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { whatsappService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export const AdminWhatsAppLogsPage = () => {
    const { lang, isRTL } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({ sentToday: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [selectedLog, setSelectedLog] = useState(null);
    const [resendingId, setResendingId] = useState(null);
    const [copiedJson, setCopiedJson] = useState(false);

    const fetchLogs = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const res = await whatsappService.getLogs({
                page,
                limit: pagination.limit,
                status: statusFilter,
                search
            });
            const data = res?.data || res;
            if (data?.success || data?.logs) {
                setLogs(data.logs || []);
                setStats(data.stats || { sentToday: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 });
                setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
            }
        } catch (err) {
            console.error('Fetch logs error:', err);
            enqueueSnackbar(lang === 'ar' ? 'فشل تحميل سجلات رسائل واتساب' : 'Failed to load WhatsApp message logs', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [pagination.limit, statusFilter, search, enqueueSnackbar, lang]);

    useEffect(() => {
        fetchLogs(1);
    }, [fetchLogs]);

    const handleResend = async (id) => {
        try {
            setResendingId(id);
            await whatsappService.resendNotification(id);
            enqueueSnackbar(lang === 'ar' ? 'تم إعادة إرسال رسالة واتساب بنجاح!' : 'WhatsApp message resent successfully!', { variant: 'success' });
            fetchLogs(pagination.page);
        } catch (err) {
            enqueueSnackbar(lang === 'ar' ? `فشل إعادة الإرسال: ${err.message}` : `Resend failed: ${err.message}`, { variant: 'error' });
        } finally {
            setResendingId(null);
        }
    };

    const handleCopyPayload = () => {
        if (!selectedLog) return;
        const jsonStr = JSON.stringify({ payload: selectedLog.payloadJson, response: selectedLog.responseJson }, null, 2);
        navigator.clipboard.writeText(jsonStr);
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'DELIVERED':
                return { badgeClass: 'badge-success text-white', label: lang === 'ar' ? 'تم التوصيل' : 'Delivered', icon: 'done_all' };
            case 'READ':
                return { badgeClass: 'badge-info text-white', label: lang === 'ar' ? 'تمت القراءة' : 'Read', icon: 'visibility' };
            case 'SENT':
                return { badgeClass: 'badge-warning text-warning-content', label: lang === 'ar' ? 'تم الإرسال' : 'Sent', icon: 'done' };
            case 'FAILED':
                return { badgeClass: 'badge-error text-white', label: lang === 'ar' ? 'فشل' : 'Failed', icon: 'error' };
            default:
                return { badgeClass: 'badge-ghost text-base-content/70', label: status || (lang === 'ar' ? 'في الانتظار' : 'Queued'), icon: 'schedule' };
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-200">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="badge badge-success text-white font-mono font-bold text-xs uppercase tracking-wider">
                            META WHATSAPP CLOUD API • WEBHOOK PIPELINE
                        </span>
                        <span className="badge badge-outline border-base-300 text-xs font-mono">
                            LIVE FEED
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-success/15 text-success flex items-center justify-center">
                            <span className="material-symbols-outlined text-2xl">chat</span>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content">
                                {lang === 'ar' ? 'لوحة تدقيق إشعارات واتساب' : 'WhatsApp Notification Audit Cockpit'}
                            </h1>
                            <p className="text-xs sm:text-sm text-base-content/60">
                                {lang === 'ar'
                                    ? 'مراقبة إيصالات استلام رسائل واتساب في الوقت الفعلي، وحالات الويب هوك، وتتبع المستلمين.'
                                    : 'Monitor real-time WhatsApp message delivery receipts, status webhooks, and recipient tracking.'}
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => fetchLogs(pagination.page)}
                    disabled={loading}
                    className="btn btn-sm btn-ghost border border-base-200 gap-1.5 font-bold"
                >
                    <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                        refresh
                    </span>
                    {lang === 'ar' ? 'تحديث السجلات' : 'Refresh Logs'}
                </button>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-primary">
                            <span className="material-symbols-outlined text-3xl">send</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'المرسلة اليوم' : 'Sent Today'}
                        </div>
                        <div className="stat-value text-2xl font-black text-primary font-mono mt-0.5">
                            {stats.sentToday}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'إجمالي الرسائل الصادرة' : 'Total outbound dispatches'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-success">
                            <span className="material-symbols-outlined text-3xl">done_all</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي المستلمة' : 'Total Delivered'}
                        </div>
                        <div className="stat-value text-2xl font-black text-success font-mono mt-0.5">
                            {stats.totalDelivered}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'تم استلامها بنجاح' : 'Delivered to handset'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-info">
                            <span className="material-symbols-outlined text-3xl">visibility</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي المقروءة' : 'Total Read'}
                        </div>
                        <div className="stat-value text-2xl font-black text-info font-mono mt-0.5">
                            {stats.totalRead}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'تم فتحها وقراءتها' : 'Read by recipient'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-error">
                            <span className="material-symbols-outlined text-3xl">error</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'فشل التوصيل' : 'Delivery Failures'}
                        </div>
                        <div className="stat-value text-2xl font-black text-error font-mono mt-0.5">
                            {stats.totalFailed}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'رسائل تتطلب إعادة الإرسال' : 'Requires review / retry'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <form
                    onSubmit={(e) => { e.preventDefault(); fetchLogs(1); }}
                    className="relative flex-1 max-w-md"
                >
                    <span className="material-symbols-outlined absolute inset-y-0 start-3 my-auto h-fit text-base-content/40 text-[19px]">
                        search
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={lang === 'ar' ? 'ابحث برقم التتبع أو الهاتف أو WAMID...' : 'Search tracking #, phone, or WAMID...'}
                        className="input input-sm input-bordered w-full ps-10 text-xs bg-base-100 focus:input-primary"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => { setSearch(''); fetchLogs(1); }}
                            className="absolute inset-y-0 end-2.5 my-auto h-fit text-xs text-base-content/40 hover:text-base-content"
                        >
                            ✕
                        </button>
                    )}
                </form>

                <div className="flex flex-wrap items-center gap-1.5">
                    {['ALL', 'SENT', 'DELIVERED', 'READ', 'FAILED'].map((st) => (
                        <button
                            key={st}
                            type="button"
                            onClick={() => setStatusFilter(st)}
                            className={`btn btn-xs ${
                                statusFilter === st
                                    ? 'btn-primary font-bold'
                                    : 'btn-ghost border border-base-200 text-base-content/70'
                            }`}
                        >
                            {lang === 'ar'
                                ? (st === 'ALL' ? 'الكل' : st === 'SENT' ? 'تم الإرسال' : st === 'DELIVERED' ? 'تم التوصيل' : st === 'READ' ? 'تمت القراءة' : 'فشل')
                                : st}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Logs Table Card */}
            <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table table-zebra w-full text-xs">
                        <thead>
                            <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                <th>{lang === 'ar' ? 'رقم التتبع' : 'Tracking #'}</th>
                                <th>{lang === 'ar' ? 'المستلم' : 'Recipient'}</th>
                                <th>{lang === 'ar' ? 'الحدث / القالب' : 'Event / Template'}</th>
                                <th className="text-center">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                <th>{lang === 'ar' ? 'معرف WAMID الخارجي' : 'External WAMID'}</th>
                                <th>{lang === 'ar' ? 'وقت الإرسال' : 'Sent Time'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-base-content/50">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="loading loading-spinner loading-md text-primary"></span>
                                            <span className="text-xs font-semibold">
                                                {lang === 'ar' ? 'جاري تحميل سجلات تدقيق الرسائل...' : 'Loading message audit logs...'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-base-content/50">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-4xl text-base-content/30">chat_bubble_outline</span>
                                            <p className="text-sm font-bold text-base-content">
                                                {lang === 'ar' ? 'لم تتطابق أي سجلات رسائل واتساب مع معايير البحث.' : 'No WhatsApp message logs matched the criteria.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const badge = getStatusBadge(log.status);
                                    return (
                                        <tr key={log.id} className="hover">
                                            <td className="font-mono font-bold text-xs text-primary">
                                                {log.trackingNumber}
                                            </td>
                                            <td>
                                                <div className="font-bold text-base-content">{log.recipientName || log.recipientRole}</div>
                                                <div className="text-[11px] text-base-content/50 font-mono" dir="ltr">{log.recipientPhone}</div>
                                            </td>
                                            <td>
                                                <div className="font-semibold text-xs text-base-content">{log.eventType}</div>
                                                <div className="text-[11px] text-base-content/50">{log.templateName}</div>
                                            </td>
                                            <td className="text-center">
                                                <span className={`badge badge-sm font-bold text-[10px] gap-1 ${badge.badgeClass}`}>
                                                    <span className="material-symbols-outlined text-[13px]">{badge.icon}</span>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="font-mono text-xs text-base-content/60 max-w-[160px] truncate" title={log.externalMessageId}>
                                                {log.externalMessageId || '—'}
                                            </td>
                                            <td className="font-mono text-xs text-base-content/60">
                                                {new Date(log.sentAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                                            </td>
                                            <td className="text-end">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLog(log)}
                                                        className="btn btn-xs btn-outline border-base-300 hover:border-primary gap-1 font-semibold"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">data_object</span>
                                                        {lang === 'ar' ? 'فحص' : 'Inspect'}
                                                    </button>
                                                    {log.status === 'FAILED' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResend(log.id)}
                                                            disabled={resendingId === log.id}
                                                            className="btn btn-xs btn-primary gap-1 font-semibold"
                                                        >
                                                            {resendingId === log.id ? (
                                                                <span className="loading loading-spinner loading-xs"></span>
                                                            ) : (
                                                                <span className="material-symbols-outlined text-[14px]">replay</span>
                                                            )}
                                                            {lang === 'ar' ? 'إعادة إرسال' : 'Resend'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal for Raw Payload Inspection */}
            <div className={`modal modal-bottom sm:modal-middle ${selectedLog ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-2xl bg-base-100 border border-base-200 shadow-2xl p-6 text-base-content max-h-[92vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">data_object</span>
                            <h3 className="font-black text-lg text-base-content">
                                {lang === 'ar' ? 'سجل حمولة إشعارات واتساب' : 'WhatsApp Notification Payload Log'}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedLog(null)}
                            className="btn btn-sm btn-circle btn-ghost text-base-content/60"
                        >
                            ✕
                        </button>
                    </div>

                    {selectedLog && (
                        <div className="py-4 space-y-3.5 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-base-200/40 rounded-xl border border-base-200">
                                <div>
                                    <span className="text-[11px] font-bold text-base-content/60 block">{lang === 'ar' ? 'رقم التتبع:' : 'Tracking Number:'}</span>
                                    <span className="font-mono font-bold text-sm text-primary">{selectedLog.trackingNumber}</span>
                                </div>
                                <div>
                                    <span className="text-[11px] font-bold text-base-content/60 block">{lang === 'ar' ? 'هاتف المستلم:' : 'Recipient Phone:'}</span>
                                    <span className="font-mono font-semibold" dir="ltr">{selectedLog.recipientPhone}</span>
                                </div>
                                <div className="sm:col-span-2">
                                    <span className="text-[11px] font-bold text-base-content/60 block">{lang === 'ar' ? 'معرف الرسالة الخارجي:' : 'External Message ID:'}</span>
                                    <span className="font-mono text-xs text-base-content/80 break-all">{selectedLog.externalMessageId || (lang === 'ar' ? 'لا يوجد' : 'None')}</span>
                                </div>
                            </div>

                            {selectedLog.errorMessage && (
                                <div className="alert alert-error text-xs py-2.5 rounded-xl font-semibold">
                                    <span className="material-symbols-outlined text-base">error</span>
                                    <span>{lang === 'ar' ? 'خطأ:' : 'Error:'} {selectedLog.errorMessage}</span>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-bold text-base-content">
                                        {lang === 'ar' ? 'الحمولة الخام واستجابة Meta API:' : 'Raw Payload & Meta API Response:'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleCopyPayload}
                                        className="btn btn-xs btn-ghost gap-1 text-base-content/60 hover:text-primary"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">
                                            {copiedJson ? 'check' : 'content_copy'}
                                        </span>
                                        {copiedJson ? (lang === 'ar' ? 'تم النسخ!' : 'Copied!') : (lang === 'ar' ? 'نسخ JSON' : 'Copy JSON')}
                                    </button>
                                </div>

                                <pre className="bg-slate-950 text-cyan-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-72 border border-slate-800" dir="ltr">
                                    {JSON.stringify({ payload: selectedLog.payloadJson, response: selectedLog.responseJson }, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    <div className="modal-action pt-3 border-t border-base-200">
                        <button
                            type="button"
                            onClick={() => setSelectedLog(null)}
                            className="btn btn-sm btn-ghost text-base-content/70 ms-auto"
                        >
                            {lang === 'ar' ? 'إغلاق' : 'Close'}
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setSelectedLog(null)} />
            </div>
        </div>
    );
};

export default AdminWhatsAppLogsPage;
