const logger = require('../utils/logger');

let puppeteer = null;
let StealthPlugin = null;
try {
    puppeteer = require('puppeteer-extra');
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
} catch (e) {
    logger.warn(`[AramexHeadlessScraper] Puppeteer dependencies not loaded: ${e.message}`);
}

class AramexHeadlessScraper {
    /**
     * Locate Chrome or Chromium executable on Windows or Linux
     */
    static getExecutablePath() {
        const fs = require('fs');
        const os = require('os');
        const platform = os.platform();

        if (platform === 'win32') {
            const winPaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
            ];
            for (const p of winPaths) {
                if (p && fs.existsSync(p)) return p;
            }
        } else {
            // Linux (Ubuntu VPS)
            const linuxPaths = [
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            ];
            for (const p of linuxPaths) {
                if (fs.existsSync(p)) return p;
            }
        }
        return undefined; // Puppeteer fallback if bundled
    }

    /**
     * Scrape tracking details and history for an Aramex AWB
     * @param {string} trackingNumber 
     * @returns {Promise<{ status: string, events: Array<{ timestamp: string, location: string, description: string, statusCode: string }> }>}
     */
    static async scrapeAwb(trackingNumber) {
        const cleanAwb = String(trackingNumber || '').replace(/^TRK-/i, '').trim();
        if (!cleanAwb || !puppeteer) {
            return { status: 'in_transit', events: [] };
        }

        const execPath = this.getExecutablePath();
        logger.info(`[AramexHeadlessScraper] Scraping AWB ${cleanAwb} using headless browser (exec: ${execPath || 'default'})...`);

        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                executablePath: execPath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-accelerated-2d-canvas'
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

            let searchResultJson = null;

            // Intercept internal track-shipment search JSON response
            page.on('response', async (res) => {
                const url = res.url();
                if (url.includes('app-dotcom-track-shipment/track-shipment/search')) {
                    try {
                        const json = await res.json();
                        if (json && json.Success && json.Data?.SearchShipmentsResult) {
                            searchResultJson = json;
                        }
                    } catch (e) {}
                }
            });

            await page.goto('https://www.aramex.com/ae/en/track/shipments', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Reject cookie banner if present to avoid intercepting clicks
            try {
                const rejectCookieBtn = await page.$('.cky-btn-reject');
                if (rejectCookieBtn) await rejectCookieBtn.click();
            } catch (e) {}

            // Enter tracking number
            await page.waitForSelector('#TrackingCardsNumber', { timeout: 8000 });
            await page.type('#TrackingCardsNumber', cleanAwb);

            // Click track button
            await page.waitForSelector('#btn-trackresult-tracksubmit', { timeout: 5000 });
            await page.click('#btn-trackresult-tracksubmit');

            // Wait up to 10 seconds for intercepted response or URL transition
            for (let i = 0; i < 20; i++) {
                if (searchResultJson) break;
                await new Promise(r => setTimeout(r, 500));
            }

            if (searchResultJson) {
                return this._mapAramexJsonToResult(searchResultJson, cleanAwb);
            }

            // Fallback: evaluate DOM if JSON was not intercepted
            const domData = await page.evaluate((awb) => {
                const bodyText = document.body.innerText || '';
                if (!bodyText.includes(awb)) return null;

                const isDelivered = bodyText.includes('Delivered');
                const isOutForDelivery = bodyText.includes('Out for Delivery');
                return { isDelivered, isOutForDelivery };
            }, cleanAwb);

            if (domData) {
                const status = domData.isDelivered ? 'delivered' : domData.isOutForDelivery ? 'out_for_delivery' : 'in_transit';
                return {
                    status,
                    events: [{
                        timestamp: new Date().toISOString(),
                        location: 'Aramex In Transit',
                        description: domData.isDelivered ? 'Delivered' : 'In Transit',
                        statusCode: status
                    }]
                };
            }

            return { status: 'in_transit', events: [] };
        } catch (err) {
            logger.warn(`[AramexHeadlessScraper] Error scraping ${cleanAwb}: ${err.message}`);
            return { status: 'in_transit', events: [] };
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {}
            }
        }
    }

    /**
     * Map Aramex API Search Result JSON to standard tracking response
     * @private
     */
    static _mapAramexJsonToResult(json, cleanAwb) {
        const item = json.Data?.SearchShipmentsResult?.[0];
        if (!item) return { status: 'in_transit', events: [] };

        const hawb = item.HAWBEntity || {};
        const historyList = item.HAWBHistoryEntity || [];

        // Map status
        const rawStatus = (item.TrackingStatus || hawb.CurrentStatus || '').toLowerCase();
        let status = 'in_transit';
        if (rawStatus.includes('delivered')) status = 'delivered';
        else if (rawStatus.includes('out for delivery')) status = 'out_for_delivery';
        else if (rawStatus.includes('picked up') || rawStatus.includes('collected')) status = 'picked_up';
        else if (rawStatus.includes('record created') || rawStatus.includes('created')) status = 'created';

        // Map chronological checkpoints
        const events = historyList.map(h => {
            const rawDate = h.ActionDate || h.EntryDate;
            let timestamp = new Date().toISOString();
            if (rawDate) {
                const parsed = new Date(rawDate);
                if (!isNaN(parsed.getTime())) {
                    timestamp = parsed.toISOString();
                }
            }

            const location = h.UpdateLocationFormatted || h.UpdateCountry || hawb.DestinationCity || 'In Transit';
            const description = h.CustomerDescription || h.TrackingCodeDescription || h.Comments1 || 'Shipment Update';
            const statusCode = (h.Condition === 'DLVD' || description.toLowerCase().includes('delivered'))
                ? 'delivered'
                : (description.toLowerCase().includes('out for delivery') ? 'out_for_delivery' : 'in_transit');

            return {
                timestamp,
                location,
                description,
                statusCode
            };
        });

        // Ensure chronological ascending order for display
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        logger.info(`[AramexHeadlessScraper] Successfully parsed ${events.length} history checkpoints for AWB #${cleanAwb} (Status: ${status})`);
        return {
            status,
            events
        };
    }
}

module.exports = AramexHeadlessScraper;
