const { prisma } = require('../config/database');
const { createHash } = require('crypto');
const logger = require('../utils/logger');
const { calculateDistance, canUpdateShipmentStatus, compactHistory, parseCoordinates, normalizeStatus } = require('./shipment.helpers');
const { canAccessShipment, scopeShipmentWhere } = require('../middleware/authorize.middleware');
const chatwootNotificationService = require('../services/chatwootNotificationService');

/**
 * Update shipment location
 */
exports.updateShipmentLocation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address, status, description, localTimestamp, timezoneOffset } = req.body || {};

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        if (status && status !== shipment.status && !canUpdateShipmentStatus(req.user, shipment, status)) {
            return res.status(403).json({ success: false, error: 'Permission denied to update shipment status' });
        }

        const { longitude, latitude } = parseCoordinates(coordinates, shipment.currentLocation || {});
        const formattedAddress = address || shipment.currentLocation?.formattedAddress || 'Location updated';
        const newLocation = {
            ...(shipment.currentLocation && typeof shipment.currentLocation === 'object' ? shipment.currentLocation : {}),
            formattedAddress,
            longitude,
            latitude
        };

        const now = new Date();
        const eventTimestamp = req.body?.timestamp ? new Date(req.body.timestamp) : now;
        const validTimestampStr = (!Number.isNaN(eventTimestamp.getTime()) ? eventTimestamp : now).toISOString();

        const actorSource = req.body?.source || (req.user?.role === 'driver' ? 'driver' : (req.user?.role ? 'staff' : 'system'));

        const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
        const historyEntry = {
            location: newLocation,
            status: status || shipment.status,
            description: description || 'Location updated',
            source: actorSource,
            timestamp: validTimestampStr,
            ...(localTimestamp ? { localTimestamp } : {}),
            ...(timezoneOffset ? { timezoneOffset } : {})
        };

        const updatedHistory = compactHistory([...rawHistory, historyEntry]);

        // Upsert relational event into ShipmentTrackingEvent
        if (prisma.shipmentTrackingEvent && typeof prisma.shipmentTrackingEvent.upsert === 'function') {
            try {
                const provider = 'FLEET';
                const eventStatus = status || shipment.status;
                const eventDesc = description || 'Location updated';
                const eventKey = createHash('sha256').update(JSON.stringify({
                    provider,
                    status: eventStatus,
                    description: eventDesc,
                    timestamp: validTimestampStr,
                    location: formattedAddress
                })).digest('hex');

                const eventTime = !Number.isNaN(eventTimestamp.getTime()) ? eventTimestamp : now;

                await prisma.shipmentTrackingEvent.upsert({
                    where: {
                        shipmentId_eventKey: {
                            shipmentId: shipment.id,
                            eventKey
                        }
                    },
                    create: {
                        shipmentId: shipment.id,
                        provider,
                        carrierCode: String(shipment.carrierCode || 'INTERNAL').toUpperCase(),
                        source: actorSource,
                        eventKey,
                        rawStatus: eventStatus,
                        normalizedStatus: normalizeStatus(eventStatus),
                        description: eventDesc,
                        eventTimestamp: eventTime,
                        location: newLocation,
                        rawPayload: {
                            coordinates: { longitude, latitude },
                            address: formattedAddress,
                            status: eventStatus,
                            description: eventDesc,
                            source: actorSource,
                            timestamp: validTimestampStr,
                            localTimestamp: localTimestamp || null,
                            timezoneOffset: timezoneOffset || null
                        }
                    },
                    update: {
                        rawStatus: eventStatus,
                        normalizedStatus: normalizeStatus(eventStatus),
                        description: eventDesc,
                        location: newLocation,
                        rawPayload: {
                            coordinates: { longitude, latitude },
                            address: formattedAddress,
                            status: eventStatus,
                            description: eventDesc,
                            source: actorSource,
                            timestamp: validTimestampStr,
                            localTimestamp: localTimestamp || null,
                            timezoneOffset: timezoneOffset || null
                        }
                    }
                });
            } catch (eventErr) {
                logger.warn(`[LocationUpdate] Failed to record tracking event for ${shipment.trackingNumber}: ${eventErr.message}`);
            }
        }

        const updated = await prisma.shipment.update({
            where: { trackingNumber },
            data: {
                currentLocation: newLocation,
                status: status || shipment.status,
                history: updatedHistory
            }
        });

        if (status && status !== shipment.status) {
            try {
                const jobQueue = require('../services/queue/jobQueue');
                jobQueue.enqueue('tryton_dual_write', {
                    action: 'UPDATE_STATUS',
                    trackingNumber: updated.trackingNumber,
                    status
                }).catch(() => {});
            } catch (_) {}

            const eventType = chatwootNotificationService.mapStatusToNotificationEvent(status, description);
            if (eventType) {
                chatwootNotificationService.triggerShipmentNotification(eventType, updated);
            }
        }

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        logger.error('Error updating location:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Update shipment location manually
 */
exports.updateShipmentLocationManually = async (req, res) => {
    // Re-uses similar logic to updateShipmentLocation
    return exports.updateShipmentLocation(req, res);
};

/**
 * Get shipment history
 */
exports.getShipmentHistory = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            select: {
                history: true,
                userId: true,
                organizationId: true,
                createdOnBehalfOfUserId: true,
                assignedDriverId: true
            }
        });
        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });
        res.status(200).json({ success: true, data: shipment.history });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Get shipment ETA
 */
exports.getShipmentETA = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ error: 'Not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const curr = shipment.currentLocation || shipment.origin || {};
        const dest = shipment.destination || {};
        
        const distance = calculateDistance([curr.longitude, curr.latitude], [dest.longitude, dest.latitude]);
        const eta = new Date();
        eta.setHours(eta.getHours() + (distance / 50));

        res.json({ trackingNumber, distance: distance.toFixed(2), eta, status: shipment.status });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};

/**
 * Get shipment route distance
 */
exports.getShipmentRouteDistance = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const origin = shipment.origin || {};
        const curr = shipment.currentLocation || origin;
        const dest = shipment.destination || {};

        const distanceTraveled = calculateDistance([origin.longitude, origin.latitude], [curr.longitude, curr.latitude]);
        const remainingDistance = calculateDistance([curr.longitude, curr.latitude], [dest.longitude, dest.latitude]);
        const totalDistance = distanceTraveled + remainingDistance;

        res.status(200).json({
            success: true,
            data: {
                trackingNumber,
                distanceTraveled: distanceTraveled.toFixed(2),
                remainingDistance: remainingDistance.toFixed(2),
                totalDistance: totalDistance.toFixed(2),
                progress: totalDistance > 0 ? Math.min(Math.round((distanceTraveled / totalDistance) * 100), 99) : 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Get nearby shipments (Placeholder for spatial queries in MySQL)
 */
exports.getNearbyShipments = async (req, res) => {
    try {
        // Spatial queries in MySQL require specific indexes. 
        // For now, we return limited results based on organization.
        const where = scopeShipmentWhere(req, {});
        const shipments = await prisma.shipment.findMany({
            where,
            take: 20
        });
        res.status(200).json({ success: true, data: shipments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
