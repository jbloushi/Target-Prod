const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const { hashPassword } = require('../utils/security');
const { normalizeShippingAccess } = require('../services/shippingAccess.service');
const { canCreateShipmentForUser } = require('../middleware/authorize.middleware');
const { isPlatformRole, isCompanyManagerRole } = require('../middleware/rbac.policy');

const normalizeCarrierPricing = (carrierConfig = {}) => {
    const pricingByCarrier = carrierConfig?.pricingByCarrier || {};
    const normalized = {};

    Object.entries(pricingByCarrier).forEach(([carrierCode, policy]) => {
        if (!policy || typeof policy !== 'object') return;
        const normalizedCarrier = String(carrierCode || '').toUpperCase();
        if (!normalizedCarrier) return;

        const fixedFee = Number(policy.fixedFee);
        normalized[normalizedCarrier] = {
            ...policy,
            fixedFee: Number.isFinite(fixedFee) && fixedFee >= 0 ? fixedFee : null,
            currency: String(policy.currency || 'KWD').trim().toUpperCase().substring(0, 3)
        };
    });

    return normalized;
};

const buildAgentPolicy = (existingPolicy = {}, { markup, shippingAccess, optionalServiceMarkup, carrierConfig } = {}) => {
    const nextPolicy = { ...(existingPolicy || {}) };

    if (markup !== undefined) {
        nextPolicy.markupOverride = markup;
    }

    if (shippingAccess !== undefined) {
        const normalizedAccess = normalizeShippingAccess(shippingAccess);
        nextPolicy.shippingAccess = normalizedAccess;
        nextPolicy.allowedCarriers = [normalizedAccess.carrierCode];
        nextPolicy.serviceCode = normalizedAccess.serviceCode;
    }

    if (optionalServiceMarkup !== undefined) {
        nextPolicy.optionalServiceMarkup = {
            ...(nextPolicy.optionalServiceMarkup || {}),
            ...(optionalServiceMarkup || {})
        };
    }

    if (carrierConfig !== undefined) {
        nextPolicy.carrierPricing = {
            ...(nextPolicy.carrierPricing || {}),
            ...normalizeCarrierPricing(carrierConfig)
        };
    }

    return nextPolicy;
};

const SCOPED_INTERNAL_ROLES = ['staff', 'driver'];
const CLIENT_SCOPE_ROLES = ['org_manager', 'org_agent', 'client'];

const isOrgUserManager = (user) => isCompanyManagerRole(user?.role);

const assertOrgUserManagementAllowed = (req, res, { targetOrgId, targetRole, existingUser } = {}) => {
    if (!isOrgUserManager(req.user)) return true;

    if (!req.user.organizationId) {
        res.status(403).json({ success: false, error: 'Organization manager is not linked to an organization' });
        return false;
    }

    if (existingUser && existingUser.organizationId !== req.user.organizationId) {
        res.status(403).json({ success: false, error: 'Cannot manage users outside your organization' });
        return false;
    }

    if (existingUser && !CLIENT_SCOPE_ROLES.includes(existingUser.role)) {
        res.status(403).json({ success: false, error: 'Cannot manage platform users' });
        return false;
    }

    if (targetOrgId !== undefined && targetOrgId !== null && targetOrgId !== req.user.organizationId) {
        res.status(403).json({ success: false, error: 'Cannot assign users outside your organization' });
        return false;
    }

    if (targetRole !== undefined && !CLIENT_SCOPE_ROLES.includes(targetRole)) {
        res.status(403).json({ success: false, error: 'Cannot assign platform roles' });
        return false;
    }

    return true;
};

const accessScopeSelect = {
    id: true,
    userId: true,
    scopeType: true,
    organizationId: true,
    clientUserId: true,
    canCreateOnBehalf: true,
    canViewShipments: true,
    active: true,
    organization: { select: { id: true, name: true } },
    clientUser: { select: { id: true, name: true, email: true, organizationId: true } }
};

const normalizeAccessScopes = (scopes = [], userId) => scopes.map(scope => {
    const normalized = {
        userId,
        scopeType: scope.scopeType,
        organizationId: null,
        clientUserId: null,
        canCreateOnBehalf: Boolean(scope.canCreateOnBehalf),
        canViewShipments: scope.canViewShipments !== false,
        active: true
    };

    if (scope.scopeType === 'CLIENT_USER') {
        normalized.clientUserId = scope.clientUserId;
    }

    if (scope.scopeType === 'COMPANY_ALL_USERS') {
        normalized.organizationId = scope.organizationId;
    }

    return normalized;
});

const validateAccessScopes = async (scopes = []) => {
    if (!Array.isArray(scopes)) {
        return 'Scopes must be an array';
    }

    const clientUserIds = [];
    const organizationIds = [];

    for (const scope of scopes) {
        if (!['CLIENT_USER', 'COMPANY_ALL_USERS'].includes(scope.scopeType)) {
            return 'Invalid scope type';
        }

        if (scope.scopeType === 'CLIENT_USER') {
            if (!scope.clientUserId) return 'clientUserId is required for CLIENT_USER scope';
            clientUserIds.push(scope.clientUserId);
        }

        if (scope.scopeType === 'COMPANY_ALL_USERS') {
            if (!scope.organizationId) return 'organizationId is required for COMPANY_ALL_USERS scope';
            organizationIds.push(scope.organizationId);
        }
    }

    if (clientUserIds.length) {
        const clients = await prisma.user.findMany({
            where: {
                id: { in: [...new Set(clientUserIds)] },
                role: { in: CLIENT_SCOPE_ROLES }
            },
            select: { id: true }
        });
        if (clients.length !== new Set(clientUserIds).size) {
            return 'One or more selected client users are invalid';
        }
    }

    if (organizationIds.length) {
        const organizations = await prisma.organization.findMany({
            where: { id: { in: [...new Set(organizationIds)] } },
            select: { id: true }
        });
        if (organizations.length !== new Set(organizationIds).size) {
            return 'One or more selected companies are invalid';
        }
    }

    return null;
};

/**
 * Get users by role (e.g., 'client')
 * @route GET /api/users
 * @access Private (Staff/Admin)
 */
exports.getUsers = async (req, res) => {
    try {
        const { role } = req.query;
        const where = {};

        if (isOrgUserManager(req.user)) {
            where.organizationId = req.user.organizationId;
            where.role = { in: CLIENT_SCOPE_ROLES };
        }

        if (role) {
            // 'org' is a virtual filter for all organization-scoped roles
            if (role === 'org') {
                where.role = { in: ['org_manager', 'org_agent', 'client'] };
            } else {
                where.role = role;
            }
        }

        if (isOrgUserManager(req.user)) {
            if (role && role !== 'org' && !CLIENT_SCOPE_ROLES.includes(role)) {
                where.role = { in: [] };
            } else if (role === 'org' || !role) {
                where.role = { in: CLIENT_SCOPE_ROLES };
            }
        }

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                organizationId: true,
                carrierConfig: true,
                agentPolicy: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        addresses: true,
                        markup: true,
                        creditLimit: true
                    }
                },
                addresses: true,
                active: true,
                createdAt: true,
                accessScopes: {
                    where: { active: true },
                    select: accessScopeSelect
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        const mappedUsers = users.map(u => ({
            ...u,
            markup: u.agentPolicy?.markupOverride || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
            optionalServiceMarkup: u.agentPolicy?.optionalServiceMarkup || {},
            creditLimit: u.organization?.creditLimit !== undefined ? u.organization.creditLimit : (u.creditLimit || 0)
        }));

        res.status(200).json({
            success: true,
            count: mappedUsers.length,
            data: mappedUsers
        });
    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

exports.getAssignableClients = async (req, res) => {
    try {
        const where = { role: { in: CLIENT_SCOPE_ROLES }, active: true };

        if (isCompanyManagerRole(req.user.role) && req.user.organizationId) {
            where.organizationId = req.user.organizationId;
        }

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                organizationId: true,
                carrierConfig: true,
                agentPolicy: true,
                organization: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                active: true
            },
            orderBy: { name: 'asc' }
        });

        const assignableUsers = isPlatformRole(req.user.role) || isCompanyManagerRole(req.user.role)
            ? users
            : users.filter(clientUser => canCreateShipmentForUser(req, clientUser));

        res.status(200).json({
            success: true,
            count: assignableUsers.length,
            data: assignableUsers
        });
    } catch (error) {
        return handleControllerError(res, error, 'Assignable client retrieval');
    }
};

exports.getAccessScopes = async (req, res) => {
    try {
        const scopes = await prisma.userAccessScope.findMany({
            where: { userId: req.params.id, active: true },
            select: accessScopeSelect,
            orderBy: [{ scopeType: 'asc' }, { createdAt: 'asc' }]
        });

        res.status(200).json({ success: true, data: scopes });
    } catch (error) {
        return handleControllerError(res, error, 'User access scope retrieval');
    }
};

exports.replaceAccessScopes = async (req, res) => {
    try {
        const userId = req.params.id;
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true }
        });

        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (!SCOPED_INTERNAL_ROLES.includes(targetUser.role)) {
            return res.status(400).json({ success: false, error: 'Access scopes can only be assigned to staff or drivers' });
        }

        const scopes = req.body.scopes || [];
        const validationError = await validateAccessScopes(scopes);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const normalizedScopes = normalizeAccessScopes(scopes, userId);

        await prisma.$transaction(async (tx) => {
            await tx.userAccessScope.deleteMany({ where: { userId } });
            if (normalizedScopes.length) {
                await tx.userAccessScope.createMany({ data: normalizedScopes });
            }
        });

        const updatedScopes = await prisma.userAccessScope.findMany({
            where: { userId, active: true },
            select: accessScopeSelect,
            orderBy: [{ scopeType: 'asc' }, { createdAt: 'asc' }]
        });

        res.status(200).json({ success: true, data: updatedScopes });
    } catch (error) {
        return handleControllerError(res, error, 'User access scope update');
    }
};

/**
 * Create user (Admin)
 * @route POST /api/users
 * @access Private (Admin)
 */
exports.createUser = async (req, res) => {
    try {
        let {
            name,
            email,
            phone,
            role = 'org_agent',
            password,
            organizationId,
            organization,
            carrierConfig,
            markup,
            optionalServiceMarkup,
            creditLimit,
            shippingAccess
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const targetOrgId = isOrgUserManager(req.user)
            ? req.user.organizationId
            : (organizationId || organization || null);
        if (!assertOrgUserManagementAllowed(req, res, { targetOrgId, targetRole: role })) return;

        if (isOrgUserManager(req.user)) {
            carrierConfig = undefined;
            markup = undefined;
            optionalServiceMarkup = undefined;
            creditLimit = undefined;
            shippingAccess = undefined;
        }

        const hashedPassword = await hashPassword(password);
        const normalizedShippingAccess = normalizeShippingAccess(shippingAccess || {
            carrierCode: carrierConfig?.preferredCarrier || 'DGR',
            serviceCode: carrierConfig?.serviceCode || 'P'
        });

        const user = await prisma.user.create({
            data: {
                name,
                email: email.toLowerCase(),
                phone: phone || null,
                role,
                password: hashedPassword,
                carrierConfig: {
                    ...(carrierConfig || {}),
                    preferredCarrier: normalizedShippingAccess.carrierCode,
                    serviceCode: normalizedShippingAccess.serviceCode
                },
                agentPolicy: buildAgentPolicy({}, { markup, shippingAccess: normalizedShippingAccess, optionalServiceMarkup, carrierConfig }),
                creditLimit: creditLimit !== undefined ? Number(creditLimit) : undefined,
                ...(targetOrgId ? { organization: { connect: { id: targetOrgId } } } : {})
            }
        });

        res.status(201).json({ success: true, data: user });
    } catch (error) {
        return handleControllerError(res, error, 'User creation');
    }
};

/**
 * Get current user profile
 * @route GET /api/users/me
 * @access Private
 */
exports.getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const mappedUser = {
            ...user,
            markup: user.agentPolicy?.markupOverride || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
            optionalServiceMarkup: user.agentPolicy?.optionalServiceMarkup || {},
            creditLimit: user.organization?.creditLimit !== undefined ? user.organization.creditLimit : (user.creditLimit || 0)
        };

        res.status(200).json({
            success: true,
            data: mappedUser
        });
    } catch (error) {
        return handleControllerError(res, error, 'User profile retrieval');
    }
};

/**
 * Update current user profile
 * @route PATCH /api/users/profile
 * @access Private
 */
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, addresses, carrierConfig } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (addresses) updateData.addresses = addresses;
        if (carrierConfig) updateData.carrierConfig = carrierConfig;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, organizationId: true, addresses: true,
                carrierConfig: true, active: true, updatedAt: true
            }
        });

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        return handleControllerError(res, error, 'Profile update');
    }
};

/**
 * Update user (Admin)
 * @route PATCH /api/users/:id
 * @access Private (Admin)
 */
exports.updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        let { name, email, phone, role, organizationId, organization, carrierConfig, markup, optionalServiceMarkup, creditLimit, shippingAccess } = req.body;

        const targetOrgId = isOrgUserManager(req.user)
            ? req.user.organizationId
            : (organizationId || organization);

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email.toLowerCase();
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined) updateData.role = role;
        const existingUser = await prisma.user.findUnique({ where: { id: userId }, include: { organization: true } });
        if (!existingUser) throw new Error("User not found");
        if (!assertOrgUserManagementAllowed(req, res, { targetOrgId, targetRole: role, existingUser })) return;

        if (isOrgUserManager(req.user)) {
            carrierConfig = undefined;
            markup = undefined;
            optionalServiceMarkup = undefined;
            creditLimit = undefined;
            shippingAccess = undefined;
        }

        if (targetOrgId !== undefined) {
            if (targetOrgId) {
                updateData.organization = { connect: { id: targetOrgId } };
            } else {
                updateData.organization = { disconnect: true };
            }
        }
        
        let normalizedShippingAccess = null;
        if (shippingAccess !== undefined) {
            normalizedShippingAccess = normalizeShippingAccess(shippingAccess);
        }

        if (carrierConfig !== undefined || normalizedShippingAccess) {
            updateData.carrierConfig = {
                ...(existingUser.carrierConfig || {}),
                ...(carrierConfig || {}),
                ...(normalizedShippingAccess ? {
                    preferredCarrier: normalizedShippingAccess.carrierCode,
                    serviceCode: normalizedShippingAccess.serviceCode
                } : {})
            };
        }

        if (markup !== undefined || optionalServiceMarkup !== undefined || normalizedShippingAccess || carrierConfig !== undefined) {
            updateData.agentPolicy = buildAgentPolicy(existingUser.agentPolicy, {
                markup,
                optionalServiceMarkup,
                shippingAccess: normalizedShippingAccess || undefined,
                carrierConfig
            });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        if (creditLimit !== undefined && !isOrgUserManager(req.user)) {
            const activeOrgId = targetOrgId !== undefined ? targetOrgId : existingUser.organizationId;
            if (activeOrgId) {
                await prisma.organization.update({
                    where: { id: activeOrgId },
                    data: { creditLimit: Number(creditLimit) }
                });
            } else {
                // Solo user credit limit
                await prisma.user.update({
                    where: { id: userId },
                    data: { creditLimit: Number(creditLimit) }
                });
            }
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        return handleControllerError(res, error, 'User update');
    }
};

/**
 * Delete user (Admin)
 * @route DELETE /api/users/:id
 * @access Private (Admin)
 */
exports.deleteUser = async (req, res) => {
    try {
        if (req.user.id === req.params.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own user' });
        }
        if (isOrgUserManager(req.user)) {
            const existingUser = await prisma.user.findUnique({ where: { id: req.params.id } });
            if (!existingUser) return res.status(404).json({ success: false, error: 'User not found' });
            if (!assertOrgUserManagementAllowed(req, res, { existingUser })) return;
        }
        await prisma.user.delete({
            where: { id: req.params.id }
        });
        res.status(204).json({ success: true, data: null });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
