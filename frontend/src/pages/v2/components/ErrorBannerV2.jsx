import React from 'react';

/**
 * ErrorBannerV2 - Accessible error display with retry trigger for Dashboard V2
 * Addresses finding F4 (missing error UI in V1)
 */
export const ErrorBannerV2 = ({
    message = 'Failed to load telemetry data.',
    onRetry,
    isRetrying = false,
    className = ''
}) => {
    return (
        <div
            role="alert"
            aria-live="polite"
            className={`rounded-2xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100 shadow-2xs flex flex-wrap items-center justify-between gap-3 p-4 ${className}`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <span
                    className="material-symbols-outlined text-2xl text-rose-600 dark:text-rose-400 shrink-0 select-none"
                    aria-hidden="true"
                >
                    error
                </span>
                <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-rose-900 dark:text-rose-100">
                        Telemetry Sync Error
                    </h3>
                    <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 truncate">
                        {message}
                    </p>
                </div>
            </div>
            {typeof onRetry === 'function' && (
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                    {isRetrying ? (
                        <span
                            className="loading loading-spinner loading-xs"
                            aria-hidden="true"
                        ></span>
                    ) : (
                        <span
                            className="material-symbols-outlined text-sm"
                            aria-hidden="true"
                        >
                            refresh
                        </span>
                    )}
                    Retry
                </button>
            )}
        </div>
    );
};

export default ErrorBannerV2;
