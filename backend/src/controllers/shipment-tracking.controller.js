const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { calculateDistance, canUpdateShipmentStatus } = require('./shipment.helpers');

/**
 * Update shipment location
 */
exports.updateShipmentLocation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address, status, description } = req.body;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });

        if (status && status !== shipment.status && !canUpdateShipmentStatus(req.user, shipment, status)) {
            return res.status(403).json({ success: false, error: 'Permission denied to update shipment status' });
        }

        const updatedHistory = shipment.history || [];
        const newLocation = {
            ...shipment.currentLocation,
            formattedAddress: address,
            longitude: coordinates[0],
            latitude: coordinates[1]
        };

        updatedHistory.push({
            location: newLocation,
            status: status || shipment.status,
            description: description || 'Location updated',
            timestamp: new Date().toISOString()
        });

        const updated = await prisma.shipment.update({
            where: { trackingNumber },
            data: {
                currentLocation: newLocation,
                status: status || shipment.status,
                history: updatedHistory
            }
        });

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
            select: { history: true }
        });
        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });
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

        const curr = shipment.currentLocation;
        const dest = shipment.destination;
        
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

        const origin = shipment.origin;
        const curr = shipment.currentLocation;
        const dest = shipment.destination;

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
                progress: Math.min(Math.round((distanceTraveled / totalDistance) * 100), 99)
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
        const shipments = await prisma.shipment.findMany({
            where: { organizationId: req.user.organizationId },
            take: 20
        });
        res.status(200).json({ success: true, data: shipments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
