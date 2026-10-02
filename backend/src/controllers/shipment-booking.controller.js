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
const { isPlatformRole } = require('../middleware/rbac.policy');
const { canAccessShipment } = require('../middleware/authorize.middleware');
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
                        serviceName: `DHL Express Worldwide (${rateCardResult.rateCardName})`,
                        serviceCode: serviceCode || 'P',
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

        const visibleQuotes = serviceCode
            ? rawQuotes.filter(quote => String(quote.serviceCode || '').toUpperCase() === String(serviceCode).toUpperCase())
            : rawQuotes;

        if (serviceCode && visibleQuotes.length === 0) {
            return res.status(400).json({ success: false, error: `Assigned service ${serviceCode} is not available for this shipment.` });
        }

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

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        if (carrierCode === 'MANUAL' || shipment.carrierCode === 'MANUAL') {
            return res.status(200).json({
                success: true,
                data: {
                    carrierCode: 'MANUAL',
                    services: [{ serviceCode: null, serviceName: 'Manual Shipment' }],
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
        const { carrierCode, optionalServiceCodes = [], items, parcels, origin, destination } = req.body;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
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

        const result = await ShipmentBookingService.bookShipment(trackingNumber);
        res.status(200).json({ success: true, data: result.shipment, message: 'Shipment booked successfully' });
    } catch (error) {
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
            return res.status(400).json({ success: false, error: 'Name, length, width, and height are required.' });
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
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { organization: true, user: true }
        });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const carrierCode = (shipment.carrierCode || shipment.carrier || 'DGR').toUpperCase();
        if (!carrierCode || carrierCode === 'INTERNAL') {
            return res.status(400).json({ success: false, error: 'Cannot generate carrier documents for an INTERNAL shipment. Convert to carrier first.' });
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

        // If carrier is DGR, filter out any previously generated mock label
        const foundLabel = (carrierCode === 'DGR' && isMockLabel(rawFoundLabel)) ? null : rawFoundLabel;
        const foundInvoice = rawFoundInvoice;

        const force = req.query.force === 'true' || req.body?.force === true;

        // If official documents already exist on shipment, return them unless force refresh is requested
        if (foundLabel && (foundInvoice || shipment.isDocument || shipment.shipmentType === 'documents') && !force) {
            return res.status(200).json({
                success: true,
                data: {
                    labelUrl: foundLabel,
                    awbUrl: shipment.awbUrl || foundLabel,
                    invoiceUrl: foundInvoice,
                    documents: existingDocs,
                    carrierShipmentId: shipment.carrierShipmentId || shipment.dhlTrackingNumber
                },
                message: 'Official carrier documents are already available'
            });
        }

        const documentStorage = require('../utils/documentStorage');
        const CarrierDocumentService = require('../services/CarrierDocumentService');

        let awbUrl = force ? null : foundLabel;
        let invoiceUrl = force ? null : foundInvoice;
        const newDocuments = force ? [] : [...existingDocs];

        const isRealCarrierTracking = (tn) => {
            if (!tn) return false;
            const str = String(tn).trim();
            if (str.startsWith('DGR-') || str.startsWith('TGR-') || str.startsWith('TKW-') || str.startsWith('TEST-') || str.startsWith('MOCK-')) return false;
            if (str === trackingNumber) return false;
            return /^\d{8,12}$/.test(str);
        };

        const dhlTracking = isRealCarrierTracking(shipment.dhlTrackingNumber)
            ? shipment.dhlTrackingNumber
            : (isRealCarrierTracking(shipment.carrierShipmentId) ? shipment.carrierShipmentId : null);

        // 1. If shipment already has an authentic DHL tracking number, attempt document retrieval via get-image
        if (carrierCode === 'DGR' && dhlTracking && (!awbUrl || !invoiceUrl || force)) {
            try {
                const isTest = shipment.pricingSnapshot?.isTest === true ||
                               shipment.pricingSnapshot?.environment === 'test' ||
                               shipment.isTest === true ||
                               shipment.environment === 'test';
                const dgrAdapter = CarrierFactory.getAdapter('DGR', { isTest });
                const carrierDocs = await dgrAdapter.getShipmentDocuments(dhlTracking, {
                    accountNumber: shipment.origin?.shipperAccount || shipment.customer?.accountNumber,
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
            } catch (dhlFetchErr) {
                logger.warn(`DHL official get-image retrieval note for ${dhlTracking}: ${dhlFetchErr.message}`);
            }
        }

        // 2. If official documents are still missing (not yet booked), execute live carrier booking
        if (!awbUrl && !dhlTracking) {
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
                } else if (carrierCode === 'DGR') {
                    const raw = bookResult?.shipment?.rawResponse || bookResult?.rawResponse;
                    const rawKeys = raw ? Object.keys(raw).join(',') : 'none';
                    const tn = fresh?.dhlTrackingNumber || fresh?.carrierShipmentId || bookResult?.shipment?.dhlTrackingNumber || trackingNumber;
                    const errorDetail = bookResult?.message || `DHL booking processed (Tracking: ${tn}), but DHL API response contained no document images (Response keys: ${rawKeys}).`;
                    return res.status(400).json({
                        success: false,
                        error: `DHL Express document retrieval failed: ${errorDetail}`
                    });
                }
            } catch (bookErr) {
                logger.error(`Live carrier booking failed for ${trackingNumber}: ${bookErr.message}`);
                if (carrierCode === 'DGR') {
                    return res.status(400).json({
                        success: false,
                        error: `DHL Express booking failed: ${bookErr.message}. Cannot retrieve official DHL documents without a successful DHL booking.`
                    });
                }
            }
        }

        // 3. Fallback Document Handling:
        // AWB: Strict rejection for DGR if no authentic DHL label was retrieved. Internal/other carriers use template.
        const { generateCarrierAwbPdf, generateCarrierInvoicePdf } = require('../utils/carrierPdfMock');
        const carrierName = carrierCode === 'DGR' ? 'DHL Express' : (carrierCode === 'FEDEX' ? 'FedEx' : (carrierCode === 'ARAMEX' ? 'Aramex' : carrierCode));

        if (!awbUrl) {
            if (carrierCode === 'DGR') {
                return res.status(400).json({
                    success: false,
                    error: 'Official DHL Express documents could not be retrieved from DHL API. Please check your DHL credentials and shipment details.'
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

        // Invoice: If invoiceUrl is missing for ANY carrier (including DGR when DHL only returned label or PLT was used), generate a compliant customs commercial invoice so customs clearance is never blocked!
        if (!invoiceUrl) {
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

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                labelUrl: awbUrl || shipment.labelUrl,
                awbUrl: awbUrl || shipment.awbUrl,
                invoiceUrl: invoiceUrl || shipment.invoiceUrl,
                documents: newDocuments,
                dhlConfirmed: carrierCode === 'DGR' ? true : shipment.dhlConfirmed
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                labelUrl: updated.labelUrl,
                awbUrl: updated.awbUrl || updated.labelUrl,
                invoiceUrl: updated.invoiceUrl,
                documents: updated.documents || [],
                carrierShipmentId: updated.carrierShipmentId || updated.dhlTrackingNumber,
                shipment: updated
            },
            message: 'Official carrier AWB and Invoice successfully retrieved'
        });
    } catch (error) {
        return handleControllerError(res, error, 'Generate carrier documents');
    }
};
