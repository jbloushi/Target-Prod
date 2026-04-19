const { prisma } = require('../config/database');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { hashPassword, comparePassword, generateUserApiKey } = require('../utils/security');

/**
 * Signs a JWT token for the given user ID
 */
const signToken = (id) => {
    if (!process.env.JWT_SECRET) {
        logger.error('JWT_SECRET is not defined in environment variables!');
        throw new Error('Internal Server Error: Security Configuration Missing');
    }
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
};

/**
 * Creates and sends a JWT token to the client
 */
const createSendToken = (user, statusCode, res) => {
    const token = signToken(user.id);

    // Remove password from memory/output
    delete user.password;

    res.status(statusCode).json({
        success: true,
        token,
        data: {
            user
        }
    });
};

/**
 * Unified Signup: Creates a new User and potentially a new Organization
 */
exports.signup = async (req, res) => {
    try {
        const { name, email, password, role: requestedRole, organizationName } = req.body;

        // SECURITY: Public signup is restricted to org_agent accounts only.
        if (requestedRole && requestedRole !== 'org_agent') {
            return res.status(403).json({ success: false, error: 'Only organization agent accounts can be self-registered' });
        }

        const role = 'org_agent';
        const hashedPassword = await hashPassword(password);

        const newUser = await prisma.$transaction(async (tx) => {
            // Check if email already exists
            const existingUser = await tx.user.findUnique({ where: { email: email.toLowerCase() } });
            if (existingUser) throw new Error('Email already exists');

            // Optional: Create an Organization if provided, or use a default one
            let organizationId = null;
            if (organizationName) {
                const org = await tx.organization.create({
                    data: {
                        name: organizationName,
                        type: 'BUSINESS',
                        markup: {
                            type: 'PERCENTAGE',
                            percentageValue: 15,
                            flatValue: 0
                        }
                    }
                });
                organizationId = org.id;
            }

            const userData = {
                name,
                email: email.toLowerCase(),
                password: hashedPassword,
                role: role
            };

            if (organizationId) {
                userData.organization = {
                    connect: { id: organizationId }
                };
            }

            return await tx.user.create({
                data: userData
            });
        });

        createSendToken(newUser, 201, res);
    } catch (error) {
        logger.error('Signup error:', error);
        // Use generic message to prevent email enumeration
        res.status(400).json({ success: false, error: 'Registration failed. Please check your details and try again.' });
    }
};

/**
 * User Login
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide email and password' });
        }

        logger.debug(`Attempting login for: ${email}`);
        
        // In Prisma, we pull the password explicitly if we want it, 
        // but here we just find the user.
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            logger.warn(`Login failed: No user found for email ${email}`);
            return res.status(401).json({ success: false, error: 'Incorrect email or password' });
        }

        // Compare password using new security utility
        const isMatch = await comparePassword(password, user.password);

        if (!isMatch) {
            logger.warn(`Login failed: Password mismatch for ${email}`);
            return res.status(401).json({ success: false, error: 'Incorrect email or password' });
        }

        logger.debug('Password match, creating token...');
        createSendToken(user, 200, res);
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
        });
    }
};

/**
 * Placeholder for WABA/OTP login
 */
exports.requestOtp = async (req, res) => {
    res.status(200).json({ success: true, message: 'OTP sent via WABA (Mocked)' });
};

/**
 * Middleware: Protect routes and inject User Organization context
 */
exports.protect = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'You are not logged in' });
        }

        // Verify token (Synchronous if callback is not passed)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists
        const currentUser = await prisma.user.findUnique({
            where: { id: decoded.id }
        });
        
        if (!currentUser) {
            logger.warn(`Auth Failed: User ${decoded.id} no longer exists. User must re-login.`);
            return res.status(401).json({ success: false, error: 'User no longer exists' });
        }

        if (!currentUser.active) {
            logger.warn(`Auth Failed: User ${decoded.id} account is deactivated.`);
            return res.status(401).json({ success: false, error: 'Account is deactivated' });
        }

        // Grant access to protected route
        req.user = currentUser;

        const requestContext = require('../utils/RequestContext');
        requestContext.run({ 
            organizationId: currentUser.organizationId, 
            role: currentUser.role, 
            userId: currentUser.id 
        }, () => {
            next();
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'Invalid token or login expired' });
    }
};

/**
 * Generate API Key for current user
 */
exports.generateApiKey = async (req, res) => {
    try {
        const { fullKey, hash, last4 } = generateUserApiKey(req.user.id);
        
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                apiKeyHash: hash,
                apiKeyLast4: last4
            }
        });

        res.status(200).json({
            success: true,
            apiKey: fullKey,
            apiKeyLast4: last4,
            message: 'API key generated successfully. Copy and store it now; it cannot be retrieved again.'
        });
    } catch (error) {
        logger.error('Generate API Key error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate API Key' });
    }
};

/**
 * Get all users filtered by specific roles (Management only)
 */
exports.getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            where: {
                role: { in: ['org_agent', 'org_manager'] }
            }
        });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
};

/**
 * Get clients for staff reference
 */
exports.getClients = async (req, res) => {
    try {
        const clients = await prisma.user.findMany({
            where: {
                role: { in: ['org_agent', 'org_manager', 'client'] }
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                addresses: true,
                carrierConfig: true,
                agentPolicy: true,
                organization: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        res.status(200).json({ success: true, data: clients });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch clients' });
    }
};

/**
 * Update User Markup/Surcharge (Admin/Manager)
 */
exports.updateUserSurcharge = async (req, res) => {
    try {
        const { organizationId, type, percentageValue, flatValue } = req.body;

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'organizationId is required' });
        }

        // Markup lives on Organization, not User
        const updatedOrg = await prisma.organization.update({
            where: { id: organizationId },
            data: {
                markup: {
                    type: type || 'PERCENTAGE',
                    percentageValue: percentageValue ?? 0,
                    flatValue: flatValue ?? 0
                }
            },
            select: { id: true, name: true, markup: true }
        });

        res.status(200).json({ success: true, data: updatedOrg });
    } catch (error) {
        logger.error('Update markup error:', error);
        res.status(500).json({ success: false, error: 'Failed to update markup' });
    }
};

/**
 * Admin: Reset a user's password
 */
exports.resetUserPassword = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const hashedPassword = await hashPassword(password);
        
        await prisma.user.update({
            where: { id: req.params.id },
            data: { password: hashedPassword }
        });

        logger.info(`Password reset for user ${req.params.id} by admin ${req.user.email}`);
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
};

/**
 * Helper middleware for RBAC
 */
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        next();
    };
};
