const {
    assertRequestedAccessAllowed,
    getAssignedShippingAccess,
    getServiceOptions,
    normalizeShippingAccess
} = require('../src/services/shippingAccess.service');

describe('shipping access policy', () => {
    it('normalizes manual access into a single manual shipment option', () => {
        expect(normalizeShippingAccess({ mode: 'manual' })).toEqual({
            mode: 'manual',
            carrierCode: 'MANUAL',
            serviceCode: null,
            serviceName: 'Manual Shipment'
        });
    });

    it('derives one assigned carrier/service from user creation policy', () => {
        const access = getAssignedShippingAccess({
            agentPolicy: {
                shippingAccess: {
                    carrierCode: 'DGR',
                    serviceCode: 'Y'
                }
            }
        });

        expect(access).toMatchObject({
            mode: 'carrier',
            carrierCode: 'DGR',
            serviceCode: 'Y',
            serviceName: 'DHL Express 12:00'
        });
    });

    it('does not require clients to send carrier or service when assigned', () => {
        const assigned = normalizeShippingAccess({ carrierCode: 'DGR', serviceCode: 'P' });

        expect(() => assertRequestedAccessAllowed(assigned, {})).not.toThrow();
    });

    it('rejects carrier and service values outside the assigned account policy', () => {
        const assigned = normalizeShippingAccess({ carrierCode: 'DGR', serviceCode: 'P' });

        expect(() => assertRequestedAccessAllowed(assigned, { carrierCode: 'FEDEX' })).toThrow(/not allowed/i);
        expect(() => assertRequestedAccessAllowed(assigned, { serviceCode: 'Y' })).toThrow(/not allowed/i);
    });

    it('rejects service codes for manual shipments', () => {
        const assigned = normalizeShippingAccess({ carrierCode: 'MANUAL' });

        expect(() => assertRequestedAccessAllowed(assigned, { serviceCode: 'P' })).toThrow(/does not allow/i);
    });

    it('exposes service options for carrier and manual accounts', () => {
        expect(getServiceOptions('DGR')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ serviceCode: 'P', serviceName: 'DHL Express Worldwide' })
            ])
        );
        expect(getServiceOptions('MANUAL')).toEqual([
            { serviceCode: null, serviceName: 'Manual Shipment' }
        ]);
    });
});
