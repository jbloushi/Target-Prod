import { describe, expect, it } from 'vitest';
import { getTabs, DEFAULT_WHATSAPP_RULES, EVENT_METRIC_CONFIG } from './SettingsPage';

const privilegedTabs = ['fleet', 'ratecards', 'phenix', 'whatsapp', 'notifications', 'routing'];

describe('SettingsPage navigation', () => {
  it('hides operational system settings from client accounts', () => {
    const tabIds = getTabs('en', false).map((tab) => tab.id);

    expect(tabIds).toEqual(['profile', 'addresses', 'api', 'security']);
    expect(tabIds).not.toEqual(expect.arrayContaining(privilegedTabs));
  });

  it('shows operational system settings to the superadmin', () => {
    const tabIds = getTabs('en', true).map((tab) => tab.id);

    expect(tabIds).toEqual(expect.arrayContaining(privilegedTabs));
  });

  it('provides the dedicated whatsapp tab under privileged superadmin tabs', () => {
    const tabIds = getTabs('en', true).map((tab) => tab.id);
    expect(tabIds).toContain('whatsapp');
  });
});

describe('SettingsPage WhatsApp & Milestone Event Configuration', () => {
  it('defines the required milestone events in DEFAULT_WHATSAPP_RULES', () => {
    const eventTypes = DEFAULT_WHATSAPP_RULES.map((r) => r.eventType);
    const expectedEvents = [
      'out_for_delivery',
      'delivered',
      'on_hold_customs_issue',
      'payment_link_ready',
      'shipment_created'
    ];

    expectedEvents.forEach((event) => {
      expect(eventTypes).toContain(event);
    });
  });

  it('supports granular recipient roles (consignee/receiver and shipper/sender)', () => {
    const roles = new Set(DEFAULT_WHATSAPP_RULES.map((r) => r.recipientRole));
    expect(roles).toContain('receiver');
    expect(roles).toContain('sender');
  });

  it('sets quiet-hours bypass flag for critical customs exceptions', () => {
    const customsRules = DEFAULT_WHATSAPP_RULES.filter(
      (r) => r.eventType === 'on_hold_customs_issue'
    );
    expect(customsRules.length).toBeGreaterThan(0);
    customsRules.forEach((rule) => {
      expect(rule.allowQuietHoursBypass).toBe(true);
    });
  });

  it('provides bilingual metric configs and icons for all milestone event types', () => {
    const milestoneEvents = [
      'out_for_delivery',
      'delivered',
      'on_hold_customs_issue',
      'payment_link_ready',
      'shipment_created'
    ];

    milestoneEvents.forEach((eventType) => {
      const config = EVENT_METRIC_CONFIG[eventType];
      expect(config).toBeDefined();
      expect(config.labelEn).toBeDefined();
      expect(config.labelAr).toBeDefined();
      expect(config.icon).toBeDefined();
    });
  });
});
