const parityAuditor = require('../src/services/tryton/parityAuditor');
const cutoverManager = require('../src/services/tryton/cutoverManager');
const trytonClient = require('../src/services/tryton/trytonClient');
const { prisma } = require('../src/config/database');

describe('Optional Tryton diagnostics and legacy MySQL routing', () => {
    let initialBackend;

    beforeEach(() => {
        initialBackend = cutoverManager.getPrimaryBackend();
        jest.spyOn(prisma.shipment, 'findMany').mockResolvedValue([
            { id: 's1', trackingNumber: 'TRK-CI-1', status: 'created', price: 10, parcels: [] },
            { id: 's2', trackingNumber: 'TRK-CI-2', status: 'delivered', price: 15, parcels: [] }
        ]);
        jest.spyOn(prisma.organization, 'findMany').mockResolvedValue([
            { id: 'o1', name: 'Org One', balance: 0, currency: 'KWD' },
            { id: 'o2', name: 'Org Two', balance: 0, currency: 'KWD' }
        ]);
        jest.spyOn(trytonClient, 'modelCall').mockImplementation(async (model, method, ...args) => {
            if (model === 'target.rate_card' && method === 'search') return [11];
            if (model === 'target.rate_card' && method === 'calculate_rate') return { rate: 12.5 };
            if (model === 'stock.shipment.out' && method === 'search_read') {
                const trackingNumber = args[0]?.[0]?.[2];
                return [{ id: trackingNumber === 'TRK-CI-1' ? 21 : 22, state: trackingNumber === 'TRK-CI-1' ? 'client_submitted' : 'done' }];
            }
            if (model === 'party.party' && method === 'search_read') return [{ id: 31 }];
            if (model === 'account.move.line' && method === 'search_read') return [];
            return [];
        });
        jest.spyOn(trytonClient, 'mirrorShipment').mockResolvedValue({ trytonShipmentId: 99 });
    });

    afterEach(() => {
        cutoverManager.setPrimaryBackend(initialBackend);
        jest.restoreAllMocks();
    });

    test('shipment parity audit uses deterministic records and makes no database or network connection', async () => {
        const audit = await parityAuditor.auditShipmentParity();

        expect(audit).toEqual(expect.objectContaining({
            total: 2,
            matched: 2,
            missing: 0,
            mismatched: 0,
            drift: 0,
            matchRate: 100,
            zeroDrift: true
        }));
    });

    test('quote and financial parity reports are computed from controlled test doubles', async () => {
        const quote = await parityAuditor.validateQuoteParity({ weight: 2.5, country: 'SA' });
        const financial = await parityAuditor.auditFinancialParity();

        expect(quote.isParity).toBe(true);
        expect(quote.trytonPrice).toBeGreaterThan(0);
        expect(financial).toEqual(expect.objectContaining({ auditedOrgs: 2, matched: 2, driftCount: 0, zeroDrift: true }));
    });

    test('full parity report composes the shipment, pricing, and financial results', async () => {
        const report = await parityAuditor.runFullAudit();

        expect(report.zeroDrift).toBe(true);
        expect(report.shipments.total).toBe(2);
        expect(report.pricing.isParity).toBe(true);
        expect(report.financial.zeroDrift).toBe(true);
        expect(typeof report.timestamp).toBe('string');
    });

    test('application routing stays on legacy MySQL unless explicitly configured otherwise', async () => {
        cutoverManager.setPrimaryBackend('LEGACY_MYSQL');
        const fallback = jest.fn().mockResolvedValue({ id: 'mysql-shipment-1', status: 'created' });

        const result = await cutoverManager.routeShipmentSubmission(
            { trackingNumber: 'TRK-MYSQL-1' },
            { name: 'Operations' },
            fallback
        );

        expect(result).toEqual(expect.objectContaining({ backend: 'LEGACY_MYSQL', id: 'mysql-shipment-1', primarySuccess: true }));
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(trytonClient.mirrorShipment).not.toHaveBeenCalled();
    });
});
