const mongoose = require('mongoose');

/**
 * Google Maps Address Intelligence Schema
 * 
 * This schema provides complete address storage with:
 * - Google Place ID for deduplication and reuse
 * - Coordinates for mapping and distance calculations
 * - Structured address components for carrier integration
 * - User supplements for delivery details
 * - Validation status tracking
 * 
 * @architecture This schema is embedded in User, Receiver, and Shipment models
 * to ensure consistent address handling across the system.
 */

const addressSchema = new mongoose.Schema({
    // =====================
    // GOOGLE PLACE DATA
    // =====================

    /** 
     * Google Place ID - Unique identifier for this location
     * Reuse this to avoid repeated geocoding API calls
     */
    placeId: {
        type: String,
        index: true
    },

    /**
     * Google-formatted full address string
     * Example: "123 Main St, Kuwait City, Kuwait"
     */
    formattedAddress: String,

    /**
     * Geographic coordinates for mapping
     */
    latitude: {
        type: Number,
        min: -90,
        max: 90
    },
    longitude: {
        type: Number,
        min: -180,
        max: 180
    },

    // =====================
    // STRUCTURED COMPONENTS
    // =====================

    /** Street number (e.g., "123") */
    streetNumber: String,

    /** Street/Route name (e.g., "Main St") */
    route: String,

    /** 
     * Combined street address lines
     * Line 1: Street address
     * Line 2: Additional info (unit, building)
     */
    streetLines: {
        type: [String],
        default: []
    },

    /** City/Locality */
    city: String,

    /** State/Province/Administrative Area */
    state: String,

    /** Postal/ZIP code */
    postalCode: String,

    /** Full country name */
    country: String,

    /** ISO 3166-1 alpha-2 country code (e.g., "KW", "AE") */
    countryCode: {
        type: String,
        default: 'KW',
        uppercase: true
    },

    // =====================
    // USER SUPPLEMENTS
    // =====================

    /** Apartment, Suite, Unit, Floor number */
    unitNumber: String,

    /** Building or complex name */
    buildingName: String,

    /** Nearby landmark for delivery */
    landmark: String,

    /** Special delivery instructions */
    deliveryNotes: String,

    // =====================
    // VALIDATION STATUS
    // =====================

    /**
     * Google Address Validation API result
     * - PENDING: Not yet validated
     * - CONFIRMED: Address verified as correct
     * - UNCONFIRMED: Could not verify, user accepted as-is
     * - CORRECTED: User accepted Google's correction
     */
    validationStatus: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'UNCONFIRMED', 'CORRECTED'],
        default: 'PENDING'
    },

    /** Timestamp of last validation */
    validatedAt: Date,

    /** Google's original response (for debugging) */
    validationVerdict: String,

    // =====================
    // CONTACT INFORMATION
    // =====================

    /** Company/Business name */
    company: String,

    /** Contact person name */
    contactPerson: {
        type: String,
        required: [true, 'Contact person is required']
    },

    /** Phone number (digits only) */
    phone: {
        type: String,
        required: [true, 'Phone number is required']
    },

    /** Phone country code with + prefix */
    phoneCountryCode: {
        type: String,
        default: '+965'
    },

    /** Email address */
    email: String,

    /** Client Reference (Internal or PO) */
    reference: String,

    /** VAT/Tax Number (For Customs) */
    vatNumber: String,

    /** EORI Number */
    eoriNumber: String,

    /** Tax ID (if different from VAT) */
    taxId: String,

    /** Trader Type (business, private, etc.) */
    traderType: {
        type: String, // 'business', 'private'
        default: 'business'
    },

    // =====================
    // METADATA
    // =====================

    /** User-defined label (e.g., "Home", "Office", "Warehouse") */
    label: {
        type: String,
        default: 'Default'
    },

    /** Is this the default address for this user? */
    isDefault: {
        type: Boolean,
        default: false
    }
}, {
    _id: false, // Embedded schema, no separate _id
    timestamps: false
});

/**
 * Virtual: Full phone number with country code
 */
addressSchema.virtual('fullPhone').get(function () {
    return `${this.phoneCountryCode}${this.phone}`;
});

/**
 * Virtual: Coordinates as GeoJSON Point
 */
addressSchema.virtual('geoPoint').get(function () {
    if (this.longitude && this.latitude) {
        return {
            type: 'Point',
            coordinates: [this.longitude, this.latitude]
        };
    }
    return null;
});

/**
 * Static: Create address from Google Place Details response
 */
addressSchema.statics.fromGooglePlace = function (placeDetails) {
    const components = placeDetails.address_components || [];

    const getComponent = (type) =>
        components.find(c => c.types.includes(type))?.long_name || '';
    const getShortComponent = (type) =>
        components.find(c => c.types.includes(type))?.short_name || '';

    return {
        placeId: placeDetails.place_id,
        formattedAddress: placeDetails.formatted_address,
        latitude: placeDetails.geometry?.location?.lat,
        longitude: placeDetails.geometry?.location?.lng,
        streetNumber: getComponent('street_number'),
        route: getComponent('route'),
        streetLines: [
            `${getComponent('street_number')} ${getComponent('route')}`.trim()
        ].filter(Boolean),
        city: getComponent('locality') || getComponent('administrative_area_level_2'),
        state: getComponent('administrative_area_level_1'),
        postalCode: getComponent('postal_code'),
        country: getComponent('country'),
        countryCode: getShortComponent('country'),
        validationStatus: 'PENDING'
    };
};

/**
 * Method: Normalize address for DHL API
 * @returns Object formatted for DHL shipment creation
 */
addressSchema.methods.toDhlFormat = function () {
    return {
        postalCode: this.postalCode || '',
        cityName: this.city || '',
        countryCode: this.countryCode || 'KW',
        addressLine1: this.streetLines[0] || this.formattedAddress?.split(',')[0] || '',
        addressLine2: this.unitNumber ? `${this.buildingName || ''} ${this.unitNumber}`.trim() : (this.streetLines[1] || ''),
        addressLine3: this.landmark || this.deliveryNotes || '',
        countyName: this.state || '',
    };
};

/**
 * Method: Normalize contact for DHL API
 * @returns Object formatted for DHL contact details
 */
addressSchema.methods.toDhlContact = function () {
    return {
        fullName: this.contactPerson,
        companyName: this.company || this.contactPerson,
        phone: this.fullPhone,
        email: this.email || '',
    };
};

module.exports = addressSchema;
