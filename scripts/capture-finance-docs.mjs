/**
 * Captures documentation screenshots for the Financials & Accounting guides.
 *
 * Uses SYNTHETIC demo data served through Playwright route mocks, so no backend,
 * database, or real financial data is needed.
 *
 * Usage (frontend dev server must be running):
 *   node scripts/capture-finance-docs.mjs [baseUrl]
 *
 * Output: frontend/public/docs/finance/*.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../frontend/public/docs/finance');
fs.mkdirSync(OUT_DIR, { recursive: true });

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

const DEMO_USER = {
  id: 1,
  name: 'Demo Accountant',
  email: 'demo@example.com',
  role: 'admin',
};

const vendors = [
  { id: 1, name: 'Demo Express Carrier', code: 'DXC' },
  { id: 2, name: 'Sample Air Freight', code: 'SAF' },
  { id: 3, name: 'Example Last Mile Co.', code: 'ELM' },
];

const bills = [
  { id: 1, billNumber: 'BILL-1001', vendor: vendors[0], dueDate: daysFromNow(12), total: 1250.5, paidAmount: 0, remainingBalance: 1250.5, status: 'OPEN' },
  { id: 2, billNumber: 'BILL-1002', vendor: vendors[1], dueDate: daysFromNow(5), total: 3400, paidAmount: 1500, remainingBalance: 1900, status: 'PARTIALLY_PAID' },
  { id: 3, billNumber: 'BILL-1003', vendor: vendors[2], dueDate: daysFromNow(-3), total: 820.75, paidAmount: 820.75, remainingBalance: 0, status: 'PAID' },
  { id: 4, billNumber: 'BILL-1004', vendor: vendors[0], dueDate: daysFromNow(20), total: 2100, paidAmount: 0, remainingBalance: 2100, status: 'OPEN' },
];

const acct = (id, code, name, netBalance) => ({ id, code, name, netBalance, amount: netBalance });

const balanceSheet = {
  totalAssets: 48250.0,
  assets: { items: [acct(1, '1010', 'Cash at Bank', 21500), acct(2, '1100', 'Accounts Receivable', 17750), acct(3, '1200', 'COD Clearing', 9000)] },
  liabilities: { total: 18400, items: [acct(4, '2010', 'Accounts Payable', 5250), acct(5, '2100', 'Merchant COD Payable', 13150)] },
  equity: { total: 29850, items: [acct(6, '3010', 'Retained Earnings', 24850), acct(7, '3100', 'Current Period Earnings', 5000)] },
  totalLiabilitiesAndEquity: 48250.0,
  isBalanced: true,
  difference: 0,
};

const incomeStatement = {
  revenue: { total: 32000, items: [acct(10, '4010', 'Shipping Revenue', 30000), acct(11, '4020', 'Handling Fees', 2000)] },
  costOfGoodsSold: { total: 19200, items: [acct(12, '5010', 'Carrier Costs', 19200)] },
  grossProfit: 12800,
  grossMarginPercent: 40,
  operatingExpenses: { total: 7800, items: [acct(13, '6010', 'Salaries', 5000), acct(14, '6020', 'Rent', 2800)] },
  netIncome: 5000,
};

const profitability = {
  success: true,
  data: {
    items: [
      { id: 1, trackingNumber: 'TL-100201', carrierCode: 'DHL', createdAt: daysFromNow(-4), customerName: 'Demo Store A', cost: 6.5, revenue: 9.0, profit: 2.5, marginPercent: 27.8, currency: 'KWD', paid: true },
      { id: 2, trackingNumber: 'TL-100202', carrierCode: 'ARAMEX', createdAt: daysFromNow(-3), customerName: 'Sample Shop B', cost: 4.0, revenue: 6.5, profit: 2.5, marginPercent: 38.5, currency: 'KWD', paid: false },
      { id: 3, trackingNumber: 'TL-100203', carrierCode: 'DHL', createdAt: daysFromNow(-1), customerName: 'Example Co. C', cost: 12.0, revenue: 15.0, profit: 3.0, marginPercent: 20, currency: 'KWD', paid: true },
    ],
    summary: { totalRevenue: 30.5, totalCost: 22.5, totalProfit: 8.0, overallMarginPercent: 26.2 },
  },
};

const bankAccounts = [
  { id: 1, accountName: 'Demo Operating Account', currentBalance: 21500, currency: 'KWD' },
  { id: 2, accountName: 'Demo Reserve Account', currentBalance: 8000, currency: 'KWD' },
];

function mockFor(url, method) {
  const p = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (method !== 'GET') return { success: true };
  if (p.endsWith('users/me')) return { success: true, data: DEMO_USER };
  if (p === 'finance/ap/bills') return { success: true, bills };
  if (p === 'finance/ap/vendors') return { success: true, vendors };
  if (p === 'finance/reports/balance-sheet') return { success: true, report: balanceSheet };
  if (p === 'finance/reports/income-statement') return { success: true, report: incomeStatement };
  if (p === 'finance/reports/profitability') return profitability;
  if (p === 'finance/treasury/accounts') return { success: true, accounts: bankAccounts };
  return { success: true, data: [], items: [], accounts: [], organizations: [], shipments: [] };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  localStorage.setItem('token', 'demo-token');
  localStorage.setItem('lastActivityAt', String(Date.now()));
});
await context.route('**/api/**', (route) => {
  const req = route.request();
  const body = mockFor(new URL(req.url()), req.method());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

const page = await context.newPage();
page.on('pageerror', (e) => console.warn('[pageerror]', e.message));

const shot = async (name, locator) => {
  await page.waitForTimeout(600);
  const file = path.join(OUT_DIR, `${name}.png`);
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file });
  console.log('saved', file);
};

await page.goto(`${BASE_URL}/finance`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-tour="finance-header"]', { timeout: 30000 });
await shot('00-finance-overview');
await shot('01-suite-selector', page.locator('[data-tour="finance-suite-selector"]'));

// Switch to the Corporate ERP suite (third suite card)
await page.locator('[data-tour="finance-suite-selector"] button').last().click();

const clickTab = async (re) => page.getByRole('button', { name: re }).first().click();

// Accounts Payable
await clickTab(/Accounts Payable\s*$/);
await page.waitForSelector('[data-tour="ap-bills-table"]');
await shot('10-ap-overview');
await shot('11-ap-kpis', page.locator('[data-tour="ap-kpi-bar"]'));
await shot('12-ap-bills-table', page.locator('[data-tour="ap-bills-table"]'));
await page.locator('[data-tour="ap-action-new-bill"]').click();
await shot('13-ap-new-bill-modal');
await page.keyboard.press('Escape');
await page.locator('[data-tour="ap-action-pay"]').first().click();
await shot('14-ap-pay-bill-modal');
await page.keyboard.press('Escape');

// Financial Statements
await clickTab(/\bStatements\s*$/);
await page.waitForSelector('[data-tour="statements-type-selector"]');
await shot('20-statements-balance-sheet');
await shot('21-statements-equation-check', page.locator('[data-tour="statements-equation-check"]'));
await page.getByRole('button', { name: /income statement/i }).click();
await page.waitForSelector('[data-tour="statements-pnl-breakdown"]');
await shot('22-statements-income-statement');

// Reports
await clickTab(/Profitability Reports/i);
await page.waitForSelector('[data-tour="reports-subnav"]');
await shot('30-reports-overview');

await browser.close();
