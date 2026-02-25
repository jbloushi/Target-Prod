const CarrierFactory = require('../services/CarrierFactory');
const CarrierRateService = require('../services/CarrierRateService');
const PricingService = require('../services/pricing.service');
const User = require('../models/user.model');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const { hasCriticalChanges } = require('./shipment.helpers');
const { Decimal } = require('decimal.js');
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
                email: normalized.sender.email || req.user.email,
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
 * PUT /api/v1/shipments/:number
 * Update an existing shipment.
 */
exports.updateShipment = async (req, res) => {
    try {
        const { number } = req.params;
        const updates = req.body;
        const { user } = req;

        const shipment = await Shipment.findOne({ trackingNumber: number, user: user._id });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        // Clients can only edit in specific statuses
        const editableStatuses = ['draft', 'pending', 'updated', 'created', 'exception', 'ready_for_pickup'];
        if (!editableStatuses.includes(shipment.status)) {
            return res.status(400).json({
                success: false,
                error: `Shipment cannot be updated in '${shipment.status}' status.`
            });
        }

        const allowedFields = [
            'destination', 'origin', 'items', 'parcels', 'incoterm',
            'currency', 'dangerousGoods', 'serviceCode', 'customer',
            'reference', 'remarks'
        ];

        // Check for critical changes that require re-rating
        const criticalChanges = hasCriticalChanges(shipment.toObject(), updates);
        const isBooked = shipment.dhlConfirmed === true;

        if (criticalChanges) {
            logger.info(`Critical changes for ${number}. Re-rating...`);

            // 1. Merge updates to get new state
            const tempShipment = shipment.toObject();
            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) tempShipment[key] = updates[key];
            });

            // 2. Get New Rates
            const carrier = CarrierFactory.getAdapter(tempShipment.carrier || 'DGR');
            const payload = {
                ...tempShipment,
                sender: tempShipment.origin,
                receiver: tempShipment.destination
            };

            const quotes = await carrier.getRates(payload);
            if (!quotes || quotes.length === 0) {
                throw new Error('Re-rating failed: No rates returned for updated details.');
            }

            const selectedService = quotes.find(q => q.serviceCode === (tempShipment.serviceCode || shipment.serviceCode)) || quotes[0];

            // 3. Resolve Markup & Create Snapshot
            const targetUser = await User.findById(shipment.user).populate('organization');
            const carrierCode = (tempShipment.carrier || 'DGR').toUpperCase();
            const { markup, source } = PricingService.resolveMarkup(targetUser, targetUser.organization, carrierCode);

            const carrierRate = Number(selectedService.totalPrice || 0);
            const snapshot = PricingService.createSnapshot(
                carrierRate,
                markup,
                selectedService.currency || 'KWD',
                source
            );

            // Add optional services preserved from original if any
            const optionalServices = shipment.pricingSnapshot?.optionalServices || [];
            const optionalServicesTotal = optionalServices.reduce((sum, s) => sum.plus(new Decimal(s.totalPrice || 0)), new Decimal(0));

            snapshot.optionalServices = optionalServices;
            snapshot.optionalServicesTotal = Number(optionalServicesTotal.toFixed(3));
            snapshot.estimatedShipmentCost = Number(new Decimal(snapshot.totalPrice).toFixed(3));
            snapshot.totalPrice = Number(new Decimal(snapshot.totalPrice).plus(optionalServicesTotal).toFixed(3));

            // 4. Ledger (Only if price difference matters)
            const oldPrice = shipment.price || 0;
            const newPrice = snapshot.totalPrice;
            const diff = new Decimal(newPrice).minus(oldPrice);

            if (!diff.isZero()) {
                const financeLedgerService = require('../services/financeLedger.service');
                if (isBooked) {
                    const adjustmentType = diff.isPositive() ? 'DEBIT' : 'CREDIT';
                    await financeLedgerService.createLedgerEntry(shipment.organization, {
                        sourceRepo: 'Shipment',
                        sourceId: shipment._id,
                        amount: diff.abs().toNumber(),
                        entryType: adjustmentType,
                        category: 'ADJUSTMENT',
                        description: `API Update Adjustment: ${number} (${oldPrice} -> ${newPrice})`,
                        reference: number,
                        createdBy: user._id
                    });
                } else {
                    await financeLedgerService.createLedgerEntry(shipment.organization, {
                        sourceRepo: 'Shipment',
                        sourceId: shipment._id,
                        amount: 0,
                        entryType: 'DEBIT',
                        category: 'SHIPMENT_CHARGE',
                        description: `API Pre-booking Snapshot Update: ${number}`,
                        reference: number,
                        createdBy: user._id,
                        metadata: { oldPrice: String(oldPrice), newPrice: String(newPrice) }
                    });
                }
            }

            shipment.price = newPrice;
            shipment.pricingSnapshot = snapshot;
            shipment.history.push({
                status: 'updated',
                description: `Shipment re-rated. New price: ${newPrice} ${snapshot.currency}`,
                timestamp: new Date()
            });
        }

        // Apply remaining updates
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) shipment[key] = updates[key];
        });

        await shipment.save();

        res.status(200).json({
            success: true,
            message: 'Shipment updated successfully',
            data: shipment
        });

    } catch (error) {
        logger.error('API Update Error:', error);
        res.status(error.statusCode || 400).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
};

/**
 * POST /api/v1/quotes
 * Get pricing quotes for a potential shipment.
 */
exports.getQuotation = async (req, res) => {
    try {
        const shipmentData = req.body;
        const { carrierCode } = req.query;

        // 1. Normalize
        const normalized = normalizeShipment(shipmentData);

        // 2. Get Wholesale Rates
        const rawRates = await CarrierRateService.getRates(normalized, carrierCode);

        // 3. Apply Markups
        const targetUser = await User.findById(req.user._id).populate('organization');

        const finalQuotes = rawRates.map(rate => {
            const provider = rate.provider || 'DGR';
            const { markup, source } = PricingService.resolveMarkup(targetUser, targetUser.organization, provider);

            const calculation = PricingService.calculateFinalPrice(rate.totalPrice, markup, rate.currency);

            return {
                serviceName: rate.serviceName || rate.serviceCode,
                serviceCode: rate.serviceCode,
                carrier: provider,
                basePrice: rate.totalPrice,
                totalPrice: calculation.finalPrice,
                currency: rate.currency,
                estimatedDelivery: rate.estimatedDelivery,
                markupSource: source
            };
        });

        res.status(200).json({
            success: true,
            data: finalQuotes
        });

    } catch (error) {
        logger.error('API Quote Error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
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
