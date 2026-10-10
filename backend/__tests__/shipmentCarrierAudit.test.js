const {
    auditShipmentRecord,
    buildAuditWhere,
    countryFromPhone
} = require('../src/services/shipmentCarrierAudit.service');
const fs = require('fs');
const path = require('path');

const baseShipment = {
    id: 'shipment-1',
    trackingNumber: 'TRK-38290311684',
    dhlTrackingNumber: '38290311684',
    carrierCode: 'ARAMEX',
    status: 'in_transit',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    destination: { countryCode: 'SA', country: 'Saudi Arabia', phone: '+96899112233' },
    documents: { destCountryCode: 'SA' },
    history: [],
    pricingSnapshot: {}
};

describe('multi-carrier shipment audit', () => {
    test('keeps the production audit CLI strictly read-only', () => {
        const script = fs.readFileSync(path.join(__dirname, '../scripts/audit-carrier-shipments.js'), 'utf8');
        expect(script).not.toContain('prisma.shipment.update');
        expect(script).not.toContain("arg === '--apply'");
        expect(script).not.toContain('syncCarrierTrackingHistory');
    });

    test('scopes all supported carriers to 60 recent days plus older non-terminal shipments', () => {
        const now = new Date('2026-10-10T00:00:00.000Z');
        expect(buildAuditWhere({ now, days: 60 })).toEqual({
            carrierCode: { in: ['DGR', 'FEDEX', 'ARAMEX', 'OTE', 'ARM', 'DHL', 'FDX', 'LOGESTECHS'] },
            OR: [
                { createdAt: { gte: new Date('2026-08-11T00:00:00.000Z') } },
                { status: { notIn: ['delivered', 'completed', 'cancelled', 'canceled', 'returned'] } }
            ]
        });
    });

    test('normalizes carrier aliases when filtering a single carrier', () => {
        expect(buildAuditWhere({ carrierCode: 'DHL' }).carrierCode).toEqual({ in: ['DGR', 'DHL'] });
        expect(buildAuditWhere({ carrierCode: 'ARM' }).carrierCode).toEqual({ in: ['ARAMEX', 'ARM'] });
    });

    test('flags the reported Saudi Arabia versus Aramex Oman mismatch', () => {
        const result = auditShipmentRecord(baseShipment, {
            carrierRecord: { destinationCountryCode: 'OM' }
        });
        expect(result).toMatchObject({
            carrierCode: 'ARAMEX', awb: '38290311684', platformCountry: 'SA',
            phenixCountry: 'SA', phoneCountry: 'OM', carrierCountry: 'OM',
            hasDiscrepancy: true
        });
        expect(result.discrepancies).toEqual(expect.arrayContaining(['destination_country', 'internal_destination_signals']));
    });

    test('captures carrier status, history, weight, piece, and ETA discrepancies', () => {
        const shipment = {
            ...baseShipment,
            carrierCode: 'DGR',
            status: 'picked_up',
            destination: { countryCode: 'AE' },
            documents: {},
            estimatedDelivery: '2026-10-13T10:00:00.000Z',
            pricingSnapshot: { carrierWeight: 2, carrierPieces: 1 },
            history: [{
                source: 'carrier', status: 'picked_up', description: 'Collected',
                location: { formattedAddress: 'Kuwait' }, timestamp: '2026-10-10T08:00:00.000Z'
            }]
        };
        const result = auditShipmentRecord(shipment, {
            liveTracking: {
                status: 'in_transit', carrierWeight: 2.5, carrierPieces: 2,
                estimatedDelivery: '2026-10-14T10:00:00.000Z',
                events: [{ statusCode: 'in_transit', description: 'Departed facility', location: 'Dubai', timestamp: '2026-10-11T08:00:00.000Z' }]
            }
        });
        expect(result.discrepancies).toEqual(expect.arrayContaining([
            'status', 'missing_tracking_events', 'platform_only_tracking_events',
            'carrier_weight', 'carrier_pieces', 'estimated_delivery'
        ]));
        expect(result).toMatchObject({ platformEventCount: 1, carrierEventCount: 1, hasDiscrepancy: true });
    });

    test('compares carrier booking party, route, service, and reference details when exported', () => {
        const shipment = {
            ...baseShipment,
            serviceCode: 'P',
            reference: 'ORDER-1',
            origin: { countryCode: 'KW', city: 'Kuwait City' },
            destination: {
                countryCode: 'OM', city: 'Muscat', postalCode: '100',
                contactPerson: 'Ali Customer', phone: '+96899112233', streetLines: ['Building 1', 'Street 2']
            }
        };
        const result = auditShipmentRecord(shipment, {
            carrierRecord: {
                destinationCountryCode: 'OM', serviceCode: 'EXP', reference: 'ORDER-2',
                originCountryCode: 'KW', originCity: 'Shuwaikh', destinationCity: 'Salalah',
                destinationPostalCode: '211', recipientName: 'Different Customer',
                recipientPhone: '+96890000000', destinationAddress: 'Building 9 Street 10'
            }
        });
        expect(result.discrepancies).toEqual(expect.arrayContaining([
            'service_code', 'recipient_name', 'recipient_phone', 'destination_city',
            'destination_postal_code', 'destination_address', 'origin_city', 'shipper_reference'
        ]));
        expect(result.discrepancies).not.toContain('origin_country');
    });

    test('does not use phone prefixes as authoritative carrier data', () => {
        const result = auditShipmentRecord(baseShipment);
        expect(countryFromPhone('0096899112233')).toBe('OM');
        expect(result.carrierCountry).toBeNull();
        expect(result.discrepancies).not.toContain('destination_country');
        expect(result.discrepancies).toContain('internal_destination_signals');
    });
});
