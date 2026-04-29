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
const {
    getAssignedShippingAccess,
    assertRequestedAccessAllowed,
    shouldEnforceAssignedAccess,
    getServiceOptions
} = require('../services/shippingAccess.service');

/**
 * Get rate quotes with markup applied
 * @route POST /api/shipments/quotes
 */
exports.getQuotes = async (req, res) => {
    try {
        const requestedCarrierCode = req.body.carrierCode ? String(req.body.carrierCode).toUpperCase() : null;
        const requestedServiceCode = req.body.serviceCode ? String(req.body.serviceCode).toUpperCase() : null;
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

        const assignedAccess = getAssignedShippingAccess(targetUser);
        const enforceAssignedAccess = shouldEnforceAssignedAccess(req.user, targetUser);
        if (enforceAssignedAccess) {
            assertRequestedAccessAllowed(assignedAccess, {
                carrierCode: requestedCarrierCode,
                serviceCode: requestedServiceCode
            });
        }

        const carrierCode = enforceAssignedAccess
            ? assignedAccess.carrierCode
            : (requestedCarrierCode || assignedAccess.carrierCode || 'DGR');
        const serviceCode = enforceAssignedAccess
            ? assignedAccess.serviceCode
            : (requestedServiceCode || req.body.serviceCode || null);

        const { markup, policySource } = resolveEffectiveCarrierPolicy({ targetUser, carrierCode, availableCarrierCodes: carrierCodes });

        if (carrierCode === 'MANUAL') {
            const basePrice = Number(req.body.costPrice || req.body.price || 0);
            const calculation = PricingService.calculateFinalPrice(basePrice, markup);
            return res.status(200).json({
                success: true,
                data: [{
                    serviceName: 'Manual Shipment',
                    serviceCode: null,
                    carrier: 'MANUAL',
                    totalPrice: Number(calculation.finalPrice.toFixed(3)),
                    estimatedShipmentCost: Number(calculation.finalPrice.toFixed(3)),
                    optionalServices: [],
                    currency: req.body.currency || 'KWD',
                    pricingPolicySource: policySource,
                    basePrice,
                    markupAmount: calculation.markupAmount
                }]
            });
        }

        if (carrierCode === 'OTE' || carrierCode === 'LOGESTECHS') {
            const policy = PricingService.resolveCarrierPricingPolicy(targetUser, carrierCode, req.body.currency || 'AED');
            const basePrice = policy.fixedFee || 0;
            if (!basePrice) {
                return res.status(400).json({ success: false, error: 'OTE fixed rate is not configured for this user.' });
            }
            const calculation = PricingService.calculateFinalPrice(basePrice, markup);
            return res.status(200).json({
                success: true,
                data: [{
                    serviceName: 'OTE Standard',
                    serviceCode: 'STD',
                    carrier: 'OTE',
                    totalPrice: Number(calculation.finalPrice.toFixed(3)),
                    estimatedShipmentCost: Number(calculation.finalPrice.toFixed(3)),
                    optionalServices: [],
                    currency: policy.currency || 'AED',
                    pricingPolicySource: policySource,
                    basePrice,
                    markupAmount: calculation.markupAmount
                }]
            });
        }

        const carrier = CarrierFactory.getAdapter(carrierCode);
        const rawQuotes = await carrier.getRates({ ...req.body, carrierCode, serviceCode });
        const visibleQuotes = serviceCode
            ? rawQuotes.filter(quote => String(quote.serviceCode || '').toUpperCase() === String(serviceCode).toUpperCase())
            : rawQuotes;

        if (serviceCode && visibleQuotes.length === 0) {
            return res.status(400).json({ success: false, error: `Assigned service ${serviceCode} is not available for this shipment.` });
        }

        const markupQuotes = visibleQuotes.map(quote => {
            const policy = PricingService.resolveCarrierPricingPolicy(targetUser, carrierCode, quote.currency || req.body.currency || 'KWD');
            const quoteCurrency = quote.currency || policy.currency || 'KWD';
            const basePrice = PricingService.applyCarrierBasePricePolicy(quote.totalPrice, targetUser, carrierCode);
            const calculation = PricingService.calculateFinalPrice(basePrice, markup);
            
            const optionalServices = (quote.optionalServices || []).map(service => ({
                serviceCode: service.serviceCode,
                serviceName: service.serviceName,
                ...(() => {
                    const carrierAmount = Number(Number(service.totalPrice || 0).toFixed(3));
                    const currency = service.currency || quoteCurrency || 'KWD';
                    const { markup: optionalMarkup, source: optionalMarkupSource } =
                        PricingService.resolveOptionalServiceMarkup(targetUser, targetUser.organization, carrierCode, service.serviceCode);
                    if (!optionalMarkup) {
                        return {
                            totalPrice: carrierAmount,
                            carrierAmount,
                            markupAmount: 0,
                            currency
                        };
                    }
                    const optionalCalc = PricingService.calculateFinalPrice(carrierAmount, optionalMarkup, currency);
                    return {
                        totalPrice: Number(optionalCalc.finalPrice.toFixed(3)),
                        carrierAmount,
                        markupAmount: Number(optionalCalc.markupAmount.toFixed(3)),
                        markupPolicySource: optionalMarkupSource,
                        currency
                    };
                })()
            }));

            const estimatedShipmentCost = Number(calculation.finalPrice.toFixed(3));
            return {
                ...quote,
                totalPrice: estimatedShipmentCost,
                estimatedShipmentCost,
                optionalServices,
                declaredCurrency: req.body.currency || quoteCurrency || 'KWD',
                billingCurrency: quoteCurrency || 'KWD',
                currency: quoteCurrency || 'KWD',
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
        const scope = String(req.query.scope || '').toLowerCase();
        const carrierCodes = carriers.map(c => c.code.toUpperCase());

        const currentUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });
        
        if (!currentUser) return res.status(404).json({ success: false, error: 'User not found' });

        let targetUser = currentUser;
        if (isPlatformRole(req.user.role) && req.query.userId) {
            const selectedUser = await prisma.user.findUnique({
                where: { id: req.query.userId },
                include: { organization: true }
            });
            if (selectedUser) targetUser = selectedUser;
        }

        const assignedAccess = getAssignedShippingAccess(targetUser);
        const enforceAssignedAccess = shouldEnforceAssignedAccess(req.user, targetUser);

        let filteredCarriers;
        const isAssignmentScope = scope === 'assignment';

        if (isAssignmentScope && isPlatformRole(req.user.role)) {
            filteredCarriers = carriers.map(c => ({
                ...c,
                serviceOptions: getServiceOptions(c.code)
            }));

            return res.status(200).json({ success: true, data: filteredCarriers });
        }

        if (enforceAssignedAccess) {
            filteredCarriers = carriers
                .filter(c => c.code.toUpperCase() === assignedAccess.carrierCode)
                .map(c => ({
                    ...c,
                    assigned: true,
                    serviceCode: assignedAccess.serviceCode,
                    serviceName: assignedAccess.serviceName,
                    serviceOptions: getServiceOptions(c.code)
                }));
        } else {
            const { effectiveAllowed } = resolveEffectiveCarrierPolicy({ targetUser, carrierCode: null, availableCarrierCodes: carrierCodes });
            filteredCarriers = carriers
                .filter(c => effectiveAllowed.includes(c.code.toUpperCase()))
                .map(c => ({ ...c, serviceOptions: getServiceOptions(c.code) }));
        }

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

        if (String(shipment.carrierCode || carrierCode || '').toUpperCase() === 'MANUAL') {
            return res.status(200).json({ success: true, data: { carrierCode: 'MANUAL', services: [], selectedServiceCode: null, optionalServices: [] } });
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

        if (String(shipment.carrierCode || carrierCode || '').toUpperCase() === 'MANUAL') {
            return res.status(400).json({ success: false, error: 'Manual Shipment is managed inside the platform and cannot be booked with a 3PL carrier.' });
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
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (String(shipment?.carrierCode || '').toUpperCase() === 'MANUAL') {
            return res.status(400).json({ success: false, error: 'Manual Shipment is managed inside the platform and cannot be booked with a 3PL carrier.' });
        }
        const result = await ShipmentBookingService.bookShipment(trackingNumber);
        res.status(200).json({ success: true, data: result.shipment, message: 'Shipment booked successfully' });
    } catch (error) {
        return handleControllerError(res, error, 'DHL submission');
    }
};
