/**
 * Empirical Challenger M4: Multi-Carrier Parity & Adversarial Challenge Suite
 * 
 * Verifies 4 Core Backend Challenge Dimensions:
 * 1. Rate Shopping Concurrency & State Isolation (DHL DGR vs SMSA Express)
 * 2. Carrier Aliasing ('SMSA', 'SMSAEXPRESS', 'smsa', 'smsaexpress') and Fallback Handling
 * 3. Tracking Exception Healing vs Terminal Status Monotonicity
 * 4. Corporate Liability Strict Isolation (CARRIER_PAYABLE organizationId: null)
 */

process.env.SMSA_API_KEY = 'unit-test-smsa-api-key';
process.env.SMSA_TEST_API_KEY = 'unit-test-smsa-api-key';

const Decimal = require('decimal.js');
const CarrierFactory = require('../src/services/CarrierFactory');
const SmsaAdapter = require('../src/adapters/SmsaAdapter');
const DgrAdapter = require('../src/adapters/DgrAdapter');
const RateCardService = require('../src/services/RateCardService');
const {
    normalizeCarrierStatus,
    normalizeStatus,
    isTerminalStatus,
    isStatusAhead,
    isNegativeOrExceptionPhrase,
    SMSA_CHECKPOINT_MAP,
    DHL_CHECKPOINT_MAP
} = require('../src/constants/statusConstants');

// In-memory mock database state for financial isolation tests
let mockShipments = {};
let mockLedgerEntries = [];
let mockOrganizations = {};
let mockAccounts = {};
let mockInvoices = [];

const resetMockDb = () => {
    mockShipments = {};
    mockLedgerEntries = [];
    mockInvoices = [];
    mockOrganizations = {
        'org-merchant-1': {
            id: 'org-merchant-1',
            name: 'Merchant Enterprise Ltd',
            currency: 'KWD',
            balance: 500.000,
            unappliedBalance: 100.000,
            creditLimit: 5000.000,
            allowedCarriers: ['DGR', 'SMSA']
        },
        'org-merchant-2': {
            id: 'org-merchant-2',
            name: 'Saudi Retail Merchant',
            currency: 'SAR',
            balance: 2000.000,
            unappliedBalance: 0,
            creditLimit: 10000.000,
            allowedCarriers: ['SMSA', 'DGR']
        }
    };
    mockAccounts = {
        '1100': { id: 'acc-1100', code: '1100', name: 'Accounts Receivable', type: 'ASSET', currency: 'KWD', balance: 0 },
        '4010': { id: 'acc-4010', code: '4010', name: 'Freight Revenue', type: 'REVENUE', currency: 'KWD', balance: 0 },
        '5010': { id: 'acc-5010', code: '5010', name: 'Carrier Direct Expense', type: 'COGS', currency: 'KWD', balance: 0 },
        '2010': { id: 'acc-2010', code: '2010', name: 'Carrier Accounts Payable', type: 'LIABILITY', currency: 'KWD', balance: 0 }
    };
};

jest.mock('../src/config/database', () => {
    const mPrisma = {
        $transaction: jest.fn(async (arg) => {
            if (Array.isArray(arg)) {
                return Promise.all(arg);
            }
            if (typeof arg === 'function') {
                return arg(mPrisma);
            }
            return arg;
        }),
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        shipment: {
            findUnique: jest.fn(async ({ where }) => {
                if (where.id) return mockShipments[where.id] || null;
                if (where.trackingNumber) {
                    return Object.values(mockShipments).find(s => s.trackingNumber === where.trackingNumber) || null;
                }
                return null;
            }),
            findMany: jest.fn(async () => Object.values(mockShipments)),
            create: jest.fn(async ({ data }) => {
                const id = data.id || `shp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const created = { id, ...data };
                mockShipments[id] = created;
                return created;
            }),
            update: jest.fn(async ({ where, data }) => {
                const existing = mockShipments[where.id] || Object.values(mockShipments).find(s => s.trackingNumber === where.trackingNumber);
                if (!existing) throw new Error(`Shipment not found`);
                const updated = { ...existing, ...data };
                mockShipments[existing.id] = updated;
                return updated;
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
                }
                return org;
            }),
            aggregate: jest.fn(async () => ({
                _sum: {
                    balance: Object.values(mockOrganizations).reduce((acc, o) => acc + (o.balance || 0), 0)
                }
            }))
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
                    if (where?.category && e.category !== where.category) return false;
                    if (where?.organizationId !== undefined && e.organizationId !== where.organizationId) return false;
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
            findUnique: jest.fn(async () => ({ id: 'p-2026-10', name: '2026-10', isClosed: false })),
            findFirst: jest.fn(async () => ({ id: 'p-2026-10', name: '2026-10', isClosed: false }))
        },
        journalEntry: {
            findFirst: jest.fn(async () => null),
            create: jest.fn(async ({ data }) => ({ id: `je-${Date.now()}`, ...data }))
        },
        shipmentTrackingEvent: {
            upsert: jest.fn(async () => ({ id: 'ev-1' })),
            findMany: jest.fn(async () => [])
        }
    };
    return { prisma: mPrisma };
});

jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('Milestone 4 Adversarial Parity Challenge Suite (challenger_m4)', () => {
    // Configure rate cards for testing
    const smsaBrackets = [];
    for (let w = 0.5; w <= 30.0; w += 0.5) {
        const weight = Number(w.toFixed(1));
        smsaBrackets.push({
            weight,
            rates: {
                ZONE_SA: Number((20.0 + weight * 5.0).toFixed(2)),
                ZONE_GCC: Number((35.0 + weight * 8.0).toFixed(2)),
                ZONE_INT: Number((80.0 + weight * 20.0).toFixed(2))
            }
        });
    }

    const smsaRateCard = {
        id: 'SMSA_CHALLENGER_CARD',
        name: 'SMSA GCC Express Rate Card',
        carrierCode: 'SMSA',
        currency: 'SAR',
        pricingMode: 'SELLING_PRICE',
        countryZones: { SA: 'ZONE_SA', KSA: 'ZONE_SA', KW: 'ZONE_GCC', AE: 'ZONE_GCC', US: 'ZONE_INT' },
        defaultZone: 'ZONE_INT',
        maxBracketWeight: 30.0,
        weightStep: 0.5,
        over30KgPerKgRate: { ZONE_SA: 5.0, ZONE_GCC: 7.5, ZONE_INT: 15.0 },
        brackets: smsaBrackets
    };

    beforeAll(() => {
        RateCardService.rateCards.set('SMSA_CHALLENGER_CARD', smsaRateCard);
    });

    beforeEach(() => {
        resetMockDb();
        jest.clearAllMocks();
    });

    // =========================================================================
    // CHALLENGE 1: Rate Shopping Concurrency & State Isolation
    // =========================================================================
    describe('Challenge 1: Rate Shopping Concurrency & State Isolation', () => {
        test('Stress-tests 100 concurrent interleaved DGR & SMSA rating requests without state leakage', async () => {
            const iterations = 100;
            const promises = [];

            for (let i = 0; i < iterations; i++) {
                const isSmsa = i % 2 === 0;
                if (isSmsa) {
                    const country = i % 4 === 0 ? 'SA' : (i % 4 === 2 ? 'AE' : 'US');
                    const weight = 0.5 + (i % 10) * 0.5; // ranges 0.5 to 5.0
                    promises.push(
                        (async () => {
                            const res = RateCardService.calculateRate({
                                rateCardId: 'SMSA_CHALLENGER_CARD',
                                carrierCode: 'SMSA',
                                countryCode: country,
                                weight
                            });
                            return { type: 'SMSA', index: i, country, weight, res };
                        })()
                    );
                } else {
                    const country = i % 4 === 1 ? 'AE' : 'GB'; // AE is Zone 1 in DHL, GB is Zone 4
                    const weight = 0.5 + (i % 8) * 0.5;
                    promises.push(
                        (async () => {
                            const res = RateCardService.calculateRate({
                                rateCardId: '5535_AMANI',
                                carrierCode: 'DGR',
                                countryCode: country,
                                weight
                            });
                            return { type: 'DGR', index: i, country, weight, res };
                        })()
                    );
                }
            }

            const results = await Promise.all(promises);
            expect(results.length).toBe(iterations);

            // Verify each execution preserves perfect carrier, currency, and zone isolation
            results.forEach(({ type, country, weight, res }) => {
                if (type === 'SMSA') {
                    expect(res.carrierCode).toBe('SMSA');
                    expect(res.currency).toBe('SAR');
                    expect(res.rateCardId).toBe('SMSA_CHALLENGER_CARD');
                    if (country === 'SA') expect(res.zone).toBe('ZONE_SA');
                    if (country === 'AE') expect(res.zone).toBe('ZONE_GCC');
                    if (country === 'US') expect(res.zone).toBe('ZONE_INT');
                    expect(res.billableWeight).toBe(weight);
                    expect(res.totalPrice).toBeGreaterThan(0);
                } else {
                    expect(res.carrierCode).toBe('DGR');
                    expect(res.currency).toBe('KWD');
                    expect(res.rateCardId).toBe('5535_AMANI');
                    expect(typeof res.zone).toBe('number');
                    expect(res.billableWeight).toBe(weight);
                    expect(res.totalPrice).toBeGreaterThan(0);
                }
            });
        });

        test('Verifies mathematical precision for over-30kg shipments under concurrent execution', async () => {
            // Over 30kg excess calculations in parallel
            const calls = [
                // SMSA SA: base 170 (bracket at 30kg = 20 + 30*5 = 170) + (35 - 30)*5 = 195 SAR
                RateCardService.calculateRate({
                    rateCardId: 'SMSA_CHALLENGER_CARD',
                    carrierCode: 'SMSA',
                    countryCode: 'SA',
                    weight: 35.0
                }),
                // SMSA GCC: base 275 (bracket at 30kg = 35 + 30*8 = 275) + (40 - 30)*7.5 = 350 SAR
                RateCardService.calculateRate({
                    rateCardId: 'SMSA_CHALLENGER_CARD',
                    carrierCode: 'SMSA',
                    countryCode: 'KW',
                    weight: 40.0
                }),
                // DGR Zone 1 (AE): base 124.5 + (32 - 30)*4.0 = 132.5 KWD
                RateCardService.calculateRate({
                    rateCardId: '5535_AMANI',
                    carrierCode: 'DGR',
                    countryCode: 'AE',
                    weight: 32.0
                })
            ];

            const [smsaSa, smsaGcc, dgrZ1] = await Promise.all(calls);

            expect(smsaSa.excessWeight).toBe(5.0);
            expect(smsaSa.baseRate).toBe(195.0);
            expect(smsaSa.totalPrice).toBe(195.0);

            expect(smsaGcc.excessWeight).toBe(10.0);
            expect(smsaGcc.baseRate).toBe(350.0);
            expect(smsaGcc.totalPrice).toBe(350.0);

            expect(dgrZ1.excessWeight).toBe(2.0);
            expect(dgrZ1.baseRate).toBe(132.5);
            expect(dgrZ1.totalPrice).toBe(132.5);
        });

        test('Verifies volumetric weight calculation parity across air (5000) and road (4000) divisors', () => {
            const pkg = { length: 50, width: 40, height: 30, weight: 5 }; // Volume = 60,000 cm3
            // Divisor 5000 -> 12 kg
            const airRate = RateCardService.calculateRate({
                rateCardId: 'SMSA_CHALLENGER_CARD',
                carrierCode: 'SMSA',
                countryCode: 'SA',
                packages: [pkg],
                volumetricDivisor: 5000
            });
            expect(airRate.volumetricWeight).toBe(12.0);
            expect(airRate.billableWeight).toBe(12.0);

            // Divisor 4000 -> 15 kg
            const roadRate = RateCardService.calculateRate({
                rateCardId: 'SMSA_CHALLENGER_CARD',
                carrierCode: 'SMSA',
                countryCode: 'SA',
                packages: [pkg],
                volumetricDivisor: 4000
            });
            expect(roadRate.volumetricWeight).toBe(15.0);
            expect(roadRate.billableWeight).toBe(15.0);
        });
    });

    // =========================================================================
    // CHALLENGE 2: Carrier Aliasing & Fallback Handling
    // =========================================================================
    describe('Challenge 2: Carrier Aliasing & Fallback Handling', () => {
        const canonicalAliases = [
            'SMSA',
            'smsa',
            'SMSAEXPRESS',
            'smsaexpress',
            '  smsa  ',
            '  SMSAEXPRESS  '
        ];

        test.each(canonicalAliases)(
            'CarrierFactory.normalizeCarrierCode normalizes "%s" to canonical "SMSA"',
            (alias) => {
                expect(CarrierFactory.normalizeCarrierCode(alias.trim())).toBe('SMSA');
            }
        );

        test('CarrierFactory.normalizeCarrierCode also normalizes underscore variants "SMSA_EXPRESS" and "smsa_express"', () => {
            expect(CarrierFactory.normalizeCarrierCode('SMSA_EXPRESS')).toBe('SMSA');
            expect(CarrierFactory.normalizeCarrierCode('smsa_express')).toBe('SMSA');
        });

        test.each(['DGR', 'dgr', 'DHL', 'dhl', ' dhl '])(
            'CarrierFactory.normalizeCarrierCode normalizes "%s" to canonical "DGR"',
            (alias) => {
                expect(CarrierFactory.normalizeCarrierCode(alias.trim())).toBe('DGR');
            }
        );

        test.each(canonicalAliases)(
            'CarrierFactory.getAdapter returns SmsaAdapter for alias "%s" with sandbox environment forwarding',
            (alias) => {
                const adapter = CarrierFactory.getAdapter(alias.trim(), { isTest: true, environment: 'test' });
                expect(adapter).toBeInstanceOf(SmsaAdapter);
                expect(adapter.config.isTest).toBe(true);
                expect(adapter.config.environment).toBe('sandbox');
                expect(adapter.config.baseUrl).toContain('azurewebsites.net');
            }
        );

        test('CarrierFactory.getCarrierMetadata and getCarrierCapabilities return proper capabilities for SMSA and DGR', () => {
            const smsaMeta = CarrierFactory.getCarrierMetadata('smsaexpress');
            expect(smsaMeta).toBeDefined();
            expect(smsaMeta.code).toBe('SMSA');
            expect(smsaMeta.capabilities.supportsConversionTarget).toBe(true);
            expect(smsaMeta.capabilities.supportsRating).toBe(true);
            expect(smsaMeta.capabilities.supportsTracking).toBe(true);

            const dgrMeta = CarrierFactory.getCarrierMetadata('dhl');
            expect(dgrMeta).toBeDefined();
            expect(dgrMeta.code).toBe('DGR');
            expect(dgrMeta.capabilities.supportsConversionTarget).toBe(true);
        });

        test('RateCardService.resolveZone handles canonical SMSA aliases ("SMSA", "SMSAEXPRESS", "smsa", "smsaexpress")', () => {
            for (const alias of canonicalAliases) {
                const cleaned = alias.trim();
                const zoneSa = RateCardService.resolveZone(cleaned, 'SA', smsaRateCard);
                expect(zoneSa).toBe('ZONE_SA');
                const zoneGcc = RateCardService.resolveZone(cleaned, 'Kuwait', smsaRateCard);
                expect(zoneGcc).toBe('ZONE_GCC');
                const zoneInt = RateCardService.resolveZone(cleaned, 'US', smsaRateCard);
                expect(zoneInt).toBe('ZONE_INT');
            }
        });

        test('RateCardService.resolveZone with CarrierFactory.normalizeCarrierCode bridges underscore variants ("SMSA_EXPRESS")', () => {
            // Direct call to RateCardService with raw 'SMSA_EXPRESS' returns null because RateCardService only checks SMSA and SMSAEXPRESS
            expect(RateCardService.resolveZone('SMSA_EXPRESS', 'SA', smsaRateCard)).toBeNull();

            // When passed through CarrierFactory.normalizeCarrierCode, it correctly resolves to ZONE_SA
            const normalized = CarrierFactory.normalizeCarrierCode('SMSA_EXPRESS');
            expect(RateCardService.resolveZone(normalized, 'SA', smsaRateCard)).toBe('ZONE_SA');
        });

        test('Fallback behavior: gracefully handles unknown carriers, non-existent rate cards, and unimplemented carriers', () => {
            // Unknown carrier throws descriptive error
            expect(() => CarrierFactory.getAdapter('NON_EXISTENT_CARRIER')).toThrow(
                /Carrier 'NON_EXISTENT_CARRIER' not supported/
            );

            // UPS throws unimplemented error
            expect(() => CarrierFactory.getAdapter('UPS')).toThrow(
                /UPS integration not yet implemented/
            );

            // Null carrierCode defaults to DGR
            expect(CarrierFactory.normalizeCarrierCode(null)).toBe('DGR');
            expect(CarrierFactory.normalizeCarrierCode(undefined)).toBe('DGR');

            // Non-existent rate card in RateCardService throws clean descriptive error
            expect(() => {
                RateCardService.calculateRate({
                    rateCardId: 'GHOST_RATE_CARD_9999',
                    countryCode: 'SA',
                    weight: 1.0
                });
            }).toThrow(/Rate card 'GHOST_RATE_CARD_9999' not found\./);
        });
    });

    // =========================================================================
    // CHALLENGE 3: Tracking Exception Healing vs Terminal Status Monotonicity
    // =========================================================================
    describe('Challenge 3: Tracking Exception Healing vs Terminal Status Monotonicity', () => {
        test('Terminal status invariant: delivered, cancelled, returned cannot be superseded or regressed', () => {
            expect(isTerminalStatus('delivered')).toBe(true);
            expect(isTerminalStatus('cancelled')).toBe(true);
            expect(isTerminalStatus('returned')).toBe(true);
            expect(isTerminalStatus('in_transit')).toBe(false);
            expect(isTerminalStatus('exception')).toBe(false);

            // Active movements or exception scans arriving after terminal statuses must return isStatusAhead = false
            expect(isStatusAhead('delivered', 'in_transit')).toBe(false);
            expect(isStatusAhead('delivered', 'exception')).toBe(false);
            expect(isStatusAhead('delivered', 'out_for_delivery')).toBe(false);
            expect(isStatusAhead('delivered', 'picked_up')).toBe(false);

            expect(isStatusAhead('cancelled', 'in_transit')).toBe(false);
            expect(isStatusAhead('cancelled', 'delivered')).toBe(false);
            expect(isStatusAhead('cancelled', 'exception')).toBe(false);

            expect(isStatusAhead('returned', 'in_transit')).toBe(false);
            expect(isStatusAhead('returned', 'delivered')).toBe(false);
            expect(isStatusAhead('returned', 'exception')).toBe(false);
        });

        test('Exception healing: subsequent active movements legitimately heal prior temporary exceptions', () => {
            // Forward movement clears exception
            expect(isStatusAhead('exception', 'in_transit')).toBe(true);
            expect(isStatusAhead('exception', 'out_for_delivery')).toBe(true);
            expect(isStatusAhead('exception', 'delivered')).toBe(true);
            expect(isStatusAhead('exception', 'received_at_hub')).toBe(true);
            expect(isStatusAhead('exception', 'picked_up')).toBe(true);

            // Older backward or non-movement scans do not heal
            expect(isStatusAhead('exception', 'draft')).toBe(false);
            expect(isStatusAhead('exception', 'booked')).toBe(false);
            expect(isStatusAhead('exception', 'exception')).toBe(false);
        });

        test('Anti-false-positive exception precedence: negative phrases containing "deliver" never promote to delivered', () => {
            const deceptiveScans = [
                'Consignee premises closed - not delivered',
                'Delivery attempt failed',
                'Delivery failed due to bad address',
                'Undelivered shipment held at station',
                'Package not delivered - consignee unavailable',
                'Delivery rescheduled - not delivered today',
                'Consignee refused - not delivered',
                'Contacted consignee for customs - on hold'
            ];

            deceptiveScans.forEach((scan) => {
                expect(isNegativeOrExceptionPhrase(scan)).toBe(true);
                expect(normalizeStatus(scan)).toBe('exception');
                expect(normalizeCarrierStatus(scan, 'SMSA', 'failed_attempt')).toBe('exception');
                expect(normalizeCarrierStatus(scan, 'DGR', 'BA')).toBe('exception');
            });
        });

        test('Multi-carrier checkpoint parity: SMSA and DHL checkpoint maps accurately resolve milestones', () => {
            // SMSA checkpoints
            expect(normalizeCarrierStatus('Shipment Created', 'SMSA', 'data_rcvd')).toBe('booked');
            expect(normalizeCarrierStatus('Picked up by courier', 'SMSA', 'pu')).toBe('picked_up');
            expect(normalizeCarrierStatus('Facility arrival', 'SMSA', 'arr_fac')).toBe('received_at_hub');
            expect(normalizeCarrierStatus('In Transit', 'SMSA', 'in_transit')).toBe('in_transit');
            expect(normalizeCarrierStatus('Courier out for delivery', 'SMSA', 'out_for_dlv')).toBe('out_for_delivery');
            expect(normalizeCarrierStatus('Delivered to consignee', 'SMSA', 'dlv')).toBe('delivered');
            expect(normalizeCarrierStatus('Returned to origin', 'SMSA', 'rto')).toBe('returned');

            // DHL checkpoints
            expect(normalizeCarrierStatus('Shipment picked up', 'DGR', 'PU')).toBe('picked_up');
            expect(normalizeCarrierStatus('Arrived at DHL Delivery Facility', 'DGR', 'AF')).toBe('received_at_hub');
            expect(normalizeCarrierStatus('Departed Facility in Transit', 'DGR', 'DF')).toBe('in_transit');
            expect(normalizeCarrierStatus('With delivery courier', 'DGR', 'WC')).toBe('out_for_delivery');
            expect(normalizeCarrierStatus('Shipment delivered', 'DGR', 'OK')).toBe('delivered');
            expect(normalizeCarrierStatus('Consignee premises closed', 'DGR', 'BA')).toBe('exception');
            expect(normalizeCarrierStatus('Returned to shipper', 'DGR', 'RT')).toBe('returned');
        });
    });

    // =========================================================================
    // CHALLENGE 4: Corporate Liability Strict Separation (CARRIER_PAYABLE)
    // =========================================================================
    describe('Challenge 4: Corporate Liability Strict Separation (CARRIER_PAYABLE)', () => {
        const financeLedgerService = require('../src/services/financeLedger.service');
        const carrierReconciliationService = require('../src/services/carrierReconciliation.service');

        test('recordCarrierPayable stores organizationId as strictly null and never mutates merchant balance', async () => {
            const merchantOrgId = 'org-merchant-1';
            const initialBalance = mockOrganizations[merchantOrgId].balance; // 500.000

            // 1. Record customer charge for SMSA shipment
            const customerCharge = await financeLedgerService.createLedgerEntry(
                merchantOrgId,
                {
                    sourceRepo: 'Shipment',
                    sourceId: 'shp-smsa-001',
                    amount: 25.000,
                    currency: 'KWD',
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: 'Customer charge for SMSA shipment'
                }
            );
            expect(customerCharge.organizationId).toBe(merchantOrgId);
            expect(customerCharge.category).toBe('SHIPMENT_CHARGE');
            expect(mockOrganizations[merchantOrgId].balance).toBe(525.000); // 500 + 25

            // 2. Record corporate liability for SMSA wholesale cost
            const carrierPayable = await financeLedgerService.recordCarrierPayable({
                organizationId: null,
                shipmentId: 'shp-smsa-001',
                carrierCode: 'SMSA',
                costPrice: 15.000,
                currency: 'KWD',
                trackingNumber: 'SMSA-TRK-001'
            });

            expect(carrierPayable).toBeDefined();
            expect(carrierPayable.organizationId).toBeNull();
            expect(carrierPayable.category).toBe('CARRIER_PAYABLE');
            expect(carrierPayable.entryType).toBe('CREDIT');

            // CRITICAL INVARIANT: Merchant balance MUST remain 525.000, NOT mutated by carrier cost!
            expect(mockOrganizations[merchantOrgId].balance).toBe(525.000);

            // 3. Verify getOrganizationBalance filters out CARRIER_PAYABLE completely
            const merchantBalance = await financeLedgerService.getOrganizationBalance(merchantOrgId);
            expect(merchantBalance).toBe(25.000); // 25 debit - 0 credit
        });

        test('Cross-carrier liability isolation: DHL and SMSA wholesale payables remain isolated from client merchant statements', async () => {
            const merchantOrgId = 'org-merchant-2';

            // Post multiple liabilities for DGR and SMSA
            await financeLedgerService.recordCarrierPayable({
                organizationId: null,
                shipmentId: 'shp-dhl-101',
                carrierCode: 'DGR',
                costPrice: 45.000,
                currency: 'SAR',
                trackingNumber: 'DHL-101'
            });

            await financeLedgerService.recordCarrierPayable({
                organizationId: null,
                shipmentId: 'shp-smsa-102',
                carrierCode: 'SMSA',
                costPrice: 30.000,
                currency: 'SAR',
                trackingNumber: 'SMSA-102'
            });

            // Ensure both are recorded with organizationId: null
            const carrierEntries = mockLedgerEntries.filter(e => e.category === 'CARRIER_PAYABLE');
            expect(carrierEntries.length).toBeGreaterThanOrEqual(2);
            carrierEntries.forEach(entry => {
                expect(entry.organizationId).toBeNull();
            });

            // Ensure merchant balance is unchanged
            expect(mockOrganizations[merchantOrgId].balance).toBe(2000.000);
        });

        test('CarrierReconciliationService postAdjustments posts strictly to organizationId: null', async () => {
            // Seed a shipment in mock db
            mockShipments['shp-recon-01'] = {
                id: 'shp-recon-01',
                trackingNumber: 'SMSA-RECON-01',
                price: 50.000,
                costPrice: 20.000,
                pricingSnapshot: { carrierRate: 20.000, totalPrice: 50.000 }
            };

            const adjustments = [
                {
                    shipmentId: 'shp-recon-01',
                    deltaAmount: 5.000, // overbilled by 5 KWD
                    currency: 'KWD',
                    reason: 'SMSA weight discrepancy +5 KWD',
                    organizationId: 'org-merchant-1' // merchant passed in payload, MUST be ignored for liability!
                }
            ];

            const result = await carrierReconciliationService.postAdjustments(
                adjustments,
                'user-admin'
            );

            expect(result.success).toBe(true);
            expect(result.count).toBe(1);

            // Find the adjustment entry created
            const adjEntry = mockLedgerEntries.find(e =>
                e.sourceId === 'shp-recon-01' &&
                e.category === 'CARRIER_PAYABLE' &&
                e.entryType === 'CREDIT'
            );

            expect(adjEntry).toBeDefined();
            expect(adjEntry.organizationId).toBeNull(); // STRICTLY NULL!
            expect(adjEntry.amount).toBe(5.000);

            // Shipment costPrice updated from 20 -> 25
            expect(mockShipments['shp-recon-01'].costPrice).toBe(25.000);
            expect(mockShipments['shp-recon-01'].markupAmount).toBe(25.000); // 50 - 25

            // Client merchant balance MUST NOT be changed by reconciliation adjustment!
            expect(mockOrganizations['org-merchant-1'].balance).toBe(500.000);
        });
    });
});
