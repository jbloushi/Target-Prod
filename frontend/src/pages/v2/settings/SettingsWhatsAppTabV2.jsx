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

const PROVIDERS = [
    {
        id: 'EVOLUTION',
        titleEn: 'Evolution API',
        titleAr: 'Evolution API',
        subEn: 'evo.mawthook.io · Baileys',
        subAr: 'evo.mawthook.io · إرسال مباشر',
        icon: 'bolt'
    },
    {
        id: 'META',
        titleEn: 'Meta Cloud API',
        titleAr: 'Meta Cloud API',
        subEn: 'Official Graph v19.0',
        subAr: 'واجهة ميتا الرسمية',
        icon: 'verified'
    },
    {
        id: 'CHATWOOT',
        titleEn: 'Chatwoot',
        titleAr: 'Chatwoot',
        subEn: 'Omnichannel Inbox',
        subAr: 'صندوق الدعم الموحد',
        icon: 'forum'
    },
    {
        id: 'SHIPMENT_WHATSAPP',
        titleEn: 'Target Gateway',
        titleAr: 'بوابة تارجت',
        subEn: 'msg.target-kw.com',
        subAr: 'msg.target-kw.com',
        icon: 'dns'
    },
    {
        id: 'MOCK',
        titleEn: 'Mock Sandbox',
        titleAr: 'وضع التجربة',
        subEn: 'Log only · No sends',
        subAr: 'سجل محلي فقط',
        icon: 'science'
    }
];

export const SettingsWhatsAppTabV2 = ({ isRTL }) => {
    const { enqueueSnackbar } = useSnackbar();

    const [whatsAppConfig, setWhatsAppConfig] = useState({
        provider: 'SHIPMENT_WHATSAPP',
        fallbackProvider: 'SHIPMENT_WHATSAPP',
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
    const [envStatus, setEnvStatus] = useState(null);
    const [whatsAppRules, setWhatsAppRules] = useState(DEFAULT_WHATSAPP_RULES);
    const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);
    const [whatsAppError, setWhatsAppError] = useState(null);
    const [showApiKey, setShowApiKey] = useState(false);
    const [showChatwootToken, setShowChatwootToken] = useState(false);
    const [showChatwootPanel, setShowChatwootPanel] = useState(false);

    const fetchWhatsAppSettings = useCallback(async () => {
        setLoadingWhatsApp(true);
        setWhatsAppError(null);
        try {
            const res = await api.get('settings/whatsapp');
            if (res?.data?.success) {
                if (res.data.config) {
                    const cfg = res.data.config;
                    setEnvStatus(cfg.envStatus || null);
                    setWhatsAppConfig((prev) => ({
                        ...prev,
                        ...cfg,
                        fallbackProvider: cfg.fallbackProvider || 'SHIPMENT_WHATSAPP',
                        apiKey: cfg.apiKey || '',
                        phoneId: cfg.phoneId || '',
                        chatwootBaseUrl: cfg.chatwootBaseUrl || 'https://inbox.mawthook.io',
                        chatwootAccountId: cfg.chatwootAccountId || '1',
                        chatwootInboxId: cfg.chatwootInboxId || '',
                        chatwootApiToken: cfg.chatwootApiToken || '',
                        serviceUrl: cfg.serviceUrl || 'https://msg.target-kw.com',
                        quietHoursStart: cfg.quietHoursStart || '22:00',
                        quietHoursEnd: cfg.quietHoursEnd || '08:00',
                        quietHoursTimezone: cfg.quietHoursTimezone || 'Asia/Kuwait',
                        allowDeliveryQuietHours: Boolean(cfg.allowDeliveryQuietHours),
                        quietHoursEnabled: Boolean(cfg.quietHoursEnabled)
                    }));
                    if (cfg.provider === 'CHATWOOT') {
                        setShowChatwootPanel(true);
                    }
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
                isRTL ? 'تم حفظ إعدادات واتساب وشات ووت بنجاح' : 'WhatsApp & gateway settings saved!',
                { variant: 'success' }
            );
            fetchWhatsAppSettings();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل حفظ إعدادات واتساب' : 'Failed to save WhatsApp settings'),
                { variant: 'error' }
            );
        } finally {
            setSavingWhatsApp(false);
        }
    };

    const activeProvider = whatsAppConfig.provider || 'SHIPMENT_WHATSAPP';

    const getProviderBadge = (id) => {
        if (id === 'META') {
            return envStatus?.metaConfigured
                ? { text: isRTL ? '.env جاهز' : '.env ready', ok: true }
                : { text: isRTL ? 'ينقص .env' : 'Needs .env', ok: false };
        }
        if (id === 'EVOLUTION') {
            return envStatus?.evolutionConfigured
                ? { text: isRTL ? '.env جاهز' : '.env ready', ok: true }
                : { text: isRTL ? 'ينقص .env' : 'Needs .env', ok: false };
        }
        if (id === 'MOCK') {
            return { text: isRTL ? 'محلي' : 'Local', ok: true };
        }
        return null;
    };

    return (
        <div className="space-y-5">
            {/* Top Action Bar */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'إعدادات بوابات واتساب والإشعارات' : 'WhatsApp Gateways & Notification Rules'}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {isRTL
                                ? 'اختر المزود الأساسي والبديل (Evolution API أو Meta Cloud أو Chatwoot) وتحكم في القواعد وساعات الهدوء.'
                                : 'Choose primary and fallback transport (Evolution API, Meta Cloud, Chatwoot, or Target Gateway), milestone templates, and Kuwait quiet hours.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={fetchWhatsAppSettings}
                            disabled={loadingWhatsApp || savingWhatsApp}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
                            <span>{isRTL ? 'تحديث' : 'Refresh'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveWhatsApp}
                            disabled={savingWhatsApp || loadingWhatsApp}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">save</span>
                            <span>{savingWhatsApp ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : isRTL ? 'حفظ الإعدادات' : 'Save Settings'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {whatsAppError && (
                <ErrorBannerV2 message={whatsAppError} onRetry={fetchWhatsAppSettings} isRetrying={loadingWhatsApp} />
            )}

            {/* Primary & Fallback Provider Selection */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'اختيار المزود الأساسي والبديل' : 'Primary Transport & Failover'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {isRTL
                                ? 'يتم قراءة مفاتيح Meta و Evolution تلقائياً من ملف .env على الخادم.'
                                : 'Meta and Evolution credentials are read from server .env first, with optional overrides below.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label htmlFor="wa-fallback-provider" className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {isRTL ? 'المزود البديل:' : 'Fallback:'}
                        </label>
                        <select
                            id="wa-fallback-provider"
                            value={whatsAppConfig.fallbackProvider || 'SHIPMENT_WHATSAPP'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, fallbackProvider: e.target.value })}
                            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100"
                        >
                            <option value="EVOLUTION">EVOLUTION (evo.mawthook.io)</option>
                            <option value="SHIPMENT_WHATSAPP">SHIPMENT_WHATSAPP (msg.target-kw.com)</option>
                            <option value="META">META (Official Cloud API)</option>
                            <option value="CHATWOOT">CHATWOOT</option>
                            <option value="NONE">{isRTL ? 'بدون مزود بديل' : 'None (Disabled)'}</option>
                        </select>
                    </div>
                </div>

                {/* Provider Selector Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {PROVIDERS.map((p) => {
                        const selected = activeProvider === p.id;
                        const badge = getProviderBadge(p.id);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                    const next = { ...whatsAppConfig, provider: p.id };
                                    if (p.id === 'EVOLUTION' && (!whatsAppConfig.serviceUrl || whatsAppConfig.serviceUrl === 'https://msg.target-kw.com')) {
                                        next.serviceUrl = envStatus?.evolutionUrl || 'https://evo.mawthook.io';
                                    }
                                    setWhatsAppConfig(next);
                                    if (p.id === 'CHATWOOT') setShowChatwootPanel(true);
                                }}
                                className={`text-start p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-2.5 ${
                                    selected
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className={`material-symbols-outlined text-lg ${
                                            selected ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
                                        }`}
                                        aria-hidden="true"
                                    >
                                        {p.icon}
                                    </span>
                                    {badge && (
                                        <span
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                                badge.ok
                                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                            }`}
                                        >
                                            {badge.text}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                        {isRTL ? p.titleAr : p.titleEn}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate" dir="ltr">
                                        {isRTL ? p.subAr : p.subEn}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Adaptive Gateway Details */}
                {activeProvider === 'EVOLUTION' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {isRTL ? 'إعدادات Evolution API (.env + تجاوز اختياري)' : 'Evolution API Configuration (.env + optional DB fallback)'}
                            </div>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">
                                WHATSAPP_EVOLUTION_URL · WHATSAPP_EVOLUTION_INSTANCE · WHATSAPP_EVOLUTION_API_KEY
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    {isRTL ? 'عنوان Evolution API' : 'Evolution Base URL'}
                                </label>
                                <input
                                    type="text"
                                    dir="ltr"
                                    value={whatsAppConfig.serviceUrl || ''}
                                    onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, serviceUrl: e.target.value })}
                                    placeholder={envStatus?.evolutionUrl || 'https://evo.mawthook.io'}
                                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    {isRTL ? 'اسم الجلسة (Instance Name)' : 'Instance Name'}
                                </label>
                                <input
                                    type="text"
                                    dir="ltr"
                                    value={whatsAppConfig.phoneId || ''}
                                    onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, phoneId: e.target.value })}
                                    placeholder={envStatus?.evolutionInstance || 'target-logistics'}
                                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    {isRTL ? 'مفتاح Evolution API' : 'Evolution API Key'}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        dir="ltr"
                                        value={whatsAppConfig.apiKey || ''}
                                        onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, apiKey: e.target.value })}
                                        placeholder={envStatus?.evolutionConfigured ? 'Configured in .env' : '••••••••'}
                                        className="w-full h-9 px-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
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
                    </div>
                )}

                {activeProvider === 'META' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {isRTL ? 'بيانات Meta Cloud API من ملف .env' : 'Meta Cloud API (.env Credentials)'}
                            </div>
                            <span
                                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                                    envStatus?.metaConfigured
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                }`}
                            >
                                {envStatus?.metaConfigured
                                    ? isRTL
                                        ? `مفعل (${envStatus.metaPhoneNumberId})`
                                        : `Active (${envStatus.metaPhoneNumberId})`
                                    : isRTL
                                    ? 'أضف WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_ACCESS_TOKEN في .env'
                                    : 'Set WHATSAPP_PHONE_NUMBER_ID & WHATSAPP_ACCESS_TOKEN in .env'}
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
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
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                                >
                                    <span className="material-symbols-outlined text-sm" aria-hidden="true">content_copy</span>
                                    <span>{isRTL ? 'نسخ الرابط' : 'Copy URL'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeProvider === 'SHIPMENT_WHATSAPP' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {isRTL ? 'عنوان الخدمة' : 'Microservice URL'}
                            </label>
                            <input
                                type="text"
                                dir="ltr"
                                value={whatsAppConfig.serviceUrl || ''}
                                onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, serviceUrl: e.target.value })}
                                placeholder="https://msg.target-kw.com"
                                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {isRTL ? 'معرف الهاتف (Phone ID)' : 'Phone ID'}
                            </label>
                            <input
                                type="text"
                                dir="ltr"
                                value={whatsAppConfig.phoneId || ''}
                                onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, phoneId: e.target.value })}
                                placeholder="439032900719328"
                                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {isRTL ? 'مفتاح API السري' : 'Microservice API Key'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    dir="ltr"
                                    value={whatsAppConfig.apiKey || ''}
                                    onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, apiKey: e.target.value })}
                                    placeholder="••••••••"
                                    className="w-full h-9 px-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
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
                )}

                {activeProvider === 'MOCK' && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-base text-slate-500" aria-hidden="true">science</span>
                        <span>
                            {isRTL
                                ? 'وضع التجربة نشط: يتم تسجيل الرسائل محلياً في قاعدة البيانات فقط دون إرسال فعلي.'
                                : 'Mock mode active: notifications are logged locally without calling any external WhatsApp provider.'}
                        </span>
                    </div>
                )}
            </div>

            {/* Chatwoot Credentials (Always accessible, expanded by default when CHATWOOT is active) */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <button
                    type="button"
                    onClick={() => setShowChatwootPanel((prev) => !prev)}
                    className="w-full flex items-center justify-between gap-3 text-start cursor-pointer"
                >
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'بيانات اعتماد Chatwoot للدعم المباشر' : 'Chatwoot Live Support Credentials'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {whatsAppConfig.chatwootBaseUrl || 'https://inbox.mawthook.io'} · Inbox {whatsAppConfig.chatwootInboxId || '1'}
                        </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-500" aria-hidden="true">
                        {showChatwootPanel ? 'expand_less' : 'expand_more'}
                    </span>
                </button>

                {showChatwootPanel && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Base URL</label>
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
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Account ID</label>
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
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Inbox ID</label>
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
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">API Token</label>
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
                )}
            </div>

            {/* Granular Milestone Rules */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {isRTL ? 'قواعد إشعارات الأحداث' : 'Milestone Event Rules'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {isRTL ? 'تفعيل أو إيقاف الإشعارات حسب الحدث والمستلم.' : 'Control which shipment milestones dispatch WhatsApp alerts and their template names.'}
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-start border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                                <th className="py-2.5 px-3 text-start font-semibold">{isRTL ? 'الحدث' : 'Milestone Event'}</th>
                                <th className="py-2.5 px-3 text-start font-semibold">{isRTL ? 'المستلم' : 'Role'}</th>
                                <th className="py-2.5 px-3 text-start font-semibold">{isRTL ? 'القالب' : 'Template'}</th>
                                <th className="py-2.5 px-3 text-center font-semibold">{isRTL ? 'مفعل' : 'Enabled'}</th>
                                <th className="py-2.5 px-3 text-center font-semibold">{isRTL ? 'تجاوز الهدوء' : 'Bypass Quiet'}</th>
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
                                    <tr key={`${rule.eventType}-${rule.recipientRole}-${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                            {isRTL ? meta.labelAr : meta.labelEn}
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
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
                                                className="w-full min-w-[180px] h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-[11px] text-slate-900 dark:text-slate-100"
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

            {/* Quiet Hours */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'ساعات الهدوء - الكويت (AST)' : 'Kuwait Quiet-Hours Delivery Suppression'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {isRTL
                                ? 'إيقاف الإشعارات غير العاجلة ليلاً بتوقيت الكويت.'
                                : 'Suppresses routine notifications during overnight hours in Asia/Kuwait.'}
                        </p>
                    </div>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
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
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Start Time (AST)</label>
                        <input
                            type="time"
                            value={whatsAppConfig.quietHoursStart || '22:00'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, quietHoursStart: e.target.value })}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">End Time (AST)</label>
                        <input
                            type="time"
                            value={whatsAppConfig.quietHoursEnd || '08:00'}
                            onChange={(e) => setWhatsAppConfig({ ...whatsAppConfig, quietHoursEnd: e.target.value })}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Timezone</label>
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
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
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
