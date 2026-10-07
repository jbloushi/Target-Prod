const ShipmentDraftService = require('./ShipmentDraftService');
const { prisma } = require('../config/database');

/**
 * Application-level shipment lifecycle operations.
 *
 * Controllers translate transport requests into a command and actor context;
 * existing draft, pricing, authorization, and persistence behavior remains in
 * its current collaborator until each lifecycle slice is migrated.
 */
class ShipmentLifecycleService {
    /**
     * Submit a new local shipment into the existing draft workflow.
     *
     * @param {Object} command - Normalized shipment submission command.
     * @param {Object} actor - Authenticated actor context.
     * @returns {Promise<Object>} Created shipment.
     */
    async submitShipment(command, actor) {
        if (!command || typeof command !== 'object') {
            throw new TypeError('Shipment submission command is required');
        }
        if (!actor || typeof actor !== 'object') {
            throw new TypeError('Shipment submission actor is required');
        }

        const created = await ShipmentDraftService.createDraft(command, actor);
        try {
            const jobQueue = require('./queue/jobQueue');
            jobQueue.enqueue('tryton_dual_write', {
                action: 'CREATE_SHIPMENT',
                shipmentId: created.id,
                trackingNumber: created.trackingNumber
            }, { maxRetries: 3, backoffMs: 5000 }).catch(err => {
                const logger = require('../utils/logger');
                logger.warn(`[ShipmentLifecycleService] Tryton dual-write enqueue failed: ${err.message}`);
            });
        } catch (_) {}
        return created;
    }

    async recordPickup(shipment, actor) {
        if (!shipment || !actor) throw new TypeError('Shipment and actor are required');

        if (shipment.status === 'picked_up' || shipment.status === 'in_transit') {
            return { updated: shipment, alreadyPickedUp: true, nextStatus: shipment.status };
        }

        if (!['pending', 'draft', 'booked', 'ready_for_pickup', 'pending_approval'].includes(shipment.status)) {
            const error = new Error(`Shipment cannot be picked up (Current status: ${shipment.status})`);
            error.statusCode = 400;
            throw error;
        }

        const isAwaitingCarrierBooking = !shipment.dhlConfirmed &&
            !shipment.dhlTrackingNumber &&
            shipment.carrierCode !== 'INTERNAL';
        const nextStatus = isAwaitingCarrierBooking ? 'pending_approval' : 'picked_up';
        const description = isAwaitingCarrierBooking
            ? `Shipment collected from client by driver ${actor.name || ''}; awaiting hub verification & carrier approval`.trim()
            : `Shipment picked up by driver ${actor.name || ''}`.trim();
        const history = Array.isArray(shipment.history) ? shipment.history : [];

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                status: nextStatus,
                history: [...history, {
                    location: shipment.currentLocation,
                    status: nextStatus,
                    description,
                    timestamp: new Date()
                }]
            }
        });

        return { updated, alreadyPickedUp: false, nextStatus };
    }

    async receiveAtOffice(shipment, actor, command = {}) {
        if (!shipment || !actor) throw new TypeError('Shipment and actor are required');

        const allowedStatuses = [
            'picked_up', 'booked', 'ready_for_pickup', 'pending_approval',
            'received_at_hub', 'verified', 'in_transit'
        ];
        if (!allowedStatuses.includes(shipment.status)) {
            const error = new Error(`Shipment status is ${shipment.status}. Must be in inbound/intake status to process.`);
            error.statusCode = 400;
            throw error;
        }

        const nextStatus = command.action === 'receive'
            ? 'received_at_hub'
            : (command.action === 'verify' ? 'verified' : 'in_transit');
        const updateData = { status: nextStatus };
        let discrepancyDetected = false;
        let weightDifference = 0;

        if (command.weight || command.dimensions) {
            const currentWeight = Array.isArray(shipment.parcels) && shipment.parcels.length > 0
                ? shipment.parcels.reduce((acc, parcel) => acc + (Number(parcel.weight) || 0), 0)
                : (Array.isArray(shipment.items)
                    ? shipment.items.reduce((acc, item) => acc + (Number(item.weight) || 0), 0)
                    : 0);
            const newWeight = Number(command.weight);

            if (newWeight && Math.abs(currentWeight - newWeight) > 0.05) {
                discrepancyDetected = true;
                weightDifference = Number((newWeight - currentWeight).toFixed(3));
                const parcels = Array.isArray(shipment.parcels)
                    ? shipment.parcels.map((parcel) => ({ ...parcel }))
                    : [];
                const items = Array.isArray(shipment.items)
                    ? shipment.items.map((item) => ({ ...item }))
                    : [];

                if (parcels.length > 0) {
                    parcels[0].weight = newWeight;
                    if (command.dimensions) parcels[0].dimensions = command.dimensions;
                    updateData.parcels = parcels;
                }
                if (items.length > 0) {
                    items[0].weight = newWeight;
                    updateData.items = items;
                }
            }
        }

        const description = discrepancyDetected
            ? `Hub intake verified by ${actor.name}: Weight discrepancy of ${weightDifference > 0 ? '+' : ''}${weightDifference} kg recorded on certified scale.`
            : `Processed at Warehouse Hub facility (${nextStatus}) by ${actor.name}`;
        const history = Array.isArray(shipment.history) ? shipment.history : [];
        updateData.history = [...history, {
            location: shipment.currentLocation,
            status: nextStatus,
            description,
            timestamp: new Date()
        }];

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: updateData
        });

        try {
            const jobQueue = require('./queue/jobQueue');
            jobQueue.enqueue('tryton_dual_write', {
                action: 'WAREHOUSE_SCAN',
                shipmentId: shipment.id,
                trackingNumber: shipment.trackingNumber,
                scanData: {
                    weight: command.weight,
                    dimensions: command.dimensions,
                    shelfLocation: command.shelfLocation,
                    notes: command.reason || command.notes
                }
            }, { maxRetries: 3, backoffMs: 5000 }).catch(err => {
                const logger = require('../utils/logger');
                logger.warn(`[ShipmentLifecycleService] Tryton scan dual-write enqueue failed: ${err.message}`);
            });
        } catch (_) {}

        return { updated, discrepancyDetected, weightDifference, nextStatus, description };
    }

    async completeReview(shipment, actor, command = {}) {
        const receipt = await this.receiveAtOffice(shipment, actor, { ...command, action: 'verify' });

        const triggerVerifiedNotification = (finalShipment) => {
            try {
                const whatsappService = require('./whatsappIntegration.service');
                const targetPhone = finalShipment.origin?.phone || finalShipment.senderPhone || finalShipment.user?.phone;
                if (targetPhone) {
                    whatsappService.sendNotification({
                        shipment: finalShipment,
                        recipientRole: 'sender',
                        recipientPhone: targetPhone,
                        recipientName: finalShipment.origin?.contactPerson || finalShipment.user?.name || 'Shipper',
                        templateName: 'shipment_confirmation_2',
                        eventType: 'shipment_verified'
                    }).catch(err => {
                        const logger = require('../utils/logger');
                        logger.debug(`[ShipmentLifecycleService] WhatsApp notification skipped/async: ${err.message}`);
                    });
                }
            } catch (_) {}
        };

        if (String(shipment.carrierCode || '').toUpperCase() === 'INTERNAL') {
            triggerVerifiedNotification(receipt.updated || shipment);
            return { ...receipt, reviewCompleted: true };
        }

        const reviewShipment = await prisma.shipment.findUnique({
            where: { id: shipment.id },
            include: { user: true, organization: true }
        });
        if (!reviewShipment) throw new Error('Shipment disappeared during operational review');

        const ShipmentBookingService = require('./ShipmentBookingService');
        const previousPrice = Number(shipment.price || shipment.pricingSnapshot?.totalPrice || 0);
        await ShipmentBookingService.refreshPricingSnapshotForBooking({
            shipment: reviewShipment,
            carrierCode: reviewShipment.carrierCode,
            payingUser: reviewShipment.user,
            organization: reviewShipment.organization
        });

        const repricedShipment = await prisma.shipment.findUnique({ where: { id: shipment.id } });
        const currentPrice = Number(repricedShipment?.price || repricedShipment?.pricingSnapshot?.totalPrice || 0);
        if (currentPrice !== previousPrice && prisma.shipmentAuditLog?.create) {
            await prisma.shipmentAuditLog.create({
                data: {
                    shipmentId: shipment.id,
                    trackingNumber: shipment.trackingNumber,
                    actorType: String(actor.role || 'STAFF').toUpperCase(),
                    actorId: actor.id || null,
                    actorName: actor.name || actor.email || 'Operations Staff',
                    action: 'VERIFIED_PRICING_RECALCULATED',
                    fieldChanges: {
                        oldPrice: previousPrice,
                        newPrice: currentPrice,
                        reason: command.reason || 'Operational review completed',
                        requestId: command.requestId || null
                    },
                    ipAddress: command.ipAddress || null
                }
            });
        }

        const finalShipment = repricedShipment || receipt.updated || shipment;

        // Outbound WhatsApp Milestone Notification for Certified Scale Verification
        try {
            const whatsappService = require('./whatsappIntegration.service');
            const targetPhone = finalShipment.origin?.phone || finalShipment.senderPhone || finalShipment.user?.phone;
            if (targetPhone) {
                whatsappService.sendNotification({
                    shipment: finalShipment,
                    recipientRole: 'sender',
                    recipientPhone: targetPhone,
                    recipientName: finalShipment.origin?.contactPerson || finalShipment.user?.name || 'Shipper',
                    templateName: 'shipment_confirmation_2',
                    eventType: 'shipment_verified'
                }).catch(err => {
                    const logger = require('../utils/logger');
                    logger.debug(`[ShipmentLifecycleService] WhatsApp notification skipped/async: ${err.message}`);
                });
            }
        } catch (_) {}

        return {
            ...receipt,
            updated: finalShipment,
            reviewCompleted: true,
            previousPrice,
            currentPrice
        };
    }
}

module.exports = new ShipmentLifecycleService();
