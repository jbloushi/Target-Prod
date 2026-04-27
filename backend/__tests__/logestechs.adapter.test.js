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

    const createAdapter = (overrides = {}) => new LogesTechsAdapter({
        shipmentBaseUrl: 'https://apisv2.logestechs.com/api',
        fulfillmentBaseUrl: 'https://apisv5.logestechs.com/api',
        companyId: 'cmp-1',
        username: 'user-1',
        password: 'secret-pass',
        email: 'ops@example.com',
        shipmentEmail: 'shipper@example.com',
        shipmentPassword: 'shipment-pass',
        ...overrides
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
            email: 'shipper@example.com',
            password: 'shipment-pass',
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

    it('includes sender/receiver and service metadata in pkg payload for OTE create request', async () => {
        const adapter = createAdapter();
        shipmentClient.post.mockResolvedValue({ data: { shipmentId: 'shp-130', barcode: 'BR-130' } });

        await adapter.createShipment({
            trackingNumber: 'DGR-VKLIWS4W',
            shipmentType: 'REGULAR',
            serviceType: 'STANDARD',
            notes: 'Connection test',
            sender: {
                contactPerson: 'Target Logistics',
                phone: '966500000000',
                addressLine1: 'Origin',
                cityId: 1,
                regionId: 1,
                villageId: 1
            },
            receiver: {
                contactPerson: 'Test Receiver',
                phone: '971500000000',
                addressLine1: 'Destination',
                cityId: 1,
                regionId: 1,
                villageId: 1
            },
            parcels: [{ quantity: 1 }]
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            pkg: expect.objectContaining({
                quantity: 1,
                senderName: 'Target Logistics',
                senderPhone: '966500000000',
                receiverName: 'Test Receiver',
                receiverPhone: '971500000000',
                serviceType: 'STANDARD',
                shipmentType: 'REGULAR',
                notes: 'Connection test',
                invoiceNumber: 'DGR-VKLIWS4W'
            })
        }), expect.any(Object));
    });

    it('sends top-level shipmentType/serviceType defaults required by OTE model validation', async () => {
        const adapter = createAdapter();
        shipmentClient.post.mockResolvedValue({ data: { shipmentId: 'shp-131', barcode: 'BR-131' } });

        await adapter.createShipment({
            trackingNumber: 'DGR-NULL-SHIPMENT-TYPE',
            sender: { addressLine1: 'Origin', cityId: 1, regionId: 1, villageId: 1 },
            receiver: { addressLine1: 'Destination', cityId: 1, regionId: 1, villageId: 1 },
            parcels: [{ quantity: 1 }]
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            shipmentType: 'REGULAR',
            serviceType: 'STANDARD'
        }), expect.any(Object));
    });

    it('treats string placeholders like "null" as missing and falls back to defaults', async () => {
        const adapter = createAdapter();
        shipmentClient.post.mockResolvedValue({ data: { shipmentId: 'shp-132', barcode: 'BR-132' } });

        await adapter.createShipment({
            shipmentType: 'null',
            serviceType: 'undefined',
            sender: { addressLine1: 'Origin', cityId: 1, regionId: 1, villageId: 1 },
            receiver: { addressLine1: 'Destination', cityId: 1, regionId: 1, villageId: 1 },
            parcels: [{ quantity: 1 }]
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            shipmentType: 'REGULAR',
            serviceType: 'STANDARD',
            pkg: expect.objectContaining({ shipmentType: 'REGULAR', serviceType: 'STANDARD' })
        }), expect.any(Object));
    });

    it('uses username as shipment email fallback when LOGESTECHS_EMAIL is not set', async () => {
        const adapter = createAdapter({ shipmentEmail: '', email: '' });
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockResolvedValue({ data: { shipmentId: 'shp-127', barcode: 'BR-127' } });

        await adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            email: 'user-1'
        }), expect.any(Object));
    });

    it('prefers username over LOGESTECHS_EMAIL when shipment override is missing', async () => {
        const adapter = createAdapter({ shipmentEmail: '', email: 'legacy-email@example.com' });
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockResolvedValue({ data: { shipmentId: 'shp-129', barcode: 'BR-129' } });

        await adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            email: 'user-1'
        }), expect.any(Object));
    });

    it('falls back to LOGESTECHS_PASSWORD when shipment password override is missing', async () => {
        const adapter = createAdapter({ shipmentPassword: '' });
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockResolvedValue({ data: { shipmentId: 'shp-128', barcode: 'BR-128' } });

        await adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        });

        expect(shipmentClient.post).toHaveBeenCalledWith('/ship/request/by-email', expect.objectContaining({
            password: 'secret-pass'
        }), expect.any(Object));
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

    it('normalizes provider authentication errors to actionable env guidance', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockRejectedValue({
            response: {
                status: 400,
                data: { detail: 'البريد الالكتروني او كلمة المرور غير صحيحة' }
            }
        });

        await expect(adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        })).rejects.toThrow(/LOGESTECHS_COMPANY_ID, LOGESTECHS_USERNAME, LOGESTECHS_PASSWORD/i);
    });

    it('includes status code context when provider returns generic unknown error', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockRejectedValue({
            response: {
                status: 500,
                data: { error: 'Unknown error' }
            }
        });

        await expect(adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        })).rejects.toThrow(/Unknown error \(status 500\)/i);
    });

    it('extracts provider title/reason fields for clearer booking failures', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({ data: [] });
        shipmentClient.post.mockRejectedValue({
            response: {
                status: 422,
                data: { title: 'Validation failed', reason: 'invalid destination region' }
            }
        });

        await expect(adapter.createShipment({
            sender: { addressLine1: 'S', city: 'Kuwait' },
            receiver: { addressLine1: 'R', city: 'Riyadh' }
        })).rejects.toThrow(/Validation failed/i);
    });

    it('requires barcode or id for getStatus', async () => {
        const adapter = createAdapter();
        await expect(adapter.getStatus({})).rejects.toThrow(/barcode or id required/i);
    });

    it('maps provider deliveryRoute into tracking events history', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({
            data: {
                status: 'PENDING_CUSTOMER_CARE_APPROVAL',
                enStatus: 'Pending Customer Care Approval',
                nextDestination: 'Nablus',
                deliveryRoute: [
                    {
                        name: 'Pending',
                        arabicName: 'طلب جديد',
                        deliveryDate: '2026-04-27T14:09:48.821+0000'
                    }
                ]
            }
        });

        const tracking = await adapter.getTracking('100448960604');

        expect(tracking.status).toBe('PENDING_CUSTOMER_CARE_APPROVAL');
        expect(tracking.events).toEqual([
            expect.objectContaining({
                statusCode: 'Pending',
                description: 'طلب جديد',
                location: 'Nablus'
            })
        ]);
    });

    it('keeps canonical event list when provider already returns events', async () => {
        const adapter = createAdapter();
        shipmentClient.get.mockResolvedValue({
            data: {
                status: 'IN_TRANSIT',
                events: [{ statusCode: 'IN_TRANSIT', description: 'Left hub', timestamp: '2026-04-27T10:00:00Z' }]
            }
        });

        const tracking = await adapter.getTracking('TRK-1');
        expect(tracking.events).toEqual([
            expect.objectContaining({ statusCode: 'IN_TRANSIT', description: 'Left hub' })
        ]);
    });

    it('uses fulfillment API base client for products and orders', async () => {
        const adapter = createAdapter();
        fulfillmentClient.get.mockResolvedValue({ data: { items: [] } });
        fulfillmentClient.post.mockResolvedValue({ data: { success: true } });

        await adapter.getProducts({ page: 2, pageSize: 5 });
        await adapter.addFulfillmentOrder({
            receiverName: 'Receiver',
            receiverPhone: '00970',
            receiverAddress: { city: 'Amman', region: 'Amman', village: 'Aappa', addressLine1: 'Main street' },
            items: [{ sku: 'abc', price: 1, quantity: 2 }]
        });
        await adapter.addOrUpdateProducts([{ sku: 'abc' }]);

        expect(fulfillmentClient.get).toHaveBeenCalledWith('/public/fulfillment/product', expect.objectContaining({
            params: { page: 2, pageSize: 5 }
        }));
        expect(fulfillmentClient.post).toHaveBeenCalledWith('/public/fulfillment/order', expect.objectContaining({
            receiverName: 'Receiver',
            shipmentType: 'REGULAR',
            codCollectionMethod: 'PREPAID',
            cod: '0',
            receiverAddress: expect.objectContaining({ city: 'Amman', region: 'Amman', village: 'Aappa' }),
            items: [expect.objectContaining({ sku: 'abc', price: 1, quantity: 2 })]
        }), expect.any(Object));
        expect(fulfillmentClient.post).toHaveBeenCalledWith('/public/fulfillment/product/bulk', {
            list: [expect.objectContaining({ sku: 'abc', quantity: 0, price: 0 })]
        }, expect.any(Object));
    });
});
