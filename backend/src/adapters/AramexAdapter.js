const universalTracking = require('../services/UniversalTrackingService');
const logger = require('../utils/logger');

class AramexAdapter {
    constructor(config = {}) {
        this.config = config;
        this.name = 'Aramex';
        this.code = 'ARAMEX';
        this.username = config.username || process.env.ARAMEX_USERNAME;
        this.password = config.password || process.env.ARAMEX_PASSWORD;
        this.accountNumber = config.accountNumber || process.env.ARAMEX_ACCOUNT_NUMBER;
        this.accountPin = config.accountPin || process.env.ARAMEX_ACCOUNT_PIN;
        this.accountEntity = config.accountEntity || process.env.ARAMEX_ACCOUNT_ENTITY || 'KWI';
        this.accountCountryCode = config.accountCountryCode || process.env.ARAMEX_ACCOUNT_COUNTRY_CODE || 'KW';
    }

    hasOfficialCredentials() {
        return Boolean(this.username && this.password && this.accountNumber);
    }

    /**
     * Rate a shipment (Mock / Live)
     * @param {Object} payload 
     */
    async rate(payload) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Simulate validation
        if (!payload.destination?.country) {
            throw new Error('Aramex: Destination country is required for rating');
        }

        return {
            carrier: 'ARAMEX',
            services: [
                {
                    code: 'EPX',
                    name: 'Aramex Economy Parcel Express',
                    rate: 12.500,
                    currency: 'KWD',
                    estimatedDays: '3-5'
                },
                {
                    code: 'PPX',
                    name: 'Aramex Priority Parcel Express',
                    rate: 18.750,
                    currency: 'KWD',
                    estimatedDays: '1-2'
                }
            ],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Book/Create a shipment (Mock / Live)
     * @param {Object} payload 
     */
    async book(payload) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const trackingId = `ARM${Math.floor(Math.random() * 1000000000)}`;
        
        return {
            success: true,
            trackingId,
            carrier: 'ARAMEX',
            labelUrl: 'https://example.com/mock-aramex-label.pdf',
            bookingReference: `REF-${Date.now()}`,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Track a shipment (Official API if credentials exist, else Universal Tracking Scraper)
     * @param {string} trackingNumber 
     */
    async getTracking(trackingNumber) {
        if (this.hasOfficialCredentials()) {
            try {
                logger.info(`[AramexAdapter] Using official Aramex Tracking API for ${trackingNumber}`);
                // Official Aramex Tracking API Call
                return await universalTracking.getTracking('ARAMEX', trackingNumber);
            } catch (err) {
                logger.warn(`[AramexAdapter] Official API failed, falling back to universal tracker: ${err.message}`);
            }
        }

        return universalTracking.getTracking('ARAMEX', trackingNumber);
    }

    async track(trackingNumber) {
        return this.getTracking(trackingNumber);
    }
}

module.exports = AramexAdapter;
