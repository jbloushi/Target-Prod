const { prisma } = require('../config/database');
const CarrierFactory = require('./CarrierFactory');
const PricingService = require('./pricing.service');
const CarrierDocumentService = require('./CarrierDocumentService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const financeLedgerService = require('./financeLedger.service');
const { getAssignedShippingAccess, normalizeCarrier } = require('./shippingAccess.service');
const ShipmentDraftService = require('./ShipmentDraftService');

class ShipmentBookingService {

    /**
     * Executes the full booking workflow for a single shipment.
     * @param {string} trackingNumber - Internal tracking number.
     * @param {string|null} [overrideCarrierCode=null] - Optional carrier force.
     * @param {string[]} [optionalServiceCodes=[]] - Optional services selected at booking time.
     * @returns {Promise<Object>} { success, shipment, message }
     */
    async bookShipment(trackingNumber, overrideCarrierCode = null, optionalServiceCodes = [], bookingUserRole = null) {
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { user: true, organization: true }
        });
        
        if (!shipment) throw new Error('Shipment record not found');

        const carrierCode = String(overrideCarrierCode || shipment.carrierCode || 'DGR').toUpperCase();
        const payingUser = shipment.user;
        const organization = shipment.organization;
        const organizationId = shipment.organizationId;

        // Ensure Carrier is enabled for this account
        this.ensureCarrierAllowed({ carrierCode, organization, payingUser });

        // Force a pricing refresh if the snapshot is expired or invalid
        if (!PricingService.validateSnapshot(shipment.pricingSnapshot)) {
            await this.refreshPricingSnapshotForBooking({ shipment, carrierCode, payingUser, organization });
        }

        const price = shipment.pricingSnapshot?.totalPrice ?? shipment.price ?? 0;

        // Financial Gate: Credit Check
        // A null/undefined creditLimit means unlimited credit — skip the check entirely.
        // Admin and staff roles bypass the credit gate entirely (they have override authority).
        // Check price against the org's credit limit directly (not net of balance).
        const isBypassRole = ['admin', 'staff', 'accounting'].includes(bookingUserRole);
        if (!isBypassRole && organizationId && organization?.creditLimit != null) {
            if (price > 0 && price > organization.creditLimit) {
                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: {
                        financeHold: {
                            status: true,
                            reason: 'Shipment price exceeds organization credit limit',
                            checkedAt: new Date(),
                            availableCredit: organization.creditLimit,
                            requiredAmount: price
                        }
                    }
                });
                throw new Error('Insufficient available credit to finalize booking.');
            }
        }

        // Idempotency: Prevent overlapping requests
        const bookingAttempts = Array.isArray(shipment.bookingAttempts) ? shipment.bookingAttempts : [];
        const activeAttempt = bookingAttempts.find((a) =>
            a.status === 'succeeded' || (a.status === 'pending' && new Date() - new Date(a.createdAt) < 60000)
        );

        if (activeAttempt) {
            if (activeAttempt.status === 'succeeded') return { success: true, shipment, message: 'Shipment already booked.' };
            throw new Error('A booking request is currently being processed by the carrier. Please wait.');
        }

        const attemptId = crypto.randomUUID();
        const updatedAttempts = [
            ...bookingAttempts,
            { attemptId, status: 'pending', createdAt: new Date() }
        ];

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: { bookingAttempts: updatedAttempts }
        });

        let carrierResult;
        try {
            const adapter = CarrierFactory.getAdapter(carrierCode);
            const payload = this.mapToCarrierPayload(shipment);
            
            // Integrate optional services passed from the controller
            if (optionalServiceCodes && optionalServiceCodes.length > 0) {
                const requestedCodes = optionalServiceCodes
                    .map((code) => String(code || '').toUpperCase())
                    .filter((code) => code && !/fuel/i.test(code));

                // DHL best-practice: validate requested VAS against current rating/capability response.
                const bookingQuotes = await adapter.getRates(payload);
                const selectedQuote = bookingQuotes.find((q) => q.serviceCode === shipment.serviceCode) || bookingQuotes[0];
                const availableOptionalServices = (selectedQuote?.optionalServices || [])
                    .filter((service) => !/fuel/i.test(`${service.serviceCode || ''} ${service.serviceName || ''}`));

                ShipmentDraftService.assertOptionalServicesAreDhlValid(availableOptionalServices, requestedCodes);
                payload.optionalServices = requestedCodes;
            }

            carrierResult = await adapter.createShipment(payload, shipment.serviceCode);
        } catch (error) {
            await this.handleBookingFailure(shipment.id, attemptId, error.message);
            throw error;
        }

        try {
            // Success Updates
            const freshShipment = await prisma.shipment.findUnique({ where: { id: shipment.id } });
            const freshAttempts = Array.isArray(freshShipment.bookingAttempts) ? freshShipment.bookingAttempts : [];
            const attemptIndex = freshAttempts.findIndex((a) => a.attemptId === attemptId);
            if (attemptIndex === -1) throw new Error('Critical Error: Booking attempt context lost.');

            freshAttempts[attemptIndex].status = 'succeeded';
            freshAttempts[attemptIndex].carrierShipmentId = carrierResult.trackingNumber;
            freshAttempts[attemptIndex].updatedAt = new Date();

            const updateData = {
                dhlConfirmed: true,
                carrierShipmentId: carrierResult.carrierShipmentId || carrierResult.trackingNumber,
                dhlTrackingNumber: carrierResult.trackingNumber,
                status: 'booked',
                bookingAttempts: freshAttempts,
                documents: freshShipment.documents || []
            };

            // Document Processing: Move base64 to File Storage
            if (carrierResult.labelUrl) {
                const doc = await CarrierDocumentService.uploadDocument('label', carrierResult.labelUrl, 'pdf', freshShipment.trackingNumber);
                updateData.documents.push(doc);
                updateData.labelUrl = doc.url;
            }
            if (carrierResult.invoiceUrl) {
                const doc = await CarrierDocumentService.uploadDocument('invoice', carrierResult.invoiceUrl, 'pdf', freshShipment.trackingNumber);
                updateData.documents.push(doc);
                updateData.invoiceUrl = doc.url;
            }

            // Update in DB
            const finalizedShipment = await prisma.shipment.update({
                where: { id: shipment.id },
                data: updateData
            });

            // Accounting: Post Debit to Ledger
            const finalPrice = finalizedShipment.pricingSnapshot?.totalPrice ?? finalizedShipment.price ?? 0;
            if (finalPrice > 0 && organizationId) {
                await financeLedgerService.createLedgerEntry(organizationId, {
                    sourceRepo: 'Shipment',
                    sourceId: finalizedShipment.id,
                    amount: finalPrice,
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: `Charge for ${finalizedShipment.trackingNumber}`,
                    reference: finalizedShipment.trackingNumber,
                    createdBy: payingUser?.id,
                    metadata: { attemptId }
                });
            }

            return { success: true, shipment: finalizedShipment };

        } catch (commitError) {
            logger.error('Commit Failure After Carrier Success:', commitError);
            await this.handleBookingFailure(shipment.id, attemptId, `Commit Failed: ${commitError.message}`);
            throw new Error(`Critical: Carrier booked shipment, locally updated failed. Manual intervention required.`);
        }
    }

    /**
     * Cross-references User and Org policies to authorize carrier usage.
     * @private
     */
    ensureCarrierAllowed({ carrierCode, organization, payingUser }) {
        const normalizedCarrier = normalizeCarrier(carrierCode);
        const policy = payingUser?.agentPolicy || {};
        const hasExplicitUserAssignment = Boolean(policy.shippingAccess)
            || (Array.isArray(policy.allowedCarriers) && policy.allowedCarriers.length === 1)
            || Boolean(payingUser?.carrierConfig?.preferredCarrier);

        if (hasExplicitUserAssignment) {
            const assignedAccess = getAssignedShippingAccess(payingUser);
            if (assignedAccess.carrierCode !== normalizedCarrier) {
                const err = new Error(`Carrier ${normalizedCarrier} is restricted for this account.`);
                err.statusCode = 403;
                throw err;
            }
            return;
        }

        const orgAllowed = Array.isArray(organization?.allowedCarriers) && organization.allowedCarriers.length > 0
            ? organization.allowedCarriers.map((c) => String(c).toUpperCase())
            : CarrierFactory.getAvailableCarriers().map((c) => c.code.toUpperCase());

        const agentAllowed = Array.isArray(payingUser?.agentPolicy?.allowedCarriers) && payingUser.agentPolicy.allowedCarriers.length > 0
            ? payingUser.agentPolicy.allowedCarriers.map((c) => String(c).toUpperCase())
            : orgAllowed;

        if (!orgAllowed.filter((code) => agentAllowed.includes(code)).includes(normalizedCarrier)) {
            const err = new Error(`Carrier ${normalizedCarrier} is restricted for this account.`);
            err.statusCode = 403;
            throw err;
        }
    }

    /**
     * Re-quotes and snapshots pricing immediately before booking.
     * @private
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

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                pricingSnapshot: snapshot,
                price: snapshot.totalPrice
            }
        });
    }

    /**
     * Updates attempt record upon failure.
     */
    async handleBookingFailure(shipmentId, attemptId, reason) {
        try {
            const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
            const attempts = Array.isArray(shipment.bookingAttempts) ? shipment.bookingAttempts : [];
            const index = attempts.findIndex(a => a.attemptId === attemptId);
            
            if (index !== -1) {
                attempts[index].status = 'failed';
                attempts[index].error = reason;
                attempts[index].updatedAt = new Date();
                
                await prisma.shipment.update({
                    where: { id: shipmentId },
                    data: { bookingAttempts: attempts }
                });
            }
        } catch (e) {
            logger.error('Failure Update Error:', e);
        }
    }

    /**
     * Maps internal Shipment model to universal Carrier Payload format.
     * @private
     */
    mapToCarrierPayload(shipment) {
        const origin = shipment.origin || {};
        return {
            ...shipment,
            sender: origin,
            receiver: shipment.destination,
            // Flatten carrier-specific fields from origin
            shipperAccount: origin.shipperAccount,
            payerOfVat: origin.payerOfVat,
            gstPaid: origin.gstPaid,
            palletCount: origin.palletCount,
            packageMarks: origin.packageMarks,
            labelSettings: origin.labelSettings,
            dangerousGoods: origin.dangerousGoods,
            incoterm: origin.incoterm || shipment.incoterm || 'DAP',
            packagingType: origin.packagingType || shipment.packagingType || 'user'
        };
    }
}

module.exports = new ShipmentBookingService();
