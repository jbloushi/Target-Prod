import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FINANCIAL_TOUR_CONFIGS,
    TOUR_IDS,
    TOUR_ALIASES,
    getTourSteps,
    getTourMetadata
} from './financialTourSteps';

const STORAGE_KEY_DEFAULT = 'target_finance_tour_state';

/**
 * Safely reads the saved tour state from localStorage
 * @param {string} key
 * @returns {Object|null}
 */
const readSavedTourState = (key) => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.activeTour) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
};

/**
 * Safely writes the saved tour state to localStorage
 * @param {string} key
 * @param {Object} state
 */
const writeSavedTourState = (key, state) => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        if (!state) {
            window.localStorage.removeItem(key);
            return;
        }
        window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
        // Ignore quota/security errors silently
    }
};

/**
 * Safely removes the saved tour state from localStorage
 * @param {string} key
 */
const clearSavedTourState = (key) => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        window.localStorage.removeItem(key);
    } catch {
        // Ignore errors
    }
};

/**
 * React hook managing guided walkthrough tour state and lifecycle.
 *
 * @param {Object} options
 * @param {Function} [options.onTabRequired] - Callback when a tour step requires switching tabs
 * @param {Function} [options.onStepChange] - Callback when step index changes (stepIndex, step)
 * @param {Function} [options.onComplete] - Callback when tour is completed
 * @param {Function} [options.onDismiss] - Callback when tour is dismissed
 * @param {string} [options.storageKey] - Custom localStorage key
 * @param {Object} [options.tours] - Custom tour configurations
 * @param {boolean} [options.autoResumeSaved] - Whether to automatically resume a saved tour on mount
 */
export const useFinancialTour = ({
    onTabRequired,
    onStepChange,
    onComplete,
    onDismiss,
    storageKey = STORAGE_KEY_DEFAULT,
    tours = FINANCIAL_TOUR_CONFIGS,
    autoResumeSaved = false
} = {}) => {
    // Read initial saved state if present
    const savedInitial = useMemo(() => readSavedTourState(storageKey), [storageKey]);

    const [activeTour, setActiveTour] = useState(() => {
        if (autoResumeSaved && savedInitial?.activeTour && !savedInitial?.isPaused) {
            return savedInitial.activeTour;
        }
        return null;
    });

    const [currentStepIndex, setCurrentStepIndex] = useState(() => {
        if (autoResumeSaved && savedInitial && typeof savedInitial.currentStepIndex === 'number') {
            return Math.max(0, savedInitial.currentStepIndex);
        }
        return 0;
    });

    const [isPaused, setIsPaused] = useState(() => {
        if (savedInitial && savedInitial.isPaused) {
            return true;
        }
        return false;
    });

    const [isCompleted, setIsCompleted] = useState(false);
    const [savedTourState, setSavedTourState] = useState(savedInitial);

    // Keep ref to onTabRequired to prevent unnecessary effect re-triggers
    const onTabRequiredRef = useRef(onTabRequired);
    useEffect(() => {
        onTabRequiredRef.current = onTabRequired;
    }, [onTabRequired]);

    const onStepChangeRef = useRef(onStepChange);
    useEffect(() => {
        onStepChangeRef.current = onStepChange;
    }, [onStepChange]);

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const onDismissRef = useRef(onDismiss);
    useEffect(() => {
        onDismissRef.current = onDismiss;
    }, [onDismiss]);

    // Resolve current tour steps
    const steps = useMemo(() => {
        if (!activeTour) return [];
        if (tours[activeTour]) return tours[activeTour];
        const canonical = TOUR_ALIASES[activeTour] || activeTour;
        if (tours[canonical]) return tours[canonical];
        return getTourSteps(activeTour);
    }, [activeTour, tours]);

    const totalSteps = steps.length;
    const currentStep = steps[currentStepIndex] || null;
    const hasNext = currentStepIndex < totalSteps - 1;
    const hasPrev = currentStepIndex > 0;
    const hasSavedTour = Boolean(savedTourState?.activeTour);

    // Tour metadata
    const activeMetadata = useMemo(() => {
        if (!activeTour) return null;
        return getTourMetadata(activeTour);
    }, [activeTour]);

    // Synchronize tab requirement when currentStep changes
    useEffect(() => {
        if (!activeTour || !currentStep || isPaused) return;

        if (currentStep.requiredTab && onTabRequiredRef.current) {
            onTabRequiredRef.current(currentStep.requiredTab);
        }

        if (onStepChangeRef.current) {
            onStepChangeRef.current(currentStepIndex, currentStep);
        }
    }, [activeTour, currentStepIndex, currentStep, isPaused]);

    /**
     * Start a new tour or switch to another tour
     */
    const startTour = useCallback((tourId, initialStepIndex = 0) => {
        if (!tourId) return;

        const canonicalId = TOUR_ALIASES[tourId] || tourId;
        const targetSteps = tours[canonicalId] || getTourSteps(canonicalId);

        if (!targetSteps || targetSteps.length === 0) {
            console.warn(`[useFinancialTour] No steps found for tour ID: "${tourId}"`);
            return;
        }

        const safeIndex = Math.min(Math.max(0, initialStepIndex), targetSteps.length - 1);
        const newState = {
            activeTour: canonicalId,
            currentStepIndex: safeIndex,
            isPaused: false,
            updatedAt: Date.now()
        };

        setActiveTour(canonicalId);
        setCurrentStepIndex(safeIndex);
        setIsPaused(false);
        setIsCompleted(false);
        setSavedTourState(newState);
        writeSavedTourState(storageKey, newState);

        const firstStep = targetSteps[safeIndex];
        if (firstStep?.requiredTab && onTabRequiredRef.current) {
            onTabRequiredRef.current(firstStep.requiredTab);
        }
    }, [storageKey, tours]);

    /**
     * Navigate to the next step or complete if on the last step
     */
    const nextStep = useCallback(() => {
        if (!activeTour || steps.length === 0) return;

        if (currentStepIndex < steps.length - 1) {
            const nextIdx = currentStepIndex + 1;
            setCurrentStepIndex(nextIdx);

            const updatedState = {
                activeTour,
                currentStepIndex: nextIdx,
                isPaused: false,
                updatedAt: Date.now()
            };
            setSavedTourState(updatedState);
            writeSavedTourState(storageKey, updatedState);
        } else {
            // Completed final step
            setIsCompleted(true);
            setActiveTour(null);
            setCurrentStepIndex(0);
            setIsPaused(false);
            setSavedTourState(null);
            clearSavedTourState(storageKey);

            if (onCompleteRef.current) {
                onCompleteRef.current();
            }
        }
    }, [activeTour, currentStepIndex, steps.length, storageKey]);

    /**
     * Navigate to the previous step
     */
    const prevStep = useCallback(() => {
        if (!activeTour || currentStepIndex <= 0) return;

        const prevIdx = currentStepIndex - 1;
        setCurrentStepIndex(prevIdx);

        const updatedState = {
            activeTour,
            currentStepIndex: prevIdx,
            isPaused: false,
            updatedAt: Date.now()
        };
        setSavedTourState(updatedState);
        writeSavedTourState(storageKey, updatedState);
    }, [activeTour, currentStepIndex, storageKey]);

    /**
     * Jump directly to a step by index
     */
    const goToStep = useCallback((index) => {
        if (!activeTour || steps.length === 0) return;
        const targetIndex = Math.min(Math.max(0, index), steps.length - 1);

        setCurrentStepIndex(targetIndex);

        const updatedState = {
            activeTour,
            currentStepIndex: targetIndex,
            isPaused: false,
            updatedAt: Date.now()
        };
        setSavedTourState(updatedState);
        writeSavedTourState(storageKey, updatedState);
    }, [activeTour, steps.length, storageKey]);

    /**
     * Pause the active tour and persist progress in localStorage
     */
    const pauseTour = useCallback(() => {
        if (!activeTour) return;

        setIsPaused(true);
        const pausedState = {
            activeTour,
            currentStepIndex,
            isPaused: true,
            updatedAt: Date.now()
        };
        setSavedTourState(pausedState);
        writeSavedTourState(storageKey, pausedState);
    }, [activeTour, currentStepIndex, storageKey]);

    /**
     * Resume a paused tour or restore from localStorage
     */
    const resumeTour = useCallback(() => {
        const stateToResume = savedTourState || readSavedTourState(storageKey);

        if (stateToResume?.activeTour) {
            const canonicalId = stateToResume.activeTour;
            const targetSteps = tours[canonicalId] || getTourSteps(canonicalId);
            const safeIdx = Math.min(
                Math.max(0, stateToResume.currentStepIndex || 0),
                Math.max(0, (targetSteps?.length || 1) - 1)
            );

            setActiveTour(canonicalId);
            setCurrentStepIndex(safeIdx);
            setIsPaused(false);
            setIsCompleted(false);

            const activeState = {
                activeTour: canonicalId,
                currentStepIndex: safeIdx,
                isPaused: false,
                updatedAt: Date.now()
            };
            setSavedTourState(activeState);
            writeSavedTourState(storageKey, activeState);

            const step = targetSteps[safeIdx];
            if (step?.requiredTab && onTabRequiredRef.current) {
                onTabRequiredRef.current(step.requiredTab);
            }
        } else if (activeTour) {
            setIsPaused(false);
            const activeState = {
                activeTour,
                currentStepIndex,
                isPaused: false,
                updatedAt: Date.now()
            };
            setSavedTourState(activeState);
            writeSavedTourState(storageKey, activeState);
        }
    }, [activeTour, currentStepIndex, savedTourState, storageKey, tours]);

    /**
     * Dismiss and close the tour, clearing saved progress
     */
    const dismissTour = useCallback(() => {
        setActiveTour(null);
        setCurrentStepIndex(0);
        setIsPaused(false);
        setIsCompleted(false);
        setSavedTourState(null);
        clearSavedTourState(storageKey);

        if (onDismissRef.current) {
            onDismissRef.current();
        }
    }, [storageKey]);

    /**
     * Mark the tour as completed and clear state
     */
    const completeTour = useCallback(() => {
        setIsCompleted(true);
        setActiveTour(null);
        setCurrentStepIndex(0);
        setIsPaused(false);
        setSavedTourState(null);
        clearSavedTourState(storageKey);

        if (onCompleteRef.current) {
            onCompleteRef.current();
        }
    }, [storageKey]);

    /**
     * Clears any saved tour state from localStorage without affecting current running tour
     */
    const clearSavedState = useCallback(() => {
        setSavedTourState(null);
        clearSavedTourState(storageKey);
    }, [storageKey]);

    return {
        // State
        activeTour,
        currentStepIndex,
        currentStep,
        steps,
        totalSteps,
        isPaused,
        isCompleted,
        hasNext,
        hasPrev,
        hasSavedTour,
        savedTourState,
        activeMetadata,

        // Actions
        startTour,
        nextStep,
        prevStep,
        goToStep,
        pauseTour,
        resumeTour,
        dismissTour,
        completeTour,
        clearSavedState,

        // Constants
        TOUR_IDS
    };
};

export default useFinancialTour;
