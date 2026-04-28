jest.mock('../src/utils/logger', () => ({
    error: jest.fn()
}));

const { handleControllerError } = require('../src/utils/controllerError');

describe('controllerError provider passthrough', () => {
    const createRes = () => {
        const res = {};
        res.status = jest.fn(() => res);
        res.json = jest.fn(() => res);
        return res;
    };

    it('returns normalized provider error message when isProviderError flag is set', () => {
        const res = createRes();
        const error = new Error("Carrier booking failed: LogesTechs createShipment failed - Invalid Parameter 'model.shipmentType' null");
        error.statusCode = 400;
        error.isProviderError = true;

        handleControllerError(res, error, 'Carrier booking');

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: "Carrier booking failed: LogesTechs createShipment failed - Invalid Parameter 'model.shipmentType' null"
        });
    });


    it('surfaces non-provider booking errors for Carrier booking context', () => {
        const res = createRes();
        const error = new Error('Critical: Carrier booked shipment, locally updated failed. Manual intervention required.');

        handleControllerError(res, error, 'Carrier booking');

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Critical: Carrier booked shipment, locally updated failed. Manual intervention required.'
        });
    });

});
