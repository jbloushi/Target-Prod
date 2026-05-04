/**
 * Shipment Public Controller
 * getPublicShipment, updatePublicLocation, updatePublicSettings
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const CarrierFactory = require('../services/CarrierFactory');
const { syncCarrierTrackingHistory, compactHistory, buildDisplayHistory } = require('./shipment.helpers');
const { normalizeStatus } = require('../constants/statusConstants');
const { canAccessShipment } = require('../middleware/authorize.middleware');

/**
 * Public tracking view for customers
 */
exports.getPublicShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        // Sync carrier tracking into the unified history
        try {
            const updates = await syncCarrierTrackingHistory(shipment);
            if (updates) {
                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: {
                        history: updates.history,
                        status: updates.status
                    }
                });
                shipment.history = updates.history;
                shipment.status = updates.status;
            }
        } catch (err) {
            logger.warn(`Public tracking: carrier sync failed for ${trackingNumber}: ${err.message}`);
        }

        const persistedEvents = compactHistory(shipment.history || []).map(h => ({
            source: h.source || 'platform',
            status: normalizeStatus(typeof h.status === 'object' ? (h.status?.status || 'booked') : (h.status || 'booked')),
            description: h.description || '',
            timestamp: h.timestamp,
            localTimestamp: h.localTimestamp || null,
            timezoneOffset: h.timezoneOffset || null,
            location: h.location?.formattedAddress || h.location?.city || ''
        })).filter((event) => event.timestamp);

        let rawEvents = [];
        const carrierTrackingNumber = shipment?.carrierShipmentId || shipment?.dhlTrackingNumber;
        const carrierCode = (shipment?.carrier || shipment?.carrierCode || 'DGR').toUpperCase();

        // Public page should mirror carrier history whenever carrier data exists.
        if (carrierTrackingNumber) {
            try {
                const carrier = CarrierFactory.getAdapter(carrierCode);
                const tracking = await carrier.getTracking(carrierTrackingNumber);
                const carrierEvents = (tracking?.events || []).map((event) => ({
                    source: 'carrier',
                    status: normalizeStatus(event.statusCode || tracking?.status || shipment.status || 'booked'),
                    description: event.description || '',
                    timestamp: event.timestamp,
                    localTimestamp: event.localTimestamp || null,
                    timezoneOffset: event.timezoneOffset || null,
                    location: event.location || ''
                }));
                rawEvents = [...persistedEvents, ...carrierEvents]
                    .filter((event) => event.timestamp)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            } catch (carrierError) {
                logger.warn(`Public tracking: carrier event fetch failed for ${trackingNumber}: ${carrierError.message}`);
            }
        }

        if (rawEvents.length === 0) {
            // Fallback to persisted merged history if carrier feed is unavailable.
            rawEvents = persistedEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        const originLocation = shipment.origin?.formattedAddress || shipment.origin?.city || '';
        let events = buildDisplayHistory(rawEvents, { originLocation }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (events.length === 0 && Array.isArray(shipment.history) && shipment.history.length > 0) {
            const fallbackRaw = compactHistory(shipment.history || []).map(h => ({
                source: h.source || 'platform',
                status: normalizeStatus(typeof h.status === 'object' ? (h.status?.status || 'booked') : (h.status || 'booked')),
                description: h.description || '',
                timestamp: h.timestamp,
                location: h.location?.formattedAddress || h.location?.city || ''
            }));
            events = buildDisplayHistory(fallbackRaw, { originLocation }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (rawEvents.length === 0) rawEvents = fallbackRaw;
        }

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                dhlTrackingNumber: shipment.dhlTrackingNumber || null,
                status: normalizeStatus(shipment.status),
                carrierCode: shipment.carrierCode || null,
                serviceCode: shipment.serviceCode || null,
                shipmentType: shipment.shipmentType || 'package',

                // Route
                origin: {
                    city: shipment.origin?.city,
                    countryCode: shipment.origin?.countryCode,
                    formattedAddress: shipment.origin?.formattedAddress
                },
                destination: {
                    city: shipment.destination?.city,
                    countryCode: shipment.destination?.countryCode,
                    formattedAddress: shipment.destination?.formattedAddress
                },
                currentLocation: shipment.currentLocation,
                estimatedDelivery: shipment.estimatedDelivery,

                // Shipment details
                parcels: (shipment.parcels || []).map(p => ({
                    weight: p.weight,
                    dimensions: p.dimensions,
                    description: p.description
                })),
                totalPieces: shipment.parcels?.length || 1,
                createdAt: shipment.createdAt,

                // Unified events
                events,
                rawEvents,

                // Public update settings
                allowPublicLocationUpdate: shipment.allowPublicLocationUpdate || false,
                allowPublicInfoUpdate: shipment.allowPublicInfoUpdate || false
            }
        });
    } catch (error) {
        logger.error('Error fetching public shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipment' });
    }
};

/**
 * Allow receiver to update destination details if enabled
 */
exports.updatePublicLocation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address } = req.body;
        
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!shipment.allowPublicLocationUpdate) return res.status(403).json({ success: false, error: 'Disabled' });
        if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) return res.status(400).json({ success: false, error: 'Invalid coordinates' });

        const updatedDestination = { 
            ...shipment.destination, 
            formattedAddress: address, 
            longitude: coordinates[0], 
            latitude: coordinates[1] 
        };

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        const updatedHistory = [
            ...history,
            { 
                location: shipment.currentLocation, 
                status: shipment.status, 
                description: 'Destination updated by receiver', 
                timestamp: new Date() 
            }
        ];

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                destination: updatedDestination,
                allowPublicLocationUpdate: false,
                history: updatedHistory
            }
        });

        logger.info(`Shipment ${trackingNumber} destination updated by receiver`);
        res.status(200).json({ success: true, message: 'Location updated successfully' });
    } catch (error) {
        logger.error('Error updating public location:', error);
        res.status(500).json({ success: false, error: 'Failed to update location' });
    }
};

/**
 * Public visibility settings
 */
exports.updatePublicSettings = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { allowPublicLocationUpdate, allowPublicInfoUpdate } = req.body;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                allowPublicLocationUpdate: typeof allowPublicLocationUpdate === 'boolean' ? allowPublicLocationUpdate : shipment.allowPublicLocationUpdate,
                allowPublicInfoUpdate: typeof allowPublicInfoUpdate === 'boolean' ? allowPublicInfoUpdate : shipment.allowPublicInfoUpdate
            }
        });

        logger.info(`Shipment ${trackingNumber} public settings updated`);
        res.status(200).json({ success: true, message: 'Public settings updated successfully' });
    } catch (error) {
        logger.error('Error updating public settings:', error);
        res.status(500).json({ success: false, error: 'Failed to update public settings' });
    }
};
