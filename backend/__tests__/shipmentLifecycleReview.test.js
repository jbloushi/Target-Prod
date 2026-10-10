const mockPrisma = {
    shipment: {
        update: jest.fn(),
        findUnique: jest.fn()
    },
    shipmentAuditLog: {
        create: jest.fn()
    }
};
const mockRefreshPricing = jest.fn();

jest.mock('../src/config/database', () => ({ prisma: mockPrisma }));
jest.mock('../src/services/ShipmentDraftService', () => ({ createDraft: jest.fn() }));
jest.mock('../src/services/ShipmentBookingService', () => ({
    refreshPricingSnapshotForBooking: mockRefreshPricing
}));

const ShipmentLifecycleService = require('../src/services/ShipmentLifecycleService');

describe('ShipmentLifecycleService verified review pricing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('refreshes external-carrier pricing after verification and audits a commercial change', async () => {
        const shipment = {
            id: 'shipment-review-1',
            trackingNumber: 'DGR-REVIEW-1',
            carrierCode: 'DGR',
            status: 'picked_up',
            price: 12,
            pricingSnapshot: { totalPrice: 12, carrierRate: 10 },
            parcels: [{ weight: 1, dimensions: { length: 10, width: 10, height: 10 } }],
            items: [],
            history: [],
            currentLocation: 'Target Hub'
        };
        const reviewShipment = {
            ...shipment,
            status: 'verified',
            price: 15,
            pricingSnapshot: { totalPrice: 15, carrierRate: 12.5 },
            user: { id: 'client-1' },
            organization: { id: 'org-1' }
        };
        const actor = { id: 'staff-1', role: 'staff', name: 'Operations Staff' };

        mockPrisma.shipment.update.mockResolvedValue({ ...shipment, status: 'verified' });
        mockPrisma.shipment.findUnique
            .mockResolvedValueOnce(reviewShipment)
            .mockResolvedValueOnce(reviewShipment);
        mockRefreshPricing.mockResolvedValue(undefined);

        const result = await ShipmentLifecycleService.completeReview(shipment, actor, {
            weight: 1.5,
            dimensions: { length: 12, width: 10, height: 10 },
            reason: 'Certified hub scale',
            requestId: 'req-review-1'
        });

        expect(mockRefreshPricing).toHaveBeenCalledWith(expect.objectContaining({
            shipment: reviewShipment,
            carrierCode: 'DGR',
            payingUser: reviewShipment.user,
            organization: reviewShipment.organization
        }));
        expect(mockPrisma.shipmentAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                trackingNumber: 'DGR-REVIEW-1',
                action: 'VERIFIED_PRICING_RECALCULATED',
                actorId: 'staff-1',
                fieldChanges: expect.objectContaining({
                    oldPrice: 12,
                    newPrice: 15,
                    reason: 'Certified hub scale',
                    requestId: 'req-review-1'
                })
            })
        }));
        expect(result.reviewCompleted).toBe(true);
        expect(result.currentPrice).toBe(15);
    });
});
