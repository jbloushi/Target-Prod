import React from 'react';

const getRankSuffix = (rank, isRTL) => {
    if (isRTL) return '';
    if (rank === 1) return 'st';
    if (rank === 2) return 'nd';
    if (rank === 3) return 'rd';
    return 'th';
};

const renderCarrierLogo = (carrier) => {
    const code = String(carrier?.code || '').toUpperCase();
    const name = String(carrier?.name || '').toLowerCase();

    // Aramex
    if (code === 'ARM' || code === 'ARAMEX' || name.includes('aramex')) {
        return (
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 border border-slate-200/90 dark:border-slate-700 shadow-xs shrink-0 select-none">
                <span className="text-[#D9232D] font-extrabold text-[15px] font-sans tracking-tight lowercase">
                    aramex
                </span>
            </div>
        );
    }

    // DHL Express
    if (code === 'DGR' || code === 'DHL' || name.includes('dhl')) {
        return (
            <div className="w-12 h-12 bg-[#FFCC00] rounded-xl flex items-center justify-center p-1.5 shadow-xs shrink-0 select-none">
                <svg viewBox="0 0 70 20" className="w-10 h-auto" fill="none">
                    <path d="M0 4h20v2H0zM0 9h18v2H0zM0 14h15v2H0z" fill="#D40511" opacity="0.9" />
                    <path d="M50 4h20v2H50zM52 9h18v2H52zM55 14h15v2H55z" fill="#D40511" opacity="0.9" />
                    <text x="35" y="16" textAnchor="middle" fontFamily="Arial Black, Impact, sans-serif" fontSize="18" fontWeight="900" fontStyle="italic" fill="#D40511" letterSpacing="-0.5">DHL</text>
                </svg>
            </div>
        );
    }

    // FedEx Express
    if (code === 'FDX' || code === 'FEDEX' || name.includes('fedex')) {
        return (
            <div className="w-12 h-12 bg-white rounded-xl flex flex-col items-center justify-center p-1 border border-slate-200/90 dark:border-slate-700 shadow-xs shrink-0 select-none">
                <div className="flex items-center text-sm font-black tracking-tight leading-none">
                    <span className="text-[#4D148C]">Fed</span>
                    <span className="text-[#FF6600]">Ex</span>
                </div>
                <span className="text-[7.5px] font-bold tracking-wider uppercase text-[#4D148C] mt-0.5">Express</span>
            </div>
        );
    }

    // Posta Plus
    if (code === 'PST' || code === 'POSTA' || name.includes('posta')) {
        return (
            <div className="w-12 h-12 bg-white rounded-xl flex flex-col items-center justify-center p-1 border border-slate-200/90 dark:border-slate-700 shadow-xs shrink-0 select-none">
                <span className="text-[#0085C7] font-black text-xs tracking-tight">posta</span>
                <span className="text-[#0085C7] font-bold text-[8px] tracking-wider uppercase">plus</span>
            </div>
        );
    }

    // Internal Fleet / Target Network
    if (code === 'MAN' || code === 'INTERNAL' || name.includes('internal') || name.includes('fleet')) {
        return (
            <div className="w-12 h-12 bg-emerald-950/10 dark:bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col items-center justify-center p-1 text-emerald-600 dark:text-emerald-400 shrink-0">
                <span className="material-symbols-outlined text-2xl">local_shipping</span>
                <span className="text-[7.5px] font-black uppercase tracking-wider">Internal</span>
            </div>
        );
    }

    // Default Fallback
    return (
        <div className="w-12 h-12 bg-base-200 rounded-xl flex items-center justify-center p-1 border border-base-300 shadow-xs shrink-0">
            <span className="font-mono text-xs font-black text-base-content">{carrier?.code || 'CAR'}</span>
        </div>
    );
};

const getCarrierBarGradient = (carrier) => {
    const code = String(carrier?.code || '').toUpperCase();
    const name = String(carrier?.name || '').toLowerCase();

    if (code === 'ARM' || code === 'ARAMEX' || name.includes('aramex')) {
        return 'bg-gradient-to-r from-[#0d5c75] from-75% to-[#10b981]';
    }
    if (code === 'DGR' || code === 'DHL' || name.includes('dhl')) {
        return 'bg-gradient-to-r from-[#1d63ed] from-65% to-[#f59e0b]';
    }
    if (code === 'FDX' || code === 'FEDEX' || name.includes('fedex')) {
        return 'bg-gradient-to-r from-[#3b0764] to-[#4338ca]';
    }
    if (code === 'PST' || code === 'POSTA' || name.includes('posta')) {
        return 'bg-gradient-to-r from-[#0284c7] to-[#0ea5e9]';
    }
    if (code === 'MAN' || code === 'INTERNAL' || name.includes('internal')) {
        return 'bg-gradient-to-r from-emerald-600 to-teal-500';
    }
    return 'bg-gradient-to-r from-primary to-accent';
};

const getSlaBadgeClass = (health) => {
    const h = Number(health ?? 100);
    if (h >= 100) return 'bg-[#15803d] text-white shadow-emerald-500/20';
    if (h >= 95) return 'bg-[#c08401] text-white shadow-amber-500/20';
    return 'bg-rose-600 text-white shadow-rose-500/20';
};

export default function CarrierNetworkHealth({ carriers = [], isRTL = false, onCarrierClick }) {
    if (!carriers || carriers.length === 0) return null;

    return (
        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-5 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-base-200/80">
                <div className="flex items-center gap-3">
                    <svg 
                        className="w-8 h-8 text-slate-800 dark:text-base-content shrink-0" 
                        viewBox="0 0 48 48" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                    >
                        {/* Upper truck */}
                        <path d="M12 14h14l4 5h5v8h-3" />
                        <circle cx="16" cy="27" r="2.2" />
                        <circle cx="31" cy="27" r="2.2" />
                        {/* Front lower truck */}
                        <path d="M26 26h11l4 4h4v7h-3" />
                        <circle cx="30" cy="37" r="2.2" />
                        <circle cx="41" cy="37" r="2.2" />
                        {/* Rear lower truck with motion trails */}
                        <path d="M2 30h3M1 33h4M3 36h3" strokeWidth="2" />
                        <path d="M7 26h11l4 4h4v7h-3" />
                        <circle cx="11" cy="37" r="2.2" />
                        <circle cx="22" cy="37" r="2.2" />
                    </svg>
                    <div>
                        <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            {isRTL ? 'صحة شبكة الناقلين' : 'Carrier Network Health'}
                        </h3>
                        <p className="text-xs text-base-content/60 font-medium mt-0.5">
                            {isRTL ? 'مرتبة حسب حجم الشحن. الحالة النشطة والامتثال لـ SLA.' : 'Ranked by Volume. Active status & SLA compliance.'}
                        </p>
                    </div>
                </div>
                <div className="self-start sm:self-center">
                    <span className="px-3.5 py-1 bg-slate-100 dark:bg-base-200 border border-slate-200/80 dark:border-base-300 rounded-full text-xs font-bold text-slate-800 dark:text-base-content inline-flex items-center">
                        {carriers.length} {isRTL ? 'شركاء ناقلين نشطين' : 'Carriers Active'}
                    </span>
                </div>
            </div>

            {/* Ranked Carrier List */}
            <div className="divide-y divide-slate-100 dark:divide-base-200/80 mt-4">
                {carriers.map((car, index) => (
                    <div 
                        key={car.code}
                        onClick={() => onCarrierClick?.(car.code)}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 first:pt-1 last:pb-1 hover:bg-base-200/40 rounded-xl px-2.5 transition-colors cursor-pointer group"
                    >
                        {/* Carrier identity & Rank */}
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="w-6 sm:w-8 shrink-0 text-center font-bold text-slate-600 dark:text-slate-300 text-sm sm:text-base">
                                {index + 1}
                                {!isRTL && (
                                    <span className="text-[10px] align-super font-semibold text-slate-400 dark:text-slate-500">
                                        {getRankSuffix(index + 1, isRTL)}
                                    </span>
                                )}
                            </div>
                            {renderCarrierLogo(car)}
                            <div className="w-24 sm:w-36 shrink-0">
                                <div className="font-black text-sm text-base-content truncate group-hover:text-primary transition-colors">
                                    {isRTL ? car.nameAr : car.name}
                                </div>
                                <div className="text-xs font-semibold text-base-content/60">
                                    {car.percentage}% {isRTL ? 'حصة' : 'Share'}
                                </div>
                            </div>
                        </div>

                        {/* Center Column: Total Packages & Bar */}
                        <div className="flex-1 min-w-[140px] px-1 sm:px-3">
                            <div className="relative flex items-center justify-center mb-1.5 w-full">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-slate-200/90 dark:border-base-300"></div>
                                </div>
                                <div className="relative bg-base-100 px-2 sm:px-3 text-xs text-base-content/75 font-medium select-none">
                                    <span className="font-black text-base-content">
                                        {car.count?.toLocaleString() || car.count}
                                    </span> {isRTL ? 'إجمالي الطرود' : 'Total Packages'}
                                </div>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-base-200/90 rounded-full h-3 sm:h-3.5 overflow-hidden p-0.5">
                                <div 
                                    className={`h-full rounded-full overflow-hidden transition-all duration-500 ${getCarrierBarGradient(car)}`}
                                    style={{ width: `${Math.max(3, Math.min(100, car.percentage))}%` }}
                                />
                            </div>
                        </div>

                        {/* Right Column: SLA Pill Badge */}
                        <div className="shrink-0 flex justify-end pl-1 sm:pl-2">
                            <span className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-black shadow-md ${getSlaBadgeClass(car.health)}`}>
                                {car.health ?? 100}% {isRTL ? 'كفاءة' : 'SLA'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
