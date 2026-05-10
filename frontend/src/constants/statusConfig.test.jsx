import { describe, expect, it } from 'vitest';
import {
  INTERNAL_SHIPMENT_STATUSES,
  getPublicStepIndex,
  getStepIndex,
  normalizeStatus,
} from './statusConfig';

describe('statusConfig', () => {
  it('normalizes legacy and unknown carrier statuses into platform statuses', () => {
    expect(normalizeStatus('created')).toBe('booked');
    expect(normalizeStatus('pickup scheduled')).toBe('booked');
    expect(normalizeStatus('carrier-specific-in-flight')).toBe('in_transit');
  });

  it('keeps internal shipment status options predefined and operational', () => {
    expect(INTERNAL_SHIPMENT_STATUSES).toEqual([
      'draft',
      'pending',
      'booked',
      'ready_for_pickup',
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'exception',
      'cancelled',
    ]);
  });

  it('calculates internal and public tracking step positions', () => {
    expect(getStepIndex('out_for_delivery')).toBeGreaterThan(getStepIndex('booked'));
    expect(getPublicStepIndex('pending')).toBe(0);
    expect(getPublicStepIndex('delivered')).toBe(4);
  });
});
