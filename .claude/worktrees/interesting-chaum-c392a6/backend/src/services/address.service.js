const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Address Intelligence Service
 * 
 * Centralized service for Google Maps address operations:
 * - Places Autocomplete with session tokens
 * - Place Details retrieval
 * - Address Validation API
 * - Carrier-specific address normalization
 * 
 * @architecture This service abstracts all Google Maps API calls,
 * enabling easy testing, mocking, and cost optimization.
 */

const config = require('../config/config');
const GOOGLE_API_KEY = config.googleMapsApiKey;
const ALLOWED_COUNTRIES = (process.env.GOOGLE_ALLOWED_COUNTRIES || 'KW,AE,SA,QA,BH,OM,IN,US,GB,DE').split(',');

// Mock data for development/fallback
const MOCK_ADDRESSES = [
    { placeId: 'mock_kw_1', description: 'Kuwait City, Kuwait', city: 'Kuwait City', postalCode: '12345', countryCode: 'KW', lat: 29.3759, lng: 47.9774 },
    { placeId: 'mock_kw_2', description: 'Salmiya, Kuwait', city: 'Salmiya', postalCode: '22000', countryCode: 'KW', lat: 29.3339, lng: 48.0767 },
    { placeId: 'mock_ae_1', description: 'Dubai, United Arab Emirates', city: 'Dubai', postalCode: '00000', countryCode: 'AE', lat: 25.2048, lng: 55.2708 },
    { placeId: 'mock_sa_1', description: 'Riyadh, Saudi Arabia', city: 'Riyadh', postalCode: '11564', countryCode: 'SA', lat: 24.7136, lng: 46.6753 },
    { placeId: 'mock_de_1', description: 'Berlin, Germany', city: 'Berlin', postalCode: '10115', countryCode: 'DE', lat: 52.5200, lng: 13.4050 },
];

const MOCK_RATES = [
    { serviceName: 'DHL Express Worldwide', serviceCode: 'P', totalPrice: 45.00, currency: 'USD', deliveryDays: 3 },
    { serviceName: 'DHL Express 12:00', serviceCode: 'Y', totalPrice: 65.00, currency: 'USD', deliveryDays: 2 },
    { serviceName: 'DHL Economy Select', serviceCode: 'H', totalPrice: 28.00, currency: 'USD', deliveryDays: 7 },
];

class AddressService {
    constructor() {
        this.apiKey = GOOGLE_API_KEY;
        this.allowedCountries = ALLOWED_COUNTRIES;
    }

    /**
     * Check if we should use mock data
     */
    shouldUseMock() {
        // Only use mock if no API key is configured
        return !this.apiKey;
    }

    /**
     * Places Autocomplete - Get address suggestions
     * 
     * @param {string} query - User input
     * @param {string} sessionToken - UUID for session-based billing
     * @returns {Array} Address suggestions
     */
    async autocomplete(query, sessionToken = null) {
        if (!query || query.length < 3) {
            return [];
        }

        // Use mock in development
        if (this.shouldUseMock()) {
            const filtered = MOCK_ADDRESSES.filter(a =>
                a.description.toLowerCase().includes(query.toLowerCase())
            );
            return filtered.length > 0 ? filtered : MOCK_ADDRESSES.slice(0, 3);
        }

        try {
            const params = {
                input: query,
                key: this.apiKey,
                types: 'address',
                components: this.allowedCountries.map(c => `country:${c}`).join('|')
            };

            if (sessionToken) {
                params.sessiontoken = sessionToken;
            }

            const response = await axios.get(
                config.googleMapsAutocompleteUrl,
                { params }
            );

            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                logger.warn('Google Places API error:', response.data.status);
                return MOCK_ADDRESSES.slice(0, 3);
            }

            return (response.data.predictions || []).map(p => ({
                placeId: p.place_id,
                description: p.description,
                mainText: p.structured_formatting?.main_text || '',
                secondaryText: p.structured_formatting?.secondary_text || ''
            }));
        } catch (error) {
            logger.error('Autocomplete error:', error.message);
            // DEBUG: Return error details
            throw error;
            // return MOCK_ADDRESSES.slice(0, 3);
        }
    }

    /**
     * Get Place Details - Retrieve full address data
     * 
     * @param {string} placeId - Google Place ID
     * @param {string} sessionToken - Same token used in autocomplete (for billing)
     * @returns {Object} Structured address data
     */
    async getPlaceDetails(placeId, sessionToken = null) {
        // Handle mock placeIds
        if (placeId.startsWith('mock_')) {
            const mock = MOCK_ADDRESSES.find(a => a.placeId === placeId) || MOCK_ADDRESSES[0];
            return {
                placeId: mock.placeId,
                formattedAddress: mock.description,
                latitude: mock.lat,
                longitude: mock.lng,
                city: mock.city,
                postalCode: mock.postalCode,
                countryCode: mock.countryCode,
                streetLines: [mock.description.split(',')[0]],
                validationStatus: 'PENDING'
            };
        }

        if (this.shouldUseMock()) {
            const mock = MOCK_ADDRESSES[0];
            return {
                placeId: mock.placeId,
                formattedAddress: mock.description,
                latitude: mock.lat,
                longitude: mock.lng,
                city: mock.city,
                postalCode: mock.postalCode,
                countryCode: mock.countryCode,
                streetLines: [mock.description.split(',')[0]],
                validationStatus: 'PENDING'
            };
        }

        try {
            const params = {
                place_id: placeId,
                key: this.apiKey,
                fields: 'place_id,formatted_address,geometry,address_components'
            };

            if (sessionToken) {
                params.sessiontoken = sessionToken;
            }

            const response = await axios.get(
                config.googleMapsDetailsUrl,
                { params }
            );

            if (response.data.status !== 'OK') {
                logger.warn('Place Details API error:', response.data.status);
                return null;
            }

            const result = response.data.result;
            const components = result.address_components || [];

            const getComponent = (type) =>
                components.find(c => c.types.includes(type))?.long_name || '';
            const getShortComponent = (type) =>
                components.find(c => c.types.includes(type))?.short_name || '';

            return {
                placeId: result.place_id,
                formattedAddress: result.formatted_address,
                latitude: result.geometry?.location?.lat,
                longitude: result.geometry?.location?.lng,
                streetNumber: getComponent('street_number'),
                route: getComponent('route'),
                streetLines: [
                    `${getComponent('street_number')} ${getComponent('route')}`.trim()
                ].filter(s => s),
                city: getComponent('locality') || getComponent('administrative_area_level_2'),
                state: getComponent('administrative_area_level_1'),
                postalCode: getComponent('postal_code'),
                country: getComponent('country'),
                countryCode: getShortComponent('country'),
                validationStatus: 'PENDING'
            };
        } catch (error) {
            logger.error('Place Details error:', error.message);
            return null;
        }
    }

    /**
     * Address Validation API - Verify and correct addresses
     * 
     * @param {Object} address - Address to validate
     * @returns {Object} Validation result with verdict and corrections
     */
    async validateAddress(address) {
        // Mock validation in development
        if (this.shouldUseMock()) {
            return {
                verdict: 'CONFIRMED',
                validatedAddress: address,
                corrections: [],
                isComplete: true
            };
        }

        try {
            const payload = {
                address: {
                    regionCode: address.countryCode || 'KW',
                    locality: address.city,
                    postalCode: address.postalCode,
                    addressLines: address.streetLines || [address.formattedAddress]
                }
            };

            const response = await axios.post(
                `${config.googleMapsValidationUrl}?key=${this.apiKey}`,
                payload
            );

            const result = response.data.result;
            const verdict = result.verdict;

            // Determine validation status
            let status = 'UNCONFIRMED';
            if (verdict.addressComplete && verdict.hasUnconfirmedComponents === false) {
                status = 'CONFIRMED';
            } else if (verdict.hasReplacedComponents) {
                status = 'REQUIRES_CORRECTION';
            }

            return {
                verdict: status,
                validatedAddress: {
                    formattedAddress: result.address?.formattedAddress,
                    postalCode: result.address?.postalAddress?.postalCode,
                    city: result.address?.postalAddress?.locality,
                    countryCode: result.address?.postalAddress?.regionCode,
                    streetLines: result.address?.postalAddress?.addressLines || [],
                    latitude: result.geocode?.location?.latitude,
                    longitude: result.geocode?.location?.longitude,
                    placeId: result.geocode?.placeId
                },
                corrections: result.address?.unconfirmedComponentTypes || [],
                isComplete: verdict.addressComplete
            };
        } catch (error) {
            const status = error.response?.status;
            if (status === 403) {
                logger.error('Address Validation API 403 Forbidden. Check API Key restrictions and ensure "Address Validation API" is enabled.');
            } else {
                logger.error('Address Validation error:', error.message);
            }
            // Fallback: Accept as unconfirmed
            return {
                verdict: 'UNCONFIRMED',
                validatedAddress: address,
                corrections: [],
                isComplete: false,
                error: error.message
            };
        }
    }

    /**
     * Normalize address for DHL API
     * 
     * @param {Object} address - Address object
     * @returns {Object} DHL-formatted address
     */
    normalizeForDhl(address) {
        return {
            postalCode: address.postalCode || '',
            cityName: address.city || '',
            countryCode: address.countryCode || 'KW',
            addressLine1: address.streetLines?.[0] || address.formattedAddress?.split(',')[0] || '',
            addressLine2: address.unitNumber
                ? `${address.buildingName || ''} ${address.unitNumber}`.trim()
                : (address.streetLines?.[1] || ''),
            addressLine3: address.landmark || address.deliveryNotes || '',
            countyName: address.state || '',
        };
    }

    /**
     * Normalize contact for DHL API
     * 
     * @param {Object} address - Address object with contact info
     * @returns {Object} DHL-formatted contact
     */
    normalizeContactForDhl(address) {
        let fullPhone = address.phone || '';
        const prefix = address.phoneCountryCode || '+965';

        if (!fullPhone.startsWith(prefix)) {
            const prefixDigits = prefix.replace('+', '');
            if (fullPhone.startsWith(prefixDigits) && prefix.startsWith('+')) {
                fullPhone = `+${fullPhone}`;
            } else {
                fullPhone = `${prefix}${fullPhone}`;
            }
        }

        return {
            fullName: address.contactPerson || '',
            companyName: address.company || address.contactPerson || '',
            phone: fullPhone,
            email: address.email || '',
        };
    }
}

module.exports = new AddressService();
