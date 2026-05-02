/**
 * Mock Service for Document Storage.
 * In production, this would upload to S3.
 * Currently, it accepts Data URIs and "returns" them (or a pseudo-link).
 */
class CarrierDocumentService {

    /**
     * Uploads a document buffer/string to storage.
     * @param {string} type - 'label', 'invoice', etc.
     * @param {string|Buffer} content - Base64 or Buffer
     * @param {string} format - 'pdf', 'zpl'
     * @param {string} trackingNumber - Shipment ID to map the file
     * @returns {Promise<Object>} Metadata { url, storageKey, size }
     */
    async uploadDocument(type, content, format = 'pdf', trackingNumber = 'unknown') {
        const documentStorage = require('../utils/documentStorage');

        let fileUrl = content;
        let mockKey = `shipments/docs/${type}_${Date.now()}.${format}`;

        if (content && typeof content === 'string' && content.startsWith('data:')) {
            // Write to disk and store the relative URL
            const savedUrl = await documentStorage.saveDocument(trackingNumber, type, content);
            if (savedUrl) {
                fileUrl = savedUrl;
                mockKey = savedUrl;
            }
        }

        const size = content.length * 0.75;

        return {
            type,
            format,
            url: fileUrl, // Now an actual file path
            storageKey: mockKey,
            mime: format === 'pdf' ? 'application/pdf' : 'text/plain',
            size: Math.round(size),
            createdAt: new Date()
        };
    }

    /**
     * Generates a signed URL for a document.
     * @param {string} storageKey 
     * @returns {string} Public/Signed URL
     */
    async getSignedUrl(storageKey) {
        // Mock: In future, generate S3 Presigned URL
        return null;
    }
}

module.exports = new CarrierDocumentService();
