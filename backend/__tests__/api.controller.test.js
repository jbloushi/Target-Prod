const { createMockRes } = require('../testUtils');

describe('client API shipment workflows', () => {
    const prisma = {
        user: { findUnique: jest.fn() },
        shipment: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() }
    };
    const createDraft = jest.fn();
    const getAdapter = jest.fn();
    const getRates = jest.fn();
    const resolveMarkup = jest.fn();
    const calculateFinalPrice = jest.fn();
    const createSnapshot = jest.fn();

    const normalizedShipment = {
        sender: {
            company: 'Sender Co',
            contactPerson: 'Sender',
            phone: '111',
            email: 'sender@example.com',
            streetLines: ['Street'],
            city: 'Kuwait City',
            countryCode: 'KW'
        },
        receiver: {
            company: 'Receiver Co',
            contactPerson: 'Receiver',
            phone: '222',
            email: 'receiver@example.com',
            streetLines: ['Street'],
            city: 'Dubai',
            countryCode: 'AE'
        },
        packages: [{ weight: { value: 1 }, dimensions: { length: 1, width: 1, height: 1 }, description: 'Box' }],
        items: [{ description: 'Item', quantity: 1, weight: 1 }]
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.doMock('../src/config/database', () => ({ prisma }));
        jest.doMock('../src/services/ShipmentDraftService', () => ({ createDraft }));
        jest.doMock('../src/services/CarrierFactory', () => ({ getAdapter }));
        jest.doMock('../src/services/CarrierRateService', () => ({ getRates }));
        jest.doMock('../src/services/pricing.service', () => ({
            resolveMarkup,
            calculateFinalPrice,
            createSnapshot
        }));
        jest.doMock('../src/utils/shipmentNormalizer', () => ({
            normalizeShipment: jest.fn(() => ({ ...normalizedShipment }))
        }));
    });

    const apiUser = (shippingAccess) => ({
        id: 'user-1',
        email: 'client@example.com',
        organizationId: 'org-1',
        agentPolicy: { shippingAccess },
        organization: { id: 'org-1', markup: { type: 'PERCENTAGE', percentageValue: 10 } }
    });

    it('creates internal shipments without requiring carrier data from the API client', async () => {
        const controller = require('../src/controllers/api.controller');
        const req = {
            user: { id: 'user-1', organizationId: 'org-1' },
            body: { origin: {}, destination: {}, parcels: [] }
        };
        const res = createMockRes();

        prisma.user.findUnique.mockResolvedValue(apiUser({ carrierCode: 'INTERNAL' }));
        createDraft.mockResolvedValue({
            trackingNumber: 'TGR-1',
            carrierCode: 'INTERNAL',
            serviceCode: 'STD',
            status: 'draft',
            price: 0,
            currency: 'KWD'
        });

        await controller.createShipment(req, res);

        expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({
            carrierCode: 'INTERNAL',
            serviceCode: null,
            internallyManaged: true
        }), expect.objectContaining({ id: 'user-1' }));
        expect(getAdapter).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ carrier: 'INTERNAL', status: 'draft' })
        }));
    });

    it('enforces assigned carrier and service when clients try to override API access', async () => {
        const controller = require('../src/controllers/api.controller');
        const req = {
            user: { id: 'user-1', organizationId: 'org-1' },
            body: { carrierCode: 'FEDEX', serviceCode: 'P' }
        };
        const res = createMockRes();

        prisma.user.findUnique.mockResolvedValue(apiUser({ carrierCode: 'DGR', serviceCode: 'Y' }));

        await controller.createShipment(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error: expect.stringMatching(/not allowed/i)
        }));
    });

    it('books carrier shipments with the assigned service, ignoring missing carrier fields from client', async () => {
        const controller = require('../src/controllers/api.controller');
        const req = {
            user: { id: 'user-1', organizationId: 'org-1' },
            body: { origin: {}, destination: {}, parcels: [] }
        };
        const res = createMockRes();
        const adapter = {
            validate: jest.fn().mockResolvedValue([]),
            createShipment: jest.fn().mockResolvedValue({
                trackingNumber: 'DGR-1',
                totalPrice: 12.5,
                dhlTrackingNumber: 'DHL-1'
            })
        };

        prisma.user.findUnique.mockResolvedValue(apiUser({ carrierCode: 'DGR', serviceCode: 'Y' }));
        getAdapter.mockReturnValue(adapter);
        prisma.shipment.create.mockResolvedValue({
            trackingNumber: 'DGR-1',
            serviceCode: 'Y',
            status: 'booked',
            labelUrl: null,
            invoiceUrl: null
        });

        await controller.createShipment(req, res);

        expect(getAdapter).toHaveBeenCalledWith('DGR');
        expect(adapter.createShipment).toHaveBeenCalledWith(expect.objectContaining({
            serviceCode: 'Y',
            user: 'user-1'
        }), 'Y');
        expect(prisma.shipment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                carrierCode: 'DGR',
                serviceCode: 'Y',
                status: 'booked'
            })
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('books OTE API shipments as fixed COD and persists carrier identifiers', async () => {
        const controller = require('../src/controllers/api.controller');
        const req = {
            user: { id: 'user-1', organizationId: 'org-1' },
            body: { origin: {}, destination: {}, parcels: [] }
        };
        const res = createMockRes();
        const adapter = {
            validate: jest.fn().mockResolvedValue([]),
            createShipment: jest.fn().mockResolvedValue({
                trackingNumber: '100368200545',
                carrierShipmentId: '368200054'
            })
        };

        prisma.user.findUnique.mockResolvedValue(apiUser({ carrierCode: 'OTE', serviceCode: 'STD' }));
        getAdapter.mockReturnValue(adapter);
        prisma.shipment.create.mockResolvedValue({
            trackingNumber: '100368200545',
            serviceCode: 'STD',
            status: 'booked',
            labelUrl: null,
            invoiceUrl: null,
            codAmount: 25,
            codCurrency: 'AED',
            codStatus: 'pending'
        });

        await controller.createShipment(req, res);

        expect(adapter.createShipment).toHaveBeenCalledWith(expect.objectContaining({
            serviceCode: 'STD',
            shipmentType: 'COD',
            codAmount: 25,
            codCurrency: 'AED',
            codStatus: 'pending'
        }), 'STD');
        expect(prisma.shipment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                carrierCode: 'OTE',
                serviceCode: 'STD',
                price: 25,
                currency: 'AED',
                codAmount: 25,
                codCurrency: 'AED',
                codStatus: 'pending',
                dhlTrackingNumber: '100368200545',
                carrierShipmentId: '368200054',
                dhlConfirmed: true
            })
        }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                codAmount: 25,
                codCurrency: 'AED',
                codStatus: 'pending'
            })
        }));
    });

    it('returns only the assigned service in quotation responses', async () => {
        const controller = require('../src/controllers/api.controller');
        const req = {
            user: { id: 'user-1' },
            body: { origin: {}, destination: {}, parcels: [] }
        };
        const res = createMockRes();

        prisma.user.findUnique.mockResolvedValue(apiUser({ carrierCode: 'DGR', serviceCode: 'Y' }));
        getRates.mockResolvedValue([
            { serviceCode: 'P', serviceName: 'DHL Express Worldwide', totalPrice: 10, currency: 'KWD' },
            { serviceCode: 'Y', serviceName: 'DHL Express 12:00', totalPrice: 15, currency: 'KWD' }
        ]);
        resolveMarkup.mockReturnValue({ markup: { type: 'PERCENTAGE', percentageValue: 10 } });
        calculateFinalPrice.mockReturnValue({ finalPrice: 16.5 });

        await controller.getQuotation(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toEqual([
            expect.objectContaining({
                carrier: 'DGR',
                serviceCode: 'Y',
                totalPrice: 16.5
            })
        ]);
    });
});
