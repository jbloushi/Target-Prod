import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { settingsService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

export const AdminRateCardsV2Page = () => {
    const { lang, isRTL } = useLanguage();
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const fileInputRef = useRef(null);

    const role = user?.role;
    const hasPageAccess = ['admin', 'manager', 'accounting'].includes(role) && hasCapability(role, CAPABILITIES.MANAGE_PRICING);
    const canViewCostData = hasCapability(role, CAPABILITIES.VIEW_COST_DATA);

    const [rateCards, setRateCards] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Upload Modal
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadForm, setUploadForm] = useState({
        id: '',
        name: '',
        carrierCode: 'DGR',
        currency: 'KWD',
        pricingMode: 'SELLING_PRICE',
        fileBase64: '',
        fileName: '',
        fileSize: 0
    });

    // Matrix View Modal
    const [viewCard, setViewCard] = useState(null);
    const [matrixLoading, setMatrixLoading] = useState(false);
    const [matrixSearch, setMatrixSearch] = useState('');

    // Delete Modal
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const fetchRateCards = useCallback(async () => {
        if (!hasPageAccess) return;
        setLoading(true);
        setFetchError(null);
        try {
            const res = await settingsService.getRateCards();
            if (res?.success === false) {
                throw new Error(res?.error || (lang === 'ar' ? 'فشل تحميل بطاقات الأسعار' : 'Failed to load rate cards'));
            }
            setRateCards(res?.data || []);
        } catch (err) {
            setFetchError(err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل تحميل بطاقات الأسعار' : 'Failed to load rate cards'));
        } finally {
            setLoading(false);
        }
    }, [hasPageAccess, lang]);

    useEffect(() => {
        fetchRateCards();
    }, [fetchRateCards]);

    // Strictly hide wholesale BASE_COST cards unless user has VIEW_COST_DATA (admin / accounting)
    const visibleCards = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return rateCards.filter((card) => {
            const isWholesaleCost = card.pricingMode !== 'SELLING_PRICE';
            if (isWholesaleCost && !canViewCostData) return false;
            if (!q) return true;
            return (
                card.id?.toLowerCase().includes(q) ||
                card.name?.toLowerCase().includes(q) ||
                card.carrierCode?.toLowerCase().includes(q)
            );
        });
    }, [rateCards, canViewCostData, searchQuery]);

    const hiddenWholesaleCount = useMemo(() => {
        if (canViewCostData) return 0;
        return rateCards.filter((c) => c.pricingMode !== 'SELLING_PRICE').length;
    }, [rateCards, canViewCostData]);

    const handleDownloadSample = async () => {
        try {
            await settingsService.downloadRateCardSample();
            enqueueSnackbar(lang === 'ar' ? 'تم تحميل نموذج بطاقة الأسعار' : 'Sample rate card template downloaded', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err?.message || (lang === 'ar' ? 'فشل تحميل النموذج' : 'Failed to download sample template'), { variant: 'error' });
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            enqueueSnackbar(lang === 'ar' ? 'يرجى رفع ملف Excel (.xlsx)' : 'Please upload an Excel file (.xlsx)', { variant: 'warning' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            enqueueSnackbar(lang === 'ar' ? 'الحد الأقصى لحجم الملف 5 ميجابايت' : 'File size exceeds 5MB limit', { variant: 'error' });
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const cleanName = file.name.replace(/\.[^/.]+$/, '');
            const guessedId = cleanName.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
            setUploadForm((prev) => ({
                ...prev,
                fileBase64: ev.target.result,
                fileName: file.name,
                fileSize: file.size,
                id: prev.id || guessedId,
                name: prev.name || cleanName
            }));
        };
        reader.readAsDataURL(file);
    };

    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!uploadForm.id.trim() || !uploadForm.name.trim() || !uploadForm.fileBase64) {
            enqueueSnackbar(lang === 'ar' ? 'يرجى إكمال الحقول واختيار ملف Excel' : 'Card ID, name, and Excel file are required', { variant: 'warning' });
            return;
        }
        const safePricingMode = canViewCostData ? uploadForm.pricingMode : 'SELLING_PRICE';
        setUploading(true);
        try {
            await settingsService.uploadRateCard({
                id: uploadForm.id.trim().toUpperCase(),
                name: uploadForm.name.trim(),
                carrierCode: uploadForm.carrierCode,
                currency: uploadForm.currency,
                pricingMode: safePricingMode,
                fileBase64: uploadForm.fileBase64,
                filename: uploadForm.fileName
            });
            enqueueSnackbar(lang === 'ar' ? `تم استيراد ${uploadForm.id} بنجاح` : `Rate card ${uploadForm.id} imported successfully`, { variant: 'success' });
            setUploadModalOpen(false);
            setUploadForm({
                id: '',
                name: '',
                carrierCode: 'DGR',
                currency: 'KWD',
                pricingMode: 'SELLING_PRICE',
                fileBase64: '',
                fileName: '',
                fileSize: 0
            });
            fetchRateCards();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل استيراد الملف' : 'Upload failed'), { variant: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleOpenMatrix = async (card) => {
        if (card.pricingMode !== 'SELLING_PRICE' && !canViewCostData) {
            enqueueSnackbar(lang === 'ar' ? 'بيانات التكلفة مقيدة لصلاحية الإدارة والمحاسبة' : 'Wholesale cost matrices require VIEW_COST_DATA capability', { variant: 'warning' });
            return;
        }
        setMatrixLoading(true);
        try {
            const res = await settingsService.getRateCardDetails(card.id);
            if (res?.data) {
                if (res.data.pricingMode !== 'SELLING_PRICE' && !canViewCostData) return;
                setViewCard(res.data);
                setMatrixSearch('');
            }
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل تحميل المصفوفة' : 'Failed to load rate card matrix'), { variant: 'error' });
        } finally {
            setMatrixLoading(false);
        }
    };

    const handleDeleteCard = async () => {
        if (!deleteConfirmId) return;
        setDeleting(true);
        try {
            await settingsService.deleteRateCard(deleteConfirmId);
            enqueueSnackbar(lang === 'ar' ? 'تم حذف بطاقة الأسعار' : 'Rate card deleted successfully', { variant: 'success' });
            setDeleteConfirmId(null);
            fetchRateCards();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل الحذف' : 'Delete failed'), { variant: 'error' });
        } finally {
            setDeleting(false);
        }
    };

    if (!hasPageAccess) {
        return (
            <div dir={isRTL ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 py-12">
                <EmptyStateV2
                    icon="lock"
                    title={lang === 'ar' ? 'صلاحية الوصول مقيدة' : 'Access Restricted'}
                    description={lang === 'ar' ? 'إدارة بطاقات الأسعار متاحة فقط لمسؤولي التسعير والإدارة.' : 'Carrier rate card administration is restricted to authorized pricing administrators.'}
                />
            </div>
        );
    }

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="w-full min-h-screen pb-14">
            <div className="max-w-[1600px] mx-auto pt-5 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            V2 Governance
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? 'بطاقات أسعار العقود مع حماية أعمدة التكلفة الأساسية' : 'Contract rate cards with strict VIEW_COST_DATA wholesale isolation'}
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
                            to="/settings?tab=ratecards"
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
                            {lang === 'ar' ? 'بطاقات أسعار العقود والمناطق' : 'Carrier Contract Rate Cards'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {lang === 'ar' ? 'إدارة مصفوفات الأوزان والمناطق (Zones 1-9) لعقود الشحن.' : 'Manage zone-based weight bracket matrices (Zones 1–9) for carrier contracts.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link to="/settings-v2?tab=fallback" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">shield</span>
                            <span>{lang === 'ar' ? 'تسعير الطوارئ والبدائل' : 'Fallback Pricing'}</span>
                        </Link>
                        <button type="button" onClick={handleDownloadSample} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                            <span className="material-symbols-outlined text-base text-emerald-600 dark:text-emerald-400" aria-hidden="true">download</span>
                            <span>{lang === 'ar' ? 'نموذج Excel' : 'Sample (.xlsx)'}</span>
                        </button>
                        <button type="button" onClick={() => setUploadModalOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs cursor-pointer">
                            <span className="material-symbols-outlined text-base" aria-hidden="true">upload_file</span>
                            <span>{lang === 'ar' ? 'رفع بطاقة أسعار' : 'Upload Rate Card'}</span>
                        </button>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'إجمالي البطاقات' : 'Total Rate Cards'}</div>
                        <div className="text-2xl font-black text-primary mt-1 font-mono tabular-nums" dir="ltr">{visibleCards.length}</div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'العقد الافتراضي' : 'Default Contract'}</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2 truncate" dir="ltr">5535 - AMANI (DGR)</div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'المناطق المغطاة' : 'Zones Supported'}</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2 truncate" dir="ltr">9 DHL Zones (1–9)</div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs">
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'شرائح الوزن' : 'Weight Brackets'}</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2 truncate" dir="ltr">0.5 kg – 30.0 kg + Flat/KG</div>
                    </div>
                </div>

                {!canViewCostData && (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
                        <span className="material-symbols-outlined text-lg text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true">shield_lock</span>
                        <span>
                            {lang === 'ar'
                                ? `تم إخفاء بطاقات التكلفة الأساسية (${hiddenWholesaleCount}) لأن عرض بيانات التكلفة مقصور على الإدارة والمحاسبة.`
                                : `Wholesale carrier cost matrices (${hiddenWholesaleCount} hidden) are restricted to Admin and Accounting roles.`}
                        </span>
                    </div>
                )}

                {fetchError && <ErrorBannerV2 message={fetchError} onRetry={fetchRateCards} isRetrying={loading} />}

                {/* Search Bar */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {lang === 'ar' ? `البطاقات المتاحة: ${visibleCards.length}` : `Visible Rate Cards: ${visibleCards.length}`}
                    </div>
                    <div className="relative w-full sm:w-72">
                        <span className="material-symbols-outlined text-lg text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true">search</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={lang === 'ar' ? 'بحث بالمعرف أو الاسم...' : 'Search by ID, name, or carrier...'}
                            className="w-full ps-9 pe-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center">
                        <span className="loading loading-spinner loading-md text-primary" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                            {lang === 'ar' ? 'جارٍ تحميل بطاقات الأسعار...' : 'Loading rate cards...'}
                        </p>
                    </div>
                ) : visibleCards.length === 0 && !fetchError ? (
                    <EmptyStateV2
                        icon="table_chart"
                        title={lang === 'ar' ? 'لا توجد بطاقات أسعار' : 'No rate cards found'}
                        description={lang === 'ar' ? 'ارفع ملف Excel لإنشاء بطاقة أسعار جديدة.' : 'Upload an Excel matrix to configure a new contract rate card.'}
                        actionLabel={lang === 'ar' ? 'رفع بطاقة أسعار' : 'Upload Rate Card'}
                        onAction={() => setUploadModalOpen(true)}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (< md) */}
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {visibleCards.map((card) => {
                                const isBuiltIn = card.id === '5535_AMANI' || card.id === 'DHL_5535_AMANI';
                                return (
                                    <div key={card.id} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-mono font-bold text-sm text-primary truncate" dir="ltr">{card.id}</div>
                                                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{card.name}</div>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0" dir="ltr">
                                                {card.carrierCode || 'DGR'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                                            {canViewCostData && (
                                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${card.pricingMode === 'SELLING_PRICE' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'}`}>
                                                    {card.pricingMode === 'SELLING_PRICE' ? 'Selling Price' : 'Wholesale Base Cost'}
                                                </span>
                                            )}
                                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300" dir="ltr">
                                                {card.currency || 'KWD'} • {card.totalBrackets || 60} brackets
                                            </span>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <button type="button" onClick={() => handleOpenMatrix(card)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                {lang === 'ar' ? 'عرض المصفوفة' : 'View Matrix'}
                                            </button>
                                            {!isBuiltIn && (
                                                <button type="button" onClick={() => setDeleteConfirmId(card.id)} className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-300 cursor-pointer">
                                                    {lang === 'ar' ? 'حذف' : 'Delete'}
                                                </button>
                                            )}
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
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'معرف البطاقة' : 'Card ID'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الاسم' : 'Display Name'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الناقل' : 'Carrier'}</th>
                                            {canViewCostData && <th className="px-4 py-3 text-start">{lang === 'ar' ? 'نوع التسعير / التكلفة' : 'Cost / Pricing Mode'}</th>}
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'العملة' : 'Currency'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'التغطية' : 'Coverage'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {visibleCards.map((card) => {
                                            const isBuiltIn = card.id === '5535_AMANI' || card.id === 'DHL_5535_AMANI';
                                            return (
                                                <tr key={card.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-3 font-mono font-bold text-primary" dir="ltr">{card.id}</td>
                                                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{card.name}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300" dir="ltr">
                                                            {card.carrierCode || 'DGR'}
                                                        </span>
                                                    </td>
                                                    {canViewCostData && (
                                                        <td className="px-4 py-3">
                                                            {card.pricingMode === 'SELLING_PRICE' ? (
                                                                <span className="inline-flex px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                                                                    {lang === 'ar' ? 'سعر بيع' : 'Selling Price'}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold">
                                                                    {lang === 'ar' ? 'تكلفة الجملة' : 'Wholesale Base Cost'}
                                                                </span>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300" dir="ltr">{card.currency || 'KWD'}</td>
                                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">
                                                        {card.totalBrackets || 60} brackets • Zones 1–9
                                                    </td>
                                                    <td className="px-4 py-3 text-end">
                                                        <div className="inline-flex items-center justify-end gap-1">
                                                            <button type="button" disabled={matrixLoading} onClick={() => handleOpenMatrix(card)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-primary hover:bg-primary/10 font-bold cursor-pointer">
                                                                <span className="material-symbols-outlined text-sm">visibility</span>
                                                                <span>{lang === 'ar' ? 'عرض' : 'View'}</span>
                                                            </button>
                                                            {!isBuiltIn && (
                                                                <button type="button" onClick={() => setDeleteConfirmId(card.id)} className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer" title={lang === 'ar' ? 'حذف' : 'Delete'}>
                                                                    <span className="material-symbols-outlined text-base">delete</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Upload Modal */}
            {uploadModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <form onSubmit={handleUploadSubmit} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                                {lang === 'ar' ? 'رفع بطاقة أسعار (.xlsx)' : 'Upload Rate Card (.xlsx)'}
                            </h2>
                            <button type="button" onClick={() => setUploadModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
                            <span>{lang === 'ar' ? 'تأكد من مطابقة أعمدة الوزن والمناطق (Zones 1–9).' : 'Ensure your Excel sheet matches the Weight and Zone 1–9 template.'}</span>
                            <button type="button" onClick={handleDownloadSample} className="px-2.5 py-1 rounded-lg border border-primary text-primary font-bold whitespace-nowrap cursor-pointer">
                                {lang === 'ar' ? 'تحميل النموذج' : 'Get Template'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'معرف البطاقة *' : 'Card ID *'}</label>
                                <input type="text" required dir="ltr" placeholder="6000_KHALID" value={uploadForm.id} onChange={(e) => setUploadForm({ ...uploadForm, id: e.target.value.toUpperCase().replace(/\s+/g, '_') })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'اسم البطاقة *' : 'Display Name *'}</label>
                                <input type="text" required value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الناقل' : 'Carrier'}</label>
                                <select value={uploadForm.carrierCode} onChange={(e) => setUploadForm({ ...uploadForm, carrierCode: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                    <option value="DGR">DGR (DHL Express)</option>
                                    <option value="DHL">DHL Direct</option>
                                    <option value="ARAMEX">Aramex</option>
                                    <option value="SMSA">SMSA Express</option>
                                    <option value="OTE">OTE</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'العملة' : 'Currency'}</label>
                                <select value={uploadForm.currency} onChange={(e) => setUploadForm({ ...uploadForm, currency: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                                    <option value="KWD">KWD</option>
                                    <option value="SAR">SAR</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                </select>
                            </div>
                            {canViewCostData && (
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'وضع التسعير' : 'Pricing Mode'}</label>
                                    <select value={uploadForm.pricingMode} onChange={(e) => setUploadForm({ ...uploadForm, pricingMode: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                        <option value="SELLING_PRICE">Selling Price (Customer Final)</option>
                                        <option value="BASE_COST">Wholesale Base Cost (Admin/Accounting Only)</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-5 text-center cursor-pointer hover:border-primary/60">
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                            <span className="material-symbols-outlined text-3xl text-primary">upload_file</span>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                                {uploadForm.fileName || (lang === 'ar' ? 'انقر لاختيار ملف Excel (.xlsx)' : 'Click to select .xlsx file (max 5MB)')}
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={() => setUploadModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="submit" disabled={uploading || !uploadForm.fileBase64} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {uploading ? '...' : (lang === 'ar' ? 'استيراد وحفظ' : 'Import & Save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Matrix View Modal */}
            {viewCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-base text-primary" dir="ltr">{viewCard.id}</span>
                                    <span className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300" dir="ltr">{viewCard.carrierCode}</span>
                                    {canViewCostData && (
                                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">{viewCard.pricingMode}</span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">{viewCard.name}</p>
                            </div>
                            <button type="button" onClick={() => setViewCard(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                {lang === 'ar' ? `الشرائح: ${viewCard.brackets?.length || 0}` : `Brackets: ${viewCard.brackets?.length || 0}`}
                            </span>
                            <input
                                type="text"
                                dir="ltr"
                                value={matrixSearch}
                                onChange={(e) => setMatrixSearch(e.target.value)}
                                placeholder={lang === 'ar' ? 'تصفية بالوزن...' : 'Filter weight...'}
                                className="w-40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                        </div>

                        {viewCard.over30KgPerKgRate && Object.keys(viewCard.over30KgPerKgRate).length > 0 && (
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm text-amber-500">info</span>
                                    <span>{lang === 'ar' ? 'سعر الكيلو الإضافي فوق 30 كجم:' : 'Excess Rate Above 30 kg (per additional kg):'}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 font-mono" dir="ltr">
                                    {Object.entries(viewCard.over30KgPerKgRate).map(([zone, rate]) => (
                                        <span key={zone} className="px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold tabular-nums">
                                            Z{zone}: +{Number(rate).toFixed(3)} {viewCard.currency}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-xs text-center font-mono tabular-nums" dir="ltr">
                                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">KG</th>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => (
                                            <th key={z} className="px-3 py-2">Z{z}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                                    {viewCard.brackets
                                        ?.filter((b) => !matrixSearch || String(b.weight).includes(matrixSearch))
                                        .map((b) => (
                                            <tr key={b.weight} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-3 py-2 font-bold bg-slate-50 dark:bg-slate-800/40">{Number(b.weight).toFixed(1)}</td>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => {
                                                    const val = b.rates?.[String(z)];
                                                    return <td key={z} className="px-3 py-2">{val !== undefined ? Number(val).toFixed(3) : '—'}</td>;
                                                })}
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <h3 className="text-base font-black text-rose-600 dark:text-rose-400">
                            {lang === 'ar' ? 'تأكيد حذف بطاقة الأسعار' : 'Confirm Rate Card Deletion'}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? `هل أنت متأكد من حذف "${deleteConfirmId}"؟` : `Are you sure you want to delete "${deleteConfirmId}"?`}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" disabled={deleting} onClick={handleDeleteCard} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {deleting ? '...' : (lang === 'ar' ? 'حذف' : 'Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminRateCardsV2Page;
