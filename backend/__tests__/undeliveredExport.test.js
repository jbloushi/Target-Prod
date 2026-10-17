const shipmentCrudController = require('../src/controllers/shipment-crud.controller');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findMany: jest.fn()
        }
    }
}));

describe('exportUndeliveredShipmentsLog', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('generates CSV with correct headers, BOM, and calculates tiers and aging accurately', async () => {
        const nowMs = Date.now();
        const mockShipments = [
            {
                id: 's1',
                trackingNumber: 'TRK-9501741141',
                dhlTrackingNumber: '9501741141',
                carrierCode: 'DGR',
                status: 'in_transit',
                createdAt: new Date(nowMs - 77 * 24 * 60 * 60 * 1000), // ~77 days old -> Tier 3 (15d)
                updatedAt: new Date(nowMs - 16 * 24 * 60 * 60 * 1000),
                origin: { city: 'Kuwait City', country: 'KW' },
                destination: { city: 'Riyadh', country: 'SA', contactName: 'Abdullah Al-Saleh', phone: '+966501234567' },
                history: [
                    { status: 'in_transit', description: 'Departed Facility in Kuwait', timestamp: new Date(nowMs - 76 * 24 * 60 * 60 * 1000).toISOString() }
                ],
                organization: { name: 'Target Express' }
            },
            {
                id: 's2',
                trackingNumber: 'TRK-38290256664',
                carrierTrackingNumber: '38290256664',
                carrierCode: 'ARAMEX',
                status: 'out_for_delivery',
                createdAt: new Date(nowMs - 2 * 24 * 60 * 60 * 1000), // 2 days old, but out_for_delivery -> Urgent (1h)
                updatedAt: new Date(nowMs - 2 * 60 * 60 * 1000),
                origin: { city: 'Dubai', country: 'AE' },
                destination: { city: 'Kuwait City', country: 'KW', contactName: 'Fahad', phone: '+96599887766' },
                history: [
                    { status: 'out_for_delivery', description: 'Out for Delivery with Courier', timestamp: new Date(nowMs - 4 * 60 * 60 * 1000).toISOString() }
                ],
                organization: { name: 'Global Logistics' }
            }
        ];

        prisma.shipment.findMany.mockResolvedValueOnce(mockShipments);

        const req = {
            user: { role: 'admin' },
            query: {}
        };

        const res = {
            statusCode: 200,
            headers: {},
            data: null,
            setHeader(key, val) {
                this.headers[key] = val;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            send(content) {
                this.data = content;
                return this;
            }
        };

        await shipmentCrudController.exportUndeliveredShipmentsLog(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
        expect(res.headers['Content-Disposition']).toMatch(/undelivered-shipments-log-\d{4}-\d{2}-\d{2}\.csv/);
        expect(res.data.startsWith('\uFEFF')).toBe(true);

        const lines = res.data.replace('\uFEFF', '').split('\r\n');
        expect(lines[0]).toBe('Tracking Number,Carrier AWB,Carrier Code,Status,Created Date,Days in Transit,Polling Tier,Next Check Due,Last Checked At,Days Since Check,Latest Event,Event Date,Origin,Destination,Consignee,Phone,Organization');

        // Verify line 1 (Tier 3 shipment)
        expect(lines[1]).toContain('"TRK-9501741141"');
        expect(lines[1]).toContain('"9501741141"');
        expect(lines[1]).toContain('"DGR"');
        expect(lines[1]).toContain('"in_transit"');
        expect(lines[1]).toContain('"Tier 3 (15d)"');
        expect(lines[1]).toContain('"Abdullah Al-Saleh"');

        // Verify line 2 (Urgent shipment)
        expect(lines[2]).toContain('"TRK-38290256664"');
        expect(lines[2]).toContain('"out_for_delivery"');
        expect(lines[2]).toContain('"Urgent (1h)"');

        // Verify prisma query excluded terminal statuses
        const queryCall = prisma.shipment.findMany.mock.calls[0][0];
        expect(queryCall.where.status).toEqual({ notIn: ['delivered', 'cancelled', 'returned'] });
    });

    test('supports filtering by tier in query parameters', async () => {
        const nowMs = Date.now();
        const mockShipments = [
            {
                id: 's1',
                trackingNumber: 'TRK-1',
                carrierCode: 'DGR',
                status: 'in_transit',
                createdAt: new Date(nowMs - 77 * 24 * 60 * 60 * 1000), // Tier 3
                history: []
            },
            {
                id: 's2',
                trackingNumber: 'TRK-2',
                carrierCode: 'DHL',
                status: 'in_transit',
                createdAt: new Date(nowMs - 1 * 24 * 60 * 60 * 1000), // Tier 1
                history: []
            }
        ];

        prisma.shipment.findMany.mockResolvedValueOnce(mockShipments);

        const req = {
            user: { role: 'admin' },
            query: { tier: 'Tier 3' }
        };

        const res = {
            headers: {},
            setHeader(k, v) { this.headers[k] = v; },
            status() { return this; },
            send(content) { this.data = content; return this; }
        };

        await shipmentCrudController.exportUndeliveredShipmentsLog(req, res);

        const lines = res.data.replace('\uFEFF', '').split('\r\n');
        expect(lines).toHaveLength(2); // Header + 1 filtered row
        expect(lines[1]).toContain('"TRK-1"');
        expect(lines[1]).not.toContain('"TRK-2"');
    });
});
