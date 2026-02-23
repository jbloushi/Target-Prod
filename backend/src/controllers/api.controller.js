const CarrierFactory = require('../services/CarrierFactory');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const logger = require('../utils/logger');
const Shipment = require('../models/shipment.model');

/**
 * POST /api/v1/shipments
 * Create a shipment using a specific carrier or default.
 */
exports.createShipment = async (req, res) => {
    try {
        const { carrierCode, serviceCode, ...shipmentData } = req.body;

        // 1. Normalize
        const normalized = normalizeShipment(shipmentData);

        // 2. Get Adapter
        // Default to DHL if not specified
        const carrier = carrierCode || 'DHL';
        const adapter = CarrierFactory.getAdapter(carrier);

        // 3. Validate via Adapter
        const errors = await adapter.validate(normalized);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation Failed',
                details: errors
            });
        }

        // 4. Create Label
        const result = await adapter.createShipment({
            ...normalized,
            user: req.user?._id // Pass user for logging
        }, serviceCode || 'P');

        // 5. Audit/Persist
        // Map Normalized Data to Mongoose Schema
        // Schema requires specific structure for addresses (origin/destination) and customer

        const mapAddressToSchema = (addr) => ({
            company: addr.company,
            contactPerson: addr.contactPerson,
            phone: addr.phone,
            email: addr.email,
            streetLines: addr.streetLines,
            city: addr.city,
            postalCode: addr.postalCode,
            countryCode: addr.countryCode,
            state: addr.state,
            taxId: addr.taxId,
            vatNumber: addr.vatNumber,
            eoriNumber: addr.eoriNumber
        });

        const newShipment = await Shipment.create({
            trackingNumber: result.trackingNumber,
            user: req.user._id, // Linked to the API user
            carrier: carrier,
            serviceCode: serviceCode || 'P',
            status: 'created', // Valid enum value (was OFFERED)
            labelUrl: result.labelBase64 ? `data:application/pdf;base64,${result.labelBase64}` : null,
            invoiceUrl: result.invoiceBase64 ? `data:application/pdf;base64,${result.invoiceBase64}` : null,

            // Required Schema Fields
            origin: mapAddressToSchema(normalized.sender),
            destination: mapAddressToSchema(normalized.receiver),
            currentLocation: mapAddressToSchema(normalized.sender), // Initial location is origin

            customer: {
                name: normalized.sender.company || normalized.sender.contactPerson,
                email: normalized.sender.email,
                phone: normalized.sender.phone
            },

            // Dates
            estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Placeholder: +7 days
            shipmentDate: normalized.shipmentDate || new Date(),

            // Mapping packages for Mongoose (flatten structure if needed)
            parcels: normalized.packages.map(p => ({
                weight: p.weight.value, // Extract value from {value, unit}
                dimensions: p.dimensions,
                description: p.description
            })),
            items: normalized.items,

            price: result.totalPrice || 0,
            currency: 'KWD',

            history: [{
                status: 'created',
                timestamp: new Date(),
                description: 'Shipment created via API',
                location: normalized.sender
            }]
        });

        // If adapter provides extra fields (like dhlTrackingNumber), update them
        if (result.dhlTrackingNumber) {
            newShipment.dhlTrackingNumber = result.dhlTrackingNumber;
            // Also set dhlConfirmed if we have a tracking number
            newShipment.dhlConfirmed = true;
            await newShipment.save();
        }

        res.status(201).json({
            success: true,
            data: {
                trackingNumber: result.trackingNumber,
                labelUrl: newShipment.labelUrl,
                invoiceUrl: newShipment.invoiceUrl,
                carrier: carrier,
                status: newShipment.status
            }
        });

    } catch (error) {
        logger.error('API Create Shipment Error:', error);

        // If it's a known provider validation/error, return it with the right status
        if (error.isProviderError || error.statusCode) {
            return res.status(error.statusCode || 400).json({
                success: false,
                error: error.message,
                details: error.details || null
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error',
            details: error.errors // Mongoose validation errors
        });
    }
};

/**
 * GET /api/v1/tracking/:number
 */
exports.trackShipment = async (req, res) => {
    try {
        const { number } = req.params;

        // Find shipment belonging to this API user
        const shipment = await Shipment.findOne({
            trackingNumber: number,
            user: req.user._id
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        // Return status
        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                carrier: shipment.carrier,
                history: shipment.history,
                estimatedDelivery: shipment.estimatedDelivery
            }
        });

    } catch (error) {
        logger.error('API Track Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * GET /api/v1/addresses
 */
exports.getAddresses = async (req, res) => {
    try {
        // req.user is already populated by middleware
        res.status(200).json({
            success: true,
            count: req.user.addresses.length,
            data: req.user.addresses
        });
    } catch (error) {
        logger.error('API Get Addresses Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * POST /api/v1/addresses
 */
exports.addAddress = async (req, res) => {
    try {
        const addressData = req.body;

        // Add to user's addresses
        req.user.addresses.push(addressData);
        await req.user.save();

        // Get the newly added address (last one)
        const newAddress = req.user.addresses[req.user.addresses.length - 1];

        res.status(201).json({
            success: true,
            data: newAddress
        });
    } catch (error) {
        logger.error('API Add Address Error:', error);
        res.status(400).json({ success: false, error: error.message || 'Invalid address data' });
    }
};

/**
 * PUT /api/v1/addresses/:id
 */
exports.updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const address = req.user.addresses.id(id);

        if (!address) {
            return res.status(404).json({ success: false, error: 'Address not found' });
        }

        // Update fields
        Object.keys(updateData).forEach(key => {
            address[key] = updateData[key];
        });

        await req.user.save();

        res.status(200).json({
            success: true,
            data: address
        });
    } catch (error) {
        logger.error('API Update Address Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};
