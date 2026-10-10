const mockCreateDraft = jest.fn();

jest.mock('../src/services/ShipmentDraftService', () => ({
    createDraft: mockCreateDraft
}));

const ShipmentLifecycleService = require('../src/services/ShipmentLifecycleService');

describe('ShipmentLifecycleService submission seam', () => {
    beforeEach(() => {
        mockCreateDraft.mockReset();
    });

    it('passes a normalized submission command and actor context to the draft collaborator', async () => {
        const command = {
            carrierCode: 'INTERNAL',
            status: 'draft',
            origin: { countryCode: 'KW' },
            destination: { countryCode: 'KW' }
        };
        const actor = { id: 'admin-1', role: 'admin' };
        const shipment = { id: 'shipment-1', trackingNumber: 'TGR-1', status: 'draft' };
        mockCreateDraft.mockResolvedValue(shipment);

        await expect(ShipmentLifecycleService.submitShipment(command, actor)).resolves.toBe(shipment);
        expect(mockCreateDraft).toHaveBeenCalledWith(command, actor);
    });

    it.each([
        [null, { id: 'user-1' }, 'Shipment submission command is required'],
        [{ status: 'draft' }, null, 'Shipment submission actor is required']
    ])('rejects an incomplete lifecycle boundary: %p / %p', async (command, actor, message) => {
        await expect(ShipmentLifecycleService.submitShipment(command, actor)).rejects.toThrow(message);
        expect(mockCreateDraft).not.toHaveBeenCalled();
    });
});
