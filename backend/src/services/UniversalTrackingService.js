const axios = require('axios');
const logger = require('../utils/logger');
const freeScraper = require('./FreeWebScraperService');

/**
 * Universal Carrier Tracking Service
 * 
 * Routing Policy:
 * 1. FEDEX: TrackingMore API V4 (with public web scraper fallback).
 * 2. ARAMEX / OTE: Direct public web scraping via FreeWebScraperService.
 * 3. DHL / DGR: Direct official DHL Express API via DgrAdapter.
 */

class UniversalTrackingService {
    constructor() {
        this.trackingMoreKey = process.env.TRACKINGMORE_API_KEY || '2namvtfh-0o0m-0bb6-ob8a-7xk6wc5ggay6';
    }

    /**
     * Query tracking information for a carrier
     * @param {string} carrierCode - Carrier identifier ('FEDEX', 'ARAMEX', 'DHL', etc.)
     * @param {string} trackingNumber - Consignment AWB / tracking number
     * @returns {Promise<{ status: string, events: Array<{ timestamp: string, location: string, description: string, statusCode: string }> }>}
     */
    async getTracking(carrierCode, trackingNumber) {
        const normalizedCarrier = String(carrierCode || '').toUpperCase();
        const cleanTracking = String(trackingNumber || '')
            .replace(/^TRK-/i, '')
            .replace(/^ARM-/i, '')
            .replace(/^FED-/i, '')
            .trim();

        if (!cleanTracking) {
            return { status: 'pending', events: [] };
        }

        // 1. DHL / DGR: Official DHL Express API
        if (normalizedCarrier === 'DGR' || normalizedCarrier === 'DHL') {
            try {
                const DgrAdapter = require('../adapters/DgrAdapter');
                const dhlAdapter = new DgrAdapter();
                return await dhlAdapter.getTracking(cleanTracking);
            } catch (dhlErr) {
                logger.warn(`[UniversalTracking] DHL API tracking error for ${cleanTracking}: ${dhlErr.message}`);
                return { status: 'in_transit', events: [] };
            }
        }

        // 2. ARAMEX / OTE: Direct Public Web Scraper
        if (normalizedCarrier === 'ARAMEX' || normalizedCarrier === 'ARM' || normalizedCarrier === 'OTE') {
            try {
                const scraped = await freeScraper.scrapeAramex(cleanTracking);
                if (scraped && scraped.events && scraped.events.length > 0) {
                    return scraped;
                }
                return await this._scrapeAramexPublic(cleanTracking);
            } catch (aramexErr) {
                logger.warn(`[UniversalTracking] Aramex scraper error for ${cleanTracking}: ${aramexErr.message}`);
                return { status: 'in_transit', events: [] };
            }
        }

        // 3. FEDEX: TrackingMore API V4 (Primary) -> Web Scraper Fallback
        if (normalizedCarrier === 'FEDEX' || normalizedCarrier === 'FDX') {
            const tmKey = process.env.TRACKINGMORE_API_KEY || this.trackingMoreKey;
            if (tmKey) {
                try {
                    const tmResult = await this._fetchTrackingMore('fedex', cleanTracking, tmKey);
                    if (tmResult && tmResult.events && tmResult.events.length > 0) {
                        logger.info(`[UniversalTracking] TrackingMore returned ${tmResult.events.length} checkpoints for FedEx AWB #${cleanTracking}`);
                        return tmResult;
                    }
                } catch (tmErr) {
                    logger.warn(`[UniversalTracking] TrackingMore FedEx query for ${cleanTracking}: ${tmErr.message}`);
                }
            }

            // Fallback to FedEx web scraper
            try {
                const scraped = await freeScraper.scrapeFedex(cleanTracking);
                if (scraped && scraped.events && scraped.events.length > 0) {
                    return scraped;
                }
                return await this._scrapeFedexPublic(cleanTracking);
            } catch (fedexErr) {
                logger.warn(`[UniversalTracking] FedEx scraper fallback error for ${cleanTracking}: ${fedexErr.message}`);
            }

            return { status: 'in_transit', events: [] };
        }

        // 4. Generic Carrier Fallback
        return this._genericCarrierFallback(normalizedCarrier, cleanTracking);
    }

    /**
     * TrackingMore API V4 integration for FedEx with auto-registration
     * @private
     */
    async _fetchTrackingMore(courierCode, trackingNumber, apiKey) {
        const headers = {
            'Tracking-Api-Key': apiKey,
            'Content-Type': 'application/json'
        };

        // Step 1: Query existing tracking
        let item = null;
        try {
            const getRes = await axios.get(
                `https://api.trackingmore.com/v4/trackings/get?tracking_numbers=${encodeURIComponent(trackingNumber)}&courier_code=${encodeURIComponent(courierCode)}`,
                { headers, timeout: 8000 }
            );
            item = getRes.data?.data?.[0];
        } catch (getErr) {
            logger.debug(`[UniversalTracking] TrackingMore get note: ${getErr.response?.data?.meta?.message || getErr.message}`);
        }

        // Step 2: Auto-create tracking in TrackingMore if not registered yet
        if (!item || item.delivery_status === 'notfound') {
            try {
                const createRes = await axios.post(
                    'https://api.trackingmore.com/v4/trackings/create',
                    {
                        tracking_number: trackingNumber,
                        courier_code: courierCode
                    },
                    { headers, timeout: 8000 }
                );
                item = createRes.data?.data || item;
            } catch (createErr) {
                logger.debug(`[UniversalTracking] TrackingMore create note: ${createErr.response?.data?.meta?.message || createErr.message}`);
            }
        }

        if (!item) {
            return null;
        }

        // Extract scan events from origin_info and destination_info
        const originEvents = Array.isArray(item.origin_info?.trackinfo) ? item.origin_info.trackinfo : [];
        const destEvents = Array.isArray(item.destination_info?.trackinfo) ? item.destination_info.trackinfo : [];
        const rawEvents = [...originEvents, ...destEvents];

        if (rawEvents.length === 0) {
            if (item.delivery_status && item.delivery_status !== 'notfound') {
                return {
                    status: this._mapTrackingMoreStatus(item.delivery_status, item.substatus),
                    events: [],
                    carrierWeight: parseFloat(item.weight_kg || item.weight || 0),
                    carrierPieces: parseInt(item.pieces || 0, 10)
                };
            }
            return null;
        }

        const events = rawEvents.map((evt) => {
            const desc =
                evt.tracking_detail ||
                evt.details ||
                evt.checkpoint_delivery_substatus ||
                evt.checkpoint_delivery_status ||
                evt.checkpoint_status ||
                evt.StatusDescription ||
                'Carrier update';
            const location =
                evt.location ||
                [evt.city, evt.state, evt.country_iso2 || evt.country_iso].filter(Boolean).join(', ') ||
                'Carrier Facility';
            const statusCode = this._mapTrackingMoreStatus(
                evt.checkpoint_delivery_status || evt.checkpoint_status || evt.status,
                desc
            );
            return {
                timestamp:
                    evt.checkpoint_date || evt.Date
                        ? new Date(evt.checkpoint_date || evt.Date).toISOString()
                        : new Date().toISOString(),
                location,
                description: desc,
                statusCode
            };
        });

        // Deduplicate and sort chronologically
        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const latestEvent = events[events.length - 1];
        const overallStatus = this._mapTrackingMoreStatus(item.delivery_status, latestEvent?.description) || latestEvent?.statusCode || 'in_transit';

        const rawEst = item.expected_delivery || item.destination_info?.delivery_date || item.origin_info?.delivery_date || null;
        let estimatedDelivery = null;
        if (rawEst) {
            const parsedEst = new Date(rawEst);
            if (!Number.isNaN(parsedEst.getTime())) {
                estimatedDelivery = parsedEst;
            }
        }

        return {
            status: overallStatus,
            events,
            estimatedDelivery,
            carrierWeight: parseFloat(item.weight_kg || item.weight || 0),
            carrierPieces: parseInt(item.pieces || 0, 10)
        };
    }

    _mapTrackingMoreStatus(status, desc = '') {
        const s = String(status || '').toLowerCase();
        const text = String(desc || '').toLowerCase();

        if (s === 'delivered' || text.includes('delivered') || text.includes('signed')) return 'delivered';
        if (s === 'outfordelivery' || s === 'out_for_delivery' || text.includes('out for delivery') || text.includes('with courier')) return 'out_for_delivery';
        if (s === 'pickup' || s === 'picked_up' || text.includes('picked up') || text.includes('collected')) return 'picked_up';
        if (s === 'exception' || s === 'undelivered' || s === 'expired' || text.includes('exception') || text.includes('delayed') || text.includes('held')) return 'exception';
        if (s === 'transit' || s === 'in_transit' || text.includes('in transit') || text.includes('departed') || text.includes('arrived')) return 'in_transit';
        if (s === 'inforeceived' || s === 'pending') return 'booked';

        return 'in_transit';
    }

    /**
     * Public Aramex tracking scraper fallback
     * @private
     */
    async _scrapeAramexPublic(trackingNumber) {
        logger.info(`[UniversalTracking] Scraping Aramex public tracking for AWB #${trackingNumber}`);

        try {
            const url = `https://www.aramex.com/api/v2/shipment/track?shipmentNumber=${encodeURIComponent(trackingNumber)}`;
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    Accept: 'application/json, text/plain, */*',
                    Referer: 'https://www.aramex.com/us/en/track/results'
                },
                timeout: 8000
            });

            if (res.data && Array.isArray(res.data.events) && res.data.events.length > 0) {
                const events = res.data.events.map((e) => {
                    const desc = e.updateDescription || e.status || 'Carrier update';
                    const statusCode = this._mapTrackingMoreStatus(e.status, desc);
                    return {
                        timestamp: e.dateTime || new Date().toISOString(),
                        location: e.location || 'Aramex Facility',
                        description: desc,
                        statusCode
                    };
                });

                events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const latestEvent = events[events.length - 1];

                return {
                    status: latestEvent?.statusCode || 'in_transit',
                    events
                };
            }
        } catch (err) {
            logger.debug(`[UniversalTracking] Aramex direct scrape fallback: ${err.message}`);
        }

        return {
            status: 'in_transit',
            events: []
        };
    }

    /**
     * Public FedEx tracking scraper fallback
     * @private
     */
    async _scrapeFedexPublic(trackingNumber) {
        logger.info(`[UniversalTracking] Scraping FedEx public tracking for AWB #${trackingNumber}`);

        try {
            const payload =
                'data=' +
                encodeURIComponent(
                    JSON.stringify({
                        TrackPackagesRequest: {
                            appType: 'WTRK',
                            appDeviceType: 'DESKTOP',
                            supportHTML: true,
                            supportCurrentLocation: true,
                            uniqueKey: '',
                            processingParameters: {},
                            trackingInfoList: [
                                {
                                    trackNumberInfo: {
                                        trackingNumber: String(trackingNumber),
                                        trackingQualifier: '',
                                        trackingCarrier: ''
                                    }
                                }
                            ]
                        }
                    })
                ) +
                '&action=trackpackages&locale=en_US&version=1&format=json';

            const res = await axios.post('https://www.fedex.com/trackingCal/track', payload, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
            });

            const packageList = res.data?.TrackPackagesResponse?.packageList;
            if (Array.isArray(packageList) && packageList.length > 0 && Array.isArray(packageList[0]?.scanEventList)) {
                const events = packageList[0].scanEventList.map((evt) => {
                    const desc = evt.status || 'FedEx update';
                    const statusCode = this._mapTrackingMoreStatus(evt.status, desc);
                    return {
                        timestamp: evt.date && evt.time ? `${evt.date}T${evt.time}` : new Date().toISOString(),
                        location: evt.scanLocation || 'FedEx Sort Facility',
                        description: desc,
                        statusCode
                    };
                });

                events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const latestEvent = events[events.length - 1];

                return {
                    status: latestEvent?.statusCode || 'in_transit',
                    events
                };
            }
        } catch (err) {
            logger.debug(`[UniversalTracking] FedEx direct scrape fallback: ${err.message}`);
        }

        return {
            status: 'in_transit',
            events: []
        };
    }

    /**
     * Generic carrier fallback
     * @private
     */
    _genericCarrierFallback(carrierCode, trackingNumber) {
        return {
            status: 'in_transit',
            events: []
        };
    }
}

module.exports = new UniversalTrackingService();
