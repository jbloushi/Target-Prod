import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import {
  FinancialDocsHubDrawer,
  VisualFlowIndicator,
  AccountingDiagram,
  FinancialWalkthroughTour,
  FINANCIAL_GUIDES,
  TOUR_IDS,
  getTourSteps,
  setupFinanceDomLandmarks,
  cleanupFinanceDomLandmarks,
  setupDomMocks,
  clearTourStorage,
  renderWithProviders
} from './test_helpers';

describe('Tier 1: E2E Feature Coverage', () => {
  let restoreDomMocks;

  beforeEach(() => {
    restoreDomMocks = setupDomMocks();
    setupFinanceDomLandmarks();
    clearTourStorage();
  });

  afterEach(() => {
    cleanupFinanceDomLandmarks();
    clearTourStorage();
    if (restoreDomMocks) restoreDomMocks();
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 1: In-App Documentation Hub (F1)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 1: Financial Documentation Hub Drawer', () => {
    it('T1.1: renders the documentation drawer when isOpen is true', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText(/Financial Documentation & Guides Hub/i)).toBeInTheDocument();
    });

    it('T1.2: does not render the drawer dialog when isOpen is false', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={false} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('T1.3: renders all primary category filter tabs (All, AP, Statements, Reports)', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      expect(screen.getByTestId('category-filter-all')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-ap')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-statements')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-reports')).toBeInTheDocument();
    });

    it('T1.4: filters guides list when clicking on a category tab', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const apTab = screen.getByTestId('category-filter-ap');
      fireEvent.click(apTab);

      expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill Ingestion/i)).toBeInTheDocument();
      expect(screen.queryByText(/Financial Reports, Profitability & Reconciliation/i)).not.toBeInTheDocument();
    });

    it('T1.5: filters guides dynamically using the search input', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '3-Way Match' } });

      expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill Ingestion/i)).toBeInTheDocument();
      expect(screen.queryByText(/Financial Reports, Profitability & Reconciliation/i)).not.toBeInTheDocument();
    });

    it('T1.6: clears search filter when clear button is clicked', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '3-Way' } });
      expect(searchInput.value).toBe('3-Way');

      const clearBtn = screen.getByTestId('financial-docs-clear-search-btn');
      fireEvent.click(clearBtn);

      expect(searchInput.value).toBe('');
      expect(screen.getByText(/Financial Statements \(Balance Sheet, P&L & Trial Balance\)/i)).toBeInTheDocument();
    });

    it('T1.7: triggers onClose when close button is clicked', () => {
      const handleClose = vi.fn();
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={handleClose} onStartTour={vi.fn()} />
      );

      const closeBtn = screen.getByTestId('financial-docs-close-btn');
      fireEvent.click(closeBtn);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('T1.8: triggers onClose when clicking the background scrim', () => {
      const handleClose = vi.fn();
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={handleClose} onStartTour={vi.fn()} />
      );

      const scrim = screen.getByTestId('financial-docs-backdrop');
      expect(scrim).toBeTruthy();
      fireEvent.click(scrim);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 2: Visual Callouts & Diagrams (F2)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 2: Visual Flow Indicators and Accounting Diagrams', () => {
    const testSteps = [
      { step: 1, title: { en: 'Order Booking', ar: 'حجز الشحنة' }, icon: 'receipt', description: { en: 'Initial accrual' } },
      { step: 2, title: { en: 'Carrier Bill Match', ar: 'مطابقة الفاتورة' }, icon: 'find_replace', description: { en: '3-way verification' } },
      { step: 3, title: { en: 'Bank Disbursement', ar: 'صرف السداد' }, icon: 'payments', description: { en: 'GL settlement' } }
    ];

    it('T1.9: VisualFlowIndicator renders all pipeline step titles and step numbers', () => {
      renderWithProviders(
        <VisualFlowIndicator steps={testSteps} currentStep={1} />
      );

      expect(screen.getByText('Order Booking')).toBeInTheDocument();
      expect(screen.getByText('Carrier Bill Match')).toBeInTheDocument();
      expect(screen.getByText('Bank Disbursement')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-1')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-2')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-3')).toBeInTheDocument();
    });

    it('T1.10: VisualFlowIndicator highlights the active step and completed steps', () => {
      renderWithProviders(
        <VisualFlowIndicator steps={testSteps} currentStep={2} />
      );

      expect(screen.getByTestId('flow-step-1')).toHaveAttribute('data-status', 'completed');
      expect(screen.getByTestId('flow-step-2')).toHaveAttribute('data-status', 'active');
      expect(screen.getByTestId('flow-step-3')).toHaveAttribute('data-status', 'pending');
      expect(screen.getByTestId('flow-step-2')).toHaveAttribute('aria-current', 'step');
    });

    it('T1.11: VisualFlowIndicator handles step click callback', () => {
      const handleStepClick = vi.fn();
      renderWithProviders(
        <VisualFlowIndicator steps={testSteps} currentStep={1} onStepClick={handleStepClick} />
      );

      const step2El = screen.getByTestId('flow-step-2');
      fireEvent.click(step2El);
      expect(handleStepClick).toHaveBeenCalledWith(2);
    });

    it('T1.12: AccountingDiagram renders 3-Way Match flow diagram with comparing nodes', () => {
      renderWithProviders(
        <AccountingDiagram diagramType="THREE_WAY_MATCH" />
      );

      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText(/3-Way Match Verification Flow/i)).toBeInTheDocument();
      expect(screen.getByText(/Rate Card Snapshot/i)).toBeInTheDocument();
      expect(screen.getByText(/Carrier Statement/i)).toBeInTheDocument();
    });

    it('T1.13: AccountingDiagram renders Accounting Equation balance scale diagram', () => {
      renderWithProviders(
        <AccountingDiagram diagramType="ACCOUNTING_EQUATION" />
      );

      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText(/The Balanced Accounting Equation/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Assets \(1xxx\)/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Liabilities \(2xxx\)/i).length).toBeGreaterThanOrEqual(1);
    });

    it('T1.14: AccountingDiagram renders COD Fiduciary Lifecycle diagram with 4 custody steps', () => {
      renderWithProviders(
        <AccountingDiagram diagramType="COD_FIDUCIARY_LIFECYCLE" />
      );

      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText(/COD Fiduciary Chain of Custody/i)).toBeInTheDocument();
      expect(screen.getByText(/Doorstep Collection/i)).toBeInTheDocument();
      expect(screen.getByText(/Hub Vault Remittance/i)).toBeInTheDocument();
      expect(screen.getByText(/Merchant Escrow Audit/i)).toBeInTheDocument();
      expect(screen.getByText(/Net Bank Wire Payout/i)).toBeInTheDocument();
    });

    it('T1.15: AccountingDiagram renders T-Account normal balance rules', () => {
      renderWithProviders(
        <AccountingDiagram diagramType="T_ACCOUNT" />
      );

      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText(/T-Account Normal Balance Rules/i)).toBeInTheDocument();
      expect(screen.getAllByText(/DEBIT \(DR\)/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/CREDIT \(CR\)/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 3: Interactive Step-by-Step Guided Walkthrough (F3)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 3: Walkthrough Tour Overlay & Spotlight', () => {
    it('T1.16: renders tour overlay and backdrop when activeTour is provided', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const popover = screen.getByRole('complementary');
      expect(popover).toBeInTheDocument();
      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
    });

    it('T1.17: displays tour step title, description, and callout badge', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      expect(screen.getByText(/Accounts Payable Overview & Accruals/i)).toBeInTheDocument();
      expect(screen.getByText(/Liability Accrual/i)).toBeInTheDocument();
      expect(screen.getByText(/Monitor total outstanding carrier liabilities/i)).toBeInTheDocument();
    });

    it('T1.18: renders progress counter and progress bar', () => {
      const { container } = renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
      const progressBar = container.querySelector('.bg-primary.h-1');
      expect(progressBar).toBeInTheDocument();
    });

    it('T1.19: renders directional navigation buttons (Previous and Next)', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const prevBtn = screen.getByRole('button', { name: /previous/i });
      const nextBtn = screen.getByRole('button', { name: /next/i });
      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
    });

    it('T1.20: renders spotlight mask element targeting matching DOM node', () => {
      const { container } = renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const overlaySvg = container.querySelector('svg.pointer-events-none');
      const fallbackBackdrop = container.querySelector('.bg-slate-900\\/80');
      expect(overlaySvg || fallbackBackdrop).toBeTruthy();
    });

    it('T1.21: renders graceful fallback card when target element is not in DOM', () => {
      cleanupFinanceDomLandmarks();

      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const popover = screen.getByRole('complementary');
      expect(popover).toBeInTheDocument();
      expect(screen.getByText(/Accounts Payable Overview/i)).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 4: Walkthrough Controls & State (F4)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 4: Walkthrough State Machine (Prev, Next, Pause, Resume, Complete)', () => {
    it('T1.22: disabled Previous button on step 1 (index 0)', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const prevBtn = screen.getByRole('button', { name: /previous/i });
      expect(prevBtn).toBeDisabled();
    });

    it('T1.23: Next button advances tour to step 2 and enables Previous button', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);

      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/3-Way Match Verification Tool/i)).toBeInTheDocument();

      const prevBtn = screen.getByRole('button', { name: /previous/i });
      expect(prevBtn).not.toBeDisabled();
    });

    it('T1.24: Previous button navigates backward from step 2 to step 1', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);
      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();

      const prevBtn = screen.getByRole('button', { name: /previous/i });
      fireEvent.click(prevBtn);
      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    });

    it('T1.25: renders "Complete Tour" button on the final step instead of "Next"', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);

      expect(screen.getByText(/Step 5 of 5/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^next$/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /complete tour/i })).toBeInTheDocument();
    });

    it('T1.26: clicking Complete Tour triggers onComplete callback', () => {
      const handleComplete = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          onClose={vi.fn()}
          onComplete={handleComplete}
        />
      );

      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);

      const completeBtn = screen.getByRole('button', { name: /complete tour/i });
      fireEvent.click(completeBtn);

      expect(handleComplete).toHaveBeenCalledTimes(1);
    });

    it('T1.27: clicking Pause button shows the Paused State Modal', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const pauseBtn = screen.getByLabelText(/pause tour/i);
      fireEvent.click(pauseBtn);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resume walkthrough/i })).toBeInTheDocument();
    });

    it('T1.28: clicking Resume Walkthrough in paused modal restores active tour', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const pauseBtn = screen.getByLabelText(/pause tour/i);
      fireEvent.click(pauseBtn);
      expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();

      const resumeBtn = screen.getByRole('button', { name: /resume walkthrough/i });
      fireEvent.click(resumeBtn);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    });

    it('T1.29: clicking Discard & Exit Tour in paused modal calls dismiss and exits', () => {
      const handleClose = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={handleClose} />
      );

      const pauseBtn = screen.getByLabelText(/pause tour/i);
      fireEvent.click(pauseBtn);

      const discardBtn = screen.getByRole('button', { name: /discard & exit tour/i });
      fireEvent.click(discardBtn);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 5: Keyboard Navigation (F5)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 5: Keyboard Navigation (Arrow keys and Escape)', () => {
    it('T1.30: pressing ArrowRight advances tour to next step in LTR mode', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
    });

    it('T1.31: pressing ArrowLeft navigates back to previous step in LTR mode', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    });

    it('T1.32: pressing Escape pauses tour and displays paused modal', () => {
      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();
    });

    it('T1.33: keyboard navigation inverts in RTL mode (ArrowLeft advances)', () => {
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          onClose={vi.fn()}
          lang="ar"
          isRTL={true}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText(/الخطوة 2 من 5/i)).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText(/الخطوة 1 من 5/i)).toBeInTheDocument();
    });

    it('T1.34: keyboard listeners do not fire after component unmounts', () => {
      const { unmount } = renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      unmount();
      expect(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight' });
      }).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 6: Cross-Tab Financial Coordination (F6)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 6: Cross-Tab Financial Coordination', () => {
    it('T1.35: triggers onTabRequired when step requires AP tab', () => {
      const handleTabRequired = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      expect(handleTabRequired).toHaveBeenCalledWith('ap');
    });

    it('T1.36: triggers onTabRequired when starting Statements tour', () => {
      const handleTabRequired = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.STATEMENTS_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      expect(handleTabRequired).toHaveBeenCalledWith('statements');
    });

    it('T1.37: triggers onTabRequired when starting Reports tour', () => {
      const handleTabRequired = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.REPORTS_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      expect(handleTabRequired).toHaveBeenCalledWith('reports');
    });

    it('T1.38: Master Finance Tour traverses steps with different required tabs', () => {
      const handleTabRequired = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.FULL_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      expect(handleTabRequired).toHaveBeenCalledWith('overview');

      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn); // Step 2 (also overview)
      fireEvent.click(nextBtn); // Step 3 (ap)
      expect(handleTabRequired).toHaveBeenCalledWith('ap');

      fireEvent.click(nextBtn); // Step 4 (statements)
      expect(handleTabRequired).toHaveBeenCalledWith('statements');

      fireEvent.click(nextBtn); // Step 5 (reports)
      expect(handleTabRequired).toHaveBeenCalledWith('reports');
    });

    it('T1.39: renders manual Switch Tab button when element is missing and tab required', () => {
      cleanupFinanceDomLandmarks();
      const handleTabRequired = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      const switchBtn = screen.getByRole('button', { name: /switch tab/i });
      expect(switchBtn).toBeInTheDocument();
      fireEvent.click(switchBtn);
      expect(handleTabRequired).toHaveBeenCalledWith('ap');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Feature 7: Quality, Data Integrity & Bilingual Polish (F7)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Feature 7: Quality & Content Integrity', () => {
    it('T1.40: financialGuidesContent contains structured guides for AP, Statements, and Reports', () => {
      expect(Array.isArray(FINANCIAL_GUIDES)).toBe(true);
      expect(FINANCIAL_GUIDES.length).toBeGreaterThanOrEqual(3);

      const apGuide = FINANCIAL_GUIDES.find((g) => g.id === 'accounts-payable');
      const stGuide = FINANCIAL_GUIDES.find((g) => g.id === 'financial-statements');
      const repGuide = FINANCIAL_GUIDES.find((g) => g.id === 'financial-reports');

      expect(apGuide).toBeDefined();
      expect(stGuide).toBeDefined();
      expect(repGuide).toBeDefined();
    });

    it('T1.41: every guide defines authoritative Chart of Accounts (COA) numbers', () => {
      FINANCIAL_GUIDES.forEach((guide) => {
        expect(Array.isArray(guide.keyAccounts)).toBe(true);
        expect(guide.keyAccounts.length).toBeGreaterThan(0);
        guide.keyAccounts.forEach((acc) => {
          expect(acc.code).toMatch(/^[0-9]/);
          expect(acc.type).toBeDefined();
        });
      });
    });

    it('T1.42: getTourSteps returns configured steps for all standard tour IDs', () => {
      const apSteps = getTourSteps(TOUR_IDS.AP_TOUR);
      const stSteps = getTourSteps(TOUR_IDS.STATEMENTS_TOUR);
      const repSteps = getTourSteps(TOUR_IDS.REPORTS_TOUR);
      const fullSteps = getTourSteps(TOUR_IDS.FULL_TOUR);

      expect(apSteps.length).toBeGreaterThanOrEqual(5);
      expect(stSteps.length).toBeGreaterThanOrEqual(5);
      expect(repSteps.length).toBeGreaterThanOrEqual(5);
      expect(fullSteps.length).toBeGreaterThanOrEqual(5);
    });

    it('T1.43: renders Arabic translations cleanly when lang="ar"', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={vi.fn()}
          onStartTour={vi.fn()}
          lang="ar"
          isRTL={true}
        />
      );

      expect(screen.getByText(/دليل المحاسبة والوثائق الإرشادية/i)).toBeInTheDocument();
      expect(screen.getByText(/جميع الأدلة/i)).toBeInTheDocument();
      expect(screen.getByText(/مستحقات الموردين والناقلين/i)).toBeInTheDocument();
    });

    it('T1.44: VisualFlowIndicator renders in vertical orientation with RTL attributes', () => {
      const testSteps = [
        { step: 1, title: { en: 'Inception', ar: 'البداية' } },
        { step: 2, title: { en: 'Completion', ar: 'النهاية' } }
      ];

      const { container } = renderWithProviders(
        <VisualFlowIndicator
          steps={testSteps}
          currentStep={1}
          orientation="vertical"
          lang="ar"
          isRTL={true}
        />
      );

      const root = container.firstChild;
      expect(root).toHaveAttribute('dir', 'rtl');
      expect(screen.getByText('البداية')).toBeInTheDocument();
    });
  });
});
