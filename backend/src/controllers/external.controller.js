const PickupRequest = require('../models/pickupRequest.model');
const Shipment = require('../models/shipment.model');
const logger = require('../utils/logger');

// POST /api/client/pickups
exports.createPickup = async (req, res) => {
    try {
        // Reuse logic but stricter validation for API
        const { sender, receiver, parcels, serviceCode, requestedPickupDate, pickupInstructions } = req.body;

        if (!sender || !receiver || !parcels || !requestedPickupDate) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const newRequest = await PickupRequest.create({
            client: req.user._id,
            sender,
            receiver,
            parcels,
            serviceCode: serviceCode || 'P',
            requestedPickupDate,
            pickupInstructions,
            status: 'REQUESTED',
            auditLog: [{
                action: 'CREATED',
                actor: req.user._id,
                metadata: { source: 'EXTERNAL_API' }
            }]
        });

        res.status(201).json({
            success: true,
            data: {
                id: newRequest._id,
                status: newRequest.status,
                trackingNumber: null, // No tracking until approved
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
        const request = await PickupRequest.findOne({
            _id: req.params.id,
            client: req.user._id
        }).populate('shipment', 'trackingNumber status labelUrl awbUrl invoiceUrl');

        if (!request) {
            return res.status(404).json({ success: false, error: 'Pickup Request not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                id: request._id,
                status: request.status,
                rejectionReason: request.rejectionReason,
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

        // Find shipment belonging to this client (by user or by reference)
        const shipment = await Shipment.findOne({
            trackingNumber: id,
            user: req.user._id
        });

        if (!shipment) {
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
        const shipment = await Shipment.findOne({
            trackingNumber: id,
            user: req.user._id
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        // Start with internal events
        let unifiedEvents = shipment.history.map(h => ({
            status: h.status,
            description: h.description,
            location: h.location?.formattedAddress || 'Unknown',
            timestamp: new Date(h.timestamp), // Ensure Date object
            source: 'INTERNAL'
        }));

        // Fetch DHL events if applicable
        if (shipment.dhlConfirmed && shipment.dhlTrackingNumber) {
            try {
                const carrier = require('../services/CarrierFactory').getAdapter('DHL');
                const dhlTracking = await carrier.getTracking(shipment.dhlTrackingNumber);
                if (dhlTracking && dhlTracking.events) {
                    const dhlEvents = dhlTracking.events.map(e => ({
                        status: e.statusCode,
                        description: e.description,
                        location: e.location,
                        timestamp: new Date(e.timestamp), // Ensure Date object
                        source: 'DHL'
                    }));
                    unifiedEvents = [...unifiedEvents, ...dhlEvents];
                }
            } catch (dhlError) {
                logger.warn(`Failed to fetch DHL tracking for ${shipment.trackingNumber}:`, dhlError.message);
                // Continue with just internal events
            }
        }

        // Sort by timestamp descending (newest first)
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
