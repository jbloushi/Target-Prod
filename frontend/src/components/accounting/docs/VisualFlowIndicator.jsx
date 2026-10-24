import React from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../../context/LanguageContext';

/**
 * Helper to extract localized string from either a string or { en, ar } dictionary
 */
const getLocalizedText = (value, lang = 'en') => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value[lang] || value.en || Object.values(value)[0] || '';
  }
  return String(value);
};

/**
 * VisualFlowIndicator
 * 
 * Renders a visual workflow step pipeline showing status (completed, active, pending),
 * step numbers, Material Symbols Outlined icons, titles, descriptions, and directional indicators.
 * Fully responsive with mobile stacking and RTL arrow flipping.
 */
export const VisualFlowIndicator = ({
  steps = [],
  currentStep,
  onStepClick,
  lang: propLang,
  isRTL: propIsRTL,
  orientation = 'horizontal',
  className = ''
}) => {
  // Defensive language resolution with context fallback
  let lang = propLang;
  let isRTL = propIsRTL;
  try {
    const langCtx = useLanguage();
    if (!lang && langCtx) lang = langCtx.lang;
    if (isRTL === undefined && langCtx) isRTL = langCtx.isRTL;
  } catch {
    // Graceful fallback outside LanguageProvider
  }
  lang = lang || 'en';
  isRTL = isRTL !== undefined ? isRTL : (lang === 'ar');

  const validSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (validSteps.length === 0) {
    return null;
  }

  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`w-full ${className}`}
      dir={isRTL ? 'rtl' : 'ltr'}
      data-testid="visual-flow-indicator"
    >
      <ol
        role="list"
        className={`w-full ${
          isVertical
            ? 'flex flex-col space-y-4'
            : 'grid grid-cols-1 md:grid-cols-' + Math.min(validSteps.length, 4) + ' gap-3 md:gap-2'
        }`}
      >
        {validSteps.map((stepItem, index) => {
          const stepNumber = stepItem.step !== undefined ? stepItem.step : index + 1;
          
          // Determine status
          let status = stepItem.status;
          if (!status && currentStep !== undefined) {
            if (stepNumber < currentStep) {
              status = 'completed';
            } else if (stepNumber === currentStep) {
              status = 'active';
            } else {
              status = 'pending';
            }
          } else if (!status) {
            // Default to completed for earlier, active for currentStep if omitted
            status = 'active';
          }

          const isCompleted = status === 'completed';
          const isActive = status === 'active';
          const isPending = status === 'pending';
          const isClickable = Boolean(onStepClick);
          const isLast = index === validSteps.length - 1;

          const title = getLocalizedText(stepItem.title, lang);
          const description = getLocalizedText(stepItem.description, lang);
          const icon = stepItem.icon || (isCompleted ? 'check' : 'circle');

          // Styling tokens based on status
          let badgeClass = 'bg-base-200 text-base-content/60 border-base-300';
          let borderClass = 'border-base-200';
          let textTitleClass = 'text-base-content/80';

          if (isCompleted) {
            badgeClass = 'bg-emerald-500 text-white shadow-xs';
            borderClass = 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20';
            textTitleClass = 'text-emerald-700 dark:text-emerald-300 font-bold';
          } else if (isActive) {
            badgeClass = 'bg-primary text-primary-content shadow-md ring-4 ring-primary/20';
            borderClass = 'border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-xs';
            textTitleClass = 'text-primary font-bold';
          } else if (isPending) {
            badgeClass = 'bg-base-200 text-base-content/40 border-base-300';
            borderClass = 'border-base-200 bg-base-100/50 opacity-80';
            textTitleClass = 'text-base-content/60';
          }

          return (
            <li
              key={stepItem.step || index}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              className={`relative flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 ${borderClass} ${
                isClickable ? 'cursor-pointer hover:border-primary/60 hover:shadow-sm' : ''
              }`}
              onClick={() => isClickable && onStepClick(stepNumber)}
              data-testid={`flow-step-${stepNumber}`}
              data-status={status}
            >
              {/* Top Row: Step Number Badge + Icon + Connector indicator */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-black ${badgeClass}`}
                  >
                    {isCompleted ? (
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    ) : (
                      stepNumber
                    )}
                  </span>
                  {icon && (
                    <span
                      className={`material-symbols-outlined text-lg ${
                        isActive
                          ? 'text-primary'
                          : isCompleted
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-base-content/40'
                      }`}
                    >
                      {icon}
                    </span>
                  )}
                </div>

                {/* Status pill & directional indicator */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                      isCompleted
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : isActive
                        ? 'bg-primary/15 text-primary'
                        : 'bg-base-200 text-base-content/50'
                    }`}
                  >
                    {isCompleted
                      ? lang === 'ar' ? 'مكتمل' : 'Done'
                      : isActive
                      ? lang === 'ar' ? 'الحالي' : 'Active'
                      : lang === 'ar' ? 'قادم' : 'Pending'}
                  </span>

                  {!isLast && !isVertical && (
                    <span
                      className="material-symbols-outlined text-base-content/30 text-sm hidden md:inline-block rtl:rotate-180"
                      aria-hidden="true"
                    >
                      arrow_forward
                    </span>
                  )}
                </div>
              </div>

              {/* Step Title */}
              <h4 className={`text-xs sm:text-sm font-semibold tracking-tight leading-snug ${textTitleClass}`}>
                {title}
              </h4>

              {/* Step Description */}
              {description && (
                <p className="text-[11px] sm:text-xs text-base-content/70 leading-relaxed mt-1 line-clamp-3">
                  {description}
                </p>
              )}

              {/* Bottom connector indicator for vertical orientation */}
              {!isLast && isVertical && (
                <div className="flex justify-center my-1" aria-hidden="true">
                  <span className="material-symbols-outlined text-base-content/30 text-sm">
                    arrow_downward
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

VisualFlowIndicator.propTypes = {
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      step: PropTypes.number,
      title: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
      description: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
      icon: PropTypes.string,
      status: PropTypes.oneOf(['completed', 'active', 'pending'])
    })
  ).isRequired,
  currentStep: PropTypes.number,
  onStepClick: PropTypes.func,
  lang: PropTypes.string,
  isRTL: PropTypes.bool,
  orientation: PropTypes.oneOf(['horizontal', 'vertical']),
  className: PropTypes.string
};

export default VisualFlowIndicator;
