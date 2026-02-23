const Organization = require('../models/organization.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');

/**
 * Create a new Organization
 * @route POST /api/organizations
 * @access Private (Admin)
 */
exports.createOrganization = async (req, res) => {
    try {
        const { name, type, creditLimit, markup, address, taxId } = req.body;

        const organization = await Organization.create({
            name,
            type,
            creditLimit,
            taxId,
            markup,
            addresses: address ? [address] : []
        });

        res.status(201).json({
            success: true,
            data: organization
        });
    } catch (error) {
        logger.error('Error creating organization:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                error: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Server Error'
        });
    }
};

/**
 * Get all Organizations
 * @route GET /api/organizations
 * @access Private (Admin/Staff)
 */
exports.getAllOrganizations = async (req, res) => {
    try {
        console.log('GET /api/organizations - Starting');
        const organizations = await Organization.find()
            .populate('members', 'name email role')
            .sort({ name: 1 });

        console.log(`GET /api/organizations - Found ${organizations.length} orgs`);

        res.status(200).json({
            success: true,
            count: organizations.length,
            data: organizations
        });
    } catch (error) {
        console.error('Error fetching organizations:', error);
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
        const organization = await Organization.findById(req.params.id)
            .populate('members', 'name email role');

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
        const updatePayload = { ...req.body };
        delete updatePayload.balance;

        const organization = await Organization.findByIdAndUpdate(req.params.id, updatePayload, {
            new: true,
            runValidators: true
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
        logger.error('Error updating organization:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                error: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Server Error'
        });
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
        const organization = await Organization.findById(req.params.id);

        if (!organization) {
            return res.status(404).json({ success: false, error: 'Organization not found' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Check if user is already in another org?
        // For simplicity, we overwrite or check.
        // Assuming strict 1-to-1 for now based on User model having single `organization` field.

        if (user.organization && user.organization.toString() !== organization._id.toString()) {
            return res.status(400).json({ success: false, error: 'User already belongs to another organization' });
        }

        // Add to Org members if not exists
        if (!organization.members.includes(userId)) {
            organization.members.push(userId);
            await organization.save();
        }

        // Link User to Org
        user.organization = organization._id;
        await user.save();

        res.status(200).json({
            success: true,
            data: organization,
            message: 'Member added successfully'
        });
    } catch (error) {
        logger.error('Error adding member:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Server Error'
        });
    }
};

/**
 * Remove Member from Organization
 * @route DELETE /api/organizations/:id/members/:userId
 * @access Private (Admin)
 */
exports.removeMember = async (req, res) => {
    try {
        const { id, userId } = req.params;

        const organization = await Organization.findById(id);
        if (!organization) {
            return res.status(404).json({ success: false, error: 'Organization not found' });
        }

        // Remove from Org members
        organization.members = organization.members.filter(m => m.toString() !== userId);
        await organization.save();

        // Unlink User
        await User.findByIdAndUpdate(userId, { $unset: { organization: "" } });

        res.status(200).json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        logger.error('Error removing member:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
