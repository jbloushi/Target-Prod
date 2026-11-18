import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../../services/api';
import EmptyStateV2 from '../components/EmptyStateV2';

const DEFAULT_TEST_PHONE = '+201040957289';

const COUNTRY_OPTIONS = [
    { code: 'KW', en: 'Kuwait', ar: 'الكويت' },
    { code: 'SA', en: 'Saudi Arabia', ar: 'المملكة العربية السعودية' },
    { code: 'AE', en: 'UAE', ar: 'الإمارات العربية المتحدة' },
    { code: 'BH', en: 'Bahrain', ar: 'البحرين' },
    { code: 'QA', en: 'Qatar', ar: 'قطر' },
    { code: 'OM', en: 'Oman', ar: 'عُمان' }
];

const createBlankAddr = () => ({
    label: '',
    contactPerson: '',
    phone: DEFAULT_TEST_PHONE,
    city: 'Kuwait City',
    state: 'Capital',
    streetLines: [''],
    buildingName: '',
    unitNumber: '',
    postalCode: '',
    countryCode: 'KW'
});

export const SettingsAddressesTabV2 = ({ addresses, setAddresses, refreshUser, isRTL }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [showModal, setShowModal] = useState(false);
    const [newAddr, setNewAddr] = useState(createBlankAddr);
    const [saving, setSaving] = useState(false);

    const handleSaveAddress = async (e) => {
        e.preventDefault();
        if (!newAddr.label.trim() || !newAddr.contactPerson.trim()) {
            enqueueSnackbar(
                isRTL ? 'التسمية واسم جهة الاتصال مطلوبان' : 'Label and contact person are required',
                { variant: 'warning' }
            );
            return;
        }
        setSaving(true);
        try {
            const updatedList = [...addresses, { ...newAddr, _id: `addr_${Date.now()}` }];
            await api.patch('/users/profile', { addresses: updatedList });
            setAddresses(updatedList);
            setShowModal(false);
            setNewAddr(createBlankAddr());
            enqueueSnackbar(
                isRTL ? 'تم حفظ العنوان في الإعدادات المسبقة' : 'Address saved to presets',
                { variant: 'success' }
            );
            if (refreshUser) await refreshUser();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل حفظ العنوان' : 'Failed to save address preset'),
                { variant: 'error' }
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAddress = async (indexToDelete) => {
        const confirmed = window.confirm(
            isRTL ? 'هل تريد حذف هذا العنوان المحفوظ؟' : 'Delete this saved address preset?'
        );
        if (!confirmed) return;
        try {
            const updatedList = addresses.filter((_, idx) => idx !== indexToDelete);
            await api.patch('/users/profile', { addresses: updatedList });
            setAddresses(updatedList);
            enqueueSnackbar(isRTL ? 'تم حذف العنوان' : 'Address deleted', { variant: 'info' });
            if (refreshUser) await refreshUser();
        } catch (err) {
            enqueueSnackbar(
                err?.response?.data?.error || (isRTL ? 'فشل حذف العنوان' : 'Failed to delete address'),
                { variant: 'error' }
            );
        }
    };

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                        {isRTL ? 'العناوين والمستودعات المحفوظة' : 'Saved Address & Hub Presets'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {isRTL
                            ? 'إدخال سريع بنقرة واحدة لمواقع الاستلام والتسليم.'
                            : 'Fast 1-click address injection for origin collections and destination deliveries.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                        to="/address-book-v2"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">open_in_new</span>
                        <span>{isRTL ? 'سجل العناوين V2' : 'Full Directory V2'}</span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">add_location_alt</span>
                        <span>{isRTL ? 'إضافة عنوان' : 'Add New Address'}</span>
                    </button>
                </div>
            </div>

            {addresses.length === 0 ? (
                <EmptyStateV2
                    icon="location_off"
                    title={isRTL ? 'لا توجد عناوين محفوظة' : 'No Saved Addresses Found'}
                    description={
                        isRTL
                            ? 'احفظ مستودعات الاستلام المتكررة لتسريع إنشاء الشحنات.'
                            : 'Save frequent collection warehouses or GCC hub locations for quick dispatch.'
                    }
                    actionLabel={isRTL ? 'إضافة عنوان' : 'Add New Address'}
                    onAction={() => setShowModal(true)}
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {addresses.map((addr, idx) => (
                        <div
                            key={addr._id || idx}
                            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
                        >
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex px-2.5 py-0.5 rounded-full bg-primary text-white font-bold text-[11px]">
                                        {addr.label || (isRTL ? 'موقع محفوظ' : 'Saved Location')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteAddress(idx)}
                                        aria-label={isRTL ? 'حذف العنوان' : 'Delete Address'}
                                        className="p-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>
                                    </button>
                                </div>
                                <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                    {addr.contactPerson}
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    {addr.streetLines?.[0] || addr.address || '—'}
                                    {addr.buildingName ? `, ${addr.buildingName}` : ''}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                    {addr.city}{addr.state ? `, ${addr.state}` : ''} • {addr.countryCode || 'KW'}
                                </div>
                            </div>
                            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                <span dir="ltr" className="font-mono">{addr.phone || 'N/A'}</span>
                                <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                                    {addr.countryCode || 'KW'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                                {isRTL ? 'إضافة عنوان محفوظ' : 'Add Address Preset'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSaveAddress} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'التسمية *' : 'Preset Label *'}
                                    </label>
                                    <input
                                        type="text"
                                        value={newAddr.label}
                                        onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })}
                                        placeholder={isRTL ? 'مثال: مستودع الشويخ' : 'e.g. Shuwaikh Warehouse'}
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'جهة الاتصال *' : 'Contact Person *'}
                                    </label>
                                    <input
                                        type="text"
                                        value={newAddr.contactPerson}
                                        onChange={(e) => setNewAddr({ ...newAddr, contactPerson: e.target.value })}
                                        placeholder={isRTL ? 'الاسم الكامل' : 'Full Name'}
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'رقم الهاتف' : 'Phone Number'}
                                    </label>
                                    <input
                                        type="tel"
                                        dir="ltr"
                                        value={newAddr.phone}
                                        onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                                        placeholder={DEFAULT_TEST_PHONE}
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'المحافظة' : 'Governorate'}
                                    </label>
                                    <input
                                        type="text"
                                        value={newAddr.state}
                                        onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                                        placeholder="Capital, Hawalli..."
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                    {isRTL ? 'الشارع / القطعة' : 'Street Address / Block'}
                                </label>
                                <input
                                    type="text"
                                    value={newAddr.streetLines[0]}
                                    onChange={(e) => setNewAddr({ ...newAddr, streetLines: [e.target.value] })}
                                    placeholder="Block, Street, Building"
                                    className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'المدينة / المنطقة' : 'City / Area'}
                                    </label>
                                    <input
                                        type="text"
                                        value={newAddr.city}
                                        onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'الدولة' : 'Country'}
                                    </label>
                                    <select
                                        value={newAddr.countryCode}
                                        onChange={(e) => setNewAddr({ ...newAddr, countryCode: e.target.value })}
                                        className="w-full h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                    >
                                        {COUNTRY_OPTIONS.map((c) => (
                                            <option key={c.code} value={c.code}>
                                                {isRTL ? c.ar : c.en} ({c.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                                >
                                    {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : isRTL ? 'حفظ العنوان' : 'Save Preset'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsAddressesTabV2;
