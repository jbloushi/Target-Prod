const { prisma } = require('../config/database');
const PricingService = require('./pricing.service');
const CarrierFactory = require('./CarrierFactory');
const logger = require('../utils/logger');
const { generateDraftTrackingNumber, generateManualTrackingNumber } = require('../utils/shipmentUtils');
const { SHIPMENT_STATUSES, MANUAL_SHIPMENT_STATUSES } = require('../constants/statusConstants');
const {
    getAssignedShippingAccess,
    assertRequestedAccessAllowed,
    shouldEnforceAssignedAccess
} = require('./shippingAccess.service');
const { isPlatformRole } = require('../middleware/rbac.policy');

class ShipmentDraftService {

    /**
     * Creates a Shipment Draft with Pricing Snapshot.
     * @param {Object} data - Raw shipment data from controller
     * @param {Object} user - The requesting user (logged in user)
     * @returns {Object} Created Shipment
     */
    async createDraft(data, user) {
        // 1. Determine Target User (The paying entity/owner)
        let targetUserId = user.id;
        if (isPlatformRole(user.role) && data.userId) {
            targetUserId = data.userId;
        }

        // Fetch target user with organization details via Prisma
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            include: { organization: true }
        });
        
        if (!targetUser) throw new Error('Target user not found');

        // 2. Sanitize & Normalize Data
        const cleanData = this.sanitizePayload(data);
        const assignedAccess = getAssignedShippingAccess(targetUser);
        const enforceAssignedAccess = shouldEnforceAssignedAccess(user, targetUser);

        if (enforceAssignedAccess) {
            assertRequestedAccessAllowed(assignedAccess, {
                carrierCode: cleanData.carrierCode,
                serviceCode: cleanData.serviceCode
            });
            cleanData.carrierCode = assignedAccess.carrierCode;
            cleanData.serviceCode = assignedAccess.serviceCode;
            cleanData.manualShipment = assignedAccess.mode === 'manual';
        }

        const carrierCode = String(cleanData.carrierCode || assignedAccess.carrierCode || '').toUpperCase();
        const isManualShipment = cleanData.manualShipment === true
            || carrierCode === 'MANUAL';

        // 3. Rate Shopping & Pricing Snapshot
        const serviceCode = isManualShipment ? null : (cleanData.serviceCode || 'P');
        logger.debug(`ShipmentDraftService: Creating draft for user ${targetUserId}, service ${serviceCode}`);
        const selectedOptionalCodes = new Set((cleanData.optionalServiceCodes || []).map(code => String(code).toUpperCase()));
        if (selectedOptionalCodes.has('II') && Number(cleanData.insuredValue || 0) <= 0) {
            throw new Error('Insurance service (II) requires insuredValue > 0.');
        }

        let snapshot;
        const needsCarrier = !isManualShipment && (cleanData.carrierCode === 'DGR' || cleanData.carrierCode === 'DHL' || !cleanData.carrierCode) && serviceCode;

        if (needsCarrier) {
            try {
                snapshot = await this.getSecurePricing(cleanData, targetUser);
            } catch (err) {
                logger.error(`ShipmentDraftService: Pricing failed: ${err.message}`, { cleanData, targetUserId });
                throw err;
            }
        } else {
            // Fallback for manual shipments / other carriers
            const { markup, source } = PricingService.resolveMarkup(targetUser, targetUser.organization, isManualShipment ? 'MANUAL' : (cleanData.carrierCode || 'DGR'));
            snapshot = PricingService.createSnapshot(
                data.costPrice || data.price || data.totalPrice || 0,
                markup,
                data.currency || 'KWD',
                source
            );
            // Override total if provided manually (TRUSTED sources only)
            if (data.price || data.totalPrice) snapshot.totalPrice = Number(data.price || data.totalPrice);
        }

        // Helper to generate tracking number
        const trackingNumber = data.trackingNumber || (isManualShipment ? generateManualTrackingNumber() : generateDraftTrackingNumber());
        const estimatedDelivery = data.estimatedDelivery || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const requestedStatus = cleanData.status || (isManualShipment ? 'draft' : 'ready_for_pickup');
        if (!SHIPMENT_STATUSES.includes(requestedStatus)) {
            throw new Error(`Invalid shipment status '${requestedStatus}'`);
        }
        if (isManualShipment && !MANUAL_SHIPMENT_STATUSES.includes(requestedStatus)) {
            throw new Error(`Invalid manual shipment status '${requestedStatus}'`);
        }

        // 4. Create Shipment in MySQL
        const shipment = await prisma.shipment.create({
            data: {
                trackingNumber,
                status: requestedStatus,
                serviceCode,
                carrierCode: isManualShipment ? 'MANUAL' : (cleanData.carrierCode || 'DGR'),
                
                // Address & Customer Info (JSON)
                origin: { 
                    ...cleanData.origin, 
                    customer: cleanData.customer,
                    packagingType: cleanData.packagingType || 'user',
                    incoterm: cleanData.incoterm || 'DAP',
                    shipperAccount: cleanData.shipperAccount,
                    payerOfVat: cleanData.payerOfVat || 'receiver',
                    gstPaid: cleanData.gstPaid || false,
                    palletCount: cleanData.palletCount || 0,
                    packageMarks: cleanData.packageMarks || '',
                    labelSettings: cleanData.labelSettings || { format: 'pdf' },
                    dangerousGoods: cleanData.dangerousGoods || { contains: false },
                    insuredValue: cleanData.insuredValue || null
                },
                destination: cleanData.destination,
                currentLocation: cleanData.origin,
                
                // Content Info (JSON)
                items: cleanData.items,
                parcels: cleanData.parcels || [],
                
                // Financials
                price: snapshot.totalPrice,
                costPrice: snapshot.carrierRate,
                markupAmount: snapshot.markup, // Mapped to markupAmount natively
                currency: cleanData.currency || snapshot.currency,
                pricingSnapshot: snapshot,
                
                // Relations
                userId: targetUserId,
                organizationId: targetUser.organizationId,

                // Metadata
                shipmentType: cleanData.shipmentType,
                estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
                
                // Arrays (JSON)
                history: [
                    {
                        status: requestedStatus,
                        description: isManualShipment ? 'Manual shipment created' : 'Shipment draft created',
                        timestamp: new Date(),
                        location: cleanData.origin
                    }
                ],
                bookingAttempts: [],
                documents: []
            }
        });

        logger.debug(`ShipmentDraftService: Draft created with Tracking ${trackingNumber}, Org: ${targetUser.organizationId}`);

        // 5. Accounting: Record Initial Snapshot (0-amount audit trail)
        if (shipment.organizationId && snapshot.totalPrice > 0) {
            try {
                const financeLedgerService = require('./financeLedger.service');
                await financeLedgerService.createLedgerEntry(shipment.organizationId, {
                    sourceRepo: 'Shipment',
                    sourceId: shipment.id,
                    amount: 0,
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: `Initial Pre-booking Snapshot: ${trackingNumber} (Price: ${snapshot.totalPrice})`,
                    reference: trackingNumber,
                    createdBy: user.id,
                    metadata: {
                        event: 'DRAFT_CREATION',
                        price: snapshot.totalPrice.toString()
                    }
                });
            } catch (ledgeError) {
                logger.error('Failed to create initial ledger entry for draft:', ledgeError);
                // We don't throw here to avoid failing the whole draft creation for an audit log
            }
        }

        return shipment;
    }

    /**
     * Fetches fresh rates from carrier and creates a pricing snapshot.
     */
    async getSecurePricing(data, user) {
        const serviceCode = data.serviceCode || 'P';
        const carrierCode = data.carrierCode || 'DGR';

        // 1. Call Carrier
        const carrier = CarrierFactory.getAdapter(carrierCode);
        const quotes = await carrier.getRates(data);

        // 2. Find selected service
        const quote = quotes.find(q => q.serviceCode === serviceCode);
        if (!quote) {
            throw new Error(`Service ${serviceCode} not available from ${carrierCode}`);
        }

        const selectedOptionalCodes = new Set(
            (data.optionalServiceCodes || [])
                .map(code => String(code))
                .filter(Boolean)
        );

        const optionalServices = (quote.optionalServices || [])
            .filter(service => selectedOptionalCodes.has(service.serviceCode))
            .map(service => ({
                serviceCode: service.serviceCode,
                serviceName: service.serviceName,
                totalPrice: Number(PricingService.normalizeAmount(service.totalPrice || 0).toFixed(3)),
                currency: service.currency || quote.currency || 'KWD'
            }));

        const { Decimal } = require('decimal.js');
        const optionalServicesTotal = optionalServices.reduce((sum, service) => {
            return sum.plus(new Decimal(service.totalPrice || 0));
        }, new Decimal(0));

        // 3. Resolve Markup & Create Snapshot
        const { markup, source } = PricingService.resolveMarkup(user, user.organization, carrierCode);
        const snapshot = PricingService.createSnapshot(
            quote.totalPrice,
            markup,
            quote.currency,
            source
        );
        snapshot.billingCurrency = quote.currency || 'KWD';
        snapshot.declaredCurrency = data.currency || quote.currency || 'KWD';

        snapshot.optionalServices = optionalServices;
        snapshot.optionalServicesTotal = Number(optionalServicesTotal.toFixed(3));

        // Final Total = Snapshot (Base + Markup) + Optional Services
        const baseTotal = new Decimal(snapshot.totalPrice);
        const finalTotal = baseTotal.plus(optionalServicesTotal);

        snapshot.estimatedShipmentCost = Number(baseTotal.toFixed(3));
        snapshot.totalPrice = Number(finalTotal.toFixed(3));

        return snapshot;
    }

    /**
     * Sanitizes address and normalizes payload structure.
     */
    sanitizePayload(data) {
        const { sender, receiver, origin: legacyOrigin, destination: legacyDestination, items: legacyItems, parcels } = data;

        const sanitizeAddress = (addr) => {
            if (!addr) return null;
            const clean = { ...addr };
            if (clean.latitude === null) delete clean.latitude;
            if (clean.longitude === null) delete clean.longitude;

            if (!clean.formattedAddress && (clean.streetLines?.length || clean.city)) {
                const parts = [
                    ...(clean.streetLines || []),
                    clean.city,
                    clean.state,
                    clean.postalCode,
                    clean.country || clean.countryCode
                ].filter(Boolean);
                clean.formattedAddress = parts.join(', ');
            }
            return clean;
        };

        const origin = sanitizeAddress(sender || legacyOrigin);
        const destination = sanitizeAddress(receiver || legacyDestination);

        if (!origin || !origin.formattedAddress) throw new Error('Sender address is required');
        if (!destination || !destination.formattedAddress) throw new Error('Receiver address is required');

        const customer = data.customer || {
            name: origin.contactPerson,
            email: origin.email,
            phone: origin.phone
        };

        if (!customer.name || !customer.email) {
            if (!origin.contactPerson) throw new Error('Customer/Sender details required');
        }

        // Map and normalize items
        const rawItems = (legacyItems && legacyItems.length > 0) ? legacyItems : parcels;
        const currency = data.currency || 'KWD';

        const items = (rawItems || []).map(item => ({
            ...item,
            currency: currency
        }));

        return {
            ...data,
            origin,
            destination,
            customer,
            items,
            shipmentType: this.normalizeShipmentType(data.shipmentType),
            packagingType: data.packagingType || 'user',
            incoterm: data.incoterm || 'DAP',
            currency
        };
    }

    normalizeShipmentType(shipmentType) {
        const value = String(shipmentType || 'package').toLowerCase();

        if (['documents', 'document', 'document_express'].includes(value)) {
            return 'documents';
        }

        if (['package', 'standard_package', 'standard'].includes(value)) {
            return 'package';
        }

        if (value === 'manual') {
            return 'package';
        }

        throw new Error('Shipment type must be Standard Package or Document Express');
    }
}

module.exports = new ShipmentDraftService();
