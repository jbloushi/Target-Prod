const { VENDORS } = require('../src/scripts/seedAccounting');
const {
    SERVICE_LABELS,
    normalizeCarrier,
    getServiceName,
    getServiceOptions
} = require('../src/services/shippingAccess.service');
const RateCardService = require('../src/services/RateCardService');
const PricingService = require('../src/services/pricing.service');
const {
    SMSA_CHECKPOINT_MAP,
    SMSA_STATUS_MAP,
    normalizeCarrierStatus,
    normalizeStatus
} = require('../src/constants/statusConstants');
const carrierReconciliationService = require('../src/services/carrierReconciliation.service');
const financeLedgerService = require('../src/services/financeLedger.service');
const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');
const CarrierFactory = require('../src/services/CarrierFactory');

jest.mock('../src/config/database', () => ({
    prisma: {
        $connect: jest.fn().mockResolvedValue(),
        $disconnect: jest.fn().mockResolvedValue(),
        $transaction: jest.fn((callback) => callback({
            organizationLedger: {
                create: jest.fn().mockResolvedValue({ id: 'mock-ledger-entry' })
            },
            shipment: {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({ id: 'mock-shipment' })
            }
        })),
        vendor: {
            upsert: jest.fn().mockResolvedValue({ id: 'mock-vendor' })
        },
        account: {
            upsert: jest.fn().mockResolvedValue({ id: 'mock-account' }),
            findUnique: jest.fn().mockResolvedValue({ id: 'mock-gl-1010' })
        },
        bankAccount: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'mock-bank' })
        },
        accountingPeriod: {
            upsert: jest.fn().mockResolvedValue({ id: 'mock-period' })
        },
        organization: {
            findFirst: jest.fn().mockResolvedValue({ id: 'org-internal' }),
            create: jest.fn().mockResolvedValue({ id: 'org-internal' })
        },
        user: {
            findFirst: jest.fn().mockResolvedValue({ id: 'admin-1' }),
            create: jest.fn().mockResolvedValue({ id: 'admin-1' }),
            upsert: jest.fn().mockResolvedValue({ id: 'admin-1' })
        },
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
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
            findMany: jest.fn().mockResolvedValue([])
        }
    }
}));

jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('Milestone 2: SMSA Platform Parity Suite', () => {

    describe('1. Vendor & Accounting Seed Parity', () => {
        test('VENDORS contains SMSA Express configuration with 30-day AP terms', () => {
            const smsaVendor = VENDORS.find(v => v.code === 'SMSA' || v.carrierCode === 'SMSA');
            expect(smsaVendor).toBeDefined();
            expect(smsaVendor).toMatchObject({
                name: 'SMSA Express',
                code: 'SMSA',
                carrierCode: 'SMSA',
                currency: 'KWD',
                contactPerson: 'SMSA Corporate Accounts',
                email: 'billing@smsaexpress.com',
                termsDays: 30
            });
        });

        test('seedAccounting upserts SMSA alongside DHL and other carrier vendors', async () => {
            const { prisma } = require('../src/config/database');
            const { seedAccounting } = require('../src/scripts/seedAccounting');
            
            await seedAccounting();
            
            expect(prisma.vendor.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { code: 'SMSA' },
                    create: expect.objectContaining({
                        code: 'SMSA',
                        carrierCode: 'SMSA',
                        name: 'SMSA Express'
                    })
                })
            );
        });
    });

    describe('2. Shipping Access & Carrier Labels Parity', () => {
        test('SERVICE_LABELS defines DLV and RTN for SMSA and SMSAEXPRESS', () => {
            expect(SERVICE_LABELS.SMSA).toBeDefined();
            expect(SERVICE_LABELS.SMSA.DLV).toBe('SMSA Express Door-to-Door Delivery');
            expect(SERVICE_LABELS.SMSA.RTN).toBe('SMSA Reverse Pickup');

            expect(SERVICE_LABELS.SMSAEXPRESS).toBeDefined();
            expect(SERVICE_LABELS.SMSAEXPRESS.DLV).toBe('SMSA Express Door-to-Door Delivery');
            expect(SERVICE_LABELS.SMSAEXPRESS.RTN).toBe('SMSA Reverse Pickup');
        });

        test('normalizeCarrier maps SMSA, SMSAEXPRESS, and lowercase aliases to SMSA', () => {
            expect(normalizeCarrier('SMSA')).toBe('SMSA');
            expect(normalizeCarrier('smsa')).toBe('SMSA');
            expect(normalizeCarrier('SMSAEXPRESS')).toBe('SMSA');
            expect(normalizeCarrier('smsaexpress')).toBe('SMSA');
            expect(normalizeCarrier('SMSA_EXPRESS')).toBe('SMSA');
        });

        test('getServiceName resolves human-readable names for SMSA services', () => {
            expect(getServiceName('SMSA', 'DLV')).toBe('SMSA Express Door-to-Door Delivery');
            expect(getServiceName('SMSA', 'RTN')).toBe('SMSA Reverse Pickup');
            expect(getServiceName('SMSAEXPRESS', 'DLV')).toBe('SMSA Express Door-to-Door Delivery');
            expect(getServiceName('SMSA', null)).toBe('Any Available Service');
        });

        test('getServiceOptions includes SMSA services', () => {
            const options = getServiceOptions('SMSA');
            expect(options).toEqual(
                expect.arrayContaining([
                    { serviceCode: 'DLV', serviceName: 'SMSA Express Door-to-Door Delivery' },
                    { serviceCode: 'RTN', serviceName: 'SMSA Reverse Pickup' }
                ])
            );
        });
    });

    describe('3. Rate Card Service & Pricing Parity', () => {
        test('resolveSmsaZone normalizes Saudi Arabia, GCC, and International destinations', () => {
            // Saudi Arabia -> Domestic / Regional
            expect(RateCardService.resolveSmsaZone('SA')).toBe('ZONE_SA');
            expect(RateCardService.resolveSmsaZone('SAU')).toBe('ZONE_SA');
            expect(RateCardService.resolveSmsaZone('KSA')).toBe('ZONE_SA');
            expect(RateCardService.resolveSmsaZone('Saudi Arabia')).toBe('ZONE_SA');
            expect(RateCardService.resolveSmsaZone('SA', { mode: 'short' })).toBe('SA');

            // GCC Countries -> GCC Zone
            const gccCountries = ['KW', 'Kuwait', 'AE', 'ARE', 'UAE', 'BH', 'Bahrain', 'QA', 'Qatar', 'OM', 'Oman'];
            for (const country of gccCountries) {
                expect(RateCardService.resolveSmsaZone(country)).toBe('ZONE_GCC');
                expect(RateCardService.resolveSmsaZone(country, { mode: 'short' })).toBe('GCC');
            }

            // International Destinations -> International Zone
            expect(RateCardService.resolveSmsaZone('US')).toBe('ZONE_INT');
            expect(RateCardService.resolveSmsaZone('GB')).toBe('ZONE_INT');
            expect(RateCardService.resolveSmsaZone('China')).toBe('ZONE_INT');
            expect(RateCardService.resolveSmsaZone('US', { mode: 'short' })).toBe('INT');
        });

        test('resolveZone handles SMSA cards with countryZones and named zone brackets', () => {
            const namedCard = {
                id: 'SMSA_GCC_NAMED',
                carrierCode: 'SMSA',
                brackets: [{ weight: 1, rates: { ZONE_SA: 12, ZONE_GCC: 22, ZONE_INT: 45 } }]
            };

            expect(RateCardService.resolveZone('SMSA', 'SA', namedCard)).toBe('ZONE_SA');
            expect(RateCardService.resolveZone('SMSA', 'KW', namedCard)).toBe('ZONE_GCC');
            expect(RateCardService.resolveZone('SMSA', 'AE', namedCard)).toBe('ZONE_GCC');
            expect(RateCardService.resolveZone('SMSA', 'US', namedCard)).toBe('ZONE_INT');
        });

        test('resolveZone maintains backward-compatible numeric defaults when no card is passed', () => {
            expect(RateCardService.resolveZone('SMSA', 'KW')).toBe(1);
            expect(RateCardService.resolveZone('SMSA', 'SA')).toBe(1);
            expect(RateCardService.resolveZone('SMSA', 'US')).toBe(2);
        });

        test('calculateRate seamlessly prices an SMSA rate card with volumetric divisor', () => {
            const smsaCard = {
                id: 'SMSA_CONTRACT_CARD',
                name: 'SMSA GCC Express Rate Card',
                carrierCode: 'SMSA',
                currency: 'SAR',
                pricingMode: 'SELLING_PRICE',
                maxBracketWeight: 30,
                weightStep: 0.5,
                volumetricDivisor: 5000,
                countryZones: { SA: 1, KW: 2, AE: 2, BH: 2, QA: 2, OM: 2 },
                defaultZone: 3,
                brackets: [
                    { weight: 0.5, rates: { '1': 15, '2': 25, '3': 40 } },
                    { weight: 1.0, rates: { '1': 20, '2': 32, '3': 50 } },
                    { weight: 5.5, rates: { '1': 45, '2': 65, '3': 95 } },
                    { weight: 30.0, rates: { '1': 100, '2': 180, '3': 300 } }
                ],
                over30KgPerKgRate: { '1': 3.0, '2': 5.0, '3': 8.0 }
            };

            RateCardService.rateCards.set('SMSA_CONTRACT_CARD', smsaCard);

            // 1. Domestic Saudi rate
            const rateDomestic = RateCardService.calculateRate({
                rateCardId: 'SMSA_CONTRACT_CARD',
                carrierCode: 'SMSA',
                countryCode: 'SA',
                weight: 0.8
            });
            expect(rateDomestic).toMatchObject({
                zone: 1,
                currency: 'SAR',
                totalPrice: 20
            });

            // 2. GCC rate (Kuwait)
            const rateGcc = RateCardService.calculateRate({
                rateCardId: 'SMSA_CONTRACT_CARD',
                carrierCode: 'SMSA',
                countryCode: 'KW',
                weight: 0.4
            });
            expect(rateGcc).toMatchObject({
                zone: 2,
                currency: 'SAR',
                totalPrice: 25
            });

            // 3. Volumetric calculation: 30x30x30 cm / 5000 = 5.4 kg -> rounds up to 30 bracket or finds tier
            const rateVolumetric = RateCardService.calculateRate({
                rateCardId: 'SMSA_CONTRACT_CARD',
                carrierCode: 'SMSA',
                countryCode: 'KW',
                packages: [{ length: 30, width: 30, height: 30, weight: 1.0 }]
            });
            expect(rateVolumetric.billableWeight).toBe(5.4);
        });

        test('PricingService securely snapshots and validates SMSA rate calculations with HMAC', () => {
            const carrierRate = 25.500;
            const markup = 15; // 15%
            const snapshot = PricingService.createSnapshot(carrierRate, markup, 'SAR', 'contract_card', {
                rateCardId: 'SMSA_CONTRACT_CARD',
                carrierCode: 'SMSA',
                zone: 2
            });

            expect(snapshot).toHaveProperty('rateHash');
            expect(snapshot.carrierRate).toBe(25.5);
            expect(snapshot.currency).toBe('SAR');

            // Valid snapshot
            const isValid = PricingService.validateSnapshot(snapshot);
            expect(isValid).toBe(true);

            // Tamper protection: modify total price and verify validation rejection
            const tamperedSnapshot = { ...snapshot, totalPrice: 10.000 };
            const isTamperedValid = PricingService.validateSnapshot(tamperedSnapshot);
            expect(isTamperedValid).toBe(false);
        });
    });

    describe('4. Status Normalization & Anti-False-Positive Exception Protection', () => {
        test('SMSA_CHECKPOINT_MAP and SMSA_STATUS_MAP are exported and complete', () => {
            expect(SMSA_CHECKPOINT_MAP).toBeDefined();
            expect(SMSA_STATUS_MAP).toBe(SMSA_CHECKPOINT_MAP);

            expect(SMSA_CHECKPOINT_MAP['data_rcvd']).toBe('booked');
            expect(SMSA_CHECKPOINT_MAP['pu']).toBe('picked_up');
            expect(SMSA_CHECKPOINT_MAP['arr_fac']).toBe('received_at_hub');
            expect(SMSA_CHECKPOINT_MAP['in_transit']).toBe('in_transit');
            expect(SMSA_CHECKPOINT_MAP['out_for_dlv']).toBe('out_for_delivery');
            expect(SMSA_CHECKPOINT_MAP['dlv']).toBe('delivered');
            expect(SMSA_CHECKPOINT_MAP['failed_attempt']).toBe('exception');
            expect(SMSA_CHECKPOINT_MAP['rto']).toBe('returned');
            expect(SMSA_CHECKPOINT_MAP['cancelled']).toBe('cancelled');
        });

        test('normalizeCarrierStatus normalizes positive SMSA checkpoint codes and descriptions', () => {
            expect(normalizeCarrierStatus('Shipment Created', 'SMSA', 'DATA_RCVD')).toBe('booked');
            expect(normalizeCarrierStatus('Courier Picked Up', 'SMSA', 'PU')).toBe('picked_up');
            expect(normalizeCarrierStatus('Sorting at Riyadh Hub', 'SMSA', 'ARR_FAC')).toBe('received_at_hub');
            expect(normalizeCarrierStatus('Linehaul Transit', 'SMSA', 'IN_TRANSIT')).toBe('in_transit');
            expect(normalizeCarrierStatus('With Courier for Delivery', 'SMSA', 'OUT_FOR_DLV')).toBe('out_for_delivery');
            expect(normalizeCarrierStatus('Successfully Delivered', 'SMSA', 'DLV')).toBe('delivered');
        });

        test('strict exception precedence: negative phrases NEVER evaluate to delivered', () => {
            // 1. "Undelivered: consignee premises closed" with DLV checkpoint must be exception
            expect(normalizeCarrierStatus('Undelivered: consignee premises closed', 'SMSA', 'DLV')).toBe('exception');

            // 2. "Package not delivered" must be exception
            expect(normalizeCarrierStatus('Package was not delivered', 'SMSA', 'DLV')).toBe('exception');

            // 3. "Delivery attempt failed" must be exception
            expect(normalizeCarrierStatus('Delivery attempt failed - customer unavailable', 'SMSA', 'DLV')).toBe('exception');

            // 4. "Held" or "on hold" must be exception
            expect(normalizeCarrierStatus('Package on hold at customs', 'SMSA', 'DLV')).toBe('exception');
            expect(normalizeCarrierStatus('Held at SMSA facility for incorrect address', 'SMSA')).toBe('exception');

            // 5. "Returned" or "RTO" must be returned, never delivered
            expect(normalizeCarrierStatus('Returned to shipper warehouse', 'SMSA', 'DLV')).toBe('returned');
            expect(normalizeCarrierStatus('RTO processed by courier', 'SMSA', 'DLV')).toBe('returned');
            expect(normalizeCarrierStatus('Return to origin', 'smsaexpress', 'DLV')).toBe('returned');
        });
    });

    describe('5. Carrier Tracking Synchronization Parity (Mocked getTracking)', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('syncCarrierTrackingHistory updates SMSA shipment status and appends chronological events', async () => {
            const mockTrackingData = {
                trackingNumber: '2900088888',
                carrierCode: 'SMSA',
                status: 'delivered',
                events: [
                    {
                        statusCode: 'PU',
                        description: 'Picked up from merchant',
                        timestamp: '2026-10-25T01:00:00.000Z',
                        location: 'Riyadh'
                    },
                    {
                        statusCode: 'OUT_FOR_DLV',
                        description: 'Out for delivery with driver',
                        timestamp: '2026-10-25T06:00:00.000Z',
                        location: 'Kuwait City'
                    },
                    {
                        statusCode: 'DLV',
                        description: 'Delivered to consignee',
                        timestamp: '2026-10-25T08:30:00.000Z',
                        location: 'Kuwait City'
                    }
                ]
            };

            const mockAdapter = {
                getTracking: jest.fn().mockResolvedValue(mockTrackingData)
            };
            jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

            const shipment = {
                id: 'ship-smsa-1',
                trackingNumber: 'SMS-10001',
                carrierCode: 'SMSA',
                carrierShipmentId: '2900088888',
                status: 'booked',
                history: []
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(mockAdapter.getTracking).toHaveBeenCalledWith('2900088888');
            expect(result).toBeDefined();
            expect(result.status).toBe('delivered');
            expect(result.history).toHaveLength(3);
            expect(result.history[0]).toMatchObject({
                status: 'picked_up',
                description: 'Picked up from merchant',
                source: 'carrier'
            });
            expect(result.history[2]).toMatchObject({
                status: 'delivered',
                description: 'Delivered to consignee',
                source: 'carrier'
            });
        });

        test('syncCarrierTrackingHistory protects against false-positive delivered when exception is present', async () => {
            const mockTrackingData = {
                trackingNumber: '2900099999',
                carrierCode: 'SMSA',
                status: 'exception',
                events: [
                    {
                        statusCode: 'DLV',
                        description: 'Delivery attempt failed: consignee premises closed',
                        timestamp: '2026-10-25T09:00:00.000Z',
                        location: 'Salmiya'
                    }
                ]
            };

            const mockAdapter = {
                getTracking: jest.fn().mockResolvedValue(mockTrackingData)
            };
            jest.spyOn(CarrierFactory, 'getAdapter').mockReturnValue(mockAdapter);

            const shipment = {
                id: 'ship-smsa-2',
                trackingNumber: 'SMS-10002',
                carrierCode: 'SMSA',
                carrierShipmentId: '2900099999',
                status: 'in_transit',
                history: []
            };

            const result = await syncCarrierTrackingHistory(shipment);

            expect(result.status).toBe('exception');
            expect(result.history[0].status).toBe('exception');
        });
    });

    describe('6. Carrier Reconciliation Parity (SMSA Invoice Matching & Adjustments)', () => {
        test('reconcileInvoiceRows matches SMSA invoices by carrierShipmentId and trackingNumber', async () => {
            const { prisma } = require('../src/config/database');

            prisma.shipment.findMany.mockResolvedValue([
                {
                    id: 'smsa-ship-1',
                    trackingNumber: 'SMS-TRK-001',
                    carrierShipmentId: '2900011111',
                    carrierCode: 'SMSA',
                    costPrice: 12.500,
                    price: 18.000,
                    organizationId: 'org-client-1',
                    organization: { id: 'org-client-1', name: 'Al-Sabah Medical' },
                    parcels: [{ weight: 1.5 }]
                },
                {
                    id: 'smsa-ship-2',
                    trackingNumber: 'SMS-TRK-002',
                    carrierShipmentId: '2900022222',
                    carrierCode: 'SMSA',
                    costPrice: 20.000,
                    price: 28.000,
                    organizationId: 'org-client-2',
                    organization: { id: 'org-client-2', name: 'Gulf Apex Trading' },
                    parcels: [{ weight: 3.0 }]
                }
            ]);

            prisma.organizationLedger.findMany.mockResolvedValue([
                {
                    id: 'payable-1',
                    sourceId: 'smsa-ship-1',
                    amount: 12.500,
                    currency: 'KWD'
                },
                {
                    id: 'payable-2',
                    sourceId: 'smsa-ship-2',
                    amount: 20.000,
                    currency: 'KWD'
                }
            ]);

            const invoiceRecords = [
                // 1. Matches by carrierShipmentId (Exact match)
                {
                    carrierShipmentId: '2900011111',
                    billedAmount: 12.500,
                    currency: 'KWD'
                },
                // 2. Matches by internal trackingNumber (Surcharge discrepancy: billed 22 vs expected 20)
                {
                    trackingNumber: 'SMS-TRK-002',
                    billedAmount: 22.000,
                    currency: 'KWD'
                },
                // 3. Unmatched record
                {
                    trackingNumber: '2900099999',
                    billedAmount: 10.000,
                    currency: 'KWD'
                }
            ];

            const result = await carrierReconciliationService.reconcileInvoiceRows(invoiceRecords, 'SMSA');

            expect(result.summary).toMatchObject({
                carrier: 'SMSA',
                totalRecords: 3,
                matchedCount: 2,
                discrepancyCount: 1,
                unmatchedCount: 1,
                totalBilled: 44.5,
                totalExpected: 32.5,
                totalVariance: 12.0
            });

            expect(result.items[0]).toMatchObject({
                status: 'MATCHED_EXACT',
                billedAmount: 12.5,
                expectedAmount: 12.5,
                deltaAmount: 0
            });

            expect(result.items[1]).toMatchObject({
                status: 'SURCHARGE_DISCREPANCY',
                billedAmount: 22.0,
                expectedAmount: 20.0,
                deltaAmount: 2.0
            });

            expect(result.items[2]).toMatchObject({
                status: 'UNMATCHED',
                billedAmount: 10.0,
                reason: 'Tracking number not found in internal system'
            });
        });

        test('postAdjustments posts strictly to corporate AP (2010) and COGS (5010) without touching client balances', async () => {
            const { prisma } = require('../src/config/database');
            jest.spyOn(financeLedgerService, 'createLedgerEntry').mockResolvedValue({
                id: 'ledger-recon-entry',
                amount: 2.000,
                category: 'CARRIER_PAYABLE'
            });

            const adjustments = [
                {
                    shipmentId: 'smsa-ship-2',
                    organizationId: 'org-client-2',
                    deltaAmount: 2.000,
                    currency: 'KWD',
                    reason: 'SMSA Remote Area Surcharge'
                }
            ];

            const postResult = await carrierReconciliationService.postAdjustments(adjustments, 'admin-user-id');

            expect(postResult.success).toBe(true);
            expect(postResult.count).toBe(1);

            // Crucial Security & Accounting Verification:
            // organizationId MUST be null so the client merchant ledger is NOT mutated!
            expect(financeLedgerService.createLedgerEntry).toHaveBeenCalledWith(
                null,
                expect.objectContaining({
                    sourceRepo: 'Shipment',
                    sourceId: 'smsa-ship-2',
                    amount: 2.000,
                    category: 'CARRIER_PAYABLE',
                    metadata: expect.objectContaining({
                        customerOrganizationId: 'org-client-2',
                        accountType: 'LIABILITY_AP'
                    })
                }),
                expect.anything()
            );
        });
    });
});
