const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { isOrgRole } = require('../middleware/rbac.policy');

/**
 * Helper to generate tracking number
 */
const generateTrackingNumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if ((i + 1) % 4 === 0 && i < 11) result += '-';
    }
    return result;
};

/**
 * Create a new Pickup Request
 */
exports.createRequest = async (req, res) => {
    try {
        const { sender, receiver, parcels, serviceCode, requestedPickupDate, pickupInstructions } = req.body;

        if (!sender || !receiver || !parcels || !requestedPickupDate) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const newRequest = await prisma.pickupRequest.create({
            data: {
                userId: req.user.id,
                organizationId: req.user.organizationId,
                status: 'READY_FOR_PICKUP',
                pickupLocation: sender,
                pickupTime: new Date(requestedPickupDate),
                notes: pickupInstructions,
                // We'll store parcels/sender/receiver details in JSON for flexibility or use specific fields
                // In this schema, we mainly have pickupLocation and notes.
                // For a full migration, we use the JSON blobs from the schema.
            }
        });

        res.status(201).json({ success: true, data: newRequest });
    } catch (error) {
        logger.error('Create Pickup Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to create pickup request' });
    }
};

/**
 * Get all requests
 */
exports.getAllRequests = async (req, res) => {
    try {
        let where = {};
        if (isOrgRole(req.user.role)) {
            where.organizationId = req.user.organizationId;
        }

        const requests = await prisma.pickupRequest.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { name: true, email: true, phone: true } },
                shipment: { select: { trackingNumber: true, status: true } }
            }
        });

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        logger.error('Get Pickup Requests Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch pickup requests' });
    }
};

/**
 * Get single request
 */
exports.getRequest = async (req, res) => {
    try {
        const request = await prisma.pickupRequest.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: { name: true, email: true } },
                shipment: true
            }
        });

        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

        // Access Control
        if (isOrgRole(req.user.role) && request.organizationId !== req.user.organizationId) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        logger.error('Get Pickup Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch request' });
    }
};

/**
 * Update Request
 */
exports.updateRequest = async (req, res) => {
    try {
        const request = await prisma.pickupRequest.findUnique({ where: { id: req.params.id } });
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

        if (isOrgRole(req.user.role) && request.organizationId !== req.user.organizationId) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        if (['APPROVED', 'COMPLETED'].includes(request.status)) {
            return res.status(400).json({ success: false, error: 'Cannot update processed request' });
        }

        const updatedRequest = await prisma.pickupRequest.update({
            where: { id: req.params.id },
            data: req.body
        });

        res.status(200).json({ success: true, data: updatedRequest });
    } catch (error) {
        logger.error('Update Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Internal logic for approving and creating shipment
 */
const processApproval = async (requestId, approverId) => {
    return await prisma.$transaction(async (tx) => {
        const request = await tx.pickupRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new Error('Request not found');
        if (request.status === 'APPROVED') return { request };

        // Create Shipment
        const shipment = await tx.shipment.create({
            data: {
                trackingNumber: generateTrackingNumber(),
                userId: request.userId,
                organizationId: request.organizationId,
                status: 'ready_for_pickup',
                origin: request.pickupLocation,
                destination: request.pickupLocation, // Placeholder
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                history: [
                    {
                        location: request.pickupLocation,
                        status: 'ready_for_pickup',
                        description: 'Created from Pickup Request',
                        timestamp: new Date()
                    }
                ]
            }
        });

        // Update Request
        const updatedRequest = await tx.pickupRequest.update({
            where: { id: requestId },
            data: {
                status: 'APPROVED',
                shipmentId: shipment.id
            }
        });

        return { request: updatedRequest, shipment };
    });
};

exports.approveRequest = async (req, res) => {
    try {
        const { request, shipment } = await processApproval(req.params.id, req.user.id);
        res.status(200).json({
            success: true,
            data: { request, shipment }
        });
    } catch (error) {
        logger.error('Approve Request Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Reject Request
 */
exports.rejectRequest = async (req, res) => {
    try {
        const { reason } = req.body;
        const request = await prisma.pickupRequest.update({
            where: { id: req.params.id },
            data: { status: 'REJECTED' }
        });

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        logger.error('Reject Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * Delete Request
 */
exports.deleteRequest = async (req, res) => {
    try {
        const request = await prisma.pickupRequest.findUnique({ where: { id: req.params.id } });
        if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

        if (isOrgRole(req.user.role) && request.organizationId !== req.user.organizationId) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        await prisma.pickupRequest.delete({ where: { id: req.params.id } });
        res.status(200).json({ success: true, count: 0 });
    } catch (error) {
        logger.error('Delete Request Error:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
