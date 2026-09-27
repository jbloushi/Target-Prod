/**
 * Carrier Tracking & Scraping Verification Tool
 * 
 * Usage:
 *   node backend/scripts/verify-carrier-scraping.js [CARRIER] [TRACKING_NUMBER]
 * Example:
 *   node backend/scripts/verify-carrier-scraping.js ARAMEX 33722238474
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');
const universalTracking = require('../src/services/UniversalTrackingService');
const CarrierFactory = require('../src/services/CarrierFactory');

async function verifyCarrierTracking() {
    const carrierCode = (process.argv[2] || 'ARAMEX').toUpperCase();
    const trackingNumber = process.argv[3] || '33722238474';

    console.log('====================================================');
    console.log(`🔍 DIAGNOSTIC: Tracking & Scraping Verification`);
    console.log(`Carrier:         ${carrierCode}`);
    console.log(`Tracking Number: ${trackingNumber}`);
    console.log(`Timestamp:       ${new Date().toISOString()}`);
    console.log('====================================================\n');

    // ─────────────────────────────────────────────────────────────
    // Check 1: 17TRACK Universal API
    // ─────────────────────────────────────────────────────────────
    console.log('[Check 1] Testing 17TRACK Universal API...');
    const seventeenTrackKey = process.env.UNIVERSAL_TRACKING_API_KEY || process.env.SEVENTEEN_TRACK_KEY || '43D9F3053FED94A45A61894DE003F640';
    console.log(`Using Key: ${seventeenTrackKey ? `${seventeenTrackKey.slice(0, 6)}...${seventeenTrackKey.slice(-4)}` : 'NONE'}`);

    try {
        const res = await axios.post('https://api.17track.net/track/v2.2/gettrackinfo', [{
            number: trackingNumber,
            carrier: carrierCode === 'ARAMEX' ? 100006 : undefined
        }], {
            headers: {
                '17token': seventeenTrackKey,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log(`✅ 17TRACK Status: HTTP ${res.status}`);
        const data = res.data;
        const accepted = data?.data?.accepted?.[0];
        const rawEvents = accepted?.track_info?.tracking?.providers?.[0]?.events || accepted?.track?.events || [];
        console.log(`   Checkpoints found: ${rawEvents.length}`);
        if (rawEvents.length > 0) {
            console.log(`   Latest Checkpoint: [${rawEvents[0].time_utc || rawEvents[0].time_iso}] ${rawEvents[0].description || rawEvents[0].z}`);
        }
    } catch (err) {
        console.log(`❌ 17TRACK Failed: HTTP ${err.response?.status || 'Network Error'}`);
        if (err.response?.data) {
            console.log('   Response Body:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.log('   Error Message:', err.message);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Check 2: Direct Carrier Public Web Scraper (FreeWebScraperService)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Check 2] Testing Direct Public Web Scraper (FreeWebScraperService)...');
    const freeScraper = require('../src/services/FreeWebScraperService');
    try {
        let scraped;
        if (carrierCode === 'ARAMEX') {
            scraped = await freeScraper.scrapeAramex(trackingNumber);
        } else if (carrierCode === 'FEDEX') {
            scraped = await freeScraper.scrapeFedex(trackingNumber);
        }

        if (scraped && scraped.events && scraped.events.length > 0) {
            console.log(`✅ Direct Scraper Succeeded! Status: ${scraped.status}, Checkpoints: ${scraped.events.length}`);
            scraped.events.forEach((ev, i) => {
                console.log(`   ${i + 1}. [${ev.timestamp}] (${ev.statusCode}) ${ev.description} - ${ev.location}`);
            });
        } else {
            console.log(`ℹ️ Direct Scraper returned 0 events (status: ${scraped?.status || 'unknown'})`);
        }
    } catch (err) {
        console.log(`❌ Direct Scraper error: ${err.message}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Check 3: Official Carrier API Credentials
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Check 3] Testing Official Carrier API Credentials...');
    if (carrierCode === 'ARAMEX') {
        const username = process.env.ARAMEX_USERNAME;
        const password = process.env.ARAMEX_PASSWORD;
        const accountNumber = process.env.ARAMEX_ACCOUNT_NUMBER;
        console.log(`ARAMEX_USERNAME:       ${username ? 'Configured (' + username + ')' : 'MISSING'}`);
        console.log(`ARAMEX_PASSWORD:       ${password ? 'Configured (hidden)' : 'MISSING'}`);
        console.log(`ARAMEX_ACCOUNT_NUMBER: ${accountNumber ? 'Configured (' + accountNumber + ')' : 'MISSING'}`);
    } else if (carrierCode === 'DGR') {
        console.log(`DHL_API_KEY: ${process.env.DHL_API_KEY ? 'Configured' : 'MISSING'}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Check 4: Full Adapter Invocation (What the platform executes)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Check 4] Executing Adapter via CarrierFactory...');
    try {
        const adapter = CarrierFactory.getAdapter(carrierCode);
        const result = await adapter.getTracking(trackingNumber);
        console.log('Adapter Result:');
        console.log(`   Status: ${result?.status || 'UNKNOWN'}`);
        console.log(`   Events Count: ${Array.isArray(result?.events) ? result.events.length : 0}`);
        if (result?.events?.length > 0) {
            console.log('   Checkpoints:');
            result.events.forEach((e, idx) => {
                console.log(`     ${idx + 1}. [${e.timestamp}] (${e.statusCode}) ${e.description} - ${e.location}`);
            });
        } else {
            console.log('   ⚠️ No events returned. Tracking timeline will show empty / pending.');
        }
    } catch (err) {
        console.log(`❌ Adapter threw error: ${err.message}`);
    }

    console.log('\n====================================================\n');
}

verifyCarrierTracking().catch(e => console.error(e));
