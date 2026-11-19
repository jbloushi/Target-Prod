import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api, { settingsService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import RateCardsManager from '../../components/admin/RateCardsManager';
import FallbackPricingManager from '../../components/admin/FallbackPricingManager';
import ErrorBannerV2 from './components/ErrorBannerV2';
import SettingsAddressesTabV2 from './settings/SettingsAddressesTabV2';
import SettingsApiTabV2 from './settings/SettingsApiTabV2';
import SettingsWhatsAppTabV2 from './settings/SettingsWhatsAppTabV2';
import {
    SettingsFleetTabV2,
    SettingsPhenixTabV2,
    SettingsNotificationsTabV2,
    SettingsRoutingTabV2
} from './settings/SettingsAdminTabsV2';

const ROLE_LABELS = {
    admin: { en: 'Superadmin (Full Control)', ar: 'مدير النظام العام' },
    manager: { en: 'Target Owner (Executive)', ar: 'الإدارة التنفيذية' },
    accounting: { en: 'Target Accounting (Ledgers)', ar: 'المحاسبة والفوترة' },
    staff: { en: 'Target Ops Staff', ar: 'فريق العمليات' },
    driver: { en: 'Courier Driver', ar: 'سائق التوصيل' },
    org_manager: { en: 'Company Manager (B2B)', ar: 'مدير شركة' },
    org_agent: { en: 'Company Consignor', ar: 'مندوب شركة' },
    client: { en: 'Direct Shipper', ar: 'شاحن مباشر' }
};

export const SettingsV2Page = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, refreshUser } = useAuth();
    const { isRTL } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();

    const userRole = user?.role || 'client';
    const canGenerateApiKey = hasCapability(userRole, CAPABILITIES.GENERATE_API_KEY);
    const canManageSystem = hasCapability(userRole, CAPABILITIES.MANAGE_SYSTEM_SETTINGS);
    const canManageAddresses =
        hasCapability(userRole, CAPABILITIES.CREATE_SHIPMENTS) ||
        hasCapability(userRole, CAPABILITIES.MANAGE_USERS);

    const tabs = useMemo(() => {
        return [
            { id: 'profile', labelEn: 'Shipper Profile', labelAr: 'ملف الشاحن', icon: 'person' },
            ...(canManageAddresses
                ? [{ id: 'addresses', labelEn: 'Address Presets', labelAr: 'سجل العناوين', icon: 'location_on' }]
                : []),
            ...(canGenerateApiKey
                ? [{ id: 'api', labelEn: 'API & Webhooks', labelAr: 'واجهة API والويب هوك', icon: 'key' }]
                : []),
            ...(canManageSystem
                ? [
                      { id: 'fleet', labelEn: 'Fleet & Paywall Controls', labelAr: 'الأسطول والاشتراكات', icon: 'local_shipping' },
                      { id: 'ratecards', labelEn: 'Rate Cards & Tariffs', labelAr: 'بطاقات الأسعار', icon: 'table_chart' },
                      { id: 'fallback', labelEn: 'Fallback Pricing', labelAr: 'تسعير الطوارئ', icon: 'shield' },
                      { id: 'phenix', labelEn: 'Phenix ERP Sync', labelAr: 'مزامنة فينيكس ERP', icon: 'sync_alt' },
                      { id: 'whatsapp', labelEn: 'Meta WhatsApp Alerts', labelAr: 'إشعارات واتساب وميتا', icon: 'chat' },
                      { id: 'notifications', labelEn: 'Event Triggers', labelAr: 'قنوات الإشعار', icon: 'notifications' },
                      { id: 'routing', labelEn: 'Carrier Gateways', labelAr: 'مسارات وبوابات النقل', icon: 'hub' }
                  ]
                : []),
            { id: 'security', labelEn: 'Security & Password', labelAr: 'الأمان وكلمة المرور', icon: 'lock' }
        ];
    }, [canGenerateApiKey, canManageAddresses, canManageSystem]);

    const allowedTabIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
    const requestedTab = searchParams.get('tab') || 'profile';
    const activeTab = allowedTabIds.has(requestedTab) ? requestedTab : 'profile';

    useEffect(() => {
        if (requestedTab && !allowedTabIds.has(requestedTab)) {
            setSearchParams({ tab: 'profile' }, { replace: true });
        }
    }, [allowedTabIds, requestedTab, setSearchParams]);

    const handleTabChange = (tabId) => {
        setSearchParams({ tab: tabId }, { replace: true });
    };

    // Profile state
    const [profileForm, setProfileForm] = useState({
        name: user?.name || '',
        company: user?.company || user?.carrierConfig?.company || '',
        phone: user?.phone || '',
        vatNo: user?.carrierConfig?.vatNo || '',
        eori: user?.carrierConfig?.eori || '',
        defaultReference: user?.carrierConfig?.defaultReference || ''
    });
    const [addresses, setAddresses] = useState(user?.addresses || []);
    const [savingProfile, setSavingProfile] = useState(false);

    useEffect(() => {
        if (user) {
            setProfileForm({
                name: user.name || '',
                company: user.company || user.carrierConfig?.company || '',
                phone: user.phone || '',
                vatNo: user.carrierConfig?.vatNo || '',
                eori: user.carrierConfig?.eori || '',
                defaultReference: user.carrierConfig?.defaultReference || ''
            });
            setAddresses(user.addresses || []);
        }
    }, [user]);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            const payload = {
                name: profileForm.name,
                company: profileForm.company,
                phone: profileForm.phone,
                ...(canManageSystem
                    ? {
                          carrierConfig: {
                              vatNo: profileForm.vatNo,
                              eori: profileForm.eori,
                              defaultReference: profileForm.defaultReference
                          }
                      }
                    : {})
            };
            await api.patch('/users/profile', payload);
            enqueueSnackbar(
                isRTL ? 'تم تحديث ملف الشاحن بنجاح!' : 'Shipper profile updated successfully!',
                { variant: 'success' }
            );
            if (refreshUser) await refreshUser();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل تحديث الملف الشخصي' : 'Failed to update profile'),
                { variant: 'error' }
            );
        } finally {
            setSavingProfile(false);
        }
    };

    // System Settings state (Superadmin only)
    const [systemSettings, setSystemSettings] = useState(null);
    const [systemError, setSystemError] = useState(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [notifs, setNotifs] = useState({
        email_ship: true,
        email_del: true,
        sms_pickup: false,
        sms_exception: true,
        whatsapp_tracking: true
    });

    const loadSystemSettings = useCallback(async () => {
        if (!canManageSystem) return;
        setSystemError(null);
        try {
            const res = await settingsService.getSystemSettings();
            setSystemSettings(res?.data || res);
        } catch (err) {
            setSystemError(
                err?.response?.data?.error ||
                    err?.message ||
                    (isRTL ? 'تعذر تحميل إعدادات النظام' : 'Failed to load system settings')
            );
        }
    }, [canManageSystem, isRTL]);

    useEffect(() => {
        loadSystemSettings();
    }, [loadSystemSettings]);

    const handleUpdateFleetSettings = async (updates) => {
        setSavingSettings(true);
        try {
            const nextFleet = { ...(systemSettings?.fleet || {}), ...updates };
            const res = await settingsService.updateSystemSettings({ fleet: nextFleet });
            setSystemSettings(res?.data || res);
            enqueueSnackbar(
                isRTL ? 'تم تحديث إعدادات الأسطول والاشتراكات بنجاح!' : 'Fleet & Paywall settings updated!',
                { variant: 'success' }
            );
        } catch (err) {
            enqueueSnackbar(err?.message || 'Failed updating fleet settings', { variant: 'error' });
        } finally {
            setSavingSettings(false);
        }
    };

    const handleUpdatePhenixSettings = async (updates) => {
        setSavingSettings(true);
        try {
            const nextPhenix = { ...(systemSettings?.phenixSync || {}), ...updates };
            const res = await settingsService.updateSystemSettings({ phenixSync: nextPhenix });
            setSystemSettings(res?.data || res);
            enqueueSnackbar('Phenix ERP settings updated successfully', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to update Phenix ERP settings: ' + (err?.message || 'Unknown error'), { variant: 'error' });
        } finally {
            setSavingSettings(false);
        }
    };

    const handleSavePhenixConfig = async () => {
        setSavingSettings(true);
        try {
            const res = await settingsService.updateSystemSettings({ phenixSync: systemSettings?.phenixSync });
            setSystemSettings(res?.data || res);
            enqueueSnackbar('Phenix ERP settings saved successfully', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to save Phenix ERP settings: ' + (err?.message || 'Unknown error'), { variant: 'error' });
        } finally {
            setSavingSettings(false);
        }
    };

    // Password state
    const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
    const [savingPassword, setSavingPassword] = useState(false);

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (!passwords.next || passwords.next.length < 8) {
            enqueueSnackbar(
                isRTL ? 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' : 'New password must be at least 8 characters',
                { variant: 'warning' }
            );
            return;
        }
        if (passwords.next !== passwords.confirm) {
            enqueueSnackbar(
                isRTL ? 'كلمتا المرور غير متطابقتين' : 'New passwords do not match',
                { variant: 'warning' }
            );
            return;
        }
        setSavingPassword(true);
        try {
            await api.patch('/users/password', {
                currentPassword: passwords.current,
                newPassword: passwords.next
            });
            enqueueSnackbar(
                isRTL ? 'تم تحديث كلمة المرور بنجاح' : 'Password updated successfully',
                { variant: 'success' }
            );
            setPasswords({ current: '', next: '', confirm: '' });
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل تحديث كلمة المرور' : 'Failed to update password'),
                { variant: 'error' }
            );
        } finally {
            setSavingPassword(false);
        }
    };

    const roleMeta = ROLE_LABELS[userRole] || { en: userRole, ar: userRole };

    return (
        <div className="w-full min-h-screen pb-14 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto pt-5 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'الإعدادات V2' : 'Settings V2'}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isRTL
                                ? 'إعدادات الحساب والتكامل والنظام مع عزل الصلاحيات'
                                : 'Account, API, webhooks, and system controls with capability-gated tabs'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
                        <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            <Link
                                to="/dashboard-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'لوحة القيادة V2' : 'Dashboard V2'}
                            </Link>
                            {canManageAddresses && (
                                <Link
                                    to="/address-book-v2"
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                                >
                                    {isRTL ? 'سجل العناوين V2' : 'Address Book V2'}
                                </Link>
                            )}
                        </div>
                        <Link
                            to={`/settings${activeTab ? `?tab=${activeTab}` : ''}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{isRTL ? 'العودة إلى V1' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>

                {/* Page Heading */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                            {isRTL ? 'الإعدادات والتهيئة التشغيلية' : 'Settings & Operational Hub'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {isRTL
                                ? 'إدارة ملف الشاحن، مفاتيح REST API، إشعارات واتساب، وبوابات النقل.'
                                : 'Manage shipper identity, REST API credentials, Meta WhatsApp dispatch, and routing gateways.'}
                        </p>
                    </div>
                    <span className="inline-flex items-center self-start sm:self-auto px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-xs font-bold whitespace-nowrap">
                        {isRTL ? roleMeta.ar : roleMeta.en}
                    </span>
                </div>

                {systemError && canManageSystem && (
                    <ErrorBannerV2 message={systemError} onRetry={loadSystemSettings} />
                )}

                {/* Mobile Horizontal Tab Strip (< lg) */}
                <div className="lg:hidden overflow-x-auto pb-1">
                    <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 min-w-max">
                        {tabs.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleTabChange(tab.id)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                                        active
                                            ? 'bg-primary text-white shadow-xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                                        {tab.icon}
                                    </span>
                                    <span>{isRTL ? tab.labelAr : tab.labelEn}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    {/* Desktop Sidebar (lg+) */}
                    <aside className="hidden lg:block lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 space-y-1">
                        {tabs.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleTabChange(tab.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-start transition-colors cursor-pointer ${
                                        active
                                            ? 'bg-primary text-white shadow-xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
                                        {tab.icon}
                                    </span>
                                    <span className="truncate">{isRTL ? tab.labelAr : tab.labelEn}</span>
                                </button>
                            );
                        })}
                    </aside>

                    {/* Content Panel */}
                    <div className="lg:col-span-9 min-w-0 space-y-5">
                        {activeTab === 'profile' && (
                            <form
                                onSubmit={handleSaveProfile}
                                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
                            >
                                <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                                        {isRTL ? 'البيانات الجمركية وهوية الشاحن' : 'Shipper Customs & Contact Identity'}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {isRTL
                                            ? 'جهة الاتصال الافتراضية، الرقم الضريبي، وبيانات البوليصة.'
                                            : 'Default commercial manifest contact, VAT tax identifier, and trade credentials.'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'الاسم الكامل' : 'Contact Person'}
                                        </label>
                                        <input
                                            type="text"
                                            value={profileForm.name}
                                            onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'رقم الهاتف' : 'Phone Number'}
                                        </label>
                                        <input
                                            type="tel"
                                            dir="ltr"
                                            value={profileForm.phone}
                                            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                            placeholder="+201040957289"
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'اسم الشركة' : 'Company Name'}
                                        </label>
                                        <input
                                            type="text"
                                            value={profileForm.company}
                                            onChange={(e) => setProfileForm({ ...profileForm, company: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'البريد الإلكتروني' : 'Email Address'}
                                        </label>
                                        <input
                                            type="email"
                                            dir="ltr"
                                            value={user?.email || ''}
                                            disabled
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-xs font-mono text-slate-500 dark:text-slate-400"
                                        />
                                    </div>
                                </div>

                                {canManageSystem && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                                {isRTL ? 'الرقم الضريبي VAT' : 'VAT Number'}
                                            </label>
                                            <input
                                                type="text"
                                                dir="ltr"
                                                value={profileForm.vatNo}
                                                onChange={(e) => setProfileForm({ ...profileForm, vatNo: e.target.value })}
                                                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">EORI</label>
                                            <input
                                                type="text"
                                                dir="ltr"
                                                value={profileForm.eori}
                                                onChange={(e) => setProfileForm({ ...profileForm, eori: e.target.value })}
                                                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                                {isRTL ? 'المرجع الافتراضي' : 'Default Reference'}
                                            </label>
                                            <input
                                                type="text"
                                                value={profileForm.defaultReference}
                                                onChange={(e) =>
                                                    setProfileForm({ ...profileForm, defaultReference: e.target.value })
                                                }
                                                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        disabled={savingProfile}
                                        className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                                    >
                                        {savingProfile
                                            ? isRTL ? 'جاري الحفظ...' : 'Saving...'
                                            : isRTL ? 'حفظ التغييرات' : 'Save Profile'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === 'addresses' && canManageAddresses && (
                            <SettingsAddressesTabV2
                                addresses={addresses}
                                setAddresses={setAddresses}
                                refreshUser={refreshUser}
                                isRTL={isRTL}
                            />
                        )}

                        {activeTab === 'api' && canGenerateApiKey && (
                            <SettingsApiTabV2 user={user} refreshUser={refreshUser} isRTL={isRTL} />
                        )}

                        {activeTab === 'fleet' && canManageSystem && (
                            <SettingsFleetTabV2
                                systemSettings={systemSettings}
                                onUpdateFleet={handleUpdateFleetSettings}
                                savingSettings={savingSettings}
                                isRTL={isRTL}
                            />
                        )}

                        {activeTab === 'ratecards' && canManageSystem && (
                            <RateCardsManager />
                        )}

                        {activeTab === 'fallback' && canManageSystem && (
                            <FallbackPricingManager />
                        )}

                        {activeTab === 'phenix' && canManageSystem && (
                            <SettingsPhenixTabV2
                                systemSettings={systemSettings}
                                setSystemSettings={setSystemSettings}
                                onUpdatePhenix={handleUpdatePhenixSettings}
                                onSavePhenix={handleSavePhenixConfig}
                                savingSettings={savingSettings}
                                isRTL={isRTL}
                            />
                        )}

                        {activeTab === 'whatsapp' && canManageSystem && (
                            <SettingsWhatsAppTabV2 isRTL={isRTL} />
                        )}

                        {activeTab === 'notifications' && canManageSystem && (
                            <SettingsNotificationsTabV2 notifs={notifs} setNotifs={setNotifs} isRTL={isRTL} />
                        )}

                        {activeTab === 'routing' && canManageSystem && (
                            <SettingsRoutingTabV2 isRTL={isRTL} />
                        )}

                        {activeTab === 'security' && (
                            <form
                                onSubmit={handlePasswordChange}
                                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
                            >
                                <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                                        {isRTL ? 'أمان الحساب وكلمة المرور' : 'Security Credentials & Password'}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {isRTL
                                            ? 'تحديث بيانات تسجيل الدخول (8 أحرف على الأقل).'
                                            : 'Update your account credentials (minimum 8 characters).'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'كلمة المرور الحالية' : 'Current Password'}
                                        </label>
                                        <input
                                            type="password"
                                            value={passwords.current}
                                            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'كلمة المرور الجديدة' : 'New Password'}
                                        </label>
                                        <input
                                            type="password"
                                            value={passwords.next}
                                            onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            minLength={8}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                            {isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                                        </label>
                                        <input
                                            type="password"
                                            value={passwords.confirm}
                                            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            minLength={8}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={savingPassword}
                                        className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                                    >
                                        {savingPassword
                                            ? isRTL ? 'جاري التحديث...' : 'Updating...'
                                            : isRTL ? 'تحديث كلمة المرور' : 'Update Password'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsV2Page;
