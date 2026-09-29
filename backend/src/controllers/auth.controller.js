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

// In-memory store for authentication OTPs: cleanPhone -> { otp, expiresAt, userId }
const authOtpStore = new Map();

/**
 * Request Mobile OTP for registered users
 * POST /api/auth/request-otp
 */
exports.requestOtp = async (req, res) => {
    try {
        const rawPhone = req.body.phone || req.body.mobile;
        if (!rawPhone) {
            return res.status(400).json({ success: false, error: 'Phone number is required' });
        }

        const cleanDigits = String(rawPhone).replace(/\D/g, '');
        if (cleanDigits.length < 7) {
            return res.status(400).json({ success: false, error: 'Please enter a valid phone number' });
        }

        // Look up registered user matching phone number
        const users = await prisma.user.findMany({
            where: {
                phone: { not: null }
            }
        });

        const user = users.find(u => {
            if (!u.phone) return false;
            const uDigits = String(u.phone).replace(/\D/g, '');
            return uDigits === cleanDigits || cleanDigits.endsWith(uDigits) || uDigits.endsWith(cleanDigits);
        });

        if (!user) {
            logger.warn(`OTP request rejected: No registered account found for mobile digits ${cleanDigits}`);
            return res.status(404).json({
                success: false,
                error: 'No registered user account found with this phone number. Please contact your administrator or sign up.'
            });
        }

        // Generate 6-digit OTP code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        const userPhoneDigits = String(user.phone || '').replace(/\D/g, '');
        const otpRecord = {
            otp,
            expiresAt,
            userId: user.id,
            cleanDigits,
            userPhoneDigits
        };

        authOtpStore.set(cleanDigits, otpRecord);
        if (userPhoneDigits && userPhoneDigits !== cleanDigits) {
            authOtpStore.set(userPhoneDigits, otpRecord);
        }

        // Dispatch OTP via WhatsApp / Chatwoot notification
        try {
            const whatsappService = require('../services/whatsappIntegration.service');
            await whatsappService.sendAuthOtp({
                phone: user.phone,
                name: user.name,
                otp
            });
        } catch (msgErr) {
            logger.warn(`[Auth OTP Dispatch note] ${msgErr.message}`);
        }

        logger.info(`[Auth OTP Generated] Mobile: ${cleanDigits} (User: ${user.email}) -> Code: ${otp}`);

        return res.status(200).json({
            success: true,
            message: `Verification code sent to registered mobile number ending in ${cleanDigits.slice(-4)}`,
            devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (error) {
        logger.error('Request OTP error:', error);
        return res.status(500).json({ success: false, error: 'Failed to send verification code' });
    }
};

/**
 * Verify Mobile OTP and Login User
 * POST /api/auth/verify-otp
 */
exports.verifyOtp = async (req, res) => {
    try {
        const rawPhone = req.body.phone || req.body.mobile;
        const otp = req.body.otp || req.body.code;

        if (!rawPhone || !otp) {
            return res.status(400).json({ success: false, error: 'Phone number and verification code are required' });
        }

        const cleanDigits = String(rawPhone).replace(/\D/g, '');
        let record = authOtpStore.get(cleanDigits);

        // Fallback search across stored keys in case of country code difference
        if (!record) {
            for (const [key, val] of authOtpStore.entries()) {
                if (key === cleanDigits || key.endsWith(cleanDigits) || cleanDigits.endsWith(key)) {
                    record = val;
                    break;
                }
            }
        }

        if (!record || Date.now() > record.expiresAt) {
            return res.status(400).json({
                success: false,
                error: 'Verification code has expired or was not requested. Please request a new code.'
            });
        }

        if (record.otp !== String(otp).trim()) {
            return res.status(401).json({
                success: false,
                error: 'Incorrect verification code. Please check and try again.'
            });
        }

        // Clean up used OTP
        authOtpStore.delete(cleanDigits);
        if (record.userPhoneDigits) authOtpStore.delete(record.userPhoneDigits);

        // Find verified user
        const user = await prisma.user.findUnique({
            where: { id: record.userId }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User account not found' });
        }

        // Clean up OTP record
        authOtpStore.delete(cleanDigits);

        logger.info(`User ${user.email} (${user.id}) successfully logged in via mobile OTP`);
        return createSendToken(user, 200, res);
    } catch (error) {
        logger.error('Verify OTP error:', error);
        return res.status(500).json({ success: false, error: 'Failed to verify code' });
    }
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
            where: { id: decoded.id },
            include: {
                accessScopes: {
                    where: { active: true },
                    select: {
                        scopeType: true,
                        organizationId: true,
                        clientUserId: true,
                        canCreateOnBehalf: true,
                        canViewShipments: true,
                        active: true
                    }
                }
            }
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
            apiKey: fullKey
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
 * Authenticated User: Change Own Password
 */
exports.changeMyPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, password } = req.body;
        const targetPassword = newPassword || password;

        if (!targetPassword || targetPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // If user currently has a password, verify current password
        if (user.password && currentPassword) {
            const isMatch = await comparePassword(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, error: 'Current password is incorrect' });
            }
        } else if (user.password && !currentPassword) {
            return res.status(400).json({ success: false, error: 'Current password is required' });
        }

        const hashedPassword = await hashPassword(targetPassword);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        logger.info(`User ${user.email} successfully changed their password`);
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'Failed to update password' });
    }
};

/**
 * Admin / Owner / Accounting: Reset a user's password
 */
exports.resetUserPassword = async (req, res) => {
    try {
        const { password, newPassword } = req.body;
        const targetPassword = password || newPassword;
        if (!targetPassword || targetPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const hashedPassword = await hashPassword(targetPassword);
        
        await prisma.user.update({
            where: { id: req.params.id },
            data: { password: hashedPassword }
        });

        logger.info(`Password reset for user ${req.params.id} by ${req.user.role} ${req.user.email}`);
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
