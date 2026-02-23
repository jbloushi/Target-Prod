/**
 * Shipment Public Controller
 * getPublicShipment, updatePublicLocation, updatePublicSettings
 */
const Shipment = require('../models/shipment.model');
const logger = require('../utils/logger');

exports.getPublicShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber, status: shipment.status,
                destination: { address: shipment.destination.address, formattedAddress: shipment.destination.formattedAddress, city: shipment.destination.city, coordinates: shipment.destination.coordinates, latitude: shipment.destination.latitude, longitude: shipment.destination.longitude },
                origin: { city: shipment.origin.city, country: shipment.origin.country, formattedAddress: shipment.origin.formattedAddress, coordinates: shipment.origin.coordinates, latitude: shipment.origin.latitude, longitude: shipment.origin.longitude },
                currentLocation: shipment.currentLocation, estimatedDelivery: shipment.estimatedDelivery,
                history: shipment.history.map(h => ({ status: h.status, timestamp: h.timestamp, location: h.location, description: h.description })),
                checkpoints: shipment.checkpoints,
                allowPublicLocationUpdate: shipment.allowPublicLocationUpdate || false,
                allowPublicInfoUpdate: shipment.allowPublicInfoUpdate || false
            }
        });
    } catch (error) {
        logger.error('Error fetching public shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipment' });
    }
};

exports.updatePublicLocation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address } = req.body;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!shipment.allowPublicLocationUpdate) return res.status(403).json({ success: false, error: 'Location updates are not enabled for this shipment.' });
        if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) return res.status(400).json({ success: false, error: 'Invalid coordinates' });

        shipment.destination = { ...shipment.destination.toObject(), formattedAddress: address, longitude: coordinates[0], latitude: coordinates[1] };
        shipment.allowPublicLocationUpdate = false;
        shipment.history.push({ location: shipment.currentLocation, status: shipment.status, description: 'Destination location updated by receiver', timestamp: new Date() });
        await shipment.save();
        logger.info(`Shipment ${trackingNumber} destination updated by receiver`);
        res.status(200).json({ success: true, data: { trackingNumber: shipment.trackingNumber, destination: shipment.destination }, message: 'Location updated successfully' });
    } catch (error) {
        logger.error('Error updating public location:', error);
        res.status(500).json({ success: false, error: 'Failed to update location' });
    }
};

exports.updatePublicSettings = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { allowPublicLocationUpdate, allowPublicInfoUpdate } = req.body;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (typeof allowPublicLocationUpdate === 'boolean') shipment.allowPublicLocationUpdate = allowPublicLocationUpdate;
        if (typeof allowPublicInfoUpdate === 'boolean') shipment.allowPublicInfoUpdate = allowPublicInfoUpdate;
        await shipment.save();
        logger.info(`Shipment ${trackingNumber} public settings updated`);
        res.status(200).json({ success: true, data: { trackingNumber: shipment.trackingNumber, allowPublicLocationUpdate: shipment.allowPublicLocationUpdate, allowPublicInfoUpdate: shipment.allowPublicInfoUpdate }, message: 'Public settings updated successfully' });
    } catch (error) {
        logger.error('Error updating public settings:', error);
        res.status(500).json({ success: false, error: 'Failed to update public settings' });
    }
};
