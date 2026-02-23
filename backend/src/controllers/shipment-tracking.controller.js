/**
 * Shipment Tracking Controller
 * updateShipmentLocation, updateShipmentLocationManually, getShipmentHistory,
 * getShipmentETA, getShipmentRouteDistance, getNearbyShipments
 */
const Shipment = require('../models/shipment.model');
const logger = require('../utils/logger');
const { calculateDistance } = require('./shipment.helpers');

// Update shipment location
exports.updateShipmentLocation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address, status, description } = req.body;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        shipment.currentLocation = {
            ...shipment.currentLocation.toObject(),
            formattedAddress: address, longitude: coordinates[0], latitude: coordinates[1],
            contactPerson: shipment.currentLocation.contactPerson || shipment.origin.contactPerson || 'Unknown',
            phone: shipment.currentLocation.phone || shipment.origin.phone || '0000000'
        };

        if (status) shipment.status = status;
        shipment.history.push({ location: shipment.currentLocation, status: status || shipment.status, description: description || 'Location updated', timestamp: new Date() });
        await shipment.save();

        logger.info(`Shipment ${trackingNumber} location updated`);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment location updated successfully' });
    } catch (error) {
        logger.error('Error updating shipment location:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment location', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Update shipment location manually
exports.updateShipmentLocationManually = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address, status, description } = req.body;

        if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
            return res.status(400).json({ success: false, error: 'Valid coordinates [longitude, latitude] are required' });
        }
        if (!address) return res.status(400).json({ success: false, error: 'Address is required' });

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        shipment.currentLocation = {
            ...shipment.currentLocation.toObject(),
            formattedAddress: address, longitude: coordinates[0], latitude: coordinates[1],
            contactPerson: shipment.currentLocation.contactPerson || shipment.origin.contactPerson || 'Unknown',
            phone: shipment.currentLocation.phone || shipment.origin.phone || '0000000'
        };

        if (status) shipment.status = status;
        shipment.history.push({ location: shipment.currentLocation, status: status || shipment.status, description: description || 'Location updated manually', timestamp: new Date() });
        await shipment.save();

        logger.info(`Shipment ${trackingNumber} location updated manually`);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment location updated successfully' });
    } catch (error) {
        logger.error('Error updating shipment location manually:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment location', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Get shipment history
exports.getShipmentHistory = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await Shipment.findOne({ trackingNumber }, 'history');
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        res.status(200).json({ success: true, data: shipment.history });
    } catch (error) {
        logger.error('Error fetching shipment history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipment history', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Get shipment ETA
exports.getShipmentETA = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

        const currentLocation = shipment.currentLocation.coordinates;
        const destination = shipment.destination.coordinates;
        const distance = calculateDistance(currentLocation, destination);
        const averageSpeed = 50;
        const estimatedTimeHours = distance / averageSpeed;
        const eta = new Date();
        eta.setHours(eta.getHours() + estimatedTimeHours);

        res.json({ trackingNumber: shipment.trackingNumber, currentLocation: shipment.currentLocation, destination: shipment.destination, distance: distance.toFixed(2), estimatedTimeHours: estimatedTimeHours.toFixed(2), eta, status: shipment.status });
    } catch (error) {
        logger.error('Error calculating ETA:', error);
        res.status(500).json({ error: 'Failed to calculate ETA' });
    }
};

// Get shipment route distance
exports.getShipmentRouteDistance = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        let distanceTraveled = calculateDistance(shipment.origin.coordinates, shipment.currentLocation.coordinates);
        const remainingDistance = calculateDistance(shipment.currentLocation.coordinates, shipment.destination.coordinates);
        let totalDistance = calculateDistance(shipment.origin.coordinates, shipment.destination.coordinates);

        let checkpointDistances = [];
        if (shipment.checkpoints && shipment.checkpoints.length > 0) {
            let routePoints = [shipment.origin.coordinates];
            shipment.checkpoints.forEach(cp => routePoints.push(cp.location.coordinates));
            routePoints.push(shipment.destination.coordinates);

            totalDistance = 0;
            for (let i = 0; i < routePoints.length - 1; i++) {
                const segmentDistance = calculateDistance(routePoints[i], routePoints[i + 1]);
                totalDistance += segmentDistance;
                if (i > 0 && i < routePoints.length - 2) {
                    checkpointDistances.push({ checkpointName: shipment.checkpoints[i - 1].name, distance: segmentDistance.toFixed(2) });
                }
            }

            let traveled = 0;
            let currentFound = false;
            for (let i = 0; i < routePoints.length - 1; i++) {
                const segmentDistance = calculateDistance(routePoints[i], routePoints[i + 1]);
                if (!currentFound) {
                    const distanceToStart = calculateDistance(routePoints[i], shipment.currentLocation.coordinates);
                    const distanceToEnd = calculateDistance(shipment.currentLocation.coordinates, routePoints[i + 1]);
                    if (distanceToStart + distanceToEnd <= segmentDistance * 1.1) {
                        traveled += distanceToStart;
                        currentFound = true;
                    } else {
                        traveled += segmentDistance;
                    }
                }
            }
            if (currentFound) distanceTraveled = traveled;
        }

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                distanceTraveled: distanceTraveled.toFixed(2),
                remainingDistance: remainingDistance.toFixed(2),
                totalDistance: totalDistance.toFixed(2),
                progress: Math.min(Math.round((distanceTraveled / totalDistance) * 100), 99),
                checkpoints: shipment.checkpoints.map(cp => ({ name: cp.name, address: cp.location.address, reached: cp.reached, estimatedArrival: cp.estimatedArrival })),
                checkpointDistances
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to calculate route distance', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Get nearby shipments
exports.getNearbyShipments = async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 10000 } = req.query;
        const shipments = await Shipment.find({
            'currentLocation.coordinates': {
                $near: { $geometry: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] }, $maxDistance: parseInt(maxDistance) }
            }
        });
        res.status(200).json({ success: true, data: shipments });
    } catch (error) {
        logger.error('Error fetching nearby shipments:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch nearby shipments', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};
