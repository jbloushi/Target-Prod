import React from 'react';

/**
 * DashboardSkeletonV2 - Shimmer skeleton loading state for Dashboard V2
 */
export const DashboardSkeletonV2 = () => {
    return (
        <div
            className="w-full space-y-6 animate-pulse"
            aria-busy="true"
            aria-label="Loading dashboard telemetry"
        >
            {/* KPI Cards Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
                    >
                        <div className="flex justify-between items-center">
                            <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                            <div className="h-8 w-8 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
                        </div>
                        <div className="h-7 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                        <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800/70 rounded"></div>
                    </div>
                ))}
            </div>

            {/* Telemetry charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 xl:col-span-8 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 h-72">
                    <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    <div className="h-52 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl"></div>
                </div>
                <div className="lg:col-span-5 xl:col-span-4 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 h-72">
                    <div className="h-5 w-36 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    <div className="space-y-3 pt-2">
                        {[1, 2, 3, 4].map((j) => (
                            <div
                                key={j}
                                className="h-10 w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg"
                            ></div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Manifest table skeleton */}
            <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <div className="h-5 w-52 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="space-y-2 pt-2">
                    {[1, 2, 3, 4, 5].map((k) => (
                        <div
                            key={k}
                            className="h-12 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg"
                        ></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DashboardSkeletonV2;
