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

  it('reserves system settings management for the superadmin role', () => {
    expect(hasCapability('admin', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(true);
    expect(hasCapability('manager', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(false);
    expect(hasCapability('staff', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(false);
    expect(hasCapability('client', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(false);
  });

  it('restricts VIEW_COST_DATA to admin and accounting only', () => {
    expect(hasCapability('admin', CAPABILITIES.VIEW_COST_DATA)).toBe(true);
    expect(hasCapability('accounting', CAPABILITIES.VIEW_COST_DATA)).toBe(true);
    expect(hasCapability('manager', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
    expect(hasCapability('staff', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
    expect(hasCapability('client', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
  });

  it('removes all finance capabilities from staff role', () => {
    expect(hasCapability('staff', CAPABILITIES.VIEW_FINANCE)).toBe(false);
    expect(hasCapability('staff', CAPABILITIES.VIEW_INVOICES)).toBe(false);
    expect(hasCapability('staff', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
    expect(hasCapability('staff', CAPABILITIES.VIEW_ALL_SHIPMENTS)).toBe(true);
  });

  it('keeps finance access for manager but denies VIEW_COST_DATA', () => {
    expect(hasCapability('manager', CAPABILITIES.VIEW_FINANCE)).toBe(true);
    expect(hasCapability('manager', CAPABILITIES.VIEW_INVOICES)).toBe(true);
    expect(hasCapability('manager', CAPABILITIES.VIEW_COST_DATA)).toBe(false);
  });
});
