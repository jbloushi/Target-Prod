const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// POST /api/client/pickups
exports.createPickup = async (req, res) => {
    try {
        const { sender, receiver, parcels, serviceCode, requestedPickupDate, pickupInstructions } = req.body;

        if (!sender || !receiver || !parcels || !requestedPickupDate) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const newRequest = await prisma.pickupRequest.create({
            data: {
                userId: req.user.id,
                organizationId: req.user.organizationId,
                pickupLocation: sender, // Simplified mapping as per schema 
                pickupTime: new Date(requestedPickupDate),
                notes: pickupInstructions || '',
                status: 'REQUESTED'
            }
        });

        res.status(201).json({
            success: true,
            data: {
                id: newRequest.id,
                status: newRequest.status,
                trackingNumber: null,
                createdAt: newRequest.createdAt
            }
        });
    } catch (error) {
        logger.error('External API Create Pickup Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

// GET /api/client/pickups/:id
exports.getPickupStatus = async (req, res) => {
    try {
        const request = await prisma.pickupRequest.findUnique({
            where: { id: req.params.id },
            include: { shipment: true }
        });

        if (!request || request.userId !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Pickup Request not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                id: request.id,
                status: request.status,
                rejectionReason: request.notes,
                shipment: request.shipment ? {
                    trackingNumber: request.shipment.trackingNumber,
                    status: request.shipment.status,
                    labelUrl: request.shipment.labelUrl,
                    awbUrl: request.shipment.awbUrl,
                    invoiceUrl: request.shipment.invoiceUrl
                } : null,
                createdAt: request.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

// GET /api/client/shipments/:id (Internal or Carrier Tracking)
exports.getShipmentStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber: id }
        });

        if (!shipment || shipment.userId !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                currentLocation: shipment.currentLocation,
                history: shipment.history,
                estimatedDelivery: shipment.estimatedDelivery,
                dhlTrackingNumber: shipment.dhlTrackingNumber
            }
        });
    } catch (error) {
        logger.error('External API Get Shipment Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

// GET /api/client/shipments/:id/tracking (Unified)
exports.getUnifiedTracking = async (req, res) => {
    try {
        const { id } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber: id }
        });

        if (!shipment || shipment.userId !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        let unifiedEvents = history.map(h => ({
            status: h.status,
            description: h.description,
            location: h.location?.formattedAddress || 'Unknown',
            timestamp: new Date(h.timestamp), 
            source: 'INTERNAL'
        }));

        if (shipment.dhlConfirmed && shipment.dhlTrackingNumber) {
            try {
                const carrier = require('../services/CarrierFactory').getAdapter('DHL');
                const dhlTracking = await carrier.getTracking(shipment.dhlTrackingNumber);
                if (dhlTracking && dhlTracking.events) {
                    const dhlEvents = dhlTracking.events.map(e => ({
                        status: e.statusCode,
                        description: e.description,
                        location: e.location,
                        timestamp: new Date(e.timestamp), 
                        source: 'DHL'
                    }));
                    unifiedEvents = [...unifiedEvents, ...dhlEvents];
                }
            } catch (dhlError) {
                logger.warn(`Failed to fetch DHL tracking for ${shipment.trackingNumber}:`, dhlError.message);
            }
        }

        unifiedEvents.sort((a, b) => b.timestamp - a.timestamp);

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                events: unifiedEvents
            }
        });

    } catch (error) {
        logger.error('External API Get Tracking Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};
