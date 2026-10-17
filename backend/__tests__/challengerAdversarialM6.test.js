/**
 * Empirical Adversarial Challenge Suite - Milestone M6 Challenger 2
 * File: backend/__tests__/challengerAdversarialM6.test.js
 *
 * Exercises COD Fiduciary Custody Chain and Adversarial Corner Cases:
 * 1. COD Fiduciary Custody Chain (1020 -> 1030 -> 2100 Netting)
 * 2. Non-positive (zero/negative) COD collections & remittances
 * 3. Remittances with unremitted/mismatched shipments
 * 4. Freight AR deductions exceeding escrow balances (Unbalanced GL / Silent Desync)
 */

const Decimal = require('decimal.js');
const financeLedgerService = require('../src/services/financeLedger.service');
const generalLedgerService = require('../src/services/generalLedger.service');
const fleetService = require('../src/services/fleet.service');
const { prisma } = require('../src/config/database');

jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn()
}));

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
            create: jest.fn()
        },
        organizationLedger: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        },
        organization: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn()
        },
        user: {
            findUnique: jest.fn(),
            findFirst: jest.fn()
        },
        shipment: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn()
        },
        deliveryRun: {
            findUnique: jest.fn(),
            update: jest.fn()
        },
        $transaction: jest.fn(async (cb) => cb(mockPrisma)),
        $queryRawUnsafe: jest.fn().mockResolvedValue([])
    };
    return { prisma: mockPrisma };
});

describe('Milestone M6 Challenger 2: Adversarial COD Fiduciary & Settlement Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

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
        prisma.accountingPeriod.create.mockResolvedValue({
            id: 'period-2026-10',
            name: '2026-10',
            isClosed: false
        });

        // Default Chart of Accounts setup
        prisma.account.findUnique.mockImplementation(async ({ where }) => {
            const accounts = {
                '1010': { id: 'acc-1010', code: '1010', name: 'Operating Bank Account', type: 'ASSET', currency: 'KWD' },
                '1020': { id: 'acc-1020', code: '1020', name: 'Cash in Transit - Drivers COD', type: 'ASSET', currency: 'KWD' },
                '1030': { id: 'acc-1030', code: '1030', name: 'Hub Vault Safe', type: 'ASSET', currency: 'KWD' },
                '1100': { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', type: 'ASSET', currency: 'KWD' },
                '2100': { id: 'acc-2100', code: '2100', name: 'Merchant COD Escrow Payable', type: 'LIABILITY', currency: 'KWD' },
                '4040': { id: 'acc-4040', code: '4040', name: 'COD Handling Fee Revenue', type: 'REVENUE', currency: 'KWD' }
            };
            return accounts[where?.code || where?.id] || null;
        });

        prisma.journalEntry.create.mockImplementation(async ({ data }) => ({
            id: `je-test-${Date.now()}`,
            ...data
        }));
    });

    describe('1. COD Fiduciary Custody Chain (1020 -> 1030 -> 2100 Netting)', () => {
        it('Step 1 (Doorstep Collection): Dr 1020 / Cr 2100 balanced posting upon ePOD', async () => {
            const entry = await generalLedgerService.postDriverCodCollectionEntry({
                shipmentId: 'shp-epod-1',
                trackingNumber: 'TRK-EPOD-1',
                organizationId: 'org-merchant-1',
                codAmount: 85.500,
                currency: 'KWD',
                driverId: 'drv-1',
                createdById: 'drv-1'
            });

            expect(entry).toBeDefined();
            expect(Number(entry.totalDebit)).toBe(85.5);
            expect(Number(entry.totalCredit)).toBe(85.5);

            expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        sourceType: 'COD_COLLECTION',
                        sourceId: 'shp-epod-1'
                    })
                })
            );
        });

        it('Step 2 (Hub Vault Remittance): Transfers cash from 1020 to 1030 and credits merchant escrow in sub-ledger', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'drv-1',
                name: 'Tariq Courier',
                organizationId: null
            });

            prisma.shipment.findMany.mockResolvedValue([
                { id: 'shp-1', trackingNumber: 'TRK-1', organizationId: 'org-merchant-1', codAmount: 40.0, codCurrency: 'KWD' },
                { id: 'shp-2', trackingNumber: 'TRK-2', organizationId: 'org-merchant-2', codAmount: 45.5, codCurrency: 'KWD' }
            ]);

            prisma.organizationLedger.findFirst.mockResolvedValue({ balanceAfter: 0 });
            prisma.organizationLedger.create.mockImplementation(async ({ data }) => ({ id: 'led-1', ...data }));

            const remittance = await financeLedgerService.confirmDriverCodRemittance({
                driverId: 'drv-1',
                amount: 85.5,
                currency: 'KWD',
                shipmentIds: ['shp-1', 'shp-2'],
                verifiedBy: 'cashier-hub-1',
                bagReference: 'BAG-OCT-99'
            });

            expect(remittance.success).toBe(true);
            expect(remittance.status).toBe('CONFIRMED');
            expect(remittance.verifiedAmount).toBe(85.5);

            // Verified merchant escrow credit was called for each merchant
            expect(prisma.organizationLedger.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        organizationId: 'org-merchant-1',
                        amount: 40.0,
                        category: 'COD_COLLECTED_ESCROW'
                    })
                })
            );
            expect(prisma.organizationLedger.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        organizationId: 'org-merchant-2',
                        amount: 45.5,
                        category: 'COD_COLLECTED_ESCROW'
                    })
                })
            );

            // Verified Double-entry GL entry Dr 1030 / Cr 1020
            expect(prisma.journalEntry.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        sourceType: 'COD_SETTLEMENT',
                        sourceId: 'drv-1',
                        totalDebit: expect.any(Decimal),
                        totalCredit: expect.any(Decimal)
                    })
                })
            );
        });

        it('Step 3 (Merchant Settlement Netting): Dr 2100 nets against Cr 1100, Cr 4040, and Cr 1010', async () => {
            const gross = 500.0;
            const freight = 75.0;
            const fee = 15.0;
            const netPayout = 410.0;

            const entry = await generalLedgerService.postMerchantSettlementEntry({
                organizationId: 'org-merchant-1',
                grossCodAmount: gross,
                freightDeductions: freight,
                handlingFee: fee,
                netPayout,
                currency: 'KWD',
                bankAccountGlCode: '1010',
                reference: 'SETTL-WIRE-OCT-01',
                createdById: 'finance-admin'
            });

            expect(entry).toBeDefined();
            expect(Number(entry.totalDebit)).toBe(500.0);
            expect(Number(entry.totalCredit)).toBe(500.0);
            expect(gross).toBe(freight + fee + netPayout);
        });
    });

    describe('2. Adversarial Corner Cases: Zero & Negative Collections / Remittances', () => {
        it('rejects zero codAmount in postDriverCodCollectionEntry by returning null', async () => {
            const res = await generalLedgerService.postDriverCodCollectionEntry({
                shipmentId: 'shp-zero',
                codAmount: 0
            });
            expect(res).toBeNull();
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });

        it('rejects negative codAmount in postDriverCodCollectionEntry by returning null', async () => {
            const res = await generalLedgerService.postDriverCodCollectionEntry({
                shipmentId: 'shp-neg',
                codAmount: -50.0
            });
            expect(res).toBeNull();
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });

        it('rejects zero amount in postDriverCodRemittanceEntry by returning null', async () => {
            const res = await generalLedgerService.postDriverCodRemittanceEntry({
                driverId: 'drv-1',
                amount: 0
            });
            expect(res).toBeNull();
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });

        it('rejects negative amount in postDriverCodRemittanceEntry by returning null', async () => {
            const res = await generalLedgerService.postDriverCodRemittanceEntry({
                driverId: 'drv-1',
                amount: -100.0
            });
            expect(res).toBeNull();
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });
    });

    describe('3. Adversarial Corner Cases: Remittance with Unremitted/Mismatched Shipments', () => {
        it('safely filters out shipments not assigned to driver, preventing incorrect merchant escrow credits', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'drv-legit',
                name: 'Legit Driver',
                organizationId: null
            });

            // Shipment 1 belongs to drv-legit, Shipment 2 belongs to someone else
            prisma.shipment.findMany.mockResolvedValue([
                { id: 'shp-belong', trackingNumber: 'TRK-BELONG', organizationId: 'org-merchant-1', codAmount: 50.0, codCurrency: 'KWD' }
            ]);

            prisma.organizationLedger.findFirst.mockResolvedValue({ balanceAfter: 0 });
            prisma.organizationLedger.create.mockImplementation(async ({ data }) => ({ id: 'led-1', ...data }));

            const remittance = await financeLedgerService.confirmDriverCodRemittance({
                driverId: 'drv-legit',
                amount: 50.0,
                currency: 'KWD',
                shipmentIds: ['shp-belong', 'shp-foreign'], // Attacker passes foreign shipment ID
                verifiedBy: 'cashier-hub-1'
            });

            expect(remittance.success).toBe(true);
            // Verify only the driver's own shipment was credited to merchant escrow
            expect(prisma.organizationLedger.create).toHaveBeenCalledTimes(2); // 1 driver credit, 1 merchant credit
            expect(prisma.organizationLedger.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        organizationId: 'org-merchant-1',
                        amount: 50.0
                    })
                })
            );
        });
    });

    describe('4. Adversarial Corner Cases: Freight AR Deductions Exceed Escrow Balance', () => {
        it('rejects settlement when freight AR deductions exceed gross escrow balance without explicit netPayout', async () => {
            // Gross Escrow: 100 KWD, Freight AR: 150 KWD, Handling Fee: 10 KWD
            // Calculated Net Payout: 100 - 150 - 10 = -60 KWD (Negative!)
            await expect(
                financeLedgerService.settleMerchantCod({
                    organizationId: 'org-indebted',
                    grossCodAmount: 100.0,
                    freightDeductions: 150.0,
                    handlingFee: 10.0
                })
            ).rejects.toThrow('Net payout cannot be negative');
        });

        it('detects unbalance when netPayout is explicitly set to 0 but freight + fee exceeds gross', async () => {
            // Gross: 100 KWD, Freight: 150 KWD, Fee: 10 KWD, netPayout explicitly forced to 0
            // Debits = 100 (Dr 2100)
            // Credits = 150 (Cr 1100) + 10 (Cr 4040) = 160
            // GL must throw UNBALANCED_JOURNAL_ENTRY because Debits (100) != Credits (160)
            await expect(
                generalLedgerService.postMerchantSettlementEntry({
                    organizationId: 'org-indebted',
                    grossCodAmount: 100.0,
                    freightDeductions: 150.0,
                    handlingFee: 10.0,
                    netPayout: 0,
                    reference: 'TEST-UNBALANCED-SETTL'
                })
            ).rejects.toThrow(/Unbalanced Journal Entry/);
        });

        it('rejects zero or negative grossCodAmount in settleMerchantCod', async () => {
            await expect(
                financeLedgerService.settleMerchantCod({
                    organizationId: 'org-zero',
                    grossCodAmount: 0
                })
            ).rejects.toThrow('grossCodAmount must be a positive number');

            await expect(
                financeLedgerService.settleMerchantCod({
                    organizationId: 'org-neg',
                    grossCodAmount: -50.0
                })
            ).rejects.toThrow('grossCodAmount must be a positive number');
        });
    });
});
