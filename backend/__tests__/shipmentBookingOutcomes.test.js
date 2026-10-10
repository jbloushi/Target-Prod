const mockPrisma = {
    shipment: {
        findUnique: jest.fn(),
        update: jest.fn()
    }
};
const mockValidateSnapshot = jest.fn(() => true);
const mockCarrierCapabilities = jest.fn(() => ({ supportsExternalApi: true }));

jest.mock('../src/config/database', () => ({ prisma: mockPrisma }));
jest.mock('../src/services/CarrierFactory', () => ({
    getCarrierCapabilities: mockCarrierCapabilities
}));
jest.mock('../src/services/pricing.service', () => ({
    validateSnapshot: mockValidateSnapshot
}));
jest.mock('../src/services/financeLedger.service', () => ({}));
jest.mock('../src/services/CarrierDocumentService', () => ({}));
jest.mock('../src/services/shippingAccess.service', () => ({
    getAssignedShippingAccess: jest.fn(),
    normalizeCarrier: jest.fn((carrier) => String(carrier || '').toUpperCase())
}));
jest.mock('../src/utils/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
}));

const ShipmentBookingService = require('../src/services/ShipmentBookingService');

describe('ShipmentBookingService booking outcomes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('persists an accepted outcome before carrier dispatch', async () => {
        const shipment = {
            id: 'shipment-book-1',
            trackingNumber: 'DGR-BOOK-1',
            carrierCode: 'DGR',
            status: 'verified',
            bookingAttempts: [],
            pricingSnapshot: { totalPrice: 12 },
            user: { id: 'client-1' },
            organization: { id: 'org-1' },
            organizationId: 'org-1'
        };
        mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
        mockPrisma.shipment.update.mockResolvedValue(shipment);

        const result = await ShipmentBookingService._prepareBooking('DGR-BOOK-1', 'DGR', [], 'staff');

        expect(result.attemptId).toEqual(expect.any(String));
        expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: {
                bookingAttempts: [expect.objectContaining({
                    status: 'pending',
                    outcome: 'accepted',
                    acceptedAt: expect.any(Date)
                })]
            }
        }));
    });

    it('marks an uncertain local commit as reconciliation_required', async () => {
        const attempt = { attemptId: 'attempt-uncertain', status: 'pending', outcome: 'accepted' };
        mockPrisma.shipment.findUnique.mockResolvedValue({
            id: 'shipment-book-2',
            bookingAttempts: [attempt]
        });
        mockPrisma.shipment.update.mockResolvedValue({});

        await ShipmentBookingService.handleBookingFailure(
            'shipment-book-2',
            'attempt-uncertain',
            'Commit failed after carrier accepted the request',
            'reconciliation_required'
        );

        expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: {
                bookingAttempts: [expect.objectContaining({
                    status: 'failed',
                    outcome: 'reconciliation_required',
                    error: 'Commit failed after carrier accepted the request'
                })]
            }
        }));
    });
});
