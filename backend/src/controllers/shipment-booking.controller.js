/**
 * Shipment Booking Controller
 */
const { prisma } = require('../config/database');
const CarrierFactory = require('../services/CarrierFactory');
const PricingService = require('../services/pricing.service');
const ShipmentBookingService = require('../services/ShipmentBookingService');
const InternalShipmentConversionService = require('../services/InternalShipmentConversionService');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const { isPlatformRole, hasCapability } = require('../middleware/rbac.policy');
const { canAccessShipment } = require('../middleware/authorize.middleware');
const { resolveEffectiveCarrierPolicy } = require('./shipment.helpers');
const diagnosticAttemptLog = require('../services/diagnosticAttemptLog.service');
const { normalizeCarrierCode } = require('../services/carrierMinimumValidation.service');
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
    const startTime = Date.now();
    try {
        const requestedCarrierCode = req.body.carrierCode ? normalizeCarrierCode(req.body.carrierCode) : null;
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

        const isTest = req.body.isTest === true || req.body.environment === 'test';
        const environment = isTest ? 'test' : (req.body.environment || 'production');

        const policy = PricingService.resolveCarrierPricingPolicy(targetUser, carrierCode, req.body.currency || 'KWD');
        let rawQuotes = [];
        let rateCardResult = null;

        if (policy.pricingModel === 'RATE_CARD' && policy.rateCardId) {
            try {
                const RateCardService = require('../services/RateCardService');
                const countryCode = req.body.receiver?.countryCode || req.body.receiver?.country;
                if (countryCode) {
                    rateCardResult = RateCardService.calculateRate({
                        rateCardId: policy.rateCardId,
                        carrierCode,
                        countryCode,
                        weight: req.body.weight,
                        packages: req.body.packages
                    });
                    rawQuotes = [{
                        serviceName: ` (${rateCardResult.rateCardName})`,
                        serviceCode: serviceCode || (carrierCode === 'SMSA' ? 'EDDL' : 'P'),
                        carrierCode,
                        totalPrice: rateCardResult.totalPrice,
                        currency: rateCardResult.currency || 'KWD',
                        deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                        optionalServices: [],
                        rateCardResult
                    }];
                }
            } catch (err) {
                logger.warn(`RateCard rating fallback in getQuotes for ${policy.rateCardId}: ${err.message}`);
            }
        }

        if (rawQuotes.length === 0) {
            const carrier = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
            rawQuotes = await carrier.getRates({ ...req.body, carrierCode, serviceCode, isTest, environment });
        }

        if (rawQuotes.length === 0 || rawQuotes.every(q => Number(q.totalPrice || 0) <= 0)) {
            const fallbackQuote = typeof PricingService.getFallbackRate === 'function' ? PricingService.getFallbackRate({
                carrierCode,
                serviceCode,
                destinationCountry: req.body.receiver?.countryCode || req.body.receiver?.country,
                weight: req.body.weight,
                packages: req.body.packages
            }) : null;
            if (fallbackQuote) {
                rawQuotes = [fallbackQuote];
            }
        }

        const visibleQuotes = serviceCode
            ? rawQuotes.filter(quote => String(quote.serviceCode || '').toUpperCase() === String(serviceCode).toUpperCase())
            : rawQuotes;

        if (serviceCode && visibleQuotes.length === 0) {
            const message = `Assigned service ${serviceCode} is not available for this shipment.`;
            diagnosticAttemptLog.recordAttempt({
                carrierCode,
                action: 'RATE_QUOTE',
                status: 'VALIDATION_ERROR',
                durationMs: Date.now() - startTime,
                message,
                organizationId: targetUser?.organizationId || null,
                details: { serviceCode }
            });
            return res.status(400).json({
                success: false,
                error: message,
                field: 'serviceCode',
                errors: [{ field: 'serviceCode', message }]
            });
        }

        const canViewCosts = hasCapability(req.user?.role, 'VIEW_COST_DATA');

        const markupQuotes = visibleQuotes.map(quote => {
            if (quote.requiresManualPricing) {
                return {
                    ...quote,
                    totalPrice: null,
                    amount: null,
                    currency: quote.currency || req.body.currency || 'KWD',
                    pricingPolicySource: policySource
                };
            }

            const quoteCurrency = policy.currency || quote.currency || 'KWD';
            const basePrice = PricingService.applyCarrierBasePricePolicy(quote.totalPrice, targetUser, carrierCode, {
                countryCode: req.body.receiver?.countryCode || req.body.receiver?.country,
                packages: req.body.packages,
                weight: req.body.weight
            });
            const calculation = PricingService.calculateFinalPrice(basePrice, markup);
            
            const optionalServices = (quote.optionalServices || []).map(service => {
                const carrierAmount = Number(Number(service.totalPrice || 0).toFixed(3));
                const currency = service.currency || quoteCurrency || 'KWD';
                const { markup: optionalMarkup, source: optionalMarkupSource } =
                    PricingService.resolveOptionalServiceMarkup(targetUser, targetUser.organization, carrierCode, service.serviceCode);
                if (!optionalMarkup) {
                    const opt = {
                        serviceCode: service.serviceCode,
                        serviceName: service.serviceName,
                        totalPrice: carrierAmount,
                        currency
                    };
                    if (canViewCosts) {
                        opt.carrierAmount = carrierAmount;
                        opt.markupAmount = 0;
                    }
                    return opt;
                }
                const optionalCalc = PricingService.calculateFinalPrice(carrierAmount, optionalMarkup, currency);
                const opt = {
                    serviceCode: service.serviceCode,
                    serviceName: service.serviceName,
                    totalPrice: Number(optionalCalc.finalPrice.toFixed(3)),
                    currency
                };
                if (canViewCosts) {
                    opt.carrierAmount = carrierAmount;
                    opt.markupAmount = Number(optionalCalc.markupAmount.toFixed(3));
                    opt.markupPolicySource = optionalMarkupSource;
                }
                return opt;
            });

            const estimatedShipmentCost = Number(calculation.finalPrice.toFixed(3));
            const formattedQuote = {
                ...quote,
                totalPrice: estimatedShipmentCost,
                estimatedShipmentCost,
                optionalServices,
                declaredCurrency: req.body.currency || quoteCurrency || 'KWD',
                billingCurrency: quoteCurrency || 'KWD',
                currency: quoteCurrency || 'KWD',
                pricingPolicySource: policySource
            };

            if (canViewCosts) {
                formattedQuote.basePrice = basePrice;
                formattedQuote.markupAmount = calculation.markupAmount;
                if (quote.rateCardResult) {
                    formattedQuote.rateCardResult = quote.rateCardResult;
                }
            } else {
                delete formattedQuote.rateCardResult;
                delete formattedQuote.basePrice;
                delete formattedQuote.markupAmount;
                delete formattedQuote.costPrice;
                delete formattedQuote.carrierRate;
            }

            return formattedQuote;
        });

        diagnosticAttemptLog.recordAttempt({
            carrierCode,
            action: 'RATE_QUOTE',
            status: 'SUCCESS',
            durationMs: Date.now() - startTime,
            message: `Returned ${markupQuotes.length} rate quote(s)`,
            organizationId: targetUser?.organizationId || null,
            details: { quoteCount: markupQuotes.length, serviceCode }
        });

        res.status(200).json({ success: true, data: markupQuotes });
    } catch (error) {
        diagnosticAttemptLog.recordAttempt({
            carrierCode: req.body?.carrierCode || 'DGR',
            action: 'RATE_QUOTE',
            status: 'FAILED',
            durationMs: Date.now() - startTime,
            message: error.message || 'Quote retrieval failed'
        });
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
        const carrierCode = normalizeCarrierCode(req.query.carrierCode || req.body?.carrierCode || 'DGR');
        
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const shipmentCarrier = normalizeCarrierCode(shipment.carrierCode || 'DGR');
        if (carrierCode === 'INTERNAL' || shipmentCarrier === 'INTERNAL' || shipment.internallyManaged === true) {
            return res.status(200).json({
                success: true,
                data: {
                    carrierCode: 'INTERNAL',
                    services: [{ serviceCode: null, serviceName: 'Manual / Internal Shipment' }],
                    selectedServiceCode: null,
                    optionalServices: []
                }
            });
        }

        const isTest = shipment.pricingSnapshot?.isTest === true || shipment.pricingSnapshot?.environment === 'test' || req.query.isTest === 'true';
        const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || 'production');
        const carrier = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
        const rawQuotes = await carrier.getRates({
            sender: shipment.origin,
            receiver: shipment.destination,
            parcels: shipment.parcels || [],
            items: shipment.items || [],
            serviceCode: shipment.serviceCode,
            currency: shipment.currency || 'KWD',
            dangerousGoods: shipment.dangerousGoods || shipment.origin?.dangerousGoods,
            carrierCode,
            isTest,
            environment
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
        const { carrierCode: rawCarrierCode, optionalServiceCodes = [], items, parcels, origin, destination } = req.body;
        const carrierCode = rawCarrierCode ? normalizeCarrierCode(rawCarrierCode) : null;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        if (['cancelled', 'delivered', 'returned', 'rto_in_transit'].includes(String(shipment.status || '').toLowerCase())) {
            const msg = `Cannot book shipment in '${shipment.status}' status.`;
            return res.status(400).json({
                success: false,
                error: msg,
                field: 'status',
                errors: [{ field: 'status', message: msg }]
            });
        }

        // If staff provided updated items, parcels, origin, or destination, persist them prior to carrier dispatch
        const preBookingUpdates = {};
        if (items && Array.isArray(items)) preBookingUpdates.items = items;
        if (parcels && Array.isArray(parcels)) preBookingUpdates.parcels = parcels;
        if (origin && typeof origin === 'object') preBookingUpdates.origin = { ...(shipment.origin || {}), ...origin };
        if (destination && typeof destination === 'object') preBookingUpdates.destination = { ...(shipment.destination || {}), ...destination };

        if (Object.keys(preBookingUpdates).length > 0) {
            await prisma.shipment.update({
                where: { trackingNumber },
                data: preBookingUpdates
            });
        }

        const isSync = req.query.async === 'false' || req.body?.async === false;

        if (isSync) {
            const result = await ShipmentBookingService.bookShipment(trackingNumber, carrierCode, optionalServiceCodes, req.user.role);
            return res.status(200).json({ success: true, data: result, message: `Shipment successfully booked` });
        }

        // Asynchronous non-blocking dispatch returning HTTP 202 Accepted
        const result = await ShipmentBookingService.bookShipmentAsync(trackingNumber, carrierCode, optionalServiceCodes, req.user.role);
        return res.status(202).json({
            success: true,
            status: 'processing',
            data: result,
            message: result.message || 'Carrier booking initiated in background'
        });
    } catch (error) {
        if (error?.isValidationError) {
            return res.status(400).json({
                success: false,
                error: error.message,
                field: error.field,
                errors: error.errors
            });
        }
        return handleControllerError(res, error, 'Carrier booking');
    }
};

/**
 * List conversion target carriers for an INTERNAL shipment.
 */
exports.getInternalShipmentConversionTargets = async (req, res) => {
    try {
        const { trackingNumber } = req.params;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        if (String(shipment.carrierCode || '').toUpperCase() !== 'INTERNAL' && shipment.internallyManaged !== true) {
            return res.status(400).json({ success: false, error: 'Conversion targets are only available for INTERNAL shipments' });
        }

        const carriers = InternalShipmentConversionService.getConversionTargetCarriers()
            .map(carrier => ({
                ...carrier,
                serviceOptions: getServiceOptions(carrier.code)
            }));

        return res.status(200).json({ success: true, data: carriers });
    } catch (error) {
        return handleControllerError(res, error, 'Internal shipment conversion targets');
    }
};

/**
 * Convert an INTERNAL shipment into a new external carrier shipment.
 */
exports.convertInternalShipmentToCarrier = async (req, res) => {
    try {
        const { trackingNumber } = req.params;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const result = await InternalShipmentConversionService.convertToCarrier(trackingNumber, req.body, req.user);
        return res.status(201).json({
            success: true,
            data: result,
            message: `Shipment converted to ${result.carrierCode}`
        });
    } catch (error) {
        return handleControllerError(res, error, 'Internal shipment conversion');
    }
};

/**
 * Legacy/Alternative DHL submission endpoint
 */
exports.submitToDhl = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const isAsync = req.query.async === 'true' || req.body?.async === true;
        if (isAsync) {
            const result = await ShipmentBookingService.bookShipmentAsync(trackingNumber, 'DGR', [], req.user?.role);
            return res.status(202).json({
                success: true,
                status: 'processing',
                data: result,
                message: 'DHL booking initiated in background'
            });
        }

        const result = await ShipmentBookingService.bookShipment(trackingNumber, 'DGR', [], req.user?.role);
        res.status(200).json({ success: true, data: result.shipment, message: 'Shipment booked successfully' });
    } catch (error) {
        if (error?.isValidationError) {
            return res.status(400).json({
                success: false,
                error: error.message,
                field: error.field,
                errors: error.errors
            });
        }
        return handleControllerError(res, error, 'DHL submission');
    }
};

/**
 * Get package templates (System presets + User Organization custom templates)
 * @route GET /api/shipments/package-templates
 */
exports.getPackageTemplates = async (req, res) => {
    try {
        const { SYSTEM_PACKAGE_TEMPLATES } = require('../constants/packageTemplates');

        let userCustomTemplates = [];
        if (req.user?.organizationId) {
            const org = await prisma.organization.findUnique({
                where: { id: req.user.organizationId },
                select: { markup: true }
            });
            if (org?.markup && Array.isArray(org.markup.packageTemplates)) {
                userCustomTemplates = org.markup.packageTemplates;
            }
        } else if (req.user?.id) {
            const u = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { agentPolicy: true }
            });
            if (u?.agentPolicy && Array.isArray(u.agentPolicy.packageTemplates)) {
                userCustomTemplates = u.agentPolicy.packageTemplates;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                systemTemplates: SYSTEM_PACKAGE_TEMPLATES,
                customTemplates: userCustomTemplates
            }
        });
    } catch (error) {
        return handleControllerError(res, error, 'Get package templates');
    }
};

/**
 * Save custom package template for user's organization
 * @route POST /api/shipments/package-templates
 */
exports.savePackageTemplate = async (req, res) => {
    try {
        const { name, length, width, height, weight, maxWeight, description } = req.body;

        if (!name || !length || !width || !height) {
            const errors = [];
            if (!name) errors.push({ field: 'name', message: 'Template name is required.' });
            if (!length) errors.push({ field: 'length', message: 'Length is required.' });
            if (!width) errors.push({ field: 'width', message: 'Width is required.' });
            if (!height) errors.push({ field: 'height', message: 'Height is required.' });
            return res.status(400).json({
                success: false,
                error: 'Name, length, width, and height are required.',
                field: errors[0]?.field || 'name',
                errors
            });
        }

        const newTemplate = {
            id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: String(name).trim(),
            category: 'Custom',
            length: Number(length),
            width: Number(width),
            height: Number(height),
            weight: Number(weight) || 1.0,
            maxWeight: Number(maxWeight) || 10.0,
            description: description ? String(description).trim() : '',
            createdAt: new Date().toISOString()
        };

        if (req.user?.organizationId) {
            const org = await prisma.organization.findUnique({
                where: { id: req.user.organizationId }
            });
            const existingMarkup = (org?.markup && typeof org.markup === 'object') ? org.markup : {};
            const existingTemplates = Array.isArray(existingMarkup.packageTemplates) ? existingMarkup.packageTemplates : [];

            await prisma.organization.update({
                where: { id: req.user.organizationId },
                data: {
                    markup: {
                        ...existingMarkup,
                        packageTemplates: [...existingTemplates, newTemplate]
                    }
                }
            });
        } else {
            const u = await prisma.user.findUnique({ where: { id: req.user.id } });
            const existingPolicy = (u?.agentPolicy && typeof u.agentPolicy === 'object') ? u.agentPolicy : {};
            const existingTemplates = Array.isArray(existingPolicy.packageTemplates) ? existingPolicy.packageTemplates : [];

            await prisma.user.update({
                where: { id: req.user.id },
                data: {
                    agentPolicy: {
                        ...existingPolicy,
                        packageTemplates: [...existingTemplates, newTemplate]
                    }
                }
            });
        }

        res.status(201).json({
            success: true,
            data: newTemplate,
            message: 'Custom package template saved successfully'
        });
    } catch (error) {
        return handleControllerError(res, error, 'Save package template');
    }
};

/**
 * Generate or re-fetch Carrier AWB and Invoice documents
 */
exports.generateCarrierDocuments = async (req, res) => {
    const startTime = Date.now();
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { organization: true, user: true }
        });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const carrierCode = normalizeCarrierCode(shipment.carrierCode || shipment.carrier || 'DGR');
        const isDhlCarrier = carrierCode === 'DGR' || carrierCode === 'DGR2';
        const isOteCarrier = carrierCode === 'OTE';
        const isAramexCarrier = carrierCode === 'ARAMEX';
        const isSmsaCarrier = carrierCode === 'SMSA';
        const isStrictApiAwbCarrier = isDhlCarrier || isSmsaCarrier || isOteCarrier || isAramexCarrier;
        const strictCarrierLabel = isDhlCarrier
            ? 'DHL Express'
            : (isSmsaCarrier
                ? 'SMSA Express'
                : (isOteCarrier ? 'OTE / LogesTechs' : 'Aramex'));
        if (!carrierCode || carrierCode === 'INTERNAL' || shipment.internallyManaged === true) {
            const msg = 'Cannot generate carrier documents for an INTERNAL shipment. Convert to carrier first.';
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode: carrierCode || 'INTERNAL',
                action: 'DOCUMENT_GENERATE',
                status: 'VALIDATION_ERROR',
                durationMs: Date.now() - startTime,
                message: msg,
                organizationId: shipment.organizationId || null
            });
            return res.status(400).json({
                success: false,
                error: msg,
                field: 'carrierCode',
                errors: [{ field: 'carrierCode', message: msg }]
            });
        }

        const existingDocs = Array.isArray(shipment.documents) ? shipment.documents : [];
        const isMockLabel = (url) => {
            if (!url) return false;
            const str = String(url).trim();
            if (str.startsWith('data:application/pdf;base64,')) {
                const base64Part = str.split(',')[1] || '';
                // carrierPdfMock generates a 1-2KB stream; genuine DHL PDFs are > 15KB
                if (base64Part.length < 10000) return true;
            }
            if (str.includes('mock') || str.includes('simulation')) return true;
            return false;
        };

        const rawFoundLabel = shipment.labelUrl || shipment.awbUrl || existingDocs.find(d => ['label', 'awb', 'waybilldoc'].includes(String(d?.type || '').toLowerCase()))?.url;
        const rawFoundInvoice = shipment.invoiceUrl || existingDocs.find(d => ['invoice', 'customs_invoice', 'commercial_invoice', 'customs-declarations'].includes(String(d?.type || '').toLowerCase()))?.url;
        const foundReceipt = existingDocs.find(d => ['receipt', 'shipmentreceipt', 'shipment_receipt', 'target_shipment_receipt'].includes(String(d?.type || '').toLowerCase()))?.url || null;

        // If carrier requires official API AWB (DGR, DGR2, SMSA, OTE, ARAMEX), filter out any previously generated mock label
        const foundLabel = (isStrictApiAwbCarrier && isMockLabel(rawFoundLabel)) ? null : rawFoundLabel;
        const foundInvoice = rawFoundInvoice;

        const force = req.query.force === 'true' || req.body?.force === true;
        const requiresInvoice = !isOteCarrier && !isSmsaCarrier && !shipment.isDocument && shipment.shipmentType !== 'documents';

        // If official documents already exist on shipment, return them unless force refresh is requested
        if (foundLabel && (foundInvoice || !requiresInvoice) && (!isDhlCarrier || foundReceipt) && !force) {
            return res.status(200).json({
                success: true,
                data: {
                    labelUrl: foundLabel,
                    awbUrl: shipment.awbUrl || foundLabel,
                    invoiceUrl: foundInvoice,
                    receiptUrl: foundReceipt,
                    documents: existingDocs,
                    carrierShipmentId: shipment.carrierShipmentId || shipment.dhlTrackingNumber
                },
                message: 'Official carrier documents are already available'
            });
        }

        const documentStorage = require('../utils/documentStorage');
        const CarrierDocumentService = require('../services/CarrierDocumentService');

        let awbUrl = foundLabel;
        let invoiceUrl = foundInvoice;
        let receiptUrl = foundReceipt;
        const newDocuments = [...existingDocs];

        const isRealCarrierTracking = (tn) => {
            if (!tn) return false;
            const str = String(tn).trim();
            if (str.startsWith('DGR-') || str.startsWith('TGR-') || str.startsWith('TKW-') || str.startsWith('TEST-') || str.startsWith('MOCK-')) return false;
            if (str === trackingNumber) return false;
            return (isOteCarrier || isSmsaCarrier || isAramexCarrier) ? /^[A-Z0-9-]{4,32}$/i.test(str) : /^\d{8,14}$/.test(str);
        };

        const dhlTracking = isRealCarrierTracking(shipment.dhlTrackingNumber)
            ? shipment.dhlTrackingNumber
            : (isRealCarrierTracking(shipment.carrierShipmentId) ? shipment.carrierShipmentId : null);

        // 1. If shipment already has an authentic carrier tracking number, attempt document retrieval via adapter API
        if (isStrictApiAwbCarrier && dhlTracking && (!awbUrl || !invoiceUrl || (isDhlCarrier && !receiptUrl) || force)) {
            try {
                const isTest = shipment.pricingSnapshot?.isTest === true ||
                               shipment.pricingSnapshot?.environment === 'test' ||
                               shipment.isTest === true ||
                               shipment.environment === 'test';
                const carrierAdapter = CarrierFactory.getAdapter(carrierCode, { isTest });
                const carrierDocs = await carrierAdapter.getShipmentDocuments(dhlTracking, {
                    accountNumber: shipment.origin?.shipperAccount || shipment.customer?.accountNumber,
                    carrierShipmentId: shipment.carrierShipmentId,
                    isTest
                });

                if (carrierDocs.labelUrl && (!awbUrl || force)) {
                    const savedAwb = await CarrierDocumentService.uploadDocument('awb', carrierDocs.labelUrl, 'pdf', trackingNumber);
                    awbUrl = savedAwb.url;
                    newDocuments.push(savedAwb);
                }
                if (carrierDocs.invoiceUrl && (!invoiceUrl || force)) {
                    const savedInv = await CarrierDocumentService.uploadDocument('invoice', carrierDocs.invoiceUrl, 'pdf', trackingNumber);
                    invoiceUrl = savedInv.url;
                    newDocuments.push(savedInv);
                }
                if (carrierDocs.receiptUrl && (!receiptUrl || force)) {
                    const savedReceipt = await CarrierDocumentService.uploadDocument('receipt', carrierDocs.receiptUrl, 'pdf', trackingNumber);
                    receiptUrl = savedReceipt.url;
                    newDocuments.push(savedReceipt);
                }
            } catch (dhlFetchErr) {
                logger.warn(`DHL official get-image retrieval note for ${dhlTracking}: ${dhlFetchErr.message}`);
            }
        }

        // 2. Only execute live carrier booking if explicitly requested by staff/admin (autoBook=true)
        const allowAutoBookOnGet =
            String(req.query?.autoBook ?? req.body?.autoBook ?? '').toLowerCase() === 'true' &&
            ['admin', 'staff'].includes(String(req.user?.role || '').toLowerCase());

        if (!awbUrl && !dhlTracking && allowAutoBookOnGet) {
            try {
                const bookResult = await ShipmentBookingService.bookShipment(
                    trackingNumber,
                    carrierCode,
                    [],
                    req.user?.role,
                    { force: true }
                );
                const fresh = await prisma.shipment.findUnique({ where: { trackingNumber } });
                const freshLabel = fresh?.labelUrl || fresh?.awbUrl || bookResult?.shipment?.labelUrl || bookResult?.labelUrl;
                const freshInvoice = fresh?.invoiceUrl || bookResult?.shipment?.invoiceUrl || bookResult?.invoiceUrl;
                if (freshLabel) {
                    awbUrl = freshLabel;
                    invoiceUrl = freshInvoice || invoiceUrl;
                    if (Array.isArray(fresh?.documents)) {
                        newDocuments.push(...fresh.documents);
                    }
                } else if (isStrictApiAwbCarrier) {
                    const raw = bookResult?.shipment?.rawResponse || bookResult?.rawResponse;
                    const rawKeys = raw ? Object.keys(raw).join(',') : 'none';
                    const tn = fresh?.dhlTrackingNumber || fresh?.carrierShipmentId || bookResult?.shipment?.dhlTrackingNumber || trackingNumber;
                    const errorDetail = bookResult?.message || `${strictCarrierLabel} booking processed (Tracking: ${tn}), but carrier API response contained no document images (Response keys: ${rawKeys}).`;
                    const errorMessage = `${strictCarrierLabel} document retrieval failed: ${errorDetail}`;
                    diagnosticAttemptLog.recordAttempt({
                        trackingNumber: shipment.trackingNumber,
                        carrierCode,
                        action: 'DOCUMENT_GENERATE',
                        status: 'FAILED',
                        durationMs: Date.now() - startTime,
                        message: errorMessage,
                        organizationId: shipment.organizationId || null
                    });
                    return res.status(400).json({
                        success: false,
                        error: errorMessage
                    });
                }
            } catch (bookErr) {
                logger.error(`Live carrier booking failed for ${trackingNumber}: ${bookErr.message}`);
                if (isStrictApiAwbCarrier) {
                    const errorMessage = `${strictCarrierLabel} booking failed: ${bookErr.message}. Cannot retrieve official ${strictCarrierLabel} documents without a successful booking.`;
                    diagnosticAttemptLog.recordAttempt({
                        trackingNumber: shipment.trackingNumber,
                        carrierCode,
                        action: 'DOCUMENT_GENERATE',
                        status: bookErr?.isValidationError ? 'VALIDATION_ERROR' : 'FAILED',
                        durationMs: Date.now() - startTime,
                        message: errorMessage,
                        organizationId: shipment.organizationId || null,
                        details: bookErr?.isValidationError ? { errors: bookErr.errors } : {}
                    });
                    return res.status(400).json({
                        success: false,
                        error: errorMessage,
                        ...(bookErr?.isValidationError ? { field: bookErr.field, errors: bookErr.errors } : {})
                    });
                }
            }
        } else if (!awbUrl && !dhlTracking && isStrictApiAwbCarrier) {
            const errorMessage = `Official ${strictCarrierLabel} documents are not yet available because this shipment has not been booked with ${strictCarrierLabel}.`;
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode,
                action: 'DOCUMENT_GENERATE',
                status: 'FAILED',
                durationMs: Date.now() - startTime,
                message: errorMessage,
                organizationId: shipment.organizationId || null
            });
            return res.status(400).json({
                success: false,
                error: errorMessage
            });
        }

        // 3. Fallback Document Handling:
        // AWB: Strict rejection for DGR, DGR2, SMSA, OTE, and ARAMEX if no authentic carrier label was retrieved. Internal/other carriers use template.
        const { generateCarrierAwbPdf, generateCarrierInvoicePdf, generateTargetShipmentReceiptPdf } = require('../utils/carrierPdfMock');
        const carrierName = carrierCode === 'DGR' ? 'DGR' : (carrierCode === 'DGR2' ? 'DHL' : (carrierCode === 'SMSA' ? 'SMSA Express' : (isOteCarrier ? 'OTE / LogesTechs' : (carrierCode === 'FEDEX' ? 'FedEx' : (carrierCode === 'ARAMEX' ? 'Aramex' : carrierCode)))));

        if (!awbUrl) {
            if (isStrictApiAwbCarrier) {
                const errorMessage = `Official ${strictCarrierLabel} documents could not be retrieved from ${strictCarrierLabel} API. Please check your credentials and shipment details.`;
                diagnosticAttemptLog.recordAttempt({
                    trackingNumber: shipment.trackingNumber,
                    carrierCode,
                    action: 'DOCUMENT_GENERATE',
                    status: 'FAILED',
                    durationMs: Date.now() - startTime,
                    message: errorMessage,
                    organizationId: shipment.organizationId || null
                });
                return res.status(400).json({
                    success: false,
                    error: errorMessage
                });
            } else {
                const awbBase64 = generateCarrierAwbPdf(shipment, carrierName);
                const savedAwb = await CarrierDocumentService.uploadDocument('awb', awbBase64, 'pdf', trackingNumber);
                if (savedAwb?.url) {
                    awbUrl = savedAwb.url;
                    newDocuments.push(savedAwb);
                }
            }
        }

        // Invoice: If invoiceUrl is missing for carriers that require customs invoice, generate a compliant customs commercial invoice
        if (!invoiceUrl && requiresInvoice) {
            try {
                const invBase64 = generateCarrierInvoicePdf(
                    { ...shipment, dhlTrackingNumber: dhlTracking || shipment.dhlTrackingNumber, carrierShipmentId: dhlTracking || shipment.carrierShipmentId },
                    carrierName
                );
                const savedInv = await CarrierDocumentService.uploadDocument('invoice', invBase64, 'pdf', trackingNumber);
                if (savedInv?.url) {
                    invoiceUrl = savedInv.url;
                    newDocuments.push(savedInv);
                }
            } catch (invErr) {
                logger.warn(`Fallback invoice generation note for ${trackingNumber}: ${invErr.message}`);
            }
        }

        // Target-branded Shipment Receipt fallback for non-DHL carriers (or when DHL did not return a receipt)
        if (!receiptUrl) {
            try {
                const receiptBase64 = generateTargetShipmentReceiptPdf(
                    { ...shipment, dhlTrackingNumber: dhlTracking || shipment.dhlTrackingNumber, carrierShipmentId: dhlTracking || shipment.carrierShipmentId },
                    carrierName
                );
                const savedRcpt = await CarrierDocumentService.uploadDocument('target_shipment_receipt', receiptBase64, 'pdf', trackingNumber);
                if (savedRcpt?.url) {
                    receiptUrl = savedRcpt.url;
                    newDocuments.push(savedRcpt);
                }
            } catch (rcptErr) {
                logger.warn(`Target shipment receipt generation note for ${trackingNumber}: ${rcptErr.message}`);
            }
        }

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                labelUrl: awbUrl || shipment.labelUrl,
                awbUrl: awbUrl || shipment.awbUrl,
                invoiceUrl: invoiceUrl || shipment.invoiceUrl,
                documents: newDocuments,
                dhlConfirmed: isDhlCarrier ? true : shipment.dhlConfirmed
            }
        });

        diagnosticAttemptLog.recordAttempt({
            trackingNumber: updated.trackingNumber,
            carrierCode,
            action: 'DOCUMENT_GENERATE',
            status: 'SUCCESS',
            durationMs: Date.now() - startTime,
            message: 'Official carrier AWB and Invoice successfully retrieved',
            organizationId: updated.organizationId,
            details: {
                hasLabel: Boolean(updated.labelUrl),
                hasAwb: Boolean(updated.awbUrl),
                hasInvoice: Boolean(updated.invoiceUrl)
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                labelUrl: updated.labelUrl,
                awbUrl: updated.awbUrl || updated.labelUrl,
                invoiceUrl: updated.invoiceUrl,
                receiptUrl: receiptUrl || foundReceipt || null,
                documents: updated.documents || [],
                carrierShipmentId: updated.carrierShipmentId || updated.dhlTrackingNumber,
                shipment: updated
            },
            message: 'Official carrier AWB and Invoice successfully retrieved'
        });
    } catch (error) {
        diagnosticAttemptLog.recordAttempt({
            trackingNumber: req.params?.trackingNumber || null,
            carrierCode: 'SYSTEM',
            action: 'DOCUMENT_GENERATE',
            status: 'FAILED',
            durationMs: Date.now() - startTime,
            message: error.message || 'Generate carrier documents failed'
        });
        return handleControllerError(res, error, 'Generate carrier documents');
    }
};

/**
 * Generate a Target-branded receipt independently of carrier paperwork.
 * @route POST /api/shipments/:trackingNumber/target-receipt/generate
 */
exports.generateTargetShipmentReceipt = async (req, res) => {
    const startTime = Date.now();
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { organization: true, user: true }
        });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const rawDocuments = shipment.documents;
        const documents = Array.isArray(rawDocuments) ? rawDocuments : [];
        const existingReceipt = documents.find(doc => String(doc?.type || '').toLowerCase() === 'target_shipment_receipt') ||
            (!Array.isArray(rawDocuments) && rawDocuments && typeof rawDocuments === 'object' ? rawDocuments.targetShipmentReceipt : null);
        const force = req.body?.force === true || req.query?.force === 'true';
        const existingReceiptUrl = (typeof existingReceipt === 'string' ? existingReceipt : existingReceipt?.url) ||
            (!Array.isArray(rawDocuments) && rawDocuments && typeof rawDocuments === 'object' ? rawDocuments.targetShipmentReceiptUrl : null);
        if (existingReceiptUrl && !force) {
            return res.status(200).json({
                success: true,
                data: { receiptUrl: existingReceiptUrl, targetReceiptUrl: existingReceiptUrl, documents: rawDocuments || documents },
                message: 'Target shipment receipt is already available'
            });
        }

        const carrierCode = normalizeCarrierCode(shipment.carrierCode || shipment.carrier || 'INTERNAL');
        const carrierName = ['INTERNAL', 'MANUAL'].includes(carrierCode)
            ? 'Target Logistics'
            : (carrierCode === 'DGR' ? 'DHL Express' : (carrierCode === 'SMSA' ? 'SMSA Express' : carrierCode));
        const { generateTargetShipmentReceiptPdf } = require('../utils/carrierPdfMock');
        const CarrierDocumentService = require('../services/CarrierDocumentService');
        const receiptBase64 = generateTargetShipmentReceiptPdf(shipment, carrierName);
        const savedReceipt = await CarrierDocumentService.uploadDocument(
            'target_shipment_receipt',
            receiptBase64,
            'pdf',
            trackingNumber
        );
        if (!savedReceipt?.url) throw new Error('Target shipment receipt could not be stored');

        const updatedDocuments = Array.isArray(rawDocuments)
            ? [
                ...documents.filter(doc => String(doc?.type || '').toLowerCase() !== 'target_shipment_receipt'),
                savedReceipt
            ]
            : {
                ...(rawDocuments && typeof rawDocuments === 'object' ? rawDocuments : {}),
                targetShipmentReceipt: savedReceipt,
                targetShipmentReceiptUrl: savedReceipt.url
            };
        await prisma.shipment.update({
            where: { id: shipment.id },
            data: { documents: updatedDocuments }
        });

        diagnosticAttemptLog.recordAttempt({
            trackingNumber,
            carrierCode,
            action: 'TARGET_RECEIPT_GENERATE',
            status: 'SUCCESS',
            durationMs: Date.now() - startTime,
            message: 'Target shipment receipt generated',
            organizationId: shipment.organizationId || null
        });

        return res.status(200).json({
            success: true,
            data: { receiptUrl: savedReceipt.url, targetReceiptUrl: savedReceipt.url, documents: updatedDocuments },
            message: 'Target shipment receipt generated successfully'
        });
    } catch (error) {
        diagnosticAttemptLog.recordAttempt({
            trackingNumber: req.params?.trackingNumber || null,
            carrierCode: 'SYSTEM',
            action: 'TARGET_RECEIPT_GENERATE',
            status: 'FAILED',
            durationMs: Date.now() - startTime,
            message: error.message || 'Generate Target shipment receipt failed'
        });
        return handleControllerError(res, error, 'Generate Target shipment receipt');
    }
};
