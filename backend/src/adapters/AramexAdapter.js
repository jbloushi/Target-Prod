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
                logger.info(`[AramexAdapter] Querying official Aramex Tracking API for ${trackingNumber}`);
                const officialResult = await this._fetchOfficialAramexTracking(trackingNumber);
                if (officialResult && officialResult.events && officialResult.events.length > 0) {
                    return officialResult;
                }
            } catch (err) {
                logger.warn(`[AramexAdapter] Official API failed, falling back to universal tracker: ${err.message}`);
            }
        }

        return universalTracking.getTracking('ARAMEX', trackingNumber);
    }

    async _fetchOfficialAramexTracking(awb) {
        const cleanAwb = String(awb || '').replace(/^TRK-/i, '').trim();
        const url = 'https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments';
        const payload = {
            ClientInfo: {
                UserName: this.username,
                Password: this.password,
                Version: 'v1.0',
                AccountNumber: this.accountNumber,
                AccountPin: this.accountPin,
                AccountEntity: this.accountEntity || 'KWI',
                AccountCountryCode: this.accountCountryCode || 'KW'
            },
            GetLastTrackingUpdateOnly: false,
            Shipments: [cleanAwb]
        };

        const res = await require('axios').post(url, payload, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            timeout: 10000
        });

        if (res.data?.HasErrors) {
            const errMsgs = (res.data.Notifications || []).map(n => n.Message).join(', ');
            throw new Error(`Aramex Tracking API error: ${errMsgs || 'Unknown error'}`);
        }

        const trackingResults = res.data?.TrackingResults;
        if (!trackingResults || !Array.isArray(trackingResults) || trackingResults.length === 0) {
            return null;
        }

        const rawEvents = trackingResults[0]?.Value || [];
        if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
            return null;
        }

        const events = rawEvents.map(evt => {
            const rawDate = evt.UpdateDateTime;
            let parsedDate = new Date();
            if (typeof rawDate === 'string' && rawDate.includes('/Date(')) {
                const match = rawDate.match(/\/Date\((\d+)([+-]\d+)?\)\//);
                if (match) parsedDate = new Date(parseInt(match[1], 10));
            } else if (rawDate) {
                parsedDate = new Date(rawDate);
            }

            const desc = evt.UpdateDescription || evt.Comments || 'Shipment update';
            const location = evt.UpdateLocation || 'Aramex Facility';
            const statusCode = this._mapAramexStatusCode(evt.UpdateCode, desc);

            return {
                timestamp: parsedDate.toISOString(),
                location,
                description: desc,
                statusCode
            };
        });

        return {
            status: events[events.length - 1]?.statusCode || 'in_transit',
            events
        };
    }

    _mapAramexStatusCode(code, desc = '') {
        const text = String(desc || '').toLowerCase();
        if (text.includes('delivered') || code === 'SH005' || code === 'SH006') return 'delivered';
        if (text.includes('out for delivery') || code === 'SH014' || code === 'SH041') return 'out_for_delivery';
        if (text.includes('collected') || text.includes('picked up') || code === 'SH001' || code === 'SH003') return 'picked_up';
        if (text.includes('arrived at') || text.includes('departed') || text.includes('in transit') || code === 'SH012' || code === 'SH016') return 'in_transit';
        return 'in_transit';
    }

    async track(trackingNumber) {
        return this.getTracking(trackingNumber);
    }
}

module.exports = AramexAdapter;
