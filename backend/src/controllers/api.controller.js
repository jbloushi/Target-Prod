const CarrierFactory = require('../services/CarrierFactory');
const CarrierRateService = require('../services/CarrierRateService');
const PricingService = require('../services/pricing.service');
const { prisma } = require('../config/database');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const { hasCriticalChanges } = require('./shipment.helpers');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');

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

        // 1. Normalize
        const normalized = normalizeShipment(shipmentData);

        // 2. Get Adapter
        const carrier = carrierCode || 'DHL';
        const adapter = CarrierFactory.getAdapter(carrier);

        // 3. Validate via Adapter
        const errors = await adapter.validate(normalized);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: 'Validation Failed', details: errors });
        }

        // 4. Create Label via Adapter
        const result = await adapter.createShipment({
            ...normalized,
            user: req.user.id
        }, serviceCode || 'P');

        // 5. Audit/Persist to MySQL
        const newShipment = await prisma.shipment.create({
            data: {
                trackingNumber: result.trackingNumber,
                userId: req.user.id,
                organizationId: req.user.organizationId,
                carrier: carrier,
                serviceCode: serviceCode || 'P',
                status: 'created',
                labelUrl: result.labelBase64 ? `data:application/pdf;base64,${result.labelBase64}` : null,
                invoiceUrl: result.invoiceBase64 ? `data:application/pdf;base64,${result.invoiceBase64}` : null,
                origin: mapAddressToSchema(normalized.sender),
                destination: mapAddressToSchema(normalized.receiver),
                currentLocation: mapAddressToSchema(normalized.sender),
                customer: {
                    name: normalized.sender.company || normalized.sender.contactPerson,
                    email: normalized.sender.email || req.user.email,
                    phone: normalized.sender.phone
                },
                estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                shipmentDate: normalized.shipmentDate || new Date(),
                parcels: normalized.packages.map(p => ({
                    weight: p.weight.value,
                    dimensions: p.dimensions,
                    description: p.description
                })),
                items: normalized.items,
                price: result.totalPrice || 0,
                currency: 'KWD',
                dhlTrackingNumber: result.dhlTrackingNumber || null,
                dhlConfirmed: !!result.dhlTrackingNumber,
                history: [{
                    status: 'created',
                    timestamp: new Date().toISOString(),
                    description: 'Shipment created via API',
                    location: normalized.sender
                }]
            }
        });

        res.status(201).json({
            success: true,
            data: {
                trackingNumber: result.trackingNumber,
                labelUrl: newShipment.labelUrl,
                invoiceUrl: newShipment.invoiceUrl,
                carrier,
                status: newShipment.status
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

        const editableStatuses = ['draft', 'pending', 'updated', 'created', 'exception', 'ready_for_pickup'];
        if (!editableStatuses.includes(shipment.status)) {
            return res.status(400).json({ success: false, error: 'Cannot update in current status' });
        }

        const allowedFields = [
            'destination', 'origin', 'items', 'parcels', 'incoterm',
            'currency', 'dangerousGoods', 'serviceCode', 'customer',
            'reference', 'remarks'
        ];

        const criticalChanges = hasCriticalChanges(shipment, updates);
        const isBooked = shipment.dhlConfirmed === true;

        let finalPrice = Number(shipment.price);
        let finalSnapshot = shipment.pricingSnapshot;

        if (criticalChanges) {
            // Re-rating logic
            const tempState = { ...shipment, ...updates };
            const adapter = CarrierFactory.getAdapter(tempState.carrier || 'DHL');
            const quotes = await adapter.getRates({ ...tempState, sender: tempState.origin, receiver: tempState.destination });
            
            if (!quotes || quotes.length === 0) throw new Error('Re-rating failed');
            
            const selected = quotes.find(q => q.serviceCode === (tempState.serviceCode || shipment.serviceCode)) || quotes[0];
            const { markup, source } = PricingService.resolveMarkup(shipment.user, shipment.user.organization, (tempState.carrier || 'DHL').toUpperCase());
            
            finalSnapshot = PricingService.createSnapshot(Number(selected.totalPrice), markup, selected.currency || 'KWD', source);
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

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        return handleControllerError(res, error, 'API shipment update');
    }
};

/**
 * POST /api/v1/quotes
 */
exports.getQuotation = async (req, res) => {
    try {
        const normalized = normalizeShipment(req.body);
        const { carrierCode } = req.query;
        const rawRates = await CarrierRateService.getRates(normalized, carrierCode);

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { organization: true }
        });

        const finalQuotes = rawRates.map(rate => {
            const { markup, source } = PricingService.resolveMarkup(user, user.organization, (rate.provider || 'DHL').toUpperCase());
            const calculation = PricingService.calculateFinalPrice(rate.totalPrice, markup, rate.currency);
            return {
                serviceName: rate.serviceName,
                serviceCode: rate.serviceCode,
                carrier: rate.provider || 'DHL',
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
        addresses.push(req.body);

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
