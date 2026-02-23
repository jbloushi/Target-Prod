/**
 * Shipment Booking Controller
 * getQuotes, getAvailableCarriers, getBookingOptions, bookWithCarrier, submitToDhl
 */
const User = require('../models/user.model');
const Shipment = require('../models/shipment.model');
const CarrierFactory = require('../services/CarrierFactory');
const PricingService = require('../services/pricing.service');
const ShipmentBookingService = require('../services/ShipmentBookingService');
const logger = require('../utils/logger');
const { isPlatformRole } = require('../middleware/rbac.policy');
const { canAccessShipment } = require('../middleware/authorize.middleware');
const { resolveEffectiveCarrierPolicy } = require('./shipment.helpers');

// Get rate quotes
exports.getQuotes = async (req, res) => {
    try {
        console.log('[DEBUG] getQuotes controller hit with body:', JSON.stringify(req.body));
        const carrierCode = String(req.body.carrierCode || 'DGR').toUpperCase();
        const carriers = CarrierFactory.getAvailableCarriers();
        const carrierCodes = carriers.map((c) => c.code.toUpperCase());

        let targetUser = await User.findById(req.user._id).populate('organization');
        if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

        if (isPlatformRole(req.user.role) && req.body.userId) {
            const selectedUser = await User.findById(req.body.userId).populate('organization');
            if (selectedUser) targetUser = selectedUser;
        }

        const { markup, policySource } = resolveEffectiveCarrierPolicy({ targetUser, carrierCode, availableCarrierCodes: carrierCodes });

        console.log('--- DEBUG MARKUP RESOLUTION ---');
        console.log('User ID:', targetUser._id);
        console.log('User Markup:', JSON.stringify(targetUser.markup));
        console.log('Org ID:', targetUser.organization?._id);
        if (targetUser.organization) {
            console.log('Org Markup (Full):', JSON.stringify(targetUser.organization.markup, null, 2));
        }
        console.log('Target Carrier:', carrierCode);
        console.log('Resolved Markup:', JSON.stringify(markup, null, 2));
        console.log('Resolved Source:', policySource);
        console.log('-------------------------------');

        console.log('--- RAW FRONTEND QUOTE PAYLOAD ---', JSON.stringify(req.body, null, 2));

        const carrier = CarrierFactory.getAdapter(carrierCode);
        const rawQuotes = await carrier.getRates({ ...req.body, carrierCode });

        const markupQuotes = rawQuotes.map((quote) => {
            const basePrice = Number(quote.totalPrice);
            const calculation = PricingService.calculateFinalPrice(basePrice, markup);
            const optionalServices = (quote.optionalServices || []).map((service) => ({
                serviceCode: service.serviceCode, serviceName: service.serviceName,
                totalPrice: Number(Number(service.totalPrice || 0).toFixed(3)),
                currency: service.currency || quote.currency || 'KWD'
            }));
            const estimatedShipmentCost = Number(calculation.finalPrice.toFixed(3));
            return {
                ...quote, totalPrice: estimatedShipmentCost, estimatedShipmentCost, optionalServices,
                currency: quote.currency || 'KWD', pricingPolicySource: policySource,
                carrierCost: ['admin', 'accounting', 'staff'].includes(req.user.role) ? basePrice : undefined,
                markupAmount: ['admin', 'accounting', 'staff'].includes(req.user.role) ? calculation.markupAmount : undefined
            };
        });

        res.status(200).json({ success: true, data: markupQuotes });
    } catch (error) {
        logger.error('Error fetching quotes:', error);
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
};

// List available carriers
exports.getAvailableCarriers = async (req, res) => {
    try {
        const carriers = CarrierFactory.getAvailableCarriers();
        const carrierCodes = carriers.map((c) => c.code.toUpperCase());

        const currentUser = await User.findById(req.user._id).populate('organization');
        if (!currentUser) return res.status(404).json({ success: false, error: 'User not found' });

        const { effectiveAllowed } = resolveEffectiveCarrierPolicy({ targetUser: currentUser, carrierCode: null, availableCarrierCodes: carrierCodes });
        const filteredCarriers = carriers.filter((c) => effectiveAllowed.includes(c.code.toUpperCase()));

        res.status(200).json({ success: true, data: filteredCarriers });
    } catch (error) {
        logger.error('Error getting available carriers:', error);
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
};

// Fetch booking-time carrier options
exports.getBookingOptions = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const carrierCode = String(req.query.carrierCode || req.body?.carrierCode || 'DGR').toUpperCase();
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const carrier = CarrierFactory.getAdapter(carrierCode);
        const rawQuotes = await carrier.getRates({
            sender: shipment.origin, receiver: shipment.destination,
            origin: shipment.origin, destination: shipment.destination,
            parcels: shipment.parcels || [], items: shipment.items || [],
            serviceCode: shipment.serviceCode, currency: shipment.currency || 'KWD',
            dangerousGoods: shipment.dangerousGoods, carrierCode
        });

        if (!Array.isArray(rawQuotes) || rawQuotes.length === 0) {
            return res.status(200).json({ success: true, data: { carrierCode, services: [], selectedServiceCode: shipment.serviceCode || null, optionalServices: [] } });
        }

        const selectedQuote = rawQuotes.find((q) => q.serviceCode === shipment.serviceCode) || rawQuotes[0];
        const optionalServices = (selectedQuote.optionalServices || []).map((s) => ({
            serviceCode: s.serviceCode, serviceName: s.serviceName,
            totalPrice: Number(Number(s.totalPrice || 0).toFixed(3)), currency: s.currency || selectedQuote.currency || 'KWD'
        }));
        const services = rawQuotes.map((q) => ({
            serviceCode: q.serviceCode, serviceName: q.serviceName,
            totalPrice: Number(Number(q.totalPrice || 0).toFixed(3)),
            currency: q.currency || 'KWD', deliveryDate: q.deliveryDate || null
        }));

        return res.status(200).json({ success: true, data: { carrierCode, selectedServiceCode: selectedQuote.serviceCode, optionalServices, services } });
    } catch (error) {
        logger.error('Error fetching booking options:', error);
        return res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
};

// Book with carrier
exports.bookWithCarrier = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { carrierCode, optionalServiceCodes = [] } = req.body;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const result = await ShipmentBookingService.bookShipment(trackingNumber, carrierCode, optionalServiceCodes);
        res.status(200).json({ success: true, data: result, message: `Shipment successfully booked with ${carrierCode || shipment.carrierCode || shipment.carrier || 'DGR'}` });
    } catch (error) {
        logger.error('Error booking with carrier:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message,
            details: error.details || error.response?.data || undefined
        });
    }
};

// Submit to DHL
exports.submitToDhl = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const result = await ShipmentBookingService.bookShipment(trackingNumber, req.user);
        logger.info(`Shipment ${trackingNumber} booked via Service.`);
        res.status(200).json({ success: true, data: result.shipment, message: result.message || 'Shipment booked successfully' });
    } catch (error) {
        logger.error('Error submitting to DHL:', error);
        const status = error.message.includes('not found') ? 404 : error.message.includes('already booked') ? 400 : error.message.includes('Pricing data invalid') ? 400 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
};
