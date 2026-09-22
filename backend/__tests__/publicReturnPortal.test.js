const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    connectDB: jest.fn(),
    closeDB: jest.fn(),
    prisma: {
        shipment: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        }
    }
}));

jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn(),
    mapStatusToNotificationEvent: jest.fn()
}));

describe('Public Self-Service Return Portal API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET /api/shipments/public/:trackingNumber/return-eligibility confirms eligible delivered package', async () => {
        prisma.shipment.findUnique.mockResolvedValueOnce({
            id: 'ship-del-1',
            trackingNumber: 'TRK-DEL-100',
            status: 'DELIVERED',
            updatedAt: new Date(),
            origin: { city: 'Kuwait City', countryCode: 'KW' },
            destination: { city: 'Riyadh', countryCode: 'SA' },
            organization: { name: 'Acme Retail' },
            history: [{ status: 'DELIVERED', timestamp: new Date().toISOString() }]
        });

        prisma.shipment.findFirst.mockResolvedValueOnce(null); // No existing return

        const res = await request(app)
            .get('/api/shipments/public/TRK-DEL-100/return-eligibility');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.eligible).toBe(true);
        expect(res.body.data.merchant).toBe('Acme Retail');
        expect(res.body.data.daysRemaining).toBeGreaterThanOrEqual(13);
    });

    test('GET /api/shipments/public/:trackingNumber/return-eligibility rejects undelivered package', async () => {
        prisma.shipment.findUnique.mockResolvedValueOnce({
            id: 'ship-in-transit-1',
            trackingNumber: 'TRK-TRANSIT-100',
            status: 'in_transit'
        });

        const res = await request(app)
            .get('/api/shipments/public/TRK-TRANSIT-100/return-eligibility');

        expect(res.status).toBe(400);
        expect(res.body.eligible).toBe(false);
        expect(res.body.error).toMatch(/Returns are only eligible after delivery/);
    });

    test('POST /api/shipments/public/:trackingNumber/create-return generates reverse waybill', async () => {
        prisma.shipment.findUnique.mockResolvedValueOnce({
            id: 'ship-del-1',
            trackingNumber: 'TRK-DEL-100',
            status: 'DELIVERED',
            carrier: 'DHL',
            carrierCode: 'DHL',
            origin: { city: 'Kuwait City', contactPerson: 'Sender' },
            destination: { city: 'Riyadh', contactPerson: 'Receiver' },
            items: [{ name: 'Silk Shirt', quantity: 1, declaredValue: 50 }],
            parcels: [{ weight: 1.0 }]
        });

        prisma.shipment.create.mockResolvedValueOnce({
            id: 'ret-1',
            trackingNumber: 'RET-DEL-100-1234',
            status: 'ready_for_pickup',
            isReturn: true,
            parentShipmentId: 'ship-del-1',
            origin: { city: 'Riyadh', contactPerson: 'Receiver' },
            destination: { city: 'Kuwait City', contactPerson: 'Sender' }
        });

        const res = await request(app)
            .post('/api/shipments/public/TRK-DEL-100/create-return')
            .send({
                returnReason: 'Wrong Item Received',
                customerNotes: 'Received blue instead of red shirt',
                pickupPreference: 'COURIER_PICKUP'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.isReturn).toBe(true);
        expect(prisma.shipment.create).toHaveBeenCalled();
    });
});
