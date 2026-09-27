/**
 * Script: dispatch-pending-whatsapp.js
 * Safely dispatches queued/un-sent WhatsApp notifications for shipments
 * with strict double-action blockers (zero duplicates).
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_BASE = process.env.TARGET_API_URL || 'https://target-kw.com/api';
const ADMIN_EMAIL = process.env.TARGET_ADMIN_EMAIL || 'admin@target-kw.com';
const ADMIN_PASSWORD = process.env.TARGET_ADMIN_PASSWORD || 'TargetAdmin2026!';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function login() {
    console.log(`🔐 Authenticating with Target Admin API (${API_BASE})...`);
    const res = await axios.post(`${API_BASE}/auth/login`, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
    }, { timeout: 10000 });

    const token = res.data?.token;
    if (!token) throw new Error('Failed to obtain JWT token from login response');
    console.log(`✓ Authentication successful!`);
    return token;
}

async function fetchQueuedLogs(token) {
    console.log(`\n📋 Querying queued/un-sent WhatsApp notification records...`);
    let page = 1;
    let allLogs = [];

    while (true) {
        const res = await axios.get(`${API_BASE}/admin/whatsapp/logs`, {
            params: {
                status: 'QUEUED',
                limit: 100,
                page
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000
        });

        const logs = res.data?.logs || [];
        if (logs.length === 0) break;
        allLogs = allLogs.concat(logs);
        console.log(`  - Page ${page}: fetched ${logs.length} queued records (Running total: ${allLogs.length})`);
        if (logs.length < 100) break;
        page++;
    }

    return allLogs;
}

async function dispatchAll() {
    console.log('====================================================');
    console.log('Target Logistics - WhatsApp Safe Dispatcher');
    console.log('Strict Idempotency Guard: Zero Double Actions');
    console.log('====================================================\n');

    let token;
    try {
        token = await login();
    } catch (err) {
        console.error('❌ Authentication failed:', err.response?.data || err.message);
        process.exit(1);
    }

    const queuedLogs = await fetchQueuedLogs(token);
    console.log(`\n📦 Total pending records to process: ${queuedLogs.length}`);

    if (queuedLogs.length === 0) {
        console.log('🎉 No queued records found. All notifications are up to date!');
        process.exit(0);
    }

    const summary = {
        total: queuedLogs.length,
        dispatched: 0,
        skippedDuplicate: 0,
        failed: 0,
        errors: []
    };

    console.log('\n🚀 Starting safe sequential dispatch (300ms throttle between sends)...\n');

    for (let i = 0; i < queuedLogs.length; i++) {
        const log = queuedLogs[i];
        const progress = `[${i + 1}/${queuedLogs.length}]`;
        const identifier = `${log.trackingNumber} (${log.recipientRole} - ${log.recipientPhone})`;

        try {
            const res = await axios.post(
                `${API_BASE}/admin/whatsapp/resend/${log.id}`,
                { force: false }, // Maintain strict double-action blockers!
                {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 25000
                }
            );

            if (res.data?.success && res.data?.result?.status === 'SENT') {
                summary.dispatched++;
                const wamid = res.data?.result?.externalMessageId || 'N/A';
                console.log(`  ✓ ${progress} SENT: ${identifier} -> Message ID: ${wamid}`);
            } else if (res.data?.result?.status === 'SKIPPED' || res.data?.alreadySent) {
                summary.skippedDuplicate++;
                console.log(`  ⏸ ${progress} SKIPPED (Already Delivered): ${identifier}`);
            } else {
                summary.dispatched++;
                console.log(`  ✓ ${progress} PROCESSED: ${identifier} -> Status: ${res.data?.result?.status || 'OK'}`);
            }
        } catch (err) {
            const errData = err.response?.data;
            if (errData?.alreadySent || (errData?.error && errData.error.includes('already successfully delivered'))) {
                summary.skippedDuplicate++;
                console.log(`  ⏸ ${progress} BLOCKED DUPLICATE: ${identifier}`);
            } else {
                summary.failed++;
                const errMsg = errData?.error || err.message;
                summary.errors.push({ id: log.id, trackingNumber: log.trackingNumber, error: errMsg });
                console.log(`  ❌ ${progress} FAILED: ${identifier} -> ${errMsg}`);
            }
        }

        // Throttle 300ms between requests to respect Meta API rate limits
        await sleep(300);
    }

    console.log('\n====================================================');
    console.log('Safe Dispatch Summary:');
    console.log(`  - Total Processed:    ${summary.total}`);
    console.log(`  - Dispatched Live:    ${summary.dispatched}`);
    console.log(`  - Blocked Duplicates: ${summary.skippedDuplicate}`);
    console.log(`  - Failed:             ${summary.failed}`);
    console.log('====================================================');

    if (summary.errors.length > 0) {
        console.log('\nFirst 5 errors:');
        console.log(JSON.stringify(summary.errors.slice(0, 5), null, 2));
    }
}

dispatchAll().then(() => {
    console.log('\n✅ Dispatcher finished successfully.');
    process.exit(0);
}).catch(err => {
    console.error('Fatal dispatcher error:', err);
    process.exit(1);
});
