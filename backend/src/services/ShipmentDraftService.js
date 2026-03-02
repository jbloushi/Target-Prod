const Shipment = require('../models/shipment.model');
const PricingService = require('./pricing.service');
const CarrierFactory = require('./CarrierFactory');
const logger = require('../utils/logger');
const User = require('../models/user.model');
const { generateDraftTrackingNumber } = require('../utils/shipmentUtils');

class ShipmentDraftService {

    /**
     * Creates a Shipment Draft with Pricing Snapshot.
     * @param {Object} data - Raw shipment data from controller
     * @param {Object} user - The requesting user
     * @returns {Object} Created Shipment
     */
    async createDraft(data, user) {
        // 1. Determine Target User (Paying Entity)
        let targetUserId = user._id;
        if (['staff', 'admin'].includes(user.role) && data.userId) {
            targetUserId = data.userId;
        }
        const targetUser = await User.findById(targetUserId).populate('organization');
        if (!targetUser) throw new Error('Target user not found');

        // 2. Sanitize & Normalize Data
        const cleanData = this.sanitizePayload(data);

        // 3. Rate Shopping & Pricing Snapshot
        const serviceCode = cleanData.serviceCode || 'P';
        logger.debug(`ShipmentDraftService: Creating draft for user ${targetUserId}, service ${serviceCode}`);

        let snapshot;
        const needsCarrier = (cleanData.carrierCode === 'DGR' || cleanData.carrierCode === 'DHL' || !cleanData.carrierCode) && serviceCode;

        if (needsCarrier) {
            try {
                snapshot = await this.getSecurePricing(cleanData, targetUser);
            } catch (err) {
                logger.error(`ShipmentDraftService: Pricing failed: ${err.message}`, { cleanData, targetUserId });
                throw err;
            }
        } else {
            // Fallback for manual shipments / other carriers
            const { markup, source } = PricingService.resolveMarkup(targetUser, targetUser.organization, cleanData.carrierCode || 'DGR');
            snapshot = PricingService.createSnapshot(
                data.costPrice || 0,
                markup,
                data.currency || 'KWD',
                source
            );
            // Override total if provided manually (TRUSTED sources only? For now, mimicking legacy)
            if (data.price) snapshot.totalPrice = Number(data.price);
        }

        // Helper to generate tracking number
        const trackingNumber = data.trackingNumber || generateDraftTrackingNumber();
        const estimatedDelivery = data.estimatedDelivery || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

        // 4. Create Shipment
        const shipmentData = {
            ...cleanData,
            trackingNumber,
            estimatedDelivery,
            currentLocation: cleanData.origin, // Initial location is origin
            user: targetUserId,
            organization: targetUser.organization?._id || targetUser.organization,
            status: cleanData.status || 'ready_for_pickup',
            pricingSnapshot: snapshot,

            // Legacy fields for compatibility (read-only for client)
            price: snapshot.totalPrice,
            costPrice: snapshot.carrierRate,
            markup: snapshot.markup,
            currency: cleanData.currency || snapshot.currency,

            // Initialize empty arrays
            bookingAttempts: [],
            documents: []
        };

        const shipment = new Shipment(shipmentData);
        logger.debug(`ShipmentDraftService: Draft created with Tracking ${trackingNumber}, Org: ${shipmentData.organization}`);
        await shipment.save();

        // 5. Accounting: Record Initial Snapshot (0-amount audit trail)
        if (shipment.organization && snapshot.totalPrice > 0) {
            const financeLedgerService = require('./financeLedger.service');
            await financeLedgerService.createLedgerEntry(shipment.organization, {
                sourceRepo: 'Shipment',
                sourceId: shipment._id,
                amount: 0,
                entryType: 'DEBIT',
                category: 'SHIPMENT_CHARGE',
                description: `Initial Pre-booking Snapshot: ${trackingNumber} (Price: ${snapshot.totalPrice})`,
                reference: trackingNumber,
                createdBy: user?._id,
                metadata: {
                    event: 'DRAFT_CREATION',
                    price: snapshot.totalPrice.toString()
                }
            });
        }

        return shipment;
    }

    /**
     * Fetches fresh rates from carrier and creates a pricing snapshot.
     */
    async getSecurePricing(data, user) {
        const serviceCode = data.serviceCode || 'P'; // Default key
        const carrierCode = data.carrierCode || 'DGR';

        // 1. Call Carrier
        const carrier = CarrierFactory.getAdapter(carrierCode);
        const quotes = await carrier.getRates(data);

        // 2. Find selected service
        const quote = quotes.find(q => q.serviceCode === serviceCode);
        if (!quote) {
            throw new Error(`Service ${serviceCode} not available from ${carrierCode}`);
        }

        const selectedOptionalServices = Array.isArray(data.optionalServices) ? data.optionalServices : [];
        const selectedOptionalCodes = new Set(
            selectedOptionalServices
                .map(service => service?.serviceCode)
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
            currency: currency // Force consistency
        }));

        return {
            ...data,
            origin,
            destination,
            customer,
            items,
            shipmentType: data.shipmentType || 'package',
            packagingType: data.packagingType || 'user',
            incoterm: data.incoterm || 'DAP',
            currency
        };
    }
}

module.exports = new ShipmentDraftService();
