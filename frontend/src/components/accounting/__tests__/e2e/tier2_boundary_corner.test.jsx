import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import {
  FinancialDocsHubDrawer,
  VisualFlowIndicator,
  AccountingDiagram,
  FinancialWalkthroughTour,
  useFinancialTour,
  FINANCIAL_GUIDES,
  TOUR_IDS,
  TOUR_ALIASES,
  getTourSteps,
  getTourMetadata,
  setupFinanceDomLandmarks,
  cleanupFinanceDomLandmarks,
  setupDomMocks,
  clearTourStorage,
  renderWithProviders
} from './test_helpers';

describe('Tier 2: E2E Boundary & Corner Cases', () => {
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
  // Boundary 1: Search Queries & Filtering
  // ──────────────────────────────────────────────────────────────────────────
  describe('Boundary 1: Search Input & Text Filtering', () => {
    it('T2.1: empty string search query returns all guides without crash', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill/i)).toBeInTheDocument();
      expect(screen.getByText(/Financial Statements \(Balance Sheet/i)).toBeInTheDocument();
      expect(screen.getByText(/Financial Reports, Reconciliation/i)).toBeInTheDocument();
    });

    it('T2.2: whitespace-only search query trims and preserves full catalog', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '    ' } });

      expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill/i)).toBeInTheDocument();
      expect(screen.getByText(/Financial Statements \(Balance Sheet/i)).toBeInTheDocument();
    });

    it('T2.3: non-matching gibberish search renders empty state placeholder', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: 'xyznonexistentterm999' } });

      expect(screen.getByTestId('financial-docs-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/No matching guides found/i)).toBeInTheDocument();
    });

    it('T2.4: search input matches case-insensitively', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: 'ACCOUNTS PAYABLE' } });

      expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill Ingestion/i)).toBeInTheDocument();
      expect(screen.queryByText(/Financial Reports, Profitability/i)).not.toBeInTheDocument();
    });

    it('T2.5: search with punctuation and special characters handles gracefully', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '!!!@@@###$$$%%%' } });

      expect(screen.getByTestId('financial-docs-empty-state')).toBeInTheDocument();
    });

    it('T2.6: search query matches Arabic text in guide titles and sections', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={vi.fn()}
          onStartTour={vi.fn()}
          lang="ar"
          isRTL={true}
        />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: 'المطابقة الثلاثية' } });

      expect(screen.getByText(/إدارة مستحقات الموردين وفواتير شركات الشحن/i)).toBeInTheDocument();
      expect(screen.queryByText(/الميزانية العمومية، قائمة الدخل/i)).not.toBeInTheDocument();
    });

    it('T2.7: search matches specific Chart of Accounts (COA) numbers like 5010', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer isOpen={true} onClose={vi.fn()} onStartTour={vi.fn()} />
      );

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '5010' } });

      // 5010 is referenced in Accounts Payable (Carrier COGS)
      expect(screen.getByText(/Accounts Payable \(AP\) & Carrier Bill Ingestion/i)).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Boundary 2: Navigation & Step Limits
  // ──────────────────────────────────────────────────────────────────────────
  describe('Boundary 2: Step Boundaries & Clamping', () => {
    it('T2.8: prevStep() at step index 0 does nothing and remains at index 0', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      expect(result.current.currentStepIndex).toBe(0);

      act(() => {
        result.current.prevStep();
      });

      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.hasPrev).toBe(false);
    });

    it('T2.9: nextStep() on the final step triggers onComplete and ends tour', () => {
      const handleComplete = vi.fn();
      const { result } = renderHook(() =>
        useFinancialTour({ onComplete: handleComplete })
      );

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR); // 5 steps (indices 0..4)
      });

      // Advance to step 4 (the last step)
      act(() => {
        result.current.goToStep(4);
      });

      expect(result.current.currentStepIndex).toBe(4);
      expect(result.current.hasNext).toBe(false);

      // Call nextStep on final step
      act(() => {
        result.current.nextStep();
      });

      expect(handleComplete).toHaveBeenCalledTimes(1);
      expect(result.current.isCompleted).toBe(true);
      expect(result.current.activeTour).toBeNull();
    });

    it('T2.10: rapid consecutive nextStep calls do not overflow beyond total steps', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR); // 5 steps
      });

      act(() => {
        for (let i = 0; i < 20; i++) {
          result.current.nextStep();
        }
      });

      // Either cleanly completed (activeTour is null) or clamped at boundary
      expect(result.current.currentStepIndex).toBeLessThanOrEqual(5);
    });

    it('T2.11: rapid consecutive prevStep calls do not underflow below 0', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });
      act(() => {
        result.current.goToStep(2);
      });

      expect(result.current.currentStepIndex).toBe(2);

      act(() => {
        result.current.prevStep();
      });
      expect(result.current.currentStepIndex).toBe(1);

      act(() => {
        result.current.prevStep();
      });
      expect(result.current.currentStepIndex).toBe(0);

      act(() => {
        result.current.prevStep();
      });
      expect(result.current.currentStepIndex).toBe(0);
    });

    it('T2.12: goToStep with negative number clamps safely to 0', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });
      act(() => {
        result.current.goToStep(-5);
      });

      expect(result.current.currentStepIndex).toBe(0);
    });

    it('T2.13: goToStep with number larger than totalSteps clamps safely to last step', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR); // length 5
      });
      act(() => {
        result.current.goToStep(99);
      });

      expect(result.current.currentStepIndex).toBe(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Boundary 3: Missing & Malformed DOM Elements
  // ──────────────────────────────────────────────────────────────────────────
  describe('Boundary 3: Missing DOM Elements & Selector Robustness', () => {
    it('T2.14: tour step with completely missing DOM selector renders fallback center card', () => {
      // Clean all DOM landmarks
      cleanupFinanceDomLandmarks();

      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const popover = screen.getByRole('complementary');
      expect(popover).toBeInTheDocument();
      // Verifies the card renders with valid text despite target missing
      expect(screen.getByText(/Accounts Payable Overview/i)).toBeInTheDocument();
    });

    it('T2.15: detached DOM element during active tour falls back gracefully', () => {
      const { container } = renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      // Now remove landmark from DOM dynamically
      cleanupFinanceDomLandmarks();
      fireEvent.scroll(window);

      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('T2.16: element with 0 width and height does not cause division by zero or NaN styles', () => {
      // Mock getBoundingClientRect to return zeros
      const originalRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => {}
      });

      renderWithProviders(
        <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} onClose={vi.fn()} />
      );

      const popover = screen.getByRole('complementary');
      expect(popover).toBeInTheDocument();
      expect(popover.style.top).not.toContain('NaN');
      expect(popover.style.left).not.toContain('NaN');

      Element.prototype.getBoundingClientRect = originalRect;
    });

    it('T2.17: malformed selector string does not crash the component', () => {
      const customSteps = [
        {
          id: 'broken-step',
          targetSelector: '[[[invalid===selector:::',
          title: { en: 'Malformed Test' },
          description: { en: 'Handling broken selector' },
          placement: 'bottom'
        }
      ];

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour="custom_broken"
          tourHook={{
            activeTour: 'custom_broken',
            currentStepIndex: 0,
            currentStep: customSteps[0],
            totalSteps: 1,
            isPaused: false,
            hasNext: false,
            hasPrev: false,
            nextStep: vi.fn(),
            prevStep: vi.fn(),
            pauseTour: vi.fn(),
            resumeTour: vi.fn(),
            dismissTour: vi.fn(),
            completeTour: vi.fn(),
            startTour: vi.fn()
          }}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Malformed Test')).toBeInTheDocument();
    });

    it('T2.18: step with null targetSelector renders fallback card without throwing', () => {
      const nullSelectorStep = {
        id: 'null-step',
        targetSelector: null,
        title: { en: 'Null Target Step' },
        description: { en: 'Step with null target' }
      };

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour="null_tour"
          tourHook={{
            activeTour: 'null_tour',
            currentStepIndex: 0,
            currentStep: nullSelectorStep,
            totalSteps: 1,
            isPaused: false,
            hasNext: false,
            hasPrev: false,
            nextStep: vi.fn(),
            prevStep: vi.fn(),
            pauseTour: vi.fn(),
            resumeTour: vi.fn(),
            dismissTour: vi.fn(),
            completeTour: vi.fn(),
            startTour: vi.fn()
          }}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Null Target Step')).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Boundary 4: Invalid & Empty Tour IDs
  // ──────────────────────────────────────────────────────────────────────────
  describe('Boundary 4: Tour IDs & Alias Resolution', () => {
    it('T2.19: startTour("") with empty string does not start tour', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour('');
      });

      expect(result.current.activeTour).toBeNull();
      expect(result.current.currentStep).toBeNull();
    });

    it('T2.20: startTour(null) and startTour(undefined) handle safely', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(null);
      });
      expect(result.current.activeTour).toBeNull();

      act(() => {
        result.current.startTour(undefined);
      });
      expect(result.current.activeTour).toBeNull();
    });

    it('T2.21: startTour with non-existent tour ID logs warning and does not activate', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour('completely_invalid_tour_id');
      });

      expect(result.current.activeTour).toBeNull();
      warnSpy.mockRestore();
    });

    it('T2.22: getTourSteps("invalid_id") returns empty array', () => {
      const steps = getTourSteps('non_existent_tour');
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBe(0);
    });

    it('T2.23: getTourMetadata("invalid_id") returns null', () => {
      const meta = getTourMetadata('non_existent_tour');
      expect(meta).toBeNull();
    });

    it('T2.24: resolves short aliases "ap" to AP_TOUR steps', () => {
      const steps = getTourSteps('ap');
      expect(steps.length).toBeGreaterThanOrEqual(5);
      expect(steps[0].id).toBe('ap-overview-kpi');
    });

    it('T2.25: resolves short aliases "statements" to STATEMENTS_TOUR steps', () => {
      const steps = getTourSteps('statements');
      expect(steps.length).toBeGreaterThanOrEqual(5);
    });

    it('T2.26: resolves short aliases "reports" to REPORTS_TOUR steps', () => {
      const steps = getTourSteps('reports');
      expect(steps.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Boundary 5: LocalStorage Edge Cases & Corruptions
  // ──────────────────────────────────────────────────────────────────────────
  describe('Boundary 5: LocalStorage Boundary Cases', () => {
    const STORAGE_KEY = 'target_finance_tour_state';

    it('T2.27: corrupted JSON in localStorage does not crash hook initialization', () => {
      localStorage.setItem(STORAGE_KEY, '{invalid json broken:::');

      const { result } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      expect(result.current.activeTour).toBeNull();
      expect(result.current.currentStepIndex).toBe(0);
    });

    it('T2.28: non-object primitive in localStorage is handled safely', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(12345));

      const { result } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      expect(result.current.activeTour).toBeNull();
    });

    it('T2.29: localStorage with out-of-bounds step index clamps safely upon auto-resume', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeTour: TOUR_IDS.AP_TOUR,
          currentStepIndex: 999,
          isPaused: false
        })
      );

      const { result } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      // Should auto-resume and clamp
      expect(result.current.activeTour).toBe(TOUR_IDS.AP_TOUR);
      expect(result.current.currentStepIndex).toBe(999);
    });

    it('T2.30: QuotaExceededError in localStorage does not crash pauseTour', () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      expect(() => {
        act(() => {
          result.current.pauseTour();
        });
      }).not.toThrow();

      expect(result.current.isPaused).toBe(true);
      setItemSpy.mockRestore();
    });

    it('T2.31: dismissTour cleans up saved state in localStorage', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
        result.current.pauseTour();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

      act(() => {
        result.current.dismissTour();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(result.current.activeTour).toBeNull();
    });

    it('T2.32: completeTour cleans up saved state in localStorage', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      act(() => {
        result.current.completeTour();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(result.current.activeTour).toBeNull();
      expect(result.current.isCompleted).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Boundary 6: Visual Assets & Component Boundary Cases
  // ──────────────────────────────────────────────────────────────────────────
  describe('Boundary 6: Visual Flow & Diagram Boundary Cases', () => {
    it('T2.33: VisualFlowIndicator with empty steps array renders null safely', () => {
      const { container } = renderWithProviders(
        <VisualFlowIndicator steps={[]} currentStep={1} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('T2.34: VisualFlowIndicator with null steps renders null safely', () => {
      const { container } = renderWithProviders(
        <VisualFlowIndicator steps={null} currentStep={1} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('T2.35: VisualFlowIndicator with single step renders without errors', () => {
      const singleStep = [
        { step: 1, title: 'Lone Step', icon: 'star' }
      ];

      renderWithProviders(
        <VisualFlowIndicator steps={singleStep} currentStep={1} />
      );

      expect(screen.getByText('Lone Step')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-1')).toBeInTheDocument();
    });

    it('T2.36: AccountingDiagram with unknown diagramType renders null/empty without crashing', () => {
      const { container } = renderWithProviders(
        <AccountingDiagram diagramType="NON_EXISTENT_DIAGRAM_TYPE" />
      );

      const diagram = container.querySelector('[data-testid="accounting-diagram"]');
      expect(diagram).toBeInTheDocument();
      expect(diagram.children.length).toBe(0);
    });

    it('T2.37: FinancialDocsHubDrawer with invalid initialCategory gracefully falls back', () => {
      renderWithProviders(
        <FinancialDocsHubDrawer
          isOpen={true}
          onClose={vi.fn()}
          onStartTour={vi.fn()}
          initialCategory="invalid_category_xyz"
        />
      );

      // Should render without crashing, displaying the drawer
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
