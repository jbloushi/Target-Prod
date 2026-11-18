import React from 'react';

/**
 * MetricCardV2 - Accessible, keyboard-navigable KPI card for Dashboard V2
 * Addresses NEW-F15 (keyboard navigation & accessibility), F10 (logical RTL alignment),
 * and V2 design review findings (equal card heights, no wrapping trend/currency/badge collisions, dark mode contrast).
 */
export const MetricCardV2 = ({
    title,
    value,
    subtitle,
    icon,
    trend,
    trendLabel,
    onClick,
    isActive = false,
    badge,
    badgeTone = 'neutral', // 'neutral' | 'success' | 'warning' | 'error' | 'info'
    badgeColor,
    tone = 'neutral', // 'neutral' | 'success' | 'warning' | 'error' | 'info'
    ariaLabel,
    className = ''
}) => {
    const toneStyles = {
        neutral: 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-primary/50 dark:hover:border-sky-500/50',
        success: 'bg-white dark:bg-slate-900 border-emerald-200/90 dark:border-emerald-500/30 hover:border-emerald-500/60 dark:hover:border-emerald-400/60',
        warning: 'bg-white dark:bg-slate-900 border-amber-200/90 dark:border-amber-500/30 hover:border-amber-500/60 dark:hover:border-amber-400/60',
        error: 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/40 hover:border-rose-500/60 dark:hover:border-rose-400/70',
        info: 'bg-white dark:bg-slate-900 border-sky-200/90 dark:border-sky-500/30 hover:border-sky-500/60 dark:hover:border-sky-400/60'
    };

    const iconToneStyles = {
        neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        success: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        warning: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
        error: 'bg-rose-100/80 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
        info: 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400'
    };

    const resolveBadgePillClasses = () => {
        const raw = String(badgeTone || badgeColor || '').toLowerCase();
        if (raw.includes('error') || raw.includes('rose')) {
            return 'bg-rose-600 text-white dark:bg-rose-500/25 dark:text-rose-200 dark:border dark:border-rose-500/40';
        }
        if (raw.includes('success') || raw.includes('emerald')) {
            return 'bg-emerald-600 text-white dark:bg-emerald-500/25 dark:text-emerald-200 dark:border dark:border-emerald-500/40';
        }
        if (raw.includes('warning') || raw.includes('amber')) {
            return 'bg-amber-600 text-white dark:bg-amber-500/25 dark:text-amber-200 dark:border dark:border-amber-500/40';
        }
        if (raw.includes('info') || raw.includes('sky') || raw.includes('primary')) {
            return 'bg-sky-600 text-white dark:bg-sky-500/25 dark:text-sky-200 dark:border dark:border-sky-500/40';
        }
        return 'bg-slate-800 text-white dark:bg-slate-800 dark:text-slate-200 dark:border dark:border-slate-700';
    };

    const isClickable = typeof onClick === 'function';

    const handleKeyDown = (e) => {
        if (!isClickable) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    const computedAriaLabel =
        ariaLabel ||
        `${title}${typeof value === 'string' || typeof value === 'number' ? `: ${value}` : ''}${
            subtitle ? ` - ${subtitle}` : ''
        }`;

    return (
        <article
            role={isClickable ? 'button' : 'region'}
            tabIndex={isClickable ? 0 : undefined}
            aria-label={computedAriaLabel}
            aria-pressed={isClickable ? isActive : undefined}
            onClick={isClickable ? onClick : undefined}
            onKeyDown={handleKeyDown}
            className={`
                relative h-full flex flex-col justify-between p-4 sm:p-5 rounded-2xl border shadow-2xs transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                ${toneStyles[tone] || toneStyles.neutral}
                ${isActive ? 'ring-2 ring-primary border-primary dark:border-sky-400 shadow-xs' : ''}
                ${isClickable ? 'cursor-pointer hover:shadow-sm active:scale-[0.99]' : ''}
                ${className}
            `}
        >
            {/* Header Row: Title & Icon */}
            <div className="flex items-start justify-between gap-2.5 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 leading-snug">
                    {title}
                </span>
                {icon && (
                    <span
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 select-none ${
                            iconToneStyles[tone] || iconToneStyles.neutral
                        }`}
                        aria-hidden="true"
                    >
                        <span className="material-symbols-outlined text-[18px] leading-none">
                            {icon}
                        </span>
                    </span>
                )}
            </div>

            {/* Primary Value & Flexible Single-Line Pill */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1.5 my-1">
                <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight tabular-nums whitespace-nowrap leading-none">
                    {value}
                </div>
                {badge && (
                    <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold leading-4 whitespace-nowrap shrink-0 select-none ${resolveBadgePillClasses()}`}
                    >
                        {badge}
                    </span>
                )}
            </div>

            {/* Footer Row: Subtitle & Non-Wrapping Trend Pill */}
            {(subtitle || (trend !== undefined && trend !== null)) && (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/90">
                    {subtitle && (
                        <span
                            className="min-w-0 flex-1 truncate font-medium"
                            title={typeof subtitle === 'string' ? subtitle : undefined}
                        >
                            {subtitle}
                        </span>
                    )}
                    {trend !== undefined && trend !== null && (
                        <span
                            className={`shrink-0 whitespace-nowrap font-bold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ms-auto ${
                                trend > 0
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                            }`}
                        >
                            {trend > 0 ? `+${trend}%` : `${trend}%`} {trendLabel || ''}
                        </span>
                    )}
                </div>
            )}
        </article>
    );
};

export default MetricCardV2;
