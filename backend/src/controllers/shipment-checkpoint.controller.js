/**
 * Shipment Checkpoint Controller
 * addCheckpoint, updateCheckpoint, deleteCheckpoint
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { canAccessShipment } = require('../middleware/authorize.middleware');

// Add a checkpoint to shipment
exports.addCheckpoint = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { location, name, estimatedArrival, notes } = req.body;

        if (!location || !location.coordinates || !location.address) {
            return res.status(400).json({ success: false, error: 'Location with coordinates and address is required' });
        }
        if (!name) return res.status(400).json({ success: false, error: 'Checkpoint name is required' });

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const checkpoints = Array.isArray(shipment.checkpoints) ? shipment.checkpoints : [];
        const newCheckpoint = {
            id: crypto.randomUUID(),
            location: { type: 'Point', coordinates: location.coordinates, address: location.address, timestamp: new Date() },
            name, 
            estimatedArrival: estimatedArrival || null, 
            reached: false, 
            notes: notes || ''
        };

        const updated = await prisma.shipment.update({
            where: { trackingNumber },
            data: {
                checkpoints: [...checkpoints, newCheckpoint]
            }
        });

        logger.info(`Checkpoint added to shipment ${trackingNumber}`);
        res.status(200).json({ success: true, data: updated, message: 'Checkpoint added successfully' });
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

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const checkpoints = Array.isArray(shipment.checkpoints) ? [...shipment.checkpoints] : [];
        const checkpointIndex = checkpoints.findIndex(c => c.id === checkpointId || c._id === checkpointId);
        
        if (checkpointIndex === -1) return res.status(404).json({ success: false, error: 'Checkpoint not found' });

        const checkpoint = checkpoints[checkpointIndex];

        if (name) checkpoint.name = name;
        if (estimatedArrival !== undefined) checkpoint.estimatedArrival = estimatedArrival;
        if (reached !== undefined) checkpoint.reached = reached;
        if (notes !== undefined) checkpoint.notes = notes;

        if (location && location.coordinates && location.address) {
            checkpoint.location = { type: 'Point', coordinates: location.coordinates, address: location.address, timestamp: new Date() };
        }

        const updateData = { checkpoints };

        if (reached && !checkpoint.reached) {
            const history = Array.isArray(shipment.history) ? [...shipment.history] : [];
            updateData.history = [
                ...history,
                { 
                    location: shipment.currentLocation, 
                    status: shipment.status, 
                    description: `Checkpoint reached: ${checkpoint.name}`, 
                    timestamp: new Date() 
                }
            ];
            checkpoint.reached = true;
        }

        const updated = await prisma.shipment.update({
            where: { trackingNumber },
            data: updateData
        });

        logger.info(`Checkpoint ${checkpointId} updated for shipment ${trackingNumber}`);
        res.status(200).json({ success: true, data: updated, message: 'Checkpoint updated successfully' });
    } catch (error) {
        logger.error('Error updating checkpoint:', error);
        res.status(500).json({ success: false, error: 'Failed to update checkpoint', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Delete a checkpoint
exports.deleteCheckpoint = async (req, res) => {
    try {
        const { trackingNumber, checkpointId } = req.params;
        
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const checkpoints = Array.isArray(shipment.checkpoints) ? shipment.checkpoints : [];
        const initialLength = checkpoints.length;
        const filteredCheckpoints = checkpoints.filter(c => c.id !== checkpointId && c._id !== checkpointId);

        if (filteredCheckpoints.length === initialLength) {
            return res.status(404).json({ success: false, error: 'Checkpoint not found' });
        }

        const updated = await prisma.shipment.update({
            where: { trackingNumber },
            data: { checkpoints: filteredCheckpoints }
        });

        logger.info(`Checkpoint ${checkpointId} deleted from shipment ${trackingNumber}`);
        res.status(200).json({ success: true, data: updated, message: 'Checkpoint deleted successfully' });
    } catch (error) {
        logger.error('Error deleting checkpoint:', error);
        res.status(500).json({ success: false, error: 'Failed to delete checkpoint', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};
