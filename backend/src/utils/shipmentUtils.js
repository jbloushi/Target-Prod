/**
 * Generates a standard tracking number: XXXX-XXXX-XXXX
 * @returns {string} Tracking Number
 */
exports.generateTrackingNumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if ((i + 1) % 4 === 0 && i < 11) result += '-';
    }
    return result;
};

/**
 * Generates a draft tracking number prefix for internal use.
 * @returns {string} Draft Tracking Number
 */
exports.generateDraftTrackingNumber = () => {
    return `DGR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
};
