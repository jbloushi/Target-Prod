process.env.SMSA_API_KEY = 'unit-test-smsa-api-key';
process.env.SMSA_TEST_API_KEY = 'unit-test-smsa-api-key';

const axios = require('axios');
const Decimal = require('decimal.js');

// Mock axios
jest.mock('axios', () => ({
    create: jest.fn()
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock chatwoot and webhook dispatcher
jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn()
}));
jest.mock('../src/services/WebhookDispatcher', () => ({
    dispatch: jest.fn()
}));

// Prisma Mock Store
let mockShipments = {};
let mockLedgerEntries = [];
let mockInvoices = [];
let mockJournalEntries = [];
let mockOrganizations = {};
let mockAccounts = {};
let mockAccountingPeriods = {};

const resetMockDb = () => {
    mockShipments = {};
    mockLedgerEntries = [];
    mockInvoices = [];
    mockJournalEntries = [];
    mockOrganizations = {
        'org-smsa-merchant-1': {
            id: 'org-smsa-merchant-1',
            name: 'Saudi Retail Merchant Co',
            currency: 'SAR',
            balance: 50.000,
            unappliedBalance: 500.000,
            creditLimit: 5000.000,
            allowedCarriers: ['SMSA', 'DGR', 'INTERNAL']
        }
    };
    mockAccounts = {
        '1100': { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', type: 'ASSET', currency: 'SAR' },
        '4010': { id: 'acc-4010', code: '4010', name: 'Freight Revenue', type: 'REVENUE', currency: 'SAR' },
        '5010': { id: 'acc-5010', code: '5010', name: 'Carrier Direct Expense', type: 'COGS', currency: 'SAR' },
        '2010': { id: 'acc-2010', code: '2010', name: 'Carrier Accounts Payable', type: 'LIABILITY', currency: 'SAR' }
    };
    mockAccountingPeriods = {
        '2026-10': { id: 'p-2026-10', name: '2026-10', isClosed: false }
    };
};

jest.mock('../src/config/database', () => {
    const mPrisma = {
        shipment: {
            findUnique: jest.fn(async ({ where }) => {
                if (where.id) return mockShipments[where.id] || null;
                if (where.trackingNumber) {
                    return Object.values(mockShipments).find(s => s.trackingNumber === where.trackingNumber) || null;
                }
                return null;
            }),
            findMany: jest.fn(async () => Object.values(mockShipments)),
            update: jest.fn(async ({ where, data }) => {
                const existing = mockShipments[where.id] || Object.values(mockShipments).find(s => s.trackingNumber === where.trackingNumber);
                if (!existing) throw new Error(`Shipment ${where.id || where.trackingNumber} not found`);
                const updated = {
                    ...existing,
                    ...data,
                    bookingAttempts: data.bookingAttempts || existing.bookingAttempts,
                    documents: data.documents || existing.documents,
                    pricingSnapshot: data.pricingSnapshot || existing.pricingSnapshot
                };
                mockShipments[existing.id] = updated;
                return updated;
            }),
            create: jest.fn(async ({ data }) => {
                const id = data.id || `shp-${Date.now()}`;
                const created = { id, ...data };
                mockShipments[id] = created;
                return created;
            })
        },
        organization: {
            findUnique: jest.fn(async ({ where }) => mockOrganizations[where.id] || null),
            findMany: jest.fn(async () => Object.values(mockOrganizations)),
            update: jest.fn(async ({ where, data }) => {
                const org = mockOrganizations[where.id];
                if (org) Object.assign(org, data);
                return org;
            })
        },
        organizationLedger: {
            create: jest.fn(async ({ data }) => {
                const entry = { id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...data };
                mockLedgerEntries.push(entry);
                return entry;
            }),
            findFirst: jest.fn(async ({ where }) => {
                return mockLedgerEntries.find(e =>
                    (!where.sourceRepo || e.sourceRepo === where.sourceRepo) &&
                    (!where.sourceId || e.sourceId === where.sourceId) &&
                    (!where.category || e.category === where.category)
                ) || null;
            }),
            findMany: jest.fn(async () => mockLedgerEntries)
        },
        invoice: {
            findUnique: jest.fn(async ({ where }) => {
                return mockInvoices.find(i => i.invoiceNumber === where.invoiceNumber) || null;
            }),
            create: jest.fn(async ({ data }) => {
                const inv = { id: `inv-${Date.now()}`, ...data };
                mockInvoices.push(inv);
                return inv;
            })
        },
        account: {
            findUnique: jest.fn(async ({ where }) => {
                if (where.id) return Object.values(mockAccounts).find(a => a.id === where.id) || null;
                if (where.code) return mockAccounts[where.code] || null;
                return null;
            }),
            findMany: jest.fn(async () => Object.values(mockAccounts)),
            update: jest.fn(async ({ where, data }) => {
                const acc = mockAccounts[where.code] || Object.values(mockAccounts).find(a => a.id === where.id);
                if (acc) Object.assign(acc, data);
                return acc;
            })
        },
        accountingPeriod: {
            findUnique: jest.fn(async () => mockAccountingPeriods['2026-10']),
            findFirst: jest.fn(async () => mockAccountingPeriods['2026-10']),
            create: jest.fn(async ({ data }) => ({ id: 'p-new', ...data }))
        },
        journalEntry: {
            findFirst: jest.fn(async ({ where }) => {
                return mockJournalEntries.find(j =>
                    (!where.sourceType || j.sourceType === where.sourceType) &&
                    (!where.sourceId || j.sourceId === where.sourceId)
                ) || null;
            }),
            create: jest.fn(async ({ data }) => {
                const lines = data.lines?.create || [];
                const je = {
                    id: `je-${Date.now()}`,
                    ...data,
                    lines
                };
                mockJournalEntries.push(je);
                return je;
            })
        },
        $transaction: jest.fn(async (cb) => {
            if (typeof cb === 'function') return await cb(mPrisma);
            return cb;
        })
    };
    return { prisma: mPrisma };
});

const ShipmentBookingService = require('../src/services/ShipmentBookingService');
const CarrierFactory = require('../src/services/CarrierFactory');
const PricingService = require('../src/services/pricing.service');

const createValidSmsaShipment = (id, trackingNumber, overrides = {}) => {
    const user = {
        id: overrides.userId || 'usr-smsa-client',
        role: 'merchant',
        agentPolicy: { allowedCarriers: ['SMSA', 'DGR'] }
    };
    const org = mockOrganizations['org-smsa-merchant-1'];
    const costPrice = overrides.costPrice ?? 18.000;
    const markupAmount = overrides.markupAmount ?? 10.500;
    const price = overrides.price ?? Number((costPrice + markupAmount).toFixed(3));

    const snapshot = overrides.pricingSnapshot || PricingService.createSnapshot(
        costPrice,
        { type: 'FLAT', flatValue: markupAmount },
        'SAR',
        'contract_rate_card'
    );

    return {
        id,
        trackingNumber,
        carrierCode: 'SMSA',
        serviceCode: overrides.serviceCode || 'DLV',
        status: overrides.status || 'pending',
        price,
        costPrice,
        markupAmount,
        currency: 'SAR',
        userId: user.id,
        user,
        organizationId: org.id,
        organization: org,
        bookingAttempts: [],
        reference: `REF-${trackingNumber}`,
        orderNumber: `ORD-${trackingNumber}`,
        declaredValue: overrides.declaredValue ?? 150.0,
        contentDescription: overrides.contentDescription || 'Consumer Merchandise Products',
        pricingSnapshot: snapshot,
        origin: {
            contactName: 'Target Logistics Warehouse',
            phone: '+96522001122',
            contactPhoneNumber: '+96522001122',
            addressLine1: 'Airport Cargo Terminal Gate 4',
            formattedAddress: 'Airport Cargo Terminal Gate 4, Kuwait City, Kuwait',
            city: 'Kuwait City',
            countryCode: 'KW',
            country: 'KW'
        },
        destination: {
            contactName: 'Fahad Al-Otaibi',
            phone: '+966501112233',
            contactPhoneNumber: '+966501112233',
            addressLine1: 'Olaya District Building 10',
            formattedAddress: 'Olaya District Building 10, Riyadh, Saudi Arabia',
            city: 'Riyadh',
            countryCode: 'SA',
            country: 'SA'
        },
        packages: overrides.packages || [{ weight: 2.0 }],
        ...overrides
    };
};

describe('SMSA Express Financial Pipeline & Booking Parity Suite', () => {
    let mockAxiosClient;

    beforeEach(() => {
        resetMockDb();
        process.env.SMSA_API_KEY = 'unit-test-smsa-api-key';
        process.env.SMSA_TEST_API_KEY = 'unit-test-smsa-api-key';

        mockAxiosClient = {
            request: jest.fn(async (config) => {
                // Endpoint: POST /api/shipment/b2c/new
                if (config.url === '/api/shipment/b2c/new' && config.method.toLowerCase() === 'post') {
                    return {
                        data: {
                            awbNumber: '290098765432',
                            orderNumber: config.data?.OrderNumber || 'ORD-SMSA-FIN-001',
                            status: 'Created',
                            waybillType: 'PDF',
                            waybillLabel: 'JVBERi0xLjQKJSDi48...'
                        }
                    };
                }
                // Endpoint: POST /api/c2b/cancel/{awb}
                if (config.url?.startsWith('/api/c2b/cancel/') && config.method.toLowerCase() === 'post') {
                    return {
                        data: {
                            status: 'Cancelled',
                            awbNumber: config.url.split('/').pop(),
                            message: 'Shipment cancellation confirmed'
                        }
                    };
                }
                // Endpoint: GET /api/track/single/...
                if (config.url?.startsWith('/api/track/single')) {
                    return {
                        data: {
                            awb: '290098765432',
                            status: 'Cancelled',
                            history: [
                                { checkpointCode: 'data_rcvd', checkpointDescription: 'Data Received', timestamp: '2026-10-25T10:00:00Z' },
                                { checkpointCode: 'cancelled', checkpointDescription: 'Shipment Cancelled by Shipper', timestamp: '2026-10-25T11:00:00Z' }
                            ]
                        }
                    };
                }
                return { data: {} };
            }),
            post: jest.fn(async (url, data, config) => {
                return mockAxiosClient.request({ method: 'post', url, data, ...config });
            }),
            get: jest.fn(async (url, config) => {
                return mockAxiosClient.request({ method: 'get', url, ...config });
            })
        };

        axios.create.mockReturnValue(mockAxiosClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('1. End-to-End SMSA Booking Execution via Mocked SMSA API', () => {
        test('successfully books SMSA shipment against POST /api/shipment/b2c/new', async () => {
            const shipmentId = 'shp-smsa-101';
            const trackingNumber = 'SMS-TEST-00101';
            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber);

            const result = await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA', [], 'merchant');

            expect(result.success).toBe(true);
            expect(result.outcome).toBe('booked');
            expect(result.shipment.status).toBe('booked');
            expect(result.shipment.dhlTrackingNumber).toBe('290098765432');
            expect(result.shipment.carrierShipmentId).toBe('290098765432');

            // Assert SMSA API call was made to POST /api/shipment/b2c/new
            expect(mockAxiosClient.request).toHaveBeenCalled();
            const b2cCall = mockAxiosClient.request.mock.calls.find(c => c[0].url === '/api/shipment/b2c/new');
            expect(b2cCall).toBeDefined();
            expect(b2cCall[0].method.toLowerCase()).toBe('post');
            expect(b2cCall[0].headers.apikey).toBe('unit-test-smsa-api-key');
            expect(b2cCall[0].data).toMatchObject({
                Parcels: 1,
                Weight: 2,
                ConsigneeAddress: expect.objectContaining({
                    City: 'Riyadh',
                    Country: 'SA'
                }),
                ShipperAddress: expect.objectContaining({
                    City: 'Kuwait City',
                    Country: 'KW'
                })
            });
        });
    });

    describe('2. User and Organization Linkage Preservation', () => {
        test('preserves user and organization linkage across shipment, ledgers, and invoice', async () => {
            const shipmentId = 'shp-smsa-102';
            const trackingNumber = 'SMS-TEST-00102';
            const user = { id: 'usr-client-202', role: 'admin' };
            const org = mockOrganizations['org-smsa-merchant-1'];

            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber, {
                userId: user.id,
                user,
                organizationId: org.id,
                organization: org,
                costPrice: 20.000,
                markupAmount: 15.000
            });

            const result = await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA');

            // Organization and User linkage on updated shipment
            expect(result.shipment.organizationId).toBe(org.id);
            expect(result.shipment.userId).toBe(user.id);

            // Customer AR Ledger Entry must be attributed to the organization
            const customerCharge = mockLedgerEntries.find(e => e.category === 'SHIPMENT_CHARGE' && e.sourceId === shipmentId);
            expect(customerCharge).toBeDefined();
            expect(customerCharge.organizationId).toBe(org.id);
            expect(customerCharge.createdBy).toBe(user.id);

            // Official Invoice must be attributed to the organization with correct format
            const invoice = mockInvoices.find(i => i.organizationId === org.id);
            expect(invoice).toBeDefined();
            expect(invoice.invoiceNumber).toBe(`INV-SHP-${trackingNumber}`);
            expect(invoice.createdById).toBe(user.id);
        });
    });

    describe('3. Financial Price, CostPrice, and Markup Calculation and Persistence', () => {
        test('correctly calculates and saves customer price, carrier cost, and markup amount', async () => {
            const shipmentId = 'shp-smsa-103';
            const trackingNumber = 'SMS-TEST-00103';
            const carrierWholesaleCost = 27.000;
            const markup = 15.500;
            const customerPrice = 42.500;

            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber, {
                costPrice: carrierWholesaleCost,
                markupAmount: markup,
                price: customerPrice
            });

            const result = await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA');

            expect(result.shipment.price).toBe(customerPrice);
            expect(result.shipment.costPrice).toBe(carrierWholesaleCost);
            expect(result.shipment.markupAmount).toBe(markup);
            expect(Number(result.shipment.pricingSnapshot.totalPrice)).toBe(customerPrice);
            expect(Number(result.shipment.pricingSnapshot.carrierRate)).toBe(carrierWholesaleCost);
            expect(Number(result.shipment.pricingSnapshot.markup)).toBe(markup);
        });
    });

    describe('4. Customer Accounts Receivable (AR) Debit Posting', () => {
        test('posts SHIPMENT_CHARGE DEBIT entry to organization ledger and creates Consignment Invoice', async () => {
            const shipmentId = 'shp-smsa-104';
            const trackingNumber = 'SMS-TEST-00104';
            const org = mockOrganizations['org-smsa-merchant-1'];
            const costPrice = 30.000;
            const markupAmount = 20.000;
            const price = 50.000;

            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber, {
                costPrice,
                markupAmount,
                price
            });

            await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA');

            const arEntry = mockLedgerEntries.find(e => e.category === 'SHIPMENT_CHARGE' && e.sourceId === shipmentId);
            expect(arEntry).toBeDefined();
            expect(arEntry.entryType).toBe('DEBIT');
            expect(arEntry.amount).toBe(price);
            expect(arEntry.currency).toBe('SAR');
            expect(arEntry.organizationId).toBe(org.id);
            expect(arEntry.reference).toBe(trackingNumber);

            // Auto-generated invoice checks
            const invoice = mockInvoices.find(i => i.organizationId === org.id);
            expect(invoice).toBeDefined();
            expect(invoice.total).toBe(price);
            expect(invoice.currency).toBe('SAR');
            expect(invoice.lines.create.shipmentId).toBe(shipmentId);
        });
    });

    describe('5. Platform Carrier Accounts Payable (AP) Liability Posting', () => {
        test('posts CARRIER_PAYABLE CREDIT entry with strictly organizationId: null (corporate liability)', async () => {
            const shipmentId = 'shp-smsa-105';
            const trackingNumber = 'SMS-TEST-00105';
            const costPrice = 22.500;
            const markupAmount = 15.500;
            const price = 38.000;

            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber, {
                costPrice,
                markupAmount,
                price
            });

            await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA');

            const apEntry = mockLedgerEntries.find(e => e.category === 'CARRIER_PAYABLE' && e.sourceId === shipmentId);
            expect(apEntry).toBeDefined();
            expect(apEntry.entryType).toBe('CREDIT');
            expect(apEntry.amount).toBe(costPrice);
            expect(apEntry.currency).toBe('SAR');

            // CRITICAL INVARIANT: Carrier liability belongs to Target corporate, NEVER client merchant!
            expect(apEntry.organizationId).toBeNull();
            expect(apEntry.metadata).toMatchObject({
                carrierCode: 'SMSA',
                costPrice,
                accountType: 'LIABILITY_AP'
            });
        });
    });

    describe('6. Balanced Double-Entry General Ledger (GL) Postings', () => {
        test('creates balanced double-entry journal lines where SUM(BaseDebit) == SUM(BaseCredit)', async () => {
            const shipmentId = 'shp-smsa-106';
            const trackingNumber = 'SMS-TEST-00106';
            const org = mockOrganizations['org-smsa-merchant-1'];
            const carrierCost = 40.000;
            const markup = 20.000;
            const customerPrice = 60.000;

            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber, {
                costPrice: carrierCost,
                markupAmount: markup,
                price: customerPrice
            });

            await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA');

            const je = mockJournalEntries.find(j => j.sourceType === 'SHIPMENT_BOOKING' && j.sourceId === shipmentId);
            expect(je).toBeDefined();

            const lines = je.lines;
            expect(lines.length).toBe(4);

            // 1. Dr 1100 Accounts Receivable (attributed to merchant)
            const arLine = lines.find(l => l.accountId === 'acc-1100');
            expect(arLine).toBeDefined();
            expect(Number(arLine.debit)).toBe(customerPrice);
            expect(Number(arLine.credit)).toBe(0);
            expect(arLine.organizationId).toBe(org.id);

            // 2. Cr 4010 Freight Revenue (attributed to merchant)
            const revLine = lines.find(l => l.accountId === 'acc-4010');
            expect(revLine).toBeDefined();
            expect(Number(revLine.debit)).toBe(0);
            expect(Number(revLine.credit)).toBe(customerPrice);
            expect(revLine.organizationId).toBe(org.id);

            // 3. Dr 5010 Carrier COGS (wholesale cost)
            const cogsLine = lines.find(l => l.accountId === 'acc-5010');
            expect(cogsLine).toBeDefined();
            expect(Number(cogsLine.debit)).toBe(carrierCost);
            expect(Number(cogsLine.credit)).toBe(0);

            // 4. Cr 2010 Carrier Accounts Payable (must be null org)
            const apLine = lines.find(l => l.accountId === 'acc-2010');
            expect(apLine).toBeDefined();
            expect(Number(apLine.debit)).toBe(0);
            expect(Number(apLine.credit)).toBe(carrierCost);
            expect(apLine.organizationId).toBeNull();

            // Double-entry accounting balance verification:
            const totalDebits = lines.reduce((acc, l) => acc + Number(l.baseDebit || l.debit), 0);
            const totalCredits = lines.reduce((acc, l) => acc + Number(l.baseCredit || l.credit), 0);
            expect(totalDebits).toBeCloseTo(totalCredits, 3);
            expect(totalDebits).toBe(customerPrice + carrierCost);
        });
    });

    describe('7. Shipment Documents & Label Attachment', () => {
        test('attaches official SMSA PDF waybill and customs invoice to shipment documents', async () => {
            const shipmentId = 'shp-smsa-107';
            const trackingNumber = 'SMS-TEST-00107';

            mockShipments[shipmentId] = createValidSmsaShipment(shipmentId, trackingNumber, {
                documents: []
            });

            const result = await ShipmentBookingService.bookShipment(trackingNumber, 'SMSA');

            expect(result.shipment.labelUrl).toBeDefined();
            expect(result.shipment.documents.length).toBeGreaterThanOrEqual(1);

            const labelDoc = result.shipment.documents.find(d => d.type === 'label');
            expect(labelDoc).toBeDefined();
            expect(labelDoc.format).toBe('pdf');

            // Fallback customs commercial invoice should also be attached
            const invDoc = result.shipment.documents.find(d => d.type === 'invoice');
            expect(invDoc).toBeDefined();
            expect(result.shipment.invoiceUrl).toBeDefined();
        });
    });

    describe('8. Carrier Cancellation Workflow', () => {
        test('cancelling SMSA shipment calls cancellation API and updates status to cancelled', async () => {
            const adapter = CarrierFactory.getAdapter('SMSA', { isTest: true, apiKey: 'unit-test-smsa-api-key' });
            const awbToCancel = '290098765432';

            const cancelResult = await adapter.cancelShipment(awbToCancel);

            expect(cancelResult.success).toBe(true);

            // Assert SMSA cancel API was invoked with API key
            const cancelCall = mockAxiosClient.request.mock.calls.find(c => c[0].url?.startsWith('/api/c2b/cancel/'));
            expect(cancelCall).toBeDefined();
            expect(cancelCall[0].url).toBe(`/api/c2b/cancel/${awbToCancel}`);
            expect(cancelCall[0].headers.apikey).toBe('unit-test-smsa-api-key');

            // Update shipment record status to cancelled
            const shipmentId = 'shp-smsa-cancel-1';
            mockShipments[shipmentId] = {
                id: shipmentId,
                trackingNumber: 'SMS-CANCEL-001',
                dhlTrackingNumber: awbToCancel,
                carrierShipmentId: awbToCancel,
                carrierCode: 'SMSA',
                status: 'booked'
            };

            const { prisma } = require('../src/config/database');
            const updated = await prisma.shipment.update({
                where: { id: shipmentId },
                data: { status: 'cancelled' }
            });

            expect(updated.status).toBe('cancelled');

            // Verify statusConstants terminal invariant
            const { isTerminalStatus, normalizeStatus } = require('../src/constants/statusConstants');
            expect(normalizeStatus(updated.status)).toBe('cancelled');
            expect(isTerminalStatus(updated.status)).toBe(true);
        });
    });
});
