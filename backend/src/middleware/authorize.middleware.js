/**
 * Authorization Middleware
 * 
 * Capability-based access control. Uses rbac.policy.js as the source of truth.
 * 
 * Usage in routes:
 *   const { authorize, scopeToOrg } = require('../middleware/authorize.middleware');
 *   router.get('/shipments', authorize('VIEW_ALL_SHIPMENTS'), controller.list);
 */

const { hasCapability, isPlatformRole, isOrgRole } = require('./rbac.policy');
const logger = require('../utils/logger');

/**
 * Express middleware factory — checks if the authenticated user has ALL
 * of the required capabilities.
 * 
 * @param  {...string} requiredCapabilities - One or more capability names
 * @returns {Function} Express middleware
 * 
 * @example
 *   router.post('/api-key', protect, authorize('MANAGE_CARRIERS'), generateApiKey);
 *   router.patch('/:id', protect, authorize('MANAGE_USERS'), updateUser);
 */
const authorize = (...requiredCapabilities) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { role } = req.user;

        for (const cap of requiredCapabilities) {
            if (!hasCapability(role, cap)) {
                logger.warn(`Authorization denied: user=${req.user.id} role=${role} missing=${cap}`);
                return res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                });
            }
        }

        next();
    };
};

/**
 * Mutates a Prisma-style query filter to scope results by organization.
 * 
 * - Platform roles (admin, staff, manager, accounting) → no scoping, see everything
 * - Org roles with an organization → scoped to their organization
 * - Org roles without an organization → scoped to their own user ID
 * 
 * @param {Object} req - Express request (must have req.user)
 * @param {Object} query - Filter object to mutate
 * @returns {Object} The mutated query (for chaining convenience)
 */
function scopeToOrg(req, query) {
    if (!req.user) return query;

    const { role, organizationId, id } = req.user;

    if (isPlatformRole(role)) {
        // Platform users see everything — no scoping
        return query;
    }

    if (isOrgRole(role)) {
        if (organizationId) {
            // Org user with an org → see all shipments for that org
            query.organizationId = organizationId;
        } else {
            // Org user without an org → see only their own data
            query.userId = id;
        }
        return query;
    }

    // Fallback: unknown role → scope to own data only
    query.userId = id;
    return query;
}

/**
 * Checks if the current user can access a specific shipment.
 * Platform roles can access any shipment.
 * Org roles can access shipments belonging to their org or themselves.
 * 
 * @param {Object} req - Express request
 * @param {Object} shipment - Shipment document (must have .user and .organization)
 * @returns {boolean}
 */
function canAccessShipment(req, shipment) {
    if (!req.user) return false;

    const { role, organizationId, id } = req.user;

    if (isPlatformRole(role)) return true;

    // Org user: check org match or direct ownership
    if (organizationId && shipment.organizationId) {
        return organizationId === shipment.organizationId;
    }

    // Direct ownership check
    return shipment.userId === id;
}

module.exports = {
    authorize,
    scopeToOrg,
    canAccessShipment,
};
