import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
    FinancialWalkthroughTour,
    useFinancialTour,
    TOUR_IDS,
    getTourSteps,
    getTourMetadata,
    AP_TOUR_STEPS,
    STATEMENTS_TOUR_STEPS,
    REPORTS_TOUR_STEPS,
    FULL_FINANCE_TOUR_STEPS
} from './index';

describe('Financial Tour Steps Catalog', () => {
    it('defines valid tour steps for Accounts Payable', () => {
        expect(AP_TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
        AP_TOUR_STEPS.forEach((step) => {
            expect(step).toHaveProperty('id');
            expect(step).toHaveProperty('targetSelector');
            expect(step).toHaveProperty('title');
            expect(step).toHaveProperty('description');
            expect(step).toHaveProperty('requiredTab', 'ap');
            expect(step).toHaveProperty('placement');
            expect(step).toHaveProperty('calloutBadge');
        });
    });

    it('defines valid tour steps for Financial Statements', () => {
        expect(STATEMENTS_TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
        STATEMENTS_TOUR_STEPS.forEach((step) => {
            expect(step).toHaveProperty('id');
            expect(step).toHaveProperty('targetSelector');
            expect(step).toHaveProperty('title');
            expect(step).toHaveProperty('description');
            expect(step).toHaveProperty('requiredTab', 'statements');
            expect(step).toHaveProperty('placement');
            expect(step).toHaveProperty('calloutBadge');
        });
    });

    it('defines valid tour steps for Financial Reports', () => {
        expect(REPORTS_TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
        REPORTS_TOUR_STEPS.forEach((step) => {
            expect(step).toHaveProperty('id');
            expect(step).toHaveProperty('targetSelector');
            expect(step).toHaveProperty('title');
            expect(step).toHaveProperty('description');
            expect(step).toHaveProperty('requiredTab', 'reports');
            expect(step).toHaveProperty('placement');
            expect(step).toHaveProperty('calloutBadge');
        });
    });

    it('defines valid tour steps for Full Finance Walkthrough', () => {
        expect(FULL_FINANCE_TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
        FULL_FINANCE_TOUR_STEPS.forEach((step) => {
            expect(step).toHaveProperty('id');
            expect(step).toHaveProperty('targetSelector');
            expect(step).toHaveProperty('title');
            expect(step).toHaveProperty('description');
            expect(step).toHaveProperty('requiredTab');
        });
    });

    it('resolves tour steps and metadata via helpers and aliases', () => {
        expect(getTourSteps(TOUR_IDS.AP_TOUR)).toEqual(AP_TOUR_STEPS);
        expect(getTourSteps('TOUR_ACCOUNTS_PAYABLE')).toEqual(AP_TOUR_STEPS);
        expect(getTourSteps('ap')).toEqual(AP_TOUR_STEPS);

        expect(getTourSteps(TOUR_IDS.STATEMENTS_TOUR)).toEqual(STATEMENTS_TOUR_STEPS);
        expect(getTourSteps('statements')).toEqual(STATEMENTS_TOUR_STEPS);

        expect(getTourSteps(TOUR_IDS.REPORTS_TOUR)).toEqual(REPORTS_TOUR_STEPS);
        expect(getTourSteps('reports')).toEqual(REPORTS_TOUR_STEPS);

        const apMeta = getTourMetadata(TOUR_IDS.AP_TOUR);
        expect(apMeta).toBeDefined();
        expect(apMeta.targetTab).toBe('ap');

        const nonExistent = getTourSteps('unknown_tour_xyz');
        expect(nonExistent).toEqual([]);
    });
});

describe('useFinancialTour hook', () => {
    const testStorageKey = 'test_tour_storage_key';

    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    // Helper test component consuming hook
    const TestHookConsumer = ({ onTabRequired, onComplete, onDismiss }) => {
        const tour = useFinancialTour({
            onTabRequired,
            onComplete,
            onDismiss,
            storageKey: testStorageKey
        });

        return (
            <div>
                <span data-testid="active-tour">{tour.activeTour || 'none'}</span>
                <span data-testid="step-index">{tour.currentStepIndex}</span>
                <span data-testid="is-paused">{String(tour.isPaused)}</span>
                <span data-testid="is-completed">{String(tour.isCompleted)}</span>
                <span data-testid="step-id">{tour.currentStep?.id || 'none'}</span>

                <button onClick={() => tour.startTour(TOUR_IDS.AP_TOUR)}>Start AP</button>
                <button onClick={tour.nextStep}>Next</button>
                <button onClick={tour.prevStep}>Prev</button>
                <button onClick={tour.pauseTour}>Pause</button>
                <button onClick={tour.resumeTour}>Resume</button>
                <button onClick={tour.dismissTour}>Dismiss</button>
                <button onClick={tour.completeTour}>Complete</button>
            </div>
        );
    };

    it('starts a tour, updates step, and invokes onTabRequired', () => {
        const onTabRequired = vi.fn();
        const onComplete = vi.fn();

        render(
            <TestHookConsumer
                onTabRequired={onTabRequired}
                onComplete={onComplete}
            />
        );

        expect(screen.getByTestId('active-tour').textContent).toBe('none');

        // Start AP tour
        fireEvent.click(screen.getByText('Start AP'));

        expect(screen.getByTestId('active-tour').textContent).toBe(TOUR_IDS.AP_TOUR);
        expect(screen.getByTestId('step-index').textContent).toBe('0');
        expect(onTabRequired).toHaveBeenCalledWith('ap');

        // Verify localStorage persistence
        const saved = JSON.parse(window.localStorage.getItem(testStorageKey));
        expect(saved.activeTour).toBe(TOUR_IDS.AP_TOUR);
        expect(saved.currentStepIndex).toBe(0);

        // Advance to next step
        fireEvent.click(screen.getByText('Next'));
        expect(screen.getByTestId('step-index').textContent).toBe('1');

        // Move back to previous step
        fireEvent.click(screen.getByText('Prev'));
        expect(screen.getByTestId('step-index').textContent).toBe('0');
    });

    it('pauses and resumes tour correctly', () => {
        render(<TestHookConsumer />);

        fireEvent.click(screen.getByText('Start AP'));
        fireEvent.click(screen.getByText('Next')); // step 1

        expect(screen.getByTestId('step-index').textContent).toBe('1');
        expect(screen.getByTestId('is-paused').textContent).toBe('false');

        // Pause tour
        fireEvent.click(screen.getByText('Pause'));
        expect(screen.getByTestId('is-paused').textContent).toBe('true');

        const saved = JSON.parse(window.localStorage.getItem(testStorageKey));
        expect(saved.isPaused).toBe(true);
        expect(saved.currentStepIndex).toBe(1);

        // Resume tour
        fireEvent.click(screen.getByText('Resume'));
        expect(screen.getByTestId('is-paused').textContent).toBe('false');
        expect(screen.getByTestId('step-index').textContent).toBe('1');
    });

    it('dismisses tour and cleans up state', () => {
        const onDismiss = vi.fn();
        render(<TestHookConsumer onDismiss={onDismiss} />);

        fireEvent.click(screen.getByText('Start AP'));
        expect(screen.getByTestId('active-tour').textContent).toBe(TOUR_IDS.AP_TOUR);

        fireEvent.click(screen.getByText('Dismiss'));
        expect(screen.getByTestId('active-tour').textContent).toBe('none');
        expect(window.localStorage.getItem(testStorageKey)).toBeNull();
        expect(onDismiss).toHaveBeenCalled();
    });
});

describe('FinancialWalkthroughTour Component', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it('renders null when no tour is active', () => {
        const { container } = render(
            <FinancialWalkthroughTour activeTour={null} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders step details, header, and progress for an active tour', () => {
        render(
            <FinancialWalkthroughTour
                activeTour={TOUR_IDS.AP_TOUR}
                lang="en"
            />
        );

        // Should render step counter badge
        expect(screen.getByText(/Step 1 of/i)).toBeDefined();

        // Should render AP first step title
        expect(screen.getByText('Accounts Payable Overview & Accruals')).toBeDefined();

        // Should render Navigation controls
        expect(screen.getByText('Next')).toBeDefined();
        expect(screen.getByText('Previous')).toBeDefined();
    });

    it('supports bilingual Arabic rendering', () => {
        render(
            <FinancialWalkthroughTour
                activeTour={TOUR_IDS.AP_TOUR}
                lang="ar"
                isRTL={true}
            />
        );

        // Arabic title
        expect(screen.getByText('نظرة عامة على الذمم الدائنة والمستحقات')).toBeDefined();
        // Arabic Next button
        expect(screen.getByText('التالي')).toBeDefined();
        // Arabic Previous button
        expect(screen.getByText('السابق')).toBeDefined();
    });

    it('navigates through steps when clicking Next', () => {
        render(
            <FinancialWalkthroughTour
                activeTour={TOUR_IDS.AP_TOUR}
                lang="en"
            />
        );

        expect(screen.getByText(/Step 1 of/i)).toBeDefined();

        // Click next
        fireEvent.click(screen.getByText('Next'));

        // Should advance to step 2: 3-Way Match Verification Tool
        expect(screen.getByText(/Step 2 of/i)).toBeDefined();
        expect(screen.getByText('3-Way Match Verification Tool')).toBeDefined();
    });

    it('handles keyboard navigation (ArrowRight, ArrowLeft, Escape)', () => {
        render(
            <FinancialWalkthroughTour
                activeTour={TOUR_IDS.AP_TOUR}
                lang="en"
            />
        );

        expect(screen.getByText(/Step 1 of/i)).toBeDefined();

        // ArrowRight advances to step 2
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        });
        expect(screen.getByText(/Step 2 of/i)).toBeDefined();

        // ArrowLeft returns to step 1
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        });
        expect(screen.getByText(/Step 1 of/i)).toBeDefined();

        // Escape pauses tour and shows paused banner modal
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(screen.getByText('Tour Walkthrough Paused')).toBeDefined();
        expect(screen.getByText('Resume Walkthrough')).toBeDefined();

        // Click resume
        fireEvent.click(screen.getByText('Resume Walkthrough'));
        expect(screen.queryByText('Tour Walkthrough Paused')).toBeNull();
        expect(screen.getByText(/Step 1 of/i)).toBeDefined();
    });

    it('positions spotlight cutout when target DOM element is found', () => {
        // Create matching target in DOM
        const targetDiv = document.createElement('div');
        targetDiv.setAttribute('data-tour', 'ap-kpi-outstanding');
        targetDiv.getBoundingClientRect = () => ({
            top: 100,
            left: 50,
            bottom: 200,
            right: 250,
            width: 200,
            height: 100
        });
        document.body.appendChild(targetDiv);

        render(
            <FinancialWalkthroughTour
                activeTour={TOUR_IDS.AP_TOUR}
                lang="en"
            />
        );

        // Check that overlay mounts with dialog role
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeDefined();

        document.body.removeChild(targetDiv);
    });
});
