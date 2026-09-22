const SlaTrackerService = require('../src/services/slaTracker.service');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findMany: jest.fn()
        }
    }
}));

describe('SlaTrackerService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getTargetHours', () => {
        it('returns domestic hours for KW -> KW standard', () => {
            const shipment = { origin: { country: 'KW' }, destination: { country: 'KW' }, serviceCode: 'STANDARD' };
            expect(SlaTrackerService.getTargetHours(shipment)).toBe(24);
        });

        it('returns domestic express hours for KW -> KW express', () => {
            const shipment = { origin: { country: 'KW' }, destination: { country: 'KW' }, serviceCode: 'EXPRESS_DOMESTIC' };
            expect(SlaTrackerService.getTargetHours(shipment)).toBe(8);
        });

        it('returns GCC hours for KW -> SA standard', () => {
            const shipment = { origin: { country: 'KW' }, destination: { countryCode: 'SA' }, serviceCode: 'STANDARD' };
            expect(SlaTrackerService.getTargetHours(shipment)).toBe(72);
        });

        it('returns International hours for KW -> US', () => {
            const shipment = { origin: { country: 'KW' }, destination: { countryCode: 'US' }, serviceCode: 'STANDARD' };
            expect(SlaTrackerService.getTargetHours(shipment)).toBe(120);
        });
    });

    describe('evaluateShipment', () => {
        it('evaluates on-time delivered shipment correctly', () => {
            const createdAt = new Date(Date.now() - 10 * 3600 * 1000); // 10h ago
            const deliveredAt = new Date(Date.now() - 2 * 3600 * 1000); // delivered 8h after creation
            const shipment = {
                id: 'sh-1',
                trackingNumber: 'TRK-ONTIME-1',
                carrierCode: 'DHL',
                status: 'delivered',
                createdAt,
                history: [{ status: 'delivered', timestamp: deliveredAt }],
                origin: { country: 'KW' },
                destination: { country: 'KW' },
                price: 5.0,
                currency: 'KWD'
            };

            const evaluation = SlaTrackerService.evaluateShipment(shipment);
            expect(evaluation.slaStatus).toBe('ON_TIME');
            expect(evaluation.isBreached).toBe(false);
            expect(evaluation.delayHours).toBe(0);
            expect(evaluation.estimatedPenaltyCredit).toBe(0);
        });

        it('evaluates late delivered shipment and calculates penalty credit correctly', () => {
            const createdAt = new Date('2026-09-01T10:00:00Z');
            const deliveredAt = new Date('2026-09-03T16:00:00Z'); // 54 hours (target: 24h -> delay: 30h)
            const shipment = {
                id: 'sh-2',
                trackingNumber: 'TRK-LATE-1',
                carrierCode: 'OTE',
                status: 'delivered',
                createdAt,
                history: [{ status: 'delivered', timestamp: deliveredAt }],
                origin: { country: 'KW' },
                destination: { country: 'KW' },
                price: 10.0,
                currency: 'KWD'
            };

            const evaluation = SlaTrackerService.evaluateShipment(shipment);
            expect(evaluation.slaStatus).toBe('SLA_BREACHED');
            expect(evaluation.isBreached).toBe(true);
            expect(evaluation.delayHours).toBe(30);
            // 30h delay = 2 days delayed @ 20% per day = 40% of 10.0 = 4.0 KWD
            expect(evaluation.estimatedPenaltyCredit).toBe(4.0);
        });
    });

    describe('getCarrierSlaReport', () => {
        it('aggregates carrier metrics and breach counts', async () => {
            prisma.shipment.findMany.mockResolvedValue([
                {
                    id: 'sh-1',
                    trackingNumber: 'TRK-1',
                    carrierCode: 'DHL',
                    status: 'delivered',
                    createdAt: new Date(Date.now() - 5 * 3600 * 1000),
                    history: [{ status: 'delivered', timestamp: new Date(Date.now() - 1 * 3600 * 1000) }],
                    origin: { country: 'KW' },
                    destination: { country: 'KW' },
                    price: 6.0,
                    currency: 'KWD'
                },
                {
                    id: 'sh-2',
                    trackingNumber: 'TRK-2',
                    carrierCode: 'DHL',
                    status: 'delivered',
                    createdAt: new Date(Date.now() - 60 * 3600 * 1000),
                    history: [{ status: 'delivered', timestamp: new Date(Date.now() - 10 * 3600 * 1000) }],
                    origin: { country: 'KW' },
                    destination: { country: 'KW' },
                    price: 10.0,
                    currency: 'KWD'
                }
            ]);

            const report = await SlaTrackerService.getCarrierSlaReport({ carrierCode: 'DHL' });
            expect(report.summary.totalShipments).toBe(2);
            expect(report.summary.deliveredCount).toBe(2);
            expect(report.summary.onTimeCount).toBe(1);
            expect(report.summary.lateDeliveredCount).toBe(1);
            expect(report.summary.onTimeRatePercentage).toBe(50);
            expect(report.carrierBreakdown.length).toBe(1);
            expect(report.carrierBreakdown[0].carrierCode).toBe('DHL');
        });
    });
});
