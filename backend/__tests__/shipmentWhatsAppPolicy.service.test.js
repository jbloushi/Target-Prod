const policy = require('../src/services/shipmentWhatsAppPolicy.service');

describe('shipment WhatsApp dispatch policy', () => {
    test.each(['delivered', 'completed', 'cancelled', 'returned', 'Successfully Delivered']) (
        'blocks a %s shipment', status => {
            expect(policy.terminalBlock({ status })).toEqual(expect.objectContaining({
                code: 'SHIPMENT_TERMINAL'
            }));
        }
    );

    test('allows an in-transit shipment', () => {
        expect(policy.terminalBlock({ status: 'in_transit' })).toBeNull();
    });

    test.each([
        ['shipment_created', 'shipment_confirmation_2', 'sender', null],
        ['payment_link_ready', 'payment_request_v1', 'receiver', null],
        ['location_request', 'location_request_v1', 'receiver', null],
        ['return_portal', 'return_portal_v1', 'receiver', null],
        ['customer_engagement', 'customer_inquiry_start', 'receiver', null],
        ['delivered', 'shipment_confirmation_2', 'sender', 'UNAPPROVED_MANUAL_ACTION'],
        ['location_request', 'location_request_v1', 'sender', 'UNAPPROVED_MANUAL_ACTION'],
        ['return_portal', 'shipment_confirmation_2', 'receiver', 'UNAPPROVED_MANUAL_ACTION']
    ])('validates event/template/recipient: %s / %s / %s', (eventType, templateName, recipientRole, expectedCode) => {
        expect(policy.validateManualAction({ eventType, templateName, recipientRole })?.code || null).toBe(expectedCode);
    });

    test('treats provider acceptance and queued work as separate states', () => {
        expect(policy.isProviderAccepted('submitted')).toBe(true);
        expect(policy.isProviderAccepted('delivered')).toBe(true);
        expect(policy.isProviderAccepted('queued')).toBe(false);
        expect(policy.isInFlight('queued')).toBe(true);
        expect(policy.isInFlight('failed')).toBe(false);
    });

    test('creates a stable, recipient-specific dispatch key without storing the phone', () => {
        const action = {
            shipment: { id: 'shipment-1' },
            eventType: 'location_request',
            templateName: 'location_request_v1',
            recipientRole: 'receiver'
        };
        const first = policy.buildDispatchKey({ ...action, recipientPhone: '+974 5512 3456' });
        const sameNumber = policy.buildDispatchKey({ ...action, recipientPhone: '97455123456' });
        const otherRecipient = policy.buildDispatchKey({ ...action, recipientPhone: '+97455123457' });

        expect(first).toMatch(/^[a-f0-9]{64}$/);
        expect(sameNumber).toBe(first);
        expect(otherRecipient).not.toBe(first);
        expect(first).not.toContain('97455123456');
        expect(policy.buildDispatchKey({ ...action, eventType: 'auth_otp', templateName: 'otptargetlogin', recipientPhone: '+97455123456' })).toBeNull();
    });
});
