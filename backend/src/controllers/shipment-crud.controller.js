/**
 * Shipment CRUD Controller
 * createShipment, getAllShipments, getShipmentByTrackingNumber, updateShipment, deleteShipment
 */
const mongoose = require('mongoose');
const Shipment = require('../models/shipment.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const ShipmentDraftService = require('../services/ShipmentDraftService');
const { hasCapability } = require('../middleware/rbac.policy');
const { syncCarrierTrackingHistory, hasCriticalChanges } = require('./shipment.helpers');


// Create a new shipment
exports.getShipmentStats = async (req, res) => {
    try {
        const { organization } = req.query;
        const query = {};

        if (organization) {
            query.organization = organization === 'none' ? null : organization;
        }

        const stats = await Shipment.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Monthly Stats (Last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyStats = await Shipment.aggregate([
            { $match: { ...query, createdAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const result = {
            total: 0,
            drafts: 0,
            pending: 0,
            pickedUp: 0,
            inTransit: 0,
            delivered: 0,
            exceptions: 0,
            monthly: monthlyStats
        };

        stats.forEach(s => {
            result.total += s.count;
            if (s._id === 'draft') result.drafts += s.count;
            else if (['pending', 'ready_for_pickup', 'updated'].includes(s._id)) result.pending += s.count;
            else if (s._id === 'picked_up') result.pickedUp += s.count;
            else if (['in_transit', 'out_for_delivery'].includes(s._id)) result.inTransit += s.count;
            else if (s._id === 'delivered') result.delivered += s.count;
            else if (['exception', 'failed', 'cancelled', 'returned'].includes(s._id)) result.exceptions += s.count;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching shipment stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
};

// Create a new shipment
exports.createShipment = async (req, res) => {
    try {
        const shipment = await ShipmentDraftService.createDraft(req.body, req.user);
        logger.info(`Shipment ${shipment.trackingNumber} created (Draft).`);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment created successfully' });
    } catch (error) {
        logger.error(`Error creating shipment: ${error.message}`, { stack: error.stack, body: req.body, userId: req.user?._id });
        res.status(400).json({ success: false, error: error.message, details: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
};

// Get shipment by tracking number
exports.getShipmentByTrackingNumber = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        logger.info(`[DEBUG] getShipmentByTrackingNumber called for: ${trackingNumber}`);
        const shipment = await Shipment.findOne({ trackingNumber }).populate('user', 'name email role organization');
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!hasCapability(req.user.role, 'VIEW_COST_DATA')) { shipment.costPrice = undefined; shipment.markup = undefined; }
        if (!hasCapability(req.user.role, 'VIEW_DOCUMENTS')) { shipment.labelUrl = undefined; shipment.invoiceUrl = undefined; shipment.awbUrl = undefined; }

        await syncCarrierTrackingHistory(shipment);

        res.status(200).json({ success: true, data: shipment });
    } catch (error) {
        logger.error('Error fetching shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipment', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Get all shipments with filtering and sorting
exports.getAllShipments = async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            logger.warn('MongoDB not connected when fetching shipments, attempting to reconnect...');
            try {
                const { connectDB } = require('../config/database');
                await connectDB();
                logger.info('MongoDB reconnected successfully for fetching shipments');
            } catch (connError) {
                logger.error('Failed to reconnect to MongoDB for fetching shipments:', connError);
                return res.status(500).json({ success: false, error: 'Database connection error. Please try again later.' });
            }
        }

        const { status, statusIn, q, sortBy, sortOrder, limit = 50, page = 1, organization, paid, summary } = req.query;
        const query = {};

        if (status) query.status = status;
        if (statusIn) {
            const statuses = String(statusIn).split(',').map((v) => v.trim()).filter(Boolean);
            if (statuses.length > 0) query.status = { $in: statuses };
        }
        if (organization) {
            query.organization = organization === 'none' ? null : organization;
        }
        if (paid !== undefined) {
            const isPaid = paid === 'true' || paid === true;
            query.paid = isPaid ? true : { $ne: true };
        }

        // Expanded Payment Status Filter
        if (req.query.paymentStatus) {
            switch (req.query.paymentStatus) {
                case 'paid':
                    query.paid = true;
                    break;
                case 'unpaid':
                    query.paid = { $ne: true };
                    query.$or = [{ totalPaid: 0 }, { totalPaid: { $exists: false } }];
                    break;
                case 'partial':
                    query.paid = { $ne: true };
                    query.totalPaid = { $gt: 0 };
                    break;
                // 'all' does nothing, just returns everything matching other filters
            }
        }
        if (q) {
            const escapedQuery = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedQuery, 'i');
            query.$or = [
                { trackingNumber: searchRegex },
                { 'customer.name': searchRegex },
                { 'destination.city': searchRegex }
            ];
        }

        const sortOptions = {};
        if (sortBy) { sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1; } else { sortOptions.createdAt = -1; }

        const parsedLimit = Number.parseInt(limit, 10) || 50;
        const parsedPage = Number.parseInt(page, 10) || 1;
        const limitValue = Math.min(Math.max(parsedLimit, 1), 100);
        const pageValue = Math.max(parsedPage, 1);
        const skip = (pageValue - 1) * limitValue;

        const canViewDocs = hasCapability(req.user.role, 'VIEW_DOCUMENTS');
        const summaryView = summary === 'true' || summary === '1' || summary === true;
        const summaryFields = canViewDocs
            ? '_id trackingNumber status createdAt estimatedDelivery serviceCode origin.city destination.city customer.name customer.phone labelUrl invoiceUrl carrier dhlConfirmed paid totalPaid remainingBalance pricingSnapshot.totalPrice price organization user'
            : '_id trackingNumber status createdAt estimatedDelivery serviceCode origin.city destination.city customer.name customer.phone carrier dhlConfirmed paid totalPaid remainingBalance pricingSnapshot.totalPrice price organization user';
        const projection = summaryView ? summaryFields : '-__v -history -bookingAttempts -documents';

        const countPromise = Object.keys(query).length === 0
            ? Shipment.estimatedDocumentCount()
            : Shipment.countDocuments(query);

        let shipments;
        let totalCount;
        try {
            const shipmentQuery = Shipment.find(query).sort(sortOptions).skip(skip).limit(limitValue).select(projection).lean();
            shipmentQuery.populate('user', 'name email role organization').populate('organization', 'name');
            [shipments, totalCount] = await Promise.all([shipmentQuery, countPromise]);
        } catch (fetchError) {
            if (fetchError.name === 'MongoNetworkError' || fetchError.name === 'MongoTimeoutError' || (fetchError.message && fetchError.message.includes('connection'))) {
                logger.warn('MongoDB fetch error, attempting to reconnect and retry:', fetchError);
                const { connectDB } = require('../config/database');
                await connectDB();
                const retryQuery = Shipment.find(query).sort(sortOptions).skip(skip).limit(limitValue).select(projection).lean();
                if (!summaryView) retryQuery.populate('user', 'name email role organization');
                [shipments, totalCount] = await Promise.all([retryQuery, countPromise]);
                logger.info('Shipments fetched successfully after retry');
            } else {
                throw fetchError;
            }
        }

        const canViewCosts = hasCapability(req.user.role, 'VIEW_COST_DATA');
        const canViewDocUrls = hasCapability(req.user.role, 'VIEW_DOCUMENTS');
        if (!canViewCosts) shipments.forEach((s) => { delete s.costPrice; delete s.markup; });
        if (!canViewDocUrls) shipments.forEach((s) => { delete s.labelUrl; delete s.invoiceUrl; delete s.awbUrl; });

        res.status(200).json({
            success: true, data: shipments,
            pagination: { total: totalCount, page: pageValue, limit: limitValue, pages: Math.ceil(totalCount / limitValue) }
        });
    } catch (error) {
        logger.error('Error fetching shipments:', error);
        let errorMessage = 'Failed to fetch shipments';
        if (error.name === 'MongoNetworkError') errorMessage = 'Network error connecting to database. Please try again later.';
        else if (error.name === 'MongoServerError') errorMessage = 'Database server error. Please try again later.';
        res.status(500).json({ success: false, error: errorMessage, details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

// Delete shipment
exports.deleteShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { user } = req;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const isOwner = shipment.user.toString() === user._id.toString();
        const isAdminOrStaff = ['admin', 'staff'].includes(user.role);
        if (!isAdminOrStaff && !isOwner) return res.status(403).json({ success: false, error: 'Not authorized to delete this shipment' });

        if (shipment.dhlConfirmed) {
            return res.status(400).json({ success: false, error: 'Cannot delete a shipment that has already been booked. Please void it instead.' });
        }

        if (isOwner && !isAdminOrStaff && !['draft', 'ready_for_pickup'].includes(shipment.status)) {
            return res.status(400).json({ success: false, error: `Cannot delete shipment in '${shipment.status}' status. Only Draft or Ready for Pickup.` });
        }

        await shipment.deleteOne();
        return res.status(200).json({ success: true, message: 'Shipment deleted successfully' });
    } catch (error) {
        logger.error('Error deleting shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to delete shipment' });
    }
};

// Update shipment details (General)
exports.updateShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const updates = req.body;
        const { user } = req;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const isOwner = shipment.user.toString() === user._id.toString();
        const isAdminOrStaff = ['admin', 'staff'].includes(user.role);
        if (!isAdminOrStaff && !isOwner) return res.status(403).json({ success: false, error: 'Not authorized to update this shipment' });

        const clientEditable = ['draft', 'pending', 'updated', 'exception', 'ready_for_pickup'];
        const staffEditable = ['draft', 'pending', 'updated', 'ready_for_pickup', 'picked_up', 'exception'];
        if (isOwner && !isAdminOrStaff && !clientEditable.includes(shipment.status)) {
            return res.status(400).json({ success: false, error: `Clients can only edit shipments in Draft, Pending, Exception, or Ready for Pickup status.` });
        }
        if (isAdminOrStaff && !staffEditable.includes(shipment.status)) {
            return res.status(400).json({ success: false, error: `Staff can only edit shipments in Draft, Pending, Ready for Pickup, Picked Up, or Exception status.` });
        }

        const allowedFields = ['destination', 'origin', 'items', 'parcels', 'incoterm', 'currency', 'dangerousGoods', 'serviceCode', 'currentLocation', 'price', 'markup', 'pickupRequest', 'customer', 'status', 'allowPublicLocationUpdate', 'allowPublicInfoUpdate'];

        // --- Dynamic Re-rating & Ledger Adjustment Logic ---
        // Check for critical changes
        const isBooked = shipment.dhlConfirmed === true;
        const criticalChanges = hasCriticalChanges(shipment.toObject(), updates);

        if (criticalChanges) {
            logger.info(`Critical changes detected for shipment ${trackingNumber} (Booked: ${isBooked}). Initiating Re-rating.`);
            try {
                // 1. Merge updates into a temporary object to get the "New State" for rating
                const tempShipment = shipment.toObject();
                Object.keys(updates).forEach(key => { if (allowedFields.includes(key)) tempShipment[key] = updates[key]; });

                // 2. Get New Rates
                const CarrierFactory = require('../services/CarrierFactory');
                const carrier = CarrierFactory.getAdapter(tempShipment.carrier || tempShipment.carrierCode || 'DGR');

                // Map to carrier payload structure
                const payload = {
                    ...tempShipment,
                    sender: tempShipment.origin,
                    receiver: tempShipment.destination,
                    carrierCode: tempShipment.carrierCode
                };

                const quotes = await carrier.getRates(payload);
                if (!quotes || quotes.length === 0) {
                    throw new Error('Re-rating failed: No rates returned from carrier for the updated details.');
                }

                const selectedService = quotes.find(q => q.serviceCode === (tempShipment.serviceCode || shipment.serviceCode)) || quotes[0];

                // 3. Calculate New Price
                const PricingService = require('../services/pricing.service');
                const targetUser = await User.findById(shipment.user).populate('organization');
                const organization = targetUser.organization;
                const carrierCode = (tempShipment.carrier || tempShipment.carrierCode || 'DGR').toUpperCase();

                // Re-resolve markup
                const { markup, source } = PricingService.resolveMarkup(targetUser, organization, carrierCode);

                // Create New Snapshot
                const carrierRate = Number(selectedService.totalPrice || 0);
                const snapshot = PricingService.createSnapshot(
                    carrierRate,
                    markup,
                    selectedService.currency || 'KWD',
                    source
                );

                // Add Optional Services
                const optionalServices = shipment.pricingSnapshot?.optionalServices || [];
                const { Decimal } = require('decimal.js');
                const optionalServicesTotal = optionalServices.reduce((sum, service) => {
                    return sum.plus(new Decimal(service.totalPrice || 0));
                }, new Decimal(0));

                snapshot.optionalServices = optionalServices;
                snapshot.optionalServicesTotal = Number(optionalServicesTotal.toFixed(3));
                snapshot.estimatedShipmentCost = Number(new Decimal(snapshot.totalPrice).toFixed(3));
                snapshot.totalPrice = Number(new Decimal(snapshot.totalPrice).plus(optionalServicesTotal).toFixed(3));

                // 4. Ledger Recording
                const oldPrice = shipment.price || 0;
                const newPrice = snapshot.totalPrice;
                const diff = new Decimal(newPrice).minus(oldPrice);

                const financeLedgerService = require('../services/financeLedger.service');

                if (isBooked) {
                    // Adjust existing ledger entry if booked
                    if (!diff.isZero()) {
                        const adjustmentType = diff.isPositive() ? 'DEBIT' : 'CREDIT';
                        const absAmount = diff.abs().toNumber();

                        await financeLedgerService.createLedgerEntry(shipment.organization, {
                            sourceRepo: 'Shipment',
                            sourceId: shipment._id,
                            amount: absAmount,
                            entryType: adjustmentType,
                            category: 'ADJUSTMENT',
                            description: `Shipment Update Adjustment: ${trackingNumber} (Price changed from ${oldPrice} to ${newPrice})`,
                            reference: trackingNumber,
                            createdBy: user._id
                        });
                    }
                } else {
                    // PRE-BOOKING SNAPSHOT RECORDING (as requested)
                    // Create a 0-amount audit entry to record the "Snapshot" event
                    await financeLedgerService.createLedgerEntry(shipment.organization, {
                        sourceRepo: 'Shipment',
                        sourceId: shipment._id,
                        amount: 0,
                        entryType: 'DEBIT',
                        category: 'SHIPMENT_CHARGE',
                        description: `Pre-booking Snapshot: ${trackingNumber} (Price recalculated from ${oldPrice} to ${newPrice})`,
                        reference: trackingNumber,
                        createdBy: user._id,
                        metadata: {
                            oldPrice: String(oldPrice),
                            newPrice: String(newPrice),
                            event: 'PRE_BOOKING_EDIT'
                        }
                    });
                }

                // Update Shipment Financials
                shipment.price = newPrice;
                shipment.pricingSnapshot = snapshot;

                // Log to history
                shipment.history.push({
                    status: 'updated',
                    description: `Shipment re-rated due to edits. Price ${isBooked ? 'adjusted' : 'updated'} to ${newPrice} ${snapshot.currency}.`,
                    timestamp: new Date(),
                    location: shipment.currentLocation
                });

            } catch (pricingError) {
                logger.error('Re-rating failed during update:', pricingError);
                return res.status(400).json({
                    success: false,
                    error: `Update rejected: Unable to re-rate shipment with new details. ${pricingError.message}`
                });
            }
        }
        // --- End Dynamic Re-rating ---

        Object.keys(updates).forEach(key => { if (allowedFields.includes(key)) shipment[key] = updates[key]; });

        if (updates.status && updates.status !== shipment.status) {
            shipment.history.push({ status: updates.status, description: `Shipment updated by ${user.role} (${user.name})`, timestamp: new Date(), location: shipment.currentLocation });
        }
        await shipment.save();
        res.status(200).json({ success: true, data: shipment, message: 'Shipment updated successfully' });
    } catch (error) {
        logger.error('Error updating shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment' });
    }
};

