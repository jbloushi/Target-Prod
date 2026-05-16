const { prisma } = require('../config/database');
const CarrierFactory = require('./CarrierFactory');
const PricingService = require('./pricing.service');
const CarrierDocumentService = require('./CarrierDocumentService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const financeLedgerService = require('./financeLedger.service');
const { getAssignedShippingAccess, normalizeCarrier } = require('./shippingAccess.service');

const buildInternalPricingSnapshot = (shipment) => ({
    ...(shipment.pricingSnapshot || {}),
    carrierRate: Number(shipment.costPrice || shipment.pricingSnapshot?.carrierRate || 0),
    totalPrice: Number(shipment.price || shipment.pricingSnapshot?.totalPrice || 0),
    currency: shipment.currency || shipment.pricingSnapshot?.currency || 'KWD',
    billingCurrency: shipment.currency || shipment.pricingSnapshot?.billingCurrency || shipment.pricingSnapshot?.currency || 'KWD',
    policySource: shipment.pricingSnapshot?.policySource || 'manual',
    rulesVersion: shipment.pricingSnapshot?.rulesVersion || 'manual-pricing-scaffold',
    rateType: 'INTERNAL',
    requiresManualPricing: true,
    internallyManaged: true
});

class ShipmentBookingService {
    normalizeCarrierIdentifier(value, fallback = null) {
        if (value === undefined || value === null || value === '') return fallback;
        return String(value);
    }

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
        const carrierCapabilities = CarrierFactory.getCarrierCapabilities(carrierCode) || {};
        const payingUser = shipment.user;
        const organization = shipment.organization;
        const organizationId = shipment.organizationId;

        // Ensure Carrier is enabled for this account
        this.ensureCarrierAllowed({ carrierCode, organization, payingUser, bookingUserRole });

        // Force a pricing refresh if the snapshot is expired or invalid
        if (!PricingService.validateSnapshot(shipment.pricingSnapshot) && carrierCapabilities.supportsExternalApi !== false) {
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
        let carrierAdapter;
        try {
            carrierAdapter = CarrierFactory.getAdapter(carrierCode);
            const payload = this.mapToCarrierPayload(shipment);
            
            // Integrate optional services passed from the controller
            if (optionalServiceCodes && optionalServiceCodes.length > 0) {
                payload.optionalServices = optionalServiceCodes;
            }

            try {
                carrierResult = await carrierAdapter.createShipment(payload, shipment.serviceCode);
            } catch (error) {
                if (error?.code === 'DUPLICATE_SHIPMENT') {
                    logger.warn(`Duplicate carrier shipment detected for ${shipment.trackingNumber}; attempting recovery via getStatus/getLabel.`);
                    carrierResult = await this.recoverExistingCarrierShipment({ adapter: carrierAdapter, shipment, fallbackError: error });
                } else {
                    throw error;
                }
            }
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
            const carrierTrackingNumber = this.normalizeCarrierIdentifier(carrierResult.trackingNumber, shipment.trackingNumber);
            const carrierShipmentId = this.normalizeCarrierIdentifier(carrierResult.carrierShipmentId, carrierTrackingNumber);

            freshAttempts[attemptIndex].carrierShipmentId = carrierTrackingNumber;
            freshAttempts[attemptIndex].updatedAt = new Date();

            const updateData = {
                dhlConfirmed: true,
                carrierShipmentId,
                dhlTrackingNumber: carrierTrackingNumber,
                status: 'booked',
                bookingAttempts: freshAttempts,
                documents: freshShipment.documents || []
            };

            if (carrierCapabilities.supportsExternalApi === false) {
                updateData.pricingSnapshot = buildInternalPricingSnapshot(freshShipment);
                updateData.history = [
                    ...(Array.isArray(freshShipment.history) ? freshShipment.history : []),
                    {
                        status: 'booked',
                        description: 'Awaiting Internal Processing',
                        source: 'platform',
                        timestamp: new Date(),
                        location: freshShipment.currentLocation || freshShipment.origin || null
                    }
                ];
            }

            // Document Processing: non-fatal upload (booking should succeed even if document storage fails)
            const tryAttachDocument = async (type, sourceValue, targetField) => {
                if (!sourceValue) return;
                try {
                    const doc = await CarrierDocumentService.uploadDocument(type, sourceValue, 'pdf', freshShipment.trackingNumber);
                    updateData.documents.push(doc);
                    updateData[targetField] = doc.url;
                } catch (docError) {
                    logger.warn(`Document upload skipped for ${freshShipment.trackingNumber} (${type}): ${docError.message}`);
                    // Only persist safe URL-like fallbacks; avoid writing raw/base64 blobs into URL DB fields.
                    const sourceText = typeof sourceValue === 'string' ? sourceValue.trim() : '';
                    if (/^https?:\/\//i.test(sourceText)) {
                        updateData[targetField] = updateData[targetField] || sourceText;
                    }
                }
            };

            if (carrierCode === 'OTE' && (!carrierResult.labelUrl || !carrierResult.awbUrl) && carrierShipmentId && typeof carrierAdapter?.getLabel === 'function') {
                try {
                    const pdfDocument = await carrierAdapter.getLabel([carrierShipmentId]);
                    carrierResult.labelUrl = carrierResult.labelUrl || pdfDocument;
                    carrierResult.awbUrl = carrierResult.awbUrl || pdfDocument;
                } catch (labelError) {
                    logger.warn(`OTE PDF fetch skipped for ${freshShipment.trackingNumber}: ${labelError.message}`);
                }
            }

            if (carrierCapabilities.supportsLabelGeneration !== false) {
                await tryAttachDocument('label', carrierResult.labelUrl, 'labelUrl');
                await tryAttachDocument('invoice', carrierResult.invoiceUrl, 'invoiceUrl');
                await tryAttachDocument('awb', carrierResult.awbUrl, 'awbUrl');
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
                    currency: finalizedShipment.currency || finalizedShipment.pricingSnapshot?.currency || 'KWD',
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: `Charge for ${finalizedShipment.trackingNumber}`,
                    reference: finalizedShipment.trackingNumber,
                    createdBy: payingUser?.id,
                    metadata: {
                        attemptId,
                        carrierCode: finalizedShipment.carrierCode,
                        currency: finalizedShipment.currency || finalizedShipment.pricingSnapshot?.currency || 'KWD',
                        fixedFeeApplied: finalizedShipment.carrierCode === 'OTE'
                    }
                });
            }

            return { success: true, shipment: finalizedShipment };

        } catch (commitError) {
            logger.error('Commit Failure After Carrier Success:', commitError);
            await this.handleBookingFailure(shipment.id, attemptId, `Commit Failed: ${commitError.message}`);
            throw new Error(`Critical: Carrier booked shipment, locally updated failed. Manual intervention required.`);
        }
    }

    async recoverExistingCarrierShipment({ adapter, shipment, fallbackError }) {
        try {
            const status = await adapter.getStatus({ barcode: shipment.trackingNumber });
            let normalized = adapter._normalizeShipmentResponse
                ? adapter._normalizeShipmentResponse(status || {})
                : {
                    carrierShipmentId: status?.id || status?.shipmentId || status?.packageId || shipment.trackingNumber,
                    trackingNumber: status?.barcode || shipment.trackingNumber,
                    rawResponse: status
                };

            const statusId = status?.id || status?.shipmentId || status?.packageId;
            if (!normalized.labelUrl && statusId && typeof adapter.getLabel === 'function') {
                try {
                    const label = await adapter.getLabel([statusId]);
                    normalized = { ...normalized, labelUrl: label };
                } catch (labelError) {
                    logger.warn(`Failed to recover OTE label for existing shipment ${shipment.trackingNumber}: ${labelError.message}`);
                }
            }

            return {
                ...normalized,
                trackingNumber: normalized?.trackingNumber || shipment.trackingNumber,
                carrierShipmentId: normalized?.carrierShipmentId || statusId || shipment.trackingNumber,
                recoveredFromDuplicate: true,
                recoveryMessage: fallbackError?.message
            };
        } catch (recoveryError) {
            throw fallbackError;
        }
    }

    /**
     * Cross-references User and Org policies to authorize carrier usage.
     * @private
     */
    ensureCarrierAllowed({ carrierCode, organization, payingUser, bookingUserRole }) {
        const normalizedCarrier = normalizeCarrier(carrierCode);
        if (['admin', 'manager', 'staff', 'accounting'].includes(String(bookingUserRole || '').toLowerCase())) {
            return;
        }
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

        const carrierPolicy = PricingService.resolveCarrierPricingPolicy(payingUser, carrierCode, selectedQuote.currency || shipment.currency || 'KWD');
        const rateCurrency = selectedQuote.currency || carrierPolicy.currency || shipment.currency || 'KWD';
        const carrierRate = PricingService.applyCarrierBasePricePolicy(Number(selectedQuote.totalPrice || 0), payingUser, carrierCode);
        const snapshot = PricingService.createSnapshot(
            carrierRate,
            markup,
            rateCurrency,
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
        const carrierCode = String(shipment.carrierCode || '').toUpperCase();
        const isOteShipment = carrierCode === 'OTE' || carrierCode === 'LOGESTECHS';
        const storedCodAmount = Number(shipment.codAmount ?? shipment.cod ?? 0);
        const codAmount = isOteShipment ? (storedCodAmount > 0 ? storedCodAmount : 25) : storedCodAmount;

        return {
            ...shipment,
            ...(isOteShipment ? {
                shipmentType: 'COD',
                codAmount,
                cod: String(codAmount),
                codCurrency: shipment.codCurrency || 'AED',
                codStatus: shipment.codStatus || 'pending'
            } : {}),
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
            insuredValue: origin.insuredValue,
            incoterm: origin.incoterm || shipment.incoterm || 'DAP',
            packagingType: origin.packagingType || shipment.packagingType || 'user'
        };
    }
}

module.exports = new ShipmentBookingService();
