import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { whatsappService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

/** Format human-readable message text matching exact Meta template copy */
export function formatExactMessageCopy(log) {
    if (!log) return '';
    const payload = log.payloadJson || {};
    const firstRow = payload.rows?.[0] || {};
    const vars = firstRow.variables || payload.variables || [];
    const headerVars = firstRow.headerVariables || payload.headerVariables || [];
    const shipmentAwb = headerVars[0] || log.trackingNumber || log.shipment?.dhlTrackingNumber || log.shipment?.carrierShipmentId || '';
    const tmpl = String(log.templateName || payload.templateName || 'shipment_confirmation_2').toLowerCase();

    // Template: shipment_confirmation_2 (Official approved Meta template copy)
    if (tmpl === 'shipment_confirmation_2') {
        const [invoice = '', date = '', recvName = '', recvTel = '', trackUrl = ''] = vars;
        const effDate = date || (log.sentAt ? new Date(log.sentAt).toISOString().slice(0, 10) : '');
        const effTel = recvTel || log.recipientPhone || '';
        const docs = log.shipment?.documents || {};
        const effInvoice = invoice || (docs.phenixReceiptNo ? `Bill #${docs.phenixBillId} (Receipt #${docs.phenixReceiptNo})` : (docs.phenixBillId ? `Bill #${docs.phenixBillId}` : (docs.invoiceNumber || shipmentAwb || '')));
        const effUrl = trackUrl || (shipmentAwb ? `https://target-kw.com/track/${shipmentAwb}` : '');

        return (
            (shipmentAwb ? `Shipment: ${shipmentAwb}\n\n` : '') +
            `Invoice: ${effInvoice}\n` +
            `Date: ${effDate}\n` +
            `Receiver Name: ${recvName || log.recipientName || 'Valued Customer'}\n` +
            `Receiver Tel: ${effTel}\n` +
            `Track Order: ${effUrl}`
        ).trim();
    }

    // Template: shipment_tracking_quick
    if (tmpl === 'shipment_tracking_quick') {
        const [headerAwb = '', date = '', receipt = '', recvName = '', recvTel = '', trackUrl = ''] = vars;
        const effAwb = shipmentAwb || headerAwb;
        return (
            (effAwb ? `Shipment: ${effAwb}\n\n` : '') +
            `Track Order: ${trackUrl || `https://target-kw.com/track/${effAwb}`}\n` +
            `Date: ${date || ''}\n` +
            `Receiver: ${recvName || log.recipientName || 'Recipient'}\n` +
            `Phone: ${recvTel || log.recipientPhone || ''}`
        ).trim();
    }

    // Template: new_shipment_created
    if (tmpl === 'new_shipment_created') {
        const [route = '', estDelivery = '', status = '', updated = '', trackUrl = ''] = vars;
        return (
            (shipmentAwb ? `Shipment: ${shipmentAwb}\n\n` : '') +
            `Route: ${route || 'Kuwait City, KW → Destination'}\n` +
            (estDelivery ? `Estimated Delivery: ${estDelivery}\n` : '') +
            `Status: ${status || 'Shipment In Transit'}\n` +
            (updated ? `Updated: ${updated}\n` : '') +
            `Track Order: ${trackUrl || `https://target-kw.com/track/${shipmentAwb}`}`
        ).trim();
    }

    // Template: account_statement_v1
    if (tmpl === 'account_statement_v1') {
        const [contactName = '', orgName = '', balance = '', date = ''] = vars;
        return (
            `Account Statement\n\n` +
            `Contact: ${contactName || 'Valued Partner'}\n` +
            `Company: ${orgName || ''}\n` +
            `Current Outstanding: ${balance || '0.000 KWD'}\n` +
            `Date: ${date || new Date().toLocaleDateString('en-GB')}`
        ).trim();
    }

    // Template: invoice_notification_v1
    if (tmpl === 'invoice_notification_v1') {
        const [contactName = '', invNum = '', total = '', dueDate = ''] = vars;
        return (
            `Invoice Notification\n\n` +
            `Client: ${contactName || 'Valued Client'}\n` +
            `Invoice #: ${invNum || ''}\n` +
            `Total Due: ${total || '0.000 KWD'}\n` +
            `Payment Due Date: ${dueDate || 'Upon receipt'}`
        ).trim();
    }

    const lines = [];
    if (shipmentAwb) lines.push(`Shipment: ${shipmentAwb}`);
    vars.forEach((v, idx) => {
        if (v) lines.push(`Field ${idx + 1}: ${v}`);
    });
    if (lines.length > 0) return lines.join('\n');
    return `Shipment Notification\nTracking: ${log.trackingNumber}\nRecipient: ${log.recipientPhone || 'On File'}`;
}

export const AdminWhatsAppLogsPage = () => {
    const { lang, isRTL } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({
        totalLogs: 0,
        totalDispatched: 0,
        sentToday: 0,
        sentLast24h: 0,
        totalDelivered: 0,
        totalRead: 0,
        totalFailed: 0,
        totalQueued: 0,
        deliveryRate: 100
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [providerFilter, setProviderFilter] = useState('ALL');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [dateRangeFilter, setDateRangeFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [selectedLog, setSelectedLog] = useState(null);
    const [previewMessageLog, setPreviewMessageLog] = useState(null);
    const [copiedMessageText, setCopiedMessageText] = useState(false);
    const [syncingTelemetry, setSyncingTelemetry] = useState(false);
    const [dispatchingQueued, setDispatchingQueued] = useState(false);
    const [resendingId, setResendingId] = useState(null);
    const [copiedJson, setCopiedJson] = useState(false);
    const [copiedPhone, setCopiedPhone] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const handleDispatchQueued = async () => {
        try {
            setDispatchingQueued(true);
            const res = await whatsappService.dispatchQueued(200);
            enqueueSnackbar(
                lang === 'ar'
                    ? `تم إرسال ${res.dispatched || 0} رسالة بنجاح، وتخطي ${res.skipped || 0} رسالة مكررة.`
                    : `Dispatched ${res.dispatched || 0} notifications (${res.skipped || 0} duplicates protected).`,
                { variant: res.dispatched > 0 ? 'success' : 'info' }
            );
            fetchLogs(1);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.message;
            enqueueSnackbar(lang === 'ar' ? `فشل إرسال الرسائل المعلقة: ${errorMsg}` : `Failed to dispatch queued: ${errorMsg}`, { variant: 'error' });
        } finally {
            setDispatchingQueued(false);
        }
    };

    const handleSyncTelemetry = async () => {
        try {
            setSyncingTelemetry(true);
            const res = await whatsappService.syncTelemetry();
            enqueueSnackbar(
                lang === 'ar' 
                    ? `تمت المزامنة بنجاح! تم تحديث ${res.updatedCount || 0} سجل استلام.` 
                    : `Telemetry synchronized! Updated ${res.updatedCount || 0} delivery records.`, 
                { variant: 'success' }
            );
            fetchLogs(pagination.page);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.message;
            enqueueSnackbar(lang === 'ar' ? `فشل مزامنة الإيصالات: ${errorMsg}` : `Sync failed: ${errorMsg}`, { variant: 'error' });
        } finally {
            setSyncingTelemetry(false);
        }
    };

    const fetchLogs = useCallback(async (page = 1) => {
        try {
            setLoading(true);
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
            if (data?.success || data?.logs) {
                setLogs(data.logs || []);
                setStats(data.stats || {
                    totalLogs: 0,
                    totalDispatched: 0,
                    sentToday: 0,
                    sentLast24h: 0,
                    totalDelivered: 0,
                    totalRead: 0,
                    totalFailed: 0,
                    totalQueued: 0,
                    deliveryRate: 100
                });
                setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
            }
        } catch (err) {
            console.error('Fetch logs error:', err);
            enqueueSnackbar(lang === 'ar' ? 'فشل تحميل سجلات رسائل واتساب' : 'Failed to load WhatsApp message logs', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [pagination.limit, statusFilter, providerFilter, roleFilter, dateRangeFilter, search, enqueueSnackbar, lang]);

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
            const errorMsg = err.response?.data?.error || err.message;
            enqueueSnackbar(lang === 'ar' ? `فشل إعادة الإرسال: ${errorMsg}` : `Resend failed: ${errorMsg}`, { variant: 'error' });
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

    const handleCopyText = (text, type = 'phone') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        if (type === 'phone') {
            setCopiedPhone(text);
            setTimeout(() => setCopiedPhone(null), 2000);
        } else {
            setCopiedId(text);
            setTimeout(() => setCopiedId(null), 2000);
        }
        enqueueSnackbar(lang === 'ar' ? 'تم النسخ بنجاح' : 'Copied to clipboard!', { variant: 'success' });
    };

    const getStatusBadge = (status) => {
        const s = (status || '').toUpperCase();
        switch (s) {
            case 'DELIVERED':
                return { badgeClass: 'badge-success text-white', label: lang === 'ar' ? 'تم التوصيل' : 'Delivered', icon: 'done_all' };
            case 'READ':
                return { badgeClass: 'badge-info text-white', label: lang === 'ar' ? 'تمت القراءة' : 'Read', icon: 'visibility' };
            case 'SENT':
            case 'SUBMITTED':
                return { badgeClass: 'badge-warning text-warning-content', label: lang === 'ar' ? 'تم الإرسال' : 'Sent', icon: 'done' };
            case 'FAILED':
                return { badgeClass: 'badge-error text-white', label: lang === 'ar' ? 'فشل' : 'Failed', icon: 'error' };
            default:
                return { badgeClass: 'badge-ghost text-base-content/70', label: status || (lang === 'ar' ? 'في الانتظار' : 'Queued'), icon: 'schedule' };
        }
    };

    const getProviderBadge = (provider) => {
        const p = (provider || '').toUpperCase();
        if (p === 'SHIPMENT_WHATSAPP' || p === 'TARGET_MSG') {
            return {
                label: 'msg.target-kw.com',
                sub: 'Target Microservice',
                badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
            };
        } else if (p === 'META') {
            return {
                label: 'Meta Cloud API',
                sub: 'Official WABA',
                badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
            };
        }
        return {
            label: 'Chatwoot',
            sub: 'Legacy Provider',
            badgeClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
        };
    };

    return (
        <div className="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-200">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="badge badge-success text-white font-mono font-bold text-xs uppercase tracking-wider">
                            WHATSAPP AUDIT COCKPIT • MSG.TARGET-KW.COM & META
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
                                    ? 'مراقبة إيصالات استلام رسائل واتساب، ومعدلات النجاح، وسجلات الإرسال للشاحن والمستلم.'
                                    : 'Audit real-time outbound dispatches, carrier tracking triggers, handset deliveries, and failure recovery.'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {stats.totalQueued > 0 && (
                        <button
                            type="button"
                            onClick={handleDispatchQueued}
                            disabled={dispatchingQueued || loading}
                            className="btn btn-sm btn-primary gap-1.5 font-bold shadow-md shadow-primary/20"
                            title={lang === 'ar' ? 'إرسال كافة الرسائل المعلقة بأمان مع منع التكرار' : 'Safely dispatch all pending notifications with duplicate protection'}
                        >
                            <span className={`material-symbols-outlined text-[18px] ${dispatchingQueued ? 'animate-spin' : ''}`}>
                                {dispatchingQueued ? 'progress_activity' : 'send_and_archive'}
                            </span>
                            {lang === 'ar' ? `إرسال المعلق (${stats.totalQueued})` : `Dispatch Pending (${stats.totalQueued})`}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSyncTelemetry}
                        disabled={syncingTelemetry || loading}
                        className="btn btn-sm btn-outline border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 font-bold"
                        title={lang === 'ar' ? 'مزامنة إيصالات التسليم والقراءة من بوابة msg' : 'Sync delivery & read receipts from msg.target-kw.com'}
                    >
                        <span className={`material-symbols-outlined text-[18px] ${syncingTelemetry ? 'animate-spin' : ''}`}>
                            sync_alt
                        </span>
                        {lang === 'ar' ? 'مزامنة إيصالات الاستلام' : 'Sync Delivery Receipts'}
                    </button>
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
            </div>

            {/* Metric Cards (Clickable Quick Filters) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Card 1: Total Dispatches */}
                <div 
                    onClick={() => { setStatusFilter('ALL'); fetchLogs(1); }}
                    className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl hover:border-primary/50 transition-all cursor-pointer"
                    title={lang === 'ar' ? 'انقر لعرض كافة الرسائل' : 'Click to show all dispatches'}
                >
                    <div className="stat p-4">
                        <div className="stat-figure text-primary">
                            <span className="material-symbols-outlined text-3xl">send</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي الرسائل الصادرة' : 'Total Dispatches'}
                        </div>
                        <div className="stat-value text-2xl font-black text-primary font-mono mt-0.5">
                            {stats.totalDispatched || stats.totalLogs || 0}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {stats.sentToday > 0 ? `${stats.sentToday} today` : `${stats.sentLast24h || 0} in last 24h`} • {stats.totalLogs || 0} total logged
                        </div>
                    </div>
                </div>

                {/* Card 2: Delivery Success Rate */}
                <div 
                    onClick={() => { setStatusFilter('SENT'); fetchLogs(1); }}
                    className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl hover:border-success/50 transition-all cursor-pointer"
                    title={lang === 'ar' ? 'انقر لعرض الرسائل المقبولة والناجحة' : 'Click to filter successful deliveries'}
                >
                    <div className="stat p-4">
                        <div className="stat-figure text-success">
                            <span className="material-symbols-outlined text-3xl">done_all</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'معدل نجاح الإرسال' : 'Delivery Success Rate'}
                        </div>
                        <div className="stat-value text-2xl font-black text-success font-mono mt-0.5">
                            {stats.deliveryRate ?? 100}%
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {stats.totalDelivered > 0 ? `${stats.totalDelivered} handset confirmed` : `${stats.totalDispatched || 0} accepted by gateway`}
                        </div>
                    </div>
                </div>

                {/* Card 3: Read Receipts */}
                <div 
                    onClick={() => { setStatusFilter('READ'); fetchLogs(1); }}
                    className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl hover:border-info/50 transition-all cursor-pointer"
                    title={lang === 'ar' ? 'انقر لعرض الرسائل المقروءة' : 'Click to filter read receipts'}
                >
                    <div className="stat p-4">
                        <div className="stat-figure text-info">
                            <span className="material-symbols-outlined text-3xl">visibility</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'تمت قراءتها' : 'Read Receipts'}
                        </div>
                        <div className="stat-value text-2xl font-black text-info font-mono mt-0.5">
                            {stats.totalRead || 0}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'إيصالات القراءة المؤكدة' : 'Blue ticks confirmed by handset'}
                        </div>
                    </div>
                </div>

                {/* Card 4: Delivery Failures */}
                <div 
                    onClick={() => { setStatusFilter('FAILED'); fetchLogs(1); }}
                    className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl hover:border-error/50 transition-all cursor-pointer"
                    title={lang === 'ar' ? 'انقر لعرض الرسائل التي فشلت ومعالجتها' : 'Click to filter and review failures'}
                >
                    <div className="stat p-4">
                        <div className="stat-figure text-error">
                            <span className="material-symbols-outlined text-3xl">error</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'فشل التوصيل' : 'Delivery Failures'}
                        </div>
                        <div className="stat-value text-2xl font-black text-error font-mono mt-0.5">
                            {stats.totalFailed || 0}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {stats.totalFailed > 0 ? (lang === 'ar' ? 'تتطلب المراجعة أو إعادة الإرسال' : 'Click to review & retry failed') : '0 failures recorded'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl p-3.5 space-y-3">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                    {/* Search Field */}
                    <form
                        onSubmit={(e) => { e.preventDefault(); fetchLogs(1); }}
                        className="relative flex-1 max-w-lg"
                    >
                        <span className="material-symbols-outlined absolute inset-y-0 start-3 my-auto h-fit text-base-content/40 text-[19px]">
                            search
                        </span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={lang === 'ar' ? 'ابحث برقم التتبع، الهاتف، اسم المستلم، أو معرف الرسالة...' : 'Search tracking #, phone, recipient name, or message ID...'}
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

                    {/* Status Tabs */}
                    <div className="flex flex-wrap items-center gap-1">
                        {[
                            { key: 'ALL', label: lang === 'ar' ? 'الكل' : 'All' },
                            { key: 'SENT', label: lang === 'ar' ? 'تم الإرسال' : 'Sent' },
                            { key: 'DELIVERED', label: lang === 'ar' ? 'تم التوصيل' : 'Delivered' },
                            { key: 'READ', label: lang === 'ar' ? 'تمت القراءة' : 'Read' },
                            { key: 'FAILED', label: lang === 'ar' ? 'فشل' : 'Failed' }
                        ].map((st) => (
                            <button
                                key={st.key}
                                type="button"
                                onClick={() => setStatusFilter(st.key)}
                                className={`btn btn-xs rounded-lg ${
                                    statusFilter === st.key
                                        ? 'btn-primary font-bold'
                                        : 'btn-ghost border border-base-200 text-base-content/70'
                                }`}
                            >
                                {st.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Secondary Filters Bar */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-base-200/60 text-xs">
                    {/* Gateway/Provider Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-base-content/50 font-bold text-[11px]">{lang === 'ar' ? 'البوابة:' : 'Gateway:'}</span>
                        <select
                            value={providerFilter}
                            onChange={(e) => setProviderFilter(e.target.value)}
                            className="select select-bordered select-xs text-xs font-semibold rounded-lg"
                        >
                            <option value="ALL">{lang === 'ar' ? 'كافة البوابات' : 'All Gateways'}</option>
                            <option value="SHIPMENT_WHATSAPP">Target Microservice (msg.target-kw.com)</option>
                            <option value="META">Meta Cloud API (WABA)</option>
                            <option value="CHATWOOT">Chatwoot (Legacy)</option>
                        </select>
                    </div>

                    {/* Recipient Role Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-base-content/50 font-bold text-[11px]">{lang === 'ar' ? 'الطرف:' : 'Party:'}</span>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="select select-bordered select-xs text-xs font-semibold rounded-lg"
                        >
                            <option value="ALL">{lang === 'ar' ? 'كافة الأطراف' : 'All Parties'}</option>
                            <option value="RECEIVER">{lang === 'ar' ? 'المستلم (Consignee)' : 'Consignee (Receiver)'}</option>
                            <option value="SENDER">{lang === 'ar' ? 'الراسل (Shipper)' : 'Shipper (Sender)'}</option>
                        </select>
                    </div>

                    {/* Date Range Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-base-content/50 font-bold text-[11px]">{lang === 'ar' ? 'الفترة:' : 'Date:'}</span>
                        <select
                            value={dateRangeFilter}
                            onChange={(e) => setDateRangeFilter(e.target.value)}
                            className="select select-bordered select-xs text-xs font-semibold rounded-lg"
                        >
                            <option value="ALL">{lang === 'ar' ? 'كل الأوقات' : 'All Time'}</option>
                            <option value="TODAY">{lang === 'ar' ? 'اليوم' : 'Today'}</option>
                            <option value="24H">{lang === 'ar' ? 'آخر 24 ساعة' : 'Last 24 Hours'}</option>
                            <option value="7D">{lang === 'ar' ? 'آخر 7 أيام' : 'Last 7 Days'}</option>
                            <option value="30D">{lang === 'ar' ? 'آخر 30 يوم' : 'Last 30 Days'}</option>
                        </select>
                    </div>

                    {(statusFilter !== 'ALL' || providerFilter !== 'ALL' || roleFilter !== 'ALL' || dateRangeFilter !== 'ALL' || search) && (
                        <button
                            type="button"
                            onClick={() => {
                                setStatusFilter('ALL');
                                setProviderFilter('ALL');
                                setRoleFilter('ALL');
                                setDateRangeFilter('ALL');
                                setSearch('');
                            }}
                            className="btn btn-ghost btn-xs text-error font-bold ms-auto"
                        >
                            <span className="material-symbols-outlined text-[13px]">filter_alt_off</span>
                            {lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
                        </button>
                    )}
                </div>
            </div>

            {/* Main Logs Table Card */}
            <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table table-zebra w-full text-xs">
                        <thead>
                            <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                <th>{lang === 'ar' ? 'رقم التتبع والشحنة' : 'Tracking & Shipment'}</th>
                                <th>{lang === 'ar' ? 'المستلم والوجهة' : 'Recipient & Route'}</th>
                                <th>{lang === 'ar' ? 'البوابة والقالب' : 'Gateway & Template'}</th>
                                <th className="text-center">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                <th>{lang === 'ar' ? 'معاينة الرسالة' : 'Message Content'}</th>
                                <th>{lang === 'ar' ? 'مراحل التوصيل' : 'Delivery Lifecycle'}</th>
                                <th>{lang === 'ar' ? 'معرف الرسالة الخارجي' : 'External Message ID'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center text-base-content/50">
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
                                    <td colSpan={8} className="py-16 text-center text-base-content/50">
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
                                    const prov = getProviderBadge(log.provider);
                                    const isSender = (log.recipientRole || '').toLowerCase() === 'sender';
                                    const cleanPhone = (log.recipientPhone || '').replace(/[^0-9]/g, '');
                                    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                                    const destCity = log.shipment?.destination?.city || log.payloadJson?.auditMetadata?.consignee?.destination;
                                    const destCountry = log.shipment?.destination?.country || log.shipment?.destination?.countryCode;
                                    const carrierName = log.shipment?.carrierCode || 'ARAMEX';
                                    const carrierAwb = log.shipment?.carrierShipmentId || log.shipment?.dhlTrackingNumber;
                                    const phenixBillId = log.shipment?.documents?.phenixBillId;
                                    const externalId = log.chatwootMessageId || log.payloadJson?.messageId || log.responseJson?.messages?.[0]?.id || log.responseJson?.messageId;
                                    const deliveredAt = log.responseJson?.deliveredAt;
                                    const readAt = log.responseJson?.readAt;

                                    return (
                                        <tr key={log.id} className="hover">
                                            {/* Tracking & Shipment Context */}
                                            <td>
                                                <div className="flex items-center gap-1.5">
                                                    <Link 
                                                        to={`/shipment/${log.trackingNumber}`}
                                                        className="font-mono font-black text-xs text-primary hover:underline"
                                                    >
                                                        {log.trackingNumber}
                                                    </Link>
                                                    <span className="badge badge-xs font-bold uppercase tracking-wider bg-base-200 text-base-content/80">
                                                        {carrierName}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-base-content/50 mt-0.5">
                                                    {carrierAwb && (
                                                        <span className="font-mono">AWB: {carrierAwb}</span>
                                                    )}
                                                    {phenixBillId && (
                                                        <span className="badge badge-ghost badge-xs font-mono">Bill #{phenixBillId}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Recipient & Route */}
                                            <td>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`badge badge-xs font-bold gap-1 ${
                                                        isSender
                                                            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                                                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-[11px]">
                                                            {isSender ? 'flight_takeoff' : 'flight_land'}
                                                        </span>
                                                        {isSender
                                                            ? (lang === 'ar' ? 'المرسل' : 'SENDER')
                                                            : (lang === 'ar' ? 'المستلم' : 'CONSIGNEE')}
                                                    </span>
                                                    <span className="font-bold text-base-content">{log.recipientName || log.recipientRole}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px] text-base-content/60 font-mono mt-0.5">
                                                    <span dir="ltr">{log.recipientPhone}</span>
                                                    {cleanPhone && (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => handleCopyText(log.recipientPhone, 'phone')}
                                                            title="Copy phone"
                                                            className="text-base-content/40 hover:text-primary"
                                                        >
                                                            <span className="material-symbols-outlined text-[13px]">
                                                                {copiedPhone === log.recipientPhone ? 'check' : 'content_copy'}
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>
                                                {(destCity || destCountry) && (
                                                    <div className="text-[10px] text-base-content/50 truncate max-w-[180px]">
                                                        📍 {destCity ? `${destCity}, ` : ''}{destCountry || ''}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Gateway & Template */}
                                            <td>
                                                <div>
                                                    <span className={`badge badge-xs font-bold border ${prov.badgeClass}`}>
                                                        {prov.label}
                                                    </span>
                                                </div>
                                                <div className="font-semibold text-xs text-base-content mt-1">{log.templateName || log.eventType}</div>
                                                <div className="text-[10px] text-base-content/50 font-mono">{log.eventType}</div>
                                            </td>

                                            {/* Status & Error Diagnostics */}
                                            <td className="text-center">
                                                <span className={`badge badge-sm font-bold text-[10px] gap-1 ${badge.badgeClass}`}>
                                                    <span className="material-symbols-outlined text-[13px]">{badge.icon}</span>
                                                    {badge.label}
                                                </span>
                                                {log.status === 'FAILED' && log.errorMessage && (
                                                    <div className="text-[10px] text-error font-medium mt-1 max-w-[160px] truncate mx-auto" title={log.errorMessage}>
                                                        ⚠️ {log.errorMessage}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Message Content Preview Button */}
                                            <td>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewMessageLog(log)}
                                                    className="btn btn-xs btn-outline btn-success gap-1 font-bold text-[11px]"
                                                    title={lang === 'ar' ? 'عرض نص رسالة واتساب المطابقة' : 'View exact WhatsApp message copy'}
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">chat</span>
                                                    {lang === 'ar' ? 'عرض الرسالة' : 'View Message'}
                                                </button>
                                            </td>

                                            {/* Delivery Lifecycle (Sent / Delivered / Read) */}
                                            <td className="font-mono text-[11px] min-w-[140px]">
                                                <div className="flex items-center gap-1.5 text-base-content/80" title="Sent to WhatsApp Gateway">
                                                    <span className="material-symbols-outlined text-[13px] text-base-content/50">done</span>
                                                    <span>{log.sentAt || log.createdAt ? new Date(log.sentAt || log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' }) : '—'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-0.5" title="Delivered to Handset">
                                                    {deliveredAt ? (
                                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[13px]">done_all</span>
                                                            {new Date(deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}
                                                        </span>
                                                    ) : (
                                                        <span className="text-base-content/30 text-[10px] ms-4">— Pending</span>
                                                    )}
                                                </div>
                                                {readAt && (
                                                    <div className="flex items-center gap-1.5 mt-0.5 text-cyan-600 dark:text-cyan-400 font-bold" title="Read by Recipient">
                                                        <span className="material-symbols-outlined text-[13px] text-[#53bdeb]">done_all</span>
                                                        <span>{new Date(readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* External Message ID / WAMID */}
                                            <td>
                                                {externalId ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-mono text-[11px] text-base-content/70 max-w-[130px] truncate" title={externalId}>
                                                            {externalId}
                                                        </span>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => handleCopyText(externalId, 'id')}
                                                            title="Copy WAMID"
                                                            className="text-base-content/40 hover:text-primary"
                                                        >
                                                            <span className="material-symbols-outlined text-[13px]">
                                                                {copiedId === externalId ? 'check' : 'content_copy'}
                                                            </span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-base-content/40 font-mono text-xs">—</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="text-end">
                                                <div className="flex items-center justify-end gap-1">
                                                    {/* Direct WhatsApp Web Link */}
                                                    {waLink && (
                                                        <a
                                                            href={waLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={lang === 'ar' ? 'فتح محادثة واتساب' : 'Open WhatsApp chat'}
                                                            className="btn btn-xs btn-ghost btn-circle text-success"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">chat</span>
                                                        </a>
                                                    )}

                                                    {/* Inspect Modal Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLog(log)}
                                                        className="btn btn-xs btn-outline border-base-300 hover:border-primary gap-1 font-semibold"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">data_object</span>
                                                        {lang === 'ar' ? 'فحص' : 'Inspect'}
                                                    </button>

                                                    {/* Resend Action */}
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
                                                            {lang === 'ar' ? 'إعادة' : 'Retry'}
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

                {/* Pagination Footer */}
                {pagination.pages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-base-200/80 bg-base-100 text-xs">
                        <span className="text-base-content/60 font-medium">
                            {lang === 'ar'
                                ? `عرض ${logs.length} من أصل ${pagination.total} سجل`
                                : `Showing ${logs.length} of ${pagination.total} total records`}
                        </span>
                        <div className="join">
                            <button
                                type="button"
                                disabled={pagination.page <= 1}
                                onClick={() => fetchLogs(pagination.page - 1)}
                                className="join-item btn btn-xs btn-outline"
                            >
                                «
                            </button>
                            <span className="join-item btn btn-xs btn-disabled font-mono">
                                {pagination.page} / {pagination.pages}
                            </span>
                            <button
                                type="button"
                                disabled={pagination.page >= pagination.pages}
                                onClick={() => fetchLogs(pagination.page + 1)}
                                className="join-item btn btn-xs btn-outline"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for Raw Payload & Variable Audit */}
            <div className={`modal modal-bottom sm:modal-middle ${selectedLog ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-3xl bg-base-100 border border-base-200 shadow-2xl p-6 text-base-content max-h-[92vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">data_object</span>
                            <h3 className="font-black text-lg text-base-content">
                                {lang === 'ar' ? 'تفاصيل وحمولة إشعار واتساب' : 'WhatsApp Notification & Variable Audit'}
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

                    {selectedLog && (() => {
                        const isSender = (selectedLog.recipientRole || '').toLowerCase() === 'sender';
                        const payload = selectedLog.payloadJson || {};
                        const audit = payload.auditMetadata || {};
                        const firstRow = payload.rows?.[0] || {};
                        const vars = firstRow.variables || payload.variables || [];
                        const headerVars = firstRow.headerVariables || payload.headerVariables || [];
                        const prov = getProviderBadge(selectedLog.provider);
                        const cleanPhone = (selectedLog.recipientPhone || '').replace(/[^0-9]/g, '');

                        return (
                            <div className="py-4 space-y-4 text-xs">
                                {/* Recipient & Dispatch Header Card */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-base-200/40 rounded-xl border border-base-200">
                                    <div>
                                        <span className="text-[11px] font-bold text-base-content/60 block">{lang === 'ar' ? 'رقم التتبع:' : 'Tracking Number:'}</span>
                                        <Link 
                                            to={`/shipment/${selectedLog.trackingNumber}`}
                                            className="font-mono font-bold text-sm text-primary hover:underline"
                                        >
                                            {selectedLog.trackingNumber}
                                        </Link>
                                    </div>
                                    <div>
                                        <span className="text-[11px] font-bold text-base-content/60 block">{lang === 'ar' ? 'المستلم الفعلي:' : 'Target Recipient:'}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`badge badge-xs font-bold ${
                                                isSender
                                                    ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                                                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                            }`}>
                                                {isSender ? 'SENDER' : 'CONSIGNEE'}
                                            </span>
                                            <span className="font-bold text-base-content">{selectedLog.recipientName || '—'}</span>
                                        </div>
                                        <span className="font-mono text-[11px] text-base-content/60" dir="ltr">{selectedLog.recipientPhone}</span>
                                    </div>
                                    <div>
                                        <span className="text-[11px] font-bold text-base-content/60 block">{lang === 'ar' ? 'القالب / البوابة:' : 'Template / Gateway:'}</span>
                                        <span className="font-mono font-bold text-base-content">{selectedLog.templateName || 'Direct Message'}</span>
                                        <div className="text-[11px] text-base-content/50 font-bold">{prov.label}</div>
                                    </div>
                                    <div className="sm:col-span-3 pt-2 border-t border-base-200/60 flex items-center justify-between gap-2 flex-wrap">
                                        <div>
                                            <span className="text-[10px] font-bold text-base-content/50 uppercase">{lang === 'ar' ? 'معرف الرسالة الخارجي (WAMID):' : 'External WAMID:'}</span>
                                            <div className="font-mono text-xs text-base-content/80 break-all">{selectedLog.chatwootMessageId || selectedLog.externalMessageId || (lang === 'ar' ? 'لا يوجد' : 'None')}</div>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-base-content/50 uppercase">{lang === 'ar' ? 'تاريخ ووقت الإرسال:' : 'Dispatch Timestamp:'}</span>
                                            <div className="font-mono text-xs text-base-content/80">{new Date(selectedLog.sentAt || selectedLog.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Simulated WhatsApp Speech Bubble inside Inspect Modal */}
                                <div className="p-3.5 bg-[#efeae2] dark:bg-slate-900 rounded-2xl flex justify-start border border-black/5">
                                    <div className="bg-[#dcf8c6] dark:bg-emerald-950/70 text-[#111b21] dark:text-emerald-100 p-3.5 rounded-xl rounded-tl-none max-w-[92%] shadow-sm relative space-y-2">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#128c7e] dark:text-emerald-400">
                                            {selectedLog.templateName || 'WhatsApp Template'}
                                        </div>
                                        <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans">
                                            {formatExactMessageCopy(selectedLog)}
                                        </div>
                                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-emerald-300/60 pt-1">
                                            <span>{new Date(selectedLog.sentAt || selectedLog.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {selectedLog.responseJson?.readAt ? (
                                                <span className="material-symbols-outlined text-[14px] text-[#53bdeb]">done_all</span>
                                            ) : selectedLog.responseJson?.deliveredAt ? (
                                                <span className="material-symbols-outlined text-[14px] text-[#667781]">done_all</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-[14px] text-[#8696a0]">done</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Parties Separation Verification Box */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="p-3 bg-purple-500/5 rounded-xl border border-purple-500/20">
                                        <div className="flex items-center gap-1.5 mb-1.5 text-purple-700 dark:text-purple-400 font-bold text-xs">
                                            <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                                            {lang === 'ar' ? 'بيانات الشاحن / التاجر (Origin Shipper)' : 'Shipper / Store (Origin)'}
                                        </div>
                                        <div className="space-y-1 text-[11px]">
                                            <div className="flex justify-between">
                                                <span className="text-base-content/60">{lang === 'ar' ? 'الاسم:' : 'Name:'}</span>
                                                <span className="font-bold text-base-content">{audit.sender?.name || (isSender ? selectedLog.recipientName : '—')}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-base-content/60">{lang === 'ar' ? 'الهاتف:' : 'Phone:'}</span>
                                                <span className="font-mono text-base-content" dir="ltr">{audit.sender?.phone || (isSender ? selectedLog.recipientPhone : '—')}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                                        <div className="flex items-center gap-1.5 mb-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                                            <span className="material-symbols-outlined text-sm">flight_land</span>
                                            {lang === 'ar' ? 'بيانات المستلم (Destination Consignee)' : 'Consignee (Destination)'}
                                        </div>
                                        <div className="space-y-1 text-[11px]">
                                            <div className="flex justify-between">
                                                <span className="text-base-content/60">{lang === 'ar' ? 'الاسم:' : 'Name:'}</span>
                                                <span className="font-bold text-base-content">{audit.consignee?.name || (!isSender ? selectedLog.recipientName : (vars[2] || '—'))}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-base-content/60">{lang === 'ar' ? 'الهاتف:' : 'Phone:'}</span>
                                                <span className="font-mono text-base-content" dir="ltr">{audit.consignee?.phone || (!isSender ? selectedLog.recipientPhone : (vars[3] || '—'))}</span>
                                            </div>
                                            {(audit.consignee?.destination || selectedLog.shipment?.destination?.city) && (
                                                <div className="flex justify-between">
                                                    <span className="text-base-content/60">{lang === 'ar' ? 'الوجهة:' : 'Destination:'}</span>
                                                    <span className="text-base-content">{audit.consignee?.destination || selectedLog.shipment?.destination?.city}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Meta Template Variables Breakdown */}
                                {vars.length > 0 && (
                                    <div className="p-3.5 bg-base-200/40 rounded-xl border border-base-200">
                                        <div className="font-bold text-xs mb-2 text-base-content flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-primary text-sm">tune</span>
                                            {lang === 'ar' ? 'متغيرات قالب واتساب (Meta Template Variables)' : 'Meta Template Variable Breakdown'}
                                        </div>
                                        <div className="space-y-1.5 text-[11px]">
                                            {headerVars.length > 0 && (
                                                <div className="flex items-start justify-between py-1 border-b border-base-200/60 font-mono">
                                                    <span className="text-primary font-bold">Header &#123;&#123;1&#125;&#125; (AWB / Tracking)</span>
                                                    <span className="font-bold text-base-content">{headerVars[0]}</span>
                                                </div>
                                            )}
                                            {vars.map((val, idx) => {
                                                const labels = [
                                                    lang === 'ar' ? 'رقم الإيصال / الفاتورة' : 'Receipt / Invoice #',
                                                    lang === 'ar' ? 'تاريخ الشحنة' : 'Consignment Date',
                                                    lang === 'ar' ? 'اسم المستلم (Consignee)' : 'Consignee Name',
                                                    lang === 'ar' ? 'هاتف المستلم (Consignee Tel)' : 'Consignee Phone',
                                                    lang === 'ar' ? 'رابط التتبع' : 'Tracking Link'
                                                ];
                                                return (
                                                    <div key={idx} className="flex items-start justify-between py-1 border-b border-base-200/40 last:border-0 font-mono">
                                                        <span className="text-base-content/70">
                                                            Body &#123;&#123;{idx + 1}&#125;&#125; <span className="text-base-content/40 font-sans">({labels[idx] || `Param ${idx + 1}`})</span>
                                                        </span>
                                                        <span className="font-bold text-base-content max-w-[60%] text-end break-all" dir="ltr">{val}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {selectedLog.errorMessage && (
                                    <div className="alert alert-error text-xs py-2.5 rounded-xl font-semibold">
                                        <span className="material-symbols-outlined text-base">error</span>
                                        <span>{lang === 'ar' ? 'سبب الفشل:' : 'Failure Reason:'} {selectedLog.errorMessage}</span>
                                    </div>
                                )}

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-bold text-base-content">
                                            {lang === 'ar' ? 'الحمولة الخام واستجابة البوابة:' : 'Raw Payload & Gateway Response:'}
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

                                    <pre className="bg-slate-950 text-cyan-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60 border border-slate-800" dir="ltr">
                                        {JSON.stringify({ payload: selectedLog.payloadJson, response: selectedLog.responseJson }, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="modal-action pt-3 border-t border-base-200 flex justify-between items-center">
                        {selectedLog?.recipientPhone && (
                            <a
                                href={`https://wa.me/${(selectedLog.recipientPhone || '').replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-outline btn-success gap-1.5 font-bold"
                            >
                                <span className="material-symbols-outlined text-base">chat</span>
                                {lang === 'ar' ? 'محادثة في واتساب' : 'Chat in WhatsApp'}
                            </a>
                        )}
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

            {/* Dedicated WhatsApp Message Preview Dialog Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${previewMessageLog ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-lg bg-base-100 border border-base-200 shadow-2xl p-5 text-base-content">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-success text-2xl">chat</span>
                            <h3 className="font-black text-base text-base-content">
                                {lang === 'ar' ? 'معاينة رسالة واتساب المطابقة' : 'WhatsApp Message Preview'}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPreviewMessageLog(null)}
                            className="btn btn-sm btn-circle btn-ghost text-base-content/60"
                        >
                            ✕
                        </button>
                    </div>

                    {previewMessageLog && (() => {
                        const exactCopy = formatExactMessageCopy(previewMessageLog);
                        const isSender = (previewMessageLog.recipientRole || '').toLowerCase() === 'sender';
                        const deliveredAt = previewMessageLog.responseJson?.deliveredAt;
                        const readAt = previewMessageLog.responseJson?.readAt;
                        const failedAt = previewMessageLog.status === 'FAILED' ? previewMessageLog.updatedAt : null;

                        return (
                            <div className="py-4 space-y-4 text-xs">
                                {/* Meta Badges */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="badge badge-sm font-bold font-mono bg-base-200 text-base-content">
                                        {previewMessageLog.trackingNumber}
                                    </span>
                                    <span className={`badge badge-sm font-bold ${
                                        isSender ? 'bg-purple-500/15 text-purple-700' : 'bg-emerald-500/15 text-emerald-700'
                                    }`}>
                                        {isSender ? 'SENDER' : 'CONSIGNEE'}
                                    </span>
                                    <span className="badge badge-sm font-mono border border-base-300">
                                        {previewMessageLog.recipientPhone}
                                    </span>
                                </div>

                                {/* Simulated WhatsApp Speech Bubble */}
                                <div className="p-3.5 bg-[#efeae2] dark:bg-slate-900 rounded-2xl flex justify-start border border-black/5">
                                    <div className="bg-[#dcf8c6] dark:bg-emerald-950/70 text-[#111b21] dark:text-emerald-100 p-3.5 rounded-xl rounded-tl-none max-w-[92%] shadow-sm relative space-y-2">
                                        <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans">
                                            {exactCopy}
                                        </div>
                                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-emerald-300/60 pt-1">
                                            <span>{new Date(previewMessageLog.sentAt || previewMessageLog.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {readAt ? (
                                                <span className="material-symbols-outlined text-[14px] text-[#53bdeb]">done_all</span>
                                            ) : deliveredAt ? (
                                                <span className="material-symbols-outlined text-[14px] text-[#667781]">done_all</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-[14px] text-[#8696a0]">done</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Delivery Lifecycle Telemetry Table */}
                                <div className="p-3 bg-base-200/50 rounded-xl border border-base-200 text-[11px] space-y-1.5 font-mono">
                                    <div className="font-sans font-bold text-base-content/60 uppercase text-[10px] mb-1">
                                        {lang === 'ar' ? 'سجل وتوقيت التسليم الفعلي' : 'Delivery Lifecycle Telemetry'}
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-base-content/60">Sent to Gateway:</span>
                                        <span className="font-semibold text-base-content">{new Date(previewMessageLog.sentAt || previewMessageLog.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-base-content/60">Delivered to Handset:</span>
                                        <span className={`font-semibold ${deliveredAt ? 'text-emerald-600' : 'text-base-content/40'}`}>
                                            {deliveredAt ? new Date(deliveredAt).toLocaleString() : 'Pending confirmation'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-base-content/60">Read by Recipient:</span>
                                        <span className={`font-semibold ${readAt ? 'text-cyan-600' : 'text-base-content/40'}`}>
                                            {readAt ? new Date(readAt).toLocaleString() : 'Unread'}
                                        </span>
                                    </div>
                                    {failedAt && (
                                        <div className="flex justify-between text-error font-semibold">
                                            <span>Failed At:</span>
                                            <span>{new Date(failedAt).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="modal-action pt-3 border-t border-base-200 flex justify-between items-center">
                        <button
                            type="button"
                            onClick={() => {
                                if (previewMessageLog) {
                                    navigator.clipboard.writeText(formatExactMessageCopy(previewMessageLog));
                                    setCopiedMessageText(true);
                                    setTimeout(() => setCopiedMessageText(false), 2000);
                                }
                            }}
                            className="btn btn-sm btn-outline gap-1.5 font-semibold"
                        >
                            <span className="material-symbols-outlined text-base">
                                {copiedMessageText ? 'check' : 'content_copy'}
                            </span>
                            {copiedMessageText ? (lang === 'ar' ? 'تم النسخ!' : 'Copied!') : (lang === 'ar' ? 'نسخ نص الرسالة' : 'Copy Message')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreviewMessageLog(null)}
                            className="btn btn-sm btn-ghost text-base-content/70"
                        >
                            {lang === 'ar' ? 'إغلاق' : 'Close'}
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setPreviewMessageLog(null)} />
            </div>
        </div>
    );
};

export default AdminWhatsAppLogsPage;
