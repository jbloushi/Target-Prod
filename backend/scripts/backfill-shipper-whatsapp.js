/**
 * Backfill one shipment-created WhatsApp notification to each eligible shipper.
 *
 * Defaults to a read-only preview. Sending requires --execute.
 *
 * Examples:
 *   node scripts/backfill-shipper-whatsapp.js
 *   node scripts/backfill-shipper-whatsapp.js --execute
 *   node scripts/backfill-shipper-whatsapp.js --from=2026-09-01 --to=2026-10-22 --execute
 */

require('dotenv').config();

const SUCCESS_STATUSES = new Set(['SENT', 'DELIVERED', 'READ']);
const SHIPPER_ROLES = new Set(['sender', 'shipper', 'merchant']);
const PENDING_STATUSES = new Set(['QUEUED', 'PENDING']);

function getArg(name) {
    const prefix = `--${name}=`;
    const value = process.argv.find(arg => arg.startsWith(prefix));
    return value ? value.slice(prefix.length) : null;
}

function parseDate(value, name) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
        throw new Error(`${name} must use YYYY-MM-DD format`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid ${name}: ${value}`);
    }
    return date;
}

function parseShipmentDate(rawDate) {
    if (!rawDate) return null;
    const value = String(rawDate).trim();
    let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return makeUtcDate(+match[1], +match[2], +match[3]);
    match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) return makeUtcDate(+match[3], +match[2], +match[1]);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makeUtcDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date
        : null;
}

function asDateOnly(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function inWindow(shipment, from, toExclusive) {
    const docs = shipment.documents && typeof shipment.documents === 'object' ? shipment.documents : {};
    const shipmentDate = parseShipmentDate(docs.rawDate || docs.date) || shipment.createdAt;
    const dateOnly = asDateOnly(shipmentDate);
    return dateOnly >= from && dateOnly < toExclusive;
}

function hasDeliveryEvidence(shipment, isNegativeOrExceptionPhrase, normalizeStatus) {
    const docs = shipment.documents && typeof shipment.documents === 'object' ? shipment.documents : {};
    if (shipment.deliveredAt || shipment.podTimestamp || shipment.podSignatureUrl || shipment.podPhotoUrl || docs.pod) {
        return true;
    }

    const history = Array.isArray(shipment.history) ? shipment.history : [];
    return history.some(event => {
        if (!event || typeof event !== 'object') return false;
        const description = String(event.description || '');
        const rawStatus = String(event.status || '');
        if (isNegativeOrExceptionPhrase(description) || isNegativeOrExceptionPhrase(rawStatus)) return false;

        const descStatus = description ? normalizeStatus(description) : null;
        const codeStatus = event.statusCode || event.code ? normalizeStatus(event.statusCode || event.code) : null;
        if (descStatus === 'exception') return false;

        // A raw delivered label paired with a non-delivery description is a known
        // carrier-history false positive unless the event carries POD evidence.
        if (normalizeStatus(rawStatus) === 'delivered' && description && descStatus !== 'delivered' && codeStatus !== 'delivered' && !event.pod) {
            return false;
        }
        return normalizeStatus(event.statusCode || event.code || rawStatus || description) === 'delivered';
    });
}

function senderPhone(shipment) {
    const docs = shipment.documents && typeof shipment.documents === 'object' ? shipment.documents : {};
    return shipment.origin?.phone || shipment.shipperPhone || shipment.senderPhone || docs.senderPhone || shipment.customerPhone || null;
}

function senderName(shipment) {
    const docs = shipment.documents && typeof shipment.documents === 'object' ? shipment.documents : {};
    return shipment.origin?.contactPerson || shipment.origin?.companyName || docs.senderName || 'Shipper';
}

function maskPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****';
}

function successfulLog(logs) {
    return logs.find(log =>
        SHIPPER_ROLES.has(String(log.recipientRole || '').toLowerCase())
        && SUCCESS_STATUSES.has(String(log.status || '').toUpperCase())
    );
}

function pendingLog(logs) {
    return logs
        .filter(log => SHIPPER_ROLES.has(String(log.recipientRole || '').toLowerCase())
            && PENDING_STATUSES.has(String(log.status || '').toUpperCase()))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
}

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Preview eligible shipper notifications by default. Add --execute to send.');
        console.log('Options: --from=YYYY-MM-DD --to=YYYY-MM-DD --execute');
        return;
    }

    const from = parseDate(getArg('from') || '2026-09-01', '--from');
    const to = parseDate(getArg('to') || new Date().toISOString().slice(0, 10), '--to');
    if (from > to) throw new Error('--from cannot be after --to');
    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const execute = process.argv.includes('--execute');

    const { prisma } = require('../src/config/database');
    const whatsapp = require('../src/services/whatsappIntegration.service');
    const { normalizeStatus, isTerminalStatus, isNegativeOrExceptionPhrase } = require('../src/constants/statusConstants');

    try {
        const shipments = await prisma.shipment.findMany({
            where: { status: { not: 'draft' } },
            include: { notificationLogs: true },
            orderBy: { createdAt: 'asc' }
        });

        const candidates = [];
        const skipped = { outsideWindow: 0, terminal: 0, deliveryEvidence: 0, alreadySent: 0, missingPhone: 0 };
        for (const shipment of shipments) {
            if (!inWindow(shipment, from, toExclusive)) { skipped.outsideWindow++; continue; }
            if (isTerminalStatus(shipment.status)) { skipped.terminal++; continue; }
            if (hasDeliveryEvidence(shipment, isNegativeOrExceptionPhrase, normalizeStatus)) { skipped.deliveryEvidence++; continue; }
            const priorSuccess = successfulLog(shipment.notificationLogs || []);
            if (priorSuccess) { skipped.alreadySent++; continue; }
            const phone = senderPhone(shipment);
            if (!phone) { skipped.missingPhone++; continue; }
            const queued = pendingLog(shipment.notificationLogs || []);
            candidates.push({ shipment, phone: queued?.recipientPhone || phone, name: queued?.recipientName || senderName(shipment), queued });
        }

        console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN (no messages sent)'}`);
        console.log(`Shipment date window: ${from.toISOString().slice(0, 10)} through ${to.toISOString().slice(0, 10)} inclusive`);
        console.log(`Non-draft shipments inspected: ${shipments.length}`);
        console.log(`Eligible shipper notifications: ${candidates.length}`);
        console.log(`Skipped: ${JSON.stringify(skipped)}`);
        candidates.forEach((item, index) => {
            const queueLabel = item.queued ? ` reuse-log=${item.queued.id}` : '';
            console.log(`${index + 1}. ${item.shipment.trackingNumber} [${normalizeStatus(item.shipment.status)}] -> ${maskPhone(item.phone)}${queueLabel}`);
        });
        if (!execute) return;

        const summary = { sent: 0, queued: 0, skipped: 0, failed: 0 };
        for (const [index, item] of candidates.entries()) {
            try {
                const result = await whatsapp.sendNotification({
                    shipment: item.shipment,
                    recipientRole: 'sender',
                    recipientPhone: item.phone,
                    recipientName: item.name,
                    eventType: item.queued?.eventType || 'shipment_created',
                    templateName: item.queued?.templateName || 'shipment_confirmation_2',
                    force: false,
                    ...(item.queued ? { existingLogId: item.queued.id } : {})
                });
                if (result?.status === 'SENT') summary.sent++;
                else if (result?.status === 'QUEUED') summary.queued++;
                else summary.skipped++;
                console.log(`[${index + 1}/${candidates.length}] ${item.shipment.trackingNumber}: ${result?.status || 'SKIPPED'}${result?.reason ? ` (${result.reason})` : ''}`);
            } catch (error) {
                summary.failed++;
                console.error(`[${index + 1}/${candidates.length}] ${item.shipment.trackingNumber}: FAILED ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        console.log(`Finished: ${JSON.stringify(summary)}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
});
