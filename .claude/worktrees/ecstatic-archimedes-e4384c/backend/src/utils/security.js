const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Hash a plaintext password (bcrypt — correct for passwords)
 * @param {string} password 
 * @returns {Promise<string>}
 */
exports.hashPassword = async (password) => {
    return await bcrypt.hash(password, 12);
};

/**
 * Compare a plaintext password with a hash (bcrypt)
 * @param {string} candidatePassword 
 * @param {string} userPassword 
 * @returns {Promise<boolean>}
 */
exports.comparePassword = async (candidatePassword, userPassword) => {
    return await bcrypt.compare(candidatePassword, userPassword);
};

/**
 * Hash an API key using HMAC-SHA256 (replaces bcrypt for API keys).
 * 
 * @security HMAC-SHA256 is:
 *   - Orders of magnitude faster than bcrypt (~0.01ms vs ~200ms)
 *   - Cryptographically secure for key validation
 *   - Paired with timingSafeEqual for constant-time comparison
 * 
 * @param {string} fullKey - The full API key string (userId.randomBytes)
 * @returns {string} Hex-encoded HMAC hash
 */
exports.hashApiKey = (fullKey) => {
    const secret = process.env.API_KEY_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('API_KEY_SECRET (or JWT_SECRET) is required for API key hashing');
    }
    return crypto.createHmac('sha256', secret)
                 .update(fullKey)
                 .digest('hex');
};

/**
 * Compare a candidate API key against a stored hash using constant-time comparison.
 * @param {string} candidateKey - The API key provided in the request
 * @param {string} storedHash - The hash stored in the database
 * @returns {boolean} True if the key matches the hash
 */
exports.compareApiKey = (candidateKey, storedHash) => {
    try {
        const candidateHash = exports.hashApiKey(candidateKey);
        return crypto.timingSafeEqual(
            Buffer.from(candidateHash, 'hex'),
            Buffer.from(storedHash, 'hex')
        );
    } catch {
        return false;
    }
};

/**
 * Generate a new API Key for a user (HMAC-SHA256 hash)
 * @param {string} userId 
 * @returns {{fullKey: string, hash: string, last4: string}}
 */
exports.generateUserApiKey = (userId) => {
    const rawBytes = crypto.randomBytes(32).toString('hex');
    const fullKey = `${userId.toString()}.${rawBytes}`;
    
    const hash = exports.hashApiKey(fullKey);
    const last4 = rawBytes.slice(-4);
    
    return { fullKey, hash, last4 };
};

