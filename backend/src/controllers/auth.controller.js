const { prisma } = require('../config/database');
const { randomInt } = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { hashPassword, comparePassword, generateUserApiKey } = require('../utils/security');
const { getAuthToken, setAuthCookie, clearAuthCookie, isTrustedBrowserOrigin } = require('../utils/authCookies');

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

    // Remove sensitive fields from memory/output
    delete user.password;
    delete user.apiKeyHash;
    delete user.otp;
    delete user.chatwootAccessToken;

    setAuthCookie(res, token);
    res.status(statusCode).json({
        success: true,
        data: { user }
    });
};

/**
 * Unified Signup: Creates a new User and potentially a new Organization
 */
exports.signup = async (req, res) => {
    try {
        const { name, email, password, role: requestedRole, organizationName, company, phone } = req.body;
        const resolvedOrgName = organizationName || company || null;

        // SECURITY: Public signup is restricted to client/org_agent accounts only.
        if (requestedRole && !['org_agent', 'client'].includes(requestedRole)) {
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
            if (resolvedOrgName) {
                const org = await tx.organization.create({
                    data: {
                        name: resolvedOrgName,
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
                phone: phone || null,
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

        logger.debug('Attempting user login');
        
        // In Prisma, we pull the password explicitly if we want it, 
        // but here we just find the user.
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            logger.warn('Login failed: user not found');
            return res.status(401).json({ success: false, error: 'Incorrect email or password' });
        }

        // Compare password using new security utility
        const isMatch = await comparePassword(password, user.password);

        if (!isMatch) {
            logger.warn('Login failed: password mismatch');
            return res.status(401).json({ success: false, error: 'Incorrect email or password' });
        }

        if (user.active === false) {
            logger.warn('Login blocked: user is deactivated');
            return res.status(401).json({ success: false, error: 'Your account has been deactivated. Please contact support.' });
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
            logger.warn(`OTP request rejected: no registered account found for mobile ending ${cleanDigits.slice(-4)}`);
            return res.status(404).json({
                success: false,
                error: 'No registered user account found with this phone number. Please contact your administrator or sign up.'
            });
        }

        // Generate 6-digit OTP code
        const otp = String(randomInt(100000, 1000000));
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

        // Dispatch only through a named, approved WhatsApp authentication template.
        try {
            const whatsappService = require('../services/whatsappIntegration.service');
            const dispatch = await whatsappService.sendAuthOtp({
                phone: user.phone,
                name: user.name,
                otp
            });
            if (!dispatch || ['FAILED', 'SKIPPED'].includes(String(dispatch.status || '').toUpperCase())) {
                throw new Error('Approved authentication template was not accepted by a provider');
            }
        } catch (msgErr) {
            authOtpStore.delete(cleanDigits);
            if (userPhoneDigits && userPhoneDigits !== cleanDigits) authOtpStore.delete(userPhoneDigits);
            logger.warn('[Auth OTP Dispatch] Approved authentication template could not be sent');
            return res.status(503).json({
                success: false,
                error: 'Unable to send verification code right now. Please try again later.'
            });
        }

        logger.info(`[Auth OTP Generated] Verification code issued for mobile ending ${cleanDigits.slice(-4)}`);

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
        if (cleanDigits.length < 8) {
            return res.status(400).json({ success: false, error: 'Valid phone number is required (minimum 8 digits)' });
        }

        let record = authOtpStore.get(cleanDigits);

        // Fallback search across stored keys in case of country code difference
        if (!record) {
            for (const [key, val] of authOtpStore.entries()) {
                if (key === cleanDigits || (cleanDigits.length >= 8 && key.endsWith(cleanDigits)) || (key.length >= 8 && cleanDigits.endsWith(key))) {
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

        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts > 5) {
            authOtpStore.delete(cleanDigits);
            return res.status(429).json({ success: false, error: 'Too many failed verification attempts. Please request a new code.' });
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

        if (user.active === false) {
            return res.status(401).json({ success: false, error: 'Your account has been deactivated. Please contact support.' });
        }

        // Clean up OTP record
        authOtpStore.delete(cleanDigits);

        logger.info(`User ${user.id} successfully logged in via mobile OTP`);
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
        const bearerToken = /^Bearer\s+/i.test(req.headers.authorization || '');
        const token = getAuthToken(req);
        req.authViaCookie = !bearerToken && Boolean(token);

        if (!token) {
            return res.status(401).json({ success: false, error: 'You are not logged in' });
        }

        if (req.authViaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            if (!isTrustedBrowserOrigin(req.get('origin')) || req.get('sec-fetch-site') === 'cross-site') {
                return res.status(403).json({ success: false, error: 'Request origin is not allowed' });
            }
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
            if (req.authViaCookie) clearAuthCookie(res);
            logger.warn(`Auth Failed: User ${decoded.id} no longer exists. User must re-login.`);
            return res.status(401).json({ success: false, error: 'User no longer exists' });
        }

        if (!currentUser.active) {
            if (req.authViaCookie) clearAuthCookie(res);
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
        if (req.authViaCookie) clearAuthCookie(res);
        res.status(401).json({ success: false, error: 'Invalid token or login expired' });
    }
};

exports.optionalProtect = (req, res, next) => {
    if (!getAuthToken(req)) return next();
    return exports.protect(req, res, next);
};

exports.logout = (req, res) => {
    const bearerToken = /^Bearer\s+/i.test(req.headers.authorization || '');
    if (!bearerToken && getAuthToken(req) && !isTrustedBrowserOrigin(req.get('origin'))) {
        return res.status(403).json({ success: false, error: 'Request origin is not allowed' });
    }
    clearAuthCookie(res);
    return res.status(200).json({ success: true });
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
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                organizationId: true,
                active: true,
                createdAt: true
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

        const targetUser = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, role: true, organizationId: true, email: true }
        });

        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const caller = req.user;
        const isAdmin = ['admin', 'superadmin'].includes(caller.role);

        if (!isAdmin) {
            if (caller.role === 'org_manager') {
                if (!caller.organizationId || targetUser.organizationId !== caller.organizationId) {
                    return res.status(403).json({ success: false, error: 'Permission denied: Cannot reset password for users outside your organization' });
                }
                if (['admin', 'superadmin', 'manager', 'accounting', 'staff'].includes(targetUser.role)) {
                    return res.status(403).json({ success: false, error: 'Permission denied: Cannot reset password for privileged platform roles' });
                }
            } else if (!['manager', 'accounting'].includes(caller.role)) {
                return res.status(403).json({ success: false, error: 'Permission denied' });
            } else if (['admin', 'superadmin'].includes(targetUser.role)) {
                return res.status(403).json({ success: false, error: 'Permission denied: Cannot reset admin password' });
            }
        }

        const hashedPassword = await hashPassword(targetPassword);
        
        await prisma.user.update({
            where: { id: req.params.id },
            data: { password: hashedPassword }
        });

        logger.info(`Password reset for user ${req.params.id} by ${req.user.role} ${req.user.id}`);
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
