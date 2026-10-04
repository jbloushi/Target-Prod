import { describe, expect, it } from 'vitest';
import { getTabs } from './SettingsPage';

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
});
