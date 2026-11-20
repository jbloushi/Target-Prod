import React from 'react';

export const CARRIER_OPTIONS_V2 = [
    { value: 'ALL', label: 'All Carriers', labelAr: 'جميع النواقل' },
    { value: 'DHL', label: 'DHL Express', labelAr: 'دي إتش إل إكسبريس' },
    { value: 'ARAMEX', label: 'Aramex', labelAr: 'أرامكس' },
    { value: 'SMSA', label: 'SMSA Express', labelAr: 'سمسا إكسبريس' },
    { value: 'FEDEX', label: 'FedEx Express', labelAr: 'فيديكس إكسبريس' },
    { value: 'OTE', label: 'Target GCC (OTE)', labelAr: 'تارجت الخليج (OTE)' },
    { value: 'POSTA_PLUS', label: 'Posta Plus', labelAr: 'بوستا بلس' },
    { value: 'INTERNAL', label: 'Internal Fleet', labelAr: 'الأسطول الداخلي' },
    { value: 'SEA_FREIGHT', label: 'Sea Freight', labelAr: 'شحن بحري' },
    { value: 'LAND_FREIGHT', label: 'Land Freight', labelAr: 'شحن بري' }
];

export const CORRIDOR_OPTIONS_V2 = [
    { value: 'ALL', label: 'All Trade Corridors', labelAr: 'جميع مسارات الشحن' },
    { value: 'SA', label: 'KW → Saudi Arabia (SA)', labelAr: 'الكويت ← السعودية (SA)' },
    { value: 'AE', label: 'KW → UAE (AE)', labelAr: 'الكويت ← الإمارات (AE)' },
    { value: 'QA', label: 'KW → Qatar (QA)', labelAr: 'الكويت ← قطر (QA)' },
    { value: 'BH', label: 'KW → Bahrain (BH)', labelAr: 'الكويت ← البحرين (BH)' },
    { value: 'OM', label: 'KW → Oman (OM)', labelAr: 'الكويت ← عمان (OM)' },
    { value: 'EG', label: 'KW → Egypt (EG)', labelAr: 'الكويت ← مصر (EG)' },
    { value: 'GB', label: 'KW → United Kingdom (GB)', labelAr: 'الكويت ← بريطانيا (GB)' },
    { value: 'US', label: 'KW → United States (US)', labelAr: 'الكويت ← أمريكا (US)' },
    { value: 'KW', label: 'Domestic Kuwait (KW)', labelAr: 'النقل المحلي - الكويت (KW)' }
];

/**
 * ShipmentsFilterBarV2 - Accessible, zero-overflow search & multi-facet filter bar
 */
export const ShipmentsFilterBarV2 = ({
    search = '',
    onSearchChange,
    carrier = 'ALL',
    onCarrierChange,
    corridor = 'ALL',
    onCorridorChange,
    totalCount = 0,
    shownCount = 0,
    loading = false,
    onRefresh,
    canExportData = false,
    onOpenExportLog,
    onExportCurrentCsv,
    hasActiveFilters = false,
    onResetAllFilters,
    canSeeCarrier = true,
    isRTL = false
}) => {
    return (
        <div className="p-3.5 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/60">
            {/* Left: Search Input + Carrier Select + Corridor Select */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
                    <span
                        className="material-symbols-outlined pointer-events-none absolute inset-y-0 start-3 flex items-center text-slate-400 dark:text-slate-500 text-base select-none"
                        aria-hidden="true"
                    >
                        search
                    </span>
                    <input
                        type="search"
                        aria-label={
                            isRTL
                                ? 'بحث برقم البوليصة أو المستلم أو الهاتف أو الوجهة'
                                : 'Search waybill, consignee, phone, or destination'
                        }
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={
                            isRTL
                                ? 'ابحث برقم الشحنة، المستلم، الهاتف، المدينة...'
                                : 'Search waybill, consignee, phone, city...'
                        }
                        className="w-full h-9 ps-9 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {search && (
                        <button
                            type="button"
                            aria-label={isRTL ? 'مسح البحث' : 'Clear search'}
                            onClick={() => onSearchChange('')}
                            className="absolute inset-y-0 end-2 flex items-center px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                close
                            </span>
                        </button>
                    )}
                </div>

                {/* Carrier Filter Select (Single Caret) */}
                {canSeeCarrier && (
                    <div className="relative inline-flex items-center min-w-[145px] sm:min-w-[165px] flex-1 sm:flex-initial">
                        <select
                            aria-label={isRTL ? 'تصفية حسب الناقل' : 'Filter by Carrier'}
                            value={carrier}
                            onChange={(e) => onCarrierChange(e.target.value)}
                            style={{ backgroundImage: 'none' }}
                            className="appearance-none bg-none w-full h-9 ps-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                        >
                            {CARRIER_OPTIONS_V2.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {isRTL ? opt.labelAr : opt.label}
                                </option>
                            ))}
                        </select>
                        <span
                            className="material-symbols-outlined pointer-events-none absolute end-2.5 text-base text-slate-500 dark:text-slate-400 select-none"
                            aria-hidden="true"
                        >
                            expand_more
                        </span>
                    </div>
                )}

                {/* Trade Corridor / Destination Filter Select (Single Caret) */}
                <div className="relative inline-flex items-center min-w-[160px] sm:min-w-[190px] flex-1 sm:flex-initial">
                    <select
                        aria-label={isRTL ? 'تصفية حسب مسار الشحن' : 'Filter by Trade Corridor'}
                        value={corridor}
                        onChange={(e) => onCorridorChange(e.target.value)}
                        style={{ backgroundImage: 'none' }}
                        className="appearance-none bg-none w-full h-9 ps-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                    >
                        {CORRIDOR_OPTIONS_V2.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {isRTL ? opt.labelAr : opt.label}
                            </option>
                        ))}
                    </select>
                    <span
                        className="material-symbols-outlined pointer-events-none absolute end-2.5 text-base text-slate-500 dark:text-slate-400 select-none"
                        aria-hidden="true"
                    >
                        expand_more
                    </span>
                </div>

                {/* Clear Active Filters Button */}
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={onResetAllFilters}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 cursor-pointer whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            filter_alt_off
                        </span>
                        <span>{isRTL ? 'إعادة ضبط' : 'Reset Filters'}</span>
                    </button>
                )}
            </div>

            {/* Right: Record Count, CSV Export & Refresh */}
            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums px-1">
                    {isRTL
                        ? `عرض ${shownCount} من أصل ${totalCount} شحنة`
                        : `Showing ${shownCount} of ${totalCount} shipments`}
                </span>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onExportCurrentCsv}
                        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                        title={
                            isRTL
                                ? 'تصدير الجدول المعروض إلى ملف CSV'
                                : 'Export current manifest view to CSV'
                        }
                    >
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            download
                        </span>
                        <span>{isRTL ? 'تصدير CSV' : 'Export CSV'}</span>
                    </button>

                    {canExportData && typeof onOpenExportLog === 'function' && (
                        <button
                            type="button"
                            onClick={onOpenExportLog}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 dark:border-sky-500/30 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 text-xs font-bold text-primary dark:text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
                            title={
                                isRTL
                                    ? 'سجل تتبع ومراقبة الشحنات غير المسلمة'
                                    : 'Undelivered aging & carrier sync log'
                            }
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                monitoring
                            </span>
                            <span className="hidden sm:inline">
                                {isRTL ? 'سجل المتابعة' : 'Aging Log'}
                            </span>
                        </button>
                    )}

                    <button
                        type="button"
                        aria-label={isRTL ? 'تحديث القائمة' : 'Refresh manifest'}
                        onClick={onRefresh}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
                        title={isRTL ? 'تحديث البيانات' : 'Refresh'}
                    >
                        <span
                            className={`material-symbols-outlined text-base ${
                                loading ? 'animate-spin text-primary dark:text-sky-400' : ''
                            }`}
                            aria-hidden="true"
                        >
                            refresh
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShipmentsFilterBarV2;
