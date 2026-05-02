/**
 * RBAC Policy — Single Source of Truth
 * 
 * Maps roles → capabilities. All authorization decisions flow through here.
 * Keep this file in sync with frontend/src/utils/capabilities.jsx
 */

const CAPABILITIES = Object.freeze({
    // Admin-only
    MANAGE_USERS: 'MANAGE_USERS',
    MANAGE_ORGS: 'MANAGE_ORGS',
    MANAGE_PRICING: 'MANAGE_PRICING',
    MANAGE_CARRIERS: 'MANAGE_CARRIERS',
    VIEW_COST_DATA: 'VIEW_COST_DATA',

    // Finance
    VIEW_FINANCE: 'VIEW_FINANCE',
    MANAGE_PAYMENTS: 'MANAGE_PAYMENTS',
    REVERSE_PAYMENTS: 'REVERSE_PAYMENTS',

    // Platform operations
    VIEW_ALL_SHIPMENTS: 'VIEW_ALL_SHIPMENTS',
    APPROVE_SHIPMENTS: 'APPROVE_SHIPMENTS',
    BOOK_CARRIERS: 'BOOK_CARRIERS',
    VIEW_DOCUMENTS: 'VIEW_DOCUMENTS',

    // Shared
    CREATE_SHIPMENTS: 'CREATE_SHIPMENTS',
    VIEW_OWN_SHIPMENTS: 'VIEW_OWN_SHIPMENTS',
    GENERATE_API_KEY: 'GENERATE_API_KEY',

    // Driver
    DRIVER_OPS: 'DRIVER_OPS',
});

/**
 * Role → Capabilities mapping
 * Platform roles: admin, accounting, manager, staff, driver
 * Organization roles: org_manager, org_agent
 * Legacy: client (treated as org_agent)
 */
const ROLE_CAPABILITIES = Object.freeze({
    admin: [
        CAPABILITIES.MANAGE_USERS,
        CAPABILITIES.MANAGE_ORGS,
        CAPABILITIES.MANAGE_PRICING,
        CAPABILITIES.MANAGE_CARRIERS,
        CAPABILITIES.VIEW_COST_DATA,
        CAPABILITIES.VIEW_FINANCE,
        CAPABILITIES.MANAGE_PAYMENTS,
        CAPABILITIES.REVERSE_PAYMENTS,
        CAPABILITIES.VIEW_ALL_SHIPMENTS,
        CAPABILITIES.APPROVE_SHIPMENTS,
        CAPABILITIES.BOOK_CARRIERS,
        CAPABILITIES.VIEW_DOCUMENTS,
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],

    accounting: [
        CAPABILITIES.VIEW_FINANCE,
        CAPABILITIES.MANAGE_PAYMENTS,
        CAPABILITIES.REVERSE_PAYMENTS,
        CAPABILITIES.VIEW_ALL_SHIPMENTS,
        CAPABILITIES.APPROVE_SHIPMENTS,
        CAPABILITIES.BOOK_CARRIERS,
        CAPABILITIES.VIEW_DOCUMENTS,
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],

    manager: [
        CAPABILITIES.VIEW_FINANCE,
        CAPABILITIES.VIEW_ALL_SHIPMENTS,
        CAPABILITIES.APPROVE_SHIPMENTS,
        CAPABILITIES.BOOK_CARRIERS,
        CAPABILITIES.VIEW_DOCUMENTS,
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],

    staff: [
        CAPABILITIES.VIEW_FINANCE,
        CAPABILITIES.VIEW_ALL_SHIPMENTS,
        CAPABILITIES.APPROVE_SHIPMENTS,
        CAPABILITIES.BOOK_CARRIERS,
        CAPABILITIES.VIEW_DOCUMENTS,
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],

    driver: [
        CAPABILITIES.DRIVER_OPS,
        CAPABILITIES.VIEW_ALL_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
    ],

    org_manager: [
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],

    org_agent: [
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],

    client: [
        CAPABILITIES.CREATE_SHIPMENTS,
        CAPABILITIES.VIEW_OWN_SHIPMENTS,
        CAPABILITIES.GENERATE_API_KEY,
    ],
});

/**
 * Roles that can see data across all organizations (platform-level visibility).
 */
const PLATFORM_ROLES = Object.freeze(['admin', 'accounting', 'manager', 'staff', 'driver']);

/**
 * Roles scoped to their own organization's data.
 */
const ORG_ROLES = Object.freeze(['org_manager', 'org_agent', 'client']);

/**
 * Check if a role has a specific capability.
 * @param {string} role 
 * @param {string} capability 
 * @returns {boolean}
 */
function hasCapability(role, capability) {
    const caps = ROLE_CAPABILITIES[role];
    if (!caps) return false;
    return caps.includes(capability);
}

/**
 * Get all capabilities for a role.
 * @param {string} role 
 * @returns {string[]}
 */
function getCapabilities(role) {
    return ROLE_CAPABILITIES[role] || [];
}

/**
 * Check if a role is a platform-level role (can see all orgs).
 * @param {string} role 
 * @returns {boolean}
 */
function isPlatformRole(role) {
    return PLATFORM_ROLES.includes(role);
}

/**
 * Check if a role is org-scoped.
 * @param {string} role 
 * @returns {boolean}
 */
function isOrgRole(role) {
    return ORG_ROLES.includes(role);
}

module.exports = {
    CAPABILITIES,
    ROLE_CAPABILITIES,
    PLATFORM_ROLES,
    ORG_ROLES,
    hasCapability,
    getCapabilities,
    isPlatformRole,
    isOrgRole,
};
