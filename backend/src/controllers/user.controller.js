const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const { hashPassword, generateUserApiKey } = require('../utils/security');
const { normalizeShippingAccess } = require('../services/shippingAccess.service');

const buildAgentPolicy = (existingPolicy = {}, { markup, shippingAccess, optionalServiceMarkup } = {}) => {
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

    return nextPolicy;
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

        if (role) {
            // 'org' is a virtual filter for all organization-scoped roles
            if (role === 'org') {
                where.role = { in: ['org_manager', 'org_agent', 'client'] };
            } else {
                where.role = role;
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
                apiKeyLast4: true,
                active: true,
                createdAt: true
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

/**
 * Regenerate API key for a user (Admin/Staff via MANAGE_USERS)
 * @route POST /api/users/:id/api-key
 */
exports.regenerateUserApiKey = async (req, res) => {
    try {
        const { id } = req.params;
        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, role: true }
        });

        if (!existingUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const { fullKey, hash, last4 } = generateUserApiKey(existingUser.id);
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                apiKeyHash: hash,
                apiKeyLast4: last4
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                userId: existingUser.id,
                apiKey: fullKey,
                apiKeyLast4: last4
            }
        });
    } catch (error) {
        return handleControllerError(res, error, 'Admin API key regeneration');
    }
};

/**
 * Create user (Admin)
 * @route POST /api/users
 * @access Private (Admin)
 */
exports.createUser = async (req, res) => {
    try {
        const {
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

        const targetOrgId = organizationId || organization || null;
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
                agentPolicy: buildAgentPolicy({}, { markup, shippingAccess: normalizedShippingAccess, optionalServiceMarkup }),
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
        const { name, email, phone, role, organizationId, organization, carrierConfig, markup, optionalServiceMarkup, creditLimit, shippingAccess } = req.body;

        const targetOrgId = organizationId || organization;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email.toLowerCase();
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined) updateData.role = role;
        const existingUser = await prisma.user.findUnique({ where: { id: userId }, include: { organization: true } });
        if (!existingUser) throw new Error("User not found");

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

        if (markup !== undefined || optionalServiceMarkup !== undefined || normalizedShippingAccess) {
            updateData.agentPolicy = buildAgentPolicy(existingUser.agentPolicy, {
                markup,
                optionalServiceMarkup,
                shippingAccess: normalizedShippingAccess || undefined
            });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        if (creditLimit !== undefined) {
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
