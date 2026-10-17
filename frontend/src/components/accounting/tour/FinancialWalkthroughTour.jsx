import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import PropTypes from 'prop-types';
import LanguageContext from '../../../context/LanguageContext';
import { useFinancialTour } from './useFinancialTour';
import { getTourMetadata } from './financialTourSteps';

/**
 * Helper to resolve bilingual text object or string
 */
const resolveText = (value, lang = 'en') => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[lang] || value.en || Object.values(value)[0] || '';
};

/**
 * Searches for the first matching target element in the DOM
 */
const findTargetElement = (selector) => {
    if (!selector) return null;
    const selectors = selector.split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of selectors) {
        try {
            const el = document.querySelector(sel);
            if (el) return el;
        } catch {
            // Ignore malformed selector
        }
    }
    return null;
};

/**
 * Financial Walkthrough Tour Overlay Component
 *
 * Renders an interactive spotlight overlay highlighting DOM elements with:
 * - Dynamic spotlight cutout mask with breathing padding and animated pulse ring
 * - Smooth scroll-into-view
 * - Collision-aware floating popover with directional arrow indicator
 * - Fallback center positioning when target element is detached or not yet present
 * - Step counter, explanatory copy, visual hint, and progress bar
 * - Previous / Next / Complete buttons and keyboard controls (Arrow keys, Escape)
 * - Paused state banner modal allowing resume or discard
 */
export const FinancialWalkthroughTour = ({
    activeTour = null,
    isOpen: propIsOpen,
    onClose,
    onComplete,
    onStepChange,
    onTabRequired,
    onSwitchTab,
    storageKey,
    lang: propLang,
    isRTL: propIsRTL,
    tourHook: propTourHook
}) => {
    // Gracefully resolve language and RTL context if available
    const langContext = useContext(LanguageContext) || {};
    const lang = propLang || langContext.lang || 'en';
    const isRTL = propIsRTL !== undefined ? propIsRTL : Boolean(langContext.isRTL || lang === 'ar');

    // Tab requirement callback
    const handleTabRequired = useCallback((tab) => {
        if (onTabRequired) onTabRequired(tab);
        else if (onSwitchTab) onSwitchTab(tab);
    }, [onTabRequired, onSwitchTab]);

    // Internal tour hook if caller didn't supply an external instance
    const internalTourHook = useFinancialTour({
        onTabRequired: handleTabRequired,
        onStepChange,
        onComplete,
        onDismiss: onClose,
        storageKey
    });

    const hook = propTourHook || internalTourHook;

    const {
        activeTour: currentActiveTour,
        currentStepIndex,
        currentStep,
        totalSteps,
        isPaused,
        hasNext,
        hasPrev,
        nextStep,
        prevStep,
        pauseTour,
        resumeTour,
        dismissTour,
        completeTour,
        startTour
    } = hook;

    // Synchronize prop activeTour with internal hook if not using external tourHook
    useEffect(() => {
        if (!propTourHook && activeTour && activeTour !== currentActiveTour) {
            startTour(activeTour);
        }
    }, [activeTour, propTourHook, currentActiveTour, startTour]);

    // Popover sizing and measured dimensions
    const popoverRef = useRef(null);
    const [targetRect, setTargetRect] = useState(null);
    const [popoverSize, setPopoverSize] = useState({ width: 420, height: 280 });

    const isOpen = propIsOpen !== undefined
        ? propIsOpen
        : Boolean(currentActiveTour || isPaused);

    // Active metadata
    const tourMetadata = useMemo(() => {
        if (!currentActiveTour) return null;
        return getTourMetadata(currentActiveTour);
    }, [currentActiveTour]);

    // Measure popover dimensions dynamically
    useEffect(() => {
        if (!popoverRef.current) return;
        const rect = popoverRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setPopoverSize({
                width: rect.width,
                height: rect.height
            });
        }
    }, [currentStepIndex, currentStep, isPaused]);

    // Locate target DOM element and compute spotlight coordinates
    useEffect(() => {
        if (!isOpen || !currentStep || isPaused) {
            setTargetRect(null);
            return;
        }

        let retryTimer = null;
        let retryCount = 0;
        const maxRetries = 8;

        const updateTargetRect = () => {
            const el = findTargetElement(currentStep.targetSelector);
            if (el) {
                try {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                } catch {
                    // Fallback in older test environments
                }

                const r = el.getBoundingClientRect();
                const padding = 8;
                setTargetRect({
                    x: Math.max(0, r.left - padding),
                    y: Math.max(0, r.top - padding),
                    width: r.width + padding * 2,
                    height: r.height + padding * 2,
                    top: Math.max(0, r.top - padding),
                    left: Math.max(0, r.left - padding),
                    bottom: r.bottom + padding,
                    right: r.right + padding
                });
            } else if (retryCount < maxRetries) {
                retryCount++;
                retryTimer = setTimeout(updateTargetRect, 100);
            } else {
                setTargetRect(null);
            }
        };

        // Small delay to allow any tab switch animation to stabilize
        retryTimer = setTimeout(updateTargetRect, 80);

        const handleViewportChange = () => {
            const el = findTargetElement(currentStep.targetSelector);
            if (el) {
                const r = el.getBoundingClientRect();
                const padding = 8;
                setTargetRect({
                    x: Math.max(0, r.left - padding),
                    y: Math.max(0, r.top - padding),
                    width: r.width + padding * 2,
                    height: r.height + padding * 2,
                    top: Math.max(0, r.top - padding),
                    left: Math.max(0, r.left - padding),
                    bottom: r.bottom + padding,
                    right: r.right + padding
                });
            }
        };

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [isOpen, currentStep, isPaused]);

    // Handle Keyboard Shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            const targetTag = e.target?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || e.target?.isContentEditable) {
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                if (isPaused) {
                    dismissTour();
                } else {
                    pauseTour();
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (!isPaused) {
                    if (isRTL) prevStep(); else nextStep();
                }
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (!isPaused) {
                    if (isRTL) nextStep(); else prevStep();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isPaused, isRTL, nextStep, prevStep, pauseTour, dismissTour]);

    if (!isOpen) return null;

    // Calculate popover positioning with collision awareness
    const calculatePopoverPosition = () => {
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
        const popoverW = popoverSize.width || 420;
        const popoverH = popoverSize.height || 280;
        const margin = 16;

        // Fallback center positioning when element is not mounted or detached
        if (!targetRect) {
            return {
                style: {
                    top: `${Math.max(20, (viewportHeight - popoverH) / 2)}px`,
                    left: `${Math.max(16, (viewportWidth - popoverW) / 2)}px`,
                    width: `${Math.min(popoverW, viewportWidth - 32)}px`
                },
                placement: 'center',
                isCentered: true
            };
        }

        const preferred = currentStep?.placement || 'bottom';
        let finalPlacement = preferred;

        // Collision detection & auto-flip
        if (preferred === 'bottom' && targetRect.bottom + popoverH + margin > viewportHeight) {
            if (targetRect.top - popoverH - margin > 0) {
                finalPlacement = 'top';
            }
        } else if (preferred === 'top' && targetRect.top - popoverH - margin < 0) {
            if (targetRect.bottom + popoverH + margin <= viewportHeight) {
                finalPlacement = 'bottom';
            }
        } else if (preferred === 'left' && targetRect.left - popoverW - margin < 0) {
            if (targetRect.right + popoverW + margin <= viewportWidth) {
                finalPlacement = 'right';
            }
        } else if (preferred === 'right' && targetRect.right + popoverW + margin > viewportWidth) {
            if (targetRect.left - popoverW - margin >= 0) {
                finalPlacement = 'left';
            }
        }

        let top = 0;
        let left = 0;

        if (finalPlacement === 'bottom') {
            top = targetRect.bottom + margin;
            left = targetRect.left + (targetRect.width / 2) - (popoverW / 2);
        } else if (finalPlacement === 'top') {
            top = targetRect.top - popoverH - margin;
            left = targetRect.left + (targetRect.width / 2) - (popoverW / 2);
        } else if (finalPlacement === 'left') {
            top = targetRect.top + (targetRect.height / 2) - (popoverH / 2);
            left = targetRect.left - popoverW - margin;
        } else if (finalPlacement === 'right') {
            top = targetRect.top + (targetRect.height / 2) - (popoverH / 2);
            left = targetRect.right + margin;
        }

        // Clamp inside viewport
        left = Math.max(16, Math.min(left, viewportWidth - popoverW - 16));
        top = Math.max(16, Math.min(top, viewportHeight - popoverH - 16));

        return {
            style: {
                top: `${top}px`,
                left: `${left}px`,
                width: `${Math.min(popoverW, viewportWidth - 32)}px`
            },
            placement: finalPlacement,
            isCentered: false
        };
    };

    const positionInfo = calculatePopoverPosition();
    const progressPercent = totalSteps > 0 ? Math.round(((currentStepIndex + 1) / totalSteps) * 100) : 0;

    return (
        <div
            className="fixed inset-0 z-[9990] overflow-hidden select-none"
            dir={isRTL ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            aria-label={resolveText(tourMetadata?.title, lang) || 'Interactive Tour'}
        >
            {/* ── 1. SPOTLIGHT CUTOUT MASK & BACKDROP ── */}
            {targetRect && !isPaused ? (
                <>
                    {/* SVG Cutout Mask */}
                    <svg className="fixed inset-0 w-full h-full pointer-events-none z-[9991]">
                        <defs>
                            <mask id="target-tour-spotlight-mask">
                                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                                <rect
                                    x={targetRect.x}
                                    y={targetRect.y}
                                    width={targetRect.width}
                                    height={targetRect.height}
                                    rx="14"
                                    ry="14"
                                    fill="black"
                                />
                            </mask>
                        </defs>
                        <rect
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            fill="rgba(15, 23, 42, 0.78)"
                            mask="url(#target-tour-spotlight-mask)"
                        />
                    </svg>

                    {/* Animated Accent Pulse Ring around target */}
                    <div
                        className="fixed z-[9992] rounded-2xl pointer-events-none ring-4 ring-primary/80 ring-offset-2 ring-offset-transparent shadow-[0_0_25px_rgba(0,80,212,0.45)] animate-pulse transition-all duration-300 ease-out"
                        style={{
                            top: `${targetRect.y}px`,
                            left: `${targetRect.x}px`,
                            width: `${targetRect.width}px`,
                            height: `${targetRect.height}px`
                        }}
                    />

                    {/* Transparent Click Interceptor Backdrop */}
                    <div
                        className="fixed inset-0 z-[9993] bg-transparent cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    />
                </>
            ) : (
                /* Fallback solid backdrop when element is missing or tour is paused */
                <div
                    className="fixed inset-0 z-[9991] bg-slate-900/80 backdrop-blur-xs transition-opacity duration-300"
                    onClick={(e) => e.stopPropagation()}
                />
            )}

            {/* ── 2. PAUSED STATE BANNER MODAL ── */}
            {isPaused ? (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
                    <div
                        className="bg-base-100 rounded-3xl border border-base-200/90 shadow-2xl max-w-md w-full p-6 text-center animate-in zoom-in-95 duration-200"
                        role="alertdialog"
                        aria-labelledby="tour-paused-title"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                            <span className="material-symbols-outlined text-3xl">pause_circle</span>
                        </div>

                        <h3 id="tour-paused-title" className="text-lg font-black text-base-content mb-1">
                            {lang === 'ar' ? 'تم إيقاف الجولة مؤقتاً' : 'Tour Walkthrough Paused'}
                        </h3>

                        <p className="text-xs text-base-content/70 leading-relaxed mb-4">
                            {lang === 'ar'
                                ? `تم حفظ تقدمك في الخطوة ${currentStepIndex + 1} من ${totalSteps}. يمكنك الاستئناف الآن أو إنهاء الجولة.`
                                : `Your progress is saved at Step ${currentStepIndex + 1} of ${totalSteps}. You can resume anytime or discard to exit.`}
                        </p>

                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={resumeTour}
                                className="btn btn-primary text-white font-bold gap-2 w-full shadow-sm"
                            >
                                <span className="material-symbols-outlined text-lg">play_arrow</span>
                                {lang === 'ar' ? 'استئناف الجولة' : 'Resume Walkthrough'}
                            </button>

                            <button
                                type="button"
                                onClick={dismissTour}
                                className="btn btn-ghost text-error/90 hover:bg-error/10 font-bold btn-sm w-full gap-1"
                            >
                                <span className="material-symbols-outlined text-base">close</span>
                                {lang === 'ar' ? 'إلغاء وإنهاء الجولة' : 'Discard & Exit Tour'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* ── 3. COLLISION-AWARE FLOATING POPOVER ── */
                currentStep && (
                    <aside
                        ref={popoverRef}
                        className="fixed z-[9995] bg-base-100 text-base-content rounded-2xl border border-base-200/90 shadow-2xl p-4 sm:p-5 flex flex-col transition-all duration-200 animate-in fade-in zoom-in-95"
                        style={positionInfo.style}
                        aria-label={`Step ${currentStepIndex + 1}: ${resolveText(currentStep.title, lang)}`}
                    >
                        {/* Directional pointer arrow */}
                        {!positionInfo.isCentered && positionInfo.placement === 'bottom' && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-base-100 border-t border-l border-base-200/90 pointer-events-none" />
                        )}
                        {!positionInfo.isCentered && positionInfo.placement === 'top' && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-base-100 border-b border-r border-base-200/90 pointer-events-none" />
                        )}
                        {!positionInfo.isCentered && positionInfo.placement === 'left' && (
                            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 rotate-45 bg-base-100 border-t border-r border-base-200/90 pointer-events-none" />
                        )}
                        {!positionInfo.isCentered && positionInfo.placement === 'right' && (
                            <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 rotate-45 bg-base-100 border-b border-l border-base-200/90 pointer-events-none" />
                        )}

                        {/* Popover Header */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="badge badge-primary badge-outline text-[10px] font-mono font-bold">
                                    {lang === 'ar' ? `الخطوة ${currentStepIndex + 1} من ${totalSteps}` : `Step ${currentStepIndex + 1} of ${totalSteps}`}
                                </span>
                                {currentStep.calloutBadge && (
                                    <span className="badge badge-sm font-bold bg-primary/10 text-primary border-primary/20 text-[10px]">
                                        {resolveText(currentStep.calloutBadge, lang)}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={pauseTour}
                                    className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-amber-500"
                                    title={lang === 'ar' ? 'إيقاف مؤقت وحفظ' : 'Pause Tour'}
                                    aria-label="Pause Tour"
                                >
                                    <span className="material-symbols-outlined text-base">pause</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={dismissTour}
                                    className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-error"
                                    title={lang === 'ar' ? 'إغلاق الجولة' : 'Close Tour'}
                                    aria-label="Close Tour"
                                >
                                    <span className="material-symbols-outlined text-base">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Popover Body */}
                        <div className="mb-3">
                            <h4 className="text-sm sm:text-base font-black text-base-content flex items-center gap-2 mb-1.5 leading-snug">
                                {currentStep.icon && (
                                    <span className="material-symbols-outlined text-primary text-lg shrink-0">
                                        {currentStep.icon}
                                    </span>
                                )}
                                <span>{resolveText(currentStep.title, lang)}</span>
                            </h4>

                            <p className="text-xs text-base-content/80 leading-relaxed mb-2.5">
                                {resolveText(currentStep.description, lang)}
                            </p>

                            {/* Contextual Accounting Hint */}
                            {currentStep.hint && (
                                <div className="bg-base-200/80 rounded-xl p-2.5 border border-base-300/60 flex items-start gap-2 text-[11px] text-base-content/75 mb-2">
                                    <span className="material-symbols-outlined text-primary text-sm shrink-0 mt-0.5">
                                        lightbulb
                                    </span>
                                    <span className="leading-snug">{resolveText(currentStep.hint, lang)}</span>
                                </div>
                            )}

                            {/* Fallback Notice when target DOM element is not mounted */}
                            {!targetRect && currentStep.requiredTab && (
                                <div className="bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs rounded-xl p-2.5 border border-amber-500/20 flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-base">info</span>
                                        <span>
                                            {lang === 'ar'
                                                ? `القسم المطلوب: ${currentStep.requiredTab}`
                                                : `Required tab: ${currentStep.requiredTab}`}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleTabRequired(currentStep.requiredTab)}
                                        className="btn btn-xs btn-primary text-white font-bold"
                                    >
                                        {lang === 'ar' ? 'تبديل التبويب' : 'Switch Tab'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Popover Footer: Progress bar + Action Controls */}
                        <div className="mt-auto pt-2 border-t border-base-200/90">
                            {/* Visual Progress Bar */}
                            <div className="w-full bg-base-200 rounded-full h-1 overflow-hidden mb-3">
                                <div
                                    className="bg-primary h-1 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                {/* Keyboard shortcut hints */}
                                <div className="text-[10px] text-base-content/50 font-mono hidden sm:inline-flex items-center gap-1">
                                    <kbd className="kbd kbd-xs">←</kbd>
                                    <kbd className="kbd kbd-xs">→</kbd>
                                    <span className="text-base-content/30">|</span>
                                    <kbd className="kbd kbd-xs">Esc</kbd>
                                </div>

                                {/* Navigation Action Buttons */}
                                <div className="flex items-center gap-1.5 ms-auto">
                                    <button
                                        type="button"
                                        onClick={prevStep}
                                        disabled={!hasPrev}
                                        className="btn btn-xs sm:btn-sm btn-ghost border border-base-300 font-bold gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">
                                            {isRTL ? 'arrow_forward' : 'arrow_back'}
                                        </span>
                                        <span>{lang === 'ar' ? 'السابق' : 'Previous'}</span>
                                    </button>

                                    {hasNext ? (
                                        <button
                                            type="button"
                                            onClick={nextStep}
                                            className="btn btn-xs sm:btn-sm btn-primary text-white font-bold gap-1 shadow-xs"
                                        >
                                            <span>{lang === 'ar' ? 'التالي' : 'Next'}</span>
                                            <span className="material-symbols-outlined text-sm">
                                                {isRTL ? 'arrow_back' : 'arrow_forward'}
                                            </span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={completeTour}
                                            className="btn btn-xs sm:btn-sm btn-success text-white font-bold gap-1 shadow-xs"
                                        >
                                            <span className="material-symbols-outlined text-sm">check_circle</span>
                                            <span>{lang === 'ar' ? 'إتمام الجولة' : 'Complete Tour'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </aside>
                )
            )}
        </div>
    );
};

FinancialWalkthroughTour.propTypes = {
    activeTour: PropTypes.string,
    isOpen: PropTypes.bool,
    onClose: PropTypes.func,
    onComplete: PropTypes.func,
    onStepChange: PropTypes.func,
    onTabRequired: PropTypes.func,
    onSwitchTab: PropTypes.func,
    storageKey: PropTypes.string,
    lang: PropTypes.oneOf(['en', 'ar']),
    isRTL: PropTypes.bool,
    tourHook: PropTypes.object
};

export default FinancialWalkthroughTour;
