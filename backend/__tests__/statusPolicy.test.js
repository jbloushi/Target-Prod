jest.mock('../src/utils/logger', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
}));

const {
    canUpdateShipmentStatus,
    getAllowedStatusUpdates,
    isInternalShipment,
    syncCarrierTrackingHistory
} = require('../src/controllers/shipment.helpers');

jest.mock('../src/services/CarrierFactory', () => ({
    getAdapter: jest.fn()
}));

const CarrierFactory = require('../src/services/CarrierFactory');
const logger = require('../src/utils/logger');

describe('shipment status policy', () => {
    const shipment = { carrierCode: 'INTERNAL', internallyManaged: true, status: 'booked' };

    it.each(['admin', 'manager', 'accounting'])('allows %s to change shipment status', (role) => {
        expect(canUpdateShipmentStatus({ role }, shipment, 'delivered')).toBe(true);
    });

    it.each(['staff', 'driver', 'client', 'org_manager', 'org_agent'])('blocks %s from changing shipment status', (role) => {
        expect(getAllowedStatusUpdates({ role }, shipment)).toEqual([]);
        expect(canUpdateShipmentStatus({ role }, shipment, 'delivered')).toBe(false);
    });

    it('identifies internal shipments by carrier code or explicit flag', () => {
        expect(isInternalShipment({ carrierCode: 'internal' })).toBe(true);
        expect(isInternalShipment({ internallyManaged: true })).toBe(true);
        expect(isInternalShipment({ carrierCode: 'DGR' })).toBe(false);
    });

    it('promotes standard shipment status from carrier tracking events automatically', async () => {
        CarrierFactory.getAdapter.mockReturnValue({
            getTracking: jest.fn().mockResolvedValue({
                events: [
                    {
                        statusCode: 'transit',
                        description: 'Departed origin',
                        timestamp: '2026-04-14T08:00:00.000Z',
                        location: 'Kuwait City'
                    },
                    {
                        statusCode: 'delivered',
                        description: 'Delivered',
                        timestamp: '2026-04-15T08:00:00.000Z',
                        location: 'Dubai'
                    }
                ]
            })
        });

        const result = await syncCarrierTrackingHistory({
            trackingNumber: 'DGR-1',
            carrierCode: 'DGR',
            carrierShipmentId: 'DHL-1',
            status: 'booked',
            history: [],
            origin: { contactPerson: 'Sender', phone: '123' }
        });

        expect(result.status).toBe('delivered');
        expect(result.history).toHaveLength(2);
        expect(result.history[0].source).toBe('carrier');
    });

    it('suppresses provider warnings when OTE tracking is not ready yet', async () => {
        const error = new Error('Carrier tracking pending at provider: Package not found (45268816), company ID: 424');
        error.code = 'TRACKING_PENDING';
        error.provider = 'OTE';

        CarrierFactory.getAdapter.mockReturnValue({
            getTracking: jest.fn().mockRejectedValue(error)
        });

        const result = await syncCarrierTrackingHistory({
            trackingNumber: 'TRG-MIENSKN1',
            carrierCode: 'OTE',
            carrierShipmentId: '45268816',
            status: 'booked',
            history: []
        });

        expect(result).toBeNull();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('tracking pending at provider'));
    });
});
