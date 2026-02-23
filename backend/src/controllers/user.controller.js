const User = require('../models/user.model');
const logger = require('../utils/logger');

/**
 * Get users by role (e.g., 'client')
 * @route GET /api/users
 * @access Private (Staff/Admin)
 */
/**
 * Get users by role (e.g., 'client')
 * @route GET /api/users
 * @access Private (Staff/Admin)
 */
exports.getUsers = async (req, res) => {
    try {
        const { role } = req.query;
        const query = {};

        // Filter by role if provided
        if (role) {
            query.role = role;
        }

        // Security: Non-admins can only see clients? 
        // Reverting to original simple logic for now as requested.
        // If we need to restrict non-admins to 'client', we can do:
        // if (req.user.role !== 'admin' && !role) query.role = 'client';
        // But for "rollback", let's go back to the base state or the "Client Only" state if that was deemed "before".
        // The user said "Create Shipment For (Client)" rollback.
        // I will assume restoring the code that lets them pick a client, potentially all users if no filter was there, 
        // OR just the simple "role=client" if they pass it.

        // Let's stick to the version that was working before the strict org check.
        // It seems the original code just checked `if (role) query.role = role;`. 
        // I will restore that to be safe.


        // Select fields and populate Organization
        const users = await User.find(query)
            .select('name email phone addresses role company organization carrierConfig markup creditLimit')
            .populate({
                path: 'organization',
                select: 'name addresses markup creditLimit'
            })
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
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
 * Get current user profile
 * @route GET /api/users/me
 * @access Private
 */
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('organization');

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

/**
 * Update current user profile
 * @route PATCH /api/users/profile
 * @access Private
 */
exports.updateProfile = async (req, res) => {
    try {
        // Filter out unwanted fields
        const { name, phone, company, addresses, carrierConfig } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (company) updateData.company = company; // Legacy support
        if (addresses) updateData.addresses = addresses;
        if (carrierConfig) updateData.carrierConfig = carrierConfig;

        const user = await User.findByIdAndUpdate(req.user.id, updateData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Server Error'
        });
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
        logger.info(`Attempting to update user ${userId}. Body: ${JSON.stringify(req.body)}`);

        const { name, email, phone, role, organization, carrierConfig, markup, creditLimit } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            logger.warn(`Update failed: User ${userId} not found`);
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Basic fields - handle empty string for organization (Solo Account)
        if (name !== undefined) user.name = name;
        if (email !== undefined) user.email = email.toLowerCase();
        if (phone !== undefined) user.phone = phone;
        if (role !== undefined) user.role = role;

        // Handle organization as ObjectId or null
        if (organization !== undefined) {
            user.organization = (organization === '' || organization === null) ? undefined : organization;
        }

        if (creditLimit !== undefined) user.creditLimit = creditLimit;

        // Update Nested Carrier Config
        if (carrierConfig) {
            user.carrierConfig = {
                ...(user.carrierConfig ? user.carrierConfig.toObject() : {}),
                ...carrierConfig
            };
        }

        // Update Markup (Profit Engine) - Very explicit to avoid reserved keyword issues
        if (markup) {
            const currentMarkup = user.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
            user.markup = {
                type: markup.type || currentMarkup.type,
                percentageValue: (markup.percentageValue !== undefined) ? Number(markup.percentageValue) : currentMarkup.percentageValue,
                flatValue: (markup.flatValue !== undefined) ? Number(markup.flatValue) : currentMarkup.flatValue,
                value: (markup.percentageValue !== undefined) ? Number(markup.percentageValue) : (markup.flatValue !== undefined ? Number(markup.flatValue) : currentMarkup.value || 0)
            };
            logger.info(`Updated markup for ${user.email}: ${JSON.stringify(user.markup)}`);
        }

        // Use markModified for nested objects just in case
        user.markModified('markup');
        user.markModified('carrierConfig');

        await user.save();
        logger.info(`User ${user.email} saved successfully`);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error(`Error updating user ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            error: error.message || 'Server Error'
        });
    }
};

/**
 * Delete user (Admin)
 * @route DELETE /api/users/:id
 * @access Private (Admin)
 */
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(204).json({ success: true, data: null });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};
