import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../../context/LanguageContext';
import {
  FINANCIAL_GUIDES,
  FINANCIAL_CATEGORIES,
  getFilteredGuides
} from './financialGuidesContent';
import VisualFlowIndicator from './VisualFlowIndicator';
import AccountingDiagram from './AccountingDiagram';

/**
 * FinancialDocsHubDrawer
 * 
 * Comprehensive slide-over documentation and interactive guide viewer for the
 * Target Logistics 3PL Accounting module.
 * 
 * Features:
 * - Slide-over drawer with backdrop scrim
 * - Real-time search with clear button across titles, summaries, sections, and COA codes
 * - Category filter pills (All, Accounts Payable, Statements, Reports)
 * - Embedded Visual Flow Indicators & Vector Accounting Diagrams
 * - Expandable Standard Operating Procedures (SOP) & Checklists
 * - 1-Click Interactive Guided Walkthrough launchers
 * - Accessible modal dialog, keyboard Escape listener, bilingual (EN/AR) RTL support
 */
export const FinancialDocsHubDrawer = ({
  isOpen,
  onClose,
  initialCategory = 'all',
  onStartTour,
  lang: propLang,
  isRTL: propIsRTL,
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
    // Fallback outside LanguageProvider
  }
  lang = lang || 'en';
  isRTL = isRTL !== undefined ? isRTL : (lang === 'ar');

  // Search and Filter State
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState({});

  // Sync category when initialCategory changes upon drawer opening
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Handle Escape key to close drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Filtered guides based on category and search
  const filteredGuides = useMemo(() => {
    return getFilteredGuides(FINANCIAL_GUIDES, activeCategory, searchQuery, lang);
  }, [activeCategory, searchQuery, lang]);

  // Toggle expandable guide section
  const toggleSection = (guideId, sectionId) => {
    const key = `${guideId}_${sectionId}`;
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleLaunchTour = (tourId) => {
    if (onStartTour && tourId) {
      onStartTour(tourId);
      onClose?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end ${className}`}
      data-testid="financial-docs-hub-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="financial-docs-drawer-title"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Backdrop Scrim */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        data-testid="financial-docs-backdrop"
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-3xl lg:max-w-4xl bg-base-100 h-full shadow-2xl z-10 flex flex-col border-s border-base-200 animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-base-200 bg-base-100/95 backdrop-blur-sm shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-2xl">menu_book</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="financial-docs-drawer-title"
                  className="text-base sm:text-lg font-black text-base-content tracking-tight truncate"
                >
                  {lang === 'ar' ? 'دليل المحاسبة والوثائق الإرشادية' : 'Financial Documentation & Guides Hub'}
                </h2>
                <span className="badge badge-primary badge-xs font-mono font-bold">
                  {lang === 'ar' ? 'معايير تارجت 3PL' : '3PL SOP'}
                </span>
              </div>
              <p className="text-xs text-base-content/60 truncate mt-0.5">
                {lang === 'ar'
                  ? 'مرجع معتمد لمستحقات الموردين، القوائم المالية، ومطابقة الشحن وأمانات COD'
                  : 'Authoritative standards for AP, Double-Entry Statements, Carrier Audit, and COD Escrow'}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost btn-square text-base-content/60 hover:text-error hover:bg-error/10 shrink-0"
            aria-label={lang === 'ar' ? 'إغلاق الدليل' : 'Close documentation hub'}
            data-testid="financial-docs-close-btn"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-5 py-3 border-b border-base-200 bg-base-200/40 shrink-0 space-y-2.5">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
            {FINANCIAL_CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  type="button"
                  key={cat.id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`btn btn-xs rounded-full px-3 font-bold transition-all shrink-0 gap-1.5 ${
                    isSelected
                      ? 'btn-primary text-white shadow-xs'
                      : 'btn-ghost bg-base-100 border border-base-200 text-base-content/70 hover:bg-base-200'
                  }`}
                  data-testid={`category-filter-${cat.id}`}
                >
                  <span className="material-symbols-outlined text-[15px]">{cat.icon}</span>
                  <span>{cat.label[lang] || cat.label.en}</span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative">
            <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'ابحث في الحسابات (مثل 2010، 5010)، المطابقة الثلاثية، الميزانية، أو COD...'
                  : 'Search guides, account codes (e.g. 5010, 2010), 3-way match, statements, COD...'
              }
              className="input input-sm w-full ps-9 pe-9 bg-base-100 border-base-200 focus:border-primary rounded-xl text-xs"
              data-testid="financial-docs-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="btn btn-ghost btn-xs btn-square absolute end-1.5 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
                data-testid="financial-docs-clear-search-btn"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Guides Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-base-200/20">
          {filteredGuides.length === 0 ? (
            /* Empty State */
            <div
              className="p-8 sm:p-12 text-center bg-base-100 rounded-2xl border border-base-200 shadow-xs space-y-4"
              data-testid="financial-docs-empty-state"
            >
              <div className="w-14 h-14 rounded-2xl bg-base-200 text-base-content/40 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl">menu_book</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-base-content">
                  {lang === 'ar' ? 'لا توجد أدلة مطابقة للبحث' : 'No matching guides found'}
                </h3>
                <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                  {lang === 'ar'
                    ? `لم يتم العثور على نتائج للبحث عن "${searchQuery}". جرّب استخدام كلمات بحث أخرى أو امسح الفلتر.`
                    : `No results matching "${searchQuery}". Try searching for account codes (5010, 2010) or switch categories.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="btn btn-sm btn-ghost border border-base-200 font-bold"
              >
                {lang === 'ar' ? 'إعادة ضبط البحث والتصنيفات' : 'Reset Search & Categories'}
              </button>
            </div>
          ) : (
            filteredGuides.map((guide) => {
              const guideTitle = guide.title[lang] || guide.title.en;
              const guideSummary = guide.summary[lang] || guide.summary.en;
              const guideBadge = guide.badge ? (guide.badge[lang] || guide.badge.en) : null;

              return (
                <article
                  key={guide.id}
                  className="bg-base-100 rounded-2xl border border-base-200 shadow-sm p-4 sm:p-6 space-y-6 transition-all hover:border-base-300"
                  data-testid={`guide-card-${guide.id}`}
                >
                  {/* Guide Top Ribbon */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-base-200 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-xl">{guide.icon}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-black text-base-content">
                            {guideTitle}
                          </h3>
                          {guideBadge && (
                            <span className="badge badge-info badge-xs font-bold font-mono">
                              {guideBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-base-content/70 mt-1 leading-relaxed">
                          {guideSummary}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Walkthrough CTA Button */}
                    {guide.tourId && (
                      <button
                        type="button"
                        onClick={() => handleLaunchTour(guide.tourId)}
                        className="btn btn-sm btn-primary text-white gap-2 font-bold shadow-xs shrink-0 self-stretch sm:self-auto"
                        title={lang === 'ar' ? 'بدء الجولة التفاعلية' : 'Start interactive walkthrough'}
                        data-testid={`launch-tour-btn-${guide.id}`}
                      >
                        <span className="material-symbols-outlined text-base">explore</span>
                        <span>{lang === 'ar' ? 'بدء الجولة التفاعلية' : 'Launch Tour'}</span>
                      </button>
                    )}
                  </div>

                  {/* Key Accounts Pill Strip */}
                  {guide.keyAccounts && guide.keyAccounts.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] uppercase tracking-wider font-bold text-base-content/50 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">account_tree</span>
                        <span>
                          {lang === 'ar' ? 'الحسابات الرئيسية المرتبطة بدليل الحسابات' : 'Key Chart of Accounts (COA) References'}
                        </span>
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {guide.keyAccounts.map((acc) => (
                          <div
                            key={acc.code}
                            className="px-2.5 py-1 rounded-lg bg-base-200/60 border border-base-200 flex items-center gap-2 text-xs"
                            title={acc.description ? (acc.description[lang] || acc.description.en) : ''}
                          >
                            <span className="font-mono font-black text-primary">{acc.code}</span>
                            <span className="text-base-content/80 font-medium">
                              {acc.name[lang] || acc.name.en}
                            </span>
                            <span className="badge badge-ghost badge-xs font-mono text-[10px]">
                              {acc.drCrNormal || acc.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Embedded Visual Flow Indicator */}
                  {guide.flowSteps && guide.flowSteps.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase tracking-wider font-bold text-base-content/50 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">alt_route</span>
                        <span>
                          {lang === 'ar' ? 'مراحل ومسار دورة العمليات المحاسبية' : 'Standard Workflow Pipeline'}
                        </span>
                      </h4>
                      <VisualFlowIndicator
                        steps={guide.flowSteps}
                        lang={lang}
                        isRTL={isRTL}
                      />
                    </div>
                  )}

                  {/* Embedded Vector / CSS Diagram */}
                  {guide.diagramType && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase tracking-wider font-bold text-base-content/50 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">hub</span>
                        <span>
                          {lang === 'ar' ? 'المخطط التوضيحي للتدفق المالي' : 'Visual Accounting Flow Diagram'}
                        </span>
                      </h4>
                      <AccountingDiagram
                        diagramType={guide.diagramType}
                        lang={lang}
                        isRTL={isRTL}
                        interactive={true}
                      />
                    </div>
                  )}

                  {/* Expandable Standard Operating Procedure (SOP) Sections */}
                  {guide.sections && guide.sections.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase tracking-wider font-bold text-base-content/50 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">description</span>
                        <span>
                          {lang === 'ar' ? 'دليل الإجراءات التفصيلية والمعايير المحاسبية' : 'Detailed Operating Guidelines & Rules'}
                        </span>
                      </h4>
                      <div className="space-y-2">
                        {guide.sections.map((section) => {
                          const secKey = `${guide.id}_${section.id}`;
                          const isExpanded = expandedSections[secKey] !== false; // Default expanded for quick reference
                          const secHeading = section.heading[lang] || section.heading.en;
                          const secBody = section.body[lang] || section.body.en;

                          return (
                            <div
                              key={section.id}
                              className="border border-base-200 rounded-xl overflow-hidden bg-base-100"
                            >
                              <button
                                type="button"
                                onClick={() => toggleSection(guide.id, section.id)}
                                className="w-full px-4 py-2.5 bg-base-200/40 hover:bg-base-200/70 text-start flex items-center justify-between gap-2 text-xs sm:text-sm font-bold text-base-content transition-colors"
                              >
                                <span className="flex items-center gap-2">
                                  {section.icon && (
                                    <span className="material-symbols-outlined text-primary text-base">
                                      {section.icon}
                                    </span>
                                  )}
                                  <span>{secHeading}</span>
                                </span>
                                <span className="material-symbols-outlined text-base-content/50 text-base">
                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="p-4 space-y-3 text-xs leading-relaxed text-base-content/80 border-t border-base-200 bg-base-100">
                                  <p>{secBody}</p>

                                  {/* Bullet points */}
                                  {section.bulletPoints && section.bulletPoints.length > 0 && (
                                    <ul className="list-disc ps-5 space-y-1 text-base-content/70">
                                      {section.bulletPoints.map((bp, i) => (
                                        <li key={i}>{bp[lang] || bp.en}</li>
                                      ))}
                                    </ul>
                                  )}

                                  {/* Warning callout */}
                                  {section.warning && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                                      <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">
                                        warning
                                      </span>
                                      <span>{section.warning[lang] || section.warning.en}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Checklist & Verification Points */}
                  {guide.checklists && guide.checklists.length > 0 && (
                    <div className="space-y-2">
                      {guide.checklists.map((cl) => (
                        <div
                          key={cl.id}
                          className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2"
                        >
                          <h4 className="text-xs font-bold text-base-content flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-base">
                              checklist
                            </span>
                            <span>{cl.title[lang] || cl.title.en}</span>
                          </h4>
                          <ul className="space-y-1.5 text-xs text-base-content/80">
                            {cl.items.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="material-symbols-outlined text-primary text-sm shrink-0 mt-0.5">
                                  check_box
                                </span>
                                <span>{item[lang] || item.en}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Key Takeaways Card */}
                  {guide.keyTakeaways && guide.keyTakeaways.length > 0 && (
                    <div className="p-3.5 bg-base-200/50 rounded-xl border border-base-200 flex items-start gap-3">
                      <span className="material-symbols-outlined text-amber-500 text-xl shrink-0 mt-0.5">
                        lightbulb
                      </span>
                      <div className="space-y-1 text-xs">
                        <strong className="text-base-content font-bold">
                          {lang === 'ar' ? 'النقاط الجوهرية:' : 'Key Takeaways:'}
                        </strong>
                        <ul className="list-disc ps-4 space-y-0.5 text-base-content/70">
                          {guide.keyTakeaways.map((kt, i) => (
                            <li key={i}>{kt[lang] || kt.en}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-base-200 bg-base-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-base-content/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">verified</span>
            <span>
              {lang === 'ar'
                ? 'نظام تارجت اللوجستية المحاسبي - إصدار معتمد'
                : 'Target Logistics 3PL Financial Standards v2.4'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-ghost"
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

FinancialDocsHubDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialCategory: PropTypes.oneOf(['all', 'ap', 'statements', 'reports']),
  onStartTour: PropTypes.func,
  lang: PropTypes.oneOf(['en', 'ar']),
  isRTL: PropTypes.bool,
  className: PropTypes.string
};

export default FinancialDocsHubDrawer;
