const { CAPABILITIES, hasCapability } = require('../src/middleware/rbac.policy');

describe('system settings authorization', () => {
    test('only grants system settings management to the superadmin role', () => {
        expect(hasCapability('admin', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(true);
        expect(hasCapability('manager', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(false);
        expect(hasCapability('staff', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(false);
        expect(hasCapability('client', CAPABILITIES.MANAGE_SYSTEM_SETTINGS)).toBe(false);
    });
});
