import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import {
  FinancialDocsHubDrawer,
  FinancialWalkthroughTour,
  useFinancialTour,
  TOUR_IDS,
  setupFinanceDomLandmarks,
  cleanupFinanceDomLandmarks,
  setupDomMocks,
  clearTourStorage,
  renderWithProviders
} from './test_helpers';

describe('Tier 4: E2E Real-World Application Scenarios', () => {
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
  // Scenario 1: New Junior Accountant Onboarding Tour
  // ──────────────────────────────────────────────────────────────────────────
  it('T4.1: Scenario 1 - New Junior Accountant Complete Onboarding Walkthrough', () => {
    const tabSwitchHistory = [];
    const handleComplete = vi.fn();

    const OnboardingAppHost = () => {
      const [activeTab, setActiveTab] = useState('overview');
      const [tourId, setTourId] = useState(TOUR_IDS.FULL_TOUR);

      const handleTabRequired = (tab) => {
        setActiveTab(tab);
        tabSwitchHistory.push(tab);
      };

      return (
        <div data-testid="finance-workspace" data-active-tab={activeTab}>
          <FinancialWalkthroughTour
            activeTour={tourId}
            onTabRequired={handleTabRequired}
            onComplete={() => {
              setTourId(null);
              handleComplete();
            }}
            onClose={() => setTourId(null)}
          />
        </div>
      );
    };

    renderWithProviders(<OnboardingAppHost />);

    // Step 1: Welcome to Target Financials (overview)
    expect(screen.getByText(/Welcome to Target Financials & Accounting/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();

    // Step 2: Three Workspace Suites
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Three Integrated Financial Suites/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();

    // Step 3: AP Overview & Carrier Settlements (switches to 'ap')
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Accounts Payable & Carrier Settlements/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3 of 5/i)).toBeInTheDocument();
    expect(tabSwitchHistory).toContain('ap');

    // Step 4: Real-time Balance Sheet & Equation Check (switches to 'statements')
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Real-Time Balance Sheet & Equation Check/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 4 of 5/i)).toBeInTheDocument();
    expect(tabSwitchHistory).toContain('statements');

    // Step 5: Financial Reports & Profitability Analytics (switches to 'reports')
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Financial Reports & Profitability Analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 5 of 5/i)).toBeInTheDocument();
    expect(tabSwitchHistory).toContain('reports');

    // Complete onboarding walkthrough
    const completeBtn = screen.getByRole('button', { name: /complete tour/i });
    expect(completeBtn).toBeInTheDocument();
    fireEvent.click(completeBtn);

    expect(handleComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 2: Month-End Carrier AP 3-Way Match Audit Investigation
  // ──────────────────────────────────────────────────────────────────────────
  it('T4.2: Scenario 2 - Month-End Carrier AP 3-Way Match Investigation & SOP Walkthrough', () => {
    const auditActions = [];

    const CarrierApAuditHost = () => {
      const [isDocsOpen, setIsDocsOpen] = useState(true);
      const [activeTour, setActiveTour] = useState(null);

      const handleStartTour = (tourId) => {
        auditActions.push(`started_${tourId}`);
        setActiveTour(tourId);
      };

      return (
        <div>
          <FinancialDocsHubDrawer
            isOpen={isDocsOpen}
            onClose={() => setIsDocsOpen(false)}
            onStartTour={handleStartTour}
            initialCategory="ap"
          />
          <FinancialWalkthroughTour
            activeTour={activeTour}
            onClose={() => setActiveTour(null)}
            onComplete={() => {
              auditActions.push('audit_completed');
              setActiveTour(null);
            }}
          />
        </div>
      );
    };

    renderWithProviders(<CarrierApAuditHost />);

    // 1. Audit accountant reviews AP guide in drawer
    expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill Ingestion/i)).toBeInTheDocument();
    expect(screen.getByText(/3-Way Match Verification Flow/i)).toBeInTheDocument();
    expect(screen.getByText(/CR 2010 Carrier AP \(Accrual\)/i)).toBeInTheDocument();

    // 2. Launch interactive AP walkthrough directly from drawer
    const launchBtn = screen.getByTestId('launch-tour-btn-accounts-payable');
    fireEvent.click(launchBtn);
    expect(auditActions).toContain('started_TOUR_ACCOUNTS_PAYABLE');

    // 3. Step through AP walkthrough:
    // Step 1: KPI overview
    expect(screen.getByText(/Accounts Payable Overview & Accruals/i)).toBeInTheDocument();

    // Step 2: 3-Way Match tool focus
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/3-Way Match Verification Tool/i)).toBeInTheDocument();
    expect(screen.getByText(/Compare vendor billing statements against platform shipment cost/i)).toBeInTheDocument();

    // Step 3: Record Vendor Bill
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Record Vendor & Carrier Bills/i)).toBeInTheDocument();

    // Step 4: Carrier Bills Table
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Carrier Bills & Aging Table/i)).toBeInTheDocument();

    // Step 5: Payment Disbursement
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Disbursement & GL Payment Posting/i)).toBeInTheDocument();

    // 4. Complete Audit
    fireEvent.click(screen.getByRole('button', { name: /complete tour/i }));
    expect(auditActions).toContain('audit_completed');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 3: Executive Board Financial Statement Review
  // ──────────────────────────────────────────────────────────────────────────
  it('T4.3: Scenario 3 - Executive Board Financial Statement Review & Invariant Audit', () => {
    const reviews = [];

    const BoardReviewHost = () => {
      const [isDocsOpen, setIsDocsOpen] = useState(true);
      const [activeTour, setActiveTour] = useState(null);

      return (
        <div>
          <FinancialDocsHubDrawer
            isOpen={isDocsOpen}
            onClose={() => setIsDocsOpen(false)}
            onStartTour={(tId) => {
              reviews.push(`started_${tId}`);
              setActiveTour(tId);
            }}
            initialCategory="statements"
          />
          <FinancialWalkthroughTour
            activeTour={activeTour}
            onClose={() => setActiveTour(null)}
            onComplete={() => {
              reviews.push('review_completed');
              setActiveTour(null);
            }}
          />
        </div>
      );
    };

    renderWithProviders(<BoardReviewHost />);

    // 1. Board examines accounting equation diagram in drawer
    expect(screen.getByText(/The Balanced Accounting Equation/i)).toBeInTheDocument();
    expect(screen.getByText(/SUM\(DR\) == SUM\(CR\)/i)).toBeInTheDocument();

    // 2. Launch Statements walkthrough
    const launchBtn = screen.getByTestId('launch-tour-btn-financial-statements');
    fireEvent.click(launchBtn);
    expect(reviews).toContain('started_TOUR_FINANCIAL_STATEMENTS');

    // 3. Step through statements walkthrough:
    // Step 1: Statement Type Selector
    expect(screen.getByText(/Financial Statement Selector/i)).toBeInTheDocument();

    // Step 2: Date Filter Controls
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Accounting Period & Date Filter Deck/i)).toBeInTheDocument();

    // Step 3: Balance Sheet KPIs
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Balance Sheet KPI Deck/i)).toBeInTheDocument();

    // Step 4: Accounting Equation Check
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Accounting Equation Invariant \(A = L \+ E\)/i)).toBeInTheDocument();

    // Step 5: P&L Margin Structure
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Income Statement \(P&L\) Structure/i)).toBeInTheDocument();

    // Step 6: Trial Balance Invariance
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Trial Balance Debit \/ Credit Equality/i)).toBeInTheDocument();

    // Finish Board Review
    fireEvent.click(screen.getByRole('button', { name: /complete tour/i }));
    expect(reviews).toContain('review_completed');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 4: Driver COD Vault Remittance Investigation
  // ──────────────────────────────────────────────────────────────────────────
  it('T4.4: Scenario 4 - Driver COD Vault Remittance & Escrow Audit Workflow', () => {
    const codSteps = [];

    const CodAuditHost = () => {
      const [isDocsOpen, setIsDocsOpen] = useState(true);
      const [activeTour, setActiveTour] = useState(null);

      return (
        <div>
          <FinancialDocsHubDrawer
            isOpen={isDocsOpen}
            onClose={() => setIsDocsOpen(false)}
            onStartTour={(tId) => {
              codSteps.push(`started_${tId}`);
              setActiveTour(tId);
            }}
            initialCategory="reports"
          />
          <FinancialWalkthroughTour
            activeTour={activeTour}
            onClose={() => setActiveTour(null)}
            onComplete={() => {
              codSteps.push('cod_audit_finished');
              setActiveTour(null);
            }}
          />
        </div>
      );
    };

    renderWithProviders(<CodAuditHost />);

    // 1. Inspect COD Fiduciary Diagram in drawer
    expect(screen.getAllByText(/COD Fiduciary Chain of Custody/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/DR 1020 Cash in Transit/i)).toBeInTheDocument();
    expect(screen.getByText(/DR 1030 Hub Vault Safe/i)).toBeInTheDocument();

    // 2. Launch Reports & COD Walkthrough
    const launchBtn = screen.getByTestId('launch-tour-btn-financial-reports');
    fireEvent.click(launchBtn);
    expect(codSteps).toContain('started_TOUR_FINANCIAL_REPORTS');

    // 3. Step through Reports Tour
    // Step 1: Reports subnav
    expect(screen.getByText(/Financial Reports Navigation Deck/i)).toBeInTheDocument();

    // Step 2: Shipment profitability
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Shipment Profitability & Gross Margins/i)).toBeInTheDocument();

    // Step 3: Carrier Statement reconciliation
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Carrier Reconciliation CSV Audit/i)).toBeInTheDocument();

    // Step 4: Driver COD Vault Clearing
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Driver COD Clearing & Vault Remittance/i)).toBeInTheDocument();

    // Step 5: Official Exports
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Audit-Ready Statement Exports/i)).toBeInTheDocument();

    // Complete COD Workflow
    fireEvent.click(screen.getByRole('button', { name: /complete tour/i }));
    expect(codSteps).toContain('cod_audit_finished');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 5: Mid-Flight Interruption & Resume via LocalStorage
  // ──────────────────────────────────────────────────────────────────────────
  it('T4.5: Scenario 5 - Mid-Workflow Interruption, Emergency Pause & Resumption from LocalStorage', () => {
    const STORAGE_KEY = 'target_finance_tour_state';

    // Step A: Accountant begins Statements tour and advances to Step 3
    const FirstSession = () => {
      const tour = useFinancialTour({ storageKey: STORAGE_KEY });

      return (
        <div>
          <button
            type="button"
            data-testid="start-session-btn"
            onClick={() => tour.startTour(TOUR_IDS.STATEMENTS_TOUR)}
          >
            Start
          </button>
          <FinancialWalkthroughTour
            activeTour={tour.activeTour}
            tourHook={tour}
            onClose={tour.dismissTour}
          />
        </div>
      );
    };

    const { unmount } = renderWithProviders(<FirstSession />);

    fireEvent.click(screen.getByTestId('start-session-btn'));
    expect(screen.getByText(/Step 1 of 6/i)).toBeInTheDocument();

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 2 of 6/i)).toBeInTheDocument();

    // Advance to Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 3 of 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Balance Sheet KPI Deck/i)).toBeInTheDocument();

    // Accountant hits Pause due to an interruption
    fireEvent.click(screen.getByLabelText(/pause tour/i));
    expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();

    // Verify localStorage has preserved state at index 2
    const savedBeforeUnmount = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(savedBeforeUnmount.activeTour).toBe(TOUR_IDS.STATEMENTS_TOUR);
    expect(savedBeforeUnmount.currentStepIndex).toBe(2);
    expect(savedBeforeUnmount.isPaused).toBe(true);

    // Accountant closes browser tab (unmount)
    unmount();

    // Step B: Later, accountant re-opens application; component mounts with autoResumeSaved
    const SecondSession = () => {
      const tour = useFinancialTour({
        storageKey: STORAGE_KEY,
        autoResumeSaved: true
      });

      return (
        <div>
          <FinancialWalkthroughTour
            activeTour={tour.activeTour}
            tourHook={tour}
            onClose={tour.dismissTour}
          />
        </div>
      );
    };

    renderWithProviders(<SecondSession />);

    // Since it was paused, paused modal is mounted with resume button
    expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3 of/i)).toBeInTheDocument();

    // Click Resume Walkthrough
    fireEvent.click(screen.getByRole('button', { name: /resume walkthrough/i }));

    // Verified: Resumed right at Step 3
    expect(screen.getByText(/Step 3 of 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Balance Sheet KPI Deck/i)).toBeInTheDocument();

    // Continue to Step 4, 5, 6
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 4 of 6/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 5 of 6/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Step 6 of 6/i)).toBeInTheDocument();

    // Complete the final step
    fireEvent.click(screen.getByRole('button', { name: /complete tour/i }));

    // Storage is cleared
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
