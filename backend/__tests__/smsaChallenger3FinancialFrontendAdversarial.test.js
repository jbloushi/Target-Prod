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

// Mock database state
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
        'org-merchant-challenger': {
            id: 'org-merchant-challenger',
            name: 'Adversarial Merchant Co',
            currency: 'SAR',
            balance: 250.000,
            unappliedBalance: 1000.000,
            creditLimit: 10000.000,
            allowedCarriers: ['SMSA', 'DGR', 'INTERNAL']
        }
    };
    mockAccounts = {
        '1100': { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', type: 'ASSET', currency: 'SAR', balance: 0 },
        '4010': { id: 'acc-4010', code: '4010', name: 'Freight Revenue', type: 'REVENUE', currency: 'SAR', balance: 0 },
        '5010': { id: 'acc-5010', code: '5010', name: 'Carrier Direct Expense', type: 'COGS', currency: 'SAR', balance: 0 },
        '2010': { id: 'acc-2010', code: '2010', name: 'Carrier Accounts Payable', type: 'LIABILITY', currency: 'SAR', balance: 0 }
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
            findMany: jest.fn(async ({ where } = {}) => {
                let list = Object.values(mockShipments);
                if (where?.OR) {
                    const orMatches = where.OR.flatMap(cond => {
                        if (cond.trackingNumber?.in) {
                            return list.filter(s => cond.trackingNumber.in.includes(s.trackingNumber));
                        }
                        if (cond.dhlTrackingNumber?.in) {
                            return list.filter(s => cond.dhlTrackingNumber.in.includes(s.dhlTrackingNumber));
                        }
                        if (cond.carrierShipmentId?.in) {
                            return list.filter(s => cond.carrierShipmentId.in.includes(s.carrierShipmentId));
                        }
                        return [];
                    });
                    list = Array.from(new Set(orMatches));
                }
                return list;
            }),
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
                if (org) {
                    if (data.balance?.increment !== undefined) {
                        org.balance = Number((Number(org.balance || 0) + Number(data.balance.increment)).toFixed(3));
                    } else if (data.balance !== undefined) {
                        org.balance = Number(data.balance);
                    }
                    if (data.unappliedBalance?.increment !== undefined) {
                        org.unappliedBalance = Number((Number(org.unappliedBalance || 0) + Number(data.unappliedBalance.increment)).toFixed(3));
                    }
                }
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
                    (!where.category || (typeof where.category === 'object' && where.category.not ? e.category !== where.category.not : e.category === where.category)) &&
                    (where.organizationId === undefined || e.organizationId === where.organizationId)
                ) || null;
            }),
            findMany: jest.fn(async ({ where } = {}) => {
                return mockLedgerEntries.filter(e => {
                    if (where?.sourceRepo && e.sourceRepo !== where.sourceRepo) return false;
                    if (where?.sourceId?.in && !where.sourceId.in.includes(e.sourceId)) return false;
                    if (where?.category && e.category !== where.category) return false;
                    return true;
                });
            }),
            groupBy: jest.fn(async ({ by, where }) => {
                const filtered = mockLedgerEntries.filter(e => {
                    if (where?.organizationId !== undefined && e.organizationId !== where.organizationId) return false;
                    if (where?.currency && e.currency !== where.currency) return false;
                    if (where?.category?.not && e.category === where.category.not) return false;
                    return true;
                });
                const debitSum = filtered.filter(e => e.entryType === 'DEBIT').reduce((acc, e) => acc + Number(e.amount), 0);
                const creditSum = filtered.filter(e => e.entryType === 'CREDIT').reduce((acc, e) => acc + Number(e.amount), 0);
                return [
                    { entryType: 'DEBIT', _sum: { amount: debitSum } },
                    { entryType: 'CREDIT', _sum: { amount: creditSum } }
                ];
            })
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
                if (acc && data.balance) {
                    if (data.balance.increment !== undefined) {
                        acc.balance = Number((Number(acc.balance || 0) + Number(data.balance.increment)).toFixed(3));
                    } else if (data.balance.decrement !== undefined) {
                        acc.balance = Number((Number(acc.balance || 0) - Number(data.balance.decrement)).toFixed(3));
                    }
                }
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
        }),
        $queryRawUnsafe: jest.fn(async () => [])
    };
    return { prisma: mPrisma };
});

const ShipmentBookingService = require('../src/services/ShipmentBookingService');
const financeLedgerService = require('../src/services/financeLedger.service');
const generalLedgerService = require('../src/services/generalLedger.service');
const carrierReconciliationService = require('../src/services/carrierReconciliation.service');
const PricingService = require('../src/services/pricing.service');

const createTestSmsaShipment = (id, trackingNumber, overrides = {}) => {
    const org = mockOrganizations['org-merchant-challenger'];
    const user = {
        id: 'usr-challenger',
        role: 'merchant',
        agentPolicy: { allowedCarriers: ['SMSA', 'DGR'] }
    };
    const costPrice = overrides.costPrice ?? 35.000;
    const markupAmount = overrides.markupAmount ?? 15.000;
    const price = overrides.price !== undefined ? overrides.price : Number((costPrice + markupAmount).toFixed(3));

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
        serviceCode: 'DLV',
        status: 'pending',
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
        declaredValue: 200.0,
        contentDescription: 'Adversarial Electronics',
        pricingSnapshot: snapshot,
        origin: {
            contactName: 'Kuwait Hub Gate 1',
            phone: '+96522001122',
            addressLine1: 'Kuwait Free Trade Zone',
            city: 'Kuwait City',
            countryCode: 'KW'
        },
        destination: {
            contactName: 'Riyadh Consignee',
            phone: '+966501112233',
            addressLine1: 'King Fahd Road Building 5',
            city: 'Riyadh',
            countryCode: 'SA'
        },
        packages: [{ weight: 2.5 }],
        ...overrides
    };
};

describe('Empirical Challenger M3: Adversarial Financial Invariants & Concurrency Suite', () => {
    let mockAxiosClient;

    beforeEach(() => {
        resetMockDb();
        mockAxiosClient = {
            request: jest.fn(async (config) => {
                if (config.url === '/api/shipment/b2c/new') {
                    return {
                        data: {
                            awbNumber: '290088887777',
                            orderNumber: config.data?.OrderNumber || 'ORD-SMSA-CHALLENGE',
                            status: 'Created',
                            waybillType: 'PDF',
                            waybillLabel: 'JVBERi0xLjQK...'
                        }
                    };
                }
                return { data: {} };
            }),
            post: jest.fn(async (url, data, config) => mockAxiosClient.request({ method: 'post', url, data, ...config })),
            get: jest.fn(async (url, config) => mockAxiosClient.request({ method: 'get', url, ...config }))
        };
        axios.create.mockReturnValue(mockAxiosClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Invariant 1: Customer Organization Balance Isolation from Carrier Costs', () => {
        test('booking an SMSA shipment mutates org balance ONLY by customer price, NEVER by carrier cost', async () => {
            const org = mockOrganizations['org-merchant-challenger'];
            const initialBalance = org.balance; // 250.000
            const carrierCost = 42.500;
            const markup = 17.500;
            const customerPrice = 60.000;

            const shipmentId = 'shp-adv-01';
            const tracking = 'SMS-ADV-001';
            mockShipments[shipmentId] = createTestSmsaShipment(shipmentId, tracking, {
                costPrice: carrierCost,
                markupAmount: markup,
                price: customerPrice
            });

            await ShipmentBookingService.bookShipment(tracking, 'SMSA');

            // The merchant organization balance must increment by exactly customerPrice (60.000)
            const expectedBalance = Number((initialBalance + customerPrice).toFixed(3)); // 310.000
            expect(org.balance).toBe(expectedBalance);

            // Carrier payable must exist, but strictly under organizationId: null
            const payable = mockLedgerEntries.find(e => e.category === 'CARRIER_PAYABLE' && e.sourceId === shipmentId);
            expect(payable).toBeDefined();
            expect(payable.organizationId).toBeNull();
            expect(Number(payable.amount)).toBe(carrierCost);

            // Verify getOrganizationBalance reports customer AR, unaffected by carrier payable
            const currentOrgBalance = await financeLedgerService.getOrganizationBalance(org.id, 'SAR');
            expect(currentOrgBalance).toBe(customerPrice);
        });

        test('zero-price promotional shipment with positive carrier cost incurs ZERO mutation to org balance', async () => {
            const org = mockOrganizations['org-merchant-challenger'];
            const initialBalance = org.balance; // 250.000
            const carrierCost = 30.000;
            const customerPrice = 0.000;

            const shipmentId = 'shp-adv-02';
            const tracking = 'SMS-ADV-002';
            const promoSnapshot = PricingService.createSnapshot(
                carrierCost,
                { type: 'FLAT', flatValue: -carrierCost },
                'SAR',
                'promo'
            );

            mockShipments[shipmentId] = createTestSmsaShipment(shipmentId, tracking, {
                costPrice: carrierCost,
                markupAmount: -carrierCost,
                price: customerPrice,
                pricingSnapshot: promoSnapshot
            });

            await ShipmentBookingService.bookShipment(tracking, 'SMSA');

            // Org balance must NOT change at all!
            expect(org.balance).toBe(initialBalance);

            // Carrier liability is recorded for corporate
            const payable = mockLedgerEntries.find(e => e.category === 'CARRIER_PAYABLE' && e.sourceId === shipmentId);
            expect(payable).toBeDefined();
            expect(payable.organizationId).toBeNull();
            expect(Number(payable.amount)).toBe(carrierCost);
        });
    });

    describe('Invariant 2: Strict Corporate Liability Enforcement (organizationId: null)', () => {
        test('CARRIER_PAYABLE entries strictly strip customer organizationId to null in corporate GL and ledger', async () => {
            const tracking = 'SMS-ADV-003';
            const shipmentId = 'shp-adv-03';
            const carrierCost = 55.000;

            mockShipments[shipmentId] = createTestSmsaShipment(shipmentId, tracking, {
                costPrice: carrierCost,
                markupAmount: 25.000,
                price: 80.000
            });

            await ShipmentBookingService.bookShipment(tracking, 'SMSA');

            // Ledger check
            const payable = mockLedgerEntries.find(e => e.category === 'CARRIER_PAYABLE' && e.sourceId === shipmentId);
            expect(payable).toBeDefined();
            expect(payable.organizationId).toBeNull();

            // Journal Entry check: Account 2010 line must have organizationId: null
            const je = mockJournalEntries.find(j => j.sourceType === 'SHIPMENT_BOOKING' && j.sourceId === shipmentId);
            expect(je).toBeDefined();
            const apLine = je.lines.find(l => l.accountId === 'acc-2010');
            expect(apLine).toBeDefined();
            expect(apLine.organizationId).toBeNull();
        });

        test('adversarial direct recordCarrierPayable call passing non-null organizationId does NOT mutate customer org balance', async () => {
            const org = mockOrganizations['org-merchant-challenger'];
            const initialBalance = org.balance;

            // Direct malicious call passing customer organizationId
            await financeLedgerService.recordCarrierPayable({
                organizationId: org.id,
                shipmentId: 'shp-adv-malicious',
                carrierCode: 'SMSA',
                costPrice: 99.999,
                currency: 'SAR',
                trackingNumber: 'SMS-MALICIOUS-01',
                createdBy: 'usr-attacker'
            });

            // Customer org balance must NOT be mutated
            expect(org.balance).toBe(initialBalance);

            // getOrganizationBalance must ignore CARRIER_PAYABLE
            const balance = await financeLedgerService.getOrganizationBalance(org.id, 'SAR');
            expect(balance).toBe(0);
        });
    });

    describe('Invariant 3: Strict Double-Entry GL Balancing: SUM(BaseDebit) === SUM(BaseCredit)', () => {
        test('verifies SUM(BaseDebit) === SUM(BaseCredit) across standard, fractional, and zero-price scenarios', async () => {
            const testScenarios = [
                { name: 'Standard Pricing', price: 75.000, cost: 45.000 },
                { name: 'High Decimal Precision', price: 17.333, cost: 11.667 },
                { name: 'Zero Customer Price (Free Replacement)', price: 0.000, cost: 25.500 },
                { name: 'Zero Carrier Wholesale Cost', price: 40.000, cost: 0.000 }
            ];

            for (let i = 0; i < testScenarios.length; i++) {
                const s = testScenarios[i];
                const tracking = `SMS-GL-BAL-${i + 1}`;
                const shipmentId = `shp-gl-${i + 1}`;

                const je = await generalLedgerService.postShipmentBookingEntry({
                    shipmentId,
                    trackingNumber: tracking,
                    organizationId: 'org-merchant-challenger',
                    customerPrice: s.price,
                    carrierCost: s.cost,
                    carrierCode: 'SMSA',
                    currency: 'SAR',
                    createdById: 'usr-challenger'
                });

                if (s.price === 0 && s.cost === 0) {
                    expect(je).toBeNull();
                    continue;
                }

                expect(je).toBeDefined();
                const lines = je.lines;
                const sumDebits = lines.reduce((acc, l) => acc + Number(l.baseDebit || l.debit || 0), 0);
                const sumCredits = lines.reduce((acc, l) => acc + Number(l.baseCredit || l.credit || 0), 0);

                const difference = Math.abs(sumDebits - sumCredits);
                expect(difference).toBeLessThanOrEqual(0.001);

                // Corporate liability lines for 2010 must always have null organizationId
                const apLines = lines.filter(l => l.accountCode === '2010');
                apLines.forEach(l => {
                    expect(l.organizationId).toBeNull();
                });
            }
        });
    });

    describe('Invariant 4: Concurrency & Duplicate Booking Idempotency Safeguards', () => {
        test('consecutive duplicate booking calls return alreadyBooked without duplicate charges or invoices', async () => {
            const org = mockOrganizations['org-merchant-challenger'];
            const initialBalance = org.balance;
            const tracking = 'SMS-IDEMP-001';
            const shipmentId = 'shp-idemp-001';
            const price = 50.000;
            const cost = 30.000;

            mockShipments[shipmentId] = createTestSmsaShipment(shipmentId, tracking, {
                price,
                costPrice: cost,
                markupAmount: 20.000
            });

            // 1st Booking Call
            const firstResult = await ShipmentBookingService.bookShipment(tracking, 'SMSA');
            expect(firstResult.outcome).toBe('booked');
            expect(firstResult.alreadyBooked).toBeFalsy();
            expect(org.balance).toBe(initialBalance + price);

            const initialLedgerCount = mockLedgerEntries.length;
            const initialInvoiceCount = mockInvoices.length;
            const initialJeCount = mockJournalEntries.length;

            // 2nd Booking Call on the same shipment (Duplicate Request)
            const secondResult = await ShipmentBookingService.bookShipment(tracking, 'SMSA');
            expect(secondResult.outcome).toBe('booked');
            expect(secondResult.message).toBe('Shipment already booked.');

            // Assert NO duplicate ledger charges, NO duplicate carrier payables, NO duplicate invoices, NO duplicate GL entries
            expect(mockLedgerEntries.length).toBe(initialLedgerCount);
            expect(mockInvoices.length).toBe(initialInvoiceCount);
            expect(mockJournalEntries.length).toBe(initialJeCount);
            expect(org.balance).toBe(initialBalance + price); // Unchanged!
        });

        test('idempotency in createLedgerEntry and recordCarrierPayable blocks duplicate posting for identical sourceId', async () => {
            const shipmentId = 'shp-dup-entry-01';

            // First payable
            const entry1 = await financeLedgerService.recordCarrierPayable({
                organizationId: null,
                shipmentId,
                carrierCode: 'SMSA',
                costPrice: 20.000,
                currency: 'SAR',
                trackingNumber: 'SMS-DUP-01',
                createdBy: 'usr-1'
            });

            // Duplicate payable call
            const entry2 = await financeLedgerService.recordCarrierPayable({
                organizationId: null,
                shipmentId,
                carrierCode: 'SMSA',
                costPrice: 20.000,
                currency: 'SAR',
                trackingNumber: 'SMS-DUP-01',
                createdBy: 'usr-1'
            });

            // Must return the exact same entry without appending another record
            expect(entry1.id).toBe(entry2.id);
            const payables = mockLedgerEntries.filter(e => e.sourceId === shipmentId && e.category === 'CARRIER_PAYABLE');
            expect(payables.length).toBe(1);
        });

        test('idempotency in generalLedger.service postJournalEntry blocks duplicate postings for identical (sourceType, sourceId)', async () => {
            const shipmentId = 'shp-dup-gl-01';

            const je1 = await generalLedgerService.postShipmentBookingEntry({
                shipmentId,
                trackingNumber: 'SMS-DUP-GL-01',
                organizationId: 'org-merchant-challenger',
                customerPrice: 60.000,
                carrierCost: 35.000,
                carrierCode: 'SMSA',
                currency: 'SAR',
                createdById: 'usr-1'
            });

            const je2 = await generalLedgerService.postShipmentBookingEntry({
                shipmentId,
                trackingNumber: 'SMS-DUP-GL-01',
                organizationId: 'org-merchant-challenger',
                customerPrice: 60.000,
                carrierCost: 35.000,
                carrierCode: 'SMSA',
                currency: 'SAR',
                createdById: 'usr-1'
            });

            expect(je1.id).toBe(je2.id);
            const matchingJes = mockJournalEntries.filter(j => j.sourceId === shipmentId && j.sourceType === 'SHIPMENT_BOOKING');
            expect(matchingJes.length).toBe(1);
        });
    });

    describe('Invariant 5: Carrier Invoice Reconciliation Adjustments Isolation', () => {
        test('carrier reconciliation cost discrepancy adjustments adjust CARRIER_PAYABLE with organizationId: null and NEVER touch merchant org balance', async () => {
            const org = mockOrganizations['org-merchant-challenger'];
            const initialBalance = org.balance;
            const shipmentId = 'shp-recon-01';
            const tracking = 'SMS-RECON-001';

            mockShipments[shipmentId] = createTestSmsaShipment(shipmentId, tracking, {
                costPrice: 25.000,
                markupAmount: 25.000,
                price: 50.000
            });

            // Surcharge discrepancy: carrier billed 35.000 SAR instead of 25.000 SAR (delta +10.000 SAR)
            const adjustments = [
                {
                    shipmentId,
                    organizationId: org.id,
                    deltaAmount: 10.000,
                    currency: 'SAR',
                    reason: 'SMSA volumetric weight adjustment discrepancy'
                }
            ];

            const result = await carrierReconciliationService.postAdjustments(adjustments, 'usr-admin-finance');
            expect(result.success).toBe(true);
            expect(result.count).toBe(1);

            // CRITICAL CHECK: Customer organization balance must NOT be mutated!
            expect(org.balance).toBe(initialBalance);

            // Adjustment entry in organizationLedger must be CARRIER_PAYABLE with organizationId: null
            const adjEntry = mockLedgerEntries.find(e => e.sourceId === shipmentId);
            expect(adjEntry).toBeDefined();
            expect(adjEntry.category).toBe('CARRIER_PAYABLE');
            expect(adjEntry.organizationId).toBeNull();
            expect(Number(adjEntry.amount)).toBe(10.000);

            // Shipment costPrice and markupAmount updated
            expect(mockShipments[shipmentId].costPrice).toBe(35.000);
            expect(mockShipments[shipmentId].markupAmount).toBe(15.000); // 50 - 35 = 15
        });
    });
});
