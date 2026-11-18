import React from 'react';

const renderCarrierLogo = (carrier) => {
    const code = String(carrier?.code || '').toUpperCase();
    const name = String(carrier?.name || '').toLowerCase();

    // Aramex
    if (code === 'ARM' || code === 'ARAMEX' || name.includes('aramex')) {
        return (
            <div
                dir="ltr"
                className="w-9 h-9 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center p-1 border border-slate-200/90 dark:border-slate-700 shadow-2xs shrink-0 select-none"
            >
                <span className="text-[#D9232D] dark:text-[#f87171] font-extrabold text-[11px] font-sans tracking-tight lowercase leading-none">
                    aramex
                </span>
            </div>
        );
    }

    // DHL Express
    if (code === 'DGR' || code === 'DHL' || name.includes('dhl')) {
        return (
            <div
                dir="ltr"
                className="w-9 h-9 bg-[#FFCC00] rounded-xl flex items-center justify-center p-1 shadow-2xs shrink-0 select-none"
            >
                <svg viewBox="0 0 70 20" className="w-7 h-auto" fill="none" aria-hidden="true">
                    <path d="M0 4h20v2H0zM0 9h18v2H0zM0 14h15v2H0z" fill="#D40511" opacity="0.9" />
                    <path d="M50 4h20v2H50zM52 9h18v2H52zM55 14h15v2H55z" fill="#D40511" opacity="0.9" />
                    <text
                        x="35"
                        y="16"
                        textAnchor="middle"
                        fontFamily="Arial Black, Impact, sans-serif"
                        fontSize="18"
                        fontWeight="900"
                        fontStyle="italic"
                        fill="#D40511"
                        letterSpacing="-0.5"
                    >
                        DHL
                    </text>
                </svg>
            </div>
        );
    }

    // FedEx Express
    if (code === 'FDX' || code === 'FEDEX' || name.includes('fedex')) {
        return (
            <div
                dir="ltr"
                className="w-9 h-9 bg-white dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center p-1 border border-slate-200/90 dark:border-slate-700 shadow-2xs shrink-0 select-none"
            >
                <div className="flex items-center text-[11px] font-black tracking-tight leading-none">
                    <span className="text-[#4D148C] dark:text-[#c084fc]">Fed</span>
                    <span className="text-[#FF6600]">Ex</span>
                </div>
                <span className="text-[6.5px] font-bold tracking-wider uppercase text-[#4D148C] dark:text-[#c084fc] mt-0.5 leading-none">
                    Express
                </span>
            </div>
        );
    }

    // Posta Plus
    if (code === 'PST' || code === 'POSTA' || name.includes('posta')) {
        return (
            <div
                dir="ltr"
                className="w-9 h-9 bg-white dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center p-1 border border-slate-200/90 dark:border-slate-700 shadow-2xs shrink-0 select-none"
            >
                <span className="text-[#0085C7] dark:text-[#38bdf8] font-black text-[10px] tracking-tight leading-none">
                    posta
                </span>
                <span className="text-[#0085C7] dark:text-[#38bdf8] font-bold text-[7px] tracking-wider uppercase mt-0.5 leading-none">
                    plus
                </span>
            </div>
        );
    }

    // SMSA Express
    if (code === 'SMSA' || code === 'SMSAEXPRESS' || name.includes('smsa')) {
        return (
            <div
                dir="ltr"
                className="w-9 h-9 bg-[#ea580c] rounded-xl flex flex-col items-center justify-center p-1 shadow-2xs shrink-0 select-none"
            >
                <span className="text-white font-black text-[11px] tracking-tighter uppercase font-sans leading-none">
                    SMSA
                </span>
                <span className="text-white/90 text-[6px] font-bold tracking-widest uppercase mt-0.5 leading-none">
                    Express
                </span>
            </div>
        );
    }

    // Internal Fleet / Target Network
    if (code === 'MAN' || code === 'INTERNAL' || name.includes('internal') || name.includes('fleet')) {
        return (
            <div
                dir="ltr"
                className="w-9 h-9 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex flex-col items-center justify-center p-1 text-emerald-700 dark:text-emerald-300 shrink-0 select-none"
            >
                <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">
                    local_shipping
                </span>
                <span className="text-[6px] font-black uppercase tracking-wider mt-0.5 leading-none">
                    Fleet
                </span>
            </div>
        );
    }

    // Default Fallback
    return (
        <div
            dir="ltr"
            className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center p-1 border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0 select-none"
        >
            <span className="font-mono text-[10px] font-black text-slate-700 dark:text-slate-200">
                {carrier?.code || 'CAR'}
            </span>
        </div>
    );
};

const getCarrierBarColor = (carrier) => {
    const code = String(carrier?.code || '').toUpperCase();
    const name = String(carrier?.name || '').toLowerCase();

    if (code === 'ARM' || code === 'ARAMEX' || name.includes('aramex')) {
        return 'bg-[#0d9488] dark:bg-[#14b8a6]';
    }
    if (code === 'DGR' || code === 'DHL' || name.includes('dhl')) {
        return 'bg-[#0050d4] dark:bg-[#3b82f6]';
    }
    if (code === 'FDX' || code === 'FEDEX' || name.includes('fedex')) {
        return 'bg-[#4f46e5] dark:bg-[#818cf8]';
    }
    if (code === 'PST' || code === 'POSTA' || name.includes('posta')) {
        return 'bg-[#0284c7] dark:bg-[#38bdf8]';
    }
    if (code === 'SMSA' || code === 'SMSAEXPRESS' || name.includes('smsa')) {
        return 'bg-[#ea580c] dark:bg-[#fb923c]';
    }
    if (code === 'MAN' || code === 'INTERNAL' || name.includes('internal')) {
        return 'bg-emerald-600 dark:bg-emerald-400';
    }
    return 'bg-primary';
};

const getSlaPillClasses = (health) => {
    const h = Number(health ?? 100);
    if (h >= 98) {
        return 'bg-emerald-600 text-white dark:bg-emerald-500/20 dark:text-emerald-300 dark:border dark:border-emerald-500/30';
    }
    if (h >= 92) {
        return 'bg-amber-600 text-white dark:bg-amber-500/20 dark:text-amber-300 dark:border dark:border-amber-500/30';
    }
    return 'bg-rose-600 text-white dark:bg-rose-500/20 dark:text-rose-300 dark:border dark:border-rose-500/30';
};

/**
 * CarrierNetworkHealthV2 - Compact 2-tier container-adaptive carrier telemetry panel
 * Designed specifically for Dashboard V2's 4-col/5-col wing to prevent horizontal SLA clipping
 * across all breakpoints (390px mobile, 768px tablet, 1024px laptop, 1440px+ desktop) in LTR and RTL.
 */
export const CarrierNetworkHealthV2 = ({ carriers = [], isRTL = false, onCarrierClick }) => {
    if (!carriers || carriers.length === 0) return null;

    const isInteractive = typeof onCarrierClick === 'function';

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs rounded-2xl p-4 sm:p-5 h-full flex flex-col justify-between min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0 select-none">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            local_shipping
                        </span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                            {isRTL ? 'صحة شبكة الناقلين' : 'Carrier Network Health'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                            {isRTL ? 'الحجم النشط والامتثال لمستوى الخدمة' : 'Volume share & SLA compliance'}
                        </p>
                    </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 tabular-nums">
                    {carriers.length} {isRTL ? 'ناقل نشط' : 'Active'}
                </span>
            </div>

            {/* Compact 2-Tier Carrier List */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 mt-2 flex-1 flex flex-col justify-around">
                {carriers.map((car, index) => {
                    const slaVal = Math.round(Number(car.health ?? car.onTimeRate ?? 98));
                    const sharePct = Math.max(0, Math.min(100, Math.round(Number(car.percentage) || 0)));
                    const pkgCount = Number(car.count || 0).toLocaleString();
                    const displayName = isRTL ? (car.nameAr || car.name) : car.name;

                    return (
                        <div
                            key={car.code || index}
                            role={isInteractive ? 'button' : undefined}
                            tabIndex={isInteractive ? 0 : undefined}
                            onClick={isInteractive ? () => onCarrierClick(car.code) : undefined}
                            onKeyDown={
                                isInteractive
                                    ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault();
                                              onCarrierClick(car.code);
                                          }
                                      }
                                    : undefined
                            }
                            className={`group py-2.5 first:pt-2 last:pb-1 px-2 -mx-2 rounded-xl transition-colors min-w-0 ${
                                isInteractive
                                    ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                                    : ''
                            }`}
                        >
                            {/* Tier 1: Rank + Emblem + Name/Stats + SLA Pill */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="w-4 shrink-0 text-center font-extrabold text-xs text-slate-400 dark:text-slate-500 tabular-nums select-none">
                                        {index + 1}
                                    </span>
                                    {renderCarrierLogo(car)}
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 truncate leading-tight">
                                            {displayName}
                                        </div>
                                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                                            <span className="font-bold text-slate-700 dark:text-slate-200">
                                                {pkgCount}
                                            </span>{' '}
                                            {isRTL ? 'طرد' : 'pkgs'}
                                            <span className="mx-1 opacity-50">•</span>
                                            <span>
                                                {sharePct}% {isRTL ? 'حصة' : 'share'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0">
                                    <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap tabular-nums select-none ${getSlaPillClasses(
                                            slaVal
                                        )}`}
                                    >
                                        {slaVal}% {isRTL ? 'كفاءة' : 'SLA'}
                                    </span>
                                </div>
                            </div>

                            {/* Tier 2: Slim Share Bar */}
                            <div className="mt-1.5 ps-6">
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${getCarrierBarColor(
                                            car
                                        )}`}
                                        style={{ width: `${Math.max(4, sharePct)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CarrierNetworkHealthV2;
