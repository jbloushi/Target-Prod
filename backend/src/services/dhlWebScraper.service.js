const axios = require('axios');
const logger = require('../utils/logger');
const {
    normalizeStatus,
    normalizeCarrierStatus,
    DHL_CHECKPOINT_MAP,
    DHL_STATUS_MAP,
    isNegativeOrExceptionPhrase
} = require('../constants/statusConstants');

/**
 * Normalizes offset string into canonical format (+HH:MM / -HH:MM)
 */
function normalizeOffset(value) {
    if (!value) return '';
    const text = String(value).trim().replace(/^UTC\s*/i, '').replace(/^GMT\s*/i, '');
    const match = text.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return '';
    const hours = match[2].padStart(2, '0');
    const minutes = (match[3] || '00').padStart(2, '0');
    return `${match[1]}${hours}:${minutes}`;
}

/**
 * Combines date, time, and offset strings into a local ISO timestamp string
 */
function combineDateTime(dateValue, timeValue, offsetValue) {
    if (!dateValue || !timeValue) return '';
    const date = String(dateValue).trim();
    const time = String(timeValue).trim();
    if (!date || !time) return '';
    const normalizedDate = date.includes('T') ? date.split('T')[0] : date;
    const normalizedTime = time.replace(/\.\d+$/, '');
    const offset = normalizeOffset(offsetValue);
    return `${normalizedDate}T${normalizedTime}${offset}`;
}

/**
 * Extracts normalized UTC timestamp, local timestamp string, and timezone offset
 */
function extractTrackingTimestamp(event = {}) {
    const firstNonEmpty = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '');
    const localTimestamp = firstNonEmpty(
        event.localTimestamp,
        event.timestampWithOffset,
        event.timestampWithTimezone,
        event.eventTimestampWithOffset,
        combineDateTime(
            firstNonEmpty(event.date, event.eventDate, event.checkpointDate),
            firstNonEmpty(event.time, event.eventTime, event.checkpointTime),
            firstNonEmpty(event.gmtOffset, event.GMTOffset, event.timezoneOffset, event.utcOffset)
        ),
        event.timestamp,
        event.eventTimestamp,
        event.dateTime
    );

    let timestamp = null;
    if (localTimestamp) {
        const parsed = new Date(localTimestamp);
        if (!Number.isNaN(parsed.getTime())) {
            timestamp = parsed.toISOString();
        }
    }

    return {
        timestamp,
        localTimestamp: localTimestamp ? String(localTimestamp).trim() : null,
        timezoneOffset: normalizeOffset(firstNonEmpty(event.gmtOffset, event.GMTOffset, event.timezoneOffset, event.utcOffset))
    };
}

class DhlWebScraperService {
    constructor() {
        this.timeoutMs = 8000; // 8-10 second anti-hang guard
        this.browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/html, application/xhtml+xml, */*;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
            'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };
    }

    async _politeDelay(minMs = 200, maxMs = 500) {
        if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
            return;
        }
        const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Scrape DHL tracking info from public web endpoints
     * @param {string} trackingNumber 
     * @returns {Promise<{
     *   status: string,
     *   description: string,
     *   carrierCode: string,
     *   trackingNumber: string,
     *   estimatedDelivery: Date|null,
     *   carrierWeight?: number,
     *   carrierPieces?: number,
     *   events: Array<{ statusCode: string, description: string, timestamp: string, localTimestamp: string, timezoneOffset: string, location: string }>
     * }>}
     */
    async scrapeDhl(trackingNumber) {
        const cleanAwb = String(trackingNumber || '')
            .replace(/^DGR-/i, '')
            .replace(/^DHL-/i, '')
            .replace(/^TRK-/i, '')
            .trim();

        if (!cleanAwb) {
            return {
                status: 'pending',
                description: 'Awaiting carrier tracking',
                carrierCode: 'DGR',
                trackingNumber: '',
                estimatedDelivery: null,
                events: []
            };
        }

        logger.info(`[DhlWebScraper] Initiating DHL public web tracking lookup for AWB #${cleanAwb}`);
        await this._politeDelay(150, 400);

        // Candidate public tracking endpoints
        const candidateUrls = [
            `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(cleanAwb)}`,
            `https://www.dhl.com/utapi?trackingNumber=${encodeURIComponent(cleanAwb)}`
        ];

        let lastError = null;

        for (const url of candidateUrls) {
            try {
                const response = await axios.get(url, {
                    headers: this.browserHeaders,
                    timeout: this.timeoutMs
                });

                if (response?.data) {
                    const parsed = this._parseDhlResponse(response.data, cleanAwb);
                    if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
                        return parsed;
                    }
                }
            } catch (err) {
                lastError = err;
                logger.debug(`[DhlWebScraper] Candidate endpoint ${url} failed for ${cleanAwb}: ${err.message}`);
            }
        }

        // HTML page fallback if API endpoints returned no data
        try {
            const htmlUrl = `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(cleanAwb)}`;
            const htmlRes = await axios.get(htmlUrl, {
                headers: {
                    ...this.browserHeaders,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: this.timeoutMs
            });

            if (htmlRes?.data && typeof htmlRes.data === 'string') {
                const parsedHtml = this._parseDhlHtml(htmlRes.data, cleanAwb);
                if (parsedHtml && Array.isArray(parsedHtml.events) && parsedHtml.events.length > 0) {
                    return parsedHtml;
                }
            }
        } catch (htmlErr) {
            logger.debug(`[DhlWebScraper] HTML fallback failed for ${cleanAwb}: ${htmlErr.message}`);
        }

        if (lastError && lastError.response?.status && lastError.response.status !== 404) {
            logger.warn(`[DhlWebScraper] Scraper failed for ${cleanAwb}: ${lastError.message}`);
        }

        return {
            status: 'pending',
            description: 'No tracking checkpoints available',
            carrierCode: 'DGR',
            trackingNumber: cleanAwb,
            estimatedDelivery: null,
            events: []
        };
    }

    _parseDhlResponse(data, trackingNumber) {
        if (!data || typeof data !== 'object') return null;

        const shipment = Array.isArray(data.shipments) ? data.shipments[0] : (data.shipment || data);
        if (!shipment || typeof shipment !== 'object') return null;

        const rawEvents = (Array.isArray(shipment.events) ? shipment.events : []).map((e) => {
            const trackingTimestamp = extractTrackingTimestamp(e);
            const rawCode = String(e.statusCode || e.code || e.type || '').trim().toUpperCase();
            const desc = e.description || e.status || e.remark || 'Shipment update';
            const loc = e.serviceArea?.[0]?.description || e.location?.description || e.location?.address?.addressLocality || e.location || 'Unknown';

            return {
                statusCode: rawCode || 'DF',
                description: desc,
                timestamp: trackingTimestamp.timestamp,
                localTimestamp: trackingTimestamp.localTimestamp,
                timezoneOffset: trackingTimestamp.timezoneOffset,
                location: typeof loc === 'object' ? (loc.addressLocality || loc.description || 'Unknown') : String(loc)
            };
        }).filter((ev) => ev.timestamp);

        const dedupedEvents = this._dedupeMinuteJitter(rawEvents);

        // Piece & weight extraction
        const weightVal = parseFloat(shipment.details?.weight || shipment.weight?.value || shipment.weight || shipment.totalWeight || 0);
        const piecesVal = parseInt(shipment.details?.pieces || shipment.pieces?.value || shipment.pieces || shipment.numberOfPieces || shipment.totalPieces || 0, 10);

        // ETA extraction
        const rawEst = shipment.estimatedTimeOfDelivery || shipment.estimatedDeliveryDateAndTime || shipment.status?.estimatedDeliveryDate || null;
        let estimatedDelivery = null;
        if (rawEst) {
            const parsed = new Date(rawEst);
            if (!Number.isNaN(parsed.getTime())) {
                estimatedDelivery = parsed;
            }
        }

        // Status normalization: Checkpoint code priority over descriptive text
        const topStatusCode = String(shipment.status?.statusCode || shipment.status?.code || '').toLowerCase().trim();
        const topDesc = shipment.status?.description || shipment.status?.status || '';
        const latestEvent = dedupedEvents.length > 0 ? dedupedEvents[0] : null;
        const latestCode = (latestEvent?.statusCode || '').toLowerCase();
        let normalizedStatus = null;

        if (latestCode && DHL_CHECKPOINT_MAP[latestCode]) {
            normalizedStatus = DHL_CHECKPOINT_MAP[latestCode];
        } else if (topStatusCode && DHL_CHECKPOINT_MAP[topStatusCode]) {
            normalizedStatus = DHL_CHECKPOINT_MAP[topStatusCode];
        } else if (topStatusCode && DHL_STATUS_MAP[topStatusCode]) {
            normalizedStatus = DHL_STATUS_MAP[topStatusCode];
        } else if (latestEvent) {
            normalizedStatus = normalizeCarrierStatus(latestEvent.description, 'DGR', latestEvent.statusCode);
        } else {
            normalizedStatus = normalizeCarrierStatus(topDesc, 'DGR', topStatusCode);
        }

        return {
            status: normalizedStatus || 'in_transit',
            description: topDesc || dedupedEvents[0]?.description || 'DHL Express tracking update',
            carrierCode: 'DGR',
            trackingNumber,
            estimatedDelivery,
            carrierWeight: weightVal > 0 ? weightVal : undefined,
            carrierPieces: piecesVal > 0 ? piecesVal : undefined,
            events: dedupedEvents
        };
    }

    _parseDhlHtml(html, trackingNumber) {
        if (!html || typeof html !== 'string') return null;

        // Try embedded Next.js or ld+json payload
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                const parsedJson = JSON.parse(nextDataMatch[1]);
                const pageProps = parsedJson?.props?.pageProps;
                if (pageProps) {
                    const trackingData = pageProps.trackingData || pageProps.shipment || pageProps;
                    const res = this._parseDhlResponse(trackingData, trackingNumber);
                    if (res && res.events.length > 0) return res;
                }
            } catch (e) {
                logger.debug(`[DhlWebScraper] Embedded Next.js JSON parse error: ${e.message}`);
            }
        }

        // Fallback: regex checkpoint scan on HTML lines
        const events = [];
        const checkpointRegex = /\b(OK|DF|PU|AF|PL|WC|CC|BA|NH|OH|FD|RT)\b/gi;
        const dateRegex = /\b(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)(?:\s*([+-]\d{2}:?\d{2}))?\b/;

        const lines = html.split(/<\/tr>|<\/div>|<\/li>/i);
        for (const line of lines) {
            const dateMatch = line.match(dateRegex);
            const codeMatch = line.match(checkpointRegex);
            if (dateMatch && codeMatch) {
                const dateStr = dateMatch[1];
                const timeStr = dateMatch[2];
                const offsetStr = dateMatch[3] || '+03:00';
                const code = codeMatch[0].toUpperCase();
                const cleanText = line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                const ts = extractTrackingTimestamp({
                    date: dateStr,
                    time: timeStr,
                    gmtOffset: offsetStr
                });

                if (ts.timestamp) {
                    events.push({
                        statusCode: code,
                        description: cleanText.substring(0, 120),
                        timestamp: ts.timestamp,
                        localTimestamp: ts.localTimestamp,
                        timezoneOffset: ts.timezoneOffset,
                        location: 'DHL Express Facility'
                    });
                }
            }
        }

        if (events.length === 0) return null;

        const dedupedEvents = this._dedupeMinuteJitter(events);
        const latest = dedupedEvents[0];
        const latestCode = (latest.statusCode || '').toLowerCase();
        const status = DHL_CHECKPOINT_MAP[latestCode] || normalizeStatus(latest.statusCode);

        return {
            status,
            description: latest.description,
            carrierCode: 'DGR',
            trackingNumber,
            estimatedDelivery: null,
            events: dedupedEvents
        };
    }

    _dedupeMinuteJitter(events = []) {
        const seen = new Map();
        for (const ev of events) {
            if (!ev || !ev.timestamp) continue;
            const t = new Date(ev.timestamp);
            const minuteBucket = !Number.isNaN(t.getTime()) ? Math.floor(t.getTime() / 60000) : '';
            const key = [
                ev.statusCode || '',
                (ev.description || '').trim().toLowerCase(),
                minuteBucket,
                (ev.location || '').trim().toLowerCase()
            ].join('|');

            const prior = seen.get(key);
            if (!prior || new Date(ev.timestamp) < new Date(prior.timestamp)) {
                seen.set(key, ev);
            }
        }

        return Array.from(seen.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
}

module.exports = new DhlWebScraperService();
module.exports.DhlWebScraperService = DhlWebScraperService;
module.exports.extractTrackingTimestamp = extractTrackingTimestamp;
