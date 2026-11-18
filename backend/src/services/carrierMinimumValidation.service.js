/**
 * Unified Bar-Minimum Carrier Validation Service
 *
 * Validates the bar-minimum required fields (presence and basic validity,
 * without rigid character-length caps) across all supported carriers:
 * DGR, DGR2, SMSA, OTE, ARAMEX, INTERNAL.
 *
 * Returns { valid, errors: [{ field, step, message }], carrierCode }
 * so the frontend cockpit can focus the exact step and input field.
 */

const NON_POSTAL_COUNTRIES = Object.freeze(['KW', 'AE', 'QA', 'BH', 'OM', 'HK', 'IE']);

const SUPPORTED_CARRIERS = Object.freeze(['DGR', 'DGR2', 'SMSA', 'OTE', 'ARAMEX', 'INTERNAL']);

const COUNTRY_NAME_TO_CODE = Object.freeze({
    'kuwait': 'KW',
    'united arab emirates': 'AE',
    'uae': 'AE',
    'saudi arabia': 'SA',
    'qatar': 'QA',
    'bahrain': 'BH',
    'oman': 'OM',
    'united states': 'US',
    'usa': 'US',
    'united kingdom': 'GB',
    'uk': 'GB',
    'germany': 'DE',
    'canada': 'CA',
    'hong kong': 'HK',
    'ireland': 'IE',
});

const CARRIER_ALIASES = Object.freeze({
    DHL: 'DGR',
    DHL2: 'DGR2',
    LOGESTECHS: 'OTE',
    ARM: 'ARAMEX',
    SMSAEXPRESS: 'SMSA',
    MANUAL: 'INTERNAL',
});

/**
 * Normalize carrier code to canonical identifier.
 * @param {string} carrierCode
 * @returns {string}
 */
function normalizeCarrierCode(carrierCode) {
    const raw = String(carrierCode || 'DGR').trim().toUpperCase();
    return CARRIER_ALIASES[raw] || raw || 'DGR';
}

/**
 * Determine whether a country requires a postal / ZIP code.
 * Non-postal countries (KW, AE, QA, BH, OM, HK, IE) do not require postal codes.
 * @param {string} countryCode
 * @param {string} [countryName]
 * @returns {boolean}
 */
function isPostalCodeRequired(countryCode, countryName) {
    const code = String(countryCode || '').trim().toUpperCase();
    if (code && NON_POSTAL_COUNTRIES.includes(code)) {
        return false;
    }
    if (countryName) {
        const lower = String(countryName).trim().toLowerCase();
        const mapped = COUNTRY_NAME_TO_CODE[lower];
        if (mapped && NON_POSTAL_COUNTRIES.includes(mapped)) {
            return false;
        }
    }
    return true;
}

/**
 * Basic international phone validity: non-empty with at least 6 digits.
 * No rigid max-length caps.
 * @param {string} phone
 * @param {string} [dialCode]
 * @returns {boolean}
 */
function isValidPhone(phone, dialCode = '') {
    const raw = String(phone || '').trim();
    if (!raw) return false;
    const combined = dialCode && !raw.startsWith('+') && !raw.startsWith('00')
        ? `${dialCode}${raw}`
        : raw;
    const digits = combined.replace(/\D/g, '');
    return digits.length >= 6;
}

/**
 * Basic email validity check.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
    const raw = String(email || '').trim();
    if (!raw) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

/**
 * Extract 2-letter ISO country code from party object.
 * @param {Object} party
 * @returns {string}
 */
function extractCountryCode(party = {}) {
    const raw = String(party.countryCode || party.country || '').trim();
    if (/^[A-Za-z]{2}$/.test(raw)) {
        return raw.toUpperCase();
    }
    const mapped = COUNTRY_NAME_TO_CODE[raw.toLowerCase()];
    return mapped || '';
}

/**
 * Extract street address line 1 from party object.
 * @param {Object} party
 * @returns {string}
 */
function extractAddressLine1(party = {}) {
    const street0 = Array.isArray(party.streetLines) ? party.streetLines[0] : '';
    return String(
        party.addressLine1 ||
        party.addr1 ||
        street0 ||
        party.address ||
        party.formattedAddress ||
        ''
    ).trim();
}

/**
 * Validate a sender or receiver party object.
 * @param {Object} party
 * @param {'sender'|'receiver'} role
 * @param {number} step
 * @param {Array} errors
 */
function validateParty(party = {}, role, step, errors) {
    const label = role === 'sender' ? 'Sender' : 'Receiver';

    const name = String(party.name || party.contactPerson || party.contactName || '').trim();
    if (!name) {
        errors.push({
            field: `${role}_name`,
            step,
            message: `${label} name is required`
        });
    }

    if (!isValidPhone(party.phone, party.phoneCountryCode)) {
        errors.push({
            field: `${role}_phone`,
            step,
            message: `${label} phone number is required and must contain at least 6 digits`
        });
    }

    if (!isValidEmail(party.email)) {
        errors.push({
            field: `${role}_email`,
            step,
            message: `${label} email is required and must be valid`
        });
    }

    const countryCode = extractCountryCode(party);
    if (!/^[A-Z]{2}$/.test(countryCode)) {
        errors.push({
            field: `${role}_country`,
            step,
            message: `${label} 2-letter country code is required`
        });
    }

    const city = String(party.city || '').trim();
    if (!city) {
        errors.push({
            field: `${role}_city`,
            step,
            message: `${label} city is required`
        });
    }

    const addressLine1 = extractAddressLine1(party);
    if (!addressLine1) {
        errors.push({
            field: `${role}_addr1`,
            step,
            message: `${label} street address (addressLine1) is required`
        });
    }

    const postalCode = String(party.postalCode || party.zip || '').trim();
    if (isPostalCodeRequired(countryCode, party.country) && (!postalCode || postalCode === '00000')) {
        errors.push({
            field: `${role}_zip`,
            step,
            message: `${label} postal code is required for ${countryCode || 'this country'}`
        });
    }
}

/**
 * Validate bar-minimum required fields across all carriers.
 * Accepts either raw request payload or persisted Shipment record.
 *
 * @param {Object} payload
 * @param {Object} [options]
 * @param {string} [options.carrierCode]
 * @returns {{ valid: boolean, errors: Array<{ field: string, step: number, message: string }>, carrierCode: string }}
 */
function validateMinimumShipmentFields(payload = {}, options = {}) {
    const errors = [];
    const carrierCode = normalizeCarrierCode(options.carrierCode || payload.carrierCode);

    const sender = payload.sender || payload.origin || {};
    const receiver = payload.receiver || payload.destination || {};

    validateParty(sender, 'sender', 1, errors);
    validateParty(receiver, 'receiver', 2, errors);

    // Determine shipment type (documents vs non-documents/package)
    const rawType = String(payload.shipmentType || '').trim().toLowerCase();
    const isDocuments = payload.isDocument === true ||
        ['documents', 'document', 'document_express'].includes(rawType);

    // Extract parcels from parcels / packages / items / top-level fallback
    let parcels = [];
    if (Array.isArray(payload.parcels) && payload.parcels.length > 0) {
        parcels = payload.parcels;
    } else if (Array.isArray(payload.packages) && payload.packages.length > 0) {
        parcels = payload.packages;
    } else if (Array.isArray(payload.items) && payload.items.length > 0) {
        parcels = payload.items;
    } else if (payload.weight !== undefined || payload.length !== undefined || payload.description !== undefined) {
        parcels = [payload];
    }

    if (parcels.length === 0) {
        errors.push({
            field: 'pkg_weight',
            step: 3,
            message: 'At least one parcel with weight and dimensions is required'
        });
    } else {
        parcels.forEach((parcel, idx) => {
            const p = parcel || {};
            const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;

            if (!(Number(p.weight) > 0)) {
                errors.push({
                    field: `${pfx}_weight`,
                    step: 3,
                    message: `Parcel ${idx + 1} weight must be greater than 0`
                });
            }
            if (!(Number(p.length) > 0)) {
                errors.push({
                    field: `${pfx}_length`,
                    step: 3,
                    message: `Parcel ${idx + 1} length must be greater than 0`
                });
            }
            if (!(Number(p.width) > 0)) {
                errors.push({
                    field: `${pfx}_width`,
                    step: 3,
                    message: `Parcel ${idx + 1} width must be greater than 0`
                });
            }
            if (!(Number(p.height) > 0)) {
                errors.push({
                    field: `${pfx}_height`,
                    step: 3,
                    message: `Parcel ${idx + 1} height must be greater than 0`
                });
            }

            const description = String(p.description || p.contents || p.name || '').trim();
            if (!description) {
                errors.push({
                    field: `${pfx}_description`,
                    step: 3,
                    message: `Parcel ${idx + 1} description is required`
                });
            }
        });
    }

    // Non-document shipments require declaredValue > 0
    if (!isDocuments) {
        const parcelDeclaredTotal = parcels.reduce((sum, p) => {
            const qty = Math.max(1, Number(p?.qty || p?.quantity || 1));
            const val = Number(p?.declaredValue ?? p?.value ?? p?.customsValue ?? 0);
            return sum + (val > 0 ? val * qty : 0);
        }, 0);

        const topLevelDeclared = Number(
            payload.declaredValue ??
            payload.customsInvoice?.declaredValue ??
            payload.customs?.invoiceVal ??
            payload.documents?.declaredValue ??
            payload.invoiceValue ??
            0
        );

        if (!(parcelDeclaredTotal > 0 || topLevelDeclared > 0)) {
            errors.push({
                field: 'customs_invoiceVal',
                step: 5,
                message: 'Declared value (> 0) is required for non-document shipments'
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        carrierCode
    };
}

/**
 * Create an HTTP 400 Error instance carrying structured field & errors array.
 * Message starts with 'Validation Failed:' to integrate with controllerError.js.
 *
 * @param {{ errors: Array<{ field: string, step: number, message: string }> }} validationResult
 * @returns {Error}
 */
function buildValidationError(validationResult) {
    const errors = validationResult?.errors || [];
    const first = errors[0];
    const error = new Error(
        first ? `Validation Failed: ${first.message}` : 'Validation Failed'
    );
    error.statusCode = 400;
    error.field = first?.field || null;
    error.step = first?.step || null;
    error.errors = errors;
    error.isValidationError = true;
    return error;
}

module.exports = {
    NON_POSTAL_COUNTRIES,
    SUPPORTED_CARRIERS,
    normalizeCarrierCode,
    isPostalCodeRequired,
    isValidPhone,
    isValidEmail,
    validateMinimumShipmentFields,
    buildValidationError
};
