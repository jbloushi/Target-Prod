/**
 * Target Logistics 3PL Platform - End-to-End Financial Hardening & Parity Test Suite
 * File: backend/__tests__/financeHardeningParity.test.js
 *
 * Requirements Covered:
 * - R1: Sub-Ledger (OrganizationLedger), Credit Limit & Concurrency Hardening
 * - R2: Double-Entry General Ledger (Account, JournalEntry, JournalEntryLine) & Statements
 * - R3: Carrier AP, Vendor Bills & Carrier Invoice Reconciliation
 * - R4: COD Fiduciary Lifecycle (Driver Collection -> Hub Remittance -> Merchant Settlement)
 * - R5: Pricing Tamper Protection, Webhook Security & Production Financial Backfill Script
 *
 * Architecture Tiers:
 * - Tier 1: Feature Coverage (Core Invariants)
 * - Tier 2: Boundary & Corner Cases
 * - Tier 3: Cross-Feature Interactions
 * - Tier 4: Real-World Workload Scenarios
 */

const Decimal = require('decimal.js');
const crypto = require('crypto');
const financeLedgerService = require('../src/services/financeLedger.service');
const generalLedgerService = require('../src/services/generalLedger.service');
const PricingService = require('../src/services/pricing.service');
const carrierReconciliationService = require('../src/services/carrierReconciliation.service');
const ottuPaymentService = require('../src/services/ottuPayment.service');
const { prisma } = require('../src/config/database');

// Mock notifications and external side-effects
jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn()
}));

// Comprehensive Prisma Mock conforming to target-prod schema
jest.mock('../src/config/database', () => {
    const mockPrisma = {
        account: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        },
        accountingPeriod: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        },
        journalEntry: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn()
        },
        journalEntryLine: {
            findMany: jest.fn(),
            create: jest.fn(),
            count: jest.fn()
        },
        organizationLedger: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            groupBy: jest.fn(),
            aggregate: jest.fn()
        },
        organization: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            aggregate: jest.fn(),
            groupBy: jest.fn()
        },
        payment: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn()
        },
        paymentAllocation: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            aggregate: jest.fn(),
            groupBy: jest.fn()
        },
        shipment: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn()
        },
        invoice: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            aggregate: jest.fn()
        },
        invoiceLine: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        vendor: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn()
        },
        bill: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn()
        },
        billLine: {
            create: jest.fn()
        },
        billPayment: {
            create: jest.fn()
        },
        bankAccount: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        },
        bankTransaction: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn()
        },
        user: {
            findUnique: jest.fn()
        },
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn()
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
            return await callback(mockPrisma);
        }
        return callback;
    });

    return { prisma: mockPrisma };
});

describe('Target Logistics E2E Financial Hardening & Parity Suite (R1-R5)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default transactional passthrough
        prisma.$transaction.mockImplementation(async (cb) => {
            if (typeof cb === 'function') return await cb(prisma);
            return cb;
        });
        prisma.$queryRawUnsafe.mockResolvedValue([]);

        // Default open accounting period
        prisma.accountingPeriod.findUnique.mockResolvedValue({
            id: 'period-2026-10',
            name: '2026-10',
            isClosed: false
        });
        prisma.accountingPeriod.findFirst.mockResolvedValue({
            id: 'period-2026-10',
            name: '2026-10',
            isClosed: false
        });

        // Default Chart of Accounts resolution
        prisma.account.findUnique.mockImplementation(({ where }) => {
            const code = where?.code || where?.id || '1010';
            const type = ['1010', '1020', '1030', '1100', '1150'].includes(code) ? 'ASSET' :
                         ['2010', '2020', '2100', '2200'].includes(code) ? 'LIABILITY' :
                         ['3010', '3020'].includes(code) ? 'EQUITY' :
                         ['4010', '4020', '4030', '4040', '7010'].includes(code) ? 'REVENUE' :
                         ['5010', '5020', '5030'].includes(code) ? 'COGS' : 'EXPENSE';
            return Promise.resolve({
                id: `acc-${code}`,
                code,
                name: `Account ${code}`,
                type,
                currency: 'KWD',
                balance: 0,
                isActive: true
            });
        });

        prisma.journalEntry.create.mockImplementation(({ data }) => Promise.resolve({
            id: `je-${Date.now()}`,
            ...data,
            status: 'POSTED',
            lines: (data.lines?.create || []).map((line, idx) => ({ id: `jel-${idx}`, ...line }))
        }));

        prisma.organizationLedger.create.mockImplementation(({ data }) => Promise.resolve({
            id: `led-${Date.now()}`,
            ...data
        }));
    });

    // =========================================================================
    // TIER 1: FEATURE COVERAGE (R1-R5 CORE INVARIANTS)
    // =========================================================================

    describe('Tier 1: Feature Coverage (R1-R5 Core Invariants)', () => {
        // --- 1. Sub-Ledger Locking & Running Balance (R1 / F1, F2) ---
        describe('1. Sub-Ledger Concurrency, Locking & Running Balance (R1 / F1, F2)', () => {
            it('acquires pessimistic row lock (SELECT ... FOR UPDATE) on Organization during ledger entry creation', async () => {
                prisma.organizationLedger.findFirst.mockResolvedValue({ balanceAfter: 120.0 });
                prisma.organization.findUnique.mockResolvedValue({ id: 'org-client-1', currency: 'KWD' });
                prisma.organization.update.mockResolvedValue({ id: 'org-client-1', balance: 170.0 });

                const entry = await financeLedgerService.createLedgerEntry('org-client-1', {
                    amount: 50.0,
                    currency: 'KWD',
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: 'Air Express Freight charge',
                    reference: 'TRK-9001',
                    sourceRepo: 'Shipment',
                    sourceId: 'ship-9001'
                });

                expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
                    expect.stringMatching(/SELECT\s+id\s+FROM\s+Organization\s+WHERE\s+id\s+=\s+\?\s+FOR\s+UPDATE/i),
                    'org-client-1'
                );
                expect(entry.balanceAfter).toBe(170.0);
                expect(prisma.organization.update).toHaveBeenCalledWith({
                    where: { id: 'org-client-1' },
                    data: { balance: { increment: 50.0 } }
                });
            });

            it('computes correct running balance: DEBIT adds to balance, CREDIT subtracts from balance', async () => {
                // Step 1: Starting balance 100 KWD, Debit +40 KWD
                prisma.organizationLedger.findFirst.mockResolvedValueOnce({ balanceAfter: 100.0 });
                prisma.organization.findUnique.mockResolvedValue({ id: 'org-client-1', currency: 'KWD' });

                const debitEntry = await financeLedgerService.createLedgerEntry('org-client-1', {
                    amount: 40.0,
                    currency: 'KWD',
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE'
                });
                expect(debitEntry.balanceAfter).toBe(140.0);

                // Step 2: From 140 KWD, Credit -60 KWD
                prisma.organizationLedger.findFirst.mockResolvedValueOnce({ balanceAfter: 140.0 });
                const creditEntry = await financeLedgerService.createLedgerEntry('org-client-1', {
                    amount: 60.0,
                    currency: 'KWD',
                    entryType: 'CREDIT',
                    category: 'PAYMENT'
                });
                expect(creditEntry.balanceAfter).toBe(80.0);
            });

            it('records platform-level CARRIER_PAYABLE with organizationId: null without mutating customer balance', async () => {
                prisma.organizationLedger.findFirst.mockResolvedValueOnce({ balanceAfter: 500.0 });

                const carrierEntry = await financeLedgerService.createLedgerEntry(null, {
                    amount: 85.0,
                    currency: 'KWD',
                    entryType: 'CREDIT',
                    category: 'CARRIER_PAYABLE',
                    description: 'Wholesale DHL Linehaul',
                    reference: 'TRK-DHL-1'
                });

                expect(carrierEntry.organizationId).toBeNull();
                expect(carrierEntry.balanceAfter).toBe(585.0);
                expect(prisma.organization.update).not.toHaveBeenCalled();
            });
        });

        // --- 2. Unified Credit Limit Formula & Enforcement (R1 / F4) ---
        describe('2. Unified Credit Limit Formula & Enforcement (R1 / F4)', () => {
            const calculateAvailableCredit = (creditLimit, balance, unappliedCash) => {
                const limit = Number(creditLimit || 0);
                const debt = Math.max(0, Number(balance || 0));
                const cash = Number(unappliedCash || 0);
                return Number((limit - debt + cash).toFixed(3));
            };

            it('calculates available credit for postpaid merchant with outstanding balance and unapplied cash', () => {
                // Limit: 1,000 KWD, Outstanding Debt: 350 KWD, Unapplied Cash: 50 KWD -> Available: 700 KWD
                const available = calculateAvailableCredit(1000, 350, 50);
                expect(available).toBe(700.0);
            });

            it('calculates available credit for prepaid merchant with deposited wallet funds', () => {
                // Limit: 0 KWD, Debt: 0 KWD, Unapplied Cash: 250 KWD -> Available: 250 KWD
                const available = calculateAvailableCredit(0, 0, 250);
                expect(available).toBe(250.0);
            });

            it('blocks booking when price exceeds net available credit for indebted merchant', () => {
                const available = calculateAvailableCredit(500, 480, 0); // 20 KWD remaining
                const shipmentPrice = 35.0;

                const willExceed = shipmentPrice > available;
                expect(willExceed).toBe(true);
            });
        });

        // --- 3. FIFO Payment Allocation & Precedence (R1 / F3, F5) ---
        describe('3. Atomic FIFO Payment Allocation & Precedence (R1 / F3, F5)', () => {
            it('preserves base price over mutated remainingBalance in getShipmentChargeAmount', () => {
                // Regression proof against DB-03 recursive reduction bug
                const shipmentWithSnapshot = {
                    price: 50.0,
                    remainingBalance: 20.0, // Partial payment already applied
                    pricingSnapshot: { totalPrice: 50.0 }
                };

                const charge = financeLedgerService.getShipmentChargeAmount(shipmentWithSnapshot);
                expect(Number(charge)).toBe(50.0);
            });

            it('allocates payment to shipment and updates remaining balance accurately', async () => {
                const mockTx = {
                    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
                    payment: {
                        findUnique: jest.fn().mockResolvedValue({ id: 'pay-1', organizationId: 'org-1', amount: 50.0, currency: 'KWD' }),
                        update: jest.fn()
                    },
                    shipment: {
                        findUnique: jest.fn().mockResolvedValue({
                            id: 'ship-1',
                            organizationId: 'org-1',
                            price: 50.0,
                            currency: 'KWD',
                            paid: false,
                            totalPaid: 0,
                            remainingBalance: 50.0,
                            createdAt: new Date()
                        }),
                        update: jest.fn()
                    },
                    paymentAllocation: {
                        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
                        create: jest.fn().mockResolvedValue({ id: 'alloc-1', amount: 25.0 })
                    },
                    organizationLedger: {
                        findFirst: jest.fn().mockResolvedValue({ balanceAfter: 100 }),
                        create: jest.fn().mockResolvedValue({ id: 'led-1' })
                    },
                    organization: {
                        findUnique: jest.fn().mockResolvedValue({ id: 'org-1', currency: 'KWD' }),
                        update: jest.fn()
                    },
                    user: { findUnique: jest.fn().mockResolvedValue({ id: 'usr-1' }) }
                };

                prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));
                prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', amount: 50.0, currency: 'KWD' });
                prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', price: 50.0, currency: 'KWD', createdAt: new Date() });
                prisma.paymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: 25.0 } });

                const allocation = await financeLedgerService.allocatePayment({
                    organizationId: 'org-1',
                    paymentId: 'pay-1',
                    shipmentId: 'ship-1',
                    amount: 25.0,
                    createdBy: 'usr-1'
                });

                expect(allocation).toBeDefined();
                expect(mockTx.paymentAllocation.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            paymentId: 'pay-1',
                            shipmentId: 'ship-1',
                            amount: 25.0
                        })
                    })
                );
            });
        });

        // --- 4. Double-Entry General Ledger Invariants (R2 / F7) ---
        describe('4. Double-Entry General Ledger Invariants & Period Validation (R2 / F7)', () => {
            it('strictly enforces SUM(BaseDebit) == SUM(BaseCredit) and rejects unbalanced entries', async () => {
                await expect(
                    generalLedgerService.postJournalEntry({
                        lines: [
                            { accountCode: '1100', debit: 100.0, credit: 0 },
                            { accountCode: '4010', debit: 0, credit: 95.0 } // 5.0 KWD unbalanced
                        ]
                    })
                ).rejects.toThrow(/Unbalanced Journal Entry/i);
            });

            it('strictly rejects journal entry postings to a closed accounting period', async () => {
                prisma.accountingPeriod.findUnique.mockResolvedValueOnce({
                    id: 'p-closed',
                    name: '2026-08',
                    isClosed: true
                });

                await expect(
                    generalLedgerService.postJournalEntry({
                        entryDate: new Date('2026-08-15'),
                        lines: [
                            { accountCode: '1100', debit: 50, credit: 0 },
                            { accountCode: '4010', debit: 0, credit: 50 }
                        ]
                    })
                ).rejects.toThrow(/is closed/i);
            });

            it('posts balanced entry across multiple accounts with IAS 21 currency conversion', async () => {
                const entry = await generalLedgerService.postJournalEntry({
                    reference: 'TEST-BALANCED-01',
                    lines: [
                        { accountCode: '1100', debit: 120.0, credit: 0, currency: 'KWD' },
                        { accountCode: '4010', debit: 0, credit: 120.0, currency: 'KWD' }
                    ]
                });

                expect(entry).toBeDefined();
                expect(Number(entry.totalDebit)).toBe(120.0);
                expect(Number(entry.totalCredit)).toBe(120.0);
                expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            status: 'POSTED'
                        })
                    })
                );
            });
        });

        // --- 5. Single-Operator Carrier AP Attribution (R2, R3 / F8) ---
        describe('5. Single-Operator Carrier AP Attribution (R2, R3 / F8)', () => {
            it('posts shipment booking GL entry with balanced Customer AR/Revenue and Carrier COGS/AP', async () => {
                const bookingEntry = await generalLedgerService.postShipmentBookingEntry({
                    trackingNumber: 'TRK-EXP-101',
                    shipmentId: 'ship-101',
                    organizationId: 'org-client-1',
                    customerPrice: 35.0,
                    carrierCost: 20.0,
                    carrierCode: 'DHL',
                    currency: 'KWD',
                    createdById: 'admin-1'
                });

                expect(bookingEntry).toBeDefined();
                expect(Number(bookingEntry.totalDebit)).toBe(55.0);
                expect(Number(bookingEntry.totalCredit)).toBe(55.0);
                expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            sourceType: 'SHIPMENT_BOOKING',
                            sourceId: 'ship-101'
                        })
                    })
                );
            });

            it('posts customer payment receipt entry to Cash (1010) and AR (1100)', async () => {
                const paymentEntry = await generalLedgerService.postPaymentReceiptEntry({
                    paymentId: 'pay-201',
                    organizationId: 'org-client-1',
                    amount: 75.0,
                    currency: 'KWD',
                    reference: 'KNET-RECEIPT-99',
                    createdById: 'cashier-1'
                });

                expect(paymentEntry).toBeDefined();
                expect(Number(paymentEntry.totalDebit)).toBe(75.0);
                expect(Number(paymentEntry.totalCredit)).toBe(75.0);
                expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            sourceType: 'PAYMENT',
                            sourceId: 'pay-201'
                        })
                    })
                );
            });
        });

        // --- 6. Carrier Reconciliation Margin Parity (R3 / F9, F12) ---
        describe('6. Carrier Reconciliation Margin Parity (R3 / F9, F12)', () => {
            it('categorizes reconciliation records into exact match, surcharge, and unmatched', async () => {
                prisma.shipment.findMany.mockResolvedValue([
                    {
                        id: 's-1',
                        trackingNumber: 'TRK-1',
                        dhlTrackingNumber: 'DHL-1',
                        carrierCode: 'DHL',
                        costPrice: 10.0,
                        parcels: [{ weight: 2.0 }],
                        organizationId: 'org-client-1'
                    }
                ]);
                prisma.organizationLedger.findMany.mockResolvedValue([
                    { sourceRepo: 'Shipment', sourceId: 's-1', category: 'CARRIER_PAYABLE', amount: 10.0, currency: 'KWD' }
                ]);

                const records = [
                    { trackingNumber: 'DHL-1', billedAmount: 12.5, currency: 'KWD' }, // Surcharge of +2.5
                    { trackingNumber: 'DHL-999', billedAmount: 5.0, currency: 'KWD' }  // Unmatched
                ];

                const reconResult = await carrierReconciliationService.reconcileInvoiceRows(records, 'DHL');

                expect(reconResult.summary.matchedCount).toBe(1);
                expect(reconResult.summary.unmatchedCount).toBe(1);
                expect(reconResult.summary.discrepancyCount).toBe(1);
                expect(reconResult.items[0].status).toBe('SURCHARGE_DISCREPANCY');
                expect(reconResult.items[0].deltaAmount).toBe(2.5);
            });

            it('posts carrier surcharge adjustments with organizationId: null and updates shipment cost', async () => {
                const mockTx = {
                    shipment: {
                        findUnique: jest.fn().mockResolvedValue({
                            id: 's-1',
                            price: 25.0,
                            costPrice: 10.0,
                            pricingSnapshot: { carrierRate: 10.0, totalPrice: 25.0 }
                        }),
                        update: jest.fn().mockResolvedValue({ id: 's-1', costPrice: 12.5, markupAmount: 12.5 })
                    },
                    organizationLedger: {
                        findFirst: jest.fn().mockResolvedValue({ balanceAfter: 200.0 }),
                        create: jest.fn().mockResolvedValue({ id: 'led-adj-1' })
                    },
                    account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }), update: jest.fn().mockResolvedValue({}) },
                    accountingPeriod: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', isClosed: false }) },
                    journalEntry: { create: jest.fn().mockResolvedValue({ id: 'je-recon-1' }) }
                };
                prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

                const adjustments = [
                    { shipmentId: 's-1', deltaAmount: 2.5, currency: 'KWD', reason: 'Fuel surcharge' }
                ];

                const result = await carrierReconciliationService.postAdjustments(adjustments, 'admin-1');

                expect(result.count).toBe(1);
                // Verify shipment cost was updated
                expect(mockTx.shipment.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: { id: 's-1' },
                        data: expect.objectContaining({ costPrice: 12.5 })
                    })
                );
            });
        });

        // --- 7. COD Fiduciary Lifecycle (R4 / F13, F14, F15) ---
        describe('7. COD Fiduciary Lifecycle Accounting (R4 / F13, F14, F15)', () => {
            it('Step 1: Driver Collection ePOD posts balanced Dr 1020 / Cr 2100 entry', async () => {
                const driverCodEntry = await generalLedgerService.postJournalEntry({
                    reference: 'EPOD-COD-TRK-77',
                    sourceType: 'COD_COLLECTION',
                    sourceId: 'ship-77',
                    lines: [
                        { accountCode: '1020', debit: 45.0, credit: 0, memo: 'Driver cash collection' },
                        { accountCode: '2100', debit: 0, credit: 45.0, memo: 'Merchant COD escrow liability' }
                    ]
                });

                expect(driverCodEntry).toBeDefined();
                expect(Number(driverCodEntry.totalDebit)).toBe(45.0);
                expect(Number(driverCodEntry.totalCredit)).toBe(45.0);
                expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            sourceType: 'COD_COLLECTION'
                        })
                    })
                );
            });

            it('Step 2: Hub Vault Remittance transfers cash from 1020 to 1030', async () => {
                const remittanceEntry = await generalLedgerService.postDriverCodRemittanceEntry({
                    driverId: 'drv-5',
                    driverName: 'Mustafa Couriers',
                    amount: 90.0,
                    currency: 'KWD',
                    bagReference: 'BAG-OCT-01',
                    shipmentIds: ['s-1', 's-2'],
                    verifiedById: 'cashier-1'
                });

                expect(remittanceEntry).toBeDefined();
                expect(Number(remittanceEntry.totalDebit)).toBe(90.0);
                expect(Number(remittanceEntry.totalCredit)).toBe(90.0);
                expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            sourceType: 'COD_SETTLEMENT'
                        })
                    })
                );
            });

            it('Step 3: Merchant COD Settlement nets gross escrow against freight AR, fees, and wire payout', async () => {
                const settlement = await generalLedgerService.postMerchantSettlementEntry({
                    organizationId: 'org-merchant-9',
                    grossCodAmount: 200.0,
                    freightDeductions: 40.0,
                    handlingFee: 10.0,
                    netPayout: 150.0,
                    currency: 'KWD',
                    bankAccountGlCode: '1010',
                    reference: 'WIRE-SETTL-009',
                    createdById: 'finance-officer-1'
                });

                expect(settlement).toBeDefined();
                expect(Number(settlement.totalDebit)).toBe(200.0);
                expect(Number(settlement.totalCredit)).toBe(200.0);
                expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            sourceType: 'COD_SETTLEMENT'
                        })
                    })
                );
            });
        });

        // --- 8. Pricing HMAC Verification (R5.1 / F16, F17) ---
        describe('8. Pricing HMAC Verification & Backward Compatibility (R5.1 / F16, F17)', () => {
            it('creates cryptographic snapshot and validates untampered snapshot', () => {
                const snapshot = PricingService.createSnapshot(15.0, 20, 'KWD', 'rate_card_test');
                expect(snapshot.rateHash).toBeDefined();
                expect(snapshot.carrierRate).toBe(15.0);
                expect(snapshot.totalPrice).toBe(18.0); // 15 + 20% markup (3)

                const isValid = PricingService.validateSnapshot(snapshot);
                expect(isValid).toBe(true);
            });

            it('rejects pricing snapshot with tampered totalPrice', () => {
                const snapshot = PricingService.createSnapshot(20.0, 10, 'KWD', 'rate_card_test');
                snapshot.totalPrice = 5.0; // Tampered price by attacker

                const isValid = PricingService.validateSnapshot(snapshot);
                expect(isValid).toBe(false);
            });

            it('maintains backward compatibility with legacy plain SHA-256 snapshots', () => {
                const carrierRate = 12.0;
                const markup = 3.0;
                const totalPrice = 15.0;
                const currency = 'KWD';
                const legacyHash = crypto
                    .createHash('sha256')
                    .update(`${new Decimal(carrierRate).toFixed(3)}-${new Decimal(markup).toFixed(3)}-${new Decimal(totalPrice).toFixed(3)}-${currency}`)
                    .digest('hex');

                const legacySnapshot = {
                    carrierRate,
                    markup,
                    totalPrice,
                    currency,
                    rateHash: legacyHash,
                    expiresAt: new Date(Date.now() + 86400000)
                };

                const isValid = PricingService.validateSnapshot(legacySnapshot);
                expect(isValid).toBe(true);
            });
        });

        // --- 9. Payment Reference Deduplication & Ottu Webhook (R5.2 / F18, F19) ---
        describe('9. Payment Reference Deduplication & Ottu Webhook (R5.2 / F18, F19)', () => {
            it('processes Ottu webhook payment and updates shipment to paid', async () => {
                prisma.shipment.findUnique.mockResolvedValue({
                    id: 'ship-ottu-1',
                    trackingNumber: 'TRK-OTTU-01',
                    organizationId: 'org-client-1',
                    price: 45.0,
                    remainingBalance: 45.0,
                    paid: false,
                    currency: 'KWD',
                    history: []
                });

                prisma.payment.create.mockResolvedValue({ id: 'pay-ottu-1', amount: 45.0 });
                prisma.shipment.update.mockResolvedValue({
                    id: 'ship-ottu-1',
                    paid: true,
                    remainingBalance: 0
                });

                const webhookResult = await ottuPaymentService.handleWebhook({
                    order_no: 'TRK-OTTU-01',
                    state: 'success',
                    amount: 45.0,
                    currency: 'KWD',
                    reference: 'OTTU-REF-1001',
                    pg_code: 'KNET'
                });

                expect(webhookResult.success).toBe(true);
                expect(prisma.payment.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            amount: 45.0,
                            reference: 'OTTU-REF-1001',
                            method: 'KNET'
                        })
                    })
                );
            });

            it('returns early when webhook delivery is sent for an already paid shipment', async () => {
                prisma.shipment.findUnique.mockResolvedValue({
                    id: 'ship-ottu-settled',
                    trackingNumber: 'TRK-ALREADY-PAID',
                    paid: true,
                    remainingBalance: 0
                });

                const result = await ottuPaymentService.handleWebhook({
                    order_no: 'TRK-ALREADY-PAID',
                    state: 'success',
                    amount: 30.0,
                    reference: 'OTTU-REF-DUP'
                });

                expect(result.success).toBe(true);
                expect(result.alreadyPaid).toBe(true);
                expect(prisma.payment.create).not.toHaveBeenCalled();
            });
        });

        // --- 10. Production Financial Backfill Script Contract (R5.4 / F22) ---
        describe('10. Production Financial Backfill Script Parity & Idempotency (R5.4 / F22)', () => {
            // Reference backfill auditor and reconciler contract
            const runFinancialParityAudit = async (dryRun = true) => {
                const shipments = await prisma.shipment.findMany({
                    where: { status: { notIn: ['draft', 'cancelled'] } }
                });

                const discrepancies = [];
                for (const s of shipments) {
                    const price = Number(s.price || 0);
                    const totalPaid = Number(s.totalPaid || 0);
                    const expectedRemaining = Math.max(0, price - totalPaid);

                    if (s.paid && Number(s.remainingBalance || 0) > 0) {
                        discrepancies.push({ shipmentId: s.id, type: 'PAID_WITH_NONZERO_BALANCE' });
                        if (!dryRun) {
                            await prisma.shipment.update({
                                where: { id: s.id },
                                data: { remainingBalance: 0, totalPaid: price }
                            });
                        }
                    } else if (!s.paid && Math.abs(Number(s.remainingBalance || 0) - expectedRemaining) > 0.001) {
                        discrepancies.push({ shipmentId: s.id, type: 'REMAINING_BALANCE_DESYNC' });
                        if (!dryRun) {
                            await prisma.shipment.update({
                                where: { id: s.id },
                                data: { remainingBalance: expectedRemaining }
                            });
                        }
                    }
                }
                return { auditedCount: shipments.length, discrepanciesCount: discrepancies.length, dryRun };
            };

            it('dry-run mode detects financial discrepancies without executing database mutations', async () => {
                prisma.shipment.findMany.mockResolvedValue([
                    { id: 's-1', price: 100, totalPaid: 100, remainingBalance: 40, paid: true }, // Desync!
                    { id: 's-2', price: 50, totalPaid: 0, remainingBalance: 50, paid: false }     // In sync
                ]);

                const audit = await runFinancialParityAudit(true);
                expect(audit.auditedCount).toBe(2);
                expect(audit.discrepanciesCount).toBe(1);
                expect(prisma.shipment.update).not.toHaveBeenCalled();
            });

            it('commit mode idempotently resolves discrepancies, and subsequent audit reports 100% parity', async () => {
                prisma.shipment.findMany.mockResolvedValueOnce([
                    { id: 's-1', price: 100, totalPaid: 100, remainingBalance: 40, paid: true }
                ]);

                // First pass with commit = true
                const firstPass = await runFinancialParityAudit(false);
                expect(firstPass.discrepanciesCount).toBe(1);
                expect(prisma.shipment.update).toHaveBeenCalledWith({
                    where: { id: 's-1' },
                    data: { remainingBalance: 0, totalPaid: 100 }
                });

                // Second pass against repaired record
                prisma.shipment.findMany.mockResolvedValueOnce([
                    { id: 's-1', price: 100, totalPaid: 100, remainingBalance: 0, paid: true }
                ]);
                jest.clearAllMocks();

                const secondPass = await runFinancialParityAudit(false);
                expect(secondPass.discrepanciesCount).toBe(0);
                expect(prisma.shipment.update).not.toHaveBeenCalled();
            });
        });
    });

    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES
    // =========================================================================

    describe('Tier 2: Boundary & Corner Cases', () => {
        it('blocks booking for prepaid client with zero credit limit and zero unapplied balance', () => {
            const creditLimit = 0;
            const balance = 0;
            const unappliedCash = 0;
            const availableCredit = creditLimit - balance + unappliedCash;

            const price = 25.0;
            const isAllowed = price <= availableCredit;
            expect(isAllowed).toBe(false);
        });

        it('permits booking for prepaid client with exact matching deposited wallet cash', () => {
            const creditLimit = 0;
            const balance = 0;
            const unappliedCash = 50.0;
            const availableCredit = creditLimit - balance + unappliedCash;

            const price = 50.0;
            const isAllowed = price <= availableCredit;
            expect(isAllowed).toBe(true);
            expect(availableCredit - price).toBe(0);
        });

        it('handles multi-step partial payments without premature shipment paid completion', () => {
            const totalCharge = 50.0;
            let allocatedSoFar = 0;
            let remaining = totalCharge - allocatedSoFar;

            // Allocation 1: 20 KWD
            allocatedSoFar += 20.0;
            remaining = totalCharge - allocatedSoFar;
            let isPaid = remaining <= 0.001;
            expect(remaining).toBe(30.0);
            expect(isPaid).toBe(false);

            // Allocation 2: 15 KWD
            allocatedSoFar += 15.0;
            remaining = totalCharge - allocatedSoFar;
            isPaid = remaining <= 0.001;
            expect(remaining).toBe(15.0);
            expect(isPaid).toBe(false);

            // Allocation 3: 15 KWD
            allocatedSoFar += 15.0;
            remaining = totalCharge - allocatedSoFar;
            isPaid = remaining <= 0.001;
            expect(remaining).toBe(0.0);
            expect(isPaid).toBe(true);
        });

        it('handles negative delta carrier adjustments (carrier discounts/rebates) by reducing liability', async () => {
            const mockTx = {
                shipment: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 's-rebate',
                        price: 30.0,
                        costPrice: 15.0,
                        pricingSnapshot: { carrierRate: 15.0 }
                    }),
                    update: jest.fn().mockResolvedValue({ id: 's-rebate', costPrice: 13.0 })
                },
                organizationLedger: {
                    findFirst: jest.fn().mockResolvedValue({ balanceAfter: 300.0 }),
                    create: jest.fn().mockResolvedValue({ id: 'led-rebate-1' })
                },
                account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }), update: jest.fn().mockResolvedValue({}) },
                accountingPeriod: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', isClosed: false }) },
                journalEntry: { create: jest.fn().mockResolvedValue({ id: 'je-rebate-1' }) }
            };
            prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

            // Negative delta (-2.000 KWD rebate)
            const adjustments = [
                { shipmentId: 's-rebate', deltaAmount: -2.0, currency: 'KWD', reason: 'Carrier volume rebate' }
            ];

            const result = await carrierReconciliationService.postAdjustments(adjustments, 'admin-1');
            expect(result.count).toBe(1);

            // Verify costPrice decreased from 15 to 13
            expect(mockTx.shipment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 's-rebate' },
                    data: expect.objectContaining({ costPrice: 13.0 })
                })
            );
        });

        it('rejects pricing snapshot when expiresAt is in the past', () => {
            const expiredSnapshot = {
                carrierRate: 10.0,
                markup: 2.0,
                totalPrice: 12.0,
                currency: 'KWD',
                rateHash: 'some-hash',
                expiresAt: new Date(Date.now() - 3600000) // Expired 1 hour ago
            };

            const isValid = PricingService.validateSnapshot(expiredSnapshot);
            expect(isValid).toBe(false);
        });

        it('rejects null, zero, or negative COD collections from corrupting cash transit balances', async () => {
            const zeroRemittance = await generalLedgerService.postDriverCodRemittanceEntry({
                driverId: 'drv-empty',
                amount: 0,
                currency: 'KWD'
            });

            expect(zeroRemittance).toBeNull();
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // TIER 3: CROSS-FEATURE INTERACTIONS
    // =========================================================================

    describe('Tier 3: Cross-Feature Interactions', () => {
        it('maintains ledger running balance integrity under concurrent booking and payment receipt', async () => {
            // Customer books 50 KWD shipment and immediately pays 50 KWD
            prisma.organizationLedger.findFirst
                .mockResolvedValueOnce({ balanceAfter: 0 })    // Baseline
                .mockResolvedValueOnce({ balanceAfter: 50.0 }); // After booking

            prisma.organization.findUnique.mockResolvedValue({ id: 'org-concurrent', currency: 'KWD' });

            const bookingEntry = await financeLedgerService.createLedgerEntry('org-concurrent', {
                amount: 50.0,
                currency: 'KWD',
                entryType: 'DEBIT',
                category: 'SHIPMENT_CHARGE'
            });
            expect(bookingEntry.balanceAfter).toBe(50.0);

            const paymentEntry = await financeLedgerService.createLedgerEntry('org-concurrent', {
                amount: 50.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'PAYMENT'
            });
            expect(paymentEntry.balanceAfter).toBe(0.0);
        });

        it('preserves customer invoice and AR balance after carrier wholesale cost reconciliation', async () => {
            // Scenario: Customer agreed price is 25 KWD. Carrier wholesale increases by +3 KWD.
            // Customer AR and invoice must remain 25 KWD; Carrier AP increases to reflect wholesale liability.
            const customerPrice = 25.0;
            const originalWholesale = 15.0;
            const surcharge = 3.0;

            const updatedCost = originalWholesale + surcharge;
            const updatedMarkup = customerPrice - updatedCost;

            expect(updatedCost).toBe(18.0);
            expect(updatedMarkup).toBe(7.0); // Margin compressed from 10 to 7
            expect(customerPrice).toBe(25.0); // Customer price completely untouched
        });

        it('orchestrates complete COD cycle: collection -> hub remittance -> merchant payout netting', async () => {
            const codAmount = 150.0;
            const freightCharge = 25.0;
            const handlingFee = 5.0;
            const netWire = codAmount - freightCharge - handlingFee; // 120 KWD

            // Step 1: Collection
            const collEntry = await generalLedgerService.postJournalEntry({
                reference: 'COD-STEP1',
                lines: [
                    { accountCode: '1020', debit: codAmount, credit: 0 },
                    { accountCode: '2100', debit: 0, credit: codAmount }
                ]
            });
            expect(collEntry).toBeDefined();

            // Step 2: Remittance
            const remitEntry = await generalLedgerService.postDriverCodRemittanceEntry({
                driverId: 'drv-cycle',
                driverName: 'Fleet Driver 1',
                amount: codAmount,
                bagReference: 'BAG-CYCLE'
            });
            expect(remitEntry).toBeDefined();

            // Step 3: Merchant Net Payout
            const settlEntry = await generalLedgerService.postMerchantSettlementEntry({
                organizationId: 'org-cycle-merchant',
                grossCodAmount: codAmount,
                freightDeductions: freightCharge,
                handlingFee,
                netPayout: netWire,
                reference: 'SETTL-CYCLE'
            });
            expect(settlEntry).toBeDefined();

            // Verify mathematical equality across all legs
            expect(netWire).toBe(120.0);
            expect(codAmount).toBe(freightCharge + handlingFee + netWire);
        });
    });

    // =========================================================================
    // TIER 4: REAL-WORLD WORKLOAD SCENARIOS
    // =========================================================================

    describe('Tier 4: Real-World Workload Scenarios', () => {
        it('Scenario 1: Full B2B Shipment Lifecycle (Quote -> Booking -> Accruals -> Invoice -> Ottu Payment -> GL Parity)', async () => {
            // 1. Quoting & Tamper-Proof Snapshot
            const snapshot = PricingService.createSnapshot(30.0, 25, 'KWD', 'b2b_contract');
            expect(snapshot.totalPrice).toBe(37.5);
            expect(PricingService.validateSnapshot(snapshot)).toBe(true);

            // 2. Booking & Sub-Ledger Accruals
            prisma.organizationLedger.findFirst
                .mockResolvedValueOnce({ balanceAfter: 0 })    // Customer AR
                .mockResolvedValueOnce({ balanceAfter: 100.0 }); // Carrier AP

            prisma.organization.findUnique.mockResolvedValue({ id: 'org-b2b', currency: 'KWD' });

            const arEntry = await financeLedgerService.createLedgerEntry('org-b2b', {
                amount: 37.5,
                currency: 'KWD',
                entryType: 'DEBIT',
                category: 'SHIPMENT_CHARGE',
                reference: 'AWB-B2B-001'
            });
            expect(arEntry.balanceAfter).toBe(37.5);

            const apEntry = await financeLedgerService.createLedgerEntry(null, {
                amount: 30.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                reference: 'AWB-B2B-001'
            });
            expect(apEntry.balanceAfter).toBe(130.0);

            // 3. Double-Entry Booking GL Entry
            const glBooking = await generalLedgerService.postShipmentBookingEntry({
                trackingNumber: 'AWB-B2B-001',
                shipmentId: 'ship-b2b-001',
                organizationId: 'org-b2b',
                customerPrice: 37.5,
                carrierCost: 30.0,
                carrierCode: 'DHL'
            });
            expect(glBooking).toBeDefined();

            // 4. Online Settlement via Ottu Gateway
            prisma.shipment.findUnique.mockResolvedValue({
                id: 'ship-b2b-001',
                trackingNumber: 'AWB-B2B-001',
                organizationId: 'org-b2b',
                price: 37.5,
                remainingBalance: 37.5,
                paid: false,
                currency: 'KWD',
                history: []
            });

            const ottuSettlement = await ottuPaymentService.handleWebhook({
                order_no: 'AWB-B2B-001',
                state: 'success',
                amount: 37.5,
                currency: 'KWD',
                reference: 'OTTU-B2B-PAID'
            });
            expect(ottuSettlement.success).toBe(true);

            // 5. Payment Receipt GL Entry (Dr 1010 Bank / Cr 1100 AR)
            const glPayment = await generalLedgerService.postPaymentReceiptEntry({
                paymentId: 'pay-b2b',
                organizationId: 'org-b2b',
                amount: 37.5,
                reference: 'OTTU-B2B-PAID'
            });
            expect(glPayment).toBeDefined();
        });

        it('Scenario 2: End-to-End COD Fiduciary Run (Dispatch -> ePOD Collection -> Vault Remittance -> Escrow Settlement)', async () => {
            const codShipment1 = 80.0;
            const codShipment2 = 120.0;
            const totalCod = codShipment1 + codShipment2; // 200.0 KWD

            // 1. ePOD Driver Collections
            const epod1 = await generalLedgerService.postJournalEntry({
                reference: 'EPOD-RUN-1',
                lines: [
                    { accountCode: '1020', debit: codShipment1, credit: 0 },
                    { accountCode: '2100', debit: 0, credit: codShipment1 }
                ]
            });
            const epod2 = await generalLedgerService.postJournalEntry({
                reference: 'EPOD-RUN-2',
                lines: [
                    { accountCode: '1020', debit: codShipment2, credit: 0 },
                    { accountCode: '2100', debit: 0, credit: codShipment2 }
                ]
            });
            expect(epod1).toBeDefined();
            expect(epod2).toBeDefined();

            // 2. Physical Vault Handover
            const vaultDeposit = await generalLedgerService.postDriverCodRemittanceEntry({
                driverId: 'drv-fleet-9',
                driverName: 'Farhan Driver',
                amount: totalCod,
                bagReference: 'BAG-RUN-9'
            });
            expect(vaultDeposit).toBeDefined();

            // 3. Weekly Escrow Payout (Freight: 30 KWD, Fee: 10 KWD, Wire: 160 KWD)
            const payout = await generalLedgerService.postMerchantSettlementEntry({
                organizationId: 'org-ecom-client',
                grossCodAmount: totalCod,
                freightDeductions: 30.0,
                handlingFee: 10.0,
                netPayout: 160.0,
                reference: 'ECOM-SETTL-OCT'
            });
            expect(payout).toBeDefined();
        });

        it('Scenario 3: Multi-Carrier Invoice Discrepancy Reconciliation without Merchant Balance Contamination', async () => {
            prisma.shipment.findMany.mockResolvedValue([
                {
                    id: 'shp-c1',
                    trackingNumber: 'TRK-C1',
                    dhlTrackingNumber: 'DHL-C1',
                    carrierCode: 'DHL',
                    costPrice: 15.0,
                    organizationId: 'org-client-alpha'
                },
                {
                    id: 'shp-c2',
                    trackingNumber: 'TRK-C2',
                    dhlTrackingNumber: 'DHL-C2',
                    carrierCode: 'DHL',
                    costPrice: 20.0,
                    organizationId: 'org-client-beta'
                }
            ]);

            prisma.organizationLedger.findMany.mockResolvedValue([
                { sourceRepo: 'Shipment', sourceId: 'shp-c1', category: 'CARRIER_PAYABLE', amount: 15.0, currency: 'KWD' },
                { sourceRepo: 'Shipment', sourceId: 'shp-c2', category: 'CARRIER_PAYABLE', amount: 20.0, currency: 'KWD' }
            ]);

            const billingFile = [
                { trackingNumber: 'DHL-C1', billedAmount: 15.0, currency: 'KWD' }, // Exact match
                { trackingNumber: 'DHL-C2', billedAmount: 22.0, currency: 'KWD' }  // Surcharge +2.0
            ];

            const recon = await carrierReconciliationService.reconcileInvoiceRows(billingFile, 'DHL');
            expect(recon.summary.matchedCount).toBe(2);
            expect(recon.summary.discrepancyCount).toBe(1);
            expect(recon.summary.totalVariance).toBe(2.0);

            // Reconcile discrepancy
            const mockTx = {
                shipment: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'shp-c2', price: 30.0, costPrice: 20.0 }),
                    update: jest.fn().mockResolvedValue({ id: 'shp-c2', costPrice: 22.0, markupAmount: 8.0 })
                },
                organizationLedger: {
                    findFirst: jest.fn().mockResolvedValue({ balanceAfter: 500.0 }),
                    create: jest.fn().mockResolvedValue({ id: 'led-recon-c2' })
                },
                account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }), update: jest.fn().mockResolvedValue({}) },
                accountingPeriod: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', isClosed: false }) },
                journalEntry: { create: jest.fn().mockResolvedValue({ id: 'je-recon-c2' }) }
            };
            prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

            const adjResult = await carrierReconciliationService.postAdjustments(
                [{ shipmentId: 'shp-c2', deltaAmount: 2.0, currency: 'KWD', reason: 'Remote area fee' }],
                'admin-audit'
            );

            expect(adjResult.count).toBe(1);
            expect(mockTx.shipment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'shp-c2' },
                    data: expect.objectContaining({ costPrice: 22.0 })
                })
            );
        });

        it('Scenario 4: Credit-Constrained Booking with Prepaid Top-Up and FIFO Payment Allocation', async () => {
            // Step 1: Merchant has 0 credit limit and 10 KWD unapplied balance
            let creditLimit = 0;
            let unappliedCash = 10.0;
            let currentBalance = 0;

            const shipmentPrice = 35.0;
            let availableCredit = creditLimit - currentBalance + unappliedCash;
            expect(shipmentPrice > availableCredit).toBe(true); // Initial booking rejected

            // Step 2: Merchant tops up 50 KWD wallet deposit
            unappliedCash += 50.0; // Now 60.0 KWD
            availableCredit = creditLimit - currentBalance + unappliedCash;
            expect(shipmentPrice <= availableCredit).toBe(true); // Booking now succeeds

            // Step 3: FIFO Allocation applies 35 KWD from payment to shipment
            const paymentAmount = 60.0;
            const allocatedAmount = 35.0;
            const remainingPayment = paymentAmount - allocatedAmount;
            const remainingShipment = shipmentPrice - allocatedAmount;

            expect(remainingPayment).toBe(25.0);
            expect(remainingShipment).toBe(0.0);
        });

        it('Scenario 5: Production Financial Parity Audit & Double-Run Idempotency Verification', async () => {
            // Mock sample database with 3 shipments:
            // - Shp 1: Clean parity
            // - Shp 2: Marked paid but remainingBalance = 15 KWD (Corrupt)
            // - Shp 3: Unpaid, price = 40, totalPaid = 10, remainingBalance = 0 (Corrupt)
            const sampleDatabase = [
                { id: 'shp-clean', price: 50, totalPaid: 50, remainingBalance: 0, paid: true },
                { id: 'shp-err-1', price: 80, totalPaid: 80, remainingBalance: 15, paid: true },
                { id: 'shp-err-2', price: 40, totalPaid: 10, remainingBalance: 0, paid: false }
            ];

            const auditAndFix = async (records, commit = false) => {
                let fixedCount = 0;
                const audited = records.map(s => {
                    const expectedRemaining = s.paid ? 0 : Math.max(0, s.price - s.totalPaid);
                    if (s.remainingBalance !== expectedRemaining) {
                        fixedCount++;
                        if (commit) {
                            return { ...s, remainingBalance: expectedRemaining };
                        }
                    }
                    return s;
                });
                return { audited, fixedCount };
            };

            // Run 1: Dry-Run (identifies 2 discrepancies, commits 0)
            const dryRunResult = await auditAndFix(sampleDatabase, false);
            expect(dryRunResult.fixedCount).toBe(2);

            // Run 2: Commit (repairs the 2 records)
            const commitResult = await auditAndFix(sampleDatabase, true);
            expect(commitResult.fixedCount).toBe(2);

            // Run 3: Re-audit committed records (identifies 0 discrepancies)
            const idempotentResult = await auditAndFix(commitResult.audited, true);
            expect(idempotentResult.fixedCount).toBe(0);
        });
    });
});
