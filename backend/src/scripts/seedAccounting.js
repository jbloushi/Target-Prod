require('dotenv').config();
const { prisma } = require('../config/database');

const STANDARD_ACCOUNTS = [
  // ASSETS (1xxx)
  { code: '1010', name: 'NBK Operating Account (KWD)', type: 'ASSET', subType: 'CASH', currency: 'KWD', isSystem: true, description: 'Primary corporate bank account at National Bank of Kuwait' },
  { code: '1020', name: 'Cash in Transit - Driver COD', type: 'ASSET', subType: 'CASH', currency: 'KWD', isSystem: true, description: 'Physical cash held by drivers prior to hub vault remittance' },
  { code: '1030', name: 'Hub Vault Safe Cash', type: 'ASSET', subType: 'CASH', currency: 'KWD', isSystem: true, description: 'Cashier safe at Central Logistics Hub' },
  { code: '1100', name: 'Accounts Receivable (Trade Debtors)', type: 'ASSET', subType: 'AR', currency: 'KWD', isSystem: true, description: 'B2B and individual client receivables' },
  { code: '1150', name: 'Customs Duty Advances Receivable', type: 'ASSET', subType: 'AR', currency: 'KWD', isSystem: true, description: 'Reimbursable customs duty paid on behalf of consignees' },

  // LIABILITIES (2xxx)
  { code: '2010', name: 'Accounts Payable - Carriers', type: 'LIABILITY', subType: 'AP', currency: 'KWD', isSystem: true, description: 'Amounts owed to DHL, LogesTechs, airlines, and linehaul' },
  { code: '2020', name: 'Accounts Payable - Trade Vendors', type: 'LIABILITY', subType: 'AP', currency: 'KWD', isSystem: true, description: 'Suppliers, fuel, equipment leasing, and facility rent' },
  { code: '2100', name: 'Merchant COD Escrow Payable', type: 'LIABILITY', subType: 'CUSTODIAL_ESCROW', currency: 'KWD', isSystem: true, description: 'Fiduciary funds collected from consignees awaiting payout to merchants' },
  { code: '2200', name: 'VAT & Sales Tax Output Payable', type: 'LIABILITY', subType: 'TAX', currency: 'KWD', isSystem: true, description: 'Collected tax liabilities' },

  // EQUITY (3xxx)
  { code: '3010', name: "Owner's Equity & Paid-in Capital", type: 'EQUITY', subType: 'EQUITY', currency: 'KWD', isSystem: true, description: 'Initial paid-in share capital' },
  { code: '3020', name: 'Retained Earnings', type: 'EQUITY', subType: 'EQUITY', currency: 'KWD', isSystem: true, description: 'Cumulative net profit / loss carried forward' },

  // REVENUE (4xxx)
  { code: '4010', name: 'International Express Freight Revenue', type: 'REVENUE', subType: 'OPERATING_REVENUE', currency: 'KWD', isSystem: true, description: 'Billed international air-cargo shipping' },
  { code: '4020', name: 'Domestic Last-Mile Delivery Revenue', type: 'REVENUE', subType: 'OPERATING_REVENUE', currency: 'KWD', isSystem: true, description: 'Local Kuwait parcel delivery fees' },
  { code: '4030', name: 'Customs Clearance & Brokerage Revenue', type: 'REVENUE', subType: 'OPERATING_REVENUE', currency: 'KWD', isSystem: true, description: 'Customs clearance handling service fees' },
  { code: '4040', name: 'COD Handling Fee Commission Revenue', type: 'REVENUE', subType: 'OPERATING_REVENUE', currency: 'KWD', isSystem: true, description: 'Platform collection fee on COD orders' },

  // DIRECT EXPENSES / COGS (5xxx)
  { code: '5010', name: 'Carrier Wholesale Cost - DHL Express', type: 'COGS', subType: 'DIRECT_COST', currency: 'KWD', isSystem: true, description: 'Direct freight costs invoiced by DHL' },
  { code: '5020', name: 'Carrier Wholesale Cost - LogesTechs', type: 'COGS', subType: 'DIRECT_COST', currency: 'KWD', isSystem: true, description: 'Direct freight costs invoiced by LogesTechs' },
  { code: '5030', name: 'Linehaul & Vehicle Fuel Cost', type: 'COGS', subType: 'DIRECT_COST', currency: 'KWD', isSystem: true, description: 'Fuel and transport operating direct costs' },

  // OPERATING EXPENSES (6xxx)
  { code: '6010', name: 'Staff Salaries & Driver Payroll', type: 'EXPENSE', subType: 'EXPENSE', currency: 'KWD', isSystem: true, description: 'Logistics operations and driver payroll' },
  { code: '6020', name: 'Hub Facility Rent & Utilities', type: 'EXPENSE', subType: 'EXPENSE', currency: 'KWD', isSystem: true, description: 'Warehouse and office lease' },
  { code: '6030', name: 'Payment Gateway Processing Fees', type: 'EXPENSE', subType: 'EXPENSE', currency: 'KWD', isSystem: true, description: 'KNET, Credit Card, and Stripe fees' },
  { code: '6040', name: 'Bank Charges & Wire Fees', type: 'EXPENSE', subType: 'EXPENSE', currency: 'KWD', isSystem: true, description: 'Bank charges on outgoing wire transfers' },

  // OTHER GAINS / LOSSES (7xxx)
  { code: '7010', name: 'Foreign Exchange Gain / Loss (IAS 21)', type: 'REVENUE', subType: 'FX', currency: 'KWD', isSystem: true, description: 'Realized and unrealized currency conversion variance' }
];

async function seedAccounting() {
  console.log('🌱 Starting Enterprise Accounting Seed...');
  await prisma.$connect();

  // 1. Seed Accounts
  console.log('📊 Seeding Chart of Accounts (COA)...');
  for (const acc of STANDARD_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: {
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        currency: acc.currency,
        isSystem: acc.isSystem,
        description: acc.description
      },
      create: acc
    });
  }
  console.log(`✅ Seeded ${STANDARD_ACCOUNTS.length} Chart of Accounts entries.`);

  // 2. Seed Default Bank Account
  console.log('🏦 Seeding Bank Accounts...');
  const nbkGlAccount = await prisma.account.findUnique({ where: { code: '1010' } });
  if (nbkGlAccount) {
    const existingBank = await prisma.bankAccount.findFirst({ where: { accountNumber: 'KW00NBK00000012345678' } });
    if (!existingBank) {
      await prisma.bankAccount.create({
        data: {
          accountName: 'NBK Main Operations (KWD)',
          accountNumber: 'KW00NBK00000012345678',
          bankName: 'National Bank of Kuwait (NBK)',
          iban: 'KW00NBK00000012345678',
          swiftCode: 'NBKKKWKW',
          currency: 'KWD',
          glAccountId: nbkGlAccount.id,
          currentBalance: 0
        }
      });
      console.log('✅ Created NBK Operating Bank Account linked to GL 1010.');
    }
  }

  // 3. Seed Default Carriers as Vendors
  console.log('🚚 Seeding Carrier Vendors...');
  const VENDORS = [
    { name: 'DHL Express Kuwait', code: 'DHL', carrierCode: 'DGR', currency: 'KWD', contactPerson: 'DHL Corporate Accounts', email: 'billing@dhl.com', termsDays: 30 },
    { name: 'LogesTechs Last-Mile Fleet', code: 'LOGESTECHS', carrierCode: 'OTE', currency: 'KWD', contactPerson: 'LogesTechs Billing', email: 'finance@logestechs.com', termsDays: 15 },
    { name: 'Target Internal Courier Fleet', code: 'TARGET_INTERNAL', carrierCode: 'INTERNAL', currency: 'KWD', contactPerson: 'Dispatch Ops', email: 'fleet@target-kw.com', termsDays: 0 }
  ];

  for (const v of VENDORS) {
    await prisma.vendor.upsert({
      where: { code: v.code },
      update: {
        name: v.name,
        carrierCode: v.carrierCode,
        currency: v.currency,
        contactPerson: v.contactPerson,
        email: v.email,
        termsDays: v.termsDays
      },
      create: v
    });
  }
  console.log('✅ Seeded Carrier Vendors (DHL, LogesTechs, Fleet).');

  // 4. Seed Current Open Accounting Period
  console.log('📅 Seeding Current Accounting Period...');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const periodName = `${year}-${month}`;
  const startDate = new Date(year, now.getMonth(), 1);
  const endDate = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

  await prisma.accountingPeriod.upsert({
    where: { name: periodName },
    update: { startDate, endDate, isClosed: false },
    create: {
      name: periodName,
      startDate,
      endDate,
      isClosed: false
    }
  });
  console.log(`✅ Seeded Accounting Period ${periodName} (Active & Open).`);

  // 5. Ensure Superadmin Accounts
  try {
    const { ensureAdmin } = require('../../scripts/ensure-admin');
    await ensureAdmin();
  } catch (adminErr) {
    console.warn('⚠️ Could not run ensureAdmin during accounting seed:', adminErr.message);
  }

  console.log('🎉 Enterprise Accounting Seed completed successfully.');
}

if (require.main === module) {
  seedAccounting()
    .catch(err => {
      console.error('❌ Accounting seed failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedAccounting, STANDARD_ACCOUNTS };
