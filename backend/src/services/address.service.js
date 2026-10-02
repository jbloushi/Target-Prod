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
        this.osmCache = new Map();
    }

    /**
     * Fallback search using OpenStreetMap Nominatim
     * @param {string} query 
     * @returns {Promise<Array>}
     */
    async searchNominatim(query) {
        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q: query,
                    format: 'json',
                    addressdetails: 1,
                    limit: 7
                },
                headers: {
                    'User-Agent': 'TargetLogistics/1.0 (support@target-kw.com)'
                },
                timeout: 5000
            });

            if (Array.isArray(response.data) && response.data.length > 0) {
                return response.data.map(item => {
                    const addr = item.address || {};
                    const countryCode = (addr.country_code || '').toUpperCase();
                    const city = addr.city || addr.town || addr.municipality || addr.state_district || addr.county || addr.state || '';
                    const mainText = item.name || addr.building || addr.road || addr.suburb || item.display_name.split(',')[0];
                    const secondaryText = [city, addr.country].filter(Boolean).join(', ');

                    const osmPlaceId = `osm_${item.place_id}`;
                    
                    // Maintain LRU size limit
                    if (this.osmCache.size > 500) {
                        const firstKey = this.osmCache.keys().next().value;
                        this.osmCache.delete(firstKey);
                    }

                    this.osmCache.set(osmPlaceId, {
                        placeId: osmPlaceId,
                        formattedAddress: item.display_name,
                        latitude: parseFloat(item.lat),
                        longitude: parseFloat(item.lon),
                        city: city,
                        postalCode: addr.postcode || '',
                        country: addr.country || '',
                        countryCode: countryCode,
                        streetLines: [
                            [addr.house_number, addr.road || mainText].filter(Boolean).join(' ') || item.display_name.split(',')[0]
                        ],
                        validationStatus: 'CONFIRMED'
                    });

                    return {
                        placeId: osmPlaceId,
                        description: item.display_name,
                        mainText: mainText,
                        secondaryText: secondaryText || item.display_name
                    };
                });
            }
            return [];
        } catch (err) {
            logger.warn('Nominatim fallback search error: ' + err.message);
            return [];
        }
    }

    /**
     * Check if we should use mock data
     */
    shouldUseMock() {
        return false;
    }

    /**
     * Places Autocomplete - Get address suggestions
     * 
     * @param {string} query - User input
     * @param {string} sessionToken - UUID for session-based billing
     * @returns {Array} Address suggestions
     */
    async autocomplete(query, sessionToken = null) {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const trimmedQuery = query.trim();

        // 1. Try Google Places API if key exists
        if (this.apiKey) {
            try {
                const params = {
                    input: trimmedQuery,
                    key: this.apiKey
                };

                // Google Places Autocomplete legacy API accepts max 5 country codes in components
                if (this.allowedCountries && this.allowedCountries.length > 0 && this.allowedCountries.length <= 5) {
                    params.components = this.allowedCountries.map(c => `country:${c.trim()}`).join('|');
                }

                if (sessionToken) {
                    params.sessiontoken = sessionToken;
                }

                const response = await axios.get(
                    config.googleMapsAutocompleteUrl,
                    { params, timeout: 5000 }
                );

                if (response.data.status === 'OK' && Array.isArray(response.data.predictions) && response.data.predictions.length > 0) {
                    return response.data.predictions.map(p => ({
                        placeId: p.place_id,
                        description: p.description,
                        mainText: p.structured_formatting?.main_text || p.description,
                        secondaryText: p.structured_formatting?.secondary_text || ''
                    }));
                } else if (response.data.status === 'ZERO_RESULTS') {
                    // Try Nominatim as fallback
                    const osmResults = await this.searchNominatim(trimmedQuery);
                    if (osmResults.length > 0) return osmResults;
                    return [];
                } else {
                    logger.warn(`Google Places API notice [${response.data.status}]: ${response.data.error_message || 'Falling back to OSM'}`);
                    const osmResults = await this.searchNominatim(trimmedQuery);
                    if (osmResults.length > 0) return osmResults;
                }
            } catch (error) {
                logger.warn(`Google Places autocomplete network error, falling back to OSM: ${error.message}`);
                const osmResults = await this.searchNominatim(trimmedQuery);
                if (osmResults.length > 0) return osmResults;
            }
        } else {
            const osmResults = await this.searchNominatim(trimmedQuery);
            if (osmResults.length > 0) return osmResults;
        }

        // 2. Final Fallback to MOCK_ADDRESSES filtered
        const filtered = MOCK_ADDRESSES.filter(a =>
            a.description.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
            a.city.toLowerCase().includes(trimmedQuery.toLowerCase())
        );
        return filtered.length > 0 ? filtered : [];
    }

    /**
     * Get Place Details - Retrieve full address data
     * 
     * @param {string} placeId - Google Place ID or OSM Place ID
     * @param {string} sessionToken - Same token used in autocomplete (for billing)
     * @returns {Object} Structured address data
     */
    async getPlaceDetails(placeId, sessionToken = null) {
        if (!placeId) return null;

        // Check OSM Cache
        if (this.osmCache.has(placeId)) {
            return this.osmCache.get(placeId);
        }

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
                country: mock.countryCode === 'KW' ? 'Kuwait' : (mock.countryCode === 'AE' ? 'United Arab Emirates' : (mock.countryCode === 'SA' ? 'Saudi Arabia' : 'Germany')),
                countryCode: mock.countryCode,
                streetLines: [mock.description.split(',')[0]],
                validationStatus: 'PENDING'
            };
        }

        // Handle OSM placeIds not in cache
        if (placeId.startsWith('osm_')) {
            const rawOsmId = placeId.replace('osm_', '');
            try {
                const osmRes = await axios.get('https://nominatim.openstreetmap.org/details', {
                    params: {
                        place_id: rawOsmId,
                        format: 'json',
                        addressdetails: 1
                    },
                    headers: {
                        'User-Agent': 'TargetLogistics/1.0 (support@target-kw.com)'
                    },
                    timeout: 5000
                });
                if (osmRes.data) {
                    const addr = osmRes.data.address || {};
                    const countryCode = (addr.country_code || '').toUpperCase();
                    const city = addr.city || addr.town || addr.municipality || addr.state || '';
                    return {
                        placeId,
                        formattedAddress: osmRes.data.localname || osmRes.data.calculated_postcode || '',
                        latitude: parseFloat(osmRes.data.centroid?.coordinates?.[1] || osmRes.data.lat || 0),
                        longitude: parseFloat(osmRes.data.centroid?.coordinates?.[0] || osmRes.data.lon || 0),
                        city,
                        postalCode: addr.postcode || '',
                        country: addr.country || '',
                        countryCode,
                        streetLines: [addr.road || addr.building || city || 'Main Street'],
                        validationStatus: 'CONFIRMED'
                    };
                }
            } catch (osmErr) {
                logger.warn('OSM Place Details lookup failed: ' + osmErr.message);
            }
        }

        if (!this.apiKey) {
            return null;
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
                { params, timeout: 5000 }
            );

            if (response.data.status !== 'OK') {
                logger.warn(`Place Details API warning [${response.data.status}]: ${response.data.error_message || ''}`);
                return null;
            }

            const result = response.data.result;
            const components = result.address_components || [];

            const getComponent = (type) =>
                components.find(c => c.types.includes(type))?.long_name || '';
            const getShortComponent = (type) =>
                components.find(c => c.types.includes(type))?.short_name || '';

                const countryCode = getShortComponent('country');
                let city = getComponent('locality') || getComponent('postal_town') || getComponent('administrative_area_level_2') || getComponent('sublocality');
                if (!city && countryCode === 'KW') city = 'Kuwait City';
                if (!city && countryCode === 'AE') city = 'Dubai';
                if (!city && countryCode === 'SA') city = 'Riyadh';
                if (!city && countryCode === 'QA') city = 'Doha';
                if (!city && countryCode === 'BH') city = 'Manama';
                if (!city && countryCode === 'OM') city = 'Muscat';

                return {
                    placeId: result.place_id,
                    formattedAddress: result.formatted_address,
                    latitude: result.geometry?.location?.lat,
                    longitude: result.geometry?.location?.lng,
                    streetNumber: getComponent('street_number'),
                    route: getComponent('route'),
                    streetLines: [
                        `${getComponent('street_number')} ${getComponent('route')}`.trim() || getComponent('sublocality') || getComponent('locality') || result.formatted_address?.split(',')[0]
                    ].filter(Boolean),
                    city,
                    state: getComponent('administrative_area_level_1'),
                    postalCode: getComponent('postal_code'),
                    country: getComponent('country'),
                    countryCode,
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
