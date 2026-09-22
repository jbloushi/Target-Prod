const { buildShipmentNotificationContext, buildPlainContent, getNotificationTargets } = require('../src/services/chatwootNotificationService');
const publicController = require('../src/controllers/shipment-public.controller');
const { prisma } = require('../src/config/database');

describe('Public Checkout and Pay-by-Link Notifications', () => {
    const mockShipment = {
        id: 'ship-pay-123',
        trackingNumber: 'TRG-TESTPAY01',
        status: 'received_at_hub',
        carrierCode: 'OTE',
        price: 15.500,
        remainingBalance: 15.500,
        currency: 'KWD',
        paid: false,
        origin: {
            city: 'Kuwait City',
            country: 'Kuwait',
            contactPerson: 'Ali Merchant',
            phone: '+96590001111'
        },
        destination: {
            city: 'Riyadh',
            country: 'Saudi Arabia',
            contactPerson: 'Fahad Consignee',
            phone: '+96650002222'
        },
        parcels: [
            { weight: 2.5, dimensions: { length: 25, width: 20, height: 15 } }
        ],
        history: []
    };

    it('builds payment notification context with public pay link and formatted amount', () => {
        const context = buildShipmentNotificationContext(mockShipment);
        expect(context.publicPaymentLink).toContain('/pay/TRG-TESTPAY01');
        expect(context.amountDue).toBe('15.500 KWD');
        expect(context.trackingNumber).toBe('TRG-TESTPAY01');
    });

    it('formats payment_link_ready WhatsApp message with pay-by-link', () => {
        const context = buildShipmentNotificationContext(mockShipment);
        const target = { role: 'sender', name: 'Ali Merchant', phone: '+96590001111' };
        const content = buildPlainContent('payment_link_ready', context, target);

        expect(content).toContain('Target Logistics - Payment Request');
        expect(content).toContain('15.500 KWD');
        expect(content).toContain(context.publicPaymentLink);
        expect(content).toContain('K-Net / Card / Apple Pay');
    });

    it('formats payment_confirmed WhatsApp message upon successful settlement', () => {
        const context = buildShipmentNotificationContext(mockShipment);
        const target = { role: 'sender', name: 'Ali Merchant', phone: '+96590001111' };
        const content = buildPlainContent('payment_confirmed', context, target);

        expect(content).toContain('Target Logistics - Payment Confirmed');
        expect(content).toContain('15.500 KWD');
        expect(content).toContain('Payment received & verified online');
    });

    it('retrieves public checkout details via getPublicCheckout', async () => {
        prisma.shipment.findUnique = jest.fn().mockResolvedValue(mockShipment);

        const req = { params: { trackingNumber: 'TRG-TESTPAY01' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await publicController.getPublicCheckout(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: expect.objectContaining({
                trackingNumber: 'TRG-TESTPAY01',
                amount: 15.500,
                currency: 'KWD',
                paid: false,
                parcelsCount: 1,
                totalWeight: 2.5
            })
        }));
    });
});
