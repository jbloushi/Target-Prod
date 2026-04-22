/**
 * Sprint 1 Security Tests
 * Covers: F-01 (CORS config), F-02 (IDOR), F-03 (stats scoping),
 *         F-05 (JWT secret), F-09 (driver role scoping)
 */

// Ensure required env vars are present for non-config tests.
// The F-05 describe block manages its own env state independently.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-' + 'a'.repeat(52);
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

const { createMockRes } = require('../testUtils');

// ─────────────────────────────────────────────
// Shared Prisma mock (re-used across test groups)
// ─────────────────────────────────────────────
const prisma = {
    shipment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn(),
        $queryRaw: jest.fn(),
    },
    $queryRaw: jest.fn(),
};

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.doMock('../src/config/database', () => ({ prisma }));
});

// ─────────────────────────────────────────────
// F-05 — JWT_SECRET required at startup
// ─────────────────────────────────────────────
describe('F-05: JWT_SECRET startup validation', () => {
    const TEST_JWT = 'test-secret-' + 'a'.repeat(52);
    const TEST_CORS = 'http://localhost:3000';

    afterEach(() => {
        // Always restore to valid values so subsequent describe blocks can load modules
        process.env.JWT_SECRET = TEST_JWT;
        process.env.CORS_ORIGIN = TEST_CORS;
    });

    it('throws if JWT_SECRET is absent', () => {
        jest.resetModules();
        jest.mock('dotenv', () => ({ config: jest.fn() }));
        delete process.env.JWT_SECRET;
        process.env.CORS_ORIGIN = 'http://localhost:3000';
        expect(() => require('../src/config/config')).toThrow('JWT_SECRET');
    });

    it('throws if CORS_ORIGIN is absent', () => {
        jest.resetModules();
        jest.mock('dotenv', () => ({ config: jest.fn() }));
        process.env.JWT_SECRET = 'a'.repeat(64);
        delete process.env.CORS_ORIGIN;
        expect(() => require('../src/config/config')).toThrow('CORS_ORIGIN');
    });

    it('throws if CORS_ORIGIN is wildcard *', () => {
        jest.resetModules();
        jest.mock('dotenv', () => ({ config: jest.fn() }));
        process.env.JWT_SECRET = 'a'.repeat(64);
        process.env.CORS_ORIGIN = '*';
        expect(() => require('../src/config/config')).toThrow('CORS_ORIGIN');
    });
});

// ─────────────────────────────────────────────
// F-02 — IDOR: getShipmentByTrackingNumber
// ─────────────────────────────────────────────
describe('F-02: IDOR — getShipmentByTrackingNumber', () => {
    it('returns 403 when org_agent from org A requests shipment from org B', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');

        prisma.shipment.findUnique.mockResolvedValue({
            id: 'ship-1',
            trackingNumber: 'TRK-ORGB',
            userId: 'user-orgB',
            organizationId: 'org-B',
            status: 'in_transit',
        });

        const req = {
            params: { trackingNumber: 'TRK-ORGB' },
            user: { id: 'agent-orgA', role: 'org_agent', organizationId: 'org-A' },
        };
        const res = createMockRes();

        await controller.getShipmentByTrackingNumber(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('allows org_agent to access their own org shipment', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');

        prisma.shipment.findUnique.mockResolvedValue({
            id: 'ship-2',
            trackingNumber: 'TRK-ORGA',
            userId: 'agent-orgA',
            organizationId: 'org-A',
            status: 'in_transit',
            history: [],
            origin: {},
            destination: {},
            items: [],
        });
        prisma.shipment.update.mockResolvedValue({});

        const req = {
            params: { trackingNumber: 'TRK-ORGA' },
            user: { id: 'agent-orgA', role: 'org_agent', organizationId: 'org-A' },
        };
        const res = createMockRes();

        await controller.getShipmentByTrackingNumber(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('allows platform staff to access any shipment', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');

        prisma.shipment.findUnique.mockResolvedValue({
            id: 'ship-3',
            trackingNumber: 'TRK-ANY',
            userId: 'user-x',
            organizationId: 'org-X',
            status: 'in_transit',
            history: [],
            origin: {},
            destination: {},
            items: [],
        });
        prisma.shipment.update.mockResolvedValue({});

        const req = {
            params: { trackingNumber: 'TRK-ANY' },
            user: { id: 'admin-1', role: 'admin', organizationId: null },
        };
        const res = createMockRes();

        await controller.getShipmentByTrackingNumber(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ─────────────────────────────────────────────
// F-02 — IDOR: updateShipment
// ─────────────────────────────────────────────
describe('F-02: IDOR — updateShipment', () => {
    it('returns 403 when org_agent tries to update another org shipment', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');

        prisma.shipment.findUnique.mockResolvedValue({
            id: 'ship-4',
            trackingNumber: 'TRK-ORGB',
            userId: 'user-orgB',
            organizationId: 'org-B',
            status: 'draft',
            carrierCode: 'MANUAL',
            manualShipment: true,
            history: [],
            origin: {},
            destination: {},
            items: [],
            parcels: [],
        });

        const req = {
            params: { trackingNumber: 'TRK-ORGB' },
            user: { id: 'agent-orgA', role: 'org_agent', organizationId: 'org-A', name: 'Agent A' },
            body: { status: 'pending' },
        };
        const res = createMockRes();

        await controller.updateShipment(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(prisma.shipment.update).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────
// F-03 — getShipmentStats scoping
// ─────────────────────────────────────────────
describe('F-03: getShipmentStats org scoping', () => {
    it('ignores ?organizationId= for non-platform users and uses their own org', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');

        prisma.shipment.groupBy.mockResolvedValue([]);
        prisma.$queryRaw.mockResolvedValue([]);

        const req = {
            query: { organizationId: 'org-B' },
            user: { id: 'agent-orgA', role: 'org_agent', organizationId: 'org-A' },
        };
        const res = createMockRes();

        await controller.getShipmentStats(req, res);

        expect(prisma.shipment.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: 'org-A' }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('allows platform staff to filter stats by any org', async () => {
        const controller = require('../src/controllers/shipment-crud.controller');

        prisma.shipment.groupBy.mockResolvedValue([]);
        prisma.$queryRaw.mockResolvedValue([]);

        const req = {
            query: { organizationId: 'org-B' },
            user: { id: 'admin-1', role: 'admin', organizationId: null },
        };
        const res = createMockRes();

        await controller.getShipmentStats(req, res);

        expect(prisma.shipment.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: 'org-B' }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ─────────────────────────────────────────────
// F-09 — driver role scoping
// ─────────────────────────────────────────────
describe('F-09: driver scoped to assigned shipments', () => {
    it('scopeToOrg scopes driver queries to assignedDriverId', () => {
        const { scopeToOrg } = require('../src/middleware/authorize.middleware');

        const req = { user: { id: 'driver-1', role: 'driver', organizationId: null } };
        const query = {};

        scopeToOrg(req, query);

        expect(query).toEqual({ assignedDriverId: 'driver-1' });
        expect(query.organizationId).toBeUndefined();
    });

    it('canAccessShipment returns false for driver accessing unassigned shipment', () => {
        const { canAccessShipment } = require('../src/middleware/authorize.middleware');

        const req = { user: { id: 'driver-1', role: 'driver', organizationId: null } };
        const shipment = { assignedDriverId: 'driver-99', userId: 'user-x', organizationId: 'org-A' };

        expect(canAccessShipment(req, shipment)).toBe(false);
    });

    it('canAccessShipment returns true for driver accessing their assigned shipment', () => {
        const { canAccessShipment } = require('../src/middleware/authorize.middleware');

        const req = { user: { id: 'driver-1', role: 'driver', organizationId: null } };
        const shipment = { assignedDriverId: 'driver-1', userId: 'user-x', organizationId: 'org-A' };

        expect(canAccessShipment(req, shipment)).toBe(true);
    });

    it('driver is no longer a platform role', () => {
        const { isPlatformRole } = require('../src/middleware/rbac.policy');
        expect(isPlatformRole('driver')).toBe(false);
    });

    it('driver does not have VIEW_ALL_SHIPMENTS capability', () => {
        const { hasCapability } = require('../src/middleware/rbac.policy');
        expect(hasCapability('driver', 'VIEW_ALL_SHIPMENTS')).toBe(false);
    });

    it('driver has VIEW_ASSIGNED_SHIPMENTS capability', () => {
        const { hasCapability } = require('../src/middleware/rbac.policy');
        expect(hasCapability('driver', 'VIEW_ASSIGNED_SHIPMENTS')).toBe(true);
    });
});
