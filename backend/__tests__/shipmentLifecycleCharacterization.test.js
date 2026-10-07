/**
 * Ticket 01: production-safety characterization baseline.
 *
 * These tests describe behavior that must survive the lifecycle refactor. They
 * intentionally exercise the current seams rather than introducing a new
 * lifecycle abstraction in this ticket.
 */

const {
    SHIPMENT_STATUSES,
    STATUS_LABELS,
    normalizeStatus,
    isStatusAhead
} = require('../src/constants/statusConstants');
const { normalizeShipment } = require('../src/utils/shipmentNormalizer');
const { buildDisplayHistory } = require('../src/controllers/shipment.helpers');

describe('shipment lifecycle characterization baseline', () => {
    it('keeps a client-shaped submission carrier-agnostic and normalizes it for downstream adapters', () => {
        const normalized = normalizeShipment({
            origin: {
                contactName: 'Sender',
                countryCode: 'kw',
                city: 'Kuwait City',
                address: 'Origin address'
            },
            destination: {
                contactName: 'Receiver',
                countryCode: 'ae',
                city: 'Dubai',
                address: 'Destination address'
            },
            parcels: [{ weight: 2, length: 20, width: 10, height: 5 }],
            items: [{ description: 'Documents', quantity: 1, weight: 0.5 }]
        });

        expect(normalized.sender.countryCode).toBe('KW');
        expect(normalized.receiver.countryCode).toBe('AE');
        expect(normalized.packages).toEqual([
            expect.objectContaining({
                weight: { value: 2, unit: 'kg' },
                dimensions: { length: 20, width: 10, height: 5, unit: 'cm' }
            })
        ]);
        expect(normalized.carrierCode).toBeUndefined();
        expect(normalized.serviceCode).toBeUndefined();
    });

    it('keeps the operational lifecycle statuses and presentation labels aligned', () => {
        const lifecycle = [
            'ready_for_pickup',
            'picked_up',
            'received_at_hub',
            'verified',
            'booked',
            'in_transit',
            'out_for_delivery',
            'delivered'
        ];

        for (const status of lifecycle) {
            expect(SHIPMENT_STATUSES).toContain(status);
            expect(STATUS_LABELS[status]).toEqual(expect.any(String));
            expect(normalizeStatus(status)).toBe(status);
        }

        expect(normalizeStatus('DELIVERED_TO_RECIPIENT')).toBe('delivered');
        expect(normalizeStatus('Shipment picked up')).toBe('picked_up');
        expect(isStatusAhead('ready_for_pickup', 'picked_up')).toBe(true);
        expect(isStatusAhead('in_transit', 'exception')).toBe(false);
    });

    it('preserves internal milestones and provider provenance in the detail timeline', () => {
        const history = buildDisplayHistory([
            {
                status: 'created',
                description: 'Shipment Created',
                source: 'system',
                location: 'Kuwait City, Kuwait',
                timestamp: '2026-05-09T08:00:00Z'
            },
            {
                status: 'ready_for_pickup',
                description: 'Awaiting Internal Processing',
                source: 'system',
                location: 'Kuwait City, Kuwait',
                timestamp: '2026-05-09T08:05:00Z'
            },
            {
                status: 'Shipment has departed from a DHL facility KUWAIT-KUWAIT',
                description: 'Departed origin',
                source: 'carrier',
                location: 'Kuwait-KW',
                timestamp: '2026-05-09T10:00:00Z'
            }
        ], { originLocation: 'Kuwait City, Kuwait' });

        expect(history.map((event) => event.canonicalStatus)).toEqual([
            'created',
            'ready_for_pickup',
            'departed_facility'
        ]);
        expect(history[0].description).toBe('Shipment Created');
        expect(history[2].source).toBe('carrier');
    });

    it('does not erase prior lifecycle records when a carrier conversion event is added', () => {
        const history = buildDisplayHistory([
            {
                status: 'created',
                description: 'Shipment Created',
                location: 'Kuwait City, Kuwait',
                timestamp: '2026-05-09T08:00:00Z'
            },
            {
                status: 'ready_for_pickup',
                description: 'Awaiting Internal Processing',
                location: 'Kuwait City, Kuwait',
                timestamp: '2026-05-09T08:05:00Z'
            },
            {
                status: 'ready_for_pickup',
                description: 'Carrier changed from INTERNAL to DGR',
                location: 'Kuwait City, Kuwait',
                timestamp: '2026-05-09T08:15:00Z'
            }
        ], { originLocation: 'Kuwait City, Kuwait' });

        expect(history).toHaveLength(3);
        expect(history.map((event) => event.description)).toEqual([
            'Shipment Created',
            'Awaiting Internal Processing',
            'Carrier changed from INTERNAL to DGR'
        ]);
    });
});
