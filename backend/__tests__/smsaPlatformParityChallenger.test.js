const {
    normalizeCarrierStatus,
    normalizeStatus,
    isTerminalStatus,
    isStatusAhead,
    isNegativeOrExceptionPhrase,
    SMSA_CHECKPOINT_MAP
} = require('../src/constants/statusConstants');
const RateCardService = require('../src/services/RateCardService');
const carrierReconciliationService = require('../src/services/carrierReconciliation.service');
const financeLedgerService = require('../src/services/financeLedger.service');
const generalLedgerService = require('../src/services/generalLedger.service');
const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
const CarrierFactory = require('../src/services/CarrierFactory');

jest.mock('../src/config/database', () => ({
    prisma: {
        $transaction: jest.fn(async (cb) => cb({
            shipment: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ship-adj-1',
                    trackingNumber: 'TRK-ADJ-001',
                    price: 25.000,
                    costPrice: 15.000,
                    pricingSnapshot: { totalPrice: 25.000, carrierRate: 15.000 }
                }),
                update: jest.fn().mockResolvedValue({ id: 'ship-adj-1' }),
                findMany: jest.fn().mockResolvedValue([])
            },
            organizationLedger: {
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn().mockResolvedValue({ id: 'mock-ledger-id' })
            },
            shipmentTrackingEvent: {
                createMany: jest.fn().mockResolvedValue({ count: 1 }),
                findMany: jest.fn().mockResolvedValue([])
            }
        })),
        shipment: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn()
        },
        organizationLedger: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        shipmentTrackingEvent: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([])
        }
    }
}));

jest.mock('../src/services/financeLedger.service', () => ({
    createLedgerEntry: jest.fn().mockResolvedValue({ id: 'entry-corporate-ap' })
}));

jest.mock('../src/services/generalLedger.service', () => ({
    postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-corporate-variance' })
}));

jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('Empirical Challenger: Milestone 2 SMSA Platform Parity & Background Sync', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Pillar 1: Status Normalization & Anti-False-Positive Testing', () => {
        const negativeDescriptionsWithDelivered = [
            'Consignee premises closed - not delivered',
            'Delivery attempt failed',
            'Shipment damaged during delivery',
            'Returned to shipper after delivery attempt',
            'Delivery failed due to bad address',
            'Consignee refused - not delivered',
            'Delivered to hub return desk after failed delivery',
            'Package not delivered - consignee unavailable',
            'Delivery rescheduled - not delivered today',
            'Undelivered shipment held at station',
            'Customs clearance delay - delivery on hold',
            'Action required: incorrect delivery address',
            'Delivery attempted but premises locked',
            'Consignee moved - unable to deliver',
            'Unsuccessful delivery attempt',
            'Delivery could not be completed',
            'Missed delivery - notice left',
            'Delivery exception: customer unreachable'
        ];

        test.each(negativeDescriptionsWithDelivered)(
            'Description "%s" MUST NOT normalize to delivered (standalone normalizeStatus)',
            (description) => {
                const normalized = normalizeStatus(description);
                expect(normalized).not.toBe('delivered');
                expect(['exception', 'returned', 'cancelled']).toContain(normalized);
            }
        );

        test.each(negativeDescriptionsWithDelivered)(
            'Description "%s" with carrier=SMSA and checkpoint=DLV MUST NOT evaluate to delivered (checkpoint conflict override)',
            (description) => {
                const normalized = normalizeCarrierStatus(description, 'SMSA', 'DLV');
                expect(normalized).not.toBe('delivered');
                expect(['exception', 'returned']).toContain(normalized);
            }
        );

        test.each(negativeDescriptionsWithDelivered)(
            'Description "%s" with carrier=SMSAEXPRESS and checkpoint=POD MUST NOT evaluate to delivered',
            (description) => {
                const normalized = normalizeCarrierStatus(description, 'SMSAEXPRESS', 'POD');
                expect(normalized).not.toBe('delivered');
                expect(['exception', 'returned']).toContain(normalized);
            }
        );

        test('isNegativeOrExceptionPhrase correctly flags negative phrases regardless of casing or punctuation', () => {
            expect(isNegativeOrExceptionPhrase('NOT DELIVERED!')).toBe(true);
            expect(isNegativeOrExceptionPhrase('Premises Closed, Please Reschedule.')).toBe(true);
            expect(isNegativeOrExceptionPhrase('Damage reported by driver')).toBe(true);
            expect(isNegativeOrExceptionPhrase('Successfully delivered to recipient')).toBe(false);
            expect(isNegativeOrExceptionPhrase('Out for delivery with driver')).toBe(false);
            expect(isNegativeOrExceptionPhrase('In transit to Riyadh hub')).toBe(false);
        });

        test('Terminal state invariants: isTerminalStatus correctly identifies terminal statuses', () => {
            expect(isTerminalStatus('delivered')).toBe(true);
            expect(isTerminalStatus('returned')).toBe(true);
            expect(isTerminalStatus('cancelled')).toBe(true);

            expect(isTerminalStatus('draft')).toBe(false);
            expect(isTerminalStatus('booked')).toBe(false);
            expect(isTerminalStatus('picked_up')).toBe(false);
            expect(isTerminalStatus('in_transit')).toBe(false);
            expect(isTerminalStatus('out_for_delivery')).toBe(false);
            expect(isTerminalStatus('exception')).toBe(false);
        });

        test('Terminal state invariant: isStatusAhead prevents active movement from superseding terminal states', () => {
            expect(isStatusAhead('delivered', 'in_transit')).toBe(false);
            expect(isStatusAhead('delivered', 'out_for_delivery')).toBe(false);
            expect(isStatusAhead('delivered', 'received_at_hub')).toBe(false);
            expect(isStatusAhead('delivered', 'picked_up')).toBe(false);

            expect(isStatusAhead('returned', 'in_transit')).toBe(false);
            expect(isStatusAhead('returned', 'out_for_delivery')).toBe(false);
            expect(isStatusAhead('returned', 'delivered')).toBe(false);

            expect(isStatusAhead('cancelled', 'in_transit')).toBe(false);
            expect(isStatusAhead('cancelled', 'delivered')).toBe(false);
            expect(isStatusAhead('cancelled', 'out_for_delivery')).toBe(false);
        });

        describe('Out-of-order scans in syncCarrierTrackingHistory', () => {
            test('Stale scans cannot regress a delivered shipment back to active movement', async () => {
                const mockTrackingData = {
                    trackingNumber: 'SMSA-TERM-001',
                    carrierCode: 'SMSA',
                    events: [
                        {
                            statusCode: 'IT',
                            description: 'Departed sorting facility in transit',
                            timestamp: '2026-10-25T10:00:00.000Z'
                        },
                        {
                            statusCode: 'OD',
                            description: 'With driver for delivery',
                            timestamp: '2026-10-25T11:00:00.000Z'
                        }
                    ]
                };

                const mockAdapter = {
                    getTracking: jest.fn().mockResolvedValue(mockTrackingData)
                };
                jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

                const shipment = {
                    id: 'ship-term-1',
                    trackingNumber: 'SMSA-TERM-001',
                    carrierCode: 'SMSA',
                    carrierShipmentId: '2900099901',
                    status: 'delivered',
                    history: [
                        { status: 'booked', timestamp: new Date('2026-10-25T08:00:00Z') },
                        { status: 'delivered', timestamp: new Date('2026-10-25T12:00:00Z') }
                    ]
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result.status).toBe('delivered');
            });

            test('Stale scans cannot regress a returned shipment', async () => {
                const mockTrackingData = {
                    trackingNumber: 'SMSA-TERM-002',
                    carrierCode: 'SMSA',
                    events: [
                        {
                            statusCode: 'IT',
                            description: 'Departed sorting facility in transit',
                            timestamp: '2026-10-25T10:00:00.000Z'
                        }
                    ]
                };

                const mockAdapter = {
                    getTracking: jest.fn().mockResolvedValue(mockTrackingData)
                };
                jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

                const shipment = {
                    id: 'ship-term-2',
                    trackingNumber: 'SMSA-TERM-002',
                    carrierCode: 'SMSA',
                    carrierShipmentId: '2900099902',
                    status: 'returned',
                    history: [
                        { status: 'returned', timestamp: new Date('2026-10-25T09:00:00Z') }
                    ]
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result.status).toBe('returned');
            });

            test('Stale scans cannot regress a cancelled shipment', async () => {
                const mockTrackingData = {
                    trackingNumber: 'SMSA-TERM-003',
                    carrierCode: 'SMSA',
                    events: [
                        {
                            statusCode: 'IT',
                            description: 'Departed sorting facility in transit',
                            timestamp: '2026-10-25T10:00:00.000Z'
                        }
                    ]
                };

                const mockAdapter = {
                    getTracking: jest.fn().mockResolvedValue(mockTrackingData)
                };
                jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

                const shipment = {
                    id: 'ship-term-3',
                    trackingNumber: 'SMSA-TERM-003',
                    carrierCode: 'SMSA',
                    carrierShipmentId: '2900099903',
                    status: 'cancelled',
                    history: [
                        { status: 'cancelled', timestamp: new Date('2026-10-25T07:00:00Z') }
                    ]
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result.status).toBe('cancelled');
            });

            test('BUG REPRODUCTION: Returned to shipper with checkpoint DLV must NOT promote status to delivered', async () => {
                const mockTrackingData = {
                    trackingNumber: 'SMSA-RTO-001',
                    carrierCode: 'SMSA',
                    events: [
                        {
                            statusCode: 'DLV',
                            description: 'Returned to shipper after delivery attempt',
                            timestamp: '2026-10-25T10:00:00.000Z'
                        }
                    ]
                };

                const mockAdapter = {
                    getTracking: jest.fn().mockResolvedValue(mockTrackingData)
                };
                jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

                const shipment = {
                    id: 'ship-rto-1',
                    trackingNumber: 'SMSA-RTO-001',
                    carrierCode: 'SMSA',
                    carrierShipmentId: '2900099904',
                    status: 'in_transit',
                    history: []
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result.status).not.toBe('delivered');
                expect(result.status).toBe('returned');
            });

            test('BUG REPRODUCTION: Unsuccessful delivery attempt with checkpoint DLV must NOT promote status to delivered', async () => {
                const mockTrackingData = {
                    trackingNumber: 'SMSA-FAIL-001',
                    carrierCode: 'SMSA',
                    events: [
                        {
                            statusCode: 'DLV',
                            description: 'Unsuccessful delivery attempt',
                            timestamp: '2026-10-25T10:00:00.000Z'
                        }
                    ]
                };

                const mockAdapter = {
                    getTracking: jest.fn().mockResolvedValue(mockTrackingData)
                };
                jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

                const shipment = {
                    id: 'ship-fail-1',
                    trackingNumber: 'SMSA-FAIL-001',
                    carrierCode: 'SMSA',
                    carrierShipmentId: '2900099905',
                    status: 'in_transit',
                    history: []
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result.status).not.toBe('delivered');
                expect(['exception', 'in_transit']).toContain(result.status);
            });

            test('BUG REPRODUCTION: Cancelled by customer with checkpoint DLV must NOT promote status to delivered', async () => {
                const mockTrackingData = {
                    trackingNumber: 'SMSA-CNCL-001',
                    carrierCode: 'SMSA',
                    events: [
                        {
                            statusCode: 'DLV',
                            description: 'Cancelled by customer prior to delivery',
                            timestamp: '2026-10-25T10:00:00.000Z'
                        }
                    ]
                };

                const mockAdapter = {
                    getTracking: jest.fn().mockResolvedValue(mockTrackingData)
                };
                jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

                const shipment = {
                    id: 'ship-cncl-1',
                    trackingNumber: 'SMSA-CNCL-001',
                    carrierCode: 'SMSA',
                    carrierShipmentId: '2900099906',
                    status: 'in_transit',
                    history: []
                };

                const result = await syncCarrierTrackingHistory(shipment);
                expect(result.status).not.toBe('delivered');
                expect(result.status).toBe('cancelled');
            });
        });
    });

    describe('Pillar 2: Rate Card & Zone Stress-Testing', () => {
        const saudiInputs = [
            'SA', 'SAU', 'ksa', 'Saudi Arabia', '  saudi arabia  ', '  SA  ', 'SAUDI', 'sau'
        ];
        const gccInputs = [
            'KW', 'kw', 'Kuwait', '  kuwait  ', 'KWT',
            'UAE', 'AE', 'ae', 'United Arab Emirates', 'ARE',
            'BH', 'bh', 'Bahrain', 'BHR',
            'QA', 'qa', 'Qatar', 'QAT',
            'OM', 'om', 'Oman', 'OMN'
        ];
        const intlInputs = [
            'US', 'us', 'USA', 'United States', '  usa  ',
            'GB', 'gb', 'UK', 'United Kingdom', 'GBR',
            'DE', 'FR', 'CN', 'JP', 'UNKNOWN_LAND'
        ];

        describe('resolveSmsaZone stress testing', () => {
            test.each(saudiInputs)('Resolves %s to Saudi domestic zone (ZONE_SA / 1 / SA)', (input) => {
                expect(RateCardService.resolveSmsaZone(input, { mode: 'named' })).toBe('ZONE_SA');
                expect(RateCardService.resolveSmsaZone(input, { mode: 'short' })).toBe('SA');
                expect(RateCardService.resolveSmsaZone(input, { mode: 'numeric' })).toBe(1);
            });

            test.each(gccInputs)('Resolves %s to GCC regional zone (ZONE_GCC / 1 / GCC)', (input) => {
                expect(RateCardService.resolveSmsaZone(input, { mode: 'named' })).toBe('ZONE_GCC');
                expect(RateCardService.resolveSmsaZone(input, { mode: 'short' })).toBe('GCC');
                expect(RateCardService.resolveSmsaZone(input, { mode: 'numeric' })).toBe(1);
            });

            test.each(intlInputs)('Resolves %s to International zone (ZONE_INT / 2 / INT)', (input) => {
                expect(RateCardService.resolveSmsaZone(input, { mode: 'named' })).toBe('ZONE_INT');
                expect(RateCardService.resolveSmsaZone(input, { mode: 'short' })).toBe('INT');
                expect(RateCardService.resolveSmsaZone(input, { mode: 'numeric' })).toBe(2);
            });
        });

        describe('resolveZone carrier code and edge case resilience', () => {
            const emptyOrInvalidInputs = ['', '   ', null, undefined];

            test.each(emptyOrInvalidInputs)('Returns null for empty/invalid country input: %j', (input) => {
                expect(RateCardService.resolveZone('SMSA', input)).toBeNull();
                expect(RateCardService.resolveZone('SMSAEXPRESS', input)).toBeNull();
            });

            test('Handles carrier code variations (SMSA, smsa, SMSAEXPRESS, smsaexpress)', () => {
                expect(RateCardService.resolveZone('smsa', 'SA')).toBe(1);
                expect(RateCardService.resolveZone('SMSA', 'SA')).toBe(1);
                expect(RateCardService.resolveZone('SMSAEXPRESS', 'SA')).toBe(1);
                expect(RateCardService.resolveZone('smsaexpress', 'SA')).toBe(1);
            });

            test('Respects rate card explicit countryZones mapping over generic zone heuristic', () => {
                const customCard = {
                    carrierCode: 'SMSA',
                    countryZones: {
                        'SA': 'ZONE_DOMESTIC_CUSTOM',
                        'KW': 3,
                        'US': 9
                    }
                };

                expect(RateCardService.resolveZone('SMSA', 'SA', customCard)).toBe('ZONE_DOMESTIC_CUSTOM');
                expect(RateCardService.resolveZone('SMSA', 'KW', customCard)).toBe(3);
                expect(RateCardService.resolveZone('SMSA', 'US', customCard)).toBe(9);
            });

            test('Respects rate card defaultZone fallback when destination is unmapped', () => {
                const customCard = {
                    carrierCode: 'SMSA',
                    countryZones: { 'SA': 1 },
                    defaultZone: 7
                };

                expect(RateCardService.resolveZone('SMSA', 'FR', customCard)).toBe(7);
            });

            test('Detects named zones or short codes in card brackets', () => {
                const namedCard = {
                    carrierCode: 'SMSA',
                    brackets: [
                        { maxWeight: 5, rates: { ZONE_SA: 10, ZONE_GCC: 20, ZONE_INT: 30 } }
                    ]
                };
                expect(RateCardService.resolveZone('SMSA', 'SA', namedCard)).toBe('ZONE_SA');
                expect(RateCardService.resolveZone('SMSA', 'KW', namedCard)).toBe('ZONE_GCC');
                expect(RateCardService.resolveZone('SMSA', 'US', namedCard)).toBe('ZONE_INT');

                const shortCard = {
                    carrierCode: 'SMSA',
                    brackets: [
                        { maxWeight: 5, rates: { SA: 10, GCC: 20, INT: 30 } }
                    ]
                };
                expect(RateCardService.resolveZone('SMSA', 'SA', shortCard)).toBe('SA');
                expect(RateCardService.resolveZone('SMSA', 'KW', shortCard)).toBe('GCC');
                expect(RateCardService.resolveZone('SMSA', 'US', shortCard)).toBe('INT');
            });
        });

        describe('Volumetric weight formula and billable weight calculation', () => {
            test('Calculates volumetric weight with standard air express divisor (5000)', () => {
                // 50 x 40 x 30 = 60,000 / 5000 = 12.0 kg
                const pkg = { weight: 8.0, length: 50, width: 40, height: 30 };
                const res = RateCardService.calculateBillableWeight(pkg, { volumetricDivisor: 5000 });

                expect(res.actualWeight).toBe(8.0);
                expect(res.volumetricWeight).toBe(12.0);
                expect(res.billableWeight).toBe(12.0);
            });

            test('Calculates volumetric weight with GCC road freight divisor (4000)', () => {
                // 50 x 40 x 30 = 60,000 / 4000 = 15.0 kg
                const pkg = { weight: 8.0, length: 50, width: 40, height: 30 };
                const res = RateCardService.calculateBillableWeight(pkg, { volumetricDivisor: 4000 });

                expect(res.actualWeight).toBe(8.0);
                expect(res.volumetricWeight).toBe(15.0);
                expect(res.billableWeight).toBe(15.0);
            });

            test('Billable weight is max(actual, volumetric) when actual is heavier', () => {
                const pkg = { weight: 20.0, length: 30, width: 30, height: 30 }; // vol = 27000 / 5000 = 5.4 kg
                const res = RateCardService.calculateBillableWeight(pkg, { volumetricDivisor: 5000 });

                expect(res.actualWeight).toBe(20.0);
                expect(res.volumetricWeight).toBe(5.4);
                expect(res.billableWeight).toBe(20.0);
            });

            test('Handles multi-package shipments correctly by aggregating actual and volumetric weights', () => {
                const packages = [
                    { weight: 2.0, length: 20, width: 20, height: 20 }, // 8000 / 5000 = 1.6 kg
                    { weight: 1.0, length: 30, width: 30, height: 30 }  // 27000 / 5000 = 5.4 kg
                ];
                // total actual = 3.0 kg, total volumetric = 7.0 kg -> billable = 7.0 kg
                const res = RateCardService.calculateBillableWeight(packages, { volumetricDivisor: 5000 });

                expect(res.actualWeight).toBe(3.0);
                expect(res.volumetricWeight).toBe(7.0);
                expect(res.billableWeight).toBe(7.0);
            });

            test('Zero or negative dimensions and invalid divisor are handled safely', () => {
                const pkg = { weight: 2.5, length: -10, width: 0, height: 20 };
                const res = RateCardService.calculateBillableWeight(pkg, { volumetricDivisor: 0 });

                expect(res.actualWeight).toBe(2.5);
                expect(res.volumetricWeight).toBe(0);
                expect(res.billableWeight).toBe(2.5);
                expect(res.volumetricDivisor).toBe(5000); // defaults back to 5000
            });

            test('Missing weight defaults to minimum 0.5 kg', () => {
                const pkg = { length: 0, width: 0, height: 0 };
                const res = RateCardService.calculateBillableWeight(pkg);

                expect(res.actualWeight).toBe(0.5);
                expect(res.billableWeight).toBe(0.5);
            });
        });
    });

    describe('Pillar 3: Carrier Reconciliation Security (Customer Ledger Isolation)', () => {
        test('postAdjustments GUARANTEES organizationId is NEVER set to customer merchant ID', async () => {
            const customerMerchantOrgId = 'cust-merchant-corp-4567';
            const adjustments = [
                {
                    shipmentId: 'ship-adj-1',
                    organizationId: customerMerchantOrgId,
                    deltaAmount: 14.250,
                    currency: 'KWD',
                    reason: 'Carrier fuel surcharge re-bill'
                }
            ];

            await carrierReconciliationService.postAdjustments(adjustments, 'finance-admin-user');

            // 1. Verify financeLedgerService.createLedgerEntry call arguments
            expect(financeLedgerService.createLedgerEntry).toHaveBeenCalledTimes(1);
            const [passedOrgId, passedPayload] = financeLedgerService.createLedgerEntry.mock.calls[0];

            // CRITICAL INVARIANT: The first argument MUST be null (platform corporate liability)
            expect(passedOrgId).toBeNull();
            expect(passedOrgId).not.toBe(customerMerchantOrgId);

            // Payload checks
            expect(passedPayload).toMatchObject({
                sourceRepo: 'Shipment',
                sourceId: 'ship-adj-1',
                amount: 14.250,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE'
            });

            // Customer organization ID must only be preserved in metadata for reporting/audit, never as ledger account target
            expect(passedPayload.metadata.customerOrganizationId).toBe(customerMerchantOrgId);

            // 2. Verify General Ledger balanced journal entry postings
            expect(generalLedgerService.postJournalEntry).toHaveBeenCalledTimes(1);
            const [glPayload] = generalLedgerService.postJournalEntry.mock.calls[0];

            expect(glPayload.sourceType).toBe('CARRIER_RECONCILIATION');
            expect(glPayload.lines).toHaveLength(2);

            // Invariant: Both GL lines (COGS 5010 and AP 2010) must have organizationId: null
            glPayload.lines.forEach(line => {
                expect(line.organizationId).toBeNull();
            });

            const cogsLine = glPayload.lines.find(l => l.accountCode === '5010');
            const apLine = glPayload.lines.find(l => l.accountCode === '2010');

            expect(cogsLine).toBeDefined();
            expect(apLine).toBeDefined();
            expect(cogsLine.debit).toBe(14.250);
            expect(apLine.credit).toBe(14.250);
        });

        test('postAdjustments handles negative delta (carrier overbilling credit) without touching customer merchant ledgers', async () => {
            const customerMerchantOrgId = 'cust-merchant-corp-8888';
            const adjustments = [
                {
                    shipmentId: 'ship-adj-1',
                    organizationId: customerMerchantOrgId,
                    deltaAmount: -5.500, // Carrier issued 5.500 KWD credit
                    currency: 'KWD',
                    reason: 'Carrier weight correction credit'
                }
            ];

            await carrierReconciliationService.postAdjustments(adjustments, 'finance-admin-user');

            expect(financeLedgerService.createLedgerEntry).toHaveBeenCalledTimes(1);
            const [passedOrgId, passedPayload] = financeLedgerService.createLedgerEntry.mock.calls[0];

            expect(passedOrgId).toBeNull();
            expect(passedPayload.entryType).toBe('DEBIT');
            expect(passedPayload.amount).toBe(5.500);

            const [glPayload] = generalLedgerService.postJournalEntry.mock.calls[0];
            const cogsLine = glPayload.lines.find(l => l.accountCode === '5010');
            const apLine = glPayload.lines.find(l => l.accountCode === '2010');

            expect(cogsLine.credit).toBe(5.500);
            expect(apLine.debit).toBe(5.500);
        });

        test('reconcileInvoiceRows rejects empty invoice record batches gracefully', async () => {
            await expect(carrierReconciliationService.reconcileInvoiceRows([], 'SMSA'))
                .rejects.toThrow('No invoice records provided for reconciliation');

            await expect(carrierReconciliationService.reconcileInvoiceRows([{ billedAmount: 10 }], 'SMSA'))
                .rejects.toThrow('No valid tracking numbers found in invoice records');
        });
    });
});
