const PickupRequest = require('../models/pickupRequest.model');
const Shipment = require('../models/shipment.model');
const User = require('../models/user.model');

const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { isOrgRole } = require('../middleware/rbac.policy');

// Helper to generate tracking number (reused from shipment controller logic)
const generateTrackingNumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if ((i + 1) % 4 === 0 && i < 11) result += '-';
    }
    return result;
};

// Create a new Pickup Request
exports.createRequest = async (req, res) => {
    try {
        const { sender, receiver, parcels, serviceCode, requestedPickupDate, pickupInstructions } = req.body;

        // Validate Required Fields
        if (!sender || !receiver || !parcels || !requestedPickupDate) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const newRequest = await PickupRequest.create({
            client: req.user._id,
            sender,
            receiver,
            parcels,
            serviceCode,
            requestedPickupDate,
            pickupInstructions,
            status: 'READY_FOR_PICKUP', // Set to ready for pickup immediately
            auditLog: [{
                action: 'CREATED',
                actor: req.user._id,
                metadata: { source: 'WEB' }
            }]
        });

        res.status(201).json({ success: true, data: newRequest });
    } catch (error) {
        logger.error('Create Pickup Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to create pickup request' });
    }
};

// Get all requests (Client sees own, Staff sees all)
exports.getAllRequests = async (req, res) => {
    try {
        let query = {};
        if (isOrgRole(req.user.role)) {
            query.client = req.user._id;
        }

        const requests = await PickupRequest.find(query)
            .sort({ createdAt: -1 })
            .populate('client', 'name email phone')
            .populate('shipment', 'trackingNumber status');

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        logger.error('Get Pickup Requests Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch pickup requests' });
    }
};

// Get single request
exports.getRequest = async (req, res) => {
    try {
        const request = await PickupRequest.findById(req.params.id)
            .populate('client', 'name email')
            .populate('shipment');

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        // Access Control
        if (isOrgRole(req.user.role) && request.client._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        logger.error('Get Pickup Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch request' });
    }
};

// Update Request (Only if DRAFT/REQUESTED)
exports.updateRequest = async (req, res) => {
    try {
        const request = await PickupRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        // Access Control
        if (isOrgRole(req.user.role) && request.client.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        if (['APPROVED', 'REJECTED', 'COMPLETED'].includes(request.status)) {
            return res.status(400).json({ success: false, error: 'Cannot update processed request' });
        }

        const updatedRequest = await PickupRequest.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: updatedRequest });
    } catch (error) {
        logger.error('Update Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to update request' });
    }
};

// Helper to process approval (used by API and internal scanner)
const processApproval = async (requestId, approverId) => {
    const request = await PickupRequest.findById(requestId);
    if (!request) throw new Error('Request not found');
    if (request.status === 'APPROVED') return { request, shipment: await Shipment.findById(request.shipment) };

    const clientUser = await User.findById(request.client).populate('organization');

    // 1. Prepare Shipment Data
    const shipmentItems = request.parcels.map(p => ({
        description: p.description,
        quantity: p.quantity,
        weight: p.weight,
        declaredValue: p.declaredValue,
        dimensions: {
            length: p.length,
            width: p.width,
            height: p.height
        }
    }));

    const shipmentData = {
        trackingNumber: generateTrackingNumber(),
        origin: request.sender,
        destination: request.receiver,
        currentLocation: request.sender,
        status: 'ready_for_pickup',
        customer: {
            name: request.receiver.contactPerson || 'Customer',
            email: request.receiver.email || 'email@example.com',
            phone: request.receiver.phone
        },
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        items: shipmentItems,
        user: request.client,
        organization: clientUser?.organization?._id || null,
        serviceCode: request.serviceCode || 'P',
        pickupRequest: request._id,
        history: [{
            location: request.sender,
            status: 'ready_for_pickup',
            description: 'Shipment created from Pickup Request',
            timestamp: new Date()
        }]
    };

    const shipment = new Shipment(shipmentData);
    shipment.dhlConfirmed = false;

    // 3. Save Shipment
    await shipment.save();

    // 4. Update Pickup Request
    request.status = 'APPROVED';
    request.shipment = shipment._id;
    request.approvedBy = approverId;
    request.approvedAt = new Date();
    request.auditLog.push({
        action: 'APPROVED',
        actor: approverId,
        metadata: { shipmentId: shipment._id, dhlTracking: shipment.dhlTrackingNumber }
    });

    await request.save();
    return { request, shipment };
};

exports.processApproval = processApproval;

// Approve Request -> Create Shipment -> Call DHL
exports.approveRequest = async (req, res) => {
    try {
        const { request, shipment } = await processApproval(req.params.id, req.user._id);
        res.status(200).json({
            success: true,
            message: 'Request approved and Shipment created',
            data: { request, shipment }
        });
    } catch (error) {
        logger.error('Approve Request Error:', error);
        res.status(error.message === 'Request not found' ? 404 : 500).json({
            success: false,
            error: error.message
        });
    }
};

// Reject Request
exports.rejectRequest = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required' });
        }

        const request = await PickupRequest.findByIdAndUpdate(req.params.id, {
            status: 'REJECTED',
            rejectionReason: reason,
            $push: {
                auditLog: {
                    action: 'REJECTED',
                    actor: req.user._id,
                    metadata: { reason }
                }
            }
        }, { new: true });

        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        logger.error('Reject Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to reject request' });
    }
};
// Delete Request (Only if DRAFT/REQUESTED)
exports.deleteRequest = async (req, res) => {
    try {
        const request = await PickupRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        // Access Control
        if (isOrgRole(req.user.role) && request.client.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        // Only allow deleting pending requests
        if (['APPROVED', 'COMPLETED', 'IN_TRANSIT', 'DELIVERED'].includes(request.status)) {
            return res.status(400).json({ success: false, error: 'Cannot delete processed/active request' });
        }

        await PickupRequest.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, count: 0 }); // 204 is often used but 200 with JSON is safer for some clients
    } catch (error) {
        logger.error('Delete Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete request' });
    }
};
