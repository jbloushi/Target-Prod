const { Decimal } = require('decimal.js');
const { prisma } = require('../config/database');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const normalizeAmount = (value) => {
    if (value instanceof Decimal) return value;
    return new Decimal(value || 0);
};

const normalizeCurrencyCode = (currency, fallback = 'KWD') => String(currency || fallback || 'KWD').trim().toUpperCase().slice(0, 3);

const toApiAmount = (value) => Number(normalizeAmount(value).toFixed(3));

const invoiceInclude = {
    organization: { select: { id: true, name: true, currency: true } },
    lines: { orderBy: { shipmentDate: 'asc' } },
    createdBy: { select: { id: true, name: true, email: true } }
};

function formatDatePart(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function generateInvoiceNumber(periodEnd = new Date()) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `INV-${formatDatePart(periodEnd)}-${rand}`;
}

async function getOrganizationOrThrow(organizationId) {
    if (!organizationId) return null;
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, currency: true }
    });
    if (!organization) {
        const error = new Error('Organization not found');
        error.statusCode = 404;
        throw error;
    }
    return organization;
}

async function findShipmentChargeEntries({ organizationId, periodStart, periodEnd, currency }) {
    const where = {
            organizationId: organizationId || null,
            sourceRepo: 'Shipment',
            category: 'SHIPMENT_CHARGE',
            entryType: 'DEBIT',
            amount: { gt: 0 },
            createdAt: {
                gte: new Date(periodStart),
                lte: new Date(periodEnd)
            }
    };
    if (currency) where.currency = normalizeCurrencyCode(currency);

    return prisma.organizationLedger.findMany({
        where,
        select: {
            id: true,
            sourceId: true,
            amount: true,
            currency: true,
            createdAt: true,
            reference: true,
            metadata: true
        },
        orderBy: { createdAt: 'asc' }
    });
}

async function createInvoiceFromPeriod({ organizationId, periodStart, periodEnd, dueDate, notes, createdBy, vatRate = 0, currency }) {
    const organization = await getOrganizationOrThrow(organizationId);
    const invoiceCurrency = normalizeCurrencyCode(currency || organization?.currency);
    const ledgerEntries = await findShipmentChargeEntries({ organizationId, periodStart, periodEnd, currency: invoiceCurrency });
    if (!ledgerEntries.length) {
        const error = new Error(`No ${invoiceCurrency} shipment charges found for this period`);
        error.statusCode = 400;
        throw error;
    }

    const existingLines = await prisma.invoiceLine.findMany({
        where: { ledgerEntryId: { in: ledgerEntries.map(entry => entry.id) } },
        select: { ledgerEntryId: true }
    });
    const invoicedLedgerIds = new Set(existingLines.map(line => line.ledgerEntryId));
    const uninvoicedEntries = ledgerEntries.filter(entry => !invoicedLedgerIds.has(entry.id));

    if (!uninvoicedEntries.length) {
        const error = new Error('No uninvoiced shipment charges found for this period');
        error.statusCode = 400;
        throw error;
    }

    const shipmentIds = uninvoicedEntries.map(entry => entry.sourceId).filter(Boolean);
    const shipments = await prisma.shipment.findMany({
        where: { id: { in: shipmentIds } },
        select: {
            id: true,
            trackingNumber: true,
            price: true,
            currency: true,
            paid: true,
            totalPaid: true,
            remainingBalance: true,
            createdAt: true
        }
    });
    const shipmentMap = new Map(shipments.map(shipment => [shipment.id, shipment]));

    const lineItems = uninvoicedEntries.map(entry => {
        const shipment = shipmentMap.get(entry.sourceId) || {};
        const amount = toApiAmount(entry.amount);
        return {
            shipmentId: entry.sourceId,
            ledgerEntryId: entry.id,
            trackingNumber: shipment.trackingNumber || entry.reference || entry.sourceId,
            shipmentDate: shipment.createdAt || entry.createdAt,
            amount,
            currency: normalizeCurrencyCode(entry.currency || shipment.currency || entry.metadata?.currency, invoiceCurrency),
            paid: Boolean(shipment.paid),
            totalPaid: toApiAmount(shipment.totalPaid || 0),
            remainingBalance: toApiAmount(shipment.remainingBalance ?? amount)
        };
    });

    const currencies = [...new Set(lineItems.map(item => item.currency))];
    if (currencies.length > 1) {
        const error = new Error(`Invoice contains mixed currencies (${currencies.join(', ')}). Create one invoice per currency.`);
        error.statusCode = 400;
        throw error;
    }

    const subtotal = lineItems.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
    const vat = subtotal.times(normalizeAmount(vatRate).div(100));
    const total = subtotal.plus(vat);

    return prisma.invoice.create({
        data: {
            organizationId: organizationId || null,
            invoiceNumber: generateInvoiceNumber(periodEnd),
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            subtotal: toApiAmount(subtotal),
            vat: toApiAmount(vat),
            total: toApiAmount(total),
            currency: invoiceCurrency,
            status: 'draft',
            dueDate: dueDate ? new Date(dueDate) : null,
            notes: notes || null,
            createdById: createdBy || null,
            lines: { create: lineItems }
        },
        include: invoiceInclude
    });
}

async function listInvoices({ organizationId, status, page = 1, limit = 20 }) {
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const where = { organizationId: organizationId || null };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
        prisma.invoice.findMany({
            where,
            include: invoiceInclude,
            orderBy: { createdAt: 'desc' },
            skip: (parsedPage - 1) * parsedLimit,
            take: parsedLimit
        }),
        prisma.invoice.count({ where })
    ]);

    return {
        data,
        pagination: {
            total,
            page: parsedPage,
            limit: parsedLimit,
            pages: Math.ceil(total / parsedLimit)
        }
    };
}

async function updateInvoiceStatus({ invoiceId, status }) {
    const allowedStatuses = ['draft', 'sent', 'paid', 'overdue', 'disputed', 'void'];
    if (!allowedStatuses.includes(status)) {
        const error = new Error('Invalid invoice status');
        error.statusCode = 400;
        throw error;
    }

    const data = { status };
    if (status === 'sent') data.sentAt = new Date();
    if (status === 'paid') data.paidAt = new Date();

    return prisma.invoice.update({
        where: { id: invoiceId },
        data,
        include: invoiceInclude
    });
}

module.exports = {
    createInvoiceFromPeriod,
    listInvoices,
    updateInvoiceStatus,
    generateInvoiceNumber,
    toApiAmount
};
