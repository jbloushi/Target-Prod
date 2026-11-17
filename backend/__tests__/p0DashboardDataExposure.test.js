const { CAPABILITIES, hasCapability, isPlatformRole } = require('../src/middleware/rbac.policy');
const { scopeShipmentWhere, mergeScope } = require('../src/middleware/authorize.middleware');
const { createMockRes } = require('../testUtils');

describe('P0 Security Fixes: Cost & Margin Exposure, Staff Finance Isolation, and Triage Multi-Tenancy Scoping', () => {
    describe('1. RBAC Policy Invariants', () => {
        test('VIEW_COST_DATA is granted ONLY to admin and accounting', () => {
            expect(hasCapability('admin', CAPABILITIES.VIEW_COST_DATA)).toBe(true);
            expect(hasCapability('accounting', CAPABILITIES.VIEW_COST_DATA)).toBe(true);
            expect(hasCapability('manager', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
            expect(hasCapability('staff', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
            expect(hasCapability('client', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
            expect(hasCapability('org_manager', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
            expect(hasCapability('org_agent', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
            expect(hasCapability('driver', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
        });

        test('staff role has NO finance capabilities (VIEW_FINANCE, VIEW_INVOICES, VIEW_COST_DATA)', () => {
            expect(hasCapability('staff', CAPABILITIES.VIEW_FINANCE)).toBe(false);
            expect(hasCapability('staff', CAPABILITIES.VIEW_INVOICES)).toBe(false);
            expect(hasCapability('staff', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
            expect(hasCapability('staff', CAPABILITIES.MANAGE_PAYMENTS)).toBe(false);
            expect(hasCapability('staff', CAPABILITIES.REVERSE_PAYMENTS)).toBe(false);
        });

        test('staff retains operational platform capabilities and remains a global platform role', () => {
            expect(isPlatformRole('staff')).toBe(true);
            expect(hasCapability('staff', CAPABILITIES.VIEW_ALL_SHIPMENTS)).toBe(true);
            expect(hasCapability('staff', CAPABILITIES.APPROVE_SHIPMENTS)).toBe(true);
            expect(hasCapability('staff', CAPABILITIES.BOOK_CARRIERS)).toBe(true);
            expect(hasCapability('staff', CAPABILITIES.VIEW_DOCUMENTS)).toBe(true);
            expect(hasCapability('staff', CAPABILITIES.UPDATE_SHIPMENT_LOCATION)).toBe(true);
            expect(hasCapability('staff', CAPABILITIES.MANAGE_SHIPMENT_CHECKPOINTS)).toBe(true);
        });

        test('manager retains VIEW_FINANCE and VIEW_INVOICES but has NO VIEW_COST_DATA', () => {
            expect(hasCapability('manager', CAPABILITIES.VIEW_FINANCE)).toBe(true);
            expect(hasCapability('manager', CAPABILITIES.VIEW_INVOICES)).toBe(true);
            expect(hasCapability('manager', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
        });
    });

    describe('2. Stats Endpoint Financial & Margin Exposure (getShipmentStats)', () => {
        let prisma;
        let controller;

        const dummyShipments = [
            {
                id: 's-1',
                status: 'delivered',
                price: 100,
                costPrice: 60,
                totalPaid: 100,
                createdAt: new Date('2026-01-01'),
                updatedAt: new Date('2026-01-02')
            },
            {
                id: 's-2',
                status: 'in_transit',
                price: 50,
                costPrice: 30,
                totalPaid: 20,
                createdAt: new Date('2026-01-01'),
                updatedAt: new Date('2026-01-02')
            }
        ];

        beforeEach(() => {
            jest.resetModules();
            jest.clearAllMocks();
            prisma = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue(dummyShipments),
                    count: jest.fn().mockResolvedValue(2),
                    groupBy: jest.fn().mockResolvedValue([])
                }
            };
            jest.doMock('../src/config/database', () => ({ prisma }));
            controller = require('../src/controllers/shipment-crud.controller');
        });

        test('admin receives wholesale costs, gross margin, and margin percentage', async () => {
            const req = {
                query: {},
                user: { id: 'admin-1', role: 'admin' }
            };
            const res = createMockRes();

            await controller.getShipmentStats(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const data = res.json.mock.calls[0][0].data;
            expect(data.financials).toBeDefined();
            expect(data.financials.totalBilled).toBe('150.000');
            expect(data.financials.totalPaid).toBe('120.000');
            expect(data.financials.outstandingBalance).toBe('30.000');
            expect(data.financials.totalCost).toBe('90.000');
            expect(data.financials.grossMargin).toBe('60.000');
            expect(data.financials.marginPercentage).toBe('40.0%');
        });

        test('accounting receives wholesale costs, gross margin, and margin percentage', async () => {
            const req = {
                query: {},
                user: { id: 'acct-1', role: 'accounting' }
            };
            const res = createMockRes();

            await controller.getShipmentStats(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const data = res.json.mock.calls[0][0].data;
            expect(data.financials).toBeDefined();
            expect(data.financials.totalCost).toBe('90.000');
            expect(data.financials.grossMargin).toBe('60.000');
            expect(data.financials.marginPercentage).toBe('40.0%');
        });

        test('manager receives billing totals but NO totalCost, grossMargin, or marginPercentage', async () => {
            const req = {
                query: {},
                user: { id: 'mgr-1', role: 'manager' }
            };
            const res = createMockRes();

            await controller.getShipmentStats(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const data = res.json.mock.calls[0][0].data;
            expect(data.financials).toBeDefined();
            expect(data.financials.totalBilled).toBe('150.000');
            expect(data.financials.totalPaid).toBe('120.000');
            expect(data.financials.outstandingBalance).toBe('30.000');
            expect(data.financials.totalCost).toBeUndefined();
            expect(data.financials.grossMargin).toBeUndefined();
            expect(data.financials.marginPercentage).toBeUndefined();
        });

        test('staff receives NO financials (financials is null)', async () => {
            const req = {
                query: {},
                user: { id: 'staff-1', role: 'staff' }
            };
            const res = createMockRes();

            await controller.getShipmentStats(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const data = res.json.mock.calls[0][0].data;
            expect(data.financials).toBeNull();
        });
    });

    describe('3. Triage Endpoint Multi-Tenancy Scoping (NEW-F14)', () => {
        let prisma;
        let controller;

        beforeEach(() => {
            jest.resetModules();
            jest.clearAllMocks();
            prisma = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue([]),
                    findUnique: jest.fn(),
                    update: jest.fn()
                }
            };
            jest.doMock('../src/config/database', () => ({ prisma }));
            jest.doMock('../src/controllers/shipment.helpers', () => ({
                ...jest.requireActual('../src/controllers/shipment.helpers'),
                autoSyncAllExceptions: jest.fn().mockResolvedValue([])
            }));
            controller = require('../src/controllers/shipment-crud.controller');
        });

        test('client calling getTriageShipments scopes query to own shipments and does NOT leak other tenants', async () => {
            const req = {
                query: {},
                user: { id: 'client-uuid-1', role: 'client', organizationId: null }
            };
            const res = createMockRes();

            await controller.getTriageShipments(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(prisma.shipment.findMany).toHaveBeenCalled();
            const findManyArgs = prisma.shipment.findMany.mock.calls.find(call => call[0]?.take === 20)?.[0] || prisma.shipment.findMany.mock.calls[0][0];

            // Must NOT have unconstrained query; must contain client user scoping
            expect(findManyArgs.where).toBeDefined();
            expect(findManyArgs.where.AND).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        OR: expect.arrayContaining([
                            { userId: 'client-uuid-1' },
                            { createdOnBehalfOfUserId: 'client-uuid-1' }
                        ])
                    })
                ])
            );
        });

        test('org_manager calling getTriageShipments scopes query to organizationId', async () => {
            const req = {
                query: {},
                user: { id: 'org-mgr-1', role: 'org_manager', organizationId: 'org-apex-1' }
            };
            const res = createMockRes();

            await controller.getTriageShipments(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const findManyArgs = prisma.shipment.findMany.mock.calls.find(call => call[0]?.take === 20)?.[0] || prisma.shipment.findMany.mock.calls[0][0];
            expect(findManyArgs.where.organizationId).toBe('org-apex-1');
        });

        test('admin calling getTriageShipments has platform-wide visibility', async () => {
            const req = {
                query: {},
                user: { id: 'admin-1', role: 'admin' }
            };
            const res = createMockRes();

            await controller.getTriageShipments(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const findManyArgs = prisma.shipment.findMany.mock.calls.find(call => call[0]?.take === 20)?.[0] || prisma.shipment.findMany.mock.calls[0][0];
            expect(findManyArgs.where.organizationId).toBeUndefined();
            expect(findManyArgs.where.AND).toBeUndefined();
            expect(findManyArgs.where.OR).toBeDefined(); // Only the triage status condition
        });
    });

    describe('4. scopeShipmentWhere and mergeScope Contract', () => {
        test('scopeShipmentWhere returns scoped query for non-platform roles', () => {
            const clientReq = { user: { id: 'c1', role: 'client', organizationId: null } };
            const scoped = scopeShipmentWhere(clientReq, {});
            expect(scoped.OR).toEqual([
                { userId: 'c1' },
                { createdOnBehalfOfUserId: 'c1' }
            ]);
        });

        test('scopeShipmentWhere preserves platform-wide query for staff', () => {
            const staffReq = { user: { id: 's1', role: 'staff' } };
            const query = { status: 'pending' };
            const scoped = scopeShipmentWhere(staffReq, query);
            expect(scoped).toEqual({ status: 'pending' });
        });

        test('mergeScope cleanly merges existing OR clauses into an AND array', () => {
            const existing = { OR: [{ userId: 'user-1' }, { createdOnBehalfOfUserId: 'user-1' }] };
            const addition = { OR: [{ status: 'exception' }, { status: 'failed' }] };
            const merged = mergeScope(existing, addition);

            expect(merged.OR).toBeUndefined();
            expect(merged.AND).toHaveLength(2);
            expect(merged.AND[0]).toEqual({ OR: [{ userId: 'user-1' }, { createdOnBehalfOfUserId: 'user-1' }] });
            expect(merged.AND[1]).toEqual({ OR: [{ status: 'exception' }, { status: 'failed' }] });
        });
    });
});
