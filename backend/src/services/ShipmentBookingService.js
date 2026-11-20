const { prisma } = require('../config/database');
const CarrierFactory = require('./CarrierFactory');
const PricingService = require('./pricing.service');
const CarrierDocumentService = require('./CarrierDocumentService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const financeLedgerService = require('./financeLedger.service');
const { getAssignedShippingAccess, normalizeCarrier } = require('./shippingAccess.service');
const { validateMinimumShipmentFields, buildValidationError, normalizeCarrierCode } = require('./carrierMinimumValidation.service');
const diagnosticAttemptLog = require('./diagnosticAttemptLog.service');

const TERMINAL_UNBOOKABLE_STATUSES = new Set(['cancelled', 'delivered', 'returned', 'rto_in_transit']);

const buildInternalPricingSnapshot = (shipment) => {
    const carrierRate = Number(shipment.costPrice ?? shipment.pricingSnapshot?.carrierRate ?? 0);
    const totalPrice = Number(shipment.price ?? shipment.pricingSnapshot?.totalPrice ?? 0);
    const markup = Number(shipment.markupAmount ?? shipment.pricingSnapshot?.markup ?? Math.max(0, totalPrice - carrierRate));
    return {
        ...(shipment.pricingSnapshot || {}),
        carrierRate,
        markup,
        totalPrice,
        currency: shipment.currency || shipment.pricingSnapshot?.currency || 'KWD',
        billingCurrency: shipment.currency || shipment.pricingSnapshot?.billingCurrency || shipment.pricingSnapshot?.currency || 'KWD',
        policySource: shipment.pricingSnapshot?.policySource || 'manual',
        rulesVersion: shipment.pricingSnapshot?.rulesVersion || 'manual-pricing-scaffold',
        rateType: 'INTERNAL',
        requiresManualPricing: true,
        internallyManaged: true
    };
};

class ShipmentBookingService {
    normalizeCarrierIdentifier(value, fallback = null) {
        if (value === undefined || value === null || value === '') return fallback;
        return String(value);
    }

    /**
    /**
     * Executes the full booking workflow for a single shipment synchronously.
     * @param {string} trackingNumber - Internal tracking number.
     * @param {string|null} [overrideCarrierCode=null] - Optional carrier force.
     * @param {string[]} [optionalServiceCodes=[]] - Optional services selected at booking time.
     * @returns {Promise<Object>} { success, shipment, message }
     */
    async bookShipment(trackingNumber, overrideCarrierCode = null, optionalServiceCodes = [], bookingUserRole = null, options = {}) {
        const prep = await this._prepareBooking(trackingNumber, overrideCarrierCode, optionalServiceCodes, bookingUserRole, options);
        if (prep.alreadyBooked && !options?.force) {
            return { success: true, outcome: 'booked', shipment: prep.shipment, message: 'Shipment already booked.' };
        }
        return await this._executeCarrierBooking(prep);
    }

    /**
     * Executes the booking workflow asynchronously via durable job queue.
     * Returns immediately with 202 status and attempt/job ID.
     */
    async bookShipmentAsync(trackingNumber, overrideCarrierCode = null, optionalServiceCodes = [], bookingUserRole = null) {
        const prep = await this._prepareBooking(trackingNumber, overrideCarrierCode, optionalServiceCodes, bookingUserRole);
        if (prep.alreadyBooked) {
            return { success: true, outcome: 'booked', status: 'succeeded', jobId: prep.attemptId, shipment: prep.shipment, message: 'Shipment already booked.' };
        }

        const jobQueue = require('./queue/jobQueue');
        await jobQueue.enqueue('carrier_dispatch', {
            trackingNumber,
            carrierCode: prep.carrierCode,
            optionalServiceCodes,
            bookingUserRole,
            attemptId: prep.attemptId
        }, {
            jobId: prep.attemptId,
            maxRetries: 3,
            backoffMs: 5000
        });

        return {
            success: true,
            outcome: 'accepted',
            status: 'processing',
            jobId: prep.attemptId,
            trackingNumber,
            carrierCode: prep.carrierCode,
            message: 'Carrier booking initiated in background'
        };
    }

    /**
     * Background worker entry point for carrier_dispatch queue jobs.
     */
    async executeCarrierDispatchJob(payload) {
        const { trackingNumber, carrierCode, optionalServiceCodes, bookingUserRole, attemptId } = payload;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { user: true, organization: true }
        });

        if (!shipment) throw new Error(`Shipment ${trackingNumber} not found for carrier dispatch`);

        const normalizedCarrier = normalizeCarrierCode(carrierCode || shipment.carrierCode || 'DGR');
        const attempts = Array.isArray(shipment.bookingAttempts) ? shipment.bookingAttempts : [];
        const attemptAlreadySucceeded = attempts.some(a => a.attemptId === attemptId && a.status === 'succeeded');
        const alreadyBooked = shipment.status === 'booked' && Boolean(
            shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.labelUrl || shipment.awbUrl
        );
        if (attemptAlreadySucceeded || alreadyBooked) {
            return { success: true, outcome: 'booked', shipment, message: 'Shipment already booked.' };
        }

        if (TERMINAL_UNBOOKABLE_STATUSES.has(String(shipment.status || '').toLowerCase())) {
            const reason = `Cannot dispatch booking for shipment in '${shipment.status}' status.`;
            await this.handleBookingFailure(shipment.id, attemptId, reason, 'failed');
            const err = new Error(reason);
            err.statusCode = 409;
            throw err;
        }

        const carrierCapabilities = CarrierFactory.getCarrierCapabilities(normalizedCarrier) || {};
        return await this._executeCarrierBooking({
            shipment,
            carrierCode: normalizedCarrier,
            optionalServiceCodes: optionalServiceCodes || [],
            attemptId,
            payingUser: shipment.user,
            organization: shipment.organization,
            organizationId: shipment.organizationId,
            carrierCapabilities
        });
    }

    /**
     * Validates shipment, policies, credits, and records pending attempt.
     * @private
     */
    async _prepareBooking(trackingNumber, overrideCarrierCode = null, optionalServiceCodes = [], bookingUserRole = null, options = {}) {
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { user: true, organization: true }
        });
        
        if (!shipment) throw new Error('Shipment record not found');

        const carrierCode = normalizeCarrierCode(overrideCarrierCode || shipment.carrierCode || 'DGR');
        const carrierCapabilities = CarrierFactory.getCarrierCapabilities(carrierCode) || {};
        const payingUser = shipment.user;
        const organization = shipment.organization;
        const organizationId = shipment.organizationId;

        if (TERMINAL_UNBOOKABLE_STATUSES.has(String(shipment.status || '').toLowerCase())) {
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode,
                action: 'CARRIER_BOOK',
                status: 'VALIDATION_ERROR',
                durationMs: 0,
                message: `Cannot book shipment in '${shipment.status}' status.`,
                organizationId
            });
            const err = new Error(`Cannot book shipment in '${shipment.status}' status.`);
            err.statusCode = 400;
            err.isValidationError = true;
            err.field = 'status';
            err.errors = [{ field: 'status', step: 1, message: err.message }];
            throw err;
        }

        // Ensure Carrier is enabled for this account
        try {
            this.ensureCarrierAllowed({ carrierCode, organization, payingUser, bookingUserRole });
        } catch (accessErr) {
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode,
                action: 'CARRIER_BOOK',
                status: 'FAILED',
                durationMs: 0,
                message: accessErr.message,
                organizationId
            });
            throw accessErr;
        }

        // Bar-minimum carrier validation before booking
        const validation = validateMinimumShipmentFields({
            ...shipment,
            carrierCode
        }, { carrierCode });
        if (!validation.valid) {
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode,
                action: 'CARRIER_BOOK',
                status: 'VALIDATION_ERROR',
                durationMs: 0,
                message: validation.errors[0]?.message || 'Validation failed',
                organizationId,
                details: { errors: validation.errors }
            });
            throw buildValidationError(validation);
        }

        // Idempotency: Prevent overlapping requests unless explicitly forced
        // Check 60s cooldown, stale pending reconciliation, and already-booked status BEFORE refreshing pricing snapshot or checking credit
        const bookingAttempts = Array.isArray(shipment.bookingAttempts) ? shipment.bookingAttempts : [];
        if (!options?.force) {
            const activeAttempt = bookingAttempts.find((a) =>
                a.status === 'succeeded' || a.status === 'pending'
            );

            if (activeAttempt) {
                const hasRealDocs = Boolean(
                    shipment.labelUrl ||
                    shipment.awbUrl ||
                    shipment.carrierShipmentId ||
                    shipment.dhlTrackingNumber ||
                    shipment.status === 'booked'
                );
                if (activeAttempt.status === 'succeeded' && hasRealDocs) {
                    return { alreadyBooked: true, shipment, attemptId: activeAttempt.attemptId, carrierCode };
                }
                if (activeAttempt.status === 'pending' && new Date() - new Date(activeAttempt.createdAt) < 60000) {
                    const err = new Error('A booking request is currently being processed by the carrier. Please wait.');
                    err.statusCode = 409;
                    throw err;
                }
                if (activeAttempt.status === 'pending') {
                    const reconciliation = await this.reconcileBookingAttempt(
                        trackingNumber,
                        activeAttempt.attemptId,
                        carrierCode
                    );
                    if (reconciliation.outcome === 'booked') {
                        return {
                            alreadyBooked: true,
                            shipment: reconciliation.shipment,
                            attemptId: activeAttempt.attemptId,
                            carrierCode
                        };
                    }
                    const error = new Error('Previous carrier booking outcome is uncertain and requires reconciliation before retrying.');
                    error.statusCode = 409;
                    error.bookingOutcome = 'reconciliation_required';
                    throw error;
                }
            }

            if (shipment.status === 'booked' && (shipment.labelUrl || shipment.awbUrl || shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.dhlConfirmed)) {
                const lastSucceededAttempt = [...bookingAttempts].reverse().find(a => a.status === 'succeeded');
                return {
                    alreadyBooked: true,
                    shipment,
                    attemptId: lastSucceededAttempt?.attemptId || shipment.carrierShipmentId || 'already-booked',
                    carrierCode
                };
            }
        }

        // Force a pricing refresh if the snapshot is expired or invalid
        if (!PricingService.validateSnapshot(shipment.pricingSnapshot) && carrierCapabilities.supportsExternalApi !== false) {
            await this.refreshPricingSnapshotForBooking({ shipment, carrierCode, payingUser, organization });
        }

        const price = shipment.pricingSnapshot?.totalPrice ?? shipment.price ?? 0;
        const shipmentCurrency = shipment.currency || shipment.pricingSnapshot?.currency || (carrierCode === 'OTE' ? 'AED' : 'KWD');

        // Financial Gate: Credit Check against net available credit: creditLimit - netAR (F4)
        const isBypassRole = ['admin', 'staff', 'accounting'].includes(String(bookingUserRole || payingUser?.role || '').toLowerCase());
        if (!isBypassRole && organizationId) {
            let org = organization;
            if (!org || org.balance === undefined || org.unappliedBalance === undefined || org.creditLimit === undefined || !org.currency) {
                org = await prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: { id: true, creditLimit: true, balance: true, unappliedBalance: true, currency: true }
                });
            }

            const currencyRateService = require('./currencyRate.service');
            const orgCurrency = org?.currency || 'KWD';
            const creditLimit = (org?.creditLimit !== null && org?.creditLimit !== undefined)
                ? Number(org.creditLimit)
                : Number(payingUser?.creditLimit || 0);
            const balance = Number(org?.balance || 0);
            const unappliedBalance = Number(org?.unappliedBalance || 0);
            const isPrepaid = creditLimit === 0;
            const netAR = Math.max(0, balance - unappliedBalance);
            const availableCredit = isPrepaid
                ? Math.max(0, unappliedBalance - Math.max(0, balance))
                : Math.max(0, creditLimit - netAR);

            const priceInOrgCurrency = Number(
                currencyRateService.convert(price, shipmentCurrency, orgCurrency)
                    .toFixed(orgCurrency === 'KWD' ? 3 : 2)
            );

            const hasSufficientCredit = isPrepaid
                ? (unappliedBalance >= priceInOrgCurrency && availableCredit >= priceInOrgCurrency)
                : (availableCredit >= priceInOrgCurrency);

            if (price > 0 && !hasSufficientCredit) {
                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: {
                        financeHold: {
                            status: true,
                            reason: isPrepaid
                                ? 'Insufficient prepaid unapplied balance to book shipment'
                                : 'Shipment price exceeds organization available credit limit',
                            checkedAt: new Date(),
                            availableCredit: Number(availableCredit.toFixed(3)),
                            creditLimit,
                            currentBalance: balance,
                            unappliedBalance,
                            requiredAmount: priceInOrgCurrency,
                            currency: orgCurrency
                        }
                    }
                });
                throw new Error('Insufficient available credit to finalize booking.');
            }
        }

        const attemptId = crypto.randomUUID();
        const acceptedAt = new Date();
        const updatedAttempts = [
            ...bookingAttempts,
            { attemptId, status: 'pending', outcome: 'accepted', createdAt: acceptedAt, acceptedAt }
        ];

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: { bookingAttempts: updatedAttempts }
        });

        return {
            alreadyBooked: false,
            shipment,
            carrierCode,
            optionalServiceCodes,
            attemptId,
            payingUser,
            organization,
            organizationId,
            carrierCapabilities
        };
    }

    /**
     * Executes the carrier API call, uploads documents, persists DB status, and posts ledger entries.
     * @private
     */
    async _executeCarrierBooking({ shipment, carrierCode, optionalServiceCodes, attemptId, payingUser, organization, organizationId, carrierCapabilities }) {
        const bookingStart = Date.now();
        let carrierResult;
        let carrierAdapter;
        try {
            const isTest = shipment.pricingSnapshot?.isTest === true ||
                           shipment.pricingSnapshot?.environment === 'test' ||
                           shipment.isTest === true ||
                           shipment.environment === 'test' ||
                           (shipment.metadata && (shipment.metadata.isTest === true || shipment.metadata.environment === 'test'));
            const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || shipment.environment || 'production');
            carrierAdapter = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
            const payload = this.mapToCarrierPayload(shipment);
            payload.isTest = isTest;
            payload.environment = environment;
            
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
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode,
                action: 'CARRIER_BOOK',
                status: 'FAILED',
                durationMs: Date.now() - bookingStart,
                message: error.message || 'Carrier booking failed',
                organizationId,
                details: { attemptId, code: error.code || null }
            });
            error.bookingOutcome = 'failed';
            throw error;
        }

        try {
            // Success Updates
            const freshShipment = await prisma.shipment.findUnique({ where: { id: shipment.id } });
            const freshAttempts = Array.isArray(freshShipment.bookingAttempts) ? freshShipment.bookingAttempts : [];
            const attemptIndex = freshAttempts.findIndex((a) => a.attemptId === attemptId);
            if (attemptIndex === -1) throw new Error('Critical Error: Booking attempt context lost.');

            freshAttempts[attemptIndex].status = 'succeeded';
            freshAttempts[attemptIndex].outcome = 'booked';
            const carrierTrackingNumber = this.normalizeCarrierIdentifier(carrierResult.trackingNumber, shipment.trackingNumber);
            const carrierShipmentId = this.normalizeCarrierIdentifier(carrierResult.carrierShipmentId, carrierTrackingNumber);

            freshAttempts[attemptIndex].carrierShipmentId = carrierTrackingNumber;
            freshAttempts[attemptIndex].updatedAt = new Date();

            let docsArray = [];
            const legacyDocumentsMetadata = !Array.isArray(freshShipment.documents) &&
                freshShipment.documents && typeof freshShipment.documents === 'object'
                ? { ...freshShipment.documents }
                : null;
            if (Array.isArray(freshShipment.documents)) {
                docsArray = [...freshShipment.documents];
            } else if (Array.isArray(freshShipment.documents?.attachments)) {
                docsArray = [...freshShipment.documents.attachments];
            } else if (typeof freshShipment.documents === 'string') {
                try {
                    const parsed = JSON.parse(freshShipment.documents);
                    if (Array.isArray(parsed)) docsArray = parsed;
                } catch {}
            }

            const updateData = {
                dhlConfirmed: true,
                carrierShipmentId,
                dhlTrackingNumber: carrierTrackingNumber,
                status: 'booked',
                bookingAttempts: freshAttempts,
                documents: docsArray
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
                    const uploadedDoc = await CarrierDocumentService.uploadDocument(type, sourceValue, 'pdf', freshShipment.trackingNumber);
                    const doc = type === 'target_shipment_receipt'
                        ? { ...uploadedDoc, receiptVersion: 2 }
                        : uploadedDoc;
                    if (!Array.isArray(updateData.documents)) {
                        updateData.documents = [];
                    }
                    updateData.documents.push(doc);
                    if (targetField) updateData[targetField] = doc.url;
                } catch (docError) {
                    logger.warn(`Document upload skipped for ${freshShipment.trackingNumber} (${type}): ${docError.message}`);
                    const sourceText = typeof sourceValue === 'string' ? sourceValue.trim() : '';
                    if (sourceText && targetField) {
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
                await tryAttachDocument('receipt', carrierResult.receiptUrl, null);

                // If carrier did not return a separate commercial invoice, generate compliant customs invoice fallback
                // Skip for OTE / LogesTechs, SMSA, and document-only shipments (customs invoice not required)
                const requiresInvoice = !['OTE', 'LOGESTECHS', 'SMSA', 'SMSAEXPRESS'].includes(carrierCode) && !freshShipment.isDocument && freshShipment.shipmentType !== 'documents';
                const { generateCarrierInvoicePdf } = require('../utils/carrierPdfMock');
                const carrierName = carrierCode === 'DGR'
                    ? 'DGR'
                    : (carrierCode === 'DGR2'
                        ? 'DHL'
                        : (carrierCode === 'FEDEX'
                            ? 'FedEx'
                            : (carrierCode === 'ARAMEX'
                                ? 'Aramex'
                                : (carrierCode === 'SMSA'
                                    ? 'SMSA Express'
                                    : (carrierCode === 'OTE' ? 'OTE / LogesTechs' : carrierCode)))));

                if (!updateData.invoiceUrl && requiresInvoice) {
                    try {
                        const invBase64 = generateCarrierInvoicePdf(
                            { ...freshShipment, dhlTrackingNumber: carrierTrackingNumber, carrierShipmentId },
                            carrierName
                        );
                        await tryAttachDocument('invoice', invBase64, 'invoiceUrl');
                    } catch (invErr) {
                        logger.warn(`Fallback invoice generation skipped for ${freshShipment.trackingNumber}: ${invErr.message}`);
                    }
                }

            }

            // Every booked shipment gets its own Target-branded receipt, even when the
            // carrier also provides a separate receipt or does not generate documents.
            const existingTargetReceipt = [...docsArray, ...(Array.isArray(updateData.documents) ? updateData.documents : [])]
                .find(doc => String(doc?.type || '').toLowerCase() === 'target_shipment_receipt');
            const legacyTargetReceipt = legacyDocumentsMetadata?.targetShipmentReceipt;
            const hasTargetReceipt = Number(existingTargetReceipt?.receiptVersion || legacyTargetReceipt?.receiptVersion || 0) >= 2;
            if (!hasTargetReceipt) {
                try {
                    const { generateTargetShipmentReceiptPdf } = require('../utils/carrierPdfMock');
                    const targetReceiptCarrierName = ['INTERNAL', 'MANUAL'].includes(String(carrierCode).toUpperCase())
                        ? 'Target Logistics'
                        : (carrierCode === 'DGR' ? 'DHL Express' : (carrierCode === 'SMSA' ? 'SMSA Express' : carrierCode));
                    const receiptBase64 = generateTargetShipmentReceiptPdf(
                        { ...freshShipment, dhlTrackingNumber: carrierTrackingNumber, carrierShipmentId },
                        targetReceiptCarrierName
                    );
                    await tryAttachDocument('target_shipment_receipt', receiptBase64, null);
                } catch (rcptErr) {
                    logger.warn(`Target shipment receipt generation skipped for ${freshShipment.trackingNumber}: ${rcptErr.message}`);
                }
            }

            if (legacyDocumentsMetadata) {
                const attachedDocuments = Array.isArray(updateData.documents) ? updateData.documents : [];
                const targetReceipt = attachedDocuments.find(doc => String(doc?.type || '').toLowerCase() === 'target_shipment_receipt');
                updateData.documents = {
                    ...legacyDocumentsMetadata,
                    attachments: attachedDocuments,
                    ...(targetReceipt ? { targetShipmentReceipt: targetReceipt, targetShipmentReceiptUrl: targetReceipt.url } : {})
                };
            }

            // Atomic DB Transaction (DB-01): Persist shipment status update + financial ledger entries together
            const executeBookingCommit = async (tx) => {
                const preFinalPrice = updateData.pricingSnapshot?.totalPrice ?? freshShipment.pricingSnapshot?.totalPrice ?? freshShipment.price ?? 0;
                const preCarrierCost = updateData.pricingSnapshot?.carrierRate ?? freshShipment.pricingSnapshot?.carrierRate ?? freshShipment.costPrice ?? 0;
                const rawMarkup = updateData.pricingSnapshot?.markup ?? freshShipment.pricingSnapshot?.markup ?? freshShipment.markupAmount ?? null;
                const preMarkupAmount = (rawMarkup !== null && rawMarkup !== undefined && Number.isFinite(Number(rawMarkup)))
                    ? Number(rawMarkup)
                    : (Number(preFinalPrice) > 0 ? Number(Math.max(0, Number(preFinalPrice) - Number(preCarrierCost || 0)).toFixed(3)) : null);

                if (Number(preFinalPrice) > 0) {
                    updateData.price = Number(preFinalPrice);
                    updateData.remainingBalance = freshShipment.paid
                        ? 0
                        : Math.max(0, Number((Number(preFinalPrice) - Number(freshShipment.totalPaid || 0)).toFixed(4)));
                }
                if (Number.isFinite(Number(preCarrierCost)) && (Number(preCarrierCost) > 0 || updateData.pricingSnapshot?.carrierRate !== undefined || freshShipment.pricingSnapshot?.carrierRate !== undefined)) {
                    updateData.costPrice = Number(preCarrierCost);
                }
                if (preMarkupAmount !== null && preMarkupAmount !== undefined && Number.isFinite(preMarkupAmount)) {
                    updateData.markupAmount = Number(preMarkupAmount);
                }

                const updatedShipment = await tx.shipment.update({
                    where: { id: shipment.id },
                    data: updateData
                });

                const finalPrice = Number(updatedShipment.pricingSnapshot?.totalPrice ?? updatedShipment.price ?? preFinalPrice ?? 0);
                const carrierCost = Number(updatedShipment.pricingSnapshot?.carrierRate ?? updatedShipment.costPrice ?? preCarrierCost ?? 0);
                const billingCurrency = updatedShipment.currency || updatedShipment.pricingSnapshot?.currency || 'KWD';

                let chargeEntry = null;
                if (finalPrice > 0 && organizationId) {
                    chargeEntry = await financeLedgerService.createLedgerEntry(organizationId, {
                        sourceRepo: 'Shipment',
                        sourceId: updatedShipment.id,
                        amount: finalPrice,
                        currency: billingCurrency,
                        entryType: 'DEBIT',
                        category: 'SHIPMENT_CHARGE',
                        description: `Charge for ${updatedShipment.trackingNumber}`,
                        reference: updatedShipment.trackingNumber,
                        createdBy: payingUser?.id,
                        metadata: {
                            attemptId,
                            carrierCode: updatedShipment.carrierCode,
                            costPrice: carrierCost,
                            currency: billingCurrency,
                            fixedFeeApplied: updatedShipment.carrierCode === 'OTE'
                        }
                    }, tx);

                    // Auto-generate official Invoice in Finance Module if not already created
                    if (chargeEntry?.id && typeof tx.invoice?.findUnique === 'function' && typeof tx.invoice?.create === 'function') {
                        try {
                            const invoiceNumber = `INV-SHP-${updatedShipment.trackingNumber}`;
                            const existingInvoice = await tx.invoice.findUnique({ where: { invoiceNumber } });
                            if (!existingInvoice) {
                                const now = new Date();
                                const isPaid = Boolean(updatedShipment.paid);
                                await tx.invoice.create({
                                    data: {
                                        invoiceNumber,
                                        organizationId,
                                        periodStart: now,
                                        periodEnd: now,
                                        subtotal: finalPrice,
                                        vat: 0,
                                        total: finalPrice,
                                        currency: billingCurrency,
                                        status: isPaid ? 'paid' : 'issued',
                                        paidAt: isPaid ? now : null,
                                        notes: `Platform Consignment Tax Invoice (${updatedShipment.trackingNumber} - ${updatedShipment.carrierCode})`,
                                        createdById: payingUser?.id || updatedShipment.userId,
                                        lines: {
                                            create: {
                                                shipmentId: updatedShipment.id,
                                                ledgerEntryId: chargeEntry.id,
                                                trackingNumber: updatedShipment.trackingNumber,
                                                shipmentDate: now,
                                                amount: finalPrice,
                                                currency: billingCurrency,
                                                paid: isPaid,
                                                totalPaid: isPaid ? finalPrice : Number(updatedShipment.totalPaid || 0),
                                                remainingBalance: isPaid ? 0 : Math.max(0, Number((finalPrice - Number(updatedShipment.totalPaid || 0)).toFixed(4)))
                                            }
                                        }
                                    }
                                });
                            }
                        } catch (invErr) {
                            logger.warn(`[ShipmentBookingService] Auto-invoice creation warning for ${updatedShipment.trackingNumber}: ${invErr.message}`);
                        }
                    }
                }

                // Post Platform-Level Carrier Accounts Payable liability if external carrier cost exists
                if (carrierCost > 0 && updatedShipment.carrierCode !== 'INTERNAL' && typeof financeLedgerService.recordCarrierPayable === 'function') {
                    await financeLedgerService.recordCarrierPayable({
                        organizationId: null,
                        shipmentId: updatedShipment.id,
                        carrierCode: updatedShipment.carrierCode,
                        costPrice: carrierCost,
                        currency: billingCurrency,
                        trackingNumber: updatedShipment.trackingNumber,
                        createdBy: payingUser?.id
                    }, tx);
                }

                // Post Double-Entry General Ledger Entry (Dr AR, Cr Freight Revenue, Dr COGS, Cr Carrier AP)
                if ((finalPrice > 0 && organizationId) || (carrierCost > 0 && updatedShipment.carrierCode !== 'INTERNAL')) {
                    try {
                        const generalLedgerService = require('./generalLedger.service');
                        await generalLedgerService.postShipmentBookingEntry({
                            shipmentId: updatedShipment.id,
                            trackingNumber: updatedShipment.trackingNumber,
                            organizationId,
                            customerPrice: finalPrice,
                            carrierCost,
                            carrierCode: updatedShipment.carrierCode,
                            currency: billingCurrency,
                            createdById: payingUser?.id
                        }, tx);
                    } catch (glError) {
                        logger.warn(`[ShipmentBookingService] GL Journal Entry posting warning for ${updatedShipment.trackingNumber}: ${glError.message}`);
                    }
                }

                return updatedShipment;
            };

            const finalizedShipment = typeof prisma.$transaction === 'function'
                ? await prisma.$transaction(executeBookingCommit)
                : await executeBookingCommit(prisma);

            // Generate the detailed cost copy after the booking transaction, with finalized rates and IDs.
            // It is never added to shipment.documents or the public /uploads tree.
            try {
                const { generateAndStoreInternalShipmentReceipt } = require('./internalShipmentReceipt.service');
                const internalCarrierName = ['INTERNAL', 'MANUAL'].includes(String(carrierCode).toUpperCase())
                    ? 'Target Logistics'
                    : (carrierCode === 'DGR' ? 'DHL Express' : (carrierCode === 'SMSA' ? 'SMSA Express' : carrierCode));
                await generateAndStoreInternalShipmentReceipt(
                    { ...finalizedShipment, dhlTrackingNumber: carrierTrackingNumber, carrierShipmentId },
                    internalCarrierName
                );
            } catch (receiptError) {
                logger.warn(`Internal shipment receipt generation skipped for ${freshShipment.trackingNumber}: ${receiptError.message}`);
            }

            // Dispatch webhook and chatwoot notification
            try {
                const WebhookDispatcher = require('./WebhookDispatcher');
                WebhookDispatcher.dispatch('shipment.booked', finalizedShipment.organizationId, {
                    trackingNumber: finalizedShipment.trackingNumber,
                    carrierCode: finalizedShipment.carrierCode,
                    carrierShipmentId,
                    carrierTrackingNumber,
                    status: 'booked',
                    shipment: finalizedShipment
                });
            } catch (whErr) {
                logger.debug(`[ShipmentBookingService] Webhook dispatch error: ${whErr.message}`);
            }

            try {
                const chatwootService = require('./chatwootNotificationService');
                chatwootService.triggerShipmentNotification('shipment_booked', finalizedShipment);
            } catch (cwErr) {
                logger.debug(`[ShipmentBookingService] Chatwoot notification error: ${cwErr.message}`);
            }

            diagnosticAttemptLog.recordAttempt({
                trackingNumber: finalizedShipment.trackingNumber,
                carrierCode: finalizedShipment.carrierCode,
                action: 'CARRIER_BOOK',
                status: 'SUCCESS',
                durationMs: Date.now() - bookingStart,
                message: 'Carrier booking succeeded',
                organizationId: finalizedShipment.organizationId,
                details: {
                    attemptId,
                    carrierTrackingNumber,
                    hasLabel: Boolean(finalizedShipment.labelUrl || carrierResult.labelUrl),
                    hasAwb: Boolean(finalizedShipment.awbUrl || carrierResult.awbUrl)
                }
            });

            return {
                success: true,
                outcome: 'booked',
                shipment: finalizedShipment,
                carrierResult,
                labelUrl: finalizedShipment.labelUrl || carrierResult.labelUrl,
                awbUrl: finalizedShipment.awbUrl || carrierResult.awbUrl,
                invoiceUrl: finalizedShipment.invoiceUrl || carrierResult.invoiceUrl
            };

        } catch (commitError) {
            logger.error('Commit Failure After Carrier Success:', commitError);
            await this.handleBookingFailure(shipment.id, attemptId, `Commit Failed: ${commitError.message}`, 'reconciliation_required');
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: shipment.trackingNumber,
                carrierCode,
                action: 'CARRIER_BOOK',
                status: 'FAILED',
                durationMs: Date.now() - bookingStart,
                message: `Commit Failed: ${commitError.message}`,
                organizationId,
                details: { attemptId, outcome: 'reconciliation_required' }
            });
            const reconciliationError = new Error('Critical: Carrier booked shipment, locally updated failed. Manual intervention required.');
            reconciliationError.bookingOutcome = 'reconciliation_required';
            throw reconciliationError;
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
     * Safely resolves an old pending attempt before another carrier create call.
     * A missing provider lookup is deliberately treated as uncertain, never as
     * permission to create a duplicate shipment.
     */
    async reconcileBookingAttempt(trackingNumber, attemptId, carrierCode = null) {
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { user: true, organization: true }
        });
        if (!shipment) throw new Error('Shipment record not found');

        const attempts = Array.isArray(shipment.bookingAttempts) ? shipment.bookingAttempts : [];
        const attempt = attempts.find((candidate) => candidate.attemptId === attemptId);
        if (!attempt) throw new Error('Booking attempt not found');

        const adapter = CarrierFactory.getAdapter(
            String(carrierCode || shipment.carrierCode || 'DGR').toUpperCase(),
            { isTest: shipment.pricingSnapshot?.isTest === true }
        );
        let providerResult = null;
        try {
            if (typeof adapter?.getStatus === 'function') {
                providerResult = await adapter.getStatus({
                    barcode: shipment.dhlTrackingNumber || shipment.carrierShipmentId || shipment.trackingNumber
                });
            }
        } catch (error) {
            logger.warn(`Booking reconciliation lookup failed for ${trackingNumber}: ${error.message}`);
        }

        const normalized = providerResult && typeof adapter?._normalizeShipmentResponse === 'function'
            ? adapter._normalizeShipmentResponse(providerResult)
            : providerResult;
        const providerTrackingNumber = normalized?.trackingNumber || normalized?.dhlTrackingNumber;
        const providerShipmentId = normalized?.carrierShipmentId || normalized?.id || providerTrackingNumber;

        if (providerTrackingNumber || providerShipmentId) {
            const attemptIndex = attempts.findIndex((candidate) => candidate.attemptId === attemptId);
            attempts[attemptIndex] = {
                ...attempt,
                status: 'succeeded',
                outcome: 'booked',
                carrierShipmentId: providerShipmentId,
                updatedAt: new Date(),
                reconciledAt: new Date()
            };
            const updated = await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                    status: 'booked',
                    dhlConfirmed: true,
                    dhlTrackingNumber: providerTrackingNumber || shipment.dhlTrackingNumber,
                    carrierShipmentId: providerShipmentId,
                    bookingAttempts: attempts
                }
            });
            diagnosticAttemptLog.recordAttempt({
                trackingNumber: updated.trackingNumber,
                carrierCode: normalizeCarrierCode(carrierCode || updated.carrierCode || 'DGR'),
                action: 'BOOKING_RECONCILE',
                status: 'SUCCESS',
                message: `Reconciled booking attempt ${attemptId}`,
                organizationId: updated.organizationId || null,
                details: { attemptId, providerShipmentId }
            });
            return { outcome: 'booked', reconciled: true, shipment: updated };
        }

        const attemptIndex = attempts.findIndex((candidate) => candidate.attemptId === attemptId);
        attempts[attemptIndex] = {
            ...attempt,
            status: 'failed',
            outcome: 'reconciliation_required',
            error: 'Carrier outcome could not be confirmed',
            updatedAt: new Date()
        };
        await prisma.shipment.update({
            where: { id: shipment.id },
            data: { bookingAttempts: attempts }
        });
        diagnosticAttemptLog.recordAttempt({
            trackingNumber: shipment.trackingNumber,
            carrierCode: normalizeCarrierCode(carrierCode || shipment.carrierCode || 'DGR'),
            action: 'BOOKING_RECONCILE',
            status: 'FAILED',
            message: 'Carrier outcome could not be confirmed',
            organizationId: shipment.organizationId || null,
            details: { attemptId, outcome: 'reconciliation_required' }
        });
        return { outcome: 'reconciliation_required', reconciled: false, shipment };
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
        const isTest = shipment.pricingSnapshot?.isTest === true ||
                       shipment.pricingSnapshot?.environment === 'test' ||
                       shipment.isTest === true ||
                       shipment.environment === 'test' ||
                       (shipment.metadata && (shipment.metadata.isTest === true || shipment.metadata.environment === 'test'));
        const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || shipment.environment || 'production');
        const adapter = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
        if (!adapter || typeof adapter.getRates !== 'function') {
            logger.warn(`Carrier adapter for ${carrierCode} does not provide getRates; skipping pricing refresh.`);
            return;
        }
        const quotes = await adapter.getRates({ ...this.mapToCarrierPayload(shipment), isTest, environment });

        if (!Array.isArray(quotes) || quotes.length === 0) throw new Error('No valid rates available for refresh.');

        const selectedQuote = quotes.find((q) => q.serviceCode === shipment.serviceCode) || quotes[0];
        const { markup, source } = PricingService.resolveMarkup(payingUser, organization, carrierCode);

        const carrierPolicy = PricingService.resolveCarrierPricingPolicy(payingUser, carrierCode, selectedQuote.currency || shipment.currency || 'KWD');
        const rateCurrency = selectedQuote.currency || carrierPolicy.currency || shipment.currency || 'KWD';
        const carrierRate = PricingService.applyCarrierBasePricePolicy(Number(selectedQuote.totalPrice || 0), payingUser, carrierCode, {
            countryCode: shipment.destination?.countryCode || shipment.destination?.country,
            packages: shipment.packages,
            weight: shipment.weight
        });
        const snapshot = PricingService.createSnapshot(
            carrierRate,
            markup,
            rateCurrency,
            source
        );
        snapshot.isTest = isTest;
        snapshot.environment = environment;

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
                price: snapshot.totalPrice,
                costPrice: snapshot.carrierRate,
                markupAmount: snapshot.markup,
                remainingBalance: shipment.paid
                    ? 0
                    : Math.max(0, Number((Number(snapshot.totalPrice || 0) - Number(shipment.totalPaid || 0)).toFixed(4)))
            }
        });
    }

    /**
     * Updates attempt record upon failure.
     */
    async handleBookingFailure(shipmentId, attemptId, reason, outcome = 'failed') {
        try {
            const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
            const attempts = Array.isArray(shipment.bookingAttempts) ? shipment.bookingAttempts : [];
            const index = attempts.findIndex(a => a.attemptId === attemptId);
            
            if (index !== -1) {
                attempts[index].status = 'failed';
                attempts[index].outcome = outcome;
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
