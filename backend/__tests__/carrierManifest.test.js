const shipmentOpsController = require('../src/controllers/shipment-ops.controller');
const { prisma } = require('../src/config/database');
const { createMockRes } = require('../testUtils');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn()
        }
    }
}));

describe('Carrier Manifest Generation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('generates a formatted carrier handover manifest with totals and items', async () => {
        prisma.shipment.findMany.mockResolvedValue([
            {
                id: 'ship-1',
                trackingNumber: 'TRK-101',
                carrierTrackingNumber: 'DHL-101',
                carrier: 'DHL',
                serviceType: 'EXPRESS',
                status: 'READY_FOR_PICKUP',
                actualWeight: 2.5,
                volumetricWeight: 1.8,
                chargeableWeight: 2.5,
                declaredValue: 50,
                currency: 'KWD',
                origin: { company: 'Kuwait Merchant', city: 'Kuwait City' },
                destination: { company: 'Dubai Retailer', city: 'Dubai', country: 'AE' },
                parcels: [{ quantity: 2, weight: 1.25 }],
                createdAt: new Date()
            },
            {
                id: 'ship-2',
                trackingNumber: 'TRK-102',
                carrierTrackingNumber: 'DHL-102',
                carrier: 'DHL',
                serviceType: 'EXPRESS',
                status: 'READY_FOR_PICKUP',
                actualWeight: 3.0,
                volumetricWeight: 4.0,
                chargeableWeight: 4.0,
                declaredValue: 120,
                currency: 'KWD',
                origin: { company: 'Kuwait Merchant', city: 'Kuwait City' },
                destination: { company: 'Riyadh Buyer', city: 'Riyadh', country: 'SA' },
                parcels: [{ quantity: 1, weight: 3.0 }],
                createdAt: new Date()
            }
        ]);

        const req = {
            body: { carrier: 'DHL', hub: 'Kuwait Central Sorting Facility' },
            user: { id: 'admin-1', role: 'ADMIN', name: 'Super Admin' }
        };
        const res = createMockRes();

        await shipmentOpsController.generateCarrierManifest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const data = res.json.mock.calls[0][0].data;
        expect(data.manifestNumber).toMatch(/^MNF-\d{8}-\d{4}$/);
        expect(data.carrier).toBe('DHL');
        expect(data.hub).toBe('Kuwait Central Sorting Facility');
        expect(data.dispatcherName).toBe('Super Admin');
        expect(data.summary.totalShipments).toBe(2);
        expect(data.summary.totalPieces).toBe(3);
        expect(data.summary.totalActualWeight).toBe(5.5);
        expect(data.summary.totalVolumetricWeight).toBe(5.8);
        expect(data.summary.totalBillableWeight).toBe(5.8);
        expect(data.summary.totalDeclaredValue).toBe(170);
        expect(data.items).toHaveLength(2);
        expect(data.items[0].trackingNumber).toBe('TRK-101');
        expect(data.items[0].destinationCountry).toBe('AE');
        expect(data.items[1].destinationCountry).toBe('SA');
    });
});
