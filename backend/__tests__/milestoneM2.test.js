const generalLedgerService = require('../src/services/generalLedger.service');
const accountsPayableService = require('../src/services/accountsPayable.service');
const apiController = require('../src/controllers/api.controller');
const { createMockRes } = require('../testUtils');

describe('Milestone M2: Double-Entry General Ledger, Invariants & Statements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('F7: GL Journal Entry Idempotency & Deduplication', () => {
    it('returns existing journal entry immediately if sourceType and sourceId already exist without creating duplicates', async () => {
      const mockExistingEntry = {
        id: 'je-existing-1',
        entryNumber: 'JE-SHP-TRK999-001',
        sourceType: 'SHIPMENT_BOOKING',
        sourceId: 'shipment-123',
        status: 'POSTED',
        totalDebit: 15.000,
        totalCredit: 15.000,
        lines: [
          { accountCode: '1100', debit: 15.000, credit: 0 },
          { accountCode: '4010', debit: 0, credit: 15.000 }
        ]
      };

      const mockTx = {
        journalEntry: {
          findFirst: jest.fn().mockResolvedValue(mockExistingEntry),
          create: jest.fn()
        },
        account: {
          findUnique: jest.fn(),
          update: jest.fn()
        },
        accountingPeriod: {
          findUnique: jest.fn()
        }
      };

      const result = await generalLedgerService.postJournalEntry({
        sourceType: 'SHIPMENT_BOOKING',
        sourceId: 'shipment-123',
        lines: [
          { accountCode: '1100', debit: 15.000, credit: 0 },
          { accountCode: '4010', debit: 0, credit: 15.000 }
        ]
      }, mockTx);

      expect(mockTx.journalEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          sourceType: 'SHIPMENT_BOOKING',
          sourceId: 'shipment-123'
        }
      }));
      // Must not create new entry or update balances
      expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
      expect(mockTx.account.update).not.toHaveBeenCalled();
      expect(result).toBe(mockExistingEntry);
    });
  });

  describe('F8: Single-Operator Carrier AP & Corporate Cash Attribution', () => {
    it('enforces organizationId: null on Account 2010 (Carrier AP) and Account 1010 (Cash/Bank)', async () => {
      const createdLines = [];
      const mockTx = {
        journalEntry: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            return {
              id: 'je-booking-1',
              entryNumber: data.entryNumber,
              lines: data.lines.create
            };
          })
        },
        account: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            const map = {
              '1100': { id: 'acc-1100', code: '1100', type: 'ASSET', currency: 'KWD' },
              '4010': { id: 'acc-4010', code: '4010', type: 'REVENUE', currency: 'KWD' },
              '5010': { id: 'acc-5010', code: '5010', type: 'COGS', currency: 'KWD' },
              '2010': { id: 'acc-2010', code: '2010', type: 'LIABILITY', currency: 'KWD' },
              '1010': { id: 'acc-1010', code: '1010', type: 'ASSET', currency: 'KWD' }
            };
            return Promise.resolve(map[where.code] || null);
          }),
          update: jest.fn().mockResolvedValue({})
        },
        accountingPeriod: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'p-1',
            name: '2026-10',
            isClosed: false
          })
        }
      };

      const result = await generalLedgerService.postShipmentBookingEntry({
        shipmentId: 'shp-100',
        trackingNumber: 'TRK-100',
        organizationId: 'client-merchant-org-1',
        customerPrice: 20.000,
        carrierCost: 12.000,
        carrierCode: 'DHL',
        currency: 'KWD'
      }, mockTx);

      expect(mockTx.journalEntry.create).toHaveBeenCalled();
      const callData = mockTx.journalEntry.create.mock.calls[0][0].data;
      const lines = callData.lines.create;

      // AR (1100) and Revenue (4010) are attributed to the client merchant
      const arLine = lines.find(l => l.accountId === 'acc-1100');
      const revLine = lines.find(l => l.accountId === 'acc-4010');
      expect(arLine.organizationId).toBe('client-merchant-org-1');
      expect(revLine.organizationId).toBe('client-merchant-org-1');

      // Carrier AP (2010) is a corporate platform liability: MUST BE NULL
      const apLine = lines.find(l => l.accountId === 'acc-2010');
      expect(apLine.organizationId).toBeNull();
    });

    it('enforces organizationId: null for Cash/Bank (1010) in postPaymentReceiptEntry', async () => {
      const mockTx = {
        journalEntry: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'je-pay-1',
            entryNumber: data.entryNumber,
            lines: data.lines.create
          }))
        },
        account: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.code === '1010') return Promise.resolve({ id: 'acc-1010', code: '1010', type: 'ASSET', currency: 'KWD' });
            if (where.code === '1100') return Promise.resolve({ id: 'acc-1100', code: '1100', type: 'ASSET', currency: 'KWD' });
            return Promise.resolve(null);
          }),
          update: jest.fn().mockResolvedValue({})
        },
        accountingPeriod: {
          findUnique: jest.fn().mockResolvedValue({ id: 'p-1', name: '2026-10', isClosed: false })
        }
      };

      await generalLedgerService.postPaymentReceiptEntry({
        paymentId: 'pay-1',
        reference: 'WIRE-123',
        organizationId: 'merchant-org-1',
        amount: 50.000,
        bankAccountGlCode: '1010'
      }, mockTx);

      const callData = mockTx.journalEntry.create.mock.calls[0][0].data;
      const lines = callData.lines.create;
      const bankLine = lines.find(l => l.accountId === 'acc-1010');
      const arLine = lines.find(l => l.accountId === 'acc-1100');

      // Bank account is corporate platform asset: MUST BE NULL
      expect(bankLine.organizationId).toBeNull();
      // AR account belongs to merchant
      expect(arLine.organizationId).toBe('merchant-org-1');
    });
  });

  describe('F10: Carrier Invoice Reconciliation Schema Integrity', () => {
    it('queries valid schema fields (dhlTrackingNumber, carrierShipmentId, trackingNumber) without crashing', async () => {
      const { prisma } = require('../src/config/database');
      prisma.vendor = {
        findUnique: jest.fn().mockResolvedValue({ id: 'v-1', name: 'DHL Express', code: 'DHL' })
      };
      prisma.shipment = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shp-1',
          trackingNumber: 'TRK-999',
          dhlTrackingNumber: 'DHL-AWB-999',
          carrierShipmentId: 'CR-999',
          carrierCode: 'DHL',
          costPrice: 10.000,
          pricingSnapshot: { carrierRate: 10.000 },
          status: 'delivered'
        })
      };

      const result = await accountsPayableService.reconcileCarrierInvoice({
        vendorId: 'v-1',
        csvLines: [
          { trackingNumber: 'DHL-AWB-999', amount: 10.000 }
        ]
      });

      expect(prisma.shipment.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { trackingNumber: 'DHL-AWB-999' },
            { dhlTrackingNumber: 'DHL-AWB-999' },
            { carrierShipmentId: 'DHL-AWB-999' }
          ]
        },
        select: {
          id: true,
          trackingNumber: true,
          dhlTrackingNumber: true,
          carrierShipmentId: true,
          carrierCode: true,
          costPrice: true,
          pricingSnapshot: true,
          status: true
        }
      });

      expect(result.matchedCount).toBe(1);
      expect(result.lines[0].carrierTrackingNumber).toBe('DHL-AWB-999');
      expect(result.lines[0].status).toBe('MATCHED');
    });
  });

  describe('F11: Atomic External API Bookings & Unified Credit Limit', () => {
    it('enforces unified credit limit check on autoBook: true and rejects booking if price exceeds available credit', async () => {
      const { prisma } = require('../src/config/database');
      prisma.user = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'client-user-1',
          email: 'client@example.com',
          role: 'client',
          organizationId: 'org-credit-1',
          agentPolicy: { shippingAccess: { carrierCode: 'DGR', serviceCode: 'Y' } },
          organization: {
            id: 'org-credit-1',
            creditLimit: 100.000,
            balance: 80.000, // outstanding debt
            unappliedBalance: 0, // available credit = 100 - 80 + 0 = 20
            type: 'CREDIT'
          }
        })
      };

      const req = {
        user: { id: 'client-user-1', organizationId: 'org-credit-1' },
        body: {
          autoBook: true,
          origin: { countryCode: 'KW' },
          destination: { countryCode: 'AE' },
          parcels: [{ weight: { value: 1 } }]
        }
      };
      const res = createMockRes();

      // Mock ShipmentDraftService to return a quote of 35 KWD (> 20 available credit)
      const ShipmentDraftService = require('../src/services/ShipmentDraftService');
      const origPricing = ShipmentDraftService.getSecurePricing;
      ShipmentDraftService.getSecurePricing = jest.fn().mockResolvedValue({
        totalPrice: 35.000,
        carrierRate: 20.000
      });

      await apiController.createShipment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringMatching(/Insufficient available credit/i)
      }));

      // Cleanup
      ShipmentDraftService.getSecurePricing = origPricing;
    });

    it('rolls back atomically inside prisma.$transaction if any financial ledger step fails', async () => {
      const { prisma } = require('../src/config/database');
      const mockTx = {
        shipment: {
          create: jest.fn().mockResolvedValue({
            id: 'shp-atomic-1',
            trackingNumber: 'TRK-ATOMIC-1',
            currency: 'KWD'
          })
        },
        invoice: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({})
        }
      };

      prisma.user = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'client-user-1',
          role: 'staff', // staff bypasses credit limit
          organizationId: 'org-1',
          agentPolicy: { shippingAccess: { carrierCode: 'DGR', serviceCode: 'Y' } },
          organization: { id: 'org-1', creditLimit: 500 }
        })
      };

      // Mock carrier adapter
      const CarrierFactory = require('../src/services/CarrierFactory');
      const origAdapter = CarrierFactory.getAdapter;
      CarrierFactory.getAdapter = jest.fn().mockReturnValue({
        validate: jest.fn().mockResolvedValue([]),
        createShipment: jest.fn().mockResolvedValue({
          trackingNumber: 'TRK-ATOMIC-1',
          totalPrice: 50.000,
          costPrice: 30.000
        })
      });

      // Mock financeLedgerService to throw during ledger insertion
      const financeLedgerService = require('../src/services/financeLedger.service');
      const origCreateLedger = financeLedgerService.createLedgerEntry;
      financeLedgerService.createLedgerEntry = jest.fn().mockRejectedValue(new Error('Database deadlock on organization ledger'));

      prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      const req = {
        user: { id: 'client-user-1', organizationId: 'org-1' },
        body: {
          autoBook: true,
          sender: {
            company: 'Sender Co',
            contactPerson: 'Sender',
            phone: '111',
            email: 'sender@example.com',
            streetLines: ['Street'],
            city: 'Kuwait City',
            countryCode: 'KW'
          },
          receiver: {
            company: 'Receiver Co',
            contactPerson: 'Receiver',
            phone: '222',
            email: 'receiver@example.com',
            streetLines: ['Street'],
            city: 'Dubai',
            countryCode: 'AE'
          },
          parcels: [{ weight: { value: 1 }, dimensions: { length: 1, width: 1, height: 1 } }],
          packages: [{ weight: { value: 1 }, dimensions: { length: 1, width: 1, height: 1 } }]
        }
      };
      const res = createMockRes();

      await apiController.createShipment(req, res);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.shipment.create).toHaveBeenCalled();
      expect(financeLedgerService.createLedgerEntry).toHaveBeenCalled();
      // Should return error response because transaction aborted
      expect(res.status).toHaveBeenCalledWith(500);

      // Restore mocks
      CarrierFactory.getAdapter = origAdapter;
      financeLedgerService.createLedgerEntry = origCreateLedger;
    });
  });
});
