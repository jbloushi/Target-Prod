const financeLedgerService = require('../src/services/financeLedger.service');
const financeInvoiceService = require('../src/services/financeInvoice.service');
const currencyRateService = require('../src/services/currencyRate.service');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    prisma: {
        payment: {
            findUnique: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn()
        },
        shipment: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            findMany: jest.fn()
        },
        paymentAllocation: {
            create: jest.fn(),
            aggregate: jest.fn(),
            findUnique: jest.fn(),
            groupBy: jest.fn(),
            findMany: jest.fn()
        },
        organizationLedger: {
            findFirst: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            groupBy: jest.fn()
        },
        organization: {
            findUnique: jest.fn(),
            update: jest.fn()
        },
        user: {
            findUnique: jest.fn()
        },
        invoice: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn()
        },
        invoiceLine: {
            findMany: jest.fn()
        },
        $transaction: jest.fn(),
        $queryRawUnsafe: jest.fn()
    }
}));

jest.mock('../src/services/currencyRate.service', () => ({
    getRates: jest.fn()
}));

describe('Phase 2 Financial Hardening Test Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('1. Concurrency & Row-Level Locking in allocatePayment', () => {
        it('executes pessimistic row locks (FOR UPDATE) inside transaction during allocation', async () => {
            const mockTx = {
                $queryRawUnsafe: jest.fn().mockResolvedValue([]),
                payment: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'pay-101',
                        organizationId: 'org-1',
                        amount: 50.0,
                        currency: 'KWD',
                        reference: 'PAY-101'
                    }),
                    update: jest.fn()
                },
                shipment: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'ship-101',
                        organizationId: 'org-1',
                        trackingNumber: 'TRK-101',
                        currency: 'KWD',
                        price: 50.0,
                        paid: false,
                        totalPaid: 0,
                        remainingBalance: 50.0,
                        createdAt: new Date()
                    }),
                    update: jest.fn()
                },
                paymentAllocation: {
                    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
                    create: jest.fn().mockResolvedValue({
                        id: 'alloc-1',
                        paymentId: 'pay-101',
                        shipmentId: 'ship-101',
                        amount: 25.0,
                        currency: 'KWD',
                        status: 'ACTIVE'
                    })
                },
                organizationLedger: {
                    findFirst: jest.fn().mockResolvedValue({ balanceAfter: 100 }),
                    create: jest.fn().mockResolvedValue({ id: 'led-alloc-1' })
                },
                organization: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'org-1', currency: 'KWD' }),
                    update: jest.fn()
                },
                user: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'usr-admin', name: 'Admin User' })
                }
            };

            prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));
            prisma.payment.findUnique.mockResolvedValue({ id: 'pay-101', amount: 50, currency: 'KWD' });
            prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-101', price: 50, currency: 'KWD', createdAt: new Date() });
            prisma.paymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: 25 } });

            const result = await financeLedgerService.allocatePayment({
                organizationId: 'org-1',
                paymentId: 'pay-101',
                shipmentId: 'ship-101',
                amount: 25.0,
                createdBy: 'usr-admin'
            });

            expect(result).toBeDefined();
            expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
                expect.stringContaining('Payment'),
                'pay-101'
            );
            expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
                expect.stringContaining('Shipment'),
                'ship-101'
            );
            expect(mockTx.paymentAllocation.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    paymentId: 'pay-101',
                    shipmentId: 'ship-101',
                    amount: 25.0
                })
            }));
        });
    });

    describe('2. Multi-Currency Exchange Rate Snapshotting in Invoices', () => {
        it('captures active FX rate snapshot at creation time and embeds it in invoice notes', async () => {
            prisma.organization.findUnique.mockResolvedValue({
                id: 'org-1',
                name: 'Global Traders SAR',
                currency: 'SAR'
            });

            prisma.organizationLedger.findMany.mockResolvedValue([
                {
                    id: 'led-1',
                    sourceId: 'ship-sar-1',
                    amount: 150.0,
                    currency: 'SAR',
                    createdAt: new Date('2026-09-01'),
                    reference: 'TRK-SAR-1'
                }
            ]);

            prisma.invoiceLine.findMany.mockResolvedValue([]);
            prisma.shipment.findMany.mockResolvedValue([
                {
                    id: 'ship-sar-1',
                    trackingNumber: 'TRK-SAR-1',
                    price: 150.0,
                    currency: 'SAR',
                    paid: false,
                    totalPaid: 0,
                    remainingBalance: 150.0,
                    createdAt: new Date('2026-09-01')
                }
            ]);

            currencyRateService.getRates.mockResolvedValue({
                baseCurrency: 'KWD',
                rates: { SAR: 0.0821, USD: 0.3080, KWD: 1.0 }
            });

            prisma.invoice.create.mockImplementation(({ data }) => Promise.resolve({
                id: 'inv-101',
                ...data
            }));

            const invoice = await financeInvoiceService.createInvoiceFromPeriod({
                organizationId: 'org-1',
                periodStart: '2026-09-01',
                periodEnd: '2026-09-30',
                currency: 'SAR',
                notes: 'September standard billing'
            });

            expect(invoice).toBeDefined();
            expect(currencyRateService.getRates).toHaveBeenCalled();
            expect(invoice.notes).toContain('EXCHANGE_RATE_SNAPSHOT');
            expect(invoice.notes).toContain('"rateToKWD":0.0821');
            expect(invoice.currency).toBe('SAR');
            expect(invoice.total).toBe(150);
        });
    });

    describe('3. Two-Step Driver COD Remittance Workflow', () => {
        it('Step 1: Driver/Dispatcher creates a PENDING_VERIFICATION remittance request with bag reference', async () => {
            const mockTx = {
                shipment: {
                    updateMany: jest.fn().mockResolvedValue({ count: 2 })
                }
            };
            prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));
            prisma.user.findUnique.mockResolvedValue({
                id: 'drv-1',
                name: 'Tariq Driver',
                organizationId: 'org-1'
            });

            const reqResult = await financeLedgerService.requestDriverCodRemittance({
                driverId: 'drv-1',
                amount: 85.5,
                currency: 'KWD',
                shipmentIds: ['ship-cod-1', 'ship-cod-2'],
                requestedBy: 'drv-1',
                bagReference: 'BAG-9921',
                notes: 'Envelope handed to evening dispatcher'
            });

            expect(reqResult.success).toBe(true);
            expect(reqResult.status).toBe('PENDING_VERIFICATION');
            expect(reqResult.amount).toBe(85.5);
            expect(reqResult.bagReference).toBe('BAG-9921');
            expect(mockTx.shipment.updateMany).toHaveBeenCalledWith({
                where: {
                    id: { in: ['ship-cod-1', 'ship-cod-2'] },
                    assignedDriverId: 'drv-1'
                },
                data: { codStatus: 'PENDING_REMITTANCE' }
            });
        });

        it('Step 2: Hub Cashier confirms physical cash, transitions shipments to REMITTED, and posts ledger credit', async () => {
            const mockTx = {
                shipment: {
                    updateMany: jest.fn().mockResolvedValue({ count: 2 })
                },
                organizationLedger: {
                    findFirst: jest.fn().mockResolvedValue({ balanceAfter: 200 }),
                    create: jest.fn().mockResolvedValue({ id: 'led-remit-1' })
                },
                organization: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'org-1', currency: 'KWD' }),
                    update: jest.fn()
                }
            };
            prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));
            prisma.user.findUnique.mockResolvedValue({
                id: 'drv-1',
                name: 'Tariq Driver',
                organizationId: 'org-1'
            });

            const confirmResult = await financeLedgerService.confirmDriverCodRemittance({
                driverId: 'drv-1',
                amount: 85.5,
                currency: 'KWD',
                shipmentIds: ['ship-cod-1', 'ship-cod-2'],
                verifiedBy: 'usr-cashier',
                bagReference: 'BAG-9921',
                notes: 'Physical cash counted and reconciled'
            });

            expect(confirmResult.success).toBe(true);
            expect(confirmResult.status).toBe('CONFIRMED');
            expect(confirmResult.verifiedAmount).toBe(85.5);
            expect(mockTx.shipment.updateMany).toHaveBeenCalledWith({
                where: {
                    id: { in: ['ship-cod-1', 'ship-cod-2'] },
                    assignedDriverId: 'drv-1'
                },
                data: { codStatus: 'REMITTED' }
            });
            expect(mockTx.organizationLedger.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    entryType: 'CREDIT',
                    category: 'COD_REMITTANCE',
                    amount: 85.5
                })
            }));
        });
    });
});
