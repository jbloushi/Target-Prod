/**
 * Milestone M6 Empirical Challenge Suite - Challenger 1
 * File: backend/__tests__/challenger1_m6_security_concurrency.test.js
 *
 * Adversarial tests covering:
 * 1. Pricing Snapshot Tampering (forged HMAC, modified optional services, expired snapshots, missing hashes, legacy SHA-256)
 * 2. Non-Staff Price Overrides (rejection of price, costPrice, pricingSnapshot from non-staff clients)
 * 3. Payment Webhook Replay (duplicate callbacks, payment reference deduplication, ledger entry deduplication, signature checks)
 * 4. Concurrency & Race Conditions (advisory locking for organizationId: null, running balance serialization, lock release in finally)
 */

const crypto = require('crypto');
const Decimal = require('decimal.js');
const PricingService = require('../src/services/pricing.service');
const financeLedgerService = require('../src/services/financeLedger.service');
const ottuPaymentService = require('../src/services/ottuPayment.service');
const { createMockRes } = require('../testUtils');

describe('Challenger 1 Empirical Security & Concurrency Challenge Suite (M6)', () => {

    // =========================================================================
    // 1. PRICING SNAPSHOT TAMPERING & CRYPTOGRAPHIC INTEGRITY
    // =========================================================================
    describe('1. Pricing Snapshot Tampering & HMAC Integrity', () => {
        const secret = process.env.PRICING_HMAC_SECRET || 'target-logistics-pricing-hmac-secret-2026';

        it('1.1 validates genuine HMAC-SHA256 snapshot successfully', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            expect(snapshot.rateHash).toBeDefined();
            expect(PricingService.validateSnapshot(snapshot)).toBe(true);
        });

        it('1.2 rejects forged HMAC hash when totalPrice is modified by an attacker', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            // Attacker attempts to change price from 30.000 to 1.000
            const tamperedSnapshot = { ...snapshot, totalPrice: 1.000 };
            expect(PricingService.validateSnapshot(tamperedSnapshot)).toBe(false);
        });

        it('1.3 rejects forged HMAC hash when carrierRate is modified by an attacker', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            const tamperedSnapshot = { ...snapshot, carrierRate: 10.000 };
            expect(PricingService.validateSnapshot(tamperedSnapshot)).toBe(false);
        });

        it('1.4 rejects forged HMAC hash when markup is modified by an attacker', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            const tamperedSnapshot = { ...snapshot, markup: 0.000 };
            expect(PricingService.validateSnapshot(tamperedSnapshot)).toBe(false);
        });

        it('1.5 rejects snapshot with an arbitrary forged HMAC generated with wrong secret', () => {
            const wrongSecret = 'attacker-crafted-secret-key-123456';
            const carrierDec = new Decimal(20.0);
            const markupDec = new Decimal(5.0);
            const optDec = new Decimal(0.0);
            const totalDec = new Decimal(25.0);
            const payload = `${carrierDec.toFixed(3)}|${markupDec.toFixed(3)}|${optDec.toFixed(3)}|${totalDec.toFixed(3)}|KWD`;
            const forgedHash = crypto.createHmac('sha256', wrongSecret).update(payload).digest('hex');

            const forgedSnapshot = {
                carrierRate: 20.0,
                markup: 5.0,
                totalPrice: 25.0,
                currency: 'KWD',
                rateHash: forgedHash,
                expiresAt: new Date(Date.now() + 86400000)
            };

            expect(PricingService.validateSnapshot(forgedSnapshot)).toBe(false);
        });

        it('1.6 rejects snapshot with random garbage or corrupted HMAC hash', () => {
            const garbageSnapshot = {
                carrierRate: 20.0,
                markup: 5.0,
                totalPrice: 25.0,
                currency: 'KWD',
                rateHash: crypto.randomBytes(32).toString('hex'),
                expiresAt: new Date(Date.now() + 86400000)
            };
            expect(PricingService.validateSnapshot(garbageSnapshot)).toBe(false);
        });

        it('1.7 validates snapshot with legitimate optional services included in HMAC', () => {
            const snapshot = PricingService.createSnapshot(50.0, 10.0, 'KWD', 'test_policy', {
                optionalServicesTotal: 15.0
            });
            expect(snapshot.totalPrice).toBe(70.0);
            expect(snapshot.optionalServicesTotal).toBe(15.0);
            expect(PricingService.validateSnapshot(snapshot)).toBe(true);
        });

        it('1.8 rejects snapshot when optionalServicesTotal is stripped but totalPrice is altered', () => {
            const snapshot = PricingService.createSnapshot(50.0, 10.0, 'KWD', 'test_policy', {
                optionalServicesTotal: 15.0
            });
            // Total was 75 KWD. Attacker drops optionalServicesTotal to 0 and totalPrice to 60.
            // But the hash was computed on 50|10|15|75.
            const tampered = {
                ...snapshot,
                optionalServicesTotal: 0,
                totalPrice: 60.0
            };
            expect(PricingService.validateSnapshot(tampered)).toBe(false);
        });

        it('1.9 rejects snapshot with injected negative optionalServicesTotal', () => {
            const snapshot = PricingService.createSnapshot(50.0, 10.0, 'KWD', 'test_policy');
            // Base total was 60. Attacker sets optionalServicesTotal to -20 and totalPrice to 40
            const tampered = {
                ...snapshot,
                optionalServicesTotal: -20.0,
                totalPrice: 40.0
            };
            expect(PricingService.validateSnapshot(tampered)).toBe(false);
        });

        it('1.10 rejects snapshot when expiresAt is in the past', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            const expiredSnapshot = {
                ...snapshot,
                expiresAt: new Date(Date.now() - 1000) // 1 second ago
            };
            expect(PricingService.validateSnapshot(expiredSnapshot)).toBe(false);
        });

        it('1.11 rejects snapshot when expiresAt is null or undefined', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            expect(PricingService.validateSnapshot({ ...snapshot, expiresAt: null })).toBe(false);
            expect(PricingService.validateSnapshot({ ...snapshot, expiresAt: undefined })).toBe(false);
        });

        it('1.12 rejects snapshot when rateHash is missing, empty, or null', () => {
            const snapshot = PricingService.createSnapshot(25.0, 5.0, 'KWD', 'test_policy');
            expect(PricingService.validateSnapshot({ ...snapshot, rateHash: null })).toBe(false);
            expect(PricingService.validateSnapshot({ ...snapshot, rateHash: '' })).toBe(false);
            expect(PricingService.validateSnapshot({ ...snapshot, rateHash: undefined })).toBe(false);
            expect(PricingService.validateSnapshot({})).toBe(false);
            expect(PricingService.validateSnapshot(null)).toBe(false);
        });

        it('1.13 maintains backward compatibility with legacy plain SHA-256 snapshots', () => {
            const carrierRate = 18.5;
            const markup = 3.5;
            const totalPrice = 22.0;
            const currency = 'KWD';
            const legacyPayload = `${carrierRate.toFixed(3)}-${markup.toFixed(3)}-${totalPrice.toFixed(3)}-${currency}`;
            const legacyHash = crypto.createHash('sha256').update(legacyPayload).digest('hex');

            const legacySnapshot = {
                carrierRate,
                markup,
                totalPrice,
                currency,
                rateHash: legacyHash,
                expiresAt: new Date(Date.now() + 86400000),
                rulesVersion: 'v1-legacy'
            };

            expect(PricingService.validateSnapshot(legacySnapshot)).toBe(true);
        });

        it('1.14 rejects tampered legacy plain SHA-256 snapshots when totalPrice is modified', () => {
            const carrierRate = 18.5;
            const markup = 3.5;
            const totalPrice = 22.0;
            const currency = 'KWD';
            const legacyPayload = `${carrierRate.toFixed(3)}-${markup.toFixed(3)}-${totalPrice.toFixed(3)}-${currency}`;
            const legacyHash = crypto.createHash('sha256').update(legacyPayload).digest('hex');

            const tamperedLegacySnapshot = {
                carrierRate,
                markup,
                totalPrice: 10.0, // Tampered
                currency,
                rateHash: legacyHash,
                expiresAt: new Date(Date.now() + 86400000)
            };

            expect(PricingService.validateSnapshot(tamperedLegacySnapshot)).toBe(false);
        });

        it('1.15 rejects expired legacy plain SHA-256 snapshots', () => {
            const carrierRate = 18.5;
            const markup = 3.5;
            const totalPrice = 22.0;
            const currency = 'KWD';
            const legacyPayload = `${carrierRate.toFixed(3)}-${markup.toFixed(3)}-${totalPrice.toFixed(3)}-${currency}`;
            const legacyHash = crypto.createHash('sha256').update(legacyPayload).digest('hex');

            const expiredLegacySnapshot = {
                carrierRate,
                markup,
                totalPrice,
                currency,
                rateHash: legacyHash,
                expiresAt: new Date(Date.now() - 5000) // Expired 5 seconds ago
            };

            expect(PricingService.validateSnapshot(expiredLegacySnapshot)).toBe(false);
        });
    });

    // =========================================================================
    // 2. NON-STAFF PRICE OVERRIDES ENFORCEMENT
    // =========================================================================
    describe('2. Non-Staff Price Overrides Enforcement', () => {
        let mockPrisma;

        beforeEach(() => {
            mockPrisma = {
                user: { findUnique: jest.fn() },
                shipment: { findUnique: jest.fn(), update: jest.fn() },
                shipmentAuditLog: { create: jest.fn().mockResolvedValue({}) },
                organization: { findUnique: jest.fn() }
            };
            jest.resetModules();
            jest.doMock('../src/config/database', () => ({ prisma: mockPrisma }));
            jest.doMock('../src/services/chatwootNotificationService', () => ({
                triggerShipmentNotification: jest.fn(),
                mapStatusToNotificationEvent: jest.fn()
            }));
            jest.doMock('../src/services/WebhookDispatcher', () => ({
                dispatch: jest.fn()
            }));
            jest.doMock('../src/services/queue/jobQueue', () => ({
                enqueue: jest.fn().mockResolvedValue({})
            }));
        });

        it('2.1 strips price, costPrice, markupAmount, and pricingSnapshot from non-staff update payload', async () => {
            const controller = require('../src/controllers/shipment-crud.controller');

            const existingShipment = {
                id: 'ship-sec-01',
                trackingNumber: 'TRK-SEC-01',
                userId: 'usr-client-1',
                organizationId: 'org-client-1',
                carrierCode: 'DHL',
                price: 120.0,
                costPrice: 80.0,
                markupAmount: 40.0,
                pricingSnapshot: { totalPrice: 120.0, rateHash: 'valid-hash' },
                status: 'booked',
                origin: { contactPerson: 'Sender' },
                destination: { contactPerson: 'Receiver' },
                documents: {},
                history: []
            };

            const clientUser = {
                id: 'usr-client-1',
                role: 'client',
                organizationId: 'org-client-1',
                name: 'Client Merchant'
            };

            const maliciousPayload = {
                specialInstructions: 'Handle with extreme care',
                price: 10.0,             // Attacker attempts to drop price from 120 to 10
                costPrice: 5.0,          // Attacker attempts to drop costPrice
                markupAmount: 5.0,       // Attacker attempts to drop markupAmount
                pricingSnapshot: {       // Attacker attempts to inject forged snapshot
                    totalPrice: 10.0,
                    rateHash: 'forged'
                }
            };

            mockPrisma.shipment.findUnique.mockResolvedValue(existingShipment);
            mockPrisma.shipment.update.mockImplementation(({ data }) => Promise.resolve({
                ...existingShipment,
                ...data
            }));

            const req = {
                params: { trackingNumber: 'TRK-SEC-01' },
                user: clientUser,
                body: maliciousPayload,
                headers: {},
                ip: '127.0.0.1'
            };
            const res = createMockRes();

            await controller.updateShipment(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockPrisma.shipment.update).toHaveBeenCalled();
            const updateCallData = mockPrisma.shipment.update.mock.calls[0][0].data;

            // Strict assertions: pricing fields MUST be stripped for client role
            expect(updateCallData.price).toBeUndefined();
            expect(updateCallData.costPrice).toBeUndefined();
            expect(updateCallData.markupAmount).toBeUndefined();
            expect(updateCallData.pricingSnapshot).toBeUndefined();
            // Non-pricing field should have been processed
            expect(updateCallData.origin.specialInstructions).toBe('Handle with extreme care');
        });

        it('2.2 strips price and costPrice from non-staff update even on INTERNAL carrier shipments', async () => {
            const controller = require('../src/controllers/shipment-crud.controller');

            const existingShipment = {
                id: 'ship-int-01',
                trackingNumber: 'TRK-INT-01',
                userId: 'usr-client-1',
                organizationId: 'org-client-1',
                carrierCode: 'INTERNAL',
                price: 50.0,
                costPrice: 30.0,
                status: 'booked',
                origin: {},
                destination: {},
                documents: {},
                history: []
            };

            const clientUser = {
                id: 'usr-client-1',
                role: 'client',
                organizationId: 'org-client-1',
                name: 'Client Merchant'
            };

            mockPrisma.shipment.findUnique.mockResolvedValue(existingShipment);
            mockPrisma.shipment.update.mockImplementation(({ data }) => Promise.resolve({
                ...existingShipment,
                ...data
            }));

            const req = {
                params: { trackingNumber: 'TRK-INT-01' },
                user: clientUser,
                body: { price: 5.0, costPrice: 2.0 },
                headers: {},
                ip: '127.0.0.1'
            };
            const res = createMockRes();

            await controller.updateShipment(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const updateCallData = mockPrisma.shipment.update.mock.calls[0][0].data;

            // Non-staff CANNOT manage manual pricing fields on INTERNAL carrier shipments
            expect(updateCallData.price).toBeUndefined();
            expect(updateCallData.costPrice).toBeUndefined();
        });

        it('2.3 accepts price and costPrice update when performed by authorized staff user on INTERNAL carrier', async () => {
            const controller = require('../src/controllers/shipment-crud.controller');

            const existingShipment = {
                id: 'ship-int-staff',
                trackingNumber: 'TRK-INT-STAFF',
                userId: 'usr-client-1',
                organizationId: 'org-client-1',
                carrierCode: 'INTERNAL',
                price: 50.0,
                costPrice: 30.0,
                status: 'booked',
                origin: {},
                destination: {},
                documents: {},
                history: []
            };

            const staffUser = {
                id: 'usr-staff-1',
                role: 'staff',
                name: 'Operations Staff'
            };

            mockPrisma.shipment.findUnique.mockResolvedValue(existingShipment);
            mockPrisma.shipment.update.mockImplementation(({ data }) => Promise.resolve({
                ...existingShipment,
                ...data
            }));

            const req = {
                params: { trackingNumber: 'TRK-INT-STAFF' },
                user: staffUser,
                body: { price: 65.0, costPrice: 40.0 },
                headers: {},
                ip: '127.0.0.1'
            };
            const res = createMockRes();

            await controller.updateShipment(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const updateCallData = mockPrisma.shipment.update.mock.calls[0][0].data;

            // Staff IS authorized to update manual fields
            expect(updateCallData.price).toBe(65.0);
            expect(updateCallData.costPrice).toBe(40.0);
            expect(updateCallData.pricingSnapshot).toEqual(expect.objectContaining({
                totalPrice: 65.0,
                carrierRate: 40.0,
                policySource: 'manual'
            }));
        });
    });

    // =========================================================================
    // 3. PAYMENT WEBHOOK REPLAY & REFERENCE DEDUPLICATION
    // =========================================================================
    describe('3. Payment Webhook Replay & Reference Deduplication', () => {
        let mockPrisma;

        beforeEach(() => {
            mockPrisma = {
                shipment: { findUnique: jest.fn(), update: jest.fn() },
                payment: { findFirst: jest.fn(), create: jest.fn() },
                paymentAllocation: { create: jest.fn() },
                organizationLedger: { findFirst: jest.fn(), create: jest.fn() },
                organization: { findUnique: jest.fn(), update: jest.fn() },
                $transaction: jest.fn(callback => callback(mockPrisma)),
                $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }])
            };
            jest.resetModules();
            jest.doMock('../src/config/database', () => ({ prisma: mockPrisma }));
            jest.doMock('../src/services/generalLedger.service', () => ({
                postPaymentReceiptEntry: jest.fn().mockResolvedValue({ id: 'je-pay-01' })
            }));
        });

        it('3.1 processes initial Ottu webhook and creates Payment and Ledger entry', async () => {
            const ottuService = require('../src/services/ottuPayment.service');

            const shipment = {
                id: 'ship-ottu-1',
                trackingNumber: 'TRK-OTTU-REPLAY-1',
                organizationId: 'org-client-1',
                price: 45.0,
                remainingBalance: 45.0,
                paid: false,
                currency: 'KWD',
                userId: 'usr-client-1',
                history: []
            };

            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            mockPrisma.payment.findFirst.mockResolvedValue(null); // No previous payment
            mockPrisma.payment.create.mockResolvedValue({ id: 'pmt-101', reference: 'OTTU-REF-REP-1' });
            mockPrisma.organizationLedger.findFirst.mockResolvedValue({ balanceAfter: 100.0 });
            mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-client-1', currency: 'KWD' });
            mockPrisma.shipment.update.mockResolvedValue({ ...shipment, paid: true, remainingBalance: 0 });

            const webhookPayload = {
                order_no: 'TRK-OTTU-REPLAY-1',
                session_id: 'sess-ottu-01',
                state: 'success',
                reference_number: 'OTTU-REF-REP-1',
                amount: 45.0,
                currency_code: 'KWD',
                payment_gateway_info: { pg_code: 'KNET' }
            };

            const result = await ottuService.handleWebhook(webhookPayload);

            expect(result.success).toBe(true);
            expect(result.alreadyPaid).toBeUndefined();
            expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1);
            expect(mockPrisma.paymentAllocation.create).toHaveBeenCalledTimes(1);
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'ship-ottu-1' },
                data: expect.objectContaining({ paid: true, remainingBalance: 0 })
            }));
        });

        it('3.2 simulates replay of identical webhook payload and verifies duplicate Payment is blocked', async () => {
            const ottuService = require('../src/services/ottuPayment.service');

            const shipment = {
                id: 'ship-ottu-1',
                trackingNumber: 'TRK-OTTU-REPLAY-1',
                organizationId: 'org-client-1',
                price: 45.0,
                remainingBalance: 45.0,
                paid: false,
                currency: 'KWD',
                userId: 'usr-client-1'
            };

            const existingPaymentRecord = {
                id: 'pmt-101',
                reference: 'OTTU-REF-REP-1',
                amount: 45.0,
                currency: 'KWD',
                createdAt: new Date()
            };

            mockPrisma.shipment.findUnique.mockResolvedValue(shipment);
            // Simulate that payment reference already exists in DB
            mockPrisma.payment.findFirst.mockResolvedValue(existingPaymentRecord);

            const duplicatePayload = {
                order_no: 'TRK-OTTU-REPLAY-1',
                session_id: 'sess-ottu-01',
                state: 'success',
                reference_number: 'OTTU-REF-REP-1',
                amount: 45.0,
                currency_code: 'KWD',
                payment_gateway_info: { pg_code: 'KNET' }
            };

            const result = await ottuService.handleWebhook(duplicatePayload);

            expect(result.success).toBe(true);
            expect(result.alreadyProcessed).toBe(true);
            expect(result.paymentId).toBe('pmt-101');
            // CRITICAL: payment.create and paymentAllocation.create MUST NOT be called!
            expect(mockPrisma.payment.create).not.toHaveBeenCalled();
            expect(mockPrisma.paymentAllocation.create).not.toHaveBeenCalled();
            expect(mockPrisma.organizationLedger.create).not.toHaveBeenCalled();
        });

        it('3.3 returns early with alreadyPaid: true if shipment is already settled', async () => {
            const ottuService = require('../src/services/ottuPayment.service');

            const alreadySettledShipment = {
                id: 'ship-ottu-settled',
                trackingNumber: 'TRK-SETTLED',
                organizationId: 'org-client-1',
                price: 50.0,
                remainingBalance: 0,
                paid: true
            };

            mockPrisma.shipment.findUnique.mockResolvedValue(alreadySettledShipment);

            const payload = {
                order_no: 'TRK-SETTLED',
                state: 'success',
                reference_number: 'DIFF-REF-999',
                amount: 50.0
            };

            const result = await ottuService.handleWebhook(payload);

            expect(result.success).toBe(true);
            expect(result.alreadyPaid).toBe(true);
            expect(mockPrisma.payment.create).not.toHaveBeenCalled();
        });

        it('3.4 rejects webhook request when signature is missing or tampered', async () => {
            const publicController = require('../src/controllers/shipment-public.controller');
            process.env.OTTU_WEBHOOK_SECRET = 'super-secret-ottu-key-2026';

            // Case A: Missing signature
            const reqMissingSig = {
                headers: {},
                body: { order_no: 'TRK-1', amount: 50 }
            };
            const resMissingSig = createMockRes();
            await publicController.handleOttuWebhook(reqMissingSig, resMissingSig);
            expect(resMissingSig.status).toHaveBeenCalledWith(401);

            // Case B: Tampered signature
            const reqTamperedSig = {
                headers: { 'x-ottu-signature': 'tampered-signature-hex' },
                body: { order_no: 'TRK-1', amount: 50 }
            };
            const resTamperedSig = createMockRes();
            await publicController.handleOttuWebhook(reqTamperedSig, resTamperedSig);
            expect(resTamperedSig.status).toHaveBeenCalledWith(401);

            // Case C: Valid HMAC signature
            const validBody = { order_no: 'TRK-1', amount: 50 };
            const validSig = crypto
                .createHmac('sha256', process.env.OTTU_WEBHOOK_SECRET)
                .update(JSON.stringify(validBody))
                .digest('hex');

            const reqValidSig = {
                headers: { 'x-ottu-signature': validSig },
                body: validBody
            };
            const resValidSig = createMockRes();
            mockPrisma.shipment.findUnique.mockResolvedValue({
                id: 'ship-1',
                trackingNumber: 'TRK-1',
                paid: true,
                remainingBalance: 0
            });

            await publicController.handleOttuWebhook(reqValidSig, resValidSig);
            expect(resValidSig.status).toHaveBeenCalledWith(200);
        });
    });

    // =========================================================================
    // 4. CONCURRENCY & ADVISORY LOCK SERIALIZATION
    // =========================================================================
    describe('4. Concurrency & Advisory Lock Serialization', () => {
        let mockPrisma;

        beforeEach(() => {
            mockPrisma = {
                organizationLedger: {
                    findFirst: jest.fn(),
                    create: jest.fn()
                },
                organization: {
                    findUnique: jest.fn(),
                    update: jest.fn()
                },
                $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }])
            };
            jest.resetModules();
            jest.doMock('../src/config/database', () => ({ prisma: mockPrisma }));
        });

        it('4.1 acquires and releases carrier_payable_ledger_lock when organizationId is null', async () => {
            const service = require('../src/services/financeLedger.service');

            mockPrisma.organizationLedger.findFirst.mockResolvedValueOnce({ balanceAfter: 200.0 });
            mockPrisma.organizationLedger.create.mockImplementation(({ data }) => Promise.resolve({
                id: 'led-carrier-1',
                ...data
            }));

            const entry = await service.createLedgerEntry(null, {
                amount: 75.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                description: 'Wholesale DHL Linehaul Accrual',
                reference: 'TRK-DHL-901'
            }, mockPrisma);

            // Check GET_LOCK execution
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
                "SELECT GET_LOCK('carrier_payable_ledger_lock', 10)"
            );
            // Check RELEASE_LOCK execution in finally block
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
                "SELECT RELEASE_LOCK('carrier_payable_ledger_lock')"
            );
            expect(entry.organizationId).toBeNull();
            expect(entry.balanceAfter).toBe(275.0);
            expect(mockPrisma.organization.update).not.toHaveBeenCalled();
        });

        it('4.2 guarantees RELEASE_LOCK is executed in finally block even when create fails with an exception', async () => {
            const service = require('../src/services/financeLedger.service');

            mockPrisma.organizationLedger.findFirst.mockResolvedValueOnce({ balanceAfter: 200.0 });
            // Simulate unexpected database write failure
            mockPrisma.organizationLedger.create.mockRejectedValueOnce(
                new Error('DB_DEADLOCK_OR_TIMEOUT')
            );

            await expect(service.createLedgerEntry(null, {
                amount: 50.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                description: 'Failing entry'
            }, mockPrisma)).rejects.toThrow('DB_DEADLOCK_OR_TIMEOUT');

            // CRITICAL: RELEASE_LOCK must be called regardless of the throw
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
                "SELECT GET_LOCK('carrier_payable_ledger_lock', 10)"
            );
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
                "SELECT RELEASE_LOCK('carrier_payable_ledger_lock')"
            );
        });

        it('4.3 serializes concurrent ledger entries ensuring running balance continuity without lost updates', async () => {
            const service = require('../src/services/financeLedger.service');

            // Let's simulate sequential serialized execution of two concurrent CARRIER_PAYABLE accruals
            // Initial state: carrier payable balance = 1000 KWD
            let currentBalance = 1000.0;
            const ledgerRecords = [];

            mockPrisma.organizationLedger.findFirst.mockImplementation(() => {
                return Promise.resolve(ledgerRecords.length > 0 ? ledgerRecords[ledgerRecords.length - 1] : { balanceAfter: currentBalance });
            });

            mockPrisma.organizationLedger.create.mockImplementation(({ data }) => {
                const rec = { id: `led-${ledgerRecords.length + 1}`, ...data };
                ledgerRecords.push(rec);
                return Promise.resolve(rec);
            });

            // Call 1: +150 KWD
            const entry1 = await service.createLedgerEntry(null, {
                amount: 150.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                description: 'Carrier 1 linehaul'
            }, mockPrisma);

            // Call 2: +250 KWD
            const entry2 = await service.createLedgerEntry(null, {
                amount: 250.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                description: 'Carrier 2 linehaul'
            }, mockPrisma);

            expect(entry1.balanceAfter).toBe(1150.0);
            expect(entry2.balanceAfter).toBe(1400.0);
            expect(ledgerRecords).toHaveLength(2);
            expect(ledgerRecords[0].balanceAfter).toBe(1150.0);
            expect(ledgerRecords[1].balanceAfter).toBe(1400.0);
        });

        it('4.4 dedupes duplicate ledger entries with identical (sourceRepo, sourceId, category)', async () => {
            const service = require('../src/services/financeLedger.service');

            const existingEntry = {
                id: 'led-existing-1',
                organizationId: null,
                amount: 80.0,
                balanceAfter: 1080.0,
                sourceRepo: 'Shipment',
                sourceId: 'ship-dup-1',
                category: 'CARRIER_PAYABLE'
            };

            mockPrisma.organizationLedger.findFirst.mockResolvedValueOnce(existingEntry);

            const duplicateCallResult = await service.createLedgerEntry(null, {
                amount: 80.0,
                currency: 'KWD',
                entryType: 'CREDIT',
                category: 'CARRIER_PAYABLE',
                sourceRepo: 'Shipment',
                sourceId: 'ship-dup-1'
            }, mockPrisma);

            expect(duplicateCallResult.id).toBe('led-existing-1');
            expect(duplicateCallResult.balanceAfter).toBe(1080.0);
            expect(mockPrisma.organizationLedger.create).not.toHaveBeenCalled();
        });
    });
});
