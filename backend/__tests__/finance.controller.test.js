const { createMockRes } = require('../testUtils');

describe('finance controller', () => {
    const tx = {
        payment: { create: jest.fn() },
        organization: { update: jest.fn() }
    };
    const prisma = {
        $transaction: jest.fn(),
        paymentAllocation: { findMany: jest.fn() }
    };
    const financeLedgerService = {
        createLedgerEntry: jest.fn(),
        getShipmentAccounting: jest.fn(),
        allocatePayment: jest.fn()
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/services/financeLedger.service', () => financeLedgerService);
        prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    });

    it('rejects invalid payment amounts', async () => {
        const controller = require('../src/controllers/finance.controller');
        const req = {
            params: { orgId: 'org-1' },
            user: { id: 'admin-1', role: 'admin' },
            body: { amount: 0 }
        };
        const res = createMockRes();

        await controller.postPayment(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('posts payments as credit ledger entries and increments unapplied balance', async () => {
        const controller = require('../src/controllers/finance.controller');
        const req = {
            params: { orgId: 'org-1' },
            user: { id: 'accounting-1', role: 'accounting' },
            body: { amount: 100, method: 'bank', reference: 'PAY-1', notes: 'Wire' }
        };
        const res = createMockRes();

        tx.payment.create.mockResolvedValue({ id: 'payment-1', amount: 100 });

        await controller.postPayment(req, res);

        expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                organizationId: 'org-1',
                amount: 100,
                createdById: 'accounting-1'
            })
        }));
        expect(financeLedgerService.createLedgerEntry).toHaveBeenCalledWith('org-1', expect.objectContaining({
            sourceRepo: 'Payment',
            amount: 100,
            entryType: 'CREDIT',
            category: 'PAYMENT'
        }), tx);
        expect(tx.organization.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'org-1' },
            data: { unappliedBalance: { increment: 100 } }
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('allocates payments manually across shipment balances', async () => {
        const controller = require('../src/controllers/finance.controller');
        const req = {
            params: { orgId: 'org-1' },
            user: { id: 'accounting-1', role: 'accounting' },
            body: { paymentId: 'payment-1', shipmentIds: ['s1', 's2'], amount: 75 }
        };
        const res = createMockRes();

        financeLedgerService.getShipmentAccounting
            .mockResolvedValueOnce({ remainingBalance: 50 })
            .mockResolvedValueOnce({ remainingBalance: 100 });
        financeLedgerService.allocatePayment
            .mockResolvedValueOnce({ shipmentId: 's1', amount: 50 })
            .mockResolvedValueOnce({ shipmentId: 's2', amount: 25 });

        await controller.allocatePaymentManual(req, res);

        expect(financeLedgerService.allocatePayment).toHaveBeenNthCalledWith(1, expect.objectContaining({
            paymentId: 'payment-1',
            shipmentId: 's1',
            amount: 50,
            createdBy: 'accounting-1'
        }), tx);
        expect(financeLedgerService.allocatePayment).toHaveBeenNthCalledWith(2, expect.objectContaining({
            shipmentId: 's2',
            amount: 25
        }), tx);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
