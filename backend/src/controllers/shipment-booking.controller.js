/**
 * Shipment Booking Controller
 */
const { prisma } = require('../config/database');
const CarrierFactory = require('../services/CarrierFactory');
const PricingService = require('../services/pricing.service');
const ShipmentBookingService = require('../services/ShipmentBookingService');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const { isPlatformRole } = require('../middleware/rbac.policy');
const { resolveEffectiveCarrierPolicy } = require('./shipment.helpers');

/**
 * Get rate quotes with markup applied
 * @route POST /api/shipments/quotes
 */
exports.getQuotes = async (req, res) => {
    try {
        const carrierCode = String(req.body.carrierCode || 'DGR').toUpperCase();
        const carriers = CarrierFactory.getAvailableCarriers();
        const carrierCodes = carriers.map(c => c.code.toUpperCase());

        let targetUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });

        if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

        if (isPlatformRole(req.user.role) && req.body.userId) {
            const selectedUser = await prisma.user.findUnique({
                where: { id: req.body.userId },
                include: { organization: true }
            });
            if (selectedUser) targetUser = selectedUser;
        }

        const { markup, policySource } = resolveEffectiveCarrierPolicy({ targetUser, carrierCode, availableCarrierCodes: carrierCodes });

        const carrier = CarrierFactory.getAdapter(carrierCode);
        const rawQuotes = await carrier.getRates({ ...req.body, carrierCode });

        const markupQuotes = rawQuotes.map(quote => {
            const basePrice = Number(quote.totalPrice);
            const calculation = PricingService.calculateFinalPrice(basePrice, markup);
            
            const optionalServices = (quote.optionalServices || []).map(service => ({
                serviceCode: service.serviceCode,
                serviceName: service.serviceName,
                totalPrice: Number(Number(service.totalPrice || 0).toFixed(3)),
                currency: service.currency || quote.currency || 'KWD'
            }));

            const estimatedShipmentCost = Number(calculation.finalPrice.toFixed(3));
            return {
                ...quote,
                totalPrice: estimatedShipmentCost,
                estimatedShipmentCost,
                optionalServices,
                currency: quote.currency || 'KWD',
                pricingPolicySource: policySource,
                basePrice: basePrice,
                markupAmount: calculation.markupAmount
            };
        });

        res.status(200).json({ success: true, data: markupQuotes });
    } catch (error) {
        return handleControllerError(res, error, 'Quote retrieval');
    }
};

/**
 * List available carriers for the current account
 */
exports.getAvailableCarriers = async (req, res) => {
    try {
        const carriers = CarrierFactory.getAvailableCarriers();
        const carrierCodes = carriers.map(c => c.code.toUpperCase());

        const currentUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });
        
        if (!currentUser) return res.status(404).json({ success: false, error: 'User not found' });

        const { effectiveAllowed } = resolveEffectiveCarrierPolicy({ targetUser: currentUser, carrierCode: null, availableCarrierCodes: carrierCodes });
        const filteredCarriers = carriers.filter(c => effectiveAllowed.includes(c.code.toUpperCase()));

        res.status(200).json({ success: true, data: filteredCarriers });
    } catch (error) {
        return handleControllerError(res, error, 'Carrier listing');
    }
};

/**
 * Fetch booking-time carrier options for an existing shipment
 */
exports.getBookingOptions = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const carrierCode = String(req.query.carrierCode || req.body?.carrierCode || 'DGR').toUpperCase();
        
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        // Authorization check (simplistic for now, should use middleware)
        if (shipment.userId !== req.user.id && !['admin', 'staff'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const carrier = CarrierFactory.getAdapter(carrierCode);
        const rawQuotes = await carrier.getRates({
            sender: shipment.origin,
            receiver: shipment.destination,
            parcels: shipment.parcels || [],
            items: shipment.items || [],
            serviceCode: shipment.serviceCode,
            currency: shipment.currency || 'KWD',
            dangerousGoods: shipment.dangerousGoods,
            carrierCode
        });

        if (!Array.isArray(rawQuotes) || rawQuotes.length === 0) {
            return res.status(200).json({ success: true, data: { carrierCode, services: [], selectedServiceCode: shipment.serviceCode || null, optionalServices: [] } });
        }

        const selectedQuote = rawQuotes.find(q => q.serviceCode === shipment.serviceCode) || rawQuotes[0];
        const optionalServices = (selectedQuote.optionalServices || []).map(s => ({
            serviceCode: s.serviceCode,
            serviceName: s.serviceName,
            totalPrice: Number(Number(s.totalPrice || 0).toFixed(3)),
            currency: s.currency || selectedQuote.currency || 'KWD'
        }));

        const services = rawQuotes.map(q => ({
            serviceCode: q.serviceCode,
            serviceName: q.serviceName,
            totalPrice: Number(Number(q.totalPrice || 0).toFixed(3)),
            currency: q.currency || 'KWD',
            deliveryDate: q.deliveryDate || null
        }));

        return res.status(200).json({ success: true, data: { carrierCode, selectedServiceCode: selectedQuote.serviceCode, optionalServices, services } });
    } catch (error) {
        return handleControllerError(res, error, 'Booking options');
    }
};

/**
 * Finalize booking with a carrier
 */
exports.bookWithCarrier = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { carrierCode, optionalServiceCodes = [] } = req.body;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (shipment.userId !== req.user.id && !['admin', 'staff'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const result = await ShipmentBookingService.bookShipment(trackingNumber, carrierCode, optionalServiceCodes, req.user.role);
        res.status(200).json({ success: true, data: result, message: `Shipment successfully booked` });
    } catch (error) {
        return handleControllerError(res, error, 'Carrier booking');
    }
};

/**
 * Legacy/Alternative DHL submission endpoint
 */
exports.submitToDhl = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const result = await ShipmentBookingService.bookShipment(trackingNumber);
        res.status(200).json({ success: true, data: result.shipment, message: 'Shipment booked successfully' });
    } catch (error) {
        return handleControllerError(res, error, 'DHL submission');
    }
};
