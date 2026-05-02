/**
 * DHL Normalizer Utilities
 */

/**
 * Remove invalid characters for DHL API (emojis, newlines in some fields)
 * @param {string} str 
 * @param {number} maxLength 
 * @returns {string}
 */
function cleanString(str, maxLength = 255) {
    if (!str) return '';
    // Remove emojis and non-printable chars (basic regex)
    let cleaned = str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    // Remove newlines and tabs, replace with space
    cleaned = cleaned.replace(/[\n\r\t]/g, ' ').trim();
    if (maxLength && cleaned.length > maxLength) {
        cleaned = cleaned.substring(0, maxLength);
    }
    return cleaned;
}

/**
 * Normalize phone number to stay within DHL limits (approx 25 chars)
 * @param {string} phone 
 * @returns {string}
 */
function normalizePhone(phone) {
    if (!phone) return '';
    // basic cleanup, keep +, numbers, maybe spaces
    return phone.replace(/[^0-9+\s-]/g, '').trim().substring(0, 25);
}

/**
 * Mask PII for logging
 * @param {string} str 
 * @returns {string}
 */
function maskPii(str) {
    if (!str || str.length < 4) return '****';
    if (str.includes('@')) {
        const [user, domain] = str.split('@');
        return `${user.substring(0, 1)}***@${domain}`;
    }
    // Phone or generic string
    return `${str.substring(0, 3)}****${str.slice(-3)}`;
}

/**
 * Split address into max 3 lines of 45 chars
 * @param {string} fullAddress 
 * @returns {Object} { addressLine1, addressLine2, addressLine3 }
 */
function splitAddress(fullAddress) {
    if (!fullAddress) return { addressLine1: '.' };
    const chunks = [];
    let remaining = cleanString(fullAddress, 500); // Allow long input before split
    while (remaining.length > 0 && chunks.length < 3) {
        let limit = 45;
        if (remaining.length > limit) {
            // Try to break at last space within limit
            let breakPoint = remaining.lastIndexOf(' ', limit);
            if (breakPoint === -1) breakPoint = limit; // Force break
            chunks.push(remaining.substring(0, breakPoint));
            remaining = remaining.substring(breakPoint).trim();
        } else {
            chunks.push(remaining);
            remaining = '';
        }
    }
    return {
        addressLine1: chunks[0] || '.',
        addressLine2: chunks[1],
        addressLine3: chunks[2]
    };
}

module.exports = {
    cleanString,
    normalizePhone,
    maskPii,
    splitAddress
};
