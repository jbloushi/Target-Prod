const {
    normalizeStatus,
    getCarrierEventClassification,
    selectEffectiveCarrierStatus
} = require('../src/constants/statusConstants');

describe('carrier status normalization', () => {
    test.each([
        ['Delivered - Shipment charges paid', 'delivered'],
        ['Proof of delivery signed by consignee', 'delivered'],
        ['Returned to shipper', 'returned'],
        ['Shipment is on hold awaiting payment', 'exception'],
        ['Held for pickup - ready for customer pickup', 'exception'],
    ])('%s maps to %s', (description, expected) => {
        expect(normalizeStatus(description)).toBe(expected);
    });

    test('payment and delivery instructions are informational', () => {
        expect(getCarrierEventClassification({
            statusCode: 'transit',
            description: 'Payment is received and recorded for shipment related fees'
        })).toMatchObject({ normalizedStatus: null, flags: ['payment_confirmed'] });
    });

    test('a later informational event does not replace delivery', () => {
        const result = selectEffectiveCarrierStatus([
            { timestamp: '2026-10-06T10:00:00Z', statusCode: 'delivered', description: 'Delivered' },
            { timestamp: '2026-10-06T11:00:00Z', statusCode: 'transit', description: 'Payment is received' }
        ]);
        expect(result.normalizedStatus).toBe('delivered');
        expect(result.flags).toContain('payment_confirmed');
    });

    test('hold scenario remains exception and never becomes in_transit', () => {
        const result = selectEffectiveCarrierStatus([
            { timestamp: '2026-10-06T12:00:00Z', statusCode: 'failure', description: 'Shipment is on hold awaiting payment' }
        ]);
        expect(result.normalizedStatus).toBe('exception');
        expect(result.flags).toContain('operational_hold');
    });
});
