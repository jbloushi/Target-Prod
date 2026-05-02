const {
    canUpdateShipmentStatus,
    getAllowedStatusUpdates,
    isManualShipment,
    syncCarrierTrackingHistory
} = require('../src/controllers/shipment.helpers');

jest.mock('../src/services/CarrierFactory', () => ({
    getAdapter: jest.fn()
}));

const CarrierFactory = require('../src/services/CarrierFactory');

describe('shipment status policy', () => {
    const shipment = { carrierCode: 'MANUAL', manualShipment: true, status: 'booked' };

    it.each(['admin', 'manager', 'accounting'])('allows %s to change shipment status', (role) => {
        expect(canUpdateShipmentStatus({ role }, shipment, 'delivered')).toBe(true);
    });

    it.each(['staff', 'driver', 'client', 'org_manager', 'org_agent'])('blocks %s from changing shipment status', (role) => {
        expect(getAllowedStatusUpdates({ role }, shipment)).toEqual([]);
        expect(canUpdateShipmentStatus({ role }, shipment, 'delivered')).toBe(false);
    });

    it('identifies manual shipments by carrier code or explicit flag', () => {
        expect(isManualShipment({ carrierCode: 'manual' })).toBe(true);
        expect(isManualShipment({ manualShipment: true })).toBe(true);
        expect(isManualShipment({ carrierCode: 'DGR' })).toBe(false);
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
});
