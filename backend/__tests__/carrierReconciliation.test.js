const carrierReconciliationService = require('../src/services/carrierReconciliation.service');
const { prisma } = require('../src/config/database');
const financeLedgerService = require('../src/services/financeLedger.service');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findMany: jest.fn()
        },
        organizationLedger: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        $transaction: jest.fn()
    }
}));

jest.mock('../src/services/financeLedger.service', () => ({
    createLedgerEntry: jest.fn()
}));

describe('CarrierReconciliationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reconciles matching carrier records and detects exact matches', async () => {
        prisma.shipment.findMany.mockResolvedValue([
            {
                id: 'ship-1',
                trackingNumber: 'TRK-1001',
                dhlTrackingNumber: 'DHL-1001',
                carrierCode: 'DHL',
                costPrice: 3.5,
                parcels: [{ weight: 2.0 }],
                organizationId: 'org-1',
                organization: { id: 'org-1', name: 'Test Org' }
            }
        ]);

        prisma.organizationLedger.findMany.mockResolvedValue([
            {
                id: 'led-1',
                sourceRepo: 'Shipment',
                sourceId: 'ship-1',
                category: 'CARRIER_PAYABLE',
                amount: 3.5,
                currency: 'KWD'
            }
        ]);

        const records = [
            { trackingNumber: 'DHL-1001', billedAmount: 3.5, billedWeight: 2.0, currency: 'KWD' }
        ];

        const result = await carrierReconciliationService.reconcileInvoiceRows(records, 'DHL');

        expect(result.summary.matchedCount).toBe(1);
        expect(result.summary.discrepancyCount).toBe(0);
        expect(result.summary.totalVariance).toBe(0);
        expect(result.items[0].status).toBe('MATCHED_EXACT');
        expect(result.items[0].deltaAmount).toBe(0);
    });

    it('identifies surcharge discrepancies when carrier charges more than expected', async () => {
        prisma.shipment.findMany.mockResolvedValue([
            {
                id: 'ship-2',
                trackingNumber: 'TRK-2002',
                dhlTrackingNumber: 'DHL-2002',
                carrierCode: 'DHL',
                costPrice: 3.0,
                parcels: [{ weight: 1.5 }],
                organizationId: 'org-1',
                organization: { id: 'org-1', name: 'Test Org' }
            }
        ]);

        prisma.organizationLedger.findMany.mockResolvedValue([
            {
                id: 'led-2',
                sourceRepo: 'Shipment',
                sourceId: 'ship-2',
                category: 'CARRIER_PAYABLE',
                amount: 3.0,
                currency: 'KWD'
            }
        ]);

        const records = [
            { trackingNumber: 'DHL-2002', billedAmount: 4.25, billedWeight: 2.5, currency: 'KWD' }
        ];

        const result = await carrierReconciliationService.reconcileInvoiceRows(records, 'DHL');

        expect(result.summary.matchedCount).toBe(1);
        expect(result.summary.discrepancyCount).toBe(1);
        expect(result.summary.totalVariance).toBe(1.25);
        expect(result.items[0].status).toBe('SURCHARGE_DISCREPANCY');
        expect(result.items[0].deltaAmount).toBe(1.25);
    });

    it('flags unmatched AWBs not present in the internal system', async () => {
        prisma.shipment.findMany.mockResolvedValue([]);
        prisma.organizationLedger.findMany.mockResolvedValue([]);

        const records = [
            { trackingNumber: 'UNKNOWN-999', billedAmount: 5.0, currency: 'KWD' }
        ];

        const result = await carrierReconciliationService.reconcileInvoiceRows(records, 'DHL');

        expect(result.summary.matchedCount).toBe(0);
        expect(result.summary.unmatchedCount).toBe(1);
        expect(result.items[0].status).toBe('UNMATCHED');
    });

    it('posts adjustment entries into the ledger within a transaction', async () => {
        const tx = {};
        prisma.$transaction.mockImplementation(async (cb) => cb(tx));
        financeLedgerService.createLedgerEntry.mockResolvedValue({ id: 'adj-led-1' });

        const adjustments = [
            {
                shipmentId: 'ship-1',
                organizationId: 'org-1',
                deltaAmount: 1.5,
                currency: 'KWD',
                reason: 'Weight adjustment 2.5kg'
            }
        ];

        const result = await carrierReconciliationService.postAdjustments(adjustments, 'user-admin');

        expect(result.count).toBe(1);
        expect(financeLedgerService.createLedgerEntry).toHaveBeenCalledWith(
            'org-1',
            expect.objectContaining({
                sourceRepo: 'Shipment',
                sourceId: 'ship-1',
                amount: 1.5,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                createdBy: 'user-admin'
            }),
            tx
        );
    });
});

