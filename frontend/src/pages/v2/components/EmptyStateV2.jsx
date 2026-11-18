import React from 'react';

/**
 * EmptyStateV2 - Accessible, actionable empty state component for Dashboard V2
 */
export const EmptyStateV2 = ({
    title = 'No records found',
    description = 'There are no active consignments matching the current filter.',
    icon = 'inbox',
    actionLabel,
    onAction,
    className = ''
}) => {
    return (
        <div
            className={`flex flex-col items-center justify-center p-10 sm:p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 ${className}`}
            role="status"
        >
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-3.5 select-none">
                <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                    {icon}
                </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-1">
                {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                {description}
            </p>
            {actionLabel && typeof onAction === 'function' && (
                <button
                    type="button"
                    onClick={onAction}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        add
                    </span>
                    {actionLabel}
                </button>
            )}
        </div>
    );
};

export default EmptyStateV2;
