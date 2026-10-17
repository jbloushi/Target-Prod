import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import LanguageContext from '../../../../context/LanguageContext';

// Export Docs components and data
export { default as FinancialDocsHubDrawer } from '../../docs/FinancialDocsHubDrawer';
export { default as VisualFlowIndicator } from '../../docs/VisualFlowIndicator';
export { default as AccountingDiagram } from '../../docs/AccountingDiagram';
export {
  FINANCIAL_GUIDES,
  FINANCIAL_CATEGORIES,
  getFilteredGuides
} from '../../docs/financialGuidesContent';

// Export Tour components, hooks, and steps
export { default as FinancialWalkthroughTour } from '../../tour/FinancialWalkthroughTour';
export { default as useFinancialTour } from '../../tour/useFinancialTour';
export {
  TOUR_IDS,
  TOUR_ALIASES,
  FINANCIAL_TOUR_CONFIGS,
  FINANCIAL_TOUR_METADATA,
  AP_TOUR_STEPS,
  STATEMENTS_TOUR_STEPS,
  REPORTS_TOUR_STEPS,
  FULL_FINANCE_TOUR_STEPS,
  getTourSteps,
  getTourMetadata
} from '../../tour/financialTourSteps';

export const ALL_TOUR_LANDMARKS = [
  'finance-header',
  'finance-suite-selector',
  'ap-kpi-outstanding',
  'ap-kpi-bar',
  'ap-kpi-settled',
  'ap-action-3way-match',
  'ap-btn-3way-match',
  'ap-action-new-bill',
  'ap-btn-new-bill',
  'ap-bills-table',
  'ap-table-bills',
  'ap-action-disburse',
  'ap-btn-pay',
  'statements-type-selector',
  'statements-selector',
  'statements-date-filter',
  'statements-date-controls',
  'statements-kpis',
  'statements-equation-check',
  'statements-equation-kpi',
  'statements-assets-card',
  'statements-liabilities-card',
  'statements-pnl-breakdown',
  'reports-subnav',
  'reports-nav-tabs',
  'reports-profitability-kpi',
  'reports-profitability-summary',
  'reports-recon-uploader',
  'reports-reconciliation-upload',
  'reports-cod-clearing',
  'reports-export-actions'
];

/**
 * Injects a realistic DOM structure containing all semantic data-tour landmarks
 * so that tour step queries and spotlight positioning find real elements.
 */
export function setupFinanceDomLandmarks() {
  cleanupFinanceDomLandmarks();

  const container = document.createElement('div');
  container.id = 'finance-dom-landmarks-root';

  ALL_TOUR_LANDMARKS.forEach((landmark) => {
    const el = document.createElement('div');
    el.setAttribute('data-tour', landmark);
    el.className = `mock-landmark-${landmark}`;
    el.textContent = `Landmark for ${landmark}`;
    container.appendChild(el);
  });

  document.body.appendChild(container);
  return container;
}

/**
 * Cleans up injected DOM landmarks
 */
export function cleanupFinanceDomLandmarks() {
  const root = document.getElementById('finance-dom-landmarks-root');
  if (root && root.parentNode) {
    root.parentNode.removeChild(root);
  }
}

/**
 * Mocks Element.prototype.getBoundingClientRect and Element.prototype.scrollIntoView
 * so that JSDOM returns non-zero dimensions and doesn't crash on smooth scrolling.
 */
export function setupDomMocks() {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  Element.prototype.getBoundingClientRect = function () {
    return {
      top: 120,
      left: 100,
      bottom: 220,
      right: 380,
      width: 280,
      height: 100,
      x: 100,
      y: 120,
      toJSON: () => {}
    };
  };

  Element.prototype.scrollIntoView = vi.fn();

  return () => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    Element.prototype.scrollIntoView = originalScrollIntoView;
  };
}

/**
 * Clears localStorage entries created during tour walkthroughs
 */
export function clearTourStorage(customKeys = []) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('target_finance_tour_state');
      window.localStorage.removeItem('target_tour_ap_tour');
      window.localStorage.removeItem('target_tour_statements_tour');
      window.localStorage.removeItem('target_tour_reports_tour');
      window.localStorage.removeItem('target_tour_full_finance_tour');
      customKeys.forEach((key) => window.localStorage.removeItem(key));
    }
  } catch {
    // Ignore in tests
  }
}

/**
 * Custom render function that optionally injects LanguageContext
 */
export function renderWithProviders(
  ui,
  {
    lang = 'en',
    isRTL = false,
    t = (k, fallback) => fallback || k,
    formatRoute = (p) => p,
    ...renderOptions
  } = {}
) {
  const contextValue = {
    lang,
    isRTL,
    t,
    formatRoute
  };

  const Wrapper = ({ children }) => (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
