const requestContext = require('../utils/RequestContext');
const { isPlatformRole } = require('../middleware/rbac.policy');

/**
 * Mongoose Plugin for Multi-Tenant Isolation
 * Automatically scopes `find`, `findOne`, `count`, etc. to the current user's organization.
 */
module.exports = function tenantPlugin(schema, options = {}) {
    // Only apply if the schema has an organization field
    if (!schema.path('organization')) {
        return;
    }

    const interceptQuery = function (next) {
        const context = requestContext.getStore();
        if (!context) return next();

        const { organizationId, role } = context;

        // Platform roles (admin/staff/accounting) bypass automatic scoping
        // unless they explicitly want it (handled by controllers)
        if (role && isPlatformRole(role)) {
            return next();
        }

        // Apply tenant scoping for org users / API clients
        if (organizationId) {
            // Merge existing query conditions with the forced organization filter
            this.where({ organization: organizationId });
        } else if (context.userId) {
            // Fallback: If somehow no org, scope to their own user ID if the schema has user
            if (schema.path('user')) {
                this.where({ user: context.userId });
            }
        }

        next();
    };

    // Apply to standard query operations
    schema.pre('find', interceptQuery);
    schema.pre('findOne', interceptQuery);
    schema.pre('countDocuments', interceptQuery);
    schema.pre('count', interceptQuery);
    schema.pre('findOneAndUpdate', interceptQuery);
    schema.pre('updateMany', interceptQuery);
    schema.pre('deleteMany', interceptQuery);

    // Mongoose aggregation pipeline interception
    schema.pre('aggregate', function (next) {
        const context = requestContext.getStore();
        if (!context) return next();

        const { organizationId, role } = context;

        if (role && isPlatformRole(role)) {
            return next();
        }

        if (organizationId) {
            this.pipeline().unshift({ $match: { organization: organizationId } });
        } else if (context.userId && schema.path('user')) {
            this.pipeline().unshift({ $match: { user: context.userId } });
        }

        next();
    });
};
