/**
 * Preview or resend one shipment_confirmation_2 notification per shipper for
 * non-draft shipments created in a Kuwait-local date range.
 *
 * Dry-run (no message sends or application DB writes):
 *   node scripts/resend-shipment-confirmations.js --from=2026-10-25 --to=2026-10-26
 *
 * Live send requires the reviewed candidate count and exact range confirmation:
 *   node scripts/resend-shipment-confirmations.js --from=2026-10-25 --to=2026-10-26 \
 *     --send --confirm=RESEND-2026-10-25-2026-10-26 --confirm-count=N
 *
 * Date boundaries use Asia/Kuwait (UTC+03:00). The stable backfill event name
 * makes reruns idempotent after a successful dispatch.
 */

require('dotenv').config();

const BACKFILL_EVENT = 'shipment_created_backfill';
const SUCCESS_STATUSES = new Set(['SUBMITTED', 'SENT', 'DELIVERED', 'READ']);
const CONFIRM_PREFIX = 'RESEND';
let prisma;

function getArg(name) {
    const prefix = `--${name}=`;
    const value = process.argv.find(arg => arg.startsWith(prefix));
    return value ? value.slice(prefix.length) : null;
}

function parseLocalDate(value, name) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
        throw new Error(`${name} must use YYYY-MM-DD format`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        throw new Error(`${name} is not a valid calendar date`);
    }
    return new Date(`${value}T00:00:00+03:00`);
}

function addLocalDays(date, count) {
    const value = new Date(date.getTime() + count * 24 * 60 * 60 * 1000);
    return value;
}

function maskPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length < 4 ? '****' : `${'*'.repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

function hasSuccessfulConfirmation(logs) {
    return logs.some(log =>
        log.eventType === BACKFILL_EVENT &&
        String(log.recipientRole || '').toLowerCase() === 'sender' &&
        SUCCESS_STATUSES.has(String(log.status || '').toUpperCase())
    );
}

function usage() {
    console.log(`Usage:
  Dry-run:
    node scripts/resend-shipment-confirmations.js --from=YYYY-MM-DD --to=YYYY-MM-DD [--limit=N] [--show-content]

  Send after reviewing the dry-run:
    node scripts/resend-shipment-confirmations.js --from=YYYY-MM-DD --to=YYYY-MM-DD \\
      --send --confirm=RESEND-YYYY-MM-DD-YYYY-MM-DD --confirm-count=N

Dates mean Shipment.createdAt in Asia/Kuwait. Default mode is dry-run. --show-content prints customer data; protect that terminal output.`);
}

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) return usage();

    const fromValue = getArg('from');
    const toValue = getArg('to');
    if (!fromValue || !toValue) throw new Error('Both --from and --to are required');

    const from = parseLocalDate(fromValue, '--from');
    const toStart = parseLocalDate(toValue, '--to');
    if (from > toStart) throw new Error('--from cannot be after --to');
    const toExclusive = addLocalDays(toStart, 1);
    const rangeConfirmation = `${CONFIRM_PREFIX}-${fromValue}-${toValue}`;
    const sending = process.argv.includes('--send');

    ({ prisma } = require('../src/config/database'));
    const chatwootService = require('../src/services/chatwootNotificationService');
    const { getSystemSettings } = require('../src/services/systemSettings.service');

    const dbConfig = await prisma.whatsAppConfig.findFirst({
        select: { enabled: true, provider: true }
    });
    const fileConfig = getSystemSettings()?.whatsapp || {};
    const provider = dbConfig?.provider || fileConfig.provider || 'CHATWOOT';
    if (sending) await chatwootService.refreshDbCredentialsIfNeeded();
    if (sending && (provider !== 'CHATWOOT' || dbConfig?.enabled === false || !chatwootService.isConfigured())) {
        throw new Error('Live resend requires enabled CHATWOOT provider and configured Chatwoot credentials');
    }

    const limitValue = getArg('limit');
    const limit = limitValue == null ? undefined : Number.parseInt(limitValue, 10);
    if (limitValue != null && (!Number.isInteger(limit) || limit < 1)) {
        throw new Error('--limit must be a positive integer');
    }

    const shipments = await prisma.shipment.findMany({
        where: {
            createdAt: { gte: from, lt: toExclusive },
            status: { not: 'draft' }
        },
        include: {
            notificationLogs: {
                select: { eventType: true, recipientRole: true, status: true }
            },
            user: true,
            organization: true
        },
        orderBy: [{ createdAt: 'asc' }, { trackingNumber: 'asc' }],
        ...(limit ? { take: limit } : {})
    });

    const eligible = [];
    const alreadyProcessed = [];
    const noSenderPhone = [];
    const previewFailed = [];

    for (const shipment of shipments) {
        if (hasSuccessfulConfirmation(shipment.notificationLogs || [])) {
            alreadyProcessed.push(shipment);
            continue;
        }

        const inFlightBackfill = (shipment.notificationLogs || []).find(log =>
            String(log.recipientRole || '').toLowerCase() === 'sender' &&
            log.eventType === BACKFILL_EVENT &&
            ['PENDING', 'QUEUED'].includes(String(log.status || '').toUpperCase())
        );
        if (inFlightBackfill) {
            alreadyProcessed.push(shipment);
            continue;
        }

        const targets = chatwootService.getNotificationTargets(BACKFILL_EVENT, shipment, 'sender');
        const sender = targets[0];
        if (!sender?.phone) {
            noSenderPhone.push(shipment);
            continue;
        }

        const previews = await chatwootService.buildShipmentNotificationPreview(
            BACKFILL_EVENT,
            shipment,
            'sender',
            'shipment_confirmation_2'
        );
        const preview = previews[0];
        if (!preview?.canSend || preview.templateName !== 'shipment_confirmation_2') {
            previewFailed.push({ shipment, reason: preview?.previewError || 'approved template preview unavailable' });
            continue;
        }
        eligible.push({ shipment, sender, preview });
    }

    console.log(`Window: ${fromValue} through ${toValue} (Shipment.createdAt, Asia/Kuwait, inclusive)`);
    console.log(`Provider: ${provider}`);
    console.log(`Non-draft shipments inspected: ${shipments.length}`);
    console.log(`Ready to send: ${eligible.length}`);
    console.log(`Already completed or has an in-flight backfill: ${alreadyProcessed.length}`);
    console.log(`Missing shipper phone: ${noSenderPhone.length}`);
    console.log(`Template/config preview blocked: ${previewFailed.length}`);

    for (const [index, item] of eligible.entries()) {
        const params = item.preview.templateParams?.parameters || [];
        const missing = [];
        if (params[2] === '[receiver name]') missing.push('[receiver name]');
        if (params[3] === '[receiver telephone]') missing.push('[receiver telephone]');
        console.log(`${index + 1}. ${item.shipment.trackingNumber} | sender ${maskPhone(item.sender.phone)} | shipment_confirmation_2 | receiver fields: ${missing.length ? missing.join(', ') : 'present'}`);
        if (process.argv.includes('--show-content')) console.log(item.preview.content || '(no rendered content)');
    }

    if (!sending) {
        console.log('DRY RUN ONLY: no WhatsApp messages sent and no application database rows changed.');
        return;
    }

    if (getArg('confirm') !== rangeConfirmation) {
        throw new Error(`Live send blocked. Re-run with --confirm=${rangeConfirmation}`);
    }
    const confirmedCount = Number.parseInt(getArg('confirm-count') || '', 10);
    if (!Number.isInteger(confirmedCount) || confirmedCount !== eligible.length) {
        throw new Error(`Live send blocked. Set --confirm-count=${eligible.length} after reviewing this dry-run`);
    }

    const summary = { submitted: 0, skipped: 0, failed: 0 };
    for (const [index, item] of eligible.entries()) {
        try {
            const result = await chatwootService.sendShipmentNotification(BACKFILL_EVENT, item.shipment, {
                recipientRole: 'sender',
                templateName: 'shipment_confirmation_2',
                fallbackEventType: 'shipment_created',
                disableProviderFallback: true
            });
            const status = result?.results?.[0]?.status || (result?.skipped ? 'skipped' : 'failed');
            if (status === 'submitted') summary.submitted++;
            else if (status === 'skipped') summary.skipped++;
            else summary.failed++;
            console.log(`[${index + 1}/${eligible.length}] ${item.shipment.trackingNumber}: ${status}`);
        } catch (error) {
            summary.failed++;
            console.error(`[${index + 1}/${eligible.length}] ${item.shipment.trackingNumber}: failed (${error.message})`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Complete: ${summary.submitted} submitted, ${summary.skipped} skipped, ${summary.failed} failed.`);
}

main()
    .catch(error => {
        console.error(`Resend aborted: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma?.$disconnect());
