const { buildDisplayHistory, normalizeLocationLabel } = require('../src/controllers/shipment.helpers');

describe('buildDisplayHistory', () => {
  it('collapses repeated pickup events in same day/location', () => {
    const events = [
      { status: 'Shipment picked up', description: 'Shipment picked up', location: 'Kuwait-KW', timestamp: '2026-05-01T10:00:00Z' },
      { status: 'Shipment picked up', description: 'Shipment picked up', location: 'KUWAIT-KUWAIT', timestamp: '2026-05-01T10:05:00Z' },
      { status: 'Shipment picked up', description: 'Shipment picked up', location: 'Kuwait-KW', timestamp: '2026-05-01T10:10:00Z' }
    ];
    const out = buildDisplayHistory(events);
    expect(out).toHaveLength(1);
    expect(out[0].canonicalStatus).toBe('pickup');
    expect(out[0].normalizedLocation).toBe('KUWAIT-KW');
    expect(out[0].collapsedCount).toBe(3);
  });

  it('normalizes Kuwait/AUH/Dubai labels', () => {
    expect(normalizeLocationLabel('KUWAIT-KUWAIT')).toBe('KUWAIT-KW');
    expect(normalizeLocationLabel('Abu Dhabi-UNITED ARAB EMIRATES')).toBe('ABU DHABI-AE');
    expect(normalizeLocationLabel('Dubai-AE')).toBe('DUBAI-AE');
  });

  it('collapses customs/hold to max once per day/location/status and preserves chronological order', () => {
    const events = [
      { status: 'Shipment is on hold', description: 'Shipment is on hold', location: 'Kuwait-KW', timestamp: '2026-05-01T09:00:00Z' },
      { status: 'Shipment is on hold', description: 'Shipment is on hold', location: 'KUWAIT-KUWAIT', timestamp: '2026-05-01T12:00:00Z' },
      { status: 'Customs clearance status updated', description: 'Customs clearance status updated. Note', location: 'Cincinnati Hub-US', timestamp: '2026-05-01T13:00:00Z' },
      { status: 'Customs clearance status updated', description: 'Customs clearance status updated. Note', location: 'CINCINNATI HUB - Ohio - USA', timestamp: '2026-05-01T14:00:00Z' },
      { status: 'Processed at ABU DHABI-UNITED ARAB EMIRATES', description: 'Processed at ABU DHABI-UNITED ARAB EMIRATES', location: 'ABU DHABI-UNITED ARAB EMIRATES', timestamp: '2026-05-02T10:14:00Z' }
    ];
    const out = buildDisplayHistory(events);
    expect(out.map(e => e.canonicalStatus)).toEqual(['hold', 'customs_update', 'processed']);
    expect(out[0].collapsedCount).toBe(2);
    expect(out[1].collapsedCount).toBe(2);
    expect(new Date(out[0].timestamp).getTime()).toBeLessThan(new Date(out[1].timestamp).getTime());
  });
});
