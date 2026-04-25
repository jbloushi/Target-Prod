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

    it('validates required shipment address IDs for createShipment', async () => {
        const adapter = createAdapter();

        await expect(adapter.createShipment({
            sender: { cityId: '1', regionId: '2', villageId: '3' },
            receiver: { cityId: '1', regionId: '2' }
        })).rejects.toThrow(/destinationAddress is missing required fields: villageId/i);
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
            carrierCode: 'LOGESTECHS'
        }));
    });

    it('requires ids array for getLabel', async () => {
        const adapter = createAdapter();
        await expect(adapter.getLabel()).rejects.toThrow(/ids array required/i);
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
