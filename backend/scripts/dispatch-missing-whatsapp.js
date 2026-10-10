/**
 * Send the shipment-created WhatsApp notification for shipments in a date
 * window that do not already have a successful WhatsApp log.
 *
 * Examples:
 *   npm run dispatch:whatsapp:missing -- --dry-run
 *   npm run dispatch:whatsapp:missing -- --from=2026-10-03 --to=2026-10-06
 */

require('dotenv').config();

const SUCCESS_STATUSES = ['SENT', 'DELIVERED', 'READ'];
const RECEIVER_ROLES = ['receiver', 'customer', 'consignee'];
const SENDER_ROLES = ['sender', 'shipper', 'merchant'];

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
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${name}: ${value}`);
    return date;
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function defaultFromDate() {
    const today = new Date();
    const day = today.getUTCDay(); // Sunday = 0, Saturday = 6
    const daysSinceSaturday = (day + 1) % 7;
    today.setUTCDate(today.getUTCDate() - daysSinceSaturday);
    today.setUTCHours(0, 0, 0, 0);
    return today;
}

function getDateWindow() {
    const from = getArg('from') ? parseDate(getArg('from'), '--from') : defaultFromDate();
    const toDate = getArg('to') ? parseDate(getArg('to'), '--to') : new Date();
    toDate.setUTCHours(0, 0, 0, 0);
    if (from > toDate) throw new Error('--from cannot be after --to');
    const toExclusive = new Date(toDate);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    return { from, toDate, toExclusive };
}

function hasSuccessfulLog(logs, roles) {
    return logs.some(log =>
        roles.includes(String(log.recipientRole || '').toLowerCase())
        && SUCCESS_STATUSES.includes(String(log.status || '').toUpperCase())
    );
}

function getRecipient(shipment, role) {
    if (role === 'sender') {
        return {
            phone: shipment.origin?.phone || shipment.shipperPhone || shipment.customerPhone,
            name: shipment.origin?.contactPerson || shipment.origin?.companyName || 'Shipper'
        };
    }
    return {
        phone: shipment.destination?.phone || shipment.customerPhone || shipment.customer?.phone,
        name: shipment.destination?.contactPerson || shipment.customer?.name || shipment.customerName || 'Receiver'
    };
}

function usage() {
    console.log(`Usage: npm run dispatch:whatsapp:missing -- [options]

Options:
  --from=YYYY-MM-DD  Inclusive start date (default: most recent Saturday)
  --to=YYYY-MM-DD    Inclusive end date (default: today)
  --role=receiver     receiver/customer (default), sender, or all
  --limit=N           Maximum shipments to inspect
  --dry-run           List candidates without sending or writing logs
`);
}

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        usage();
        return;
    }

    ({ prisma } = require('../src/config/database'));
    const whatsappService = require('../src/services/whatsappIntegration.service');

    const { from, toDate, toExclusive } = getDateWindow();
    const roleArg = (getArg('role') || 'receiver').toLowerCase();
    const roles = roleArg === 'all' ? ['receiver', 'sender'] : [roleArg];
    if (!roles.every(role => ['receiver', 'sender'].includes(role))) {
        throw new Error('--role must be receiver, sender, or all');
    }

    const limitArg = getArg('limit');
    const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
    if (limitArg && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');

    const dryRun = process.argv.includes('--dry-run');
    const shipments = await prisma.shipment.findMany({
        where: {
            createdAt: { gte: from, lt: toExclusive },
            status: { not: 'draft' }
        },
        include: { notificationLogs: true },
        orderBy: { createdAt: 'asc' },
        ...(limit ? { take: limit } : {})
    });

    const candidates = [];
    for (const shipment of shipments) {
        for (const role of roles) {
            const roleSet = role === 'sender' ? SENDER_ROLES : RECEIVER_ROLES;
            if (hasSuccessfulLog(shipment.notificationLogs, roleSet)) continue;
            const recipient = getRecipient(shipment, role);
            if (!recipient.phone) continue;
            candidates.push({ shipment, role, ...recipient });
        }
    }

    console.log(`Window: ${isoDate(from)} through ${isoDate(toDate)} (createdAt, inclusive)`);
    console.log(`Shipments inspected: ${shipments.length}`);
    console.log(`Missing successful WhatsApp logs: ${candidates.length}`);

    if (dryRun) {
        candidates.forEach((item, index) => console.log(`${index + 1}. ${item.shipment.trackingNumber} [${item.role}] -> ${item.phone}`));
        return;
    }

    const summary = { sent: 0, skipped: 0, failed: 0 };
    for (const [index, item] of candidates.entries()) {
        try {
            const result = await whatsappService.sendNotification({
                shipment: item.shipment,
                recipientRole: item.role,
                recipientPhone: item.phone,
                recipientName: item.name,
                eventType: 'shipment_created',
                templateName: 'shipment_confirmation_2',
                // Keep duplicate checks enabled while allowing the requested historical window.
                bypassAgeGuard: true
            });
            if (result?.status === 'SENT') summary.sent++;
            else summary.skipped++;
            console.log(`[${index + 1}/${candidates.length}] ${item.shipment.trackingNumber} [${item.role}] ${result?.status || 'SKIPPED'}`);
        } catch (error) {
            summary.failed++;
            console.error(`[${index + 1}/${candidates.length}] ${item.shipment.trackingNumber} [${item.role}] FAILED: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`Finished: ${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed.`);
}

let prisma;
main()
    .catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma?.$disconnect());
