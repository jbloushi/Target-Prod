/**
 * Carrier Tracking & Scraping Verification Tool
 * 
 * Routing Policy:
 * 1. FEDEX: TrackingMore API V4 (with public web scraper fallback).
 * 2. ARAMEX: Direct public web scraping via FreeWebScraperService (or official SOAP/REST API).
 * 3. DHL: Direct official DHL Express API (DgrAdapter).
 * 
 * Usage:
 *   node backend/scripts/verify-carrier-scraping.js [CARRIER] [TRACKING_NUMBER]
 * Example:
 *   node backend/scripts/verify-carrier-scraping.js FEDEX 401092102883
 *   node backend/scripts/verify-carrier-scraping.js ARAMEX 33722238474
 *   node backend/scripts/verify-carrier-scraping.js DGR 100368200545
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const CarrierFactory = require('../src/services/CarrierFactory');
const freeScraper = require('../src/services/FreeWebScraperService');

async function verifyCarrierTracking() {
    const carrierCode = (process.argv[2] || 'FEDEX').toUpperCase();
    const trackingNumber = process.argv[3] || '401092102883';

    console.log('====================================================');
    console.log(`🔍 DIAGNOSTIC: Tracking & Scraping Verification`);
    console.log(`Carrier:         ${carrierCode}`);
    console.log(`Tracking Number: ${trackingNumber}`);
    console.log(`Timestamp:       ${new Date().toISOString()}`);
    console.log('====================================================\n');

    // ─────────────────────────────────────────────────────────────
    // Check 1: Tracking Engine Routing
    // ─────────────────────────────────────────────────────────────
    if (carrierCode === 'FEDEX' || carrierCode === 'FDX') {
        console.log('[FedEx] Testing TrackingMore API V4...');
        const trackingMoreKey = process.env.TRACKINGMORE_API_KEY || '2namvtfh-0o0m-0bb6-ob8a-7xk6wc5ggay6';
        console.log(`Using Key: ${trackingMoreKey ? `${trackingMoreKey.slice(0, 6)}...${trackingMoreKey.slice(-4)}` : 'NONE'}`);
    } else if (carrierCode === 'ARAMEX' || carrierCode === 'ARM' || carrierCode === 'OTE') {
        console.log('[Aramex] Testing FreeWebScraperService Scraper...');
        try {
            const scraped = await freeScraper.scrapeAramex(trackingNumber);
            console.log(`Direct Scraper result: status=${scraped?.status}, checkpoints=${scraped?.events?.length || 0}`);
        } catch (err) {
            console.log(`❌ Aramex Scraper Error: ${err.message}`);
        }
    } else if (carrierCode === 'DGR' || carrierCode === 'DHL') {
        console.log('[DHL] Official DHL Express API Config:');
        console.log(`DHL_API_KEY: ${process.env.DHL_API_KEY ? 'Configured' : 'MISSING'}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Check 2: Full Adapter Invocation (What the platform executes)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Execution] Calling CarrierFactory.getAdapter().getTracking()...');
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
            console.log('   ℹ️ No events returned or pending carrier registration.');
        }
    } catch (err) {
        console.log(`❌ Adapter threw error: ${err.message}`);
    }

    console.log('\n====================================================\n');
}

verifyCarrierTracking().catch((e) => console.error(e));
