import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
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

describe('Tier 3: E2E Cross-Feature Combinations', () => {
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
  // Combination 1: Launching Tour from Docs Hub Drawer
  // ──────────────────────────────────────────────────────────────────────────
  describe('Combination 1: Launch Tour from Inside Docs Hub Drawer', () => {
    it('T3.1: clicking "Launch Interactive Tour" on AP guide triggers onStartTour and closes drawer', () => {
      const handleStartTour = vi.fn();
      const handleClose = vi.fn();

      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={handleClose}
          onStartTour={handleStartTour}
          initialCategory="ap"
        />
      );

      const launchTourBtn = screen.getByTestId('launch-tour-btn-accounts-payable');
      expect(launchTourBtn).toBeInTheDocument();
      fireEvent.click(launchTourBtn);

      expect(handleStartTour).toHaveBeenCalledWith('TOUR_ACCOUNTS_PAYABLE');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('T3.2: clicking "Launch Interactive Tour" on Statements guide passes Statements tour ID', () => {
      const handleStartTour = vi.fn();

      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={vi.fn()}
          onStartTour={handleStartTour}
          initialCategory="statements"
        />
      );

      const launchBtn = screen.getByTestId('launch-tour-btn-financial-statements');
      fireEvent.click(launchBtn);

      expect(handleStartTour).toHaveBeenCalledWith('TOUR_FINANCIAL_STATEMENTS');
    });

    it('T3.3: searching for "COD" in Docs Drawer and launching tour starts Reports tour', () => {
      const handleStartTour = vi.fn();

      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={vi.fn()}
          onStartTour={handleStartTour}
        />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: 'COD' } });

      const launchBtn = screen.getByTestId('launch-tour-btn-financial-reports');
      fireEvent.click(launchBtn);

      expect(handleStartTour).toHaveBeenCalledWith('TOUR_FINANCIAL_REPORTS');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Combination 2: Mid-Tour Tab Coordination & Auto-Synchronization
  // ──────────────────────────────────────────────────────────────────────────
  describe('Combination 2: Mid-Tour Tab Coordination & Auto-Synchronization', () => {
    it('T3.4: Master Finance Tour advances from Overview to AP step triggering onTabRequired("ap")', () => {
      const handleTabRequired = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.FULL_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      // Initially on overview
      expect(handleTabRequired).toHaveBeenCalledWith('overview');

      // Click Next to step 2 (overview)
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      // Click Next to step 3 (ap)
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      expect(handleTabRequired).toHaveBeenCalledWith('ap');
    });

    it('T3.5: Master Finance Tour advances from AP to Statements step triggering onTabRequired("statements")', () => {
      const handleTabRequired = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.FULL_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      // Advance: 0 (overview) -> 1 (overview) -> 2 (ap) -> 3 (statements)
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      expect(handleTabRequired).toHaveBeenCalledWith('statements');
    });

    it('T3.6: Master Finance Tour advances from Statements to Reports step triggering onTabRequired("reports")', () => {
      const handleTabRequired = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.FULL_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      // Advance: 0 -> 1 -> 2 -> 3 -> 4 (reports)
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      expect(handleTabRequired).toHaveBeenCalledWith('reports');
    });

    it('T3.7: missing target on inactive tab renders Switch Tab button and auto-heals when clicked', () => {
      cleanupFinanceDomLandmarks();
      const handleTabRequired = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.STATEMENTS_TOUR}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      const switchTabBtn = screen.getByRole('button', { name: /switch tab/i });
      expect(switchTabBtn).toBeInTheDocument();
      fireEvent.click(switchTabBtn);

      expect(handleTabRequired).toHaveBeenCalledWith('statements');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Combination 3: Pause, Drawer Interaction & Resume Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  describe('Combination 3: Pause, Drawer Interaction & Resume Lifecycle', () => {
    it('T3.8: pausing tour mid-flight allows opening Docs Drawer and resuming without state loss', () => {
      const ParentCoordinator = () => {
        const [isDocsOpen, setIsDocsOpen] = useState(false);
        const tour = useFinancialTour();

        return (
          <div>
            <button
              type="button"
              data-testid="open-docs-btn"
              onClick={() => setIsDocsOpen(true)}
            >
              Open Docs
            </button>
            <FinancialDocsHubDrawer
              isOpen={isDocsOpen}
              onClose={() => setIsDocsOpen(false)}
              onStartTour={(tId) => tour.startTour(tId)}
            />
            <FinancialWalkthroughTour
              activeTour={tour.activeTour}
              tourHook={tour}
              onClose={tour.dismissTour}
            />
          </div>
        );
      };

      renderWithProviders(<ParentCoordinator />);

      // Launch AP tour via Docs
      fireEvent.click(screen.getByTestId('open-docs-btn'));
      const launchBtn = screen.getByTestId('launch-tour-btn-accounts-payable');
      fireEvent.click(launchBtn);

      // Advance to step 2
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();

      // Pause tour
      fireEvent.click(screen.getByLabelText(/pause tour/i));
      expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();

      // Resume tour
      fireEvent.click(screen.getByRole('button', { name: /resume walkthrough/i }));
      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
    });

    it('T3.9: persisted tour state in localStorage restores when autoResumeSaved is true', () => {
      const STORAGE_KEY = 'target_finance_tour_state';
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeTour: TOUR_IDS.STATEMENTS_TOUR,
          currentStepIndex: 2,
          isPaused: false
        })
      );

      const { result } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      expect(result.current.activeTour).toBe(TOUR_IDS.STATEMENTS_TOUR);
      expect(result.current.currentStepIndex).toBe(2);
    });

    it('T3.10: navigating forward and backward synchronizes current index with localStorage', () => {
      const STORAGE_KEY = 'target_finance_tour_state';
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      act(() => {
        result.current.nextStep(); // to 1
      });
      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(saved.currentStepIndex).toBe(1);

      act(() => {
        result.current.nextStep(); // to 2
      });
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(saved.currentStepIndex).toBe(2);

      act(() => {
        result.current.prevStep(); // back to 1
      });
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(saved.currentStepIndex).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Combination 4: Dynamic Theme & Language Switching
  // ──────────────────────────────────────────────────────────────────────────
  describe('Combination 4: Dynamic Language & Finalization', () => {
    it('T3.11: language toggling dynamically updates tour titles and counter in Arabic', () => {
      const DynamicLanguageHost = () => {
        const [lang, setLang] = useState('en');
        return (
          <div>
            <button
              type="button"
              data-testid="toggle-lang-btn"
              onClick={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
            >
              Toggle Language
            </button>
            <FinancialWalkthroughTour
              activeTour={TOUR_IDS.AP_TOUR}
              onClose={vi.fn()}
              lang={lang}
              isRTL={lang === 'ar'}
            />
          </div>
        );
      };

      renderWithProviders(<DynamicLanguageHost />);

      // Initially English
      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Accounts Payable Overview/i)).toBeInTheDocument();

      // Switch to Arabic
      fireEvent.click(screen.getByTestId('toggle-lang-btn'));

      expect(screen.getByText(/الخطوة 1 من 5/i)).toBeInTheDocument();
      expect(screen.getByText(/نظرة عامة على الذمم الدائنة/i)).toBeInTheDocument();
    });

    it('T3.12: completing tour after launching from Docs Hub clears storage and invokes onComplete', () => {
      const STORAGE_KEY = 'target_finance_tour_state';
      const handleComplete = vi.fn();

      const TourHost = () => {
        const [activeTour, setActiveTour] = useState(TOUR_IDS.AP_TOUR);
        return (
          <FinancialWalkthroughTour
            activeTour={activeTour}
            onClose={() => setActiveTour(null)}
            onComplete={() => {
              setActiveTour(null);
              handleComplete();
            }}
          />
        );
      };

      renderWithProviders(<TourHost />);

      // Advance through all 5 steps: 0 -> 1 -> 2 -> 3 -> 4
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      const completeBtn = screen.getByRole('button', { name: /complete tour/i });
      fireEvent.click(completeBtn);

      expect(handleComplete).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
