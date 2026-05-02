/**
 * LogesTechs (OTE) Webhook Receiver
 *
 * Endpoints:
 *   POST /api/webhooks/logestechs/lastmile
 *   POST /api/webhooks/logestechs/fulfillment
 *
 * Auth:
 *   Header `X-Logestechs-Token` must equal env LOGESTECHS_WEBHOOK_TOKEN.
 *   LogesTechs does not sign webhooks; this is a defensive shared secret.
 *
 * Payload contracts: see "Webhook Status Updates v3.01.pdf".
 */

const { prisma } = require('../config/database');
const WebhookDispatcher = require('../services/WebhookDispatcher');
const { logesTechsWebhookToken } = require('../config/config');
const logger = require('../utils/logger');

// Map LogesTechs Lastmile status codes -> internal Shipment.status
const LASTMILE_STATUS_MAP = {
    DELIVERED: 'delivered',
    DELIVERED_TO_RECIPIENT: 'delivered',
    DELIVERED_TO_SENDER: 'returned',
    RETURNED_BY_RECIPIENT: 'returned',
    CANCELLED: 'cancelled',
    DELETED: 'cancelled',
    LOST: 'failed',
    DAMAGED: 'failed',
    FAILED: 'failed',
    UNRESOLVED_FAILURE: 'failed',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    IN_TRANSIT: 'in_transit',
    IN_TRANSIT_TO_CUSTOMER: 'in_transit',
    IN_HUB: 'in_transit',
    RECEIVED_IN_HUB: 'in_transit',
    SCANNED_BY_DRIVER_AND_IN_CAR: 'in_transit',
    SCANNED_BY_HANDLER_AND_UNLOADED: 'in_transit',
    EXPORTED: 'in_transit',
    EXPORTED_TO_HUB: 'in_transit',
    EXPORTED_TO_THIRD_PARTY: 'in_transit',
    TRANSFERRED_OUT: 'in_transit',
    ARRIVED: 'in_transit',
    BROUGHT: 'in_transit',
    CREATED: 'booked',
    ASSIGNED_TO_DRIVER_AND_PENDING_APPROVAL: 'booked',
    ACCEPTED_BY_DRIVER_AND_PENDING_PICKUP: 'booked',
    PENDING_CUSTOMER_CARE_APPROVAL: 'booked',
    PARTIALLY_DELIVERED: 'partially_delivered',
    POSTPONED_DELIVERY: 'delayed',
    DELAYED: 'delayed'
};

const FULFILLMENT_STATUS_MAP = {
    CREATED: 'booked',
    PICKED: 'in_transit',
    PACKED: 'in_transit'
};

const verifyToken = (req, res) => {
    if (!logesTechsWebhookToken) {
        logger.error('LOGESTECHS_WEBHOOK_TOKEN is not configured; refusing webhook.');
        res.status(503).json({ success: false, error: 'Webhook not configured.' });
        return false;
    }
    if (req.headers['x-logestechs-token'] !== logesTechsWebhookToken) {
        res.status(401).json({ success: false, error: 'Invalid webhook token.' });
        return false;
    }
    return true;
};

const findShipment = async ({ barcode, invoiceNumber, packageBarcode }) => {
    const candidates = [barcode, packageBarcode].filter(Boolean).map(String);
    if (candidates.length > 0) {
        const byCarrierId = await prisma.shipment.findFirst({
            where: { OR: candidates.flatMap(c => [{ carrierShipmentId: c }, { dhlTrackingNumber: c }]) }
        });
        if (byCarrierId) return byCarrierId;
    }
    if (invoiceNumber) {
        const byTracking = await prisma.shipment.findUnique({
            where: { trackingNumber: String(invoiceNumber) }
        }).catch(() => null);
        if (byTracking) return byTracking;
    }
    return null;
};

exports.lastmile = async (req, res) => {
    if (!verifyToken(req, res)) return;

    const body = req.body || {};
    const { newStatus, barcode, invoiceNumber, packageId, time, cod, driverName, driverPhone, attachmentUrls, paymentType } = body;

    try {
        const shipment = await findShipment({ barcode, invoiceNumber });
        if (!shipment) {
            logger.warn(`LogesTechs webhook: shipment not found (barcode=${barcode}, invoice=${invoiceNumber})`);
            return res.status(202).json({ success: true, matched: false });
        }

        const internalStatus = LASTMILE_STATUS_MAP[String(newStatus || '').toUpperCase()] || shipment.status;

        const checkpoint = {
            source: 'OTE',
            externalStatus: newStatus,
            internalStatus,
            occurredAt: time ? new Date(Number(time)).toISOString() : new Date().toISOString(),
            barcode,
            packageId,
            cod,
            driverName,
            driverPhone,
            attachmentUrls,
            paymentType
        };

        const checkpoints = Array.isArray(shipment.checkpoints) ? shipment.checkpoints : [];
        checkpoints.push(checkpoint);

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: { status: internalStatus, checkpoints }
        });

        await WebhookDispatcher.dispatch('shipment.status_updated', shipment.organizationId, {
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            status: internalStatus,
            externalStatus: newStatus,
            carrier: 'OTE',
            checkpoint
        });

        return res.status(200).json({ success: true, matched: true, internalStatus });
    } catch (error) {
        logger.error('LogesTechs lastmile webhook failed:', error);
        return res.status(500).json({ success: false, error: 'Internal error processing webhook.' });
    }
};

exports.fulfillment = async (req, res) => {
    if (!verifyToken(req, res)) return;

    const body = req.body || {};
    const { status, barcode, packageBarcode } = body;

    try {
        const shipment = await findShipment({ barcode, packageBarcode });
        if (!shipment) {
            logger.warn(`LogesTechs fulfillment webhook: shipment not found (barcode=${barcode}, packageBarcode=${packageBarcode})`);
            return res.status(202).json({ success: true, matched: false });
        }

        const internalStatus = FULFILLMENT_STATUS_MAP[String(status || '').toUpperCase()] || shipment.status;

        const checkpoint = {
            source: 'OTE_FULFILLMENT',
            externalStatus: status,
            internalStatus,
            occurredAt: new Date().toISOString(),
            barcode,
            packageBarcode
        };

        const checkpoints = Array.isArray(shipment.checkpoints) ? shipment.checkpoints : [];
        checkpoints.push(checkpoint);

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: { status: internalStatus, checkpoints }
        });

        await WebhookDispatcher.dispatch('shipment.status_updated', shipment.organizationId, {
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            status: internalStatus,
            externalStatus: status,
            carrier: 'OTE',
            checkpoint
        });

        return res.status(200).json({ success: true, matched: true, internalStatus });
    } catch (error) {
        logger.error('LogesTechs fulfillment webhook failed:', error);
        return res.status(500).json({ success: false, error: 'Internal error processing webhook.' });
    }
};

exports._maps = { LASTMILE_STATUS_MAP, FULFILLMENT_STATUS_MAP };
