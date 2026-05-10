const crypto = require('crypto');

const TRACKING_PREFIXES = {
    INTERNAL: 'TGR',
    OTE: 'TRG',
    LOGESTECHS: 'TRG',
    DHL: 'DGR',
    DGR: 'DGR'
};

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
const getDraftTrackingPrefix = (carrierCode) => {
    const normalizedCarrier = String(carrierCode || 'DGR').toUpperCase();
    if (TRACKING_PREFIXES[normalizedCarrier]) return TRACKING_PREFIXES[normalizedCarrier];
    return normalizedCarrier.replace(/[^A-Z0-9]/g, '').substring(0, 3) || 'DGR';
};

exports.getDraftTrackingPrefix = getDraftTrackingPrefix;

exports.generateDraftTrackingNumber = (carrierCode = 'DGR') => {
    return `${getDraftTrackingPrefix(carrierCode)}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
};

const generateCarrierTrackingCandidate = (carrierCode = 'DGR') => {
    const prefix = getDraftTrackingPrefix(carrierCode);
    const suffix = crypto.randomBytes(8).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12);
    return `${prefix}-${suffix.padEnd(12, '0')}`;
};

exports.generateCarrierTrackingCandidate = generateCarrierTrackingCandidate;

exports.generateUniqueCarrierTrackingNumber = async (prisma, carrierCode = 'DGR', maxAttempts = 10) => {
    if (!prisma?.shipment?.findUnique) {
        throw new Error('A Prisma shipment client is required for unique tracking generation');
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const trackingNumber = generateCarrierTrackingCandidate(carrierCode);
        const existing = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!existing) return trackingNumber;
    }

    throw new Error(`Unable to generate a unique ${getDraftTrackingPrefix(carrierCode)} tracking number`);
};
