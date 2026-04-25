jest.mock('axios', () => ({ create: jest.fn() }));

describe('LogesTechsAdapter', () => {
    let LogesTechsAdapter;
    let shipmentClient;
    let fulfillmentClient;
    let axios;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        shipmentClient = {
            post: jest.fn(),
            get: jest.fn(),
            put: jest.fn()
        };
        fulfillmentClient = {
            post: jest.fn(),
            get: jest.fn()
        };

        axios = require('axios');
        let clientCreateCount = 0;
        axios.create.mockImplementation(() => {
            clientCreateCount += 1;
            return clientCreateCount === 1 ? shipmentClient : fulfillmentClient;
        });

        LogesTechsAdapter = require('../src/adapters/LogesTechsAdapter');
    });

    const createAdapter = () => new LogesTechsAdapter({
        shipmentBaseUrl: 'https://apisv2.logestechs.com/api',
        fulfillmentBaseUrl: 'https://apisv5.logestechs.com/api',
        companyId: 'cmp-1',
        username: 'user-1',
        password: 'secret-pass',
        email: 'ops@example.com'
    });

    it('accepts textual addresses when city/region/village IDs are not provided', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({
            data: [{ id: 'v-10', cityId: 'c-10', regionId: 'r-10' }]
        });
        shipmentClient.post.mockResolvedValue({
            data: { shipmentId: 'shp-124', barcode: 'BR-124' }
        });

        const result = await adapter.createShipment({
            sender: { addressLine1: 'Block 1', city: 'Kuwait City', state: 'Capital' },
            receiver: { addressLine1: 'Street 10', city: 'Riyadh', state: 'Riyadh' }
        });

        expect(result).toEqual(expect.objectContaining({
            carrierShipmentId: 'shp-124',
            trackingNumber: 'BR-124'
        }));
        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            destinationAddress: expect.objectContaining({ villageId: 'v-10', cityId: 'c-10', regionId: 'r-10' })
        }), expect.any(Object));
    });

    it('creates shipment and maps shipmentId/barcode fields', async () => {
        const adapter = createAdapter();
        shipmentClient.post.mockResolvedValue({
            data: {
                shipmentId: 'shp-123',
                barcode: 'BR-123'
            }
        });

        const result = await adapter.createShipment({
            sender: {
                addressLine1: 'شارع الخليج',
                cityId: '1',
                regionId: '2',
                villageId: '3'
            },
            receiver: {
                addressLine1: 'King Fahd Road',
                cityId: '4',
                regionId: '5',
                villageId: '6'
            },
            parcels: [{
                quantity: 1,
                weight: { value: 2.5 },
                dimensions: { length: 20, width: 15, height: 10 },
                description: 'وثائق'
            }]
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            email: 'ops@example.com',
            password: 'secret-pass',
            pkgUnitType: 'METRIC',
            destinationAddress: expect.objectContaining({ villageId: '6' }),
            originAddress: expect.objectContaining({ villageId: '3' })
        }), expect.any(Object));

        expect(result).toEqual(expect.objectContaining({
            carrierShipmentId: 'shp-123',
            barcode: 'BR-123',
            trackingNumber: 'BR-123',
            carrierCode: 'OTE'
        }));
    });

    it('requires ids array for getLabel', async () => {
        const adapter = createAdapter();
        await expect(adapter.getLabel()).rejects.toThrow(/ids array required/i);
    });

    it('maps sparse addresses without blocking booking flow', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockResolvedValue({
            data: { shipmentId: 'shp-126', barcode: 'BR-126' }
        });

        const result = await adapter.createShipment({
            sender: { addressLine1: 'Only line' },
            receiver: { addressLine1: 'Only line' }
        });

        expect(result).toEqual(expect.objectContaining({
            carrierShipmentId: 'shp-126',
            trackingNumber: 'BR-126'
        }));
    });

    it('exposes upstream provider message when createShipment fails', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockRejectedValue({
            response: {
                status: 400,
                data: { detail: 'villageId is invalid for selected city' }
            }
        });

        await expect(adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        })).rejects.toThrow(/villageId is invalid for selected city/i);
    });

    it('requires barcode or id for getStatus', async () => {
        const adapter = createAdapter();
        await expect(adapter.getStatus({})).rejects.toThrow(/barcode or id required/i);
    });

    it('uses fulfillment API base client for products and orders', async () => {
        const adapter = createAdapter();
        fulfillmentClient.get.mockResolvedValue({ data: { items: [] } });
        fulfillmentClient.post.mockResolvedValue({ data: { success: true } });

        await adapter.getProducts({ page: 2, pageSize: 5 });
        await adapter.addFulfillmentOrder({ orderNo: 'O-1' });

        expect(fulfillmentClient.get).toHaveBeenCalledWith('/public/fulfillment/product', expect.objectContaining({
            params: { page: 2, pageSize: 5 }
        }));
        expect(fulfillmentClient.post).toHaveBeenCalledWith('/public/fulfillment/order', { orderNo: 'O-1' }, expect.any(Object));
    });
});
