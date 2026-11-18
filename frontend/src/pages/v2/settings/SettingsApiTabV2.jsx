import React, { useCallback, useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import api from '../../../services/api';
import ErrorBannerV2 from '../components/ErrorBannerV2';
import EmptyStateV2 from '../components/EmptyStateV2';

const WEBHOOK_EVENT_OPTIONS = [
    { id: 'shipment.created', label: 'shipment.created (Consignment booking)' },
    { id: 'shipment.status_updated', label: 'shipment.status_updated (Milestone transitions)' },
    { id: 'shipment.delivered', label: 'shipment.delivered (POD capture)' },
    { id: 'shipment.booked', label: 'shipment.booked (Carrier AWB issued)' },
    { id: '*', label: '* (All platform events)' }
];

export const SettingsApiTabV2 = ({ user, refreshUser, isRTL }) => {
    const { enqueueSnackbar } = useSnackbar();

    // API Key state
    const [apiKey, setApiKey] = useState(user?.apiKey || '');
    const [loadingKey, setLoadingKey] = useState(false);
    const [showKeyModal, setShowKeyModal] = useState(false);
    const [showPlainKey, setShowPlainKey] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);

    // Webhooks state
    const [webhooks, setWebhooks] = useState([]);
    const [loadingWebhooks, setLoadingWebhooks] = useState(false);
    const [webhooksError, setWebhooksError] = useState(null);
    const [showAddWebhookModal, setShowAddWebhookModal] = useState(false);
    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [newWebhookSecret, setNewWebhookSecret] = useState('');
    const [newWebhookEvents, setNewWebhookEvents] = useState([
        'shipment.created',
        'shipment.status_updated',
        'shipment.delivered'
    ]);
    const [creatingWebhook, setCreatingWebhook] = useState(false);
    const [testingWebhookId, setTestingWebhookId] = useState(null);
    const [testResult, setTestResult] = useState(null);
    const [selectedWebhookLogs, setSelectedWebhookLogs] = useState(null);
    const [webhookLogs, setWebhookLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const fetchWebhooks = useCallback(async () => {
        setLoadingWebhooks(true);
        setWebhooksError(null);
        try {
            const res = await api.get('/integrations/webhooks');
            setWebhooks(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch (err) {
            setWebhooksError(
                err?.response?.data?.error ||
                    err?.message ||
                    (isRTL ? 'تعذر تحميل روابط الويب هوك' : 'Failed to load webhooks')
            );
        } finally {
            setLoadingWebhooks(false);
        }
    }, [isRTL]);

    useEffect(() => {
        fetchWebhooks();
    }, [fetchWebhooks]);

    const generateNewKey = async () => {
        if (apiKey || user?.apiKeyLast4) {
            const confirmed = window.confirm(
                isRTL
                    ? 'تحذير: تجديد المفتاح سيؤدي إلى إبطال المفتاح الحالي فوراً. هل أنت متأكد؟'
                    : 'Warning: Rolling your API key will immediately invalidate your active key. Continue?'
            );
            if (!confirmed) return;
        }
        setLoadingKey(true);
        try {
            const res = await api.post('/auth/api-key');
            const freshKey = res?.data?.apiKey || '';
            setApiKey(freshKey);
            setShowPlainKey(true);
            setKeyCopied(false);
            setShowKeyModal(true);
            enqueueSnackbar(
                isRTL ? 'تم إنشاء مفتاح API جديد بنجاح!' : 'New API Key generated successfully!',
                { variant: 'success' }
            );
            if (refreshUser) await refreshUser();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل في إنشاء مفتاح API' : 'Failed to generate API Key'),
                { variant: 'error' }
            );
        } finally {
            setLoadingKey(false);
        }
    };

    const handleCreateWebhook = async (e) => {
        e.preventDefault();
        if (!newWebhookUrl.trim()) {
            enqueueSnackbar(isRTL ? 'الرجاء إدخال رابط صحيح' : 'Please provide a valid endpoint URL', { variant: 'warning' });
            return;
        }
        setCreatingWebhook(true);
        try {
            const res = await api.post('/integrations/webhooks', {
                targetUrl: newWebhookUrl.trim(),
                secret: newWebhookSecret.trim() || undefined,
                events: newWebhookEvents
            });
            if (res?.data?.success) {
                enqueueSnackbar(
                    isRTL ? 'تم تسجيل الويب هوك بنجاح!' : 'Webhook registered successfully!',
                    { variant: 'success' }
                );
                setShowAddWebhookModal(false);
                setNewWebhookUrl('');
                setNewWebhookSecret('');
                await fetchWebhooks();
            }
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل تسجيل الويب هوك' : 'Failed to register webhook'),
                { variant: 'error' }
            );
        } finally {
            setCreatingWebhook(false);
        }
    };

    const handleToggleWebhook = async (sub) => {
        try {
            await api.put(`/integrations/webhooks/${sub.id}`, { isActive: !sub.isActive });
            enqueueSnackbar(
                isRTL
                    ? `تم ${!sub.isActive ? 'تفعيل' : 'إيقاف'} الويب هوك`
                    : `Webhook ${!sub.isActive ? 'activated' : 'paused'}`,
                { variant: 'info' }
            );
            await fetchWebhooks();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل تحديث الحالة' : 'Failed to update status'),
                { variant: 'error' }
            );
        }
    };

    const handleDeleteWebhook = async (id) => {
        if (!window.confirm(isRTL ? 'هل تريد حذف رابط الويب هوك؟' : 'Remove this webhook endpoint?')) return;
        try {
            await api.delete(`/integrations/webhooks/${id}`);
            enqueueSnackbar(isRTL ? 'تم حذف الويب هوك' : 'Webhook removed', { variant: 'success' });
            await fetchWebhooks();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل حذف الويب هوك' : 'Failed to delete webhook'),
                { variant: 'error' }
            );
        }
    };

    const handleTestWebhook = async (id) => {
        setTestingWebhookId(id);
        setTestResult(null);
        try {
            const res = await api.post(`/integrations/webhooks/${id}/test`);
            setTestResult({
                success: true,
                message: res?.data?.message || 'Ping delivered successfully (HTTP 200 OK)'
            });
            enqueueSnackbar(isRTL ? 'تم إرسال اختبار الاتصال بنجاح' : 'Test ping dispatched successfully!', { variant: 'success' });
        } catch (err) {
            const errMsg = err?.response?.data?.error || err?.message || 'Webhook ping failed';
            setTestResult({ success: false, message: errMsg });
            enqueueSnackbar(`Test dispatch failed: ${errMsg}`, { variant: 'error' });
        } finally {
            setTestingWebhookId(null);
        }
    };

    const handleViewLogs = async (sub) => {
        setSelectedWebhookLogs(sub);
        setLoadingLogs(true);
        try {
            const res = await api.get(`/integrations/webhooks/${sub.id}/events`);
            setWebhookLogs(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل تحميل السجلات' : 'Failed to load webhook logs'),
                { variant: 'error' }
            );
        } finally {
            setLoadingLogs(false);
        }
    };

    const displayedKeyValue = apiKey
        ? showPlainKey
            ? apiKey
            : `${apiKey.slice(0, 10)}••••••••••••••••••••••••${apiKey.slice(-4)}`
        : user?.apiKeyLast4
            ? `••••••••••••••••••••••••••••••••••••${user.apiKeyLast4}`
            : isRTL
                ? 'لم يتم توليد مفتاح API بعد'
                : 'No API key generated yet';

    return (
        <div className="space-y-5">
            {/* REST API Key Card */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                            {isRTL ? 'بيانات اعتماد Developer REST API' : 'Developer REST API Credentials'}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {isRTL
                                ? 'مفتاح برمجي للربط مع أنظمة ERP والمتاجر الإلكترونية.'
                                : 'Programmatic bearer token for B2B e-commerce ERP integration and bulk order injection.'}
                        </p>
                    </div>
                    {(user?.apiKeyLast4 || apiKey) && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-black self-start sm:self-auto">
                            ACTIVE {user?.apiKeyLast4 ? `(...${user.apiKeyLast4})` : ''}
                        </span>
                    )}
                </div>

                {apiKey && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
                        <div className="flex items-center gap-2 font-bold">
                            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base" aria-hidden="true">check_circle</span>
                            <span>
                                {isRTL
                                    ? 'تم توليد مفتاح سري جديد! انسخه الآن قبل مغادرة الصفحة.'
                                    : 'New secret key generated! Copy it now before navigating away.'}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowKeyModal(true)}
                            className="text-emerald-700 dark:text-emerald-300 font-extrabold underline cursor-pointer"
                        >
                            {isRTL ? 'عرض بالكامل' : 'View Dialog'}
                        </button>
                    </div>
                )}

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                            {apiKey ? 'SECRET API KEY' : user?.apiKeyLast4 ? 'STORED SECRET API KEY' : 'API KEY STATUS'}
                        </span>
                        {apiKey && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                {showPlainKey ? 'Visible' : 'Masked'}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1 min-w-0">
                            <input
                                type="text"
                                readOnly
                                dir="ltr"
                                value={displayedKeyValue}
                                className="w-full h-9 px-3 pe-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100 select-all"
                            />
                            {apiKey && (
                                <button
                                    type="button"
                                    onClick={() => setShowPlainKey(!showPlainKey)}
                                    aria-label={showPlainKey ? 'Hide key' : 'Show key'}
                                    className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                                        {showPlainKey ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            disabled={!apiKey && !user?.apiKeyLast4}
                            onClick={() => {
                                if (apiKey) {
                                    navigator.clipboard.writeText(apiKey);
                                    enqueueSnackbar(isRTL ? 'تم نسخ المفتاح' : 'API Key copied to clipboard', { variant: 'success' });
                                } else if (user?.apiKeyLast4) {
                                    enqueueSnackbar(
                                        isRTL
                                            ? 'المفتاح مخفي لدواعي الأمان. انقر على تجديد المفتاح إذا فقدته.'
                                            : 'Full secret key is hidden for security. Click Roll Key to generate a new secret.',
                                        { variant: 'info' }
                                    );
                                }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer shrink-0"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">content_copy</span>
                            <span>{isRTL ? 'نسخ' : 'Copy'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={generateNewKey}
                            disabled={loadingKey}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
                            <span>
                                {loadingKey
                                    ? isRTL ? 'جاري التوليد...' : 'Generating...'
                                    : apiKey || user?.apiKeyLast4
                                        ? isRTL ? 'تجديد المفتاح' : 'Roll Key'
                                        : isRTL ? 'إنشاء مفتاح' : 'Generate Key'}
                            </span>
                        </button>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isRTL ? 'أضف في ترويسة الطلب:' : 'Include in authorization header:'}{' '}
                        <code dir="ltr" className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono font-bold text-primary">
                            X-API-Key: {apiKey ? `${apiKey.slice(0, 10)}...` : user?.apiKeyLast4 ? `••••...${user.apiKeyLast4}` : 'tl_live_...'}
                        </code>
                    </div>
                </div>
            </div>

            {/* Webhooks Section */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                            {isRTL ? 'اشتراكات الويب هوك (HTTP Callbacks)' : 'Webhook Subscriptions (HTTP Callbacks)'}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {isRTL
                                ? 'استقبال إشعارات فورية موقعة HMAC SHA-256 لتحديثات الشحنات.'
                                : 'Receive real-time signed HMAC SHA-256 webhooks for status updates and proof of delivery.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAddWebhookModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs self-start sm:self-auto cursor-pointer shrink-0"
                    >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">add_link</span>
                        <span>{isRTL ? 'إضافة ويب هوك' : 'Add Webhook'}</span>
                    </button>
                </div>

                {webhooksError && (
                    <ErrorBannerV2 message={webhooksError} onRetry={fetchWebhooks} isRetrying={loadingWebhooks} />
                )}

                {loadingWebhooks ? (
                    <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        {isRTL ? 'جاري تحميل روابط الويب هوك...' : 'Loading webhook endpoints...'}
                    </div>
                ) : webhooks.length === 0 ? (
                    <EmptyStateV2
                        icon="webhook"
                        title={isRTL ? 'لا توجد روابط ويب هوك' : 'No Webhook Endpoints Configured'}
                        description={
                            isRTL
                                ? 'أضف رابط HTTPS لاستقبال أحداث الشحنات التلقائية.'
                                : 'Add your store or logistics server URL to listen for automated consignment events.'
                        }
                        actionLabel={isRTL ? 'إضافة ويب هوك' : 'Add Webhook'}
                        onAction={() => setShowAddWebhookModal(true)}
                    />
                ) : (
                    <div className="space-y-3">
                        {webhooks.map((sub) => (
                            <div
                                key={sub.id}
                                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                sub.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                            }`}
                                        />
                                        <code dir="ltr" className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 break-all">
                                            {sub.targetUrl || sub.url}
                                        </code>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleTestWebhook(sub.id)}
                                            disabled={testingWebhookId === sub.id}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-primary cursor-pointer disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-xs" aria-hidden="true">bolt</span>
                                            <span>{testingWebhookId === sub.id ? 'Sending...' : 'Test Ping'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleViewLogs(sub)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-xs" aria-hidden="true">history</span>
                                            <span>Logs ({sub._count?.deliveryEvents || 0})</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleWebhook(sub)}
                                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                                                sub.isActive
                                                    ? 'border-amber-500/40 text-amber-700 dark:text-amber-300'
                                                    : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                            }`}
                                        >
                                            {sub.isActive ? 'Pause' : 'Activate'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteWebhook(sub.id)}
                                            aria-label="Delete webhook"
                                            className="p-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">delete</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-bold text-slate-500 dark:text-slate-400">Events:</span>
                                        {(Array.isArray(sub.events) ? sub.events : []).map((ev) => (
                                            <span
                                                key={ev}
                                                className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold text-[11px]"
                                            >
                                                {ev}
                                            </span>
                                        ))}
                                    </div>
                                    {sub.secret && (
                                        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                            <span>Secret: {sub.secret.slice(0, 8)}...</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(sub.secret);
                                                    enqueueSnackbar('Webhook secret copied', { variant: 'success' });
                                                }}
                                                className="font-sans text-xs font-bold text-primary hover:underline cursor-pointer"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {testResult && (
                    <div
                        className={`rounded-xl border p-3 flex items-center justify-between gap-2 text-xs font-bold ${
                            testResult.success
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                        }`}
                    >
                        <span>{testResult.message}</span>
                        <button
                            type="button"
                            onClick={() => setTestResult(null)}
                            className="p-1 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">close</span>
                        </button>
                    </div>
                )}

                {selectedWebhookLogs && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                Delivery Logs: <code className="text-primary font-mono">{selectedWebhookLogs.targetUrl}</code>
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedWebhookLogs(null)}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            >
                                {isRTL ? 'إغلاق' : 'Close'}
                            </button>
                        </div>

                        {loadingLogs ? (
                            <div className="p-4 text-center text-xs text-slate-500">Loading logs...</div>
                        ) : webhookLogs.length === 0 ? (
                            <div className="text-xs text-slate-500 py-4 text-center">No dispatch attempts recorded yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-start font-mono text-xs border-collapse">
                                    <thead>
                                        <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th className="py-2 px-2 text-start">Event</th>
                                            <th className="py-2 px-2 text-start">Status</th>
                                            <th className="py-2 px-2 text-start">Attempts</th>
                                            <th className="py-2 px-2 text-start">Time</th>
                                            <th className="py-2 px-2 text-start">Error</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {webhookLogs.map((log) => (
                                            <tr key={log.id}>
                                                <td className="py-2 px-2 font-bold text-slate-800 dark:text-slate-200">{log.event}</td>
                                                <td className="py-2 px-2">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            log.status === 'success'
                                                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                                        }`}
                                                    >
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-2">{log.attempts}</td>
                                                <td className="py-2 px-2 text-slate-500">
                                                    {new Date(log.createdAt).toLocaleTimeString()}
                                                </td>
                                                <td className="py-2 px-2 text-rose-600 dark:text-rose-400 truncate max-w-xs">
                                                    {log.lastError || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Secret Key Modal */}
            {showKeyModal && apiKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-2xl" aria-hidden="true">key</span>
                            </div>
                            <div>
                                <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                                    {isRTL ? 'احفظ مفتاح API السري' : 'Save Your Secret API Key'}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {isRTL
                                        ? 'لن يتم عرض هذا المفتاح مرة أخرى بعد إغلاق النافذة.'
                                        : 'For your security, this key cannot be viewed again once closed.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                dir="ltr"
                                value={apiKey}
                                className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 select-all"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(apiKey);
                                    setKeyCopied(true);
                                    enqueueSnackbar('API key copied to clipboard!', { variant: 'success' });
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer shrink-0 ${
                                    keyCopied ? 'bg-emerald-600' : 'bg-primary'
                                }`}
                            >
                                {keyCopied ? (isRTL ? 'تم النسخ' : 'Copied!') : isRTL ? 'نسخ' : 'Copy'}
                            </button>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowKeyModal(false)}
                                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
                            >
                                {isRTL ? 'تم الحفظ' : 'Done, I have saved it'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Webhook Modal */}
            {showAddWebhookModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                                {isRTL ? 'تسجيل نقطة ويب هوك' : 'Register Webhook Endpoint'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowAddWebhookModal(false)}
                                className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleCreateWebhook} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                    Destination URL *
                                </label>
                                <input
                                    type="url"
                                    dir="ltr"
                                    value={newWebhookUrl}
                                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                                    placeholder="https://api.yourdomain.com/webhooks/shipments"
                                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                    Signing Secret (Optional)
                                </label>
                                <input
                                    type="text"
                                    dir="ltr"
                                    value={newWebhookSecret}
                                    onChange={(e) => setNewWebhookSecret(e.target.value)}
                                    placeholder="Leave empty to auto-generate 24-byte hex"
                                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                    Subscribed Events
                                </label>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                                    {WEBHOOK_EVENT_OPTIONS.map((ev) => {
                                        const isChecked = newWebhookEvents.includes(ev.id);
                                        return (
                                            <label key={ev.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        setNewWebhookEvents(
                                                            isChecked
                                                                ? newWebhookEvents.filter((x) => x !== ev.id)
                                                                : [...newWebhookEvents, ev.id]
                                                        );
                                                    }}
                                                    className="checkbox checkbox-primary checkbox-xs"
                                                />
                                                <span>{ev.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setShowAddWebhookModal(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={creatingWebhook}
                                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                                >
                                    {creatingWebhook ? 'Registering...' : 'Register Endpoint'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsApiTabV2;
