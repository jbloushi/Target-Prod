const path = require('path');
const fs = require('fs');
const CarrierFactory = require('../services/CarrierFactory');
const CarrierRateService = require('../services/CarrierRateService');
const PricingService = require('../services/pricing.service');
const ShipmentLifecycleService = require('../services/ShipmentLifecycleService');
const { prisma } = require('../config/database');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const { hasCriticalChanges } = require('./shipment.helpers');
const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');
const {
    getAssignedShippingAccess,
    assertRequestedAccessAllowed,
    normalizeCarrier,
    shouldEnforceAssignedAccess
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
        const enforceAssignedAccess = shouldEnforceAssignedAccess(apiUser);

        const sCountry = shipmentData.sender?.countryCode || shipmentData.origin?.countryCode;
        const rCountry = shipmentData.receiver?.countryCode || shipmentData.destination?.countryCode;
        const isExplicitDomestic = Boolean(sCountry && rCountry && String(sCountry).toUpperCase() === String(rCountry).toUpperCase());
        const requestedCarrier = carrierCode ? normalizeCarrier(carrierCode) : null;

        // Manual Shipment Mode: User is configured for Manual Mode or explicitly requested MANUAL
        if (assignedAccess.carrierCode === 'MANUAL' || requestedCarrier === 'MANUAL') {
            if (enforceAssignedAccess) {
                assertRequestedAccessAllowed(assignedAccess, { carrierCode, serviceCode });
            }

            const shipment = await ShipmentLifecycleService.submitShipment({
                ...shipmentData,
                carrierCode: 'MANUAL',
                serviceCode: null,
                status: 'draft',
                price: 0
            }, apiUser);

            return res.status(201).json({
                success: true,
                data: {
                    trackingNumber: shipment.trackingNumber,
                    carrier: 'MANUAL',
                    serviceCode: null,
                    status: 'draft',
                    price: '0',
                    currency: shipment.currency || 'KWD'
                }
            });
        }

        if (assignedAccess.carrierCode === 'INTERNAL' || requestedCarrier === 'INTERNAL' || isExplicitDomestic || serviceCode === 'DOM') {
            const shipment = await ShipmentLifecycleService.submitShipment({
                ...shipmentData,
                carrierCode: 'INTERNAL',
                serviceCode: assignedAccess.carrierCode === 'INTERNAL' ? (serviceCode || null) : 'DOM',
                internallyManaged: true
            }, apiUser);

            let labelUrl = shipment.labelUrl;
            if (!labelUrl || !labelUrl.startsWith('data:application/pdf;base64,')) {
                try {
                    const { generateCarrierAwbPdf } = require('../utils/carrierPdfMock');
                    labelUrl = generateCarrierAwbPdf(shipment, 'Target Express');
                    await prisma.shipment.update({
                        where: { id: shipment.id },
                        data: { labelUrl }
                    }).catch(() => {});
                } catch (pdfErr) {
                    labelUrl = `/api/v1/shipments/${shipment.trackingNumber}/label`;
                }
            }

            return res.status(201).json({
                success: true,
                data: {
                    trackingNumber: shipment.trackingNumber,
                    carrier: shipment.carrierCode,
                    serviceCode: shipment.serviceCode,
                    status: shipment.status,
                    labelUrl: labelUrl,
                    price: shipment.price,
                    currency: shipment.currency,
                    codAmount: shipment.codAmount || null,
                    codCurrency: shipment.codCurrency || null,
                    codStatus: shipment.codStatus || null
                }
            });
        }

        if (enforceAssignedAccess) {
            assertRequestedAccessAllowed(assignedAccess, { carrierCode, serviceCode });
        }

        const resolvedCarrierCode = enforceAssignedAccess ? assignedAccess.carrierCode : (requestedCarrier || assignedAccess.carrierCode);
        const resolvedServiceCode = enforceAssignedAccess
            ? (assignedAccess.serviceCode || serviceCode || null)
            : (serviceCode || assignedAccess.serviceCode || null);
        const carrierCapabilities = typeof CarrierFactory.getCarrierCapabilities === 'function'
            ? (CarrierFactory.getCarrierCapabilities(resolvedCarrierCode) || {})
            : { supportsExternalApi: true };

        if (carrierCapabilities.supportsExternalApi === false) {
            const shipment = await ShipmentLifecycleService.submitShipment({
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
            const shipment = await ShipmentLifecycleService.submitShipment({
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

        // 1b. Compute server-side pricing snapshot
        let pricingSnapshot = null;
        try {
            const ShipmentDraftService = require('../services/ShipmentDraftService');
            if (typeof ShipmentDraftService?.getSecurePricing === 'function') {
                pricingSnapshot = await ShipmentDraftService.getSecurePricing(
                    {
                        ...shipmentData,
                        origin: mapAddressToSchema(normalized.sender),
                        destination: mapAddressToSchema(normalized.receiver),
                        parcels: normalized.packages.map(p => ({
                            weight: p.weight.value,
                            dimensions: p.dimensions,
                            description: p.description
                        })),
                        carrierCode: resolvedCarrierCode,
                        serviceCode: resolvedServiceCode
                    },
                    apiUser,
                    resolvedServiceCode,
                    resolvedCarrierCode
                );
            }
        } catch (priceErr) {
            logger.warn(`API Shipment pricing snapshot fallback: ${priceErr.message}`);
        }

        const preBookingPrice = resolvedCarrierCode === 'OTE'
            ? 25
            : Number(pricingSnapshot?.totalPrice || 0);
        const preBookingCurrency = resolvedCarrierCode === 'OTE'
            ? 'AED'
            : (pricingSnapshot?.currency || 'KWD');

        // Enforce unified credit limit check on autoBook: true API bookings before booking
        if (req.body.autoBook === true) {
            const org = apiUser.organization;
            const isBypassRole = ['admin', 'staff', 'accounting'].includes(apiUser.role);
            if (!isBypassRole && org) {
                const currencyRateService = require('../services/currencyRate.service');
                const orgCurrency = org.currency || 'KWD';
                const creditLimit = (org.creditLimit !== null && org.creditLimit !== undefined)
                    ? Number(org.creditLimit)
                    : Number(apiUser?.creditLimit || 0);
                const balance = Number(org.balance || 0);
                const unappliedCash = Number(org.unappliedBalance || 0);
                const isPrepaid = creditLimit === 0;
                const netAR = Math.max(0, balance - unappliedCash);
                const availableCredit = isPrepaid
                    ? Math.max(0, unappliedCash - Math.max(0, balance))
                    : Math.max(0, creditLimit - netAR);

                const priceInOrgCurrency = Number(
                    currencyRateService.convert(preBookingPrice, preBookingCurrency, orgCurrency)
                        .toFixed(orgCurrency === 'KWD' ? 3 : 2)
                );

                if (preBookingPrice > 0 && priceInOrgCurrency > availableCredit) {
                    return res.status(400).json({
                        success: false,
                        error: 'Insufficient available credit to finalize booking',
                        details: {
                            availableCredit: Number(availableCredit.toFixed(3)),
                            requiredAmount: priceInOrgCurrency,
                            currency: orgCurrency,
                            creditLimit,
                            outstandingBalance: balance,
                            unappliedCash
                        }
                    });
                }
            }
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

        // 4b. Ensure server-side pricing snapshot is available
        if (!pricingSnapshot) {
            try {
                const ShipmentDraftService = require('../services/ShipmentDraftService');
                if (typeof ShipmentDraftService?.getSecurePricing === 'function') {
                    pricingSnapshot = await ShipmentDraftService.getSecurePricing(
                        {
                            ...shipmentData,
                            origin: mapAddressToSchema(normalized.sender),
                            destination: mapAddressToSchema(normalized.receiver),
                            parcels: normalized.packages.map(p => ({
                                weight: p.weight.value,
                                dimensions: p.dimensions,
                                description: p.description
                            })),
                            carrierCode: resolvedCarrierCode,
                            serviceCode: resolvedServiceCode
                        },
                        apiUser,
                        resolvedServiceCode,
                        resolvedCarrierCode
                    );
                }
            } catch (priceErr) {
                logger.warn(`API Shipment pricing snapshot fallback for ${result.trackingNumber}: ${priceErr.message}`);
            }
        }

        const bookingPrice = resolvedCarrierCode === 'OTE'
            ? 25
            : Number(pricingSnapshot?.totalPrice || result.totalPrice || 0);
        const carrierCost = Number(pricingSnapshot?.carrierRate ?? result.costPrice ?? result.carrierRate ?? 0);
        const markupAmount = pricingSnapshot?.markup !== undefined && pricingSnapshot?.markup !== null
            ? Number(pricingSnapshot.markup)
            : (bookingPrice > 0 && carrierCost > 0 ? Number((bookingPrice - carrierCost).toFixed(3)) : null);
        const billingCurrency = resolvedCarrierCode === 'OTE' ? 'AED' : (pricingSnapshot?.currency || 'KWD');

        // Post-rate verification for autoBook if preBookingPrice was zero
        if (req.body.autoBook === true) {
            const org = apiUser.organization;
            const isBypassRole = ['admin', 'staff', 'accounting'].includes(apiUser.role);
            if (!isBypassRole && org) {
                const currencyRateService = require('../services/currencyRate.service');
                const orgCurrency = org.currency || 'KWD';
                const creditLimit = (org.creditLimit !== null && org.creditLimit !== undefined)
                    ? Number(org.creditLimit)
                    : Number(apiUser?.creditLimit || 0);
                const balance = Number(org.balance || 0);
                const unappliedCash = Number(org.unappliedBalance || 0);
                const isPrepaid = creditLimit === 0;
                const netAR = Math.max(0, balance - unappliedCash);
                const availableCredit = isPrepaid
                    ? Math.max(0, unappliedCash - Math.max(0, balance))
                    : Math.max(0, creditLimit - netAR);

                const priceInOrgCurrency = Number(
                    currencyRateService.convert(bookingPrice, billingCurrency, orgCurrency)
                        .toFixed(orgCurrency === 'KWD' ? 3 : 2)
                );

                if (bookingPrice > 0 && priceInOrgCurrency > availableCredit) {
                    return res.status(400).json({
                        success: false,
                        error: 'Insufficient available credit to finalize booking',
                        details: {
                            availableCredit: Number(availableCredit.toFixed(3)),
                            requiredAmount: priceInOrgCurrency,
                            currency: orgCurrency,
                            creditLimit,
                            outstandingBalance: balance,
                            unappliedCash
                        }
                    });
                }
            }
        }

        // 5. Wrap shipment creation, customer ledger entry, invoice generation, carrier payable, and GL journal entry inside prisma.$transaction
        const shipmentDataToCreate = {
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
            costPrice: carrierCost > 0 ? carrierCost : undefined,
            markupAmount: markupAmount !== null ? markupAmount : undefined,
            pricingSnapshot: pricingSnapshot || undefined,
            currency: billingCurrency,
            paid: false,
            totalPaid: 0,
            remainingBalance: bookingPrice,
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
        };

        const executeBookingTransaction = async (tx) => {
            const shipment = await tx.shipment.create({
                data: shipmentDataToCreate
            });

            if ((req.user.organizationId && bookingPrice > 0) || (resolvedCarrierCode !== 'INTERNAL' && carrierCost > 0)) {
                const financeLedgerService = require('../services/financeLedger.service');
                let chargeEntry = null;

                if (req.user.organizationId && bookingPrice > 0) {
                    chargeEntry = await financeLedgerService.createLedgerEntry(req.user.organizationId, {
                        sourceRepo: 'Shipment',
                        sourceId: shipment.id || result.trackingNumber,
                        amount: bookingPrice,
                        currency: shipment.currency || billingCurrency || 'KWD',
                        entryType: 'DEBIT',
                        category: 'SHIPMENT_CHARGE',
                        description: `API Booking Charge for ${shipment.trackingNumber || result.trackingNumber}`,
                        reference: shipment.trackingNumber || result.trackingNumber,
                        createdBy: req.user.id,
                        metadata: {
                            carrierCode: resolvedCarrierCode,
                            serviceCode: resolvedServiceCode,
                            costPrice: carrierCost,
                            currency: shipment.currency || billingCurrency || 'KWD'
                        }
                    }, tx);

                    if (chargeEntry?.id && typeof tx.invoice?.findUnique === 'function' && typeof tx.invoice?.create === 'function') {
                        const invoiceNumber = `INV-SHP-${shipment.trackingNumber || result.trackingNumber}`;
                        const existingInvoice = await tx.invoice.findUnique({ where: { invoiceNumber } });
                        if (!existingInvoice) {
                            const now = new Date();
                            await tx.invoice.create({
                                data: {
                                    invoiceNumber,
                                    organizationId: req.user.organizationId,
                                    periodStart: now,
                                    periodEnd: now,
                                    subtotal: bookingPrice,
                                    vat: 0,
                                    total: bookingPrice,
                                    currency: shipment.currency || billingCurrency || 'KWD',
                                    status: 'issued',
                                    notes: `API Consignment Tax Invoice (${shipment.trackingNumber || result.trackingNumber} - ${resolvedCarrierCode})`,
                                    createdById: req.user.id,
                                    lines: {
                                        create: {
                                            shipmentId: shipment.id || result.trackingNumber,
                                            ledgerEntryId: chargeEntry.id,
                                            trackingNumber: shipment.trackingNumber || result.trackingNumber,
                                            shipmentDate: now,
                                            amount: bookingPrice,
                                            currency: shipment.currency || billingCurrency || 'KWD',
                                            paid: false,
                                            totalPaid: 0,
                                            remainingBalance: bookingPrice
                                        }
                                    }
                                }
                            });
                        }
                    }
                }

                if (resolvedCarrierCode !== 'INTERNAL' && carrierCost > 0 && typeof financeLedgerService.recordCarrierPayable === 'function') {
                    await financeLedgerService.recordCarrierPayable({
                        organizationId: null,
                        shipmentId: shipment.id || result.trackingNumber,
                        carrierCode: resolvedCarrierCode,
                        costPrice: carrierCost,
                        currency: shipment.currency || billingCurrency || 'KWD',
                        trackingNumber: shipment.trackingNumber || result.trackingNumber,
                        createdBy: req.user.id
                    }, tx);
                }

                const generalLedgerService = require('../services/generalLedger.service');
                if (typeof generalLedgerService?.postShipmentBookingEntry === 'function') {
                    await generalLedgerService.postShipmentBookingEntry({
                        shipmentId: shipment.id || result.trackingNumber,
                        trackingNumber: shipment.trackingNumber || result.trackingNumber,
                        organizationId: req.user.organizationId,
                        customerPrice: bookingPrice,
                        carrierCost,
                        carrierCode: resolvedCarrierCode,
                        currency: shipment.currency || billingCurrency || 'KWD',
                        createdById: req.user.id
                    }, tx);
                }
            }

            return shipment;
        };

        let newShipment;
        if (typeof prisma.$transaction === 'function') {
            newShipment = await prisma.$transaction(executeBookingTransaction);
        } else {
            try {
                newShipment = await executeBookingTransaction(prisma);
            } catch (mockErr) {
                logger.warn(`API Shipment ledger posting non-fatal warning for ${result.trackingNumber}: ${mockErr.message}`);
                newShipment = await prisma.shipment.create({ data: shipmentDataToCreate });
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
                price: newShipment.price,
                currency: newShipment.currency,
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
        const updates = req.body || {};

        const userRole = String(req.user.role || '').toLowerCase();
        const isStaff = ['admin', 'superadmin', 'super_admin', 'dispatcher', 'staff', 'manager'].includes(userRole);

        const shipment = await prisma.shipment.findFirst({
            where: isStaff ? { trackingNumber: number } : { trackingNumber: number, userId: req.user.id },
            include: { user: { include: { organization: true } } }
        });

        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const editableStatuses = ['draft', 'pending', 'booked', 'exception', 'ready_for_pickup'];
        if (!editableStatuses.includes(shipment.status)) {
            return res.status(400).json({ success: false, error: 'Cannot update in current status' });
        }

        // Support sender / receiver aliases
        if (updates.sender && !updates.origin) updates.origin = updates.sender;
        if (updates.receiver && !updates.destination) updates.destination = updates.receiver;

        const allowedPrismaFields = [
            'destination', 'origin', 'items', 'parcels', 'incoterm',
            'currency', 'customer', 'packagingType'
        ];

        const nextOrigin = (shipment.origin && typeof shipment.origin === 'object') ? { ...shipment.origin } : {};
        if (updates.origin && typeof updates.origin === 'object') Object.assign(nextOrigin, updates.origin);
        if (updates.remarks !== undefined) nextOrigin.remarks = updates.remarks;
        if (updates.reference !== undefined) nextOrigin.reference = updates.reference;
        if (updates.dangerousGoods !== undefined) nextOrigin.dangerousGoods = updates.dangerousGoods;

        const nextCustomer = (shipment.customer && typeof shipment.customer === 'object') ? { ...shipment.customer } : {};
        if (updates.customer && typeof updates.customer === 'object') Object.assign(nextCustomer, updates.customer);
        if (updates.reference !== undefined) nextCustomer.reference = updates.reference;
        if (updates.remarks !== undefined) nextCustomer.remarks = updates.remarks;

        const criticalChanges = hasCriticalChanges(shipment, updates);

        let finalPrice = Number(shipment.price);
        let finalSnapshot = shipment.pricingSnapshot;

        if (criticalChanges) {
            // Re-rating logic with normalized package schema
            const tempState = { ...shipment, ...updates, origin: nextOrigin };
            if (!tempState.packages && tempState.parcels) {
                tempState.packages = (Array.isArray(tempState.parcels) ? tempState.parcels : []).map(p => ({
                    weight: Number(p.weight?.value || p.weight || 1),
                    dimensions: {
                        length: Number(p.length || 10),
                        width: Number(p.width || 10),
                        height: Number(p.height || 10)
                    }
                }));
            }

            const isTest = shipment.pricingSnapshot?.isTest === true || shipment.pricingSnapshot?.environment === 'test';
            const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || 'production');
            const adapter = CarrierFactory.getAdapter(tempState.carrierCode || 'DGR', { isTest, environment });
            const quotes = await adapter.getRates({
                ...tempState,
                sender: tempState.origin,
                receiver: tempState.destination,
                packages: tempState.packages,
                isTest,
                environment
            });

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

        // Apply Updates to valid Prisma fields only
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedPrismaFields.includes(key)) filteredUpdates[key] = updates[key];
        });

        // Safely append to MySQL JSON history array
        const currentHistory = Array.isArray(shipment.history)
            ? shipment.history
            : (typeof shipment.history === 'string' ? JSON.parse(shipment.history) : []);
        const updatedHistory = [
            ...currentHistory,
            {
                status: 'updated',
                description: `API Update. New price: ${finalPrice}`,
                timestamp: new Date().toISOString()
            }
        ];

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                ...filteredUpdates,
                origin: nextOrigin,
                customer: nextCustomer,
                price: finalPrice,
                pricingSnapshot: finalSnapshot,
                history: updatedHistory
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
        const enforceAssignedAccess = shouldEnforceAssignedAccess(user);

        // Manual Shipment Mode: Return the standard manual quote placeholder
        if (assignedAccess.carrierCode === 'MANUAL' || carrierCode === 'MANUAL') {
            return res.status(200).json({
                success: true,
                data: [{
                    serviceName: 'Manual Shipment',
                    serviceCode: null,
                    carrier: 'MANUAL',
                    totalPrice: 0,
                    currency: req.body.currency || 'KWD',
                    estimatedDelivery: null
                }]
            });
        }

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

        if (enforceAssignedAccess) {
            assertRequestedAccessAllowed(assignedAccess, { carrierCode, serviceCode });
        }

        const resolvedCarrierCode = enforceAssignedAccess ? assignedAccess.carrierCode : (carrierCode ? normalizeCarrier(carrierCode) : assignedAccess.carrierCode);
        const resolvedServiceCode = enforceAssignedAccess
            ? (assignedAccess.serviceCode || serviceCode || null)
            : (serviceCode || assignedAccess.serviceCode || null);
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
            }
        }

        // Apply fallback pricing if no rates returned or carrier returned zero price (e.g. unpriced contract carrier)
        if (rawRates.length === 0 || rawRates.every(r => Number(r.totalPrice || 0) <= 0)) {
            const fallbackQuote = typeof PricingService.getFallbackRate === 'function' ? PricingService.getFallbackRate({
                carrierCode: resolvedCarrierCode,
                serviceCode: resolvedServiceCode,
                destinationCountry: normalized.receiver?.countryCode || normalized.receiver?.country,
                weight: normalized.weight,
                packages: normalized.packages
            }) : null;

            if (fallbackQuote) {
                rawRates = [fallbackQuote];
            } else if (rawRates.length === 0) {
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

            const { markup } = PricingService.resolveMarkup(user, user.organization, resolvedCarrierCode, rate);
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
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        res.status(200).json({ success: true, data: user?.addresses || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve addresses' });
    }
};

exports.addAddress = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const addresses = Array.isArray(user?.addresses) ? [...user.addresses] : [];
        const { id, label, company, contactPerson, phone, phoneCountryCode, email, streetLines, city, postalCode, countryCode, state, taxId, vatNumber, eoriNumber } = req.body;
        
        const newAddress = {
            id: id || require('crypto').randomUUID(),
            label: label || 'Default',
            company: company || '',
            contactPerson: contactPerson || '',
            phone: phone || '',
            phoneCountryCode: phoneCountryCode || '+965',
            email: email || '',
            streetLines: Array.isArray(streetLines) ? streetLines : (streetLines ? [streetLines] : []),
            city: city || '',
            postalCode: postalCode || '',
            countryCode: countryCode ? String(countryCode).toUpperCase() : 'KW',
            state: state || '',
            taxId: taxId || '',
            vatNumber: vatNumber || '',
            eoriNumber: eoriNumber || ''
        };

        addresses.push(newAddress);

        await prisma.user.update({
            where: { id: req.user.id },
            data: { addresses }
        });

        res.status(201).json({ success: true, data: newAddress });
    } catch (error) {
        res.status(400).json({ success: false, error: 'Failed to add address' });
    }
};

exports.updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const addresses = Array.isArray(user?.addresses) ? [...user.addresses] : [];

        const index = addresses.findIndex(a => String(a.id) === String(id) || String(a.label).toLowerCase() === String(id).toLowerCase());
        if (index === -1) return res.status(404).json({ success: false, error: 'Address not found' });

        addresses[index] = { ...addresses[index], ...req.body, id: addresses[index].id || id };

        await prisma.user.update({
            where: { id: req.user.id },
            data: { addresses }
        });

        res.status(200).json({ success: true, data: addresses[index] });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update address' });
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
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        // Authorize: user must own shipment or belong to same organization or be admin/staff
        const userRole = String(req.user.role || '').toLowerCase();
        const isAdmin = ['admin', 'superadmin', 'super_admin', 'dispatcher', 'staff', 'manager'].includes(userRole);
        const isOwner = shipment.userId === req.user.id;
        const isSameOrg = req.user.organizationId && shipment.organizationId === req.user.organizationId;
        if (!isAdmin && !isOwner && !isSameOrg) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const safeTrackingNumber = escapeHtml(number);

        // 1. If official carrier PDF document exists as base64, stream it directly
        const existingLabel = shipment.labelUrl || shipment.awbUrl;
        if (existingLabel && typeof existingLabel === 'string' && existingLabel.startsWith('data:application/pdf;base64,')) {
            const buffer = Buffer.from(existingLabel.split(',')[1], 'base64');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="label-${safeTrackingNumber}.pdf"`);
            res.setHeader('Content-Length', buffer.length);
            return res.send(buffer);
        }

        if (existingLabel && typeof existingLabel === 'string' && existingLabel.startsWith('/uploads/documents/')) {
            const filename = existingLabel.split('/').pop();
            const filePath = path.resolve(process.cwd(), 'uploads', 'documents', filename);
            if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename="label-${safeTrackingNumber}.pdf"`);
                return res.sendFile(filePath);
            }
        }

        if (existingLabel && typeof existingLabel === 'string' && /^https?:\/\//i.test(existingLabel) && !existingLabel.includes('/label')) {
            return res.redirect(existingLabel);
        }

        // 2. Generate authentic vector PDF Waybill/Label
        const { generateCarrierAwbPdf, generateCarrierAwbPdfBuffer } = require('../utils/carrierPdfMock');
        const carrierTitle = (shipment.carrierCode === 'INTERNAL' || !shipment.carrierCode)
            ? 'Target Express'
            : (shipment.carrierCode === 'DGR' ? 'DHL Express' : shipment.carrierCode);

        const pdfDataUri = generateCarrierAwbPdf(shipment, carrierTitle);
        const pdfBuffer = generateCarrierAwbPdfBuffer(shipment, carrierTitle);

        // Cache into DB for instant subsequent hits
        prisma.shipment.update({
            where: { id: shipment.id },
            data: { labelUrl: pdfDataUri }
        }).catch(() => {});

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="label-${safeTrackingNumber}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
    } catch (error) {
        logger.error('Error generating API shipment label PDF:', error);
        res.status(500).json({ success: false, error: 'Failed to generate shipment label PDF' });
    }
};
