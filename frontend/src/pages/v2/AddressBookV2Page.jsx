import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api, { userService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const DEFAULT_TEST_PHONE = '+201040957289';

const COUNTRY_OPTIONS = [
    { code: 'KW', en: 'Kuwait', ar: 'الكويت' },
    { code: 'SA', en: 'Saudi Arabia', ar: 'المملكة العربية السعودية' },
    { code: 'AE', en: 'United Arab Emirates', ar: 'الإمارات العربية المتحدة' },
    { code: 'BH', en: 'Bahrain', ar: 'البحرين' },
    { code: 'QA', en: 'Qatar', ar: 'قطر' },
    { code: 'OM', en: 'Oman', ar: 'عُمان' },
    { code: 'EG', en: 'Egypt', ar: 'مصر' }
];

const createBlankAddress = () => ({
    label: '',
    contactPerson: '',
    company: '',
    phone: DEFAULT_TEST_PHONE,
    email: '',
    city: 'Kuwait City',
    state: 'Capital',
    streetLines: [''],
    buildingName: '',
    unitNumber: '',
    postalCode: '',
    countryCode: 'KW'
});

const stripAddressMeta = ({ _ownerId, _ownerName, _ownerEmail, _orgName, ...rest }) => rest;

export const AddressBookV2Page = () => {
    const { user, refreshUser } = useAuth();
    const { lang, isRTL } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();

    const userId = user?._id || user?.id;
    const userRole = user?.role || 'client';
    const canManageAllUsers = hasCapability(userRole, CAPABILITIES.MANAGE_USERS);

    const [allAddresses, setAllAddresses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [openModal, setOpenModal] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [editingOwnerId, setEditingOwnerId] = useState(null);
    const [saving, setSaving] = useState(false);

    const fetchAddresses = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setFetchError(null);
        try {
            if (canManageAllUsers) {
                const res = await userService.getUsers();
                const users = Array.isArray(res?.data) ? res.data : [];
                const flattened = users.flatMap((u) =>
                    (u.addresses || []).map((addr) => ({
                        ...addr,
                        _ownerId: u._id || u.id,
                        _ownerName: u.name || u.email || 'User',
                        _ownerEmail: u.email || '',
                        _orgName: u.organization?.name || (isRTL ? 'حساب شخصي' : 'Personal')
                    }))
                );
                setAllAddresses(flattened);
            } else {
                const freshUser = await refreshUser?.();
                const sourceAddresses = freshUser?.addresses || user?.addresses || [];
                setAllAddresses(
                    sourceAddresses.map((addr) => ({
                        ...addr,
                        _ownerId: userId,
                        _ownerName: user?.name || (isRTL ? 'حسابي' : 'My Account')
                    }))
                );
            }
        } catch (error) {
            const msg =
                error?.response?.data?.error ||
                error?.message ||
                (isRTL ? 'تعذر تحميل سجل العناوين.' : 'Failed to load address book.');
            setFetchError(msg);
        } finally {
            setLoading(false);
        }
    }, [canManageAllUsers, isRTL, refreshUser, user?.addresses, user?.name, userId]);

    useEffect(() => {
        fetchAddresses();
    }, [fetchAddresses]);

    const filteredAddresses = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return allAddresses;
        return allAddresses.filter((addr) =>
            [addr.label, addr.company, addr.contactPerson, addr.city, addr.phone, addr._ownerName]
                .filter(Boolean)
                .some((val) => String(val).toLowerCase().includes(q))
        );
    }, [allAddresses, searchQuery]);

    const handleOpenModal = (address = null) => {
        if (address) {
            setEditingAddress({
                ...address,
                phone: address.phone || DEFAULT_TEST_PHONE,
                streetLines: address.streetLines?.length ? address.streetLines : [address.address || '']
            });
            setEditingOwnerId(address._ownerId || userId);
        } else {
            setEditingAddress(createBlankAddress());
            setEditingOwnerId(userId);
        }
        setOpenModal(true);
    };

    const persistAddressList = async (ownerId, updatedAddresses) => {
        const cleanList = updatedAddresses.map(stripAddressMeta);
        if (canManageAllUsers && ownerId && ownerId !== userId) {
            await userService.updateUser(ownerId, { addresses: cleanList });
            return;
        }
        await api.patch('/users/profile', { addresses: cleanList });
        if (refreshUser) await refreshUser();
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!editingAddress?.label?.trim() || !editingAddress?.contactPerson?.trim()) {
            enqueueSnackbar(
                isRTL ? 'التسمية واسم جهة الاتصال مطلوبان' : 'Label and contact person are required',
                { variant: 'warning' }
            );
            return;
        }

        setSaving(true);
        try {
            const targetOwnerId = editingOwnerId || userId;
            let baseList = [];

            if (canManageAllUsers && targetOwnerId !== userId) {
                const usersRes = await userService.getUsers();
                const targetUser = (usersRes?.data || []).find((u) => (u._id || u.id) === targetOwnerId);
                if (!targetUser) {
                    enqueueSnackbar(
                        isRTL ? 'تعذر العثور على صاحب الحساب' : 'Target user not found',
                        { variant: 'error' }
                    );
                    return;
                }
                baseList = [...(targetUser.addresses || [])];
            } else {
                baseList = allAddresses
                    .filter((a) => (a._ownerId || userId) === userId)
                    .map(stripAddressMeta);
            }

            const cleanEditing = stripAddressMeta(editingAddress);
            const updatedList = cleanEditing._id
                ? baseList.map((a) => (a._id === cleanEditing._id ? cleanEditing : a))
                : [...baseList, { ...cleanEditing, _id: `addr_${Date.now()}` }];

            await persistAddressList(targetOwnerId, updatedList);
            enqueueSnackbar(
                isRTL ? 'تم حفظ العنوان بنجاح' : 'Address saved successfully',
                { variant: 'success' }
            );
            setOpenModal(false);
            await fetchAddresses();
        } catch (error) {
            enqueueSnackbar(
                error?.response?.data?.error || (isRTL ? 'فشل حفظ العنوان' : 'Failed to save address'),
                { variant: 'error' }
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (address) => {
        const label = address.label || (isRTL ? 'هذا العنوان' : 'this address');
        const confirmed = window.confirm(
            isRTL ? `هل أنت متأكد من حذف "${label}"؟` : `Delete "${label}" from your address book?`
        );
        if (!confirmed) return;

        try {
            const targetOwnerId = address._ownerId || userId;
            let baseList = [];

            if (canManageAllUsers && targetOwnerId !== userId) {
                const usersRes = await userService.getUsers();
                const targetUser = (usersRes?.data || []).find((u) => (u._id || u.id) === targetOwnerId);
                if (!targetUser) {
                    enqueueSnackbar(isRTL ? 'تعذر العثور على المستخدم' : 'User not found', { variant: 'error' });
                    return;
                }
                baseList = [...(targetUser.addresses || [])];
            } else {
                baseList = allAddresses
                    .filter((a) => (a._ownerId || userId) === userId)
                    .map(stripAddressMeta);
            }

            const updatedList = baseList.filter((a) => a._id !== address._id);
            await persistAddressList(targetOwnerId, updatedList);
            enqueueSnackbar(isRTL ? 'تم حذف العنوان' : 'Address deleted', { variant: 'success' });
            await fetchAddresses();
        } catch (error) {
            enqueueSnackbar(
                error?.response?.data?.error || (isRTL ? 'فشل حذف العنوان' : 'Failed to delete address'),
                { variant: 'error' }
            );
        }
    };

    return (
        <div className="w-full min-h-screen pb-14 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'سجل العناوين V2' : 'Address Book V2'}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isRTL
                                ? 'إدارة المستودعات وعناوين الاستلام والتسليم مع عزل الصلاحيات'
                                : 'Isolated address directory with self-service profile persistence'}
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
                            <Link
                                to="/settings-v2"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                            >
                                {isRTL ? 'الإعدادات V2' : 'Settings V2'}
                            </Link>
                        </div>
                        <Link
                            to="/address-book"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{isRTL ? 'العودة إلى V1' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>

                {/* Page Header & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                            {isRTL ? 'سجل العناوين والمستودعات' : 'Address Registry & Hub Directory'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {canManageAllUsers
                                ? isRTL
                                    ? 'إدارة عناوين الشاحنين والمستلمين عبر جميع حسابات الشبكة.'
                                    : 'Manage shipper and consignee locations across platform accounts.'
                                : isRTL
                                    ? 'إدارة مواقع الاستلام والمستودعات المحفوظة لحسابك.'
                                    : 'Manage saved pickup warehouses, offices, and delivery presets.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={fetchAddresses}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
                            <span>{isRTL ? 'تحديث' : 'Refresh'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenModal()}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">add_location_alt</span>
                            <span>{isRTL ? 'إضافة عنوان جديد' : 'Add New Address'}</span>
                        </button>
                    </div>
                </div>

                {fetchError && (
                    <ErrorBannerV2
                        message={fetchError}
                        onRetry={fetchAddresses}
                        isRetrying={loading}
                    />
                )}

                {/* Search Bar */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1 min-w-0">
                            <span
                                className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none"
                                aria-hidden="true"
                            >
                                search
                            </span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={
                                    isRTL
                                        ? 'ابحث بالتسمية، الشركة، جهة الاتصال، المدينة أو الهاتف...'
                                        : 'Search by label, company, contact, city, phone, or owner...'
                                }
                                className="w-full h-9 ps-9 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    aria-label={isRTL ? 'مسح البحث' : 'Clear search'}
                                    className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-sm" aria-hidden="true">close</span>
                                </button>
                            )}
                        </div>
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-400 shrink-0 tabular-nums">
                            {isRTL ? 'إجمالي المواقع:' : 'Total Locations:'}{' '}
                            <span className="font-mono text-primary font-black">{filteredAddresses.length}</span>
                        </div>
                    </div>
                </div>

                {/* Address List: Loading / Empty / Responsive Cards (Mobile) + Table (Desktop) */}
                {loading ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 flex flex-col items-center justify-center gap-3">
                        <span className="loading loading-spinner loading-md text-primary" aria-hidden="true" />
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {isRTL ? 'جاري تحميل العناوين...' : 'Loading saved addresses...'}
                        </p>
                    </div>
                ) : filteredAddresses.length === 0 ? (
                    <EmptyStateV2
                        icon="location_off"
                        title={isRTL ? 'لا توجد عناوين مطابقة' : 'No Addresses Found'}
                        description={
                            searchQuery
                                ? isRTL
                                    ? 'جرّب تعديل كلمات البحث أو مسح الفلتر.'
                                    : 'Try clearing or adjusting your search query.'
                                : isRTL
                                    ? 'أضف أول مستودع أو عنوان مستلم لاستخدامه في الشحنات.'
                                    : 'Add your first warehouse or recipient preset for faster booking.'
                        }
                        actionLabel={searchQuery ? undefined : isRTL ? 'إضافة عنوان' : 'Add New Address'}
                        onAction={searchQuery ? undefined : () => handleOpenModal()}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (< md) - Zero Horizontal Overflow */}
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {filteredAddresses.map((addr, index) => (
                                <div
                                    key={addr._id || index}
                                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                                                {addr.label || (isRTL ? 'موقع محفوظ' : 'Saved Location')}
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {addr.company || '—'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenModal(addr)}
                                                aria-label={isRTL ? 'تعديل العنوان' : 'Edit address'}
                                                className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-base" aria-hidden="true">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(addr)}
                                                aria-label={isRTL ? 'حذف العنوان' : 'Delete address'}
                                                className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                                        <div className="font-semibold">
                                            {addr.city}{addr.state ? `, ${addr.state}` : ''} ({addr.countryCode || 'KW'})
                                        </div>
                                        {(addr.streetLines?.[0] || addr.address || addr.buildingName) && (
                                            <div className="text-slate-500 dark:text-slate-400 break-words">
                                                {addr.streetLines?.[0] || addr.address || ''}
                                                {addr.buildingName ? ` (${addr.buildingName})` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <span className="font-medium text-slate-800 dark:text-slate-200">
                                            {addr.contactPerson}
                                        </span>
                                        <span dir="ltr" className="font-mono text-slate-600 dark:text-slate-400">
                                            {addr.phone || addr.email || '—'}
                                        </span>
                                    </div>
                                    {canManageAllUsers && (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                            <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                                                {addr._ownerName}
                                            </span>
                                            {addr._orgName && <span>• {addr._orgName}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table (md+) */}
                        <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-start border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                            <th className="py-3 px-4 text-start">{isRTL ? 'التسمية / الشركة' : 'Label / Company'}</th>
                                            <th className="py-3 px-4 text-start">{isRTL ? 'الموقع والمنطقة' : 'Location & Area'}</th>
                                            <th className="py-3 px-4 text-start">{isRTL ? 'جهة الاتصال' : 'Contact Details'}</th>
                                            {canManageAllUsers && (
                                                <th className="py-3 px-4 text-start">{isRTL ? 'صاحب الحساب' : 'Account Owner'}</th>
                                            )}
                                            <th className="py-3 px-4 text-center">{isRTL ? 'إجراءات' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                        {filteredAddresses.map((addr, index) => (
                                            <tr
                                                key={addr._id || index}
                                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                                            >
                                                <td className="py-3 px-4">
                                                    <div className="font-bold text-slate-900 dark:text-slate-100">
                                                        {addr.label || (isRTL ? 'موقع محفوظ' : 'Saved Location')}
                                                    </div>
                                                    <div className="text-slate-500 dark:text-slate-400">
                                                        {addr.company || '—'}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                                                        {addr.city}{addr.state ? `, ${addr.state}` : ''} ({addr.countryCode || 'KW'})
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                        {addr.streetLines?.[0] || addr.address || ''}{' '}
                                                        {addr.buildingName ? `(${addr.buildingName})` : ''}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="font-medium text-slate-900 dark:text-slate-100">
                                                        {addr.contactPerson}
                                                    </div>
                                                    <div dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 inline-block">
                                                        {addr.phone || addr.email || '—'}
                                                    </div>
                                                </td>
                                                {canManageAllUsers && (
                                                    <td className="py-3 px-4">
                                                        <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-[11px]">
                                                            {addr._ownerName}
                                                        </span>
                                                        {addr._orgName && (
                                                            <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                                {addr._orgName}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="py-3 px-4 text-center">
                                                    <div className="inline-flex items-center justify-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenModal(addr)}
                                                            title={isRTL ? 'تعديل العنوان' : 'Edit Address'}
                                                            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-base" aria-hidden="true">edit</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(addr)}
                                                            title={isRTL ? 'حذف العنوان' : 'Delete Address'}
                                                            className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {/* Add / Edit Modal */}
                {openModal && editingAddress && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="address-modal-title"
                    >
                        <div className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 sm:p-6 space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                                <h2 id="address-modal-title" className="font-black text-base text-slate-900 dark:text-slate-100">
                                    {editingAddress._id
                                        ? isRTL ? 'تعديل العنوان المحفوظ' : 'Edit Address Preset'
                                        : isRTL ? 'إضافة عنوان جديد' : 'Add New Address Preset'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setOpenModal(false)}
                                    aria-label={isRTL ? 'إغلاق' : 'Close'}
                                    className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                                </button>
                            </div>

                            <form onSubmit={handleSave} className="space-y-3.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'تسمية العنوان *' : 'Preset Label *'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.label || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, label: e.target.value })}
                                            placeholder={isRTL ? 'مثال: مستودع الشويخ الرئيسي' : 'e.g. Shuwaikh Central Warehouse'}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'اسم الشركة' : 'Company Name'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.company || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, company: e.target.value })}
                                            placeholder={isRTL ? 'الاسم التجاري' : 'Company or Trading Name'}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'جهة الاتصال *' : 'Contact Person *'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.contactPerson || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, contactPerson: e.target.value })}
                                            placeholder={isRTL ? 'الاسم الكامل' : 'Full Contact Name'}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'رقم الهاتف' : 'Phone Number'}
                                        </label>
                                        <input
                                            type="tel"
                                            dir="ltr"
                                            value={editingAddress.phone || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, phone: e.target.value })}
                                            placeholder={DEFAULT_TEST_PHONE}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                        {isRTL ? 'عنوان الشارع / القطعة' : 'Street Address / Block'}
                                    </label>
                                    <input
                                        type="text"
                                        value={editingAddress.streetLines?.[0] || ''}
                                        onChange={(e) => setEditingAddress({ ...editingAddress, streetLines: [e.target.value] })}
                                        placeholder={isRTL ? 'قطعة 4، شارع 12، قسيمة 89' : 'Block 4, Street 12, Plot 89'}
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'المبنى / الرقم الآلي' : 'Building / PACI No'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.buildingName || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, buildingName: e.target.value })}
                                            placeholder={isRTL ? 'اسم البرج أو الرقم الآلي' : 'Tower name or PACI'}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'الدور / الوحدة' : 'Unit / Floor'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.unitNumber || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, unitNumber: e.target.value })}
                                            placeholder={isRTL ? 'الدور 2، شقة 4' : 'Floor 2, Apt 4'}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'المدينة / المنطقة' : 'City / Area'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.city || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, city: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'المحافظة' : 'Governorate'}
                                        </label>
                                        <input
                                            type="text"
                                            value={editingAddress.state || ''}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, state: e.target.value })}
                                            className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                            {isRTL ? 'الدولة' : 'Country'}
                                        </label>
                                        <select
                                            value={editingAddress.countryCode || 'KW'}
                                            onChange={(e) => setEditingAddress({ ...editingAddress, countryCode: e.target.value })}
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

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setOpenModal(false)}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                        {isRTL ? 'إلغاء' : 'Cancel'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                                    >
                                        {saving
                                            ? isRTL ? 'جاري الحفظ...' : 'Saving...'
                                            : isRTL ? 'حفظ العنوان' : 'Save Address'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddressBookV2Page;
