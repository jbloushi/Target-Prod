/**
 * Module: ShipmentBookingService
 * Objective: Orchestrate the lifecycle of booking a shipment, including financial validation, carrier API calls, and ledger accounting.
 * Linked Constitution Section: 4 (Shipment Lifecycle) & 6 (Financial Ledger)
 */

const Shipment = require('../models/shipment.model');
const User = require('../models/user.model');
const Organization = require('../models/organization.model');
const CarrierFactory = require('./CarrierFactory');
const PricingService = require('./pricing.service');
const CarrierDocumentService = require('./CarrierDocumentService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const financeLedgerService = require('./financeLedger.service');

class ShipmentBookingService {

    /**
     * Executes the full booking workflow for a single shipment.
     * @param {string} trackingNumber - Internal tracking number.
     * @param {string|null} [overrideCarrierCode=null] - Optional carrier force.
     * @returns {Promise<Object>} { success, shipment, message }
     * @business_rule Enforces a 60-second idempotency window for pending booking attempts to prevent double-billing.
     * @business_rule Validates organization credit limits before initiating carrier API requests.
     */
    async bookShipment(trackingNumber, overrideCarrierCode = null) {
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) throw new Error('Shipment record not found');

        const carrierCode = String(overrideCarrierCode || shipment.carrierCode || shipment.carrier || 'DGR').toUpperCase();

        const payingUser = await User.findById(shipment.user).populate('organization');
        if (!payingUser) throw new Error('Shipment owner/user not found');

        const organizationId = shipment.organization || payingUser?.organization?._id || null;
        const organization = organizationId ? await Organization.findById(organizationId) : null;

        // Ensure Carrier is enabled for this account
        this.ensureCarrierAllowed({ carrierCode, organization, payingUser });

        // Force a pricing refresh if the snapshot is expired or invalid
        if (!PricingService.validateSnapshot(shipment.pricingSnapshot)) {
            await this.refreshPricingSnapshotForBooking({ shipment, carrierCode, payingUser, organization });
        }

        const price = shipment.pricingSnapshot?.totalPrice ?? shipment.price ?? 0;

        // Financial Gate: Credit Check
        if (organizationId) {
            const orgBalance = await financeLedgerService.getOrganizationBalance(organizationId);
            const availableCredit = (organization?.creditLimit || 0) - orgBalance;

            if (price > 0 && availableCredit < price) {
                shipment.financeHold = {
                    status: true,
                    reason: 'Insufficient available credit',
                    checkedAt: new Date(),
                    availableCredit,
                    requiredAmount: price
                };
                await shipment.save();
                throw new Error('Insufficient available credit to finalize booking.');
            }
        }

        // Idempotency: Prevent overlapping requests
        const activeAttempt = shipment.bookingAttempts.find((a) =>
            a.status === 'succeeded' || (a.status === 'pending' && new Date() - a.createdAt < 60000)
        );

        if (activeAttempt) {
            if (activeAttempt.status === 'succeeded') return { success: true, shipment, message: 'Shipment already booked.' };
            throw new Error('A booking request is currently being processed by the carrier. Please wait.');
        }

        const attemptId = crypto.randomUUID();
        shipment.bookingAttempts.push({ attemptId, status: 'pending' });
        await shipment.save();

        let carrierResult;
        try {
            const adapter = CarrierFactory.getAdapter(carrierCode);
            // @risk: Direct external API call
            carrierResult = await adapter.createShipment(this.mapToCarrierPayload(shipment), shipment.serviceCode);
        } catch (error) {
            await this.handleBookingFailure(shipment._id, attemptId, error.message);
            throw error;
        }

        try {
            const freshShipment = await Shipment.findById(shipment._id);
            const attempt = freshShipment.bookingAttempts.find((a) => a.attemptId === attemptId);
            if (!attempt) throw new Error('Critical Error: Booking attempt context lost.');

            // Success Updates
            freshShipment.dhlConfirmed = true;
            freshShipment.carrierShipmentId = carrierResult.carrierShipmentId || carrierResult.trackingNumber;
            freshShipment.dhlTrackingNumber = carrierResult.trackingNumber;
            freshShipment.status = 'created';
            freshShipment.organization = organizationId;

            attempt.status = 'succeeded';
            attempt.carrierShipmentId = carrierResult.trackingNumber;
            attempt.updatedAt = new Date();

            // Document Processing: Move base64 to File Storage
            if (carrierResult.labelUrl) {
                const doc = await CarrierDocumentService.uploadDocument('label', carrierResult.labelUrl, 'pdf', freshShipment.trackingNumber);
                freshShipment.documents.push(doc);
                freshShipment.labelUrl = doc.url;
            }
            if (carrierResult.invoiceUrl) {
                const doc = await CarrierDocumentService.uploadDocument('invoice', carrierResult.invoiceUrl, 'pdf', freshShipment.trackingNumber);
                freshShipment.documents.push(doc);
                freshShipment.invoiceUrl = doc.url;
            }

            // Accounting: Post Debit to Ledger
            const finalPrice = freshShipment.pricingSnapshot?.totalPrice ?? freshShipment.price ?? 0;
            if (finalPrice > 0 && organizationId) {
                await financeLedgerService.createLedgerEntry(organizationId, {
                    sourceRepo: 'Shipment',
                    sourceId: freshShipment._id,
                    amount: finalPrice,
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: `Charge for ${freshShipment.trackingNumber}`,
                    reference: freshShipment.trackingNumber,
                    createdBy: payingUser?._id,
                    metadata: { attemptId }
                });
            }

            await freshShipment.save();
            return { success: true, shipment: freshShipment };

        } catch (commitError) {
            logger.error('Commit Failure After Carrier Success:', commitError);
            await this.handleBookingFailure(shipment._id, attemptId, `Commit Failed: ${commitError.message}`);
            throw new Error(`Critical: Carrier booked shipment, but local database update failed. Manual intervention required.`);
        }
    }

    /**
     * Cross-references User and Org policies to authorize carrier usage.
     * @private
     */
    ensureCarrierAllowed({ carrierCode, organization, payingUser }) {
        const orgAllowed = Array.isArray(organization?.allowedCarriers) && organization.allowedCarriers.length > 0
            ? organization.allowedCarriers.map((c) => String(c).toUpperCase())
            : CarrierFactory.getAvailableCarriers().map((c) => c.code.toUpperCase());

        const agentAllowed = Array.isArray(payingUser?.agentPolicy?.allowedCarriers) && payingUser.agentPolicy.allowedCarriers.length > 0
            ? payingUser.agentPolicy.allowedCarriers.map((c) => String(c).toUpperCase())
            : orgAllowed;

        if (!orgAllowed.filter((code) => agentAllowed.includes(code)).includes(carrierCode)) {
            const err = new Error(`Carrier ${carrierCode} is restricted for this account.`);
            err.statusCode = 403;
            throw err;
        }
    }

    /**
     * Re-quotes and snapshots pricing immediately before booking.
     * @private
     * @business_rule This ensures the firm doesn't lose money due to rate fluctuations during 'draft' status.
     */
    async refreshPricingSnapshotForBooking({ shipment, carrierCode, payingUser, organization }) {
        const { Decimal } = require('decimal.js');
        const adapter = CarrierFactory.getAdapter(carrierCode);
        const quotes = await adapter.getRates(this.mapToCarrierPayload(shipment));

        if (!Array.isArray(quotes) || quotes.length === 0) throw new Error('No valid rates available for refresh.');

        const selectedQuote = quotes.find((q) => q.serviceCode === shipment.serviceCode) || quotes[0];
        const { markup, source } = PricingService.resolveMarkup(payingUser, organization, carrierCode);
        
        const snapshot = PricingService.createSnapshot(
            Number(selectedQuote.totalPrice || 0),
            markup,
            selectedQuote.currency || shipment.currency || 'KWD',
            source
        );

        // Re-attach optional services from original record
        const optionalServices = shipment.pricingSnapshot?.optionalServices || [];
        const optionalServicesTotal = optionalServices.reduce((sum, s) => sum.plus(new Decimal(s.totalPrice || 0)), new Decimal(0));

        snapshot.optionalServices = optionalServices;
        snapshot.optionalServicesTotal = Number(optionalServicesTotal.toFixed(3));
        snapshot.totalPrice = Number(new Decimal(snapshot.totalPrice).plus(optionalServicesTotal).toFixed(3));

        shipment.pricingSnapshot = snapshot;
        shipment.price = snapshot.totalPrice;
        await shipment.save();
    }

    /**
     * Updates attempt record upon failure.
     */
    async handleBookingFailure(shipmentId, attemptId, reason) {
        await Shipment.updateOne(
            { _id: shipmentId, 'bookingAttempts.attemptId': attemptId },
            {
                $set: {
                    'bookingAttempts.$.status': 'failed',
                    'bookingAttempts.$.error': reason,
                    'bookingAttempts.$.updatedAt': new Date()
                }
            }
        ).catch(e => logger.error('Failure Update Error:', e));
    }

    /**
     * Maps internal Shipment model to universal Carrier Payload format.
     * @private
     */
    mapToCarrierPayload(shipment) {
        const data = shipment.toObject();
        return {
            ...data,
            sender: data.origin,
            receiver: data.destination,
            user: data.user
        };
    }
}

module.exports = new ShipmentBookingService();
