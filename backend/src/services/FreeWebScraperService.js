const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Free Carrier Web Scraper Service
 * 
 * Provides free public web scraping for carriers without requiring official corporate APIs:
 * 1. Aramex: Multi-step browser session emulation with Akamai token negotiation & HTML timeline extraction.
 * 2. FedEx: Desktop web tracking scraper with scan event parsing.
 * 3. Generic carrier fallback and status normalization.
 */

class FreeWebScraperService {
    constructor() {
        this.browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
            'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1'
        };
    }

    /**
     * Scrape Aramex public tracking page
     * @param {string} trackingNumber 
     * @returns {Promise<{ status: string, events: Array<{ timestamp: string, location: string, description: string, statusCode: string }> }>}
     */
    async scrapeAramex(trackingNumber) {
        const cleanAwb = String(trackingNumber || '').replace(/^TRK-/i, '').trim();
        if (!cleanAwb) return { status: 'pending', events: [] };

        logger.info(`[FreeWebScraper] Scraping Aramex public tracking for AWB #${cleanAwb}`);

        const ajaxHeaders = {
            'User-Agent': this.browserHeaders['User-Agent'],
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': this.browserHeaders['Accept-Language'],
            'sec-ch-ua': this.browserHeaders['sec-ch-ua'],
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'Referer': 'https://www.aramex.com/track/results',
            'X-Requested-With': 'XMLHttpRequest'
        };

        try {
            // Step 1: Negotiate AntiForgery Token and Akamai session cookies
            let cookies = '';
            let antiForgeryToken = '';

            try {
                const tokenRes = await axios.post('https://www.aramex.com/track/results/GetAntiforgery/', {}, {
                    headers: ajaxHeaders,
                    timeout: 8000
                });
                antiForgeryToken = tokenRes.data?.Data || '';
                const setCookies = tokenRes.headers['set-cookie'] || [];
                cookies = setCookies.map(c => c.split(';')[0]).join('; ');
            } catch (tokenErr) {
                logger.debug(`[FreeWebScraper] Aramex Antiforgery note: ${tokenErr.message}`);
            }

            // Step 2: Initialize tracking session card details
            let redirectPath = `track/results?source=aramex&ShipmentNumber=${encodeURIComponent(cleanAwb)}`;
            if (antiForgeryToken) {
                try {
                    const cardRes = await axios.post('https://www.aramex.com/track/results/TrackShippingCardsDetails/', {
                        model: [{ Text: cleanAwb }]
                    }, {
                        headers: {
                            ...ajaxHeaders,
                            'Cookie': cookies,
                            '__RequestVerificationToken': antiForgeryToken,
                            'Content-Type': 'application/json; charset=UTF-8'
                        },
                        timeout: 8000
                    });

                    if (cardRes.data?.Redirect) {
                        redirectPath = cardRes.data.Redirect.replace(/^\/?/, '');
                    }
                } catch (cardErr) {
                    logger.debug(`[FreeWebScraper] Aramex card session note: ${cardErr.message}`);
                }
            }

            // Step 3: Fetch public tracking result page with browser headers & session cookies
            const targetUrl = redirectPath.startsWith('http') ? redirectPath : `https://www.aramex.com/${redirectPath}`;
            const pageRes = await axios.get(targetUrl, {
                headers: {
                    ...this.browserHeaders,
                    'Cookie': cookies,
                    'Referer': 'https://www.aramex.com/track/results'
                },
                timeout: 10000
            });

            const html = pageRes.data || '';

            // Step 4: Parse events from tracking page HTML
            const events = this._parseAramexHtmlEvents(html, cleanAwb);

            if (events.length > 0) {
                events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const latestEvent = events[events.length - 1];
                return {
                    status: latestEvent.statusCode || 'in_transit',
                    events
                };
            }

            // Check if page explicitly indicated not found
            if (html.includes('No results found with current selection') || html.includes('track-shipment-list')) {
                logger.info(`[FreeWebScraper] Aramex public page loaded (AWB #${cleanAwb} registered or pending dispatch)`);
                return {
                    status: 'booked',
                    events: [{
                        timestamp: new Date().toISOString(),
                        location: 'Aramex Network',
                        description: 'Shipment recorded in Aramex tracking system',
                        statusCode: 'booked'
                    }]
                };
            }

        } catch (err) {
            logger.warn(`[FreeWebScraper] Aramex scrape failed for ${cleanAwb}: ${err.message}`);
        }

        return {
            status: 'in_transit',
            events: []
        };
    }

    /**
     * Parse tracking checkpoints from Aramex tracking HTML
     * @private
     */
    _parseAramexHtmlEvents(html, awb) {
        const events = [];
        const ignoredPhrases = [
            'only track 10 shipments',
            'enter multiple tracking',
            'check with your shipper',
            'no results found',
            'advanced tracking',
            'please make sure to check',
            'help center'
        ];

        // 1. Look for actual timeline updates in the cards
        const cardRegex = /<div[^>]*class=["'][^"']*(?:track-shipment-detail|tracking-timeline|shipment-event|card-text|checkpoint)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
        let cardMatch;

        while ((cardMatch = cardRegex.exec(html)) !== null) {
            const cardHtml = cardMatch[1];
            const cleanText = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const isIgnored = ignoredPhrases.some(p => cleanText.toLowerCase().includes(p));
            if (cleanText.length > 5 && !isIgnored) {
                const parsed = this._extractEventFromText(cleanText);
                if (parsed) events.push(parsed);
            }
        }

        // 2. Structured Checkpoint Regex (Date + Location/Status)
        const checkpointRegex = /([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}(?:\s+[0-9]{1,2}:[0-9]{2}(?:\s*[AP]M)?)?)\s*[-|–]?\s*([^<>\n\r]{5,100})/gi;
        let cpMatch;
        while ((cpMatch = checkpointRegex.exec(html)) !== null) {
            const dateStr = cpMatch[1];
            const descStr = cpMatch[2].trim();
            const isIgnored = ignoredPhrases.some(p => descStr.toLowerCase().includes(p));
            if (descStr && !isIgnored && !descStr.includes('{') && !descStr.includes('function') && descStr.length < 100) {
                const parsedDate = new Date(dateStr);
                const validDate = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
                events.push({
                    timestamp: validDate,
                    location: 'Aramex Facility',
                    description: descStr,
                    statusCode: this._mapStatus(descStr)
                });
            }
        }

        return events;
    }

    /**
     * Scrape FedEx public tracking
     * @param {string} trackingNumber 
     */
    async scrapeFedex(trackingNumber) {
        const cleanAwb = String(trackingNumber || '').replace(/^TRK-/i, '').trim();
        if (!cleanAwb) return { status: 'pending', events: [] };

        logger.info(`[FreeWebScraper] Scraping FedEx public tracking for AWB #${cleanAwb}`);

        try {
            const payload = 'data=' + encodeURIComponent(JSON.stringify({
                TrackPackagesRequest: {
                    appType: 'WTRK',
                    appDeviceType: 'DESKTOP',
                    supportHTML: true,
                    supportCurrentLocation: true,
                    uniqueKey: '',
                    processingParameters: {},
                    trackingInfoList: [{
                        trackNumberInfo: {
                            trackingNumber: String(cleanAwb),
                            trackingQualifier: '',
                            trackingCarrier: ''
                        }
                    }]
                }
            })) + '&action=trackpackages&locale=en_US&version=1&format=json';

            const res = await axios.post('https://www.fedex.com/trackingCal/track', payload, {
                headers: {
                    ...this.browserHeaders,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `https://www.fedex.com/fedextrack/?trknbr=${cleanAwb}`
                },
                timeout: 10000
            });

            const packageList = res.data?.TrackPackagesResponse?.packageList;
            if (Array.isArray(packageList) && packageList.length > 0 && Array.isArray(packageList[0]?.scanEventList)) {
                const events = packageList[0].scanEventList.map(evt => {
                    const desc = evt.status || 'FedEx update';
                    return {
                        timestamp: evt.date && evt.time ? `${evt.date}T${evt.time}` : new Date().toISOString(),
                        location: evt.scanLocation || 'FedEx Sort Facility',
                        description: desc,
                        statusCode: this._mapStatus(desc)
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
            logger.warn(`[FreeWebScraper] FedEx scrape note: ${err.message}`);
        }

        return {
            status: 'in_transit',
            events: []
        };
    }

    _extractEventFromText(text) {
        const lower = text.toLowerCase();
        const statusCode = this._mapStatus(lower);
        return {
            timestamp: new Date().toISOString(),
            location: 'Aramex Facility',
            description: text.slice(0, 120),
            statusCode
        };
    }

    _mapStatus(text = '') {
        const s = String(text).toLowerCase();
        if (s.includes('out for delivery') || s.includes('with courier') || s.includes('doorstep')) return 'out_for_delivery';
        if (s.includes('delivered') || s.includes('received by')) return 'delivered';
        if (s.includes('picked up') || s.includes('collected')) return 'picked_up';
        if (s.includes('exception') || s.includes('delayed') || s.includes('held') || s.includes('attempted')) return 'exception';
        if (s.includes('booked') || s.includes('created') || s.includes('record')) return 'booked';
        return 'in_transit';
    }
}

module.exports = new FreeWebScraperService();
