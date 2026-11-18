import React, { useState } from 'react';
import { VOLUMETRIC_DIVISOR } from './wizardConstants';

/**
 * LiveQuoteSidebarV2 (Full-Width Sticky Bottom Dispatch & Quote Bar)
 * Works seamlessly across all devices:
 * - Desktop (1024px+): Full-width sticky bottom bar inside the workspace with live retail rate,
 *   chargeable weight, optional expandable breakdown, and VIEW_COST_DATA-gated wholesale cost/margin.
 * - Mobile & Tablet (<1024px): Compact sticky bottom bar with 0px horizontal overflow.
 */
export const LiveQuoteSidebarV2 = ({
    step = 1,
    mode = 'create',
    isRTL = false,
    sender = {},
    receiver = {},
    pkg = {},
    customs = {},
    weightMetrics = {},
    selectedCarrier = {},
    quoteBreakdown = {},
    loadingQuotes = false,
    canViewCostData = false,
    submitting = false,
    agreedToPolicy = false,
    onNextStep,
    onPrevStep,
    onSaveDraft,
    onSubmitBooking
}) => {
    const [detailsExpanded, setDetailsExpanded] = useState(false);

    const formatKWD = (val) =>
        `${Number(val || 0).toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        })} ${isRTL ? 'د.ك' : 'KWD'}`;

    const stepCtaLabels = {
        1: isRTL ? 'المتابعة إلى المستلم' : 'Continue to Consignee',
        2: isRTL ? 'المتابعة إلى الطرود' : 'Continue to Packages',
        3: isRTL ? 'المتابعة إلى الناقلين' : 'Continue to Carriers',
        4: isRTL ? 'المتابعة إلى الجمارك' : 'Continue to Customs',
        5: isRTL ? 'المتابعة إلى المراجعة' : 'Continue to Review',
        6:
            mode === 'edit'
                ? isRTL
                    ? 'حفظ التعديلات'
                    : 'Save Changes'
                : isRTL
                ? 'تأكيد وإصدار البوليصة'
                : 'Confirm & Book'
    };

    const isManualPricing = Boolean(quoteBreakdown?.requiresManualPricing);

    return (
        <div className="sticky bottom-0 z-30 w-full mt-4">
            <section
                aria-label={isRTL ? 'شريط التسعير والإجراءات السريع' : 'Sticky Bottom Dispatch & Quote Bar'}
                className="rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 shadow-lg p-3.5 sm:px-5 sm:py-3.5 space-y-3"
            >
                {/* Expandable Breakdown Drawer (Opens upwards cleanly inside the bar) */}
                {detailsExpanded && (
                    <div className="pb-3 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {/* Weight Matrix */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                            <div className="flex items-center justify-between font-extrabold text-slate-800 dark:text-slate-100">
                                <span>{isRTL ? 'حاسبة الوزن المعتمد' : 'Chargeable Weight Matrix'}</span>
                                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                                    {weightMetrics.parcelCount || 1} {isRTL ? 'طرد' : 'Parcel(s)'} · {weightMetrics.totalPieces || 1}{' '}
                                    {isRTL ? 'قطعة' : 'pcs'}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{isRTL ? 'الفعلي' : 'Actual'}</div>
                                    <div dir="ltr" className="font-mono font-black text-slate-900 dark:text-slate-100">
                                        {Number(weightMetrics.actualWeight || 0).toFixed(2)} kg
                                    </div>
                                </div>
                                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                        {isRTL ? `الحجمي ÷${VOLUMETRIC_DIVISOR}` : `Vol. ÷${VOLUMETRIC_DIVISOR}`}
                                    </div>
                                    <div dir="ltr" className="font-mono font-black text-slate-900 dark:text-slate-100">
                                        {Number(weightMetrics.volumetricWeight || 0).toFixed(2)} kg
                                    </div>
                                </div>
                                <div className="p-2 rounded-lg bg-primary/10 dark:bg-sky-500/15 border border-primary/30 dark:border-sky-500/30">
                                    <div className="text-[10px] font-bold text-primary dark:text-sky-300">{isRTL ? 'المعتمد' : 'Chargeable'}</div>
                                    <div dir="ltr" className="font-mono font-black text-primary dark:text-sky-400">
                                        {Number(weightMetrics.chargeableWeight || 1).toFixed(2)} kg
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Retail Rate Breakdown */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between font-extrabold text-slate-800 dark:text-slate-100">
                                <span>
                                    {isRTL ? 'تفاصيل التسعيرة' : 'Retail Rate Breakdown'} ({customs.incoterms?.split('–')[0]?.trim() || 'DAP'})
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                    {quoteBreakdown.isLive ? (isRTL ? 'عقد مباشر' : 'Live Rate') : (isRTL ? 'قياسي' : 'Standard')}
                                </span>
                            </div>
                            {isManualPricing ? (
                                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                    {isRTL ? 'يتطلب تسعيراً يدوياً عند المراجعة.' : 'Manual pricing required during review.'}
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                        <span>{isRTL ? 'الشحن الأساسي:' : 'Base Freight:'}</span>
                                        <span dir="ltr" className="font-mono font-bold">
                                            {formatKWD(quoteBreakdown.baseFreight)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                        <span>{isRTL ? 'الوقود (FSC):' : 'Fuel (FSC):'}</span>
                                        <span dir="ltr" className="font-mono font-semibold">
                                            {quoteBreakdown.fuelSurcharge > 0 ? formatKWD(quoteBreakdown.fuelSurcharge) : isRTL ? 'مشمول' : 'Included'}
                                        </span>
                                    </div>
                                    {(quoteBreakdown.dgrFee > 0 || quoteBreakdown.addonsTotal > 0) && (
                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                            <span>{isRTL ? 'إضافات و DGR:' : 'Add-ons & DGR:'}</span>
                                            <span dir="ltr" className="font-mono font-bold">
                                                +{formatKWD((quoteBreakdown.dgrFee || 0) + (quoteBreakdown.addonsTotal || 0))}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* STRICT RBAC GATE: Wholesale Cost & Margin (ONLY admin & accounting) */}
                        {canViewCostData && (
                            <div
                                data-testid="wizard-v2-cost-margin-box"
                                className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-1.5 text-xs"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm text-indigo-600 dark:text-indigo-400" aria-hidden="true">
                                            lock
                                        </span>
                                        <span>{isRTL ? 'التكلفة والهامش' : 'Wholesale Cost & Margin'}</span>
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                                        {quoteBreakdown.marginPct}%
                                    </span>
                                </div>
                                <div className="flex justify-between text-indigo-900/80 dark:text-indigo-200/80 text-[11px]">
                                    <span>{isRTL ? 'تكلفة الناقل:' : 'Wholesale Cost:'}</span>
                                    <span dir="ltr" className="font-mono font-bold">
                                        {formatKWD(quoteBreakdown.wholesaleCost)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                                    <span>{isRTL ? 'صافي الربح:' : 'Gross Margin:'}</span>
                                    <span dir="ltr" className="font-mono">
                                        +{formatKWD(quoteBreakdown.grossMargin)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Main Compact Bar Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Left: Live Telemetry + Breakdown Toggle */}
                    <div className="flex flex-wrap items-center justify-between md:justify-start gap-2.5 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                dir="ltr"
                                className="px-2 py-1 rounded-lg bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300 font-mono text-xs font-extrabold whitespace-nowrap"
                            >
                                {sender.countryCode || 'KW'} → {receiver.countryCode || 'AE'}
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <span dir="ltr" className="font-mono text-slate-800 dark:text-slate-200">
                                        {Number(weightMetrics.chargeableWeight || 1).toFixed(2)} kg
                                    </span>
                                    <span>•</span>
                                    <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">
                                        {selectedCarrier.emblem || 'DHL'}
                                    </span>
                                    {pkg.dangerousGoods && (
                                        <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                                            DGR
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        dir="ltr"
                                        className="text-sm sm:text-base font-black font-mono tabular-nums text-primary dark:text-sky-400 whitespace-nowrap"
                                    >
                                        {loadingQuotes ? '...' : formatKWD(quoteBreakdown.finalCost)}
                                    </span>
                                    {canViewCostData && quoteBreakdown.wholesaleCost !== null && (
                                        <span
                                            dir="ltr"
                                            className="hidden sm:inline-block text-[10.5px] font-mono font-bold text-indigo-600 dark:text-indigo-300 whitespace-nowrap"
                                        >
                                            (Cost: {Number(quoteBreakdown.wholesaleCost).toFixed(3)} · +{quoteBreakdown.marginPct}%)
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setDetailsExpanded((v) => !v)}
                            aria-expanded={detailsExpanded}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
                        >
                            <span>{detailsExpanded ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'التفاصيل' : 'Details')}</span>
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {detailsExpanded ? 'expand_more' : 'expand_less'}
                            </span>
                        </button>
                    </div>

                    {/* Right: Step Navigation Actions */}
                    <div className="flex items-center justify-between md:justify-end gap-2 shrink-0">
                        <button
                            type="button"
                            disabled={step === 1 || submitting}
                            onClick={onPrevStep}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{isRTL ? 'السابق' : 'Back'}</span>
                        </button>

                        <button
                            type="button"
                            disabled={submitting}
                            onClick={onSaveDraft}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                save
                            </span>
                            <span className="hidden sm:inline">{isRTL ? 'حفظ مسودة' : 'Save Draft'}</span>
                        </button>

                        {step < 6 ? (
                            <button
                                type="button"
                                onClick={onNextStep}
                                className="flex-1 sm:flex-initial px-4 sm:px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-extrabold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                            >
                                <span>{stepCtaLabels[step]}</span>
                                <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                    {isRTL ? 'arrow_back' : 'arrow_forward'}
                                </span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={submitting || !agreedToPolicy}
                                onClick={onSubmitBooking}
                                className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                                    !agreedToPolicy || submitting
                                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer'
                                }`}
                            >
                                {submitting ? (
                                    <span className="loading loading-spinner loading-xs" aria-hidden="true" />
                                ) : (
                                    <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                        verified
                                    </span>
                                )}
                                <span>{stepCtaLabels[6]}</span>
                            </button>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LiveQuoteSidebarV2;
