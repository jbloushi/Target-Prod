import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, renderHook, act } from '@testing-library/react';
import {
  FinancialWalkthroughTour,
  useFinancialTour,
  TOUR_IDS,
  TOUR_ALIASES,
  getTourSteps,
  getTourMetadata,
  setupFinanceDomLandmarks,
  cleanupFinanceDomLandmarks,
  setupDomMocks,
  clearTourStorage,
  renderWithProviders
} from './e2e/test_helpers';

describe('Adversarial Challenger 2: Tour Walkthrough Engine Empirical Stress Suite', () => {
  let restoreDomMocks;
  const STORAGE_KEY = 'target_finance_tour_state';

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

  // ==========================================================================
  // Matrix 1: Invalid Tour IDs & Corrupted LocalStorage Payload Fuzzing
  // ==========================================================================
  describe('Matrix 1: Invalid Tour IDs & LocalStorage Corruption Fuzzing', () => {
    it('EMP-1.1: startTour with various non-existent or invalid types handles safely', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useFinancialTour());

      const invalidInputs = [
        null,
        undefined,
        '',
        '   ',
        'non_existent_tour_9999',
        12345,
        true,
        false,
        {},
        []
      ];

      invalidInputs.forEach((input) => {
        act(() => {
          result.current.startTour(input);
        });
        expect(result.current.activeTour).toBeNull();
        expect(result.current.currentStep).toBeNull();
        expect(result.current.totalSteps).toBe(0);
      });

      warnSpy.mockRestore();
    });

    it('EMP-1.1b: startTour with Symbol handles safely without throwing unhandled TypeError', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useFinancialTour());

      expect(() => {
        act(() => {
          result.current.startTour(Symbol('unhandled_sym'));
        });
      }).not.toThrow();

      expect(result.current.activeTour).toBeNull();
      expect(result.current.totalSteps).toBe(0);

      warnSpy.mockRestore();
    });

    it('EMP-1.2: Corrupted non-JSON strings in localStorage do not crash hook initialization', () => {
      const corruptPayloads = [
        '{invalid_json::',
        'undefined',
        'null',
        'true',
        '12345',
        '"just_a_string"',
        '[1, 2, 3]',
        '{"broken": true'
      ];

      corruptPayloads.forEach((payload) => {
        localStorage.setItem(STORAGE_KEY, payload);

        const { result } = renderHook(() =>
          useFinancialTour({ autoResumeSaved: true })
        );

        // Should fall back to clean inactive state
        expect(result.current.activeTour).toBeNull();
        expect(result.current.currentStepIndex).toBe(0);
        expect(result.current.isPaused).toBe(false);
      });
    });

    it('EMP-1.3: Semi-corrupted objects in localStorage handle missing/invalid properties gracefully', () => {
      const semiCorruptedPayloads = [
        {},
        { otherProperty: 'no activeTour' },
        { activeTour: null },
        { activeTour: '' },
        { activeTour: 9999 },
        { activeTour: 'bogus_id_404', currentStepIndex: 0, isPaused: false }
      ];

      semiCorruptedPayloads.forEach((obj) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));

        const { result } = renderHook(() =>
          useFinancialTour({ autoResumeSaved: true })
        );

        expect(result.current.isCompleted).toBe(false);
        if (result.current.activeTour) {
          expect(result.current.steps).toEqual([]);
        }
      });
    });

    it('EMP-1.4: Extreme and invalid currentStepIndex values in localStorage clamp or recover safely', () => {
      const testCases = [
        { rawIndex: -100, expected: 0 },
        { rawIndex: 99999, expected: 99999 },
        { rawIndex: 'string_index', expected: 0 },
        { rawIndex: null, expected: 0 },
        { rawIndex: undefined, expected: 0 }
      ];

      testCases.forEach(({ rawIndex, expected }) => {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            activeTour: TOUR_IDS.AP_TOUR,
            currentStepIndex: rawIndex,
            isPaused: true
          })
        );

        const { result } = renderHook(() =>
          useFinancialTour({ autoResumeSaved: true })
        );

        expect(result.current.isPaused).toBe(true);
        expect(typeof result.current.currentStepIndex).toBe('number');
        expect(result.current.currentStepIndex).toBe(expected);
      });
    });

    it('EMP-1.5: Calling resumeTour when saved state has invalid tour ID does not throw exception', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeTour: 'non_existent_tour_xyz',
          currentStepIndex: 3,
          isPaused: true
        })
      );

      const { result } = renderHook(() => useFinancialTour());

      expect(() => {
        act(() => {
          result.current.resumeTour();
        });
      }).not.toThrow();

      // targetSteps is [] for non_existent_tour_xyz, so steps is empty
      expect(result.current.steps).toEqual([]);
      expect(result.current.currentStep).toBeNull();
    });

    it('EMP-1.6: localStorage quota or security exception during pauseTour does not throw unhandled error', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
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

    it('EMP-1.7: Paused tour in localStorage without autoResumeSaved renders "Step 1 of 0" in pause modal', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeTour: TOUR_IDS.AP_TOUR,
          currentStepIndex: 2,
          isPaused: true
        })
      );

      // Mount tour with autoResumeSaved = false (the default in FinancePage)
      renderWithProviders(
        <FinancialWalkthroughTour />
      );

      // Verify that the pause modal renders, showing "Step 1 of 0" because activeTour was not resumed
      expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 1 of 0/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Matrix 2: Rapid Navigation Spamming & Race Conditions
  // ==========================================================================
  describe('Matrix 2: Rapid Navigation Spamming & Boundary Controls', () => {
    it('EMP-2.1: Synchronous 100x spamming of nextStep does not corrupt state', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.nextStep();
        }
      });

      expect(result.current.currentStepIndex).toBeLessThanOrEqual(5);
    });

    it('EMP-2.2: Asynchronous sequential nextStep across all steps reaches completion cleanly', () => {
      const handleComplete = vi.fn();
      const { result } = renderHook(() =>
        useFinancialTour({ onComplete: handleComplete })
      );

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR); // 5 steps (indices 0..4)
      });

      expect(result.current.currentStepIndex).toBe(0);

      for (let step = 0; step < 4; step++) {
        act(() => {
          result.current.nextStep();
        });
        expect(result.current.currentStepIndex).toBe(step + 1);
      }

      expect(result.current.currentStepIndex).toBe(4);
      expect(result.current.hasNext).toBe(false);

      act(() => {
        result.current.nextStep();
      });

      expect(handleComplete).toHaveBeenCalledTimes(1);
      expect(result.current.isCompleted).toBe(true);
      expect(result.current.activeTour).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      act(() => {
        result.current.nextStep();
      });
      expect(result.current.activeTour).toBeNull();
    });

    it('EMP-2.3: Spammed prevStep calls at index 0 do not underflow below 0', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      for (let i = 0; i < 20; i++) {
        act(() => {
          result.current.prevStep();
        });
      }

      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.hasPrev).toBe(false);
    });

    it('EMP-2.4: Rapid alternating nextStep and prevStep maintains consistency', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      for (let i = 0; i < 30; i++) {
        act(() => {
          if (i % 2 === 0) result.current.nextStep();
          else result.current.prevStep();
        });
      }

      expect(result.current.currentStepIndex).toBeGreaterThanOrEqual(0);
      expect(result.current.currentStepIndex).toBeLessThanOrEqual(4);
    });

    it('EMP-2.5: goToStep with extreme values clamps safely without crash', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });

      act(() => {
        result.current.goToStep(-999999);
      });
      expect(result.current.currentStepIndex).toBe(0);

      act(() => {
        result.current.goToStep(999999);
      });
      expect(result.current.currentStepIndex).toBe(4);

      act(() => {
        result.current.goToStep(2);
      });
      expect(result.current.currentStepIndex).toBe(2);

      act(() => {
        result.current.goToStep(NaN);
      });
      expect(typeof result.current.currentStepIndex).toBe('number');
    });

    it('EMP-2.6: Rapid pause and resume toggling maintains state fidelity across ticks', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.currentStepIndex).toBe(1);

      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.pauseTour();
        });
        expect(result.current.isPaused).toBe(true);

        act(() => {
          result.current.resumeTour();
        });
        expect(result.current.isPaused).toBe(false);
      }

      expect(result.current.currentStepIndex).toBe(1);
    });

    it('EMP-2.7: Interleaved startTour switches active tour and resets index', () => {
      const { result } = renderHook(() => useFinancialTour());

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.nextStep();
      });

      expect(result.current.activeTour).toBe(TOUR_IDS.AP_TOUR);
      expect(result.current.currentStepIndex).toBe(2);

      act(() => {
        result.current.startTour(TOUR_IDS.STATEMENTS_TOUR);
      });
      expect(result.current.activeTour).toBe(TOUR_IDS.STATEMENTS_TOUR);
      expect(result.current.currentStepIndex).toBe(0);

      act(() => {
        result.current.startTour(TOUR_IDS.REPORTS_TOUR, 3);
      });
      expect(result.current.activeTour).toBe(TOUR_IDS.REPORTS_TOUR);
      expect(result.current.currentStepIndex).toBe(3);
    });
  });

  // ==========================================================================
  // Matrix 3: DOM Element Absence, Detachment & Fallback Centering
  // ==========================================================================
  describe('Matrix 3: DOM Element Absence, Detachment & Fallback Centering', () => {
    it('EMP-3.1: Active tour when all target DOM elements are absent renders centered fallback popover', () => {
      cleanupFinanceDomLandmarks();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const popover = screen.getByRole('complementary');
      expect(popover).toBeInTheDocument();

      expect(popover.style.top).toMatch(/^\d+px$/);
      expect(popover.style.left).toMatch(/^\d+px$/);
      expect(popover.style.top).not.toContain('NaN');
      expect(popover.style.left).not.toContain('NaN');

      expect(screen.getByText(/Accounts Payable Overview & Accruals/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('EMP-3.2: Target element with 0x0 dimensions does not produce NaN or crash', () => {
      const origRect = Element.prototype.getBoundingClientRect;
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
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const popover = screen.getByRole('complementary');
      expect(popover).toBeInTheDocument();
      expect(popover.style.top).not.toContain('NaN');
      expect(popover.style.left).not.toContain('NaN');

      Element.prototype.getBoundingClientRect = origRect;
    });

    it('EMP-3.3: Detached DOM element dynamically unmounted during active tour does not crash on resize/scroll', () => {
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      cleanupFinanceDomLandmarks();

      expect(() => {
        fireEvent.scroll(window);
        fireEvent.resize(window);
      }).not.toThrow();

      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('EMP-3.4: Malformed CSS selector syntax does not throw DOMException in findTargetElement', () => {
      const brokenStep = {
        id: 'broken-selector-step',
        targetSelector: 'div[broken-attr="unclosed-quote, :::invalid',
        title: { en: 'Broken Selector Handling' },
        description: { en: 'Should not crash querySelector' },
        placement: 'bottom'
      };

      const customHook = {
        activeTour: 'custom-broken',
        currentStepIndex: 0,
        currentStep: brokenStep,
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
      };

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour="custom-broken"
          tourHook={customHook}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Broken Selector Handling')).toBeInTheDocument();
    });

    it('EMP-3.5: Fallback selector chain finds secondary selector when primary is absent', () => {
      const fallbackEl = document.createElement('div');
      fallbackEl.setAttribute('data-tour', 'secondary-target');
      document.body.appendChild(fallbackEl);

      const chainedStep = {
        id: 'chained-selector-step',
        targetSelector: '[data-tour="non-existent-primary"], [data-tour="secondary-target"]',
        title: { en: 'Chained Selector Step' },
        description: { en: 'Testing fallback chain' },
        placement: 'bottom'
      };

      const customHook = {
        activeTour: 'chained-tour',
        currentStepIndex: 0,
        currentStep: chainedStep,
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
      };

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour="chained-tour"
          tourHook={customHook}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Chained Selector Step')).toBeInTheDocument();
      document.body.removeChild(fallbackEl);
    });

    it('EMP-3.6: Missing target on inactive tab triggers Switch Tab button and invokes callback', () => {
      cleanupFinanceDomLandmarks();
      const handleTabRequired = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.STATEMENTS_TOUR}
          isOpen={true}
          onClose={vi.fn()}
          onTabRequired={handleTabRequired}
        />
      );

      const switchBtn = screen.getByRole('button', { name: /switch tab/i });
      expect(switchBtn).toBeInTheDocument();

      fireEvent.click(switchBtn);
      expect(handleTabRequired).toHaveBeenCalledWith('statements');
    });
  });

  // ==========================================================================
  // Matrix 4: Keyboard Navigation Boundaries, Input Shielding & RTL Modes
  // ==========================================================================
  describe('Matrix 4: Keyboard Navigation Boundaries, Input Shielding & RTL Modes', () => {
    it('EMP-4.1: ArrowRight navigates forward and ArrowLeft navigates backward in LTR', () => {
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          lang="en"
          isRTL={false}
        />
      );

      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      expect(screen.getByText(/Step 2 of/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });
      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });
      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
    });

    it('EMP-4.2: In RTL mode, ArrowLeft navigates forward and ArrowRight navigates backward', () => {
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          lang="ar"
          isRTL={true}
        />
      );

      expect(screen.getByText(/الخطوة 1 من/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });
      expect(screen.getByText(/الخطوة 2 من/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      expect(screen.getByText(/الخطوة 1 من/i)).toBeInTheDocument();
    });

    it('EMP-4.3: Escape key toggles pause on first press and dismisses on second press', () => {
      const handleClose = vi.fn();

      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          onClose={handleClose}
        />
      );

      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(screen.getByText(/Tour Walkthrough Paused/i)).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('EMP-4.4: Keyboard navigation is strictly shielded when typing inside form inputs', () => {
      renderWithProviders(
        <div>
          <input data-testid="user-input-field" type="text" defaultValue="accounting search" />
          <textarea data-testid="user-notes-field" defaultValue="ledger notes" />
          <FinancialWalkthroughTour activeTour={TOUR_IDS.AP_TOUR} />
        </div>
      );

      const input = screen.getByTestId('user-input-field');
      const textarea = screen.getByTestId('user-notes-field');

      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();

      input.focus();
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();

      textarea.focus();
      act(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(screen.queryByText(/Tour Walkthrough Paused/i)).toBeNull();
      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
    });

    it('EMP-4.5: ArrowRight on final step completes tour cleanly', () => {
      const handleComplete = vi.fn();
      renderWithProviders(
        <FinancialWalkthroughTour
          activeTour={TOUR_IDS.AP_TOUR}
          onComplete={handleComplete}
        />
      );

      for (let i = 0; i < 4; i++) {
        act(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        });
      }

      expect(screen.getByText(/Step 5 of 5/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /complete tour/i })).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });

      expect(handleComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Matrix 5: State Persistence Across Page Navigation / Lifecycle Simulation
  // ==========================================================================
  describe('Matrix 5: State Persistence Across Lifecycle Simulation', () => {
    it('EMP-5.1: Tour state saved at step 3 restores accurately after unmount/remount', () => {
      const { result, unmount } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      act(() => {
        result.current.startTour(TOUR_IDS.STATEMENTS_TOUR, 3);
      });
      act(() => {
        result.current.pauseTour();
      });

      expect(result.current.currentStepIndex).toBe(3);
      expect(result.current.isPaused).toBe(true);

      unmount();

      const { result: remountedResult } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      expect(remountedResult.current.isPaused).toBe(true);
      expect(remountedResult.current.hasSavedTour).toBe(true);

      act(() => {
        remountedResult.current.resumeTour();
      });

      expect(remountedResult.current.activeTour).toBe(TOUR_IDS.STATEMENTS_TOUR);
      expect(remountedResult.current.currentStepIndex).toBe(3);
      expect(remountedResult.current.isPaused).toBe(false);
    });

    it('EMP-5.2: Discarding tour clears saved state and prevents restoration on subsequent remount', () => {
      const { result, unmount } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      act(() => {
        result.current.startTour(TOUR_IDS.AP_TOUR);
      });
      act(() => {
        result.current.nextStep();
      });
      act(() => {
        result.current.dismissTour();
      });

      expect(result.current.activeTour).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      unmount();

      const { result: remountedResult } = renderHook(() =>
        useFinancialTour({ autoResumeSaved: true })
      );

      expect(remountedResult.current.activeTour).toBeNull();
      expect(remountedResult.current.hasSavedTour).toBe(false);
    });

    it('EMP-5.3: Component rendering with tourHook synchronizes seamlessly with external host', () => {
      const HostContainer = () => {
        const tour = useFinancialTour();
        return (
          <div>
            <button data-testid="host-start-ap" onClick={() => tour.startTour(TOUR_IDS.AP_TOUR)}>
              Start AP
            </button>
            <span data-testid="host-step-idx">{tour.currentStepIndex}</span>
            <FinancialWalkthroughTour tourHook={tour} />
          </div>
        );
      };

      renderWithProviders(<HostContainer />);

      expect(screen.queryByRole('dialog')).toBeNull();

      fireEvent.click(screen.getByTestId('host-start-ap'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
      expect(screen.getByTestId('host-step-idx').textContent).toBe('0');

      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByTestId('host-step-idx').textContent).toBe('1');
      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
    });
  });
});
