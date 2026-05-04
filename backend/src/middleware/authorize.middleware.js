/**
 * Authorization Middleware
 *
 * Capability-based access control. Uses rbac.policy.js as the source of truth.
 */

const {
    hasCapability,
    isPlatformRole,
    isOrgRole,
    isCompanyManagerRole
} = require('./rbac.policy');
const logger = require('../utils/logger');

const authorize = (...requiredCapabilities) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        for (const cap of requiredCapabilities) {
            if (!hasCapability(req.user.role, cap)) {
                logger.warn(`Authorization denied: user=${req.user.id} role=${req.user.role} missing=${cap}`);
                return res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                });
            }
        }

        next();
    };
};

const authorizeAny = (...allowedCapabilities) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        if (!allowedCapabilities.some(cap => hasCapability(req.user.role, cap))) {
            logger.warn(`Authorization denied: user=${req.user.id} role=${req.user.role} missingAny=${allowedCapabilities.join('|')}`);
            return res.status(403).json({
                success: false,
                error: 'Permission denied',
            });
        }

        next();
    };
};

function mergeScope(query, scope) {
    const existingOr = query.OR;
    const existingAnd = query.AND;
    delete query.OR;
    delete query.AND;

    Object.entries(scope).forEach(([key, value]) => {
        if (key !== 'OR' && key !== 'AND') query[key] = value;
    });

    const andClauses = [];
    if (existingAnd) andClauses.push(...(Array.isArray(existingAnd) ? existingAnd : [existingAnd]));
    if (existingOr) andClauses.push({ OR: existingOr });
    if (scope.AND) andClauses.push(...(Array.isArray(scope.AND) ? scope.AND : [scope.AND]));
    if (andClauses.length > 0) {
        if (scope.OR) andClauses.push({ OR: scope.OR });
        query.AND = andClauses;
    } else if (scope.OR) {
        query.OR = scope.OR;
    }

    return query;
}

function ownShipmentScope(userId) {
    return {
        OR: [
            { userId },
            { createdOnBehalfOfUserId: userId }
        ]
    };
}

function activeAccessScopes(user, action = 'view') {
    const permissionField = action === 'create' ? 'canCreateOnBehalf' : 'canViewShipments';
    return (user.accessScopes || []).filter(scope => scope && scope.active !== false && scope[permissionField] !== false);
}

function accessScopeClauses(user, action = 'view') {
    return activeAccessScopes(user, action).flatMap(scope => {
        if (scope.scopeType === 'CLIENT_USER' && scope.clientUserId) {
            return [
                { userId: scope.clientUserId },
                { createdOnBehalfOfUserId: scope.clientUserId }
            ];
        }

        if (scope.scopeType === 'COMPANY_ALL_USERS' && scope.organizationId) {
            return [{ organizationId: scope.organizationId }];
        }

        return [];
    });
}

function scopedInternalShipmentScope(user) {
    const clauses = [];

    if (user.role === 'driver') {
        clauses.push({ assignedDriverId: user.id });
    }

    if (user.role === 'staff') {
        clauses.push({ assignedStaffId: user.id });
    }

    clauses.push(...accessScopeClauses(user));
    return { OR: clauses };
}

function shipmentMatchesClause(shipment, clause) {
    return Object.entries(clause).every(([key, value]) => shipment[key] === value);
}

function hasShipmentAccessByScope(user, shipment) {
    return scopedInternalShipmentScope(user).OR.some(clause => shipmentMatchesClause(shipment, clause));
}

function canCreateShipmentForUser(req, targetUser) {
    if (!req.user || !targetUser) return false;

    if (req.user.id === targetUser.id) return true;
    if (isPlatformRole(req.user.role)) return true;

    if (isCompanyManagerRole(req.user.role) && req.user.organizationId && targetUser.organizationId) {
        return req.user.organizationId === targetUser.organizationId;
    }

    if (req.user.role === 'staff' || req.user.role === 'driver') {
        const createClauses = accessScopeClauses(req.user, 'create');
        return createClauses.some(clause => shipmentMatchesClause({
            userId: targetUser.id,
            createdOnBehalfOfUserId: targetUser.id,
            organizationId: targetUser.organizationId
        }, clause));
    }

    return false;
}

function scopeShipmentWhere(req, query = {}) {
    if (!req.user) return query;

    const { role, organizationId, id } = req.user;

    if (isPlatformRole(role)) return query;

    if (role === 'driver' || role === 'staff') {
        return mergeScope(query, scopedInternalShipmentScope(req.user));
    }

    if (isCompanyManagerRole(role) && organizationId) {
        return mergeScope(query, { organizationId });
    }

    if (isOrgRole(role)) {
        if (organizationId) {
            return mergeScope(query, { organizationId, ...ownShipmentScope(id) });
        }
        return mergeScope(query, ownShipmentScope(id));
    }

    return mergeScope(query, ownShipmentScope(id));
}

function scopeToOrg(req, query) {
    return scopeShipmentWhere(req, query);
}

function canAccessShipment(req, shipment) {
    if (!req.user || !shipment) return false;

    const { role, organizationId, id } = req.user;

    if (isPlatformRole(role)) return true;

    if (role === 'driver' || role === 'staff') {
        return hasShipmentAccessByScope(req.user, shipment);
    }

    if (isCompanyManagerRole(role) && organizationId && shipment.organizationId) {
        return organizationId === shipment.organizationId;
    }

    if (isOrgRole(role) && organizationId && shipment.organizationId && organizationId !== shipment.organizationId) {
        return false;
    }

    return shipment.userId === id || shipment.createdOnBehalfOfUserId === id;
}

function canAccessOrganization(req, organizationId) {
    if (!req.user) return false;

    if (organizationId === null || organizationId === undefined || organizationId === 'none') {
        return isPlatformRole(req.user.role);
    }

    if (isPlatformRole(req.user.role)) return true;
    if (isOrgRole(req.user.role)) return req.user.organizationId === organizationId;
    return false;
}

module.exports = {
    authorize,
    authorizeAny,
    scopeToOrg,
    scopeShipmentWhere,
    canAccessShipment,
    canAccessOrganization,
    canCreateShipmentForUser,
};
