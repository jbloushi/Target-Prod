const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Saves a base64 encoded document to the local filesystem
 * @param {string} trackingNumber - Used for naming
 * @param {string} docType - 'label', 'awb', or 'invoice'
 * @param {string} base64Data - Raw base64 string
 * @returns {string} The public URL path to the saved file
 */
exports.saveDocument = async (trackingNumber, docType, base64Data) => {
    if (!base64Data) return null;

    try {
        const uploadsDir = path.join(__dirname, '../../uploads/documents');

        // Ensure directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const randomHash = crypto.randomBytes(4).toString('hex');
        const filename = `${trackingNumber}_${docType}_${randomHash}.pdf`;
        const filepath = path.join(uploadsDir, filename);

        // Strip data:application/pdf;base64, if present
        const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');

        // Write to disk
        fs.writeFileSync(filepath, cleanBase64, 'base64');

        // Return relative path for DB storage and frontend serving
        return `/uploads/documents/${filename}`;
    } catch (error) {
        logger.error(`Error saving document ${docType} for ${trackingNumber}:`, error);
        return null;
    }
};
