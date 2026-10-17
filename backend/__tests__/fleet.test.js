const fleetService = require('../src/services/fleet.service');
const { prisma } = require('../src/config/database');
const generalLedgerService = require('../src/services/generalLedger.service');

jest.mock('../src/config/database', () => ({
    prisma: {
        shipment: {
            findFirst: jest.fn(),
            update: jest.fn()
        },
        deliveryRun: {
            findUnique: jest.fn(),
            update: jest.fn()
        }
    }
}));

jest.mock('../src/services/chatwootNotificationService', () => ({
    triggerShipmentNotification: jest.fn()
}));

jest.mock('../src/services/generalLedger.service', () => ({
    postJournalEntry: jest.fn(),
    postDriverCodCollectionEntry: jest.fn()
}));

describe('fleet.service - COD Fiduciary Lifecycle (F13 & F14)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('completeDeliveryStop (F13)', () => {
        it('posts Dr 1020 / Cr 2100 journal entry when driver collects COD amount', async () => {
            const shipment = {
                id: 'ship-101',
                trackingNumber: 'TRK-101',
                organizationId: 'org-merchant-1',
                currency: 'KWD',
                codAmount: 50.0,
                codStatus: 'pending',
                assignedDriverId: 'driver-9',
                history: []
            };

            prisma.shipment.findFirst.mockResolvedValue(shipment);
            prisma.shipment.update.mockResolvedValue({
                ...shipment,
                status: 'delivered',
                codStatus: 'COLLECTED'
            });

            const result = await fleetService.completeDeliveryStop({
                shipmentId: 'ship-101',
                driverId: 'driver-9',
                collectedCodAmount: 50.0,
                recipientName: 'Ali Ahmed'
            });

            expect(result.status).toBe('delivered');
            expect(prisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'ship-101' },
                data: expect.objectContaining({
                    codStatus: 'COLLECTED'
                })
            }));

            expect(generalLedgerService.postDriverCodCollectionEntry).toHaveBeenCalledWith({
                shipmentId: 'ship-101',
                trackingNumber: 'TRK-101',
                organizationId: 'org-merchant-1',
                codAmount: 50.0,
                currency: 'KWD',
                driverId: 'driver-9',
                createdById: 'driver-9'
            });
        });

        it('does not post GL entry when shipment has no COD amount', async () => {
            const shipment = {
                id: 'ship-102',
                trackingNumber: 'TRK-102',
                organizationId: 'org-merchant-1',
                currency: 'KWD',
                codAmount: 0,
                history: []
            };

            prisma.shipment.findFirst.mockResolvedValue(shipment);
            prisma.shipment.update.mockResolvedValue({
                ...shipment,
                status: 'delivered'
            });

            await fleetService.completeDeliveryStop({
                shipmentId: 'ship-102',
                driverId: 'driver-9',
                collectedCodAmount: 0,
                recipientName: 'Bader'
            });

            expect(generalLedgerService.postDriverCodCollectionEntry).not.toHaveBeenCalled();
        });
    });

    describe('settleDeliveryRunCod (F14)', () => {
        it('posts remittance journal entry to Hub Vault Safe (Account 1030) rather than 1010', async () => {
            const run = {
                id: 'run-1',
                runNumber: 'RUN-20261017-001',
                totalCodCollected: 125.0,
                driver: { name: 'Mustafa Courier' }
            };

            prisma.deliveryRun.findUnique.mockResolvedValue(run);
            prisma.deliveryRun.update.mockResolvedValue({
                ...run,
                codSettled: true,
                codSettledAt: new Date()
            });

            await fleetService.settleDeliveryRunCod({
                runId: 'run-1',
                cashierUser: { id: 'cashier-10' }
            });

            expect(generalLedgerService.postJournalEntry).toHaveBeenCalledWith(expect.objectContaining({
                entryNumber: 'REMIT-RUN-20261017-001',
                createdById: 'cashier-10',
                lines: expect.arrayContaining([
                    expect.objectContaining({
                        accountCode: '1030', // Hub Vault Safe (F14 fix)
                        debit: 125.0,
                        credit: 0
                    }),
                    expect.objectContaining({
                        accountCode: '1020', // Cash in Transit - Driver COD
                        debit: 0,
                        credit: 125.0
                    })
                ])
            }));
        });
    });
});
