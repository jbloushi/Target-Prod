/**
 * Shipment Checkpoint Controller
 * addCheckpoint, updateCheckpoint, deleteCheckpoint
 */
const Shipment = require('../models/shipment.model');
const logger = require('../utils/logger');

// Add a checkpoint to shipment
exports.addCheckpoint = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { location, name, estimatedArrival, notes } = req.body;

        if (!location || !location.coordinates || !location.address) {
            return res.status(400).json({ success: false, error: 'Location with coordinates and address is required' });
        }
        if (!name) return res.status(400).json({ success: false, error: 'Checkpoint name is required' });

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        shipment.checkpoints.push({
            location: { type: 'Point', coordinates: location.coordinates, address: location.address, timestamp: new Date() },
            name, estimatedArrival: estimatedArrival || null, reached: false, notes: notes || ''
        });

        await shipment.save();
        logger.info(`Checkpoint added to shipment ${trackingNumber}`);
        res.status(200).json({ success: true, data: shipment, message: 'Checkpoint added successfully' });
    } catch (error) {
        logger.error('Error adding checkpoint:', error);
        res.status(500).json({ success: false, error: 'Failed to add checkpoint', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Update a checkpoint
exports.updateCheckpoint = async (req, res) => {
    try {
        const { trackingNumber, checkpointId } = req.params;
        const { name, estimatedArrival, reached, notes, location } = req.body;

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const checkpoint = shipment.checkpoints.id(checkpointId);
        if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint not found' });

        if (name) checkpoint.name = name;
        if (estimatedArrival !== undefined) checkpoint.estimatedArrival = estimatedArrival;
        if (reached !== undefined) checkpoint.reached = reached;
        if (notes !== undefined) checkpoint.notes = notes;

        if (location && location.coordinates && location.address) {
            checkpoint.location = { type: 'Point', coordinates: location.coordinates, address: location.address, timestamp: new Date() };
        }

        if (reached && !checkpoint.reached) {
            shipment.history.push({ location: shipment.currentLocation, status: shipment.status, description: `Checkpoint reached: ${checkpoint.name}`, timestamp: new Date() });
            checkpoint.reached = true;
        }

        await shipment.save();
        logger.info(`Checkpoint ${checkpointId} updated for shipment ${trackingNumber}`);
        res.status(200).json({ success: true, data: shipment, message: 'Checkpoint updated successfully' });
    } catch (error) {
        logger.error('Error updating checkpoint:', error);
        res.status(500).json({ success: false, error: 'Failed to update checkpoint', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Delete a checkpoint
exports.deleteCheckpoint = async (req, res) => {
    try {
        const { trackingNumber, checkpointId } = req.params;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const checkpoint = shipment.checkpoints.id(checkpointId);
        if (!checkpoint) return res.status(404).json({ success: false, error: 'Checkpoint not found' });

        checkpoint.remove();
        await shipment.save();
        logger.info(`Checkpoint ${checkpointId} deleted from shipment ${trackingNumber}`);
        res.status(200).json({ success: true, data: shipment, message: 'Checkpoint deleted successfully' });
    } catch (error) {
        logger.error('Error deleting checkpoint:', error);
        res.status(500).json({ success: false, error: 'Failed to delete checkpoint', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};
