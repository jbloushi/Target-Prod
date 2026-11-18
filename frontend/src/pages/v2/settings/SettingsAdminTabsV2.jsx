import React from 'react';

export const SettingsFleetTabV2 = ({ systemSettings, onUpdateFleet, savingSettings, isRTL }) => {
    const fleet = systemSettings?.fleet || {};
    const modes = [
        {
            mode: 'internal_only',
            title: isRTL ? 'حصري لعمليات تارجت' : 'Target Ops Only',
            desc: isRTL ? 'السائقين والمستودع الخاص بنا فقط' : 'Merchants request pickup only'
        },
        {
            mode: 'saas_monetized',
            title: isRTL ? 'اشتراك تجاري (SaaS)' : 'Monetized B2B SaaS',
            desc: isRTL ? 'يتطلب باقة Fleet Pro للشركات' : 'Requires Fleet Pro subscription'
        },
        {
            mode: 'open_all',
            title: isRTL ? 'متاح للجميع' : 'Open to All Users',
            desc: isRTL ? 'مفتوح لجميع الحسابات بدون قفل' : 'Unrestricted platform access'
        }
    ];

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                        {isRTL ? 'إدارة الأسطول وضوابط الاشتراكات (Paywall)' : 'Fleet Operations & Paywall Controls'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {isRTL
                            ? 'تحكم المشرف العام في موديول الأسطول وبوابة الدفع وإثبات التسليم.'
                            : 'Super Admin switchboard to control fleet dispatch, driver digital POD, and merchant paywall entitlements.'}
                    </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                    Super Admin Access
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                            {isRTL ? 'تفعيل نظام الأسطول كلياً' : 'Enable Fleet Module'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isRTL ? 'تشغيل أو إيقاف ميزات التوزيع' : 'Master toggle for all fleet & run-sheet APIs'}
                        </span>
                    </div>
                    <input
                        type="checkbox"
                        checked={fleet.enabled !== false}
                        onChange={(e) => onUpdateFleet({ enabled: e.target.checked })}
                        className="toggle toggle-primary toggle-sm"
                        disabled={savingSettings}
                    />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                            {isRTL ? 'تفعيل جدار الدفع (Paywall)' : 'Enforce Paywall on Merchants'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isRTL ? 'عرض نافذة الترقية لحسابات التجار' : 'Show Pro upgrade showcase on click'}
                        </span>
                    </div>
                    <input
                        type="checkbox"
                        checked={Boolean(fleet.paywallActive)}
                        onChange={(e) => onUpdateFleet({ paywallActive: e.target.checked })}
                        className="toggle toggle-warning toggle-sm"
                        disabled={savingSettings}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                    {isRTL ? 'نمط الوصول التشغيلي' : 'Operational Access Mode'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {modes.map((m) => {
                        const isSelected = (fleet.mode || 'internal_only') === m.mode;
                        return (
                            <button
                                key={m.mode}
                                type="button"
                                onClick={() => onUpdateFleet({ mode: m.mode })}
                                className={`p-3.5 rounded-xl border-2 text-start transition-colors cursor-pointer ${
                                    isSelected
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                                }`}
                            >
                                <div className="font-bold text-xs">{m.title}</div>
                                <div className="text-[11px] opacity-75 mt-1">{m.desc}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                {[
                    { key: 'autoAssignZone', title: isRTL ? 'تجميع المناطق الذكي (PACI)' : 'Auto Kuwait Zone Clustering', desc: 'Grouping by Governorate & PACI Block' },
                    { key: 'requireSignaturePod', title: isRTL ? 'إلزام توقيع العميل الرقمي' : 'Require Digital Screen Signature', desc: 'Customer signature on driver canvas' },
                    { key: 'requirePhotoPod', title: isRTL ? 'إلزام تصوير الطرد' : 'Require Doorstep Photo POD', desc: 'Camera capture of parcel at delivery' },
                    { key: 'codAutoReconciliation', title: isRTL ? 'الترحيل التلقائي للتحصيل النقدي' : 'Auto COD Vault Ledger Posting', desc: 'Direct journal entry to GL Account 1010' }
                ].map((rule) => (
                    <div
                        key={rule.key}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    >
                        <div>
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">{rule.title}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{rule.desc}</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={fleet[rule.key] !== false}
                            onChange={(e) => onUpdateFleet({ [rule.key]: e.target.checked })}
                            className="toggle toggle-primary toggle-sm"
                            disabled={savingSettings}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export const SettingsPhenixTabV2 = ({
    systemSettings,
    setSystemSettings,
    onUpdatePhenix,
    onSavePhenix,
    savingSettings,
    isRTL
}) => {
    const phenix = systemSettings?.phenixSync || {};
    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                        {isRTL ? 'مزامنة فينيكس ERP التلقائية' : 'Phenix ERP Gateway & Background Auto-Sync'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {isRTL
                            ? 'المزامنة التلقائية في الخلفية وربط حسابات التجار.'
                            : 'Automated background synchronization, merchant organization attribution, and multi-carrier live checkpoints.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onSavePhenix}
                    disabled={savingSettings}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">save</span>
                    <span>{isRTL ? 'حفظ إعدادات فينيكس' : 'Save Phenix Config'}</span>
                </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>Periodic Background Auto-Pull (Cron Worker)</span>
                            <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    phenix.autoSyncEnabled
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                            >
                                {phenix.autoSyncEnabled ? 'ACTIVE' : 'DISABLED'}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Automatically query Phenix API on a recurring schedule to ingest new consignments.
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={Boolean(phenix.autoSyncEnabled)}
                        onChange={(e) => onUpdatePhenix({ autoSyncEnabled: e.target.checked })}
                        disabled={savingSettings}
                        className="toggle toggle-success toggle-md"
                    />
                </div>

                {phenix.lastAutoSyncAt && (
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-slate-600 dark:text-slate-300">
                            Last Sync: {new Date(phenix.lastAutoSyncAt).toLocaleString()}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                            <span>Created: {phenix.lastAutoSyncSummary?.createdCount || 0}</span>
                            <span>Updated: {phenix.lastAutoSyncSummary?.updatedCount || 0}</span>
                            <span>Synced: {phenix.lastAutoSyncSummary?.carrierSyncedCount || 0}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Sync Frequency</label>
                    <select
                        value={phenix.intervalMinutes || 15}
                        onChange={(e) =>
                            setSystemSettings({
                                ...systemSettings,
                                phenixSync: { ...phenix, intervalMinutes: Number(e.target.value) }
                            })
                        }
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                    >
                        <option value={5}>Every 5 Minutes</option>
                        <option value={15}>Every 15 Minutes</option>
                        <option value={30}>Every 30 Minutes</option>
                        <option value={60}>Every 1 Hour</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Carrier Filter</label>
                    <select
                        value={phenix.carrier || 'ALL'}
                        onChange={(e) =>
                            setSystemSettings({
                                ...systemSettings,
                                phenixSync: { ...phenix, carrier: e.target.value }
                            })
                        }
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                    >
                        <option value="ALL">All Carriers</option>
                        <option value="DHL">DHL Express (DGR)</option>
                        <option value="ARAMEX">Aramex</option>
                        <option value="FEDEX">FedEx</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">Lookback Window</label>
                    <select
                        value={phenix.daysBack || 3}
                        onChange={(e) =>
                            setSystemSettings({
                                ...systemSettings,
                                phenixSync: { ...phenix, daysBack: Number(e.target.value) }
                            })
                        }
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                    >
                        <option value={1}>1 Day</option>
                        <option value={3}>3 Days</option>
                        <option value={7}>7 Days</option>
                    </select>
                </div>
                <div className="flex items-end">
                    <label className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Require Full Data</span>
                        <input
                            type="checkbox"
                            checked={phenix.onlyComplete !== false}
                            onChange={(e) =>
                                setSystemSettings({
                                    ...systemSettings,
                                    phenixSync: { ...phenix, onlyComplete: e.target.checked }
                                })
                            }
                            className="toggle toggle-primary toggle-sm"
                        />
                    </label>
                </div>
            </div>
        </div>
    );
};

export const SettingsNotificationsTabV2 = ({ notifs, setNotifs, isRTL }) => {
    const items = [
        { key: 'email_ship', title: 'Manifest Created (Email)', desc: 'Send PDF waybill receipt upon dispatch creation.' },
        { key: 'email_del', title: 'Proof of Delivery Captured (Email)', desc: 'Send delivery timestamp and signature POD receipt to shipper.' },
        { key: 'whatsapp_tracking', title: 'WhatsApp Live Radar Dispatch', desc: 'Send tracking web link to recipient mobile upon driver pickup.' },
        { key: 'sms_exception', title: 'Customs & Border Hold Alerts (SMS)', desc: 'Immediate alert if consignment is held at border checkpoints.' }
    ];

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    {isRTL ? 'قنوات ومحفزات الإشعارات' : 'Automated Event Notification Triggers'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isRTL ? 'تخصيص قواعد التنبيه عبر البريد والواتساب والرسائل.' : 'Configure customer alerting rules across SMS, Email, and WhatsApp channels.'}
                </p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4 py-3.5">
                        <div>
                            <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">{item.title}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(notifs[item.key])}
                            onChange={(e) => setNotifs({ ...notifs, [item.key]: e.target.checked })}
                            className="toggle toggle-primary toggle-sm"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export const SettingsRoutingTabV2 = ({ isRTL }) => {
    const gateways = [
        { name: 'DHL Express Global', badge: 'API Online', desc: 'Worldwide priority airfreight, Dangerous Goods (DGR), and European bonded customs clearance.' },
        { name: 'LogesTechs GCC Corridor', badge: 'Active Linehaul', desc: 'Cross-border overland linehaul between Kuwait, Saudi Arabia, UAE, Bahrain, and Oman.' },
        { name: 'Target Direct Courier Fleet', badge: 'Internal Ops', desc: 'Same-day courier dispatch across all 6 Kuwait Governorates with digital mobile POD.' },
        { name: 'OTE Overland Express', badge: 'Regional Freight', desc: 'Heavy parcel, palletized freight, and scheduled regional cargo trailers.' }
    ];

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    {isRTL ? 'مسارات وبوابات النقل النشطة' : 'Active Multi-Carrier Gateways'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isRTL ? 'شركات النقل المعتمدة ضمن شبكة تارجت.' : 'Authorized transport backbones connected to the Target Logistics Global operating network.'}
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {gateways.map((gw) => (
                    <div
                        key={gw.name}
                        className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-sm text-slate-900 dark:text-slate-100">{gw.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                                {gw.badge}
                            </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{gw.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
