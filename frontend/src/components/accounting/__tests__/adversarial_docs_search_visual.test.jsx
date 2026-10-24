import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import {
  FinancialDocsHubDrawer,
  VisualFlowIndicator,
  AccountingDiagram,
  FINANCIAL_GUIDES,
  FINANCIAL_CATEGORIES,
  getFilteredGuides
} from '../docs';
import {
  setupDomMocks,
  renderWithProviders
} from './e2e/test_helpers';

describe('Adversarial Challenger: Financial Docs Hub, Search & Visual Resilience', () => {
  let restoreDomMocks;

  beforeEach(() => {
    restoreDomMocks = setupDomMocks();
  });

  afterEach(() => {
    if (restoreDomMocks) restoreDomMocks();
    vi.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 1: Edge-Case Searches (Adversarial, Regex, Unicode, Stress)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Dimension 1: Edge-Case Searches & Adversarial Text Inputs', () => {
    const adversarialQueries = [
      { name: 'Regex wildcard token', query: '.*' },
      { name: 'Regex character class', query: '[a-z]+' },
      { name: 'Regex nested repetition (ReDoS probe)', query: '(a+)+$' },
      { name: 'Regex lookbehind assertion', query: '(?<=abc)' },
      { name: 'Regex digits quantifier', query: '\\d{4}' },
      { name: 'Regex anchor tokens', query: '^Accounts$' },
      { name: 'Null byte injection', query: '5010\0AP' },
      { name: 'HTML script tag injection (XSS probe)', query: '<script>alert(1)</script>' },
      { name: 'SQL injection signature probe', query: "' OR '1'='1' --" },
      { name: 'Template string expression', query: '${process.env.NODE_ENV}' },
      { name: 'Angular/Vue SSTI interpolation', query: '{{constructor.constructor("return 1")()}}' },
      { name: 'Punctuation & metacharacters soup', query: '!@#$%^&*()_+-=[]{}|;:",.<>?/`~' },
      { name: 'Literal undefined string', query: 'undefined' },
      { name: 'Literal null string', query: 'null' },
      { name: 'Literal Object string', query: '[object Object]' },
      { name: 'Literal NaN string', query: 'NaN' }
    ];

    adversarialQueries.forEach(({ name, query }) => {
      it(`does not crash or throw on ${name}: "${query}"`, () => {
        expect(() => {
          const results = getFilteredGuides(FINANCIAL_GUIDES, 'all', query, 'en');
          expect(Array.isArray(results)).toBe(true);
        }).not.toThrow();

        // Also test through the UI component
        renderWithProviders(
          <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
        );

        const searchInput = screen.getByTestId('financial-docs-search-input');
        expect(() => {
          fireEvent.change(searchInput, { target: { value: query } });
        }).not.toThrow();

        // Either guide cards or empty state is rendered
        const hasCards = screen.queryAllByTestId(/guide-card-/).length > 0;
        const hasEmpty = screen.queryByTestId('financial-docs-empty-state') !== null;
        expect(hasCards || hasEmpty).toBe(true);
      });
    });

    it('stress-tests extreme string lengths (1,000 to 10,000 characters) without hanging', () => {
      const longQueries = [
        'A'.repeat(1000),
        '5010 '.repeat(200),
        'X'.repeat(10000),
        'Reconciliation '.repeat(1000)
      ];

      longQueries.forEach((longQuery) => {
        const start = performance.now();
        const results = getFilteredGuides(FINANCIAL_GUIDES, 'all', longQuery, 'en');
        const duration = performance.now() - start;

        expect(Array.isArray(results)).toBe(true);
        // Must complete instantaneously (< 150ms)
        expect(duration).toBeLessThan(150);
      });
    });

    it('handles Arabic diacritics (tashkeel / harakat) gracefully', () => {
      // Query with harakat: المُطَابَقَة
      const resultsWithTashkeel = getFilteredGuides(FINANCIAL_GUIDES, 'all', 'المُطَابَقَة', 'ar');
      expect(Array.isArray(resultsWithTashkeel)).toBe(true);

      // Query without harakat: المطابقة
      const resultsStandard = getFilteredGuides(FINANCIAL_GUIDES, 'all', 'المطابقة', 'ar');
      expect(resultsStandard.length).toBeGreaterThanOrEqual(1);
    });

    it('handles Arabic-Indic eastern numerals (٥٠١٠) without crashing', () => {
      expect(() => {
        const results = getFilteredGuides(FINANCIAL_GUIDES, 'all', '٥٠١٠', 'ar');
        expect(Array.isArray(results)).toBe(true);
      }).not.toThrow();
    });

    it('handles zero-width characters and directional Unicode marks safely', () => {
      const trickyUnicode = [
        '\u200B5010\u200B', // zero-width space
        '\uFEFF5010',       // byte order mark
        '\u200E5010\u200F', // LTR and RTL marks
        '5010\u00A0AP',     // non-breaking space
        '📦 🚚 💰 ✨ 🔥',   // emojis
        '\uD83D\uDCA9'      // surrogate pair
      ];

      trickyUnicode.forEach((str) => {
        expect(() => {
          const results = getFilteredGuides(FINANCIAL_GUIDES, 'all', str, 'en');
          expect(Array.isArray(results)).toBe(true);
        }).not.toThrow();
      });
    });

    it('handles mixed RTL and LTR search tokens gracefully', () => {
      const mixedQuery = '5010 تكلفة الشحن Direct Freight';
      expect(() => {
        const results = getFilteredGuides(FINANCIAL_GUIDES, 'all', mixedQuery, 'ar');
        expect(Array.isArray(results)).toBe(true);
      }).not.toThrow();
    });

    it('handles string/null/undefined search queries safely in getFilteredGuides', () => {
      expect(() => getFilteredGuides(FINANCIAL_GUIDES, 'all', null)).not.toThrow();
      expect(() => getFilteredGuides(FINANCIAL_GUIDES, 'all', undefined)).not.toThrow();
      expect(() => getFilteredGuides(FINANCIAL_GUIDES, 'all', '')).not.toThrow();
    });

    it('handles numeric search queries (e.g. 5010) safely and returns matching guides', () => {
      expect(() => {
        const results = getFilteredGuides(FINANCIAL_GUIDES, 'all', 5010);
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((g) => g.keyAccounts?.some((a) => a.code === '5010'))).toBe(true);
      }).not.toThrow();
    });

    it('evaluates behavior when non-array guides parameter is passed', () => {
      expect(getFilteredGuides(null)).toEqual([]);
      expect(getFilteredGuides(undefined)).toEqual([]);
      expect(getFilteredGuides('not an array')).toEqual([]);
      expect(getFilteredGuides(12345)).toEqual([]);
      expect(getFilteredGuides({})).toEqual([]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 2: Category Filtering Robustness, Rapid Switching & UI States
  // ══════════════════════════════════════════════════════════════════════════
  describe('Dimension 2: Category Filtering, Rapid Switching & Navigation', () => {
    it('supports rapid switching between categories repeatedly without UI state desync', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const allPill = screen.getByTestId('category-filter-all');
      const apPill = screen.getByTestId('category-filter-ap');
      const statementsPill = screen.getByTestId('category-filter-statements');
      const reportsPill = screen.getByTestId('category-filter-reports');

      // Rapidly switch 40 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(apPill);
        expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
        expect(screen.queryByTestId('guide-card-financial-statements')).not.toBeInTheDocument();
        expect(screen.queryByTestId('guide-card-financial-reports')).not.toBeInTheDocument();

        fireEvent.click(statementsPill);
        expect(screen.queryByTestId('guide-card-accounts-payable')).not.toBeInTheDocument();
        expect(screen.getByTestId('guide-card-financial-statements')).toBeInTheDocument();
        expect(screen.queryByTestId('guide-card-financial-reports')).not.toBeInTheDocument();

        fireEvent.click(reportsPill);
        expect(screen.queryByTestId('guide-card-accounts-payable')).not.toBeInTheDocument();
        expect(screen.queryByTestId('guide-card-financial-statements')).not.toBeInTheDocument();
        expect(screen.getByTestId('guide-card-financial-reports')).toBeInTheDocument();

        fireEvent.click(allPill);
        expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
        expect(screen.getByTestId('guide-card-financial-statements')).toBeInTheDocument();
        expect(screen.getByTestId('guide-card-financial-reports')).toBeInTheDocument();
      }
    });

    it('interacts category filter with active search and verifies empty state isolation', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      const statementsPill = screen.getByTestId('category-filter-statements');
      const apPill = screen.getByTestId('category-filter-ap');

      // Search for '3-Way Match' (AP-specific)
      fireEvent.change(searchInput, { target: { value: '3-Way Match' } });
      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();

      // Now switch category to 'Statements' -> AP guide is excluded by category -> Empty State!
      fireEvent.click(statementsPill);
      expect(screen.getByTestId('financial-docs-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('guide-card-accounts-payable')).not.toBeInTheDocument();

      // Switch category back to 'AP' -> guide is visible again!
      fireEvent.click(apPill);
      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
      expect(screen.queryByTestId('financial-docs-empty-state')).not.toBeInTheDocument();
    });

    it('verifies "Reset Search & Categories" button restores full catalog from empty state', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      const apPill = screen.getByTestId('category-filter-ap');

      fireEvent.click(apPill);
      fireEvent.change(searchInput, { target: { value: 'nonexistentquery123' } });

      const emptyState = screen.getByTestId('financial-docs-empty-state');
      expect(emptyState).toBeInTheDocument();

      // Click Reset Search & Categories button
      const resetBtn = screen.getByRole('button', { name: /Reset Search & Categories|إعادة ضبط/i });
      fireEvent.click(resetBtn);

      // Verify all 3 guides are back and search input is cleared
      expect(screen.queryByTestId('financial-docs-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
      expect(screen.getByTestId('guide-card-financial-statements')).toBeInTheDocument();
      expect(screen.getByTestId('guide-card-financial-reports')).toBeInTheDocument();
      expect(searchInput.value).toBe('');
    });

    it('verifies SOP accordion collapses on FIRST click and toggles properly on subsequent clicks', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      // In accounts-payable guide, find section 1 button
      const sectionHeaderBtn = screen.getByRole('button', {
        name: /1\. Carrier Direct Liabilities vs\. Trade Vendor Bills/i
      });
      expect(sectionHeaderBtn).toBeInTheDocument();
      expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'true');

      // Section body is visible on initial render (default expanded)
      const targetBodyText = /Target Logistics handles two distinct accounts payable tracks/i;
      expect(screen.getByText(targetBodyText)).toBeInTheDocument();

      // CLICK 1: Collapses immediately on 1st click
      fireEvent.click(sectionHeaderBtn);
      expect(screen.queryByText(targetBodyText)).not.toBeInTheDocument();
      expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'false');

      // CLICK 2: Expands again on 2nd click
      fireEvent.click(sectionHeaderBtn);
      expect(screen.getByText(targetBodyText)).toBeInTheDocument();
      expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'true');

      // CLICK 3: Collapses again on 3rd click
      fireEvent.click(sectionHeaderBtn);
      expect(screen.queryByText(targetBodyText)).not.toBeInTheDocument();
      expect(sectionHeaderBtn).toHaveAttribute('aria-expanded', 'false');
    });

    it('launches interactive tours for each guide with exact tour IDs', () => {
      const onStartTour = vi.fn();
      const onClose = vi.fn();

      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={onClose}
          onStartTour={onStartTour}
        />
      );

      // AP Tour
      const apTourBtn = screen.getByTestId('launch-tour-btn-accounts-payable');
      fireEvent.click(apTourBtn);
      expect(onStartTour).toHaveBeenCalledWith('TOUR_ACCOUNTS_PAYABLE');
      expect(onClose).toHaveBeenCalled();

      // Statements Tour
      const statementsTourBtn = screen.getByTestId('launch-tour-btn-financial-statements');
      fireEvent.click(statementsTourBtn);
      expect(onStartTour).toHaveBeenCalledWith('TOUR_FINANCIAL_STATEMENTS');

      // Reports Tour
      const reportsTourBtn = screen.getByTestId('launch-tour-btn-financial-reports');
      fireEvent.click(reportsTourBtn);
      expect(onStartTour).toHaveBeenCalledWith('TOUR_FINANCIAL_REPORTS');
    });

    it('locks body overflow when open and restores on unmount or close', () => {
      const originalOverflow = document.body.style.overflow;

      const { unmount } = renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).toBe(originalOverflow);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DIMENSION 3: Visual Diagram Resilience (Null/Invalid Props, Zero States)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Dimension 3: Visual Diagram & Flow Indicator Resilience', () => {
    it('handles invalid and null diagramType in AccountingDiagram without throwing', () => {
      const invalidTypes = [
        'INVALID_TYPE_XYZ',
        null,
        undefined,
        '',
        12345,
        {},
        [],
        'three_way_match_lowercase'
      ];

      invalidTypes.forEach((diagType) => {
        expect(() => {
          const { container } = render(
            <AccountingDiagram diagramType={diagType} />
          );
          const diagramEl = container.querySelector('[data-testid="accounting-diagram"]');
          expect(diagramEl).toBeInTheDocument();
        }).not.toThrow();
      });
    });

    it('renders all 4 valid AccountingDiagram types cleanly', () => {
      const validTypes = [
        'THREE_WAY_MATCH',
        'ACCOUNTING_EQUATION',
        'COD_FIDUCIARY_LIFECYCLE',
        'T_ACCOUNT'
      ];

      validTypes.forEach((diagType) => {
        const { container } = render(
          <AccountingDiagram diagramType={diagType} lang="en" />
        );
        const diagramEl = container.querySelector('[data-testid="accounting-diagram"]');
        expect(diagramEl).toBeInTheDocument();
        expect(diagramEl.children.length).toBeGreaterThan(0);
      });
    });

    it('stress-tests interactive drilldown selection and dismissal across all account cards in ACCOUNTING_EQUATION', () => {
      render(
        <AccountingDiagram diagramType="ACCOUNTING_EQUATION" lang="en" interactive={true} />
      );

      const accountCodes = [
        '1010', '1020', '1030', '1100', '1150', // Assets
        '2010', '2020', '2100',                 // Liabilities
        '3010', '3020'                          // Equity
      ];

      accountCodes.forEach((code) => {
        const cardBtn = screen.getByText(code).closest('button');
        expect(cardBtn).toBeInTheDocument();
        fireEvent.click(cardBtn);

        // Verify drilldown card opened with the selected account
        const dismissBtn = screen.getByLabelText(/Dismiss account drilldown/i);
        expect(dismissBtn).toBeInTheDocument();

        // Dismiss drilldown
        fireEvent.click(dismissBtn);
        expect(screen.queryByLabelText(/Dismiss account drilldown/i)).not.toBeInTheDocument();
      });
    });

    it('respects interactive={false} in AccountingDiagram and ignores card clicks', () => {
      render(
        <AccountingDiagram diagramType="ACCOUNTING_EQUATION" lang="en" interactive={false} />
      );

      const code1010Btn = screen.getByText('1010').closest('button');
      fireEvent.click(code1010Btn);

      // Drilldown card should NOT appear
      expect(screen.queryByLabelText(/Dismiss account drilldown/i)).not.toBeInTheDocument();
    });

    it('handles non-array inputs to VisualFlowIndicator safely by returning null', () => {
      const nonArrayCases = [
        null,
        undefined,
        [],
        'not an array',
        12345,
        {}
      ];

      nonArrayCases.forEach((stepsVal) => {
        expect(() => {
          const { container } = render(
            <VisualFlowIndicator steps={stepsVal} />
          );
          expect(container.firstChild).toBeNull();
        }).not.toThrow();
      });
    });

    it('handles steps with null or undefined elements safely by filtering them', () => {
      expect(() => {
        const { container: c1 } = render(<VisualFlowIndicator steps={[null]} />);
        expect(c1.firstChild).toBeNull();
      }).not.toThrow();

      expect(() => {
        const { container: c2 } = render(<VisualFlowIndicator steps={[undefined]} />);
        expect(c2.firstChild).toBeNull();
      }).not.toThrow();

      expect(() => {
        const { container: c3 } = render(
          <VisualFlowIndicator steps={[null, { step: 1, title: 'Step 1' }, undefined]} />
        );
        expect(c3.querySelector('[data-testid="flow-step-1"]')).toBeInTheDocument();
      }).not.toThrow();
    });

    it('renders VisualFlowIndicator with step items missing title, description, or icons', () => {
      const incompleteSteps = [
        { step: 1 },
        { step: 2, title: null, description: null },
        { step: 3, title: 12345, description: 67890 }, // numeric title/description
        { step: 4, title: { en: 'Step 4' }, icon: null }
      ];

      expect(() => {
        render(<VisualFlowIndicator steps={incompleteSteps} />);
      }).not.toThrow();

      expect(screen.getByTestId('flow-step-1')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-2')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-3')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-4')).toBeInTheDocument();
    });

    it('handles out-of-bound currentStep values (-100, 0, 9999) safely in VisualFlowIndicator', () => {
      const sampleSteps = [
        { step: 1, title: 'Step 1' },
        { step: 2, title: 'Step 2' },
        { step: 3, title: 'Step 3' }
      ];

      [-100, 0, 9999].forEach((curr) => {
        expect(() => {
          render(<VisualFlowIndicator steps={sampleSteps} currentStep={curr} />);
        }).not.toThrow();
      });
    });

    it('renders VisualFlowIndicator in vertical orientation and handles orientation edge cases', () => {
      const sampleSteps = [
        { step: 1, title: 'Step 1' },
        { step: 2, title: 'Step 2' }
      ];

      const { container } = render(
        <VisualFlowIndicator steps={sampleSteps} orientation="vertical" />
      );

      const list = container.querySelector('ol');
      expect(list.className).toContain('flex-col');
    });

    it('handles extreme aspect ratios and container dimensions without throwing', () => {
      // Test narrow mobile simulation (320px)
      const { container: mobileContainer } = render(
        <div style={{ width: '320px', height: '600px' }}>
          <AccountingDiagram diagramType="THREE_WAY_MATCH" />
          <AccountingDiagram diagramType="ACCOUNTING_EQUATION" />
          <AccountingDiagram diagramType="COD_FIDUCIARY_LIFECYCLE" />
        </div>
      );
      expect(mobileContainer.querySelectorAll('[data-testid="accounting-diagram"]').length).toBe(3);

      // Test ultra-wide desktop simulation (3840px)
      const { container: wideContainer } = render(
        <div style={{ width: '3840px', height: '2160px' }}>
          <AccountingDiagram diagramType="THREE_WAY_MATCH" />
          <AccountingDiagram diagramType="ACCOUNTING_EQUATION" />
          <AccountingDiagram diagramType="COD_FIDUCIARY_LIFECYCLE" />
        </div>
      );
      expect(wideContainer.querySelectorAll('[data-testid="accounting-diagram"]').length).toBe(3);
    });
  });
});
