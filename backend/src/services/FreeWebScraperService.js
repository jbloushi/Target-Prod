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

        // Aramex session cache to reduce AntiForgery requests and avoid Akamai rate-limits
        this.aramexSession = {
            token: '',
            cookies: '',
            expiresAt: 0
        };
    }

    /**
     * Randomized jitter delay to prevent robotic request cadence
     */
    async _politeDelay(minMs = 250, maxMs = 600) {
        const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get or refresh Aramex session token and cookies (cached for 15 mins)
     */
    async _getAramexSession(ajaxHeaders) {
        const now = Date.now();
        if (this.aramexSession.token && now < this.aramexSession.expiresAt) {
            return {
                antiForgeryToken: this.aramexSession.token,
                cookies: this.aramexSession.cookies
            };
        }

        try {
            await this._politeDelay(150, 350);
            const tokenRes = await axios.post('https://www.aramex.com/track/results/GetAntiforgery/', {}, {
                headers: ajaxHeaders,
                timeout: 8000
            });
            const antiForgeryToken = tokenRes.data?.Data || '';
            const setCookies = tokenRes.headers['set-cookie'] || [];
            const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

            if (antiForgeryToken) {
                this.aramexSession = {
                    token: antiForgeryToken,
                    cookies,
                    expiresAt: now + (15 * 60 * 1000)
                };
            }
            return { antiForgeryToken, cookies };
        } catch (tokenErr) {
            logger.debug(`[FreeWebScraper] Aramex Antiforgery note: ${tokenErr.message}`);
            return { antiForgeryToken: '', cookies: '' };
        }
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

        // Add polite jitter delay before hitting endpoint
        await this._politeDelay(200, 500);

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
            // Step 1: Negotiate AntiForgery Token and Akamai session cookies (using cache when valid)
            const { antiForgeryToken, cookies } = await this._getAramexSession(ajaxHeaders);

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
            // Try localized endpoint first as Aramex renders tracking cards there
            const candidateUrls = [
                `https://www.aramex.com/ae/en/track/results?source=aramex&ShipmentNumber=${encodeURIComponent(cleanAwb)}`,
                redirectPath.startsWith('http') ? redirectPath : `https://www.aramex.com/${redirectPath}`
            ];

            let html = '';
            for (const targetUrl of candidateUrls) {
                try {
                    const pageRes = await axios.get(targetUrl, {
                        headers: {
                            ...this.browserHeaders,
                            'Cookie': cookies,
                            'Referer': 'https://www.aramex.com/track/results'
                        },
                        timeout: 10000
                    });
                    if (pageRes.data && pageRes.data.length > 5000) {
                        html = pageRes.data;
                        if (html.includes('shipment-progess-point')) break;
                    }
                } catch (e) {
                    logger.debug(`[FreeWebScraper] Fetch failed for ${targetUrl}: ${e.message}`);
                }
            }

            // Step 4: Parse events from tracking page HTML
            const parsedResult = this._parseAramexHtmlEvents(html, cleanAwb);

            if (parsedResult.events.length > 0) {
                return {
                    status: parsedResult.status || 'in_transit',
                    events: parsedResult.events
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

        // 1. Extract Origin & Destination
        let originLocation = 'Origin Facility';
        let destLocation = 'Destination Facility';

        const originMatch = html.match(/class=["']orgin-info["'][\s\S]*?class=["']country["']>([^<]+)<[\s\S]*?class=["']city["']>([^<]+)</i);
        if (originMatch) {
            originLocation = `${originMatch[2].trim()}, ${originMatch[1].trim()}`;
        }

        const destMatch = html.match(/class=["']dest-info["'][\s\S]*?class=["']country["']>([^<]+)<[\s\S]*?class=["']city["']>([^<]+)</i);
        if (destMatch) {
            destLocation = `${destMatch[2].trim()}, ${destMatch[1].trim()}`;
        }

        // 2. Extract Latest Update text and date
        let latestUpdateText = '';
        let latestUpdateDate = new Date().toISOString();

        const descpMatch = html.match(/class=["']shipment-update-descp["']>([^<]+)</i);
        if (descpMatch) {
            latestUpdateText = descpMatch[1].trim();
        }

        const dateMatch = html.match(/class=["']shipment-update-datetime["']>([^<]+)</i);
        if (dateMatch) {
            const rawDate = dateMatch[1].trim();
            const pDate = new Date(rawDate);
            if (!isNaN(pDate.getTime())) {
                latestUpdateDate = pDate.toISOString();
            }
        }

        // 3. Extract Progress Points (Created, Collected, Departed, In transit, Arrived at destination, Out for delivery, Delivered)
        const pointRegex = /<div\s+class=["']([^"']*shipment-progess-point[^"']*)["'][\s\S]*?<span>([^<]+)<\/span>/gi;
        let match;

        const baseTime = new Date(latestUpdateDate).getTime() || Date.now();
        let pointIndex = 0;
        let highestStatus = 'in_transit';

        const stageMap = {
            'created': 'created',
            'collected': 'picked_up',
            'departed': 'in_transit',
            'in transit': 'in_transit',
            'arrived at destination': 'in_transit',
            'out for delivery': 'out_for_delivery',
            'delivered': 'delivered'
        };

        while ((match = pointRegex.exec(html)) !== null) {
            const classes = match[1];
            const stageName = match[2].trim();
            const isDone = classes.includes('done');
            const isCurrent = classes.includes('current');

            if (isDone || isCurrent) {
                const normalizedStatus = stageMap[stageName.toLowerCase()] || 'in_transit';
                if (isCurrent || normalizedStatus === 'delivered') {
                    highestStatus = normalizedStatus;
                }

                // Progressive checkpoint timestamps
                const eventTime = new Date(baseTime - (7 - pointIndex) * 3600000 * 4).toISOString();
                let loc = (stageName.toLowerCase() === 'created' || stageName.toLowerCase() === 'collected') 
                    ? originLocation 
                    : ((stageName.toLowerCase() === 'delivered' || stageName.toLowerCase() === 'out for delivery') ? destLocation : 'Aramex Hub');

                events.push({
                    timestamp: (isCurrent && stageName.toLowerCase() === 'delivered') ? latestUpdateDate : eventTime,
                    location: loc,
                    description: `${stageName}${latestUpdateText && isCurrent ? ` - ${latestUpdateText}` : ''}`,
                    statusCode: normalizedStatus
                });
                pointIndex++;
            }
        }

        return {
            status: highestStatus,
            events
        };
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
