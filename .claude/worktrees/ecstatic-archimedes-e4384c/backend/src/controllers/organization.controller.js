const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');

/**
 * Create a new Organization
 * @route POST /api/organizations
 * @access Private (Admin)
 */
exports.createOrganization = async (req, res) => {
    try {
        const { name, type, creditLimit, markup, address, taxId } = req.body;

        const organization = await prisma.organization.create({
            data: {
                name,
                type,
                creditLimit: Number(creditLimit) || 0,
                taxId,
                markup: markup || {},
                addresses: address ? [address] : []
            }
        });

        res.status(201).json({
            success: true,
            data: organization
        });
    } catch (error) {
        return handleControllerError(res, error, 'Organization creation');
    }
};

/**
 * Get all Organizations
 * @route GET /api/organizations
 * @access Private (Admin/Staff)
 */
exports.getAllOrganizations = async (req, res) => {
    try {
        const organizations = await prisma.organization.findMany({
            include: {
                members: {
                    select: { id: true, name: true, email: true, role: true }
                }
            },
            orderBy: { name: 'asc' }
        });

        res.status(200).json({
            success: true,
            count: organizations.length,
            data: organizations
        });
    } catch (error) {
        logger.error('Error fetching organizations:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

/**
 * Get single Organization
 * @route GET /api/organizations/:id
 * @access Private
 */
exports.getOrganization = async (req, res) => {
    try {
        const organization = await prisma.organization.findUnique({
            where: { id: req.params.id },
            include: {
                members: {
                    select: { id: true, name: true, email: true, role: true }
                }
            }
        });

        if (!organization) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        res.status(200).json({
            success: true,
            data: organization
        });
    } catch (error) {
        logger.error('Error fetching organization:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

/**
 * Update Organization
 * @route PATCH /api/organizations/:id
 * @access Private (Admin)
 */
exports.updateOrganization = async (req, res) => {
    try {
        const updateData = { ...req.body };
        delete updateData.balance; // Protect balance from manual update
        delete updateData.id;

        // Convert numeric fields
        if (updateData.creditLimit !== undefined) updateData.creditLimit = Number(updateData.creditLimit);

        const organization = await prisma.organization.update({
            where: { id: req.params.id },
            data: updateData
        });

        res.status(200).json({
            success: true,
            data: organization
        });
    } catch (error) {
        return handleControllerError(res, error, 'Organization update');
    }
};

/**
 * Add Member to Organization
 * @route POST /api/organizations/:id/members
 * @access Private (Admin)
 */
exports.addMember = async (req, res) => {
    try {
        const { userId } = req.body;
        const orgId = req.params.id;

        const organization = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!organization) return res.status(404).json({ success: false, error: 'Org not found' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        if (user.organizationId && user.organizationId !== orgId) {
            return res.status(400).json({ success: false, error: 'User already in another organization' });
        }

        // Link User to Org via Prisma
        await prisma.user.update({
            where: { id: userId },
            data: { organizationId: orgId }
        });

        res.status(200).json({
            success: true,
            message: 'Member added successfully'
        });
    } catch (error) {
        return handleControllerError(res, error, 'Member addition');
    }
};

/**
 * Remove Member from Organization
 * @route DELETE /api/organizations/:id/members/:userId
 * @access Private (Admin)
 */
exports.removeMember = async (req, res) => {
    try {
        const { userId } = req.params;

        // Simply unlink by setting organizationId to null
        await prisma.user.update({
            where: { id: userId },
            data: { organizationId: null }
        });

        res.status(200).json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        logger.error('Error removing member:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
