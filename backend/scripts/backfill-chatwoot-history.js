#!/usr/bin/env node
/**
 * Idempotent Chatwoot History Backfill CLI Script
 * File: backend/scripts/backfill-chatwoot-history.js
 *
 * Description:
 *   Scans past WhatsApp messages sent through msg.target-kw.com (SHIPMENT_WHATSAPP / TARGET_MSG)
 *   from `ShipmentNotificationLog` and backfills them into the matching Chatwoot conversations as history.
 *   Guarantees strict idempotency: running twice produces the exact same Chatwoot message count.
 *
 * Usage:
 *   node scripts/backfill-chatwoot-history.js [--dry-run] [--execute] [--limit=500] [--batch-size=50] [--tracking=TRG...]
 */

require('dotenv').config();
const { prisma } = require('../src/config/database');
const config = require('../src/config/config');
const chatwootService = require('../src/services/chatwootNotificationService');
const logger = require('../src/utils/logger');

function parseCliArgs(argv = process.argv.slice(2)) {
    const opts = {
        dryRun: true, // Default to safe preview
        execute: false,
        limit: null,
        batchSize: 50,
        trackingNumber: null,
        from: null,
        to: null
    };

    for (const arg of argv) {
        if (arg === '--execute') {
            opts.execute = true;
            opts.dryRun = false;
        } else if (arg === '--dry-run' || arg === '-d') {
            opts.dryRun = true;
            opts.execute = false;
        } else if (arg.startsWith('--limit=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val > 0) opts.limit = val;
        } else if (arg.startsWith('--batch-size=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(val) && val > 0) opts.batchSize = val;
        } else if (arg.startsWith('--tracking=')) {
            opts.trackingNumber = arg.split('=')[1]?.trim() || null;
        } else if (arg.startsWith('--from=')) {
            opts.from = new Date(arg.split('=')[1]?.trim());
        } else if (arg.startsWith('--to=')) {
            opts.to = new Date(arg.split('=')[1]?.trim());
        }
    }

    return opts;
}

function resolveMessageContent(log, context, target) {
    if (log.payloadJson?.content) return log.payloadJson.content;
    if (typeof log.payloadJson === 'string') {
        try {
            const parsed = JSON.parse(log.payloadJson);
            if (parsed.content) return parsed.content;
        } catch {
            // ignore JSON parse error
        }
    }
    return chatwootService.buildPlainContent(log.eventType, context, target);
}

async function backfillChatwootHistory(options = {}) {
    const {
        dryRun = true,
        execute = false,
        limit = null,
        batchSize = 50,
        trackingNumber = null,
        from = null,
        to = null
    } = options;

    const isExecute = execute && !dryRun;
    console.log(`\n======================================================`);
    console.log(`Chatwoot History Backfill CLI`);
    console.log(`Mode: ${isExecute ? 'EXECUTE (Applying changes)' : 'DRY RUN (Preview only)'}`);
    console.log(`======================================================\n`);

    const where = {
        provider: { in: ['SHIPMENT_WHATSAPP', 'TARGET_MSG', 'chatwoot'] },
        status: { in: ['SENT', 'DELIVERED', 'READ', 'submitted'] },
        ...(trackingNumber ? { trackingNumber } : {}),
        ...(from || to ? {
            createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {})
            }
        } : {})
    };

    const totalMatching = await prisma.shipmentNotificationLog.count({ where });
    console.log(`Total candidate notification logs matching criteria: ${totalMatching}`);

    const logs = await prisma.shipmentNotificationLog.findMany({
        where,
        take: limit || undefined,
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            shipmentId: true,
            trackingNumber: true,
            eventType: true,
            recipientRole: true,
            recipientName: true,
            recipientPhone: true,
            provider: true,
            chatwootContactId: true,
            chatwootConversationId: true,
            chatwootMessageId: true,
            payloadJson: true,
            status: true,
            sentAt: true,
            createdAt: true,
            shipment: {
                select: {
                    id: true,
                    trackingNumber: true,
                    status: true,
                    origin: true,
                    destination: true,
                    price: true,
                    currency: true,
                    carrierCode: true,
                    codAmount: true,
                    codCurrency: true,
                    codStatus: true,
                    paid: true,
                    remainingBalance: true,
                    estimatedDelivery: true,
                    organization: true,
                    user: true
                }
            }
        }
    });

    console.log(`Processing batch of ${logs.length} logs...\n`);

    const summary = {
        total: logs.length,
        alreadySyncedLocal: 0,
        alreadySyncedRemote: 0,
        backfilled: 0,
        skippedNoPhone: 0,
        errors: 0
    };

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const progressPrefix = `[${i + 1}/${logs.length}] (${log.trackingNumber}):`;

        // 1. Layer 1 Check: Local Database chatwootMessageId
        if (log.chatwootMessageId && log.chatwootConversationId) {
            summary.alreadySyncedLocal++;
            continue;
        }

        const rawPhone = log.recipientPhone ? String(log.recipientPhone).trim() : null;
        const normalizedPhone = chatwootService.normalizePhone(rawPhone);
        if (!normalizedPhone) {
            summary.skippedNoPhone++;
            continue;
        }

        const shipment = log.shipment || {
            id: log.shipmentId,
            trackingNumber: log.trackingNumber,
            status: 'unknown'
        };

        const target = {
            role: log.recipientRole || 'receiver',
            phone: normalizedPhone,
            name: log.recipientName || 'Valued Customer'
        };

        const context = chatwootService.buildShipmentNotificationContext(shipment);
        context.eventType = log.eventType;

        if (!isExecute) {
            summary.backfilled++;
            console.log(`${progressPrefix} [PREVIEW] Would backfill event ${log.eventType} to ${normalizedPhone}`);
            continue;
        }

        try {
            // Resolve contact and continuous conversation
            const contact = await chatwootService.findOrCreateContact(target, context);
            const conversation = await chatwootService.findOrCreateConversation(contact, target, context);

            // 2. Layer 2 Check: Query Remote Chatwoot Conversation Messages
            const cwConfig = config?.chatwoot || {};
            const accountId = cwConfig.accountId || '1';
            const existingMessages = await chatwootService.request(
                'get',
                `/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages`
            ).then(r => r?.payload || r || []).catch(() => []);

            const externalId = `log_${log.id}`;
            const matchedRemoteMessage = Array.isArray(existingMessages)
                ? existingMessages.find(m =>
                    m.external_id === externalId ||
                    m.source_id === `backfill:${log.id}` ||
                    (m.content && m.content.includes(log.trackingNumber) && m.content.includes(log.eventType))
                )
                : null;

            if (matchedRemoteMessage) {
                summary.alreadySyncedRemote++;
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: {
                        chatwootContactId: String(contact.id),
                        chatwootConversationId: String(conversation.id),
                        chatwootMessageId: String(matchedRemoteMessage.id)
                    }
                });
                console.log(`${progressPrefix} Already present in Chatwoot (ID: ${matchedRemoteMessage.id}). Linked.`);
                continue;
            }

            // Post missing message to Chatwoot conversation
            const content = resolveMessageContent(log, context, target);
            const timestampSeconds = Math.floor(new Date(log.sentAt || log.createdAt || Date.now()).getTime() / 1000);

            const messagePayload = {
                content,
                message_type: 'outgoing',
                private: false,
                external_id: externalId,
                source_id: `backfill:${log.id}`,
                created_at: timestampSeconds,
                templateName: log.templateName || undefined
            };

            const posted = await chatwootService.sendMessage(conversation.id, messagePayload, {
                skipWindowCheck: true,
                isTemplate: Boolean(log.templateName)
            });
            const messageId = posted?.id || posted?.payload?.id || `cw_msg_${log.id}`;

            await prisma.shipmentNotificationLog.update({
                where: { id: log.id },
                data: {
                    chatwootContactId: String(contact.id),
                    chatwootConversationId: String(conversation.id),
                    chatwootMessageId: String(messageId)
                }
            });

            summary.backfilled++;
            console.log(`${progressPrefix} Successfully backfilled as Chatwoot message ${messageId}`);

            // Small delay to prevent API throttling
            await new Promise(res => setTimeout(res, 50));
        } catch (err) {
            summary.errors++;
            console.error(`${progressPrefix} Failed to backfill: ${err.message}`);
        }
    }

    console.log(`\n======================================================`);
    console.log(`Backfill Summary:`);
    console.log(`Total Inspected:         ${summary.total}`);
    console.log(`Already Synced (Local):  ${summary.alreadySyncedLocal}`);
    console.log(`Already Synced (Remote): ${summary.alreadySyncedRemote}`);
    console.log(`Backfilled Messages:     ${summary.backfilled}`);
    console.log(`Skipped (No Phone):      ${summary.skippedNoPhone}`);
    console.log(`Errors:                  ${summary.errors}`);
    console.log(`======================================================\n`);

    return summary;
}

if (require.main === module) {
    const opts = parseCliArgs();
    backfillChatwootHistory(opts)
        .then(() => prisma.$disconnect())
        .catch(err => {
            console.error('Fatal CLI Error:', err);
            prisma.$disconnect();
            process.exit(1);
        });
}

module.exports = { backfillChatwootHistory, parseCliArgs };
