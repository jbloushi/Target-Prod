import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FinancialDocsHubDrawer,
  VisualFlowIndicator,
  AccountingDiagram,
  FINANCIAL_GUIDES,
  financialCategories,
  getFilteredGuides
} from './index';

describe('Financial Documentation & Guides Hub (Milestone M1)', () => {
  describe('financialGuidesContent data and helper logic', () => {
    it('contains guides for Accounts Payable, Statements, and Reports', () => {
      expect(FINANCIAL_GUIDES).toBeDefined();
      expect(FINANCIAL_GUIDES.length).toBeGreaterThanOrEqual(3);

      const apGuide = FINANCIAL_GUIDES.find((g) => g.id === 'accounts-payable');
      expect(apGuide).toBeDefined();
      expect(apGuide.category).toBe('ap');
      expect(apGuide.tourId).toBe('TOUR_ACCOUNTS_PAYABLE');
      expect(apGuide.keyAccounts.some((a) => a.code === '2010')).toBe(true);
      expect(apGuide.keyAccounts.some((a) => a.code === '5010')).toBe(true);

      const statementsGuide = FINANCIAL_GUIDES.find((g) => g.id === 'financial-statements');
      expect(statementsGuide).toBeDefined();
      expect(statementsGuide.category).toBe('statements');
      expect(statementsGuide.tourId).toBe('TOUR_FINANCIAL_STATEMENTS');

      const reportsGuide = FINANCIAL_GUIDES.find((g) => g.id === 'financial-reports');
      expect(reportsGuide).toBeDefined();
      expect(reportsGuide.category).toBe('reports');
      expect(reportsGuide.tourId).toBe('TOUR_FINANCIAL_REPORTS');
    });

    it('filters guides correctly by category', () => {
      const apOnly = getFilteredGuides(FINANCIAL_GUIDES, 'ap', '', 'en');
      expect(apOnly.length).toBe(1);
      expect(apOnly[0].id).toBe('accounts-payable');

      const statementsOnly = getFilteredGuides(FINANCIAL_GUIDES, 'statements', '', 'en');
      expect(statementsOnly.length).toBe(1);
      expect(statementsOnly[0].id).toBe('financial-statements');

      const all = getFilteredGuides(FINANCIAL_GUIDES, 'all', '', 'en');
      expect(all.length).toBe(FINANCIAL_GUIDES.length);
    });

    it('filters guides by search query matching account codes or text', () => {
      const searchByCode = getFilteredGuides(FINANCIAL_GUIDES, 'all', '5010', 'en');
      expect(searchByCode.length).toBeGreaterThanOrEqual(1);
      expect(searchByCode.some((g) => g.id === 'accounts-payable')).toBe(true);

      const searchBy3Way = getFilteredGuides(FINANCIAL_GUIDES, 'all', '3-way match', 'en');
      expect(searchBy3Way.length).toBeGreaterThanOrEqual(1);
      expect(searchBy3Way[0].id).toBe('accounts-payable');

      const searchByEscrow = getFilteredGuides(FINANCIAL_GUIDES, 'all', 'escrow', 'en');
      expect(searchByEscrow.length).toBeGreaterThanOrEqual(1);
      expect(searchByEscrow.some((g) => g.id === 'financial-reports')).toBe(true);

      const noMatch = getFilteredGuides(FINANCIAL_GUIDES, 'all', 'nonexistenttermxyz', 'en');
      expect(noMatch.length).toBe(0);
    });
  });

  describe('VisualFlowIndicator component', () => {
    const sampleSteps = [
      { step: 1, title: 'Step 1 Title', description: 'Step 1 Desc', icon: 'receipt' },
      { step: 2, title: 'Step 2 Title', description: 'Step 2 Desc', icon: 'rule' },
      { step: 3, title: 'Step 3 Title', description: 'Step 3 Desc', icon: 'done' }
    ];

    it('renders all steps with titles and icons', () => {
      render(<VisualFlowIndicator steps={sampleSteps} currentStep={2} />);
      expect(screen.getByText('Step 1 Title')).toBeInTheDocument();
      expect(screen.getByText('Step 2 Title')).toBeInTheDocument();
      expect(screen.getByText('Step 3 Title')).toBeInTheDocument();
      expect(screen.getByTestId('flow-step-1')).toHaveAttribute('data-status', 'completed');
      expect(screen.getByTestId('flow-step-2')).toHaveAttribute('data-status', 'active');
      expect(screen.getByTestId('flow-step-3')).toHaveAttribute('data-status', 'pending');
    });

    it('handles localized title objects in Arabic', () => {
      const localizedSteps = [
        {
          step: 1,
          title: { en: 'Ingestion', ar: 'الاستلام' },
          description: { en: 'Desc EN', ar: 'الوصف بالعربي' }
        }
      ];
      render(<VisualFlowIndicator steps={localizedSteps} lang="ar" isRTL={true} />);
      expect(screen.getByText('الاستلام')).toBeInTheDocument();
      expect(screen.getByText('الوصف بالعربي')).toBeInTheDocument();
    });

    it('calls onStepClick callback when clicked', () => {
      const onStepClick = vi.fn();
      render(<VisualFlowIndicator steps={sampleSteps} onStepClick={onStepClick} />);
      fireEvent.click(screen.getByTestId('flow-step-2'));
      expect(onStepClick).toHaveBeenCalledWith(2);
    });
  });

  describe('AccountingDiagram component', () => {
    it('renders THREE_WAY_MATCH diagram with audit pillars and isolation banner', () => {
      render(<AccountingDiagram diagramType="THREE_WAY_MATCH" lang="en" />);
      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText('3-Way Match Verification Flow')).toBeInTheDocument();
      expect(screen.getByText(/Rate Card Snapshot/i)).toBeInTheDocument();
      expect(screen.getByText(/Carrier Statement/i)).toBeInTheDocument();
      expect(screen.getByText(/Client Ledger Isolation/i)).toBeInTheDocument();
    });

    it('renders ACCOUNTING_EQUATION diagram with interactive account code cards', () => {
      render(<AccountingDiagram diagramType="ACCOUNTING_EQUATION" lang="en" />);
      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getAllByText(/Assets/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Liabilities/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Equity/i).length).toBeGreaterThanOrEqual(1);

      // Click an account card
      const code1010Btn = screen.getByText('1010').closest('button');
      expect(code1010Btn).toBeInTheDocument();
      fireEvent.click(code1010Btn);

      expect(screen.getByText(/Normal Debit \(DR\)/i)).toBeInTheDocument();
    });

    it('renders COD_FIDUCIARY_LIFECYCLE diagram with 4 stages', () => {
      render(<AccountingDiagram diagramType="COD_FIDUCIARY_LIFECYCLE" lang="en" />);
      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText('Stage 1')).toBeInTheDocument();
      expect(screen.getByText('Stage 2')).toBeInTheDocument();
      expect(screen.getByText('Stage 3')).toBeInTheDocument();
      expect(screen.getByText('Stage 4')).toBeInTheDocument();
      expect(screen.getByText(/Net Payout Formula/i)).toBeInTheDocument();
    });

    it('renders T_ACCOUNT normal balance diagram', () => {
      render(<AccountingDiagram diagramType="T_ACCOUNT" lang="en" />);
      expect(screen.getByTestId('accounting-diagram')).toBeInTheDocument();
      expect(screen.getByText(/Assets \(1xxx\) & Expenses\/COGS/i)).toBeInTheDocument();
      expect(screen.getAllByText('DEBIT (DR)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CREDIT (CR)').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FinancialDocsHubDrawer component', () => {
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      initialCategory: 'all',
      onStartTour: vi.fn(),
      lang: 'en'
    };

    it('renders null when isOpen is false', () => {
      const { container } = render(<FinancialDocsHubDrawer {...defaultProps} isOpen={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders drawer header, category pills, search input, and guide cards', () => {
      render(<FinancialDocsHubDrawer {...defaultProps} />);

      expect(screen.getByTestId('financial-docs-hub-drawer')).toBeInTheDocument();
      expect(screen.getByText('Financial Documentation & Guides Hub')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-all')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-ap')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-statements')).toBeInTheDocument();
      expect(screen.getByTestId('category-filter-reports')).toBeInTheDocument();
      expect(screen.getByTestId('financial-docs-search-input')).toBeInTheDocument();

      // Check guides are rendered
      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
      expect(screen.getByTestId('guide-card-financial-statements')).toBeInTheDocument();
      expect(screen.getByTestId('guide-card-financial-reports')).toBeInTheDocument();
    });

    it('filters guides when category pill is clicked', () => {
      render(<FinancialDocsHubDrawer {...defaultProps} />);

      const apPill = screen.getByTestId('category-filter-ap');
      fireEvent.click(apPill);

      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
      expect(screen.queryByTestId('guide-card-financial-statements')).not.toBeInTheDocument();
      expect(screen.queryByTestId('guide-card-financial-reports')).not.toBeInTheDocument();
    });

    it('filters guides via search input and shows empty state on no match', () => {
      render(<FinancialDocsHubDrawer {...defaultProps} />);

      const searchInput = screen.getByTestId('financial-docs-search-input');
      fireEvent.change(searchInput, { target: { value: '3-way match' } });

      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
      expect(screen.queryByTestId('guide-card-financial-statements')).not.toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: 'unknownxyz123' } });
      expect(screen.getByTestId('financial-docs-empty-state')).toBeInTheDocument();

      // Click clear search
      const clearBtn = screen.getByTestId('financial-docs-clear-search-btn');
      fireEvent.click(clearBtn);
      expect(screen.queryByTestId('financial-docs-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('guide-card-accounts-payable')).toBeInTheDocument();
    });

    it('calls onStartTour and onClose when launch tour button is clicked', () => {
      const onStartTourMock = vi.fn();
      const onCloseMock = vi.fn();
      render(
        <FinancialDocsHubDrawer
          {...defaultProps}
          onStartTour={onStartTourMock}
          onClose={onCloseMock}
        />
      );

      const launchBtn = screen.getByTestId('launch-tour-btn-accounts-payable');
      fireEvent.click(launchBtn);

      expect(onStartTourMock).toHaveBeenCalledWith('TOUR_ACCOUNTS_PAYABLE');
      expect(onCloseMock).toHaveBeenCalled();
    });

    it('handles close button, backdrop click, and Escape key', () => {
      const onCloseMock = vi.fn();
      render(<FinancialDocsHubDrawer {...defaultProps} onClose={onCloseMock} />);

      // Close button
      const closeBtn = screen.getByTestId('financial-docs-close-btn');
      fireEvent.click(closeBtn);
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Backdrop
      const backdrop = screen.getByTestId('financial-docs-backdrop');
      fireEvent.click(backdrop);
      expect(onCloseMock).toHaveBeenCalledTimes(2);

      // Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCloseMock).toHaveBeenCalledTimes(3);
    });

    it('renders Arabic content and RTL direction when lang is ar', () => {
      render(<FinancialDocsHubDrawer {...defaultProps} lang="ar" isRTL={true} />);

      const drawer = screen.getByTestId('financial-docs-hub-drawer');
      expect(drawer).toHaveAttribute('dir', 'rtl');
      expect(screen.getByText('دليل المحاسبة والوثائق الإرشادية')).toBeInTheDocument();
    });
  });
});
