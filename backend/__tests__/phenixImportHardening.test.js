const phenixSyncService = require('../src/services/phenixSync.service');

describe('Phenix import hardening', () => {
    test('keeps the explicit Phenix country and records phone-country conflicts', () => {
        const signals = phenixSyncService.resolveDestinationSignals('KSA', '+96891234567');

        expect(signals.resolved).toEqual({ code: 'SA', name: 'Saudi Arabia' });
        expect(signals.phoneCountry).toEqual({ code: 'OM', name: 'Oman' });
        expect(signals.conflict).toBe(true);
    });

    test('uses phone country only when Phenix has no country signal', () => {
        const signals = phenixSyncService.resolveDestinationSignals('', '+96891234567');

        expect(signals.resolved).toEqual({ code: 'OM', name: 'Oman' });
        expect(signals.conflict).toBe(false);
    });

    test('generates a stable source key for the same Phenix bill', () => {
        const first = phenixSyncService.sourceKeyForRow({}, { billId: '45973', carrierTracking: '38290311684', receiptNo: '653112' });
        const second = phenixSyncService.sourceKeyForRow({}, { billId: '45973', carrierTracking: 'different', receiptNo: 'different' });

        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });

    test('extracts weightKg (Mat_Amount), costPrice (bill_detailCustomField_11), markupAmount, customsFee, and operational fields', () => {
        const validated = phenixSyncService.validatePhenixRow({
            bill_id: '46663',
            Receipt_no: '656009',
            bill_detailCustomField_1: '5864966450',
            Cost_Center: 'DHL - Oct',
            Client: 'Maram',
            client_id: '362',
            billCustomField_1: '96594440199',
            bill_detailCustomField_3: 'naser rashed',
            bill_detailCustomField_4: '971502789486',
            Mcolor: 'UAE',
            Mat_Amount: 12,
            Sale_price: 3.933,
            Total: 47.2,
            payment: 47.2,
            bill_detailCustomField_11: 37.856,
            bill_detailCustomField_12: 4,
            Payment_method: 'نقداً',
            Type: 'مبيعات الشحن',
            Item: 'شحن اكسبرس',
            Employee: 'الاستقبال',
            User: 'Mustafa',
            Branch: 'الفرع الرئيسي',
            Date: '15/10/2026'
        });

        expect(validated.isComplete).toBe(true);
        expect(validated.weightKg).toBe(12);
        expect(validated.unitPrice).toBe(3.933);
        expect(validated.totalAmount).toBe(47.2);
        expect(validated.paidAmount).toBe(47.2);
        expect(validated.costPrice).toBe(37.856);
        expect(validated.customsFee).toBe(4);
        expect(validated.markupAmount).toBe(9.344);
        expect(validated.billType).toBe('مبيعات الشحن');
        expect(validated.itemDescription).toBe('شحن اكسبرس');
        expect(validated.employee).toBe('الاستقبال');
        expect(validated.phenixUser).toBe('Mustafa');
        expect(validated.branch).toBe('الفرع الرئيسي');
    });

    test('acquireLease reclaims legacy oversized 2-hour lease or dead-PID lease after PM2 reload', async () => {
        const os = require('os');
        const { prisma } = require('../src/config/database');
        const { acquireLease } = require('../src/services/phenixImportRun.service');

        const createSpy = jest.spyOn(prisma.phenixImportLease, 'create').mockRejectedValueOnce(new Error('Unique constraint failed'));
        const findSpy = jest.spyOn(prisma.phenixImportLease, 'findUnique').mockResolvedValueOnce({
            lockKey: 'phenix-auto-sync',
            ownerId: `${os.hostname()}:99999999:dead-worker`,
            lockedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000)
        });
        const updateSpy = jest.spyOn(prisma.phenixImportLease, 'updateMany').mockResolvedValueOnce({ count: 1 });

        const lease = await acquireLease('phenix-auto-sync');
        expect(lease.acquired).toBe(true);
        expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                lockKey: 'phenix-auto-sync',
                OR: expect.arrayContaining([
                    { ownerId: `${os.hostname()}:99999999:dead-worker` }
                ])
            })
        }));

        createSpy.mockRestore();
        findSpy.mockRestore();
        updateSpy.mockRestore();
    });
});

