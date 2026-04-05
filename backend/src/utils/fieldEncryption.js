/**
 * Field-Level Encryption Utility (AES-256-GCM)
 * 
 * Encrypts sensitive JSON fields before storing in MySQL.
 * Decrypts when reading.
 * 
 * Uses the ENCRYPTION_KEY from environment (must be 64-char hex = 32 bytes).
 * 
 * @security AES-256-GCM provides authenticated encryption — tamper detection included.
 */
const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Get the encryption key from environment, validated.
 */
function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a JavaScript value (object, string, number) into a sealed envelope.
 * @param {*} value - The value to encrypt.
 * @returns {Object} { iv, data, tag } — all hex-encoded strings.
 */
function encrypt(value) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return {
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
        tag: authTag.toString('hex'),
        _encrypted: true // Marker for detection during reads
    };
}

/**
 * Decrypt a sealed envelope back to the original JavaScript value.
 * @param {Object} envelope - { iv, data, tag } from encrypt().
 * @returns {*} The decrypted JavaScript value.
 */
function decrypt(envelope) {
    if (!envelope || !envelope._encrypted) {
        // Not encrypted — return as-is (backward compatibility)
        return envelope;
    }

    try {
        const key = getKey();
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(envelope.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(envelope.data, 'hex')),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
        logger.error('Field decryption failed (possible key rotation or tamper):', error.message);
        return null; // Degraded — return null rather than crashing
    }
}

/**
 * Check if a value is an encrypted envelope.
 * @param {*} value 
 * @returns {boolean}
 */
function isEncrypted(value) {
    return value && typeof value === 'object' && value._encrypted === true;
}

module.exports = { encrypt, decrypt, isEncrypted };
