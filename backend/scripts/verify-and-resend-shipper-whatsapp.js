#!/usr/bin/env node
/**
 * Verify & Resend Shipper WhatsApp Confirmations (Past N Days)
 *
 * Defaults to 100% READ-ONLY DRY-RUN mode (sends zero messages unless --send is passed).
 * Cross-checks local ShipmentNotificationLog rows against live Chatwoot message statuses
 * to detect messages that were recorded as SENT in Target DB on locked Inbox 1
 * but actually failed in Chatwoot with "131031: Business Account locked".
 *
 * Usage:
 *   node scripts/verify-and-resend-shipper-whatsapp.js --days=3 --dry-run
 *   node scripts/verify-and-resend-shipper-whatsapp.js --days=3 --send
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { prisma } = require('../src/config/database');
const chatwootService = require('../src/services/chatwootNotificationService');

function maskPhone(p) {
    const s = String(p || '').replace(/\D/g, '');
    if (s.length < 4) return '****';
    return `+${s.slice(0, 3)}***${s.slice(-3)}`;
}

function parseArgs() {
    const args = process.argv.slice(2);
    let days = 3;
    let send = false;
    let limit = null;

    for (const arg of args) {
        if (arg === '--send') {
            send = true;
        } else if (arg === '--dry-run') {
            send = false;
        } else if (arg.startsWith('--days=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val >= 0) days = val;
        } else if (arg.startsWith('--limit=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val > 0) limit = val;
        }
    }

    return { days, send, limit };
}

async function run() {
    const { days, send, limit } = parseArgs();
    await chatwootService.refreshDbCredentialsIfNeeded();

    const now = new Date();
    const sinceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 0, 0, 0));

    console.log('================================================================');
    console.log(`Mode:       ${send ? 'LIVE RESEND (--send)' : 'READ-ONLY VERIFICATION (--dry-run)'}`);
    console.log(`Window:     Since ${sinceDate.toISOString()} (Past ${days} days + today)`);
    console.log('================================================================\n');

    // 1. Fetch all real shipments created since sinceDate
    const rawShipments = await prisma.shipment.findMany({
        where: {
            createdAt: { gte: sinceDate },
            status: { notIn: ['cancelled', 'CANCELLED', 'draft', 'DRAFT'] }
        },
        orderBy: { createdAt: 'desc' }
    });
    const shipments = rawShipments.filter((s) => {
        const trk = String(s.trackingNumber || '').toUpperCase();
        if (trk.startsWith('DEMO') || trk === 'DGR-DS10LTHVPTA0') return false;
        return true;
    });

    // 2. Fetch all shipper notification logs for these shipments
    const shipmentIds = shipments.map((s) => s.id);
    const logs = shipmentIds.length > 0
        ? await prisma.shipmentNotificationLog.findMany({
            where: {
                shipmentId: { in: shipmentIds },
                recipientRole: { in: ['sender', 'shipper', 'merchant'] }
            },
            orderBy: { createdAt: 'desc' }
        })
        : [];

    // 3. Batch-fetch live Chatwoot message statuses by conversationId
    const convIds = [...new Set(logs.map((l) => l.chatwootConversationId).filter(Boolean))];
    const cwMsgMap = new Map();
    for (const convId of convIds) {
        try {
            const res = await chatwootService.request('get', `/api/v1/accounts/1/conversations/${convId}/messages`);
            for (const m of (res.payload || [])) {
                cwMsgMap.set(String(m.id), {
                    status: m.status,
                    inboxId: m.inbox_id,
                    hasWamid: Boolean(m.source_id),
                    error: m.content_attributes?.external_error || null
                });
            }
        } catch (_) {}
    }

    const toResend = [];
    const alreadySentOk = [];
    const noPhone = [];

    for (const s of shipments) {
        const billId = s.documents?.phenixBillId || '-';
        const senderName = s.origin?.name || s.OriginCompany || s.origin?.company || s.customerName || 'Sender';
        const senderPhone = s.origin?.phone || s.shipperPhone || s.customerPhone || null;
        const sLogs = logs.filter((l) => l.shipmentId === s.id);

        let genuineSuccess = null;
        let latestDetail = 'NO_LOG_CREATED';
        let existingLogId = sLogs[0]?.id || null;
        let existingEventType = sLogs[0]?.eventType || 'shipment_created';

        for (const l of sLogs) {
            const cw = l.chatwootMessageId ? cwMsgMap.get(String(l.chatwootMessageId)) : null;
            const dbStatus = String(l.status || '').toUpperCase();
            if (cw) {
                const isFailed = cw.status === 'failed' || Boolean(cw.error);
                if (!isFailed && cw.hasWamid && ['delivered', 'read', 'sent'].includes(cw.status) && Number(cw.inboxId) === 2) {
                    genuineSuccess = { cwMsgId: l.chatwootMessageId, cwStatus: cw.status, inboxId: cw.inboxId };
                    break;
                } else {
                    latestDetail = `CW[inb=${cw.inboxId},id=${l.chatwootMessageId}]: ${cw.status}${cw.error ? ` (${cw.error})` : ''}`;
                }
            } else if (['DELIVERED', 'READ'].includes(dbStatus) || (['SENT', 'SUBMITTED'].includes(dbStatus) && l.provider !== 'chatwoot' && String(l.chatwootInboxId) === '2')) {
                genuineSuccess = { cwMsgId: l.chatwootMessageId || '-', cwStatus: dbStatus, inboxId: l.chatwootInboxId || l.provider };
                break;
            } else {
                latestDetail = `DB[${l.provider || '-'},inb=${l.chatwootInboxId || '-'}]: ${dbStatus}${l.errorMessage ? ` (${l.errorMessage.slice(0, 40)})` : ''}`;
            }
        }

        const row = {
            tracking: s.trackingNumber,
            bill: billId,
            carrier: s.carrierCode || '-',
            created: s.createdAt.toISOString().slice(0, 16).replace('T', ' '),
            sender: String(senderName).slice(0, 20),
            phone: senderPhone ? maskPhone(senderPhone) : 'MISSING',
            detail: genuineSuccess
                ? `OK: ${genuineSuccess.cwStatus} (inb=${genuineSuccess.inboxId}, msg=${genuineSuccess.cwMsgId})`
                : latestDetail
        };

        if (!senderPhone) {
            noPhone.push(row);
        } else if (genuineSuccess) {
            alreadySentOk.push(row);
        } else {
            toResend.push({ row, shipment: s, existingLogId, existingEventType });
        }
    }

    console.log('=== SUMMARY ===');
    console.log({
        totalShipmentsInWindow: shipments.length,
        needResendCount: toResend.length,
        alreadySentOkCount: alreadySentOk.length,
        missingPhoneCount: noPhone.length
    });

    console.log(`\n=== 1. NEED RESEND (${toResend.length}) ===`);
    if (toResend.length > 0) {
        console.table(toResend.map((x) => x.row));
    } else {
        console.log('None.');
    }

    if (alreadySentOk.length > 0) {
        console.log(`\n=== 2. ALREADY SENT / DELIVERED OK (${alreadySentOk.length}) ===`);
        console.table(alreadySentOk);
    }

    if (noPhone.length > 0) {
        console.log(`\n=== 3. MISSING SENDER PHONE (${noPhone.length}) ===`);
        console.table(noPhone);
    }

    if (!send) {
        console.log('\n[DRY-RUN COMPLETE] Zero messages were sent.');
        console.log('To resend the above "NEED RESEND" shipments via Inbox 2 (+965 9674 9435), run:');
        console.log(`  node scripts/verify-and-resend-shipper-whatsapp.js --days=${days} --send`);
        process.exit(0);
    }

    const targets = limit ? toResend.slice(0, limit) : toResend;
    console.log(`\n[LIVE RESEND] Starting throttled dispatch for ${targets.length} shipments via Inbox 2...`);

    let sentCount = 0;
    let failCount = 0;

    for (const item of targets) {
        const { shipment, existingLogId, existingEventType, row } = item;
        try {
            const res = await chatwootService.sendShipmentNotification(existingEventType || 'shipment_created', shipment, {
                recipientRole: 'sender',
                templateName: 'shipment_confirmation_2',
                existingLogId,
                force: true
            });
            sentCount++;
            console.log(`  [SENT] ${row.tracking} (Bill #${row.bill}) -> ${row.phone} | result=${JSON.stringify(res?.results?.[0]?.status || res?.status || 'OK')}`);
        } catch (err) {
            failCount++;
            console.error(`  [FAIL] ${row.tracking} (Bill #${row.bill}) -> ${row.phone} | error=${err.message}`);
        }
        // Throttle 500ms between dispatches
        await new Promise((r) => setTimeout(r, 500));
    }

    console.log('\n=== RESEND COMPLETE ===');
    console.log({ attempted: targets.length, sentCount, failCount });
    process.exit(0);
}

run().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
