describe('ShipmentBookingService OTE COD payload mapping', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.doMock('../src/config/database', () => ({
            prisma: {
                shipment: {},
                user: {},
                organization: {}
            }
        }));
        jest.doMock('../src/services/CarrierFactory', () => ({
            getCarrierCapabilities: jest.fn(() => ({ supportsRating: false })),
            getAdapter: jest.fn()
        }));
        jest.doMock('../src/utils/logger', () => ({
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn()
        }));
        jest.doMock('../src/services/financeLedger.service', () => ({
            createLedgerEntry: jest.fn()
        }));
    });

    it('forces LogesTechs OTE payload to COD even when the stored UI shipment type is package', () => {
        const ShipmentBookingService = require('../src/services/ShipmentBookingService');

        const payload = ShipmentBookingService.mapToCarrierPayload({
            trackingNumber: 'TRG-COD-PAYLOAD',
            carrierCode: 'OTE',
            shipmentType: 'package',
            codAmount: 25,
            codCurrency: 'AED',
            origin: {
                contactPerson: 'Sender',
                phone: '111',
                formattedAddress: 'Origin'
            },
            destination: {
                contactPerson: 'Receiver',
                phone: '222',
                formattedAddress: 'Destination'
            }
        });

        expect(payload).toEqual(expect.objectContaining({
            shipmentType: 'COD',
            codAmount: 25,
            cod: '25',
            codCurrency: 'AED',
            codStatus: 'pending'
        }));
    });

    it('defaults missing OTE COD fields to the fixed 25 AED collection amount at booking time', () => {
        const ShipmentBookingService = require('../src/services/ShipmentBookingService');

        const payload = ShipmentBookingService.mapToCarrierPayload({
            trackingNumber: 'TRG-COD-DEFAULT',
            carrierCode: 'OTE',
            shipmentType: 'package',
            origin: { formattedAddress: 'Origin' },
            destination: { formattedAddress: 'Destination' }
        });

        expect(payload).toEqual(expect.objectContaining({
            shipmentType: 'COD',
            codAmount: 25,
            cod: '25',
            codCurrency: 'AED',
            codStatus: 'pending'
        }));
    });
});
