const DgrAdapter = require('../src/adapters/DgrAdapter');

describe('DgrAdapter tracking timestamp extraction', () => {
  it('keeps a carrier-local timestamp with offset and normalizes it for sorting', () => {
    const out = DgrAdapter.extractTrackingTimestamp({
      eventDate: '2026-04-30',
      eventTime: '10:14:00',
      gmtOffset: '+04:00'
    });

    expect(out.localTimestamp).toBe('2026-04-30T10:14:00+04:00');
    expect(out.timestamp).toBe('2026-04-30T06:14:00.000Z');
    expect(out.timezoneOffset).toBe('+04:00');
  });

  it('falls back to DHL timestamp while preserving the original display value', () => {
    const out = DgrAdapter.extractTrackingTimestamp({
      timestamp: '2026-04-27T22:00:00+03:00'
    });

    expect(out.localTimestamp).toBe('2026-04-27T22:00:00+03:00');
    expect(out.timestamp).toBe('2026-04-27T19:00:00.000Z');
  });
});
