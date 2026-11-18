import React, { useCallback, useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import api from '../../../services/api';
import ErrorBannerV2 from '../components/ErrorBannerV2';

const DEFAULT_WHATSAPP_RULES = [
    { eventType: 'out_for_delivery', recipientRole: 'receiver', templateName: 'target_shipment_out_for_delivery', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'delivered', recipientRole: 'receiver', templateName: 'target_shipment_delivered', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'delivered', recipientRole: 'sender', templateName: 'target_shipment_delivered', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'on_hold_customs_issue', recipientRole: 'receiver', templateName: 'target_customs_exception_hold', enabled: true, allowQuietHoursBypass: true },
    { eventType: 'on_hold_customs_issue', recipientRole: 'sender', templateName: 'target_customs_exception_hold', enabled: true, allowQuietHoursBypass: true },
    { eventType: 'payment_link_ready', recipientRole: 'receiver', templateName: 'payment_request_v1', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'payment_link_ready', recipientRole: 'sender', templateName: 'payment_request_v1', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'shipment_created', recipientRole: 'receiver', templateName: 'shipment_confirmation_2', enabled: true, allowQuietHoursBypass: false },
    { eventType: 'shipment_created', recipientRole: 'sender', templateName: 'shipment_confirmation_2', enabled: true, allowQuietHoursBypass: false }
];

const EVENT_METRIC_CONFIG = {
    out_for_delivery: { labelEn: 'Out for Delivery', labelAr: 'خرج للتوصيل', icon: 'local_shipping' },
    delivered: { labelEn: 'Delivered (ePOD)', labelAr: 'تم التوصيل', icon: 'check_circle' },
    on_hold_customs_issue: { labelEn: 'Customs & Border Hold', labelAr: 'احتجاز جمركي', icon: 'gavel' },
    payment_link_ready: { labelEn: 'Payment Link Ready', labelAr: 'رابط الدفع جاهز', icon: 'payments' },
    shipment_created: { labelEn: 'Shipment Created', labelAr: 'إنشاء الشحنة', icon: 'inventory_2' }
};

export const SettingsWhatsAppTabV2 = ({ isRTL }) => {
    const { enqueueSnackbar } = useSnackbar();

    const [whatsAppConfig, setWhatsAppConfig] = useState({
        provider: 'SHIPMENT_WHATSAPP',
        serviceUrl: 'https://msg.target-kw.com',
        phoneId: '',
        apiKey: '',
        chatwootBaseUrl: 'https://inbox.mawthook.io',
        chatwootAccountId: '1',
        chatwootInboxId: '',
        chatwootApiToken: '',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        quietHoursTimezone: 'Asia/Kuwait',
        allowDeliveryQuietHours: false
    });
    const [whatsAppRules, setWhatsAppRules] = useState(DEFAULT_WHATSAPP_RULES);
    const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);
    const [whatsAppError, setWhatsAppError] = useState(null);
    const [showApiKey, setShowApiKey] = useState(false);
    const [showChatwootToken, setShowChatwootToken] = useState(false);

    const fetchWhatsAppSettings = useCallback(async () => {
        setLoadingWhatsApp(true);
        setWhatsAppError(null);
        try {
            const res = await api.get('settings/whatsapp');
            if (res?.data?.success) {
                if (res.data.config) {
                    setWhatsAppConfig((prev) => ({
                        ...prev,
                        ...res.data.config,
                        apiKey: res.data.config.apiKey || '',
                        phoneId: res.data.config.phoneId || '',
                        chatwootBaseUrl: res.data.config.chatwootBaseUrl || 'https://inbox.mawthook.io',
                        chatwootAccountId: res.data.config.chatwootAccountId || '1',
                        chatwootInboxId: res.data.config.chatwootInboxId || '',
                        chatwootApiToken: res.data.config.chatwootApiToken || '',
                        serviceUrl: res.data.config.serviceUrl || 'https://msg.target-kw.com',
                        quietHoursStart: res.data.config.quietHoursStart || '22:00',
                        quietHoursEnd: res.data.config.quietHoursEnd || '08:00',
                        quietHoursTimezone: res.data.config.quietHoursTimezone || 'Asia/Kuwait',
                        allowDeliveryQuietHours: Boolean(res.data.config.allowDeliveryQuietHours),
                        quietHoursEnabled: Boolean(res.data.config.quietHoursEnabled)
                    }));
                }
                if (Array.isArray(res.data.rules) && res.data.rules.length > 0) {
                    setWhatsAppRules(res.data.rules);
                }
            }
        } catch (err) {
            setWhatsAppError(
                err?.response?.data?.error ||
                    err?.message ||
                    (isRTL ? 'تعذر تحميل إعدادات واتساب' : 'Failed to load WhatsApp configuration')
            );
        } finally {
            setLoadingWhatsApp(false);
        }
    }, [isRTL]);

    useEffect(() => {
        fetchWhatsAppSettings();
    }, [fetchWhatsAppSettings]);

    const handleRuleChange = (idx, field, value) => {
        setWhatsAppRules((prev) =>
            prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
        );
    };

    const handleSaveWhatsApp = async (e) => {
        if (e) e.preventDefault();
        setSavingWhatsApp(true);
        try {
            await api.put('settings/whatsapp', {
                config: whatsAppConfig,
                rules: whatsAppRules
            });
            enqueueSnackbar(
                isRTL ? 'تم حفظ إعدادات واتساب وشات ووت بنجاح' : 'WhatsApp & Chatwoot settings saved!',
                { variant: 'success' }
            );
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل حفظ إعدادات واتساب' : 'Failed to save WhatsApp settings'),
                { variant: 'error' }
            );
        } finally {
            setSavingWhatsApp(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* Header Bar */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                            {isRTL ? 'إعدادات واتساب وميتا والدعم المباشر (Chatwoot)' : 'WhatsApp Cloud API & Chatwoot Live Support'}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {isRTL
                                ? 'إدارة قوالب Meta Cloud، بيانات Chatwoot، قواعد الإشعارات، وساعات الهدوء.'
                                : 'Manage Meta Cloud templates, Chatwoot credentials, granular event toggles, and Kuwait quiet hours.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={fetchWhatsAppSettings}
                            disabled={loadingWhatsApp || savingWhatsApp}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
                            <span>{isRTL ? 'تحديث' : 'Refresh'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveWhatsApp}
                            disabled={savingWhatsApp || loadingWhatsApp}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">save</span>
                            <span>{savingWhatsApp ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : isRTL ? 'حفظ الإعدادات' : 'Save WhatsApp Config'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {whatsAppError && (
                <ErrorBannerV2 message={whatsAppError} onRetry={fetchWhatsAppSettings} isRetrying={loadingWhatsApp} />
            )}

            {/* Card 1: Provider & Endpoint */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                    {isRTL ? 'مزود الخدمة ونقطة الاتصال' : 'Provider & Endpoint Gateway'}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                            {isRTL ? 'وضع المزود' : 'Provider Mode'}
                        </label>
                        <select
                            value={whatsAppConfig.provider || 'SHIPMENT_WHATSAPP'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, provider: e.target.value })}
                            className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                        >
                            <option value="SHIPMENT_WHATSAPP">SHIPMENT_WHATSAPP (Target Microservice)</option>
                            <option value="CHATWOOT">CHATWOOT (Omnichannel)</option>
                            <option value="META">META (Official Cloud API)</option>
                            <option value="MOCK">MOCK (Local Sandbox)</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                            {isRTL ? 'عنوان الخدمة' : 'Service URL'}
                        </label>
                        <input
                            type="text"
                            dir="ltr"
                            value={whatsAppConfig.serviceUrl || ''}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, serviceUrl: e.target.value })}
                            placeholder="https://msg.target-kw.com"
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                            {isRTL ? 'معرف الهاتف (Phone ID)' : 'Phone ID'}
                        </label>
                        <input
                            type="text"
                            dir="ltr"
                            value={whatsAppConfig.phoneId || ''}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, phoneId: e.target.value })}
                            placeholder="10928348912"
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                            {isRTL ? 'مفتاح API السري' : 'API Key'}
                        </label>
                        <div className="relative">
                            <input
                                type={showApiKey ? 'text' : 'password'}
                                dir="ltr"
                                value={whatsAppConfig.apiKey || ''}
                                onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, apiKey: e.target.value })}
                                placeholder="••••••••"
                                className="w-full h-9 px-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                    {showApiKey ? 'visibility_off' : 'visibility'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        {isRTL ? 'نقطة استقبال ويب هوك ميتا' : 'Incoming Meta Webhook Endpoint'}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <code dir="ltr" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                            {`${window.location.origin}/api/whatsapp/webhook`}
                        </code>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/webhook`);
                                enqueueSnackbar(isRTL ? 'تم نسخ رابط الويب هوك' : 'Meta Webhook URL copied!', { variant: 'info' });
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">content_copy</span>
                            <span>{isRTL ? 'نسخ الرابط' : 'Copy URL'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Card 2: Chatwoot Credentials */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                    {isRTL ? 'بيانات اعتماد Chatwoot للدعم المباشر' : 'Chatwoot Live Support Credentials'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Base URL</label>
                        <input
                            type="text"
                            dir="ltr"
                            value={whatsAppConfig.chatwootBaseUrl || ''}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, chatwootBaseUrl: e.target.value })}
                            placeholder="https://inbox.mawthook.io"
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Account ID</label>
                        <input
                            type="text"
                            dir="ltr"
                            value={whatsAppConfig.chatwootAccountId || ''}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, chatwootAccountId: e.target.value })}
                            placeholder="1"
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Inbox ID</label>
                        <input
                            type="text"
                            dir="ltr"
                            value={whatsAppConfig.chatwootInboxId || ''}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, chatwootInboxId: e.target.value })}
                            placeholder="1"
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">API Token</label>
                        <div className="relative">
                            <input
                                type={showChatwootToken ? 'text' : 'password'}
                                dir="ltr"
                                value={whatsAppConfig.chatwootApiToken || ''}
                                onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, chatwootApiToken: e.target.value })}
                                placeholder="••••••••"
                                className="w-full h-9 px-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={() => setShowChatwootToken(!showChatwootToken)}
                                className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-500 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                    {showChatwootToken ? 'visibility_off' : 'visibility'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Card 3: Granular Milestone Rules */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-slate-800">
                    {isRTL ? 'قواعد إشعارات الأحداث' : 'Granular Milestone Event Toggles'}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                                <th className="py-2.5 px-3 text-start">{isRTL ? 'الحدث' : 'Milestone Event'}</th>
                                <th className="py-2.5 px-3 text-start">{isRTL ? 'المستلم' : 'Role'}</th>
                                <th className="py-2.5 px-3 text-start">{isRTL ? 'القالب' : 'Template'}</th>
                                <th className="py-2.5 px-3 text-center">{isRTL ? 'مفعل' : 'Enabled'}</th>
                                <th className="py-2.5 px-3 text-center">{isRTL ? 'تجاوز الهدوء' : 'Bypass Quiet'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {whatsAppRules.map((rule, idx) => {
                                const meta = EVENT_METRIC_CONFIG[rule.eventType] || {
                                    labelEn: rule.eventType,
                                    labelAr: rule.eventType,
                                    icon: 'notifications'
                                };
                                const isConsignee = ['receiver', 'consignee'].includes(rule.recipientRole);
                                return (
                                    <tr key={`${rule.eventType}-${rule.recipientRole}-${idx}`}>
                                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                            {isRTL ? meta.labelAr : meta.labelEn}
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                                    isConsignee
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                }`}
                                            >
                                                {isConsignee ? (isRTL ? 'المستلم' : 'Consignee') : isRTL ? 'المرسل' : 'Shipper'}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <input
                                                type="text"
                                                dir="ltr"
                                                value={rule.templateName || ''}
                                                onChange={(e) => handleRuleChange(idx, 'templateName', e.target.value)}
                                                className="w-full min-w-[160px] h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-[11px] text-slate-900 dark:text-slate-100"
                                            />
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(rule.enabled)}
                                                onChange={(e) => handleRuleChange(idx, 'enabled', e.target.checked)}
                                                className="toggle toggle-primary toggle-sm"
                                            />
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(rule.allowQuietHoursBypass)}
                                                onChange={(e) => handleRuleChange(idx, 'allowQuietHoursBypass', e.target.checked)}
                                                className="toggle toggle-warning toggle-sm"
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Card 4: Quiet Hours */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                            {isRTL ? 'ساعات الهدوء - الكويت (AST)' : 'Kuwait Quiet-Hours Delivery Suppression'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isRTL
                                ? 'إيقاف الإشعارات غير العاجلة ليلاً بتوقيت الكويت.'
                                : 'Suppresses routine notifications during overnight hours in Asia/Kuwait.'}
                        </p>
                    </div>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {isRTL ? 'تفعيل ساعات الهدوء' : 'Quiet-Hours Active'}
                        </span>
                        <input
                            type="checkbox"
                            checked={Boolean(whatsAppConfig.quietHoursEnabled)}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, quietHoursEnabled: e.target.checked })}
                            className="toggle toggle-primary toggle-sm"
                        />
                    </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Start Time (AST)</label>
                        <input
                            type="time"
                            value={whatsAppConfig.quietHoursStart || '22:00'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, quietHoursStart: e.target.value })}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">End Time (AST)</label>
                        <input
                            type="time"
                            value={whatsAppConfig.quietHoursEnd || '08:00'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, quietHoursEnd: e.target.value })}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Timezone</label>
                        <input
                            type="text"
                            dir="ltr"
                            value={whatsAppConfig.quietHoursTimezone || 'Asia/Kuwait'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, quietHoursTimezone: e.target.value })}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="flex items-end">
                        <label className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-between cursor-pointer">
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                {isRTL ? 'تجاوز للتسليم' : 'Bypass Deliveries'}
                            </span>
                            <input
                                type="checkbox"
                                checked={Boolean(whatsAppConfig.allowDeliveryQuietHours)}
                                onChange={(e) =>
                                    setWhatsAppConfig({ ...whatsAppConfig, allowDeliveryQuietHours: e.target.checked })
                                }
                                className="toggle toggle-warning toggle-sm"
                            />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsWhatsAppTabV2;
