const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const signToken = (id) => {
    if (!process.env.JWT_SECRET) {
        logger.error('JWT_SECRET is not defined in environment variables!');
        throw new Error('Internal Server Error: Security Configuration Missing');
    }
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
};

const createSendToken = (user, statusCode, res) => {
    const token = signToken(user._id);

    // Remove password from output
    user.password = undefined;

    res.status(statusCode).json({
        success: true,
        token,
        data: {
            user
        }
    });
};

exports.signup = async (req, res) => {
    try {
        const { name, email, password, role: requestedRole } = req.body;

        // SECURITY: Public signup is restricted to org_agent accounts only.
        // Any other role must be assigned by an admin via the user management panel.
        if (requestedRole && requestedRole !== 'org_agent') {
            return res.status(403).json({ success: false, error: 'Only organization agent accounts can be self-registered' });
        }

        const role = 'org_agent';

        const newUser = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role,
            markup: {
                type: 'PERCENTAGE',
                percentageValue: 15,
                flatValue: 0
            }
        });

        createSendToken(newUser, 201, res);
    } catch (error) {
        logger.error('Signup error:', error);
        let message = error.message;
        if (error.code === 11000) message = 'Email already exists';
        res.status(400).json({ success: false, error: message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1) Check if email and password exist
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide email and password' });
        }

        // 2) Check if user exists && password is correct
        logger.debug(`Attempting login for: ${email}`);
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            logger.warn(`Login failed: No user found for email ${email}`);
            return res.status(401).json({ success: false, error: 'Incorrect email or password' });
        }

        logger.debug('User found, checking password...');
        const isMatch = await user.correctPassword(password, user.password);

        if (!isMatch) {
            logger.warn(`Login failed: Password mismatch for ${email}`);
            return res.status(401).json({ success: false, error: 'Incorrect email or password' });
        }

        logger.debug('Password match, creating token...');
        // 3) If everything ok, send token to client
        createSendToken(user, 200, res);
    } catch (error) {
        // FAIL-SAFE: Log to file if console is elusive
        try {
            const fs = require('fs');
            const path = require('path');
            const logMsg = `${new Date().toISOString()} - [LOGIN_ERROR] ${error.message}\n${error.stack}\n\n`;
            fs.appendFileSync(path.join(__dirname, '../../debug_error.log'), logMsg);
        } catch (fsErr) {
            console.error('Failed to write to debug_error.log:', fsErr);
        }

        logger.error('Login error - Full metadata:', {
            error: error.message,
            stack: error.stack,
            email: req.body?.email
        });
        res.status(500).json({
            success: false,
            error: 'Server error during login',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Placeholder for WABA/OTP login
exports.requestOtp = async (req, res) => {
    // Logic for Chatwoot/WABA integration would go here
    res.status(200).json({ success: true, message: 'OTP sent via WABA (Mocked)' });
};

exports.protect = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'You are not logged in' });
        }

        // Verify token
        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET is not defined in environment variables!');
            return res.status(500).json({ success: false, error: 'Security Configuration Missing' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
            logger.warn(`Auth Failed: User ${decoded.id} no longer exists. (Likely In-Memory DB reset in developer mode). User must re-login.`);
            return res.status(401).json({ success: false, error: 'User no longer exists' });
        }

        // Grant access to protected route
        req.user = currentUser;

        const requestContext = require('../utils/RequestContext');
        requestContext.run({ organizationId: currentUser.organization, role: currentUser.role, userId: currentUser._id }, () => {
            next();
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

exports.generateApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const key = user.generateApiKey();
        await user.save();

        res.status(200).json({
            success: true,
            apiKey: key
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to generate API Key' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({ role: { $in: ['org_agent', 'org_manager'] } });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
};

// Get clients (org agents/managers) with their addresses for staff dropdown
exports.getClients = async (req, res) => {
    try {
        const clients = await User.find({ role: { $in: ['org_agent', 'org_manager'] } })
            .select('name email phone addresses');
        res.status(200).json({ success: true, data: clients });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch clients' });
    }
};

exports.updateUserSurcharge = async (req, res) => {
    try {
        const { userId, type, percentageValue, flatValue, value } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // Build markup object based on schema
        user.markup = {
            type: type || 'PERCENTAGE',
            // Maintain 'value' for legacy code but use explicit fields for new logic
            value: percentageValue || value || 0,
            percentageValue: percentageValue || 0,
            flatValue: flatValue || 0
        };
        await user.save();

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        logger.error('Update markup error:', error);
        res.status(500).json({ success: false, error: 'Failed to update markup' });
    }
};

/**
 * Admin: Reset a user's password
 * PATCH /api/users/:id/password
 * Body: { password }
 */
exports.resetUserPassword = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const user = await User.findById(req.params.id).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        user.password = password; // pre-save hook will hash
        await user.save();

        logger.info(`Password reset for user ${user.email} by admin ${req.user.email}`);

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
};

exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        next();
    };
};
