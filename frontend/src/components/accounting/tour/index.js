/**
 * Accounting Walkthrough Tour Engine Module
 *
 * Clean barrel export for guided interactive tours across Accounts Payable,
 * Financial Statements, Financial Reports, and Full Walkthroughs.
 */

import FinancialWalkthroughTour from './FinancialWalkthroughTour';
import useFinancialTour from './useFinancialTour';

export { FinancialWalkthroughTour, useFinancialTour };
export default FinancialWalkthroughTour;

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
} from './financialTourSteps';
