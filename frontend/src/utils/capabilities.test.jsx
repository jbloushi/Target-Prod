import { describe, expect, it } from 'vitest';
import { CAPABILITIES, hasCapability } from './capabilities';

describe('frontend RBAC capabilities', () => {
  it('allows finance and carrier booking controls for platform accounting roles', () => {
    expect(hasCapability('accounting', CAPABILITIES.VIEW_FINANCE)).toBe(true);
    expect(hasCapability('accounting', CAPABILITIES.BOOK_CARRIERS)).toBe(true);
  });

  it('keeps client users scoped to shipment creation and own shipment views', () => {
    expect(hasCapability('client', CAPABILITIES.CREATE_SHIPMENTS)).toBe(true);
    expect(hasCapability('client', CAPABILITIES.VIEW_OWN_SHIPMENTS)).toBe(true);
    expect(hasCapability('client', CAPABILITIES.VIEW_ALL_SHIPMENTS)).toBe(false);
    expect(hasCapability('client', CAPABILITIES.MANAGE_CARRIERS)).toBe(false);
  });
});
