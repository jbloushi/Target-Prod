const express = require('express');
const router = express.Router();
const Receiver = require('../models/receiver.model');
const logger = require('../utils/logger');
const authController = require('../controllers/auth.controller');

// All routes require authentication
router.use(authController.protect);

// Get all receivers for current user
router.get('/', async (req, res) => {
    try {
        const receivers = await Receiver.find({ ownerId: req.user._id })
            .sort({ lastUsed: -1, createdAt: -1 });

        res.json({
            success: true,
            data: receivers
        });
    } catch (error) {
        logger.error('Error fetching receivers:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch receivers' });
    }
});

// Search receiver by phone (for auto-fill)
router.get('/search', async (req, res) => {
    try {
        const { phone } = req.query;

        if (!phone || phone.length < 5) {
            return res.status(400).json({ success: false, error: 'Phone number required (min 5 digits)' });
        }

        // Search by phone (partial match from end)
        const receiver = await Receiver.findOne({
            ownerId: req.user._id,
            phone: { $regex: phone.replace(/\D/g, '').slice(-8) + '$' }
        });

        if (!receiver) {
            return res.json({ success: true, data: null, found: false });
        }

        res.json({
            success: true,
            data: receiver,
            found: true
        });
    } catch (error) {
        logger.error('Error searching receiver:', error);
        res.status(500).json({ success: false, error: 'Failed to search receiver' });
    }
});

// Create new receiver
router.post('/', async (req, res) => {
    try {
        const receiverData = {
            ...req.body,
            ownerId: req.user._id,
            phone: req.body.phone?.replace(/\D/g, '') // Clean phone number
        };

        // Check if already exists
        const existing = await Receiver.findOne({
            ownerId: req.user._id,
            phone: receiverData.phone
        });

        if (existing) {
            // Update existing
            Object.assign(existing, receiverData);
            existing.lastUsed = new Date();
            await existing.save();

            return res.json({
                success: true,
                data: existing,
                updated: true
            });
        }

        const receiver = await Receiver.create(receiverData);

        res.status(201).json({
            success: true,
            data: receiver
        });
    } catch (error) {
        logger.error('Error creating receiver:', error);
        res.status(500).json({ success: false, error: 'Failed to save receiver' });
    }
});

// Update receiver
router.put('/:id', async (req, res) => {
    try {
        const receiver = await Receiver.findOneAndUpdate(
            { _id: req.params.id, ownerId: req.user._id },
            { ...req.body, lastUsed: new Date() },
            { new: true, runValidators: true }
        );

        if (!receiver) {
            return res.status(404).json({ success: false, error: 'Receiver not found' });
        }

        res.json({
            success: true,
            data: receiver
        });
    } catch (error) {
        logger.error('Error updating receiver:', error);
        res.status(500).json({ success: false, error: 'Failed to update receiver' });
    }
});

// Delete receiver
router.delete('/:id', async (req, res) => {
    try {
        const receiver = await Receiver.findOneAndDelete({
            _id: req.params.id,
            ownerId: req.user._id
        });

        if (!receiver) {
            return res.status(404).json({ success: false, error: 'Receiver not found' });
        }

        res.json({
            success: true,
            message: 'Receiver deleted'
        });
    } catch (error) {
        logger.error('Error deleting receiver:', error);
        res.status(500).json({ success: false, error: 'Failed to delete receiver' });
    }
});

module.exports = router;
