const path = require('path');
const fs = require('fs');
const CarrierFactory = require('../services/CarrierFactory');
const CarrierRateService = require('../services/CarrierRateService');
const PricingService = require('../services/pricing.service');
const ShipmentDraftService = require('../services/ShipmentDraftService');
const { prisma } = require('../config/database');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const { hasCriticalChanges } = require('./shipment.helpers');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const {
    getAssignedShippingAccess,
    assertRequestedAccessAllowed,
    normalizeCarrier
} = require('../services/shippingAccess.service');

const escapeHtml = (unsafe) => {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Helper to map normalized address to schema format
 */
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

/**
 * POST /api/v1/shipments
 * Create a shipment using a specific carrier or default.
 */
exports.createShipment = async (req, res) => {
    try {
        const { carrierCode, serviceCode, ...shipmentData } = req.body;

        const apiUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });
        if (!apiUser) return res.status(404).json({ success: false, error: 'User not found' });

        const assignedAccess = getAssignedShippingAccess(apiUser);

        const sCountry = shipmentData.sender?.countryCode || shipmentData.origin?.countryCode;
        const rCountry = shipmentData.receiver?.countryCode || shipmentData.destination?.countryCode;
        const isExplicitDomestic = Boolean(sCountry && rCountry && String(sCountry).toUpperCase() === String(rCountry).toUpperCase());
        const requestedCarrier = carrierCode ? normalizeCarrier(carrierCode) : null;

        if (assignedAccess.carrierCode === 'INTERNAL' || requestedCarrier === 'INTERNAL' || isExplicitDomestic || serviceCode === 'DOM') {
            const shipment = await ShipmentDraftService.createDraft({
                ...shipmentData,
                carrierCode: 'INTERNAL',
                serviceCode: assignedAccess.carrierCode === 'INTERNAL' ? (serviceCode || null) : 'DOM',
                internallyManaged: true
            }, apiUser);

            return res.status(201).json({
                success: true,
                data: {
                    trackingNumber: shipment.trackingNumber,
                    carrier: shipment.carrierCode,
                    serviceCode: shipment.serviceCode,
                    status: shipment.status,
                    labelUrl: shipment.labelUrl || `/api/v1/shipments/${shipment.trackingNumber}/label`,
                    price: shipment.price,
                    currency: shipment.currency,
                    codAmount: shipment.codAmount || null,
                    codCurrency: shipment.codCurrency || null,
                    codStatus: shipment.codStatus || null
                }
            });
        }

        assertRequestedAccessAllowed(assignedAccess, { carrierCode, serviceCode });

        const resolvedCarrierCode = assignedAccess.carrierCode;
        const resolvedServiceCode = assignedAccess.serviceCode || serviceCode || null;
        const carrierCapabilities = typeof CarrierFactory.getCarrierCapabilities === 'function'
            ? (CarrierFactory.getCarrierCapabilities(resolvedCarrierCode) || {})
            : { supportsExternalApi: true };

        if (carrierCapabilities.supportsExternalApi === false) {
            const shipment = await ShipmentDraftService.createDraft({
                ...shipmentData,
                carrierCode: resolvedCarrierCode,
                serviceCode: resolvedServiceCode
            }, apiUser);

            return res.status(201).json({
                success: true,
                data: {
                    trackingNumber: shipment.trackingNumber,
                    carrier: shipment.carrierCode,
                    serviceCode: shipment.serviceCode,
                    status: shipment.status,
                    price: shipment.price,
                    currency: shipment.currency,
                    codAmount: shipment.codAmount || null,
                    codCurrency: shipment.codCurrency || null,
                    codStatus: shipment.codStatus || null,
                    requiresManualPricing: shipment.pricingSnapshot?.requiresManualPricing === true
                }
            });
        }

        if (!resolvedServiceCode) {
            return res.status(400).json({
                success: false,
                error: 'No carrier service selected. Request a quote first and then create the shipment using an available serviceCode.'
            });
        }

        const hasCreditAccount = Number(apiUser.creditLimit || 0) > 0 ||
                                 Number(apiUser.organization?.creditLimit || 0) > 0 ||
                                 apiUser.organization?.type === 'CREDIT' ||
                                 apiUser.paymentMethod === 'CREDIT';

        // Credit shipments (or when autoBook is not explicitly requested) enter the pickup & approval lifecycle
        if (hasCreditAccount && req.body.autoBook !== true) {
            const shipment = await ShipmentDraftService.createDraft({
                ...shipmentData,
                carrierCode: resolvedCarrierCode,
                serviceCode: resolvedServiceCode,
                status: 'ready_for_pickup'
            }, apiUser);

            return res.status(201).json({
                success: true,
                data: {
                    trackingNumber: shipment.trackingNumber,
                    carrier: shipment.carrierCode,
                    serviceCode: shipment.serviceCode,
                    status: shipment.status,
                    price: shipment.price,
                    currency: shipment.currency,
                    codAmount: shipment.codAmount || null,
                    codCurrency: shipment.codCurrency || null,
                    codStatus: shipment.codStatus || null
                },
                message: 'Shipment created successfully and scheduled for courier pickup'
            });
        }

        // 1. Normalize
        const normalized = normalizeShipment(shipmentData);
        normalized.serviceCode = resolvedServiceCode;
        if (resolvedCarrierCode === 'OTE') {
            normalized.shipmentType = 'COD';
            normalized.codAmount = 25;
            normalized.codCurrency = 'AED';
            normalized.codStatus = 'pending';
        }

        // 2. Get Adapter
        const isTest = req.body.isTest === true || req.body.environment === 'test';
        const environment = isTest ? 'test' : (req.body.environment || 'production');
        const adapter = CarrierFactory.getAdapter(resolvedCarrierCode, { isTest, environment });

        // 3. Validate via Adapter
        const errors = await adapter.validate(normalized);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: 'Validation Failed', details: errors });
        }

        // 4. Create Label via Adapter
        const result = await adapter.createShipment({
            ...normalized,
            user: req.user.id
        }, resolvedServiceCode);
        const carrierTrackingNumber = result.dhlTrackingNumber || result.trackingNumber || null;
        const carrierShipmentId = result.carrierShipmentId || carrierTrackingNumber;
        const bookingPrice = resolvedCarrierCode === 'OTE' ? 25 : (result.totalPrice || 0);

        // 5. Audit/Persist to MySQL
        const newShipment = await prisma.shipment.create({
            data: {
                trackingNumber: result.trackingNumber,
                userId: req.user.id,
                organizationId: req.user.organizationId,
                carrierCode: resolvedCarrierCode,
                serviceCode: resolvedServiceCode,
                status: 'booked',
                labelUrl: result.labelBase64 ? `data:application/pdf;base64,${result.labelBase64}` : (result.labelUrl || `/api/v1/shipments/${result.trackingNumber}/label`),
                invoiceUrl: result.invoiceBase64 ? `data:application/pdf;base64,${result.invoiceBase64}` : (result.invoiceUrl || null),
                origin: mapAddressToSchema(normalized.sender),
                destination: mapAddressToSchema(normalized.receiver),
                currentLocation: mapAddressToSchema(normalized.sender),
                customer: {
                    name: normalized.sender.company || normalized.sender.contactPerson,
                    email: normalized.sender.email || req.user.email,
                    phone: normalized.sender.phone
                },
                estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                parcels: normalized.packages.map(p => ({
                    weight: p.weight.value,
                    dimensions: p.dimensions,
                    description: p.description
                })),
                items: normalized.items,
                price: bookingPrice,
                currency: resolvedCarrierCode === 'OTE' ? 'AED' : 'KWD',
                codAmount: resolvedCarrierCode === 'OTE' ? 25 : null,
                codCurrency: resolvedCarrierCode === 'OTE' ? 'AED' : null,
                codStatus: resolvedCarrierCode === 'OTE' ? 'pending' : null,
                dhlTrackingNumber: carrierTrackingNumber,
                carrierShipmentId,
                dhlConfirmed: Boolean(carrierTrackingNumber),
                history: [{
                    status: 'booked',
                    timestamp: new Date().toISOString(),
                    description: 'Shipment booked with carrier via API',
                    location: normalized.sender
                }]
            }
        });

        // Accounting: Post Debit to Customer Ledger & Credit to Carrier Payable
        if (req.user.organizationId && bookingPrice > 0) {
            try {
                const financeLedgerService = require('../services/financeLedger.service');
                await financeLedgerService.createLedgerEntry(req.user.organizationId, {
                    sourceRepo: 'Shipment',
                    sourceId: newShipment.id,
                    amount: bookingPrice,
                    currency: newShipment.currency,
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: `API Booking Charge for ${newShipment.trackingNumber}`,
                    reference: newShipment.trackingNumber,
                    createdBy: req.user.id,
                    metadata: {
                        carrierCode: resolvedCarrierCode,
                        serviceCode: resolvedServiceCode,
                        currency: newShipment.currency
                    }
                });

                if (resolvedCarrierCode !== 'INTERNAL' && Number(newShipment.costPrice || 0) > 0) {
                    await financeLedgerService.recordCarrierPayable({
                        organizationId: req.user.organizationId,
                        shipmentId: newShipment.id,
                        carrierCode: resolvedCarrierCode,
                        costPrice: newShipment.costPrice || 0,
                        currency: newShipment.currency,
                        trackingNumber: newShipment.trackingNumber,
                        createdBy: req.user.id
                    });
                }
            } catch (ledgeErr) {
                logger.warn(`API Shipment ledger posting non-fatal warning for ${newShipment.trackingNumber}: ${ledgeErr.message}`);
            }
        }

        res.status(201).json({
            success: true,
            data: {
                trackingNumber: result.trackingNumber,
                labelUrl: newShipment.labelUrl,
                invoiceUrl: newShipment.invoiceUrl,
                carrier: resolvedCarrierCode,
                serviceCode: newShipment.serviceCode,
                status: newShipment.status,
                codAmount: newShipment.codAmount || null,
                codCurrency: newShipment.codCurrency || null,
                codStatus: newShipment.codStatus || null
            }
        });

    } catch (error) {
        return handleControllerError(res, error, 'API shipment creation');
    }
};

/**
 * GET /api/v1/tracking/:number
 */
exports.trackShipment = async (req, res) => {
    try {
        const { number } = req.params;

        const shipment = await prisma.shipment.findFirst({
            where: {
                trackingNumber: number,
                userId: req.user.id
            }
        });

        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                carrier: shipment.carrierCode,
                serviceCode: shipment.serviceCode,
                codAmount: shipment.codAmount || null,
                codCurrency: shipment.codCurrency || null,
                codStatus: shipment.codStatus || null,
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
 */
exports.updateShipment = async (req, res) => {
    try {
        const { number } = req.params;
        const updates = req.body;

        const shipment = await prisma.shipment.findFirst({
            where: { trackingNumber: number, userId: req.user.id },
            include: { user: { include: { organization: true } } }
        });

        if (!shipment) return res.status(404).json({ success: false, error: 'Not found' });

        const editableStatuses = ['draft', 'pending', 'booked', 'exception', 'ready_for_pickup'];
        if (!editableStatuses.includes(shipment.status)) {
            return res.status(400).json({ success: false, error: 'Cannot update in current status' });
        }

        const allowedFields = [
            'destination', 'origin', 'items', 'parcels', 'incoterm',
            'currency', 'dangerousGoods', 'customer',
            'reference', 'remarks'
        ];

        const criticalChanges = hasCriticalChanges(shipment, updates);
        const isBooked = shipment.dhlConfirmed === true;

        let finalPrice = Number(shipment.price);
        let finalSnapshot = shipment.pricingSnapshot;

        if (criticalChanges) {
            // Re-rating logic
            const tempState = { ...shipment, ...updates };
            const isTest = shipment.pricingSnapshot?.isTest === true || shipment.pricingSnapshot?.environment === 'test';
            const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || 'production');
            const adapter = CarrierFactory.getAdapter(tempState.carrierCode || 'DGR', { isTest, environment });
            const quotes = await adapter.getRates({ ...tempState, sender: tempState.origin, receiver: tempState.destination, isTest, environment });

            if (!quotes || quotes.length === 0) throw new Error('Re-rating failed');

            const selected = quotes.find(q => q.serviceCode === shipment.serviceCode) || quotes[0];
            const { markup, source } = PricingService.resolveMarkup(shipment.user, shipment.user.organization, (tempState.carrierCode || 'DGR').toUpperCase());

            const ratingCarrier = (tempState.carrierCode || 'DGR').toUpperCase();
            const policy = PricingService.resolveCarrierPricingPolicy(shipment.user, ratingCarrier, selected.currency || 'KWD');
            const carrierRate = PricingService.applyCarrierBasePricePolicy(Number(selected.totalPrice), shipment.user, ratingCarrier, {
                countryCode: tempState.destination?.countryCode || tempState.destination?.country,
                packages: tempState.packages,
                weight: tempState.weight
            });
            finalSnapshot = PricingService.createSnapshot(carrierRate, markup, selected.currency || policy.currency || 'KWD', source);
            finalPrice = Number(finalSnapshot.totalPrice);

            // Audit Price Difference
            const diff = new Decimal(finalPrice).minus(Number(shipment.price));
            if (!diff.isZero()) {
                const financeLedgerService = require('../services/financeLedger.service');
                await financeLedgerService.createLedgerEntry(shipment.organizationId, {
                    sourceRepo: 'Shipment',
                    sourceId: shipment.id,
                    amount: diff.abs().toNumber(),
                    entryType: diff.isPositive() ? 'DEBIT' : 'CREDIT',
                    category: 'ADJUSTMENT',
                    description: `API Update: ${number}`,
                    reference: number,
                    createdBy: req.user.id
                });
            }
        }

        // Apply Updates
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) filteredUpdates[key] = updates[key];
        });

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                ...filteredUpdates,
                price: finalPrice,
                pricingSnapshot: finalSnapshot,
                history: {
                    push: {
                        status: 'updated',
                        description: `API Update. New price: ${finalPrice}`,
                        timestamp: new Date().toISOString()
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: updated.trackingNumber,
                status: updated.status,
                price: updated.price,
                currency: updated.currency,
                updatedAt: updated.updatedAt
            }
        });
    } catch (error) {
        return handleControllerError(res, error, 'API shipment update');
    }
};

/**
 * POST /api/v1/quotes
 */
exports.getQuotation = async (req, res) => {
    try {
        const { carrierCode, serviceCode } = req.body || {};
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const assignedAccess = getAssignedShippingAccess(user);

        const normalized = normalizeShipment(req.body);
        const senderCountry = String(normalized.sender?.countryCode || normalized.sender?.country || 'KW').toUpperCase();
        const receiverCountry = String(normalized.receiver?.countryCode || normalized.receiver?.country || 'KW').toUpperCase();
        const isDomestic = Boolean(senderCountry && receiverCountry && senderCountry === receiverCountry);

        if (assignedAccess.carrierCode === 'INTERNAL' || isDomestic || carrierCode === 'INTERNAL' || serviceCode === 'DOM') {
            const domesticPolicy = typeof PricingService.resolveCarrierPricingPolicy === 'function'
                ? PricingService.resolveCarrierPricingPolicy(user, 'INTERNAL', req.body.currency || 'KWD')
                : { fixedFee: null, currency: 'KWD' };

            let domesticPrice = 2.500;
            if (domesticPolicy && domesticPolicy.fixedFee !== null && domesticPolicy.fixedFee !== undefined && !isNaN(domesticPolicy.fixedFee)) {
                domesticPrice = Number(domesticPolicy.fixedFee);
            }

            const { markup } = typeof PricingService.resolveMarkup === 'function'
                ? PricingService.resolveMarkup(user, user.organization, 'INTERNAL')
                : { markup: null };

            const finalPrice = typeof PricingService.calculateFinalPrice === 'function' && markup
                ? PricingService.calculateFinalPrice(domesticPrice, markup, req.body.currency || 'KWD').finalPrice
                : domesticPrice;

            return res.status(200).json({
                success: true,
                data: [{
                    serviceName: 'Target Express (Domestic Delivery)',
                    serviceCode: 'DOM',
                    carrier: 'INTERNAL',
                    totalPrice: Number(Number(finalPrice).toFixed(3)),
                    currency: req.body.currency || domesticPolicy?.currency || 'KWD',
                    estimatedDelivery: 'Next business day'
                }]
            });
        }

        assertRequestedAccessAllowed(assignedAccess, { carrierCode, serviceCode });

        const resolvedCarrierCode = assignedAccess.carrierCode;
        const resolvedServiceCode = assignedAccess.serviceCode || serviceCode || null;
        normalized.serviceCode = resolvedServiceCode;

        const policy = typeof PricingService.resolveCarrierPricingPolicy === 'function'
            ? PricingService.resolveCarrierPricingPolicy(user, resolvedCarrierCode, req.body.currency || 'KWD')
            : { pricingModel: 'STANDARD', fixedFee: null, currency: req.body.currency || 'KWD' };
        let rawRates = [];

        if (policy?.pricingModel === 'RATE_CARD' && policy.rateCardId) {
            try {
                const RateCardService = require('../services/RateCardService');
                const countryCode = normalized.receiver?.countryCode || normalized.receiver?.country;
                if (countryCode) {
                    const rateCardResult = RateCardService.calculateRate({
                        rateCardId: policy.rateCardId,
                        carrierCode: resolvedCarrierCode,
                        countryCode,
                        weight: normalized.weight,
                        packages: normalized.packages
                    });
                    rawRates = [{
                        serviceName: `DHL Express Worldwide (${rateCardResult.rateCardName})`,
                        serviceCode: resolvedServiceCode || 'P',
                        carrier: resolvedCarrierCode,
                        totalPrice: rateCardResult.totalPrice,
                        currency: rateCardResult.currency || 'KWD',
                        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                    }];
                }
            } catch (err) {
                logger.warn(`RateCard rating fallback for ${policy.rateCardId}: ${err.message}`);
            }
        }

        if (rawRates.length === 0) {
            try {
                rawRates = await CarrierRateService.getRates(normalized, resolvedCarrierCode);
            } catch (err) {
                logger.warn(`Live rate lookup failed for ${resolvedCarrierCode}: ${err.message}`);
                const weight = Array.isArray(normalized.packages) && normalized.packages.length > 0
                    ? normalized.packages.reduce((sum, p) => sum + (Number(p.weight?.value || p.weight || 0) || 0), 0)
                    : 1.0;
                const estPrice = Number((10.000 + weight * 2.5).toFixed(3));
                rawRates = [{
                    serviceName: 'DHL Express Worldwide (Standard Rate)',
                    serviceCode: resolvedServiceCode || 'P',
                    carrier: resolvedCarrierCode,
                    totalPrice: estPrice,
                    currency: req.body.currency || 'KWD',
                    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                }];
            }
        }

        let visibleRates = resolvedServiceCode
            ? rawRates.filter(rate => String(rate.serviceCode || '').toUpperCase() === String(resolvedServiceCode).toUpperCase())
            : rawRates;

        if (resolvedServiceCode && visibleRates.length === 0 && rawRates.length > 0) {
            visibleRates = [rawRates[0]];
        }

        const finalQuotes = visibleRates.map(rate => {
            if (rate.requiresManualPricing) {
                return {
                    serviceName: rate.serviceName,
                    serviceCode: rate.serviceCode,
                    carrier: resolvedCarrierCode,
                    rateType: 'INTERNAL',
                    requiresManualPricing: true,
                    amount: null,
                    totalPrice: null,
                    currency: rate.currency || 'KWD',
                    estimatedDelivery: rate.estimatedDelivery
                };
            }

            const { markup } = PricingService.resolveMarkup(user, user.organization, resolvedCarrierCode);
            const calculation = PricingService.calculateFinalPrice(rate.totalPrice, markup, rate.currency);
            return {
                serviceName: rate.serviceName,
                serviceCode: rate.serviceCode,
                carrier: resolvedCarrierCode,
                totalPrice: calculation.finalPrice,
                currency: rate.currency,
                estimatedDelivery: rate.estimatedDelivery
            };
        });

        res.status(200).json({ success: true, data: finalQuotes });
    } catch (error) {
        return handleControllerError(res, error, 'API quotation');
    }
};

/**
 * Address Management
 */
exports.getAddresses = async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.status(200).json({ success: true, data: user.addresses || [] });
};

exports.addAddress = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const addresses = user.addresses || [];
        const { label, company, contactPerson, phone, email, streetLines, city, postalCode, countryCode, state, taxId, vatNumber, eoriNumber } = req.body;
        addresses.push({ label, company, contactPerson, phone, email, streetLines, city, postalCode, countryCode, state, taxId, vatNumber, eoriNumber });

        await prisma.user.update({
            where: { id: req.user.id },
            data: { addresses }
        });

        res.status(201).json({ success: true, data: req.body });
    } catch (error) {
        res.status(400).json({ success: false, error: 'Failed to add address' });
    }
};

exports.updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const addresses = user.addresses || [];

        // Match by some criteria since MySQL JSON doesn't have .id() helper
        const index = addresses.findIndex(a => a.id === id || a.label === id);
        if (index === -1) return res.status(404).json({ success: false, error: 'Not found' });

        addresses[index] = { ...addresses[index], ...req.body };

        await prisma.user.update({
            where: { id: req.user.id },
            data: { addresses }
        });

        res.status(200).json({ success: true, data: addresses[index] });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * GET /api/v1/shipments/:number/label
 * Stream official carrier PDF or render Target Logistics printable label
 */
exports.getShipmentLabel = async (req, res) => {
    try {
        const { number } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber: number }
        });

        if (!shipment) {
            return res.status(404).send('Shipment not found');
        }

        // Authorize: user must own shipment or belong to same organization or be admin
        const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'DISPATCHER'].includes(req.user.role);
        const isOwner = shipment.userId === req.user.id;
        const isSameOrg = req.user.organizationId && shipment.organizationId === req.user.organizationId;
        if (!isAdmin && !isOwner && !isSameOrg) {
            return res.status(403).send('Permission denied');
        }

        const safeTrackingNumber = escapeHtml(number);

        // 1. If official carrier PDF document exists, stream it as PDF
        const existingLabel = shipment.labelUrl || shipment.awbUrl;
        if (existingLabel) {
            if (typeof existingLabel === 'string' && existingLabel.startsWith('data:application/pdf;base64,')) {
                const buffer = Buffer.from(existingLabel.split(',')[1], 'base64');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename="label-${safeTrackingNumber}.pdf"`);
                return res.send(buffer);
            }
            if (typeof existingLabel === 'string' && existingLabel.startsWith('/uploads/documents/')) {
                const filename = existingLabel.split('/').pop();
                const filePath = path.resolve(process.cwd(), 'uploads', 'documents', filename);
                if (fs.existsSync(filePath)) {
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `inline; filename="label-${safeTrackingNumber}.pdf"`);
                    return res.sendFile(filePath);
                }
            }
            if (/^https?:\/\//i.test(existingLabel)) {
                return res.redirect(existingLabel);
            }
        }

        // 2. Otherwise generate HTML Target Logistics shipping label with barcodes and print button
        const origin = shipment.origin && typeof shipment.origin === 'object' ? shipment.origin : {};
        const destination = shipment.destination && typeof shipment.destination === 'object' ? shipment.destination : {};
        const safeOriginContact = escapeHtml(origin.contactPerson || '');
        const safeOriginCompany = origin.company ? `${escapeHtml(origin.company)}<br>` : '';
        const safeOriginAddress = escapeHtml(origin.formattedAddress || 'N/A');
        const safeOriginCity = escapeHtml(origin.city || '');
        const safeOriginCountry = escapeHtml(origin.countryCode || '');
        const safeOriginPhone = escapeHtml(origin.phone || '');

        const safeDestContact = escapeHtml(destination.contactPerson || '');
        const safeDestCompany = destination.company ? `${escapeHtml(destination.company)}<br>` : '';
        const safeDestAddress = escapeHtml(destination.formattedAddress || 'N/A');
        const safeDestCity = escapeHtml(destination.city || '');
        const safeDestCountry = escapeHtml(destination.countryCode || '');
        const safeDestPhone = escapeHtml(destination.phone || '');

        const safeStatus = escapeHtml((shipment.status || '').replace(/_/g, ' ').toUpperCase());
        const safePieces = Array.isArray(shipment.items) ? shipment.items.length : 1;
        const safeWeight = Array.isArray(shipment.items) ? shipment.items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0) : 0;
        const safeDate = escapeHtml(new Date(shipment.createdAt || Date.now()).toLocaleDateString());
        const safeCarrier = escapeHtml(shipment.carrierCode || 'TARGET');
        const safeService = escapeHtml(shipment.serviceCode || 'DOMESTIC');
        const safeCod = shipment.codAmount ? `${shipment.codAmount} ${shipment.codCurrency || 'KWD'}` : null;

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label - ${safeTrackingNumber}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center}
.label-container{width:420px;min-height:580px;background:#fff;padding:24px;border:2px solid #000;box-sizing:border-box;position:relative;border-radius:4px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:14px}
.logo{font-size:20px;font-weight:900;letter-spacing:-0.5px;color:#b91c1c}
.route-badge{background:#000;color:#fff;font-weight:bold;padding:4px 8px;font-size:12px;border-radius:3px}
.barcode-box{border:2px solid #000;margin:12px 0;padding:12px;text-align:center;background:#fff}
.barcode-code{font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:3px;margin:8px 0 2px}
.address-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px}
.addr-card{border:1px solid #000;padding:10px}
.addr-title{font-size:11px;font-weight:800;text-transform:uppercase;color:#475569;margin-bottom:4px;letter-spacing:0.5px}
.addr-body{font-size:13px;line-height:1.4}
.meta-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
.meta-table td{border:1px solid #000;padding:6px 8px}
.meta-label{font-weight:bold;background:#f8fafc;width:35%}
.footer{text-align:center;font-size:11px;color:#64748b;margin-top:14px;border-top:1px dashed #cbd5e1;padding-top:10px}
.print-actions{margin-top:16px;display:flex;gap:10px}
.print-btn{padding:10px 24px;background:#0f172a;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer}
.print-btn:hover{background:#1e293b}
@media print{
  body{background:#fff;padding:0}
  .print-actions{display:none}
  .label-container{box-shadow:none;border:2px solid #000;width:100%;max-width:420px;margin:0 auto}
}
</style>
</head>
<body>
<div class="label-container">
  <div class="header">
    <div class="logo">TARGET LOGISTICS</div>
    <div class="route-badge">${safeCarrier} - ${safeService}</div>
  </div>
  <div class="barcode-box">
    <svg id="barcode" style="width:100%;max-height:55px"></svg>
    <div class="barcode-code">${safeTrackingNumber}</div>
  </div>
  <div class="address-grid">
    <div class="addr-card">
      <div class="addr-title">To (Receiver)</div>
      <div class="addr-body">
        <strong>${safeDestContact}</strong><br>
        ${safeDestCompany}
        ${safeDestAddress}<br>
        ${safeDestCity} ${safeDestCountry}<br>
        <strong>Ph:</strong> ${safeDestPhone}
      </div>
    </div>
    <div class="addr-card">
      <div class="addr-title">From (Shipper)</div>
      <div class="addr-body">
        <strong>${safeOriginContact || 'Target Logistics Shipper'}</strong><br>
        ${safeOriginCompany}
        ${safeOriginAddress}<br>
        ${safeOriginCity} ${safeOriginCountry}<br>
        <strong>Ph:</strong> ${safeOriginPhone}
      </div>
    </div>
  </div>
  <table class="meta-table">
    <tr>
      <td class="meta-label">Pieces / Weight</td>
      <td>${safePieces} pc(s) | ${safeWeight} kg</td>
    </tr>
    <tr>
      <td class="meta-label">Date Booked</td>
      <td>${safeDate}</td>
    </tr>
    ${safeCod ? `<tr><td class="meta-label">C.O.D. Amount</td><td><strong>${safeCod}</strong></td></tr>` : ''}
  </table>
  <div class="footer">
    Target Logistics Global Express & Domestic Delivery &bull; mawthook.io
  </div>
</div>
<div class="print-actions">
  <button class="print-btn" onclick="window.print()">🖨️ Print Label</button>
</div>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<script>
  try {
    JsBarcode("#barcode", "${safeTrackingNumber}", {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 50
    });
  } catch(e) {}
  window.addEventListener('load', function() {
    if (window.location.search.includes('autoprint=1')) {
      window.print();
    }
  });
</script>
</body></html>`;

        res.send(html);
    } catch (error) {
        logger.error('Error generating API shipment label:', error);
        res.status(500).send('Failed to generate shipment label');
    }
};
