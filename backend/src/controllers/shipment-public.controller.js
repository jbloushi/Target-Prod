/**
 * Shipment Public Controller
 * getPublicShipment, updatePublicLocation, updatePublicSettings
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const CarrierFactory = require('../services/CarrierFactory');
const { syncCarrierTrackingHistory, buildTrackingSyncDocuments, compactHistory, buildDisplayHistory, resolveCarrierTrackingNumber } = require('./shipment.helpers');
const { normalizeStatus } = require('../constants/statusConstants');
const { canAccessShipment } = require('../middleware/authorize.middleware');
const { isTrackingSyncDue, markTrackingSynced, triggerBackgroundTrackingSync } = require('../services/queue/trackingCache');
const chatwootNotificationService = require('../services/chatwootNotificationService');
const financeLedgerService = require('../services/financeLedger.service');

/**
 * Public tracking view for customers
 */
exports.getPublicShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        let shipment = await prisma.shipment.findUnique({
            where: { trackingNumber }
        });

        if (!shipment) {
            const cleanNumeric = String(trackingNumber || '').replace(/^TRK-/i, '').replace(/^ARM-/i, '').trim();
            shipment = await prisma.shipment.findFirst({
                where: {
                    OR: [
                        { trackingNumber: `TRK-${cleanNumeric}` },
                        { trackingNumber: cleanNumeric },
                        { dhlTrackingNumber: cleanNumeric },
                        { carrierShipmentId: cleanNumeric }
                    ]
                }
            });
        }
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const isExplicitRefresh = req.query.refresh === 'true' || req.query.sync === 'true';
        const hasOnlyBaseline = !shipment.history || (Array.isArray(shipment.history) && (
            shipment.history.length === 0 ||
            (shipment.history.length === 1 && shipment.history[0]?.source !== 'carrier')
        ));

        // Sync carrier tracking into the unified history (synchronous if explicit or has only baseline event)
        if (isExplicitRefresh || hasOnlyBaseline) {
            try {
                const updates = await syncCarrierTrackingHistory(shipment);
                if (updates) {
                    const dataToUpdate = {
                        history: updates.history,
                        status: updates.status,
                        documents: buildTrackingSyncDocuments(shipment, updates)
                    };
                    if (updates.actualWeight || updates.totalPieces) {
                        dataToUpdate.pricingSnapshot = {
                            ...(shipment.pricingSnapshot || {}),
                            carrierWeight: updates.actualWeight || shipment.pricingSnapshot?.carrierWeight,
                            carrierPieces: updates.totalPieces || shipment.pricingSnapshot?.carrierPieces
                        };
                    }
                    await prisma.shipment.update({
                        where: { id: shipment.id },
                        data: dataToUpdate
                    });
                    shipment.history = updates.history;
                    shipment.status = updates.status;
                }
                markTrackingSynced(shipment.trackingNumber);
            } catch (err) {
                logger.warn(`Public tracking: carrier sync failed for ${trackingNumber}: ${err.message}`);
            }
        } else if (isTrackingSyncDue(shipment)) {
            triggerBackgroundTrackingSync(shipment, syncCarrierTrackingHistory);
        }

        const { isNegativeOrExceptionPhrase } = require('../constants/statusConstants');
        const isPublicSafeEvent = (h) => {
            if (!h) return false;
            const src = String(h.source || '').toLowerCase();
            if (src === 'staff' || src === 'phenix_erp' || src === 'accounting' || src === 'finance') return false;
            if (h.type === 'comment' || h.type === 'note' || Boolean(h.comment) || Boolean(h.internalOnly)) return false;
            const desc = String(h.description || '').toLowerCase();
            if (desc.includes('phenix') || desc.includes('ledger') || desc.includes('cost price') || desc.includes('margin') || desc.includes('internal note')) return false;
            return true;
        };

        const resolveEventNormalizedStatus = (h) => {
            const rawStatus = typeof h?.status === 'object' ? (h.status?.status || 'booked') : (h?.status || '');
            const desc = String(h?.description || '');
            if (isNegativeOrExceptionPhrase(desc) || isNegativeOrExceptionPhrase(rawStatus)) {
                return 'exception';
            }
            const codeStatus = (h?.statusCode || h?.code) ? normalizeStatus(h.statusCode || h.code) : null;
            if (codeStatus === 'exception') return 'exception';
            if (desc && normalizeStatus(desc) === 'exception') return 'exception';
            if (rawStatus === 'delivered' && desc && normalizeStatus(desc) !== 'delivered' && codeStatus !== 'delivered') {
                return normalizeStatus(desc);
            }
            return normalizeStatus(h?.statusCode || h?.code || rawStatus || desc || 'booked');
        };

        const persistedEvents = compactHistory((shipment.history || []).filter(isPublicSafeEvent)).map(h => ({
            source: h.source || 'platform',
            status: resolveEventNormalizedStatus(h),
            description: h.description || '',
            timestamp: h.timestamp,
            localTimestamp: h.localTimestamp || null,
            timezoneOffset: h.timezoneOffset || null,
            collapsedCount: h.collapsedCount || h.occurrences || 1,
            occurrences: h.occurrences || h.collapsedCount || 1,
            location: h.location?.formattedAddress || h.location?.city || (typeof h.location === 'string' ? h.location : '')
        })).filter((event) => event.timestamp);

        let rawEvents = [];
        const carrierTrackingNumber = resolveCarrierTrackingNumber(shipment);
        const carrierCode = (shipment?.carrierCode || shipment?.carrier || 'DGR').toUpperCase();

        // Only perform live carrier query on explicit refresh or if no persisted events exist at all
        if (carrierTrackingNumber && (isExplicitRefresh || persistedEvents.length === 0)) {
            try {
                const isTest = shipment.pricingSnapshot?.isTest === true || shipment.pricingSnapshot?.environment === 'test';
                const environment = isTest ? 'test' : (shipment.pricingSnapshot?.environment || 'production');
                const carrier = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
                const tracking = await carrier.getTracking(carrierTrackingNumber);
                const carrierEvents = (tracking?.events || []).map((event) => ({
                    source: 'carrier',
                    status: resolveEventNormalizedStatus({
                        statusCode: event.statusCode,
                        status: tracking?.status || shipment.status || 'booked',
                        description: event.description
                    }),
                    description: event.description || '',
                    timestamp: event.timestamp,
                    localTimestamp: event.localTimestamp || null,
                    timezoneOffset: event.timezoneOffset || null,
                    location: event.location || ''
                }));
                rawEvents = [...persistedEvents, ...carrierEvents]
                    .filter((event) => event.timestamp)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                markTrackingSynced(shipment.trackingNumber);
            } catch (carrierError) {
                logger.warn(`Public tracking: carrier event fetch failed for ${trackingNumber}: ${carrierError.message}`);
            }
        }

        if (rawEvents.length === 0) {
            // Fallback to persisted merged history if carrier feed is unavailable.
            rawEvents = persistedEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        const originLocation = shipment.origin?.formattedAddress || shipment.origin?.city || '';
        let events = buildDisplayHistory(rawEvents, { originLocation }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (events.length === 0 && Array.isArray(shipment.history) && shipment.history.length > 0) {
            const fallbackRaw = compactHistory((shipment.history || []).filter(isPublicSafeEvent)).map(h => ({
                source: h.source || 'platform',
                status: resolveEventNormalizedStatus(h),
                description: h.description || '',
                timestamp: h.timestamp,
                localTimestamp: h.localTimestamp || null,
                timezoneOffset: h.timezoneOffset || null,
                collapsedCount: h.collapsedCount || h.occurrences || 1,
                occurrences: h.occurrences || h.collapsedCount || 1,
                location: h.location?.formattedAddress || h.location?.city || (typeof h.location === 'string' ? h.location : '')
            }));
            events = buildDisplayHistory(fallbackRaw, { originLocation }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (rawEvents.length === 0) rawEvents = fallbackRaw;
        }

        const anyDeliveredEvent = rawEvents.some((e) => resolveEventNormalizedStatus(e) === 'delivered')
            || (Array.isArray(shipment.history) && shipment.history.some((e) => resolveEventNormalizedStatus(e) === 'delivered'));
        if (anyDeliveredEvent && shipment.status !== 'delivered') {
            await prisma.shipment.update({
                where: { id: shipment.id },
                data: { status: 'delivered' }
            }).catch(() => {});
            shipment.status = 'delivered';
        } else if (shipment.status === 'exception' && (rawEvents.length > 0 || Array.isArray(shipment.history))) {
            const allEvents = [...rawEvents, ...(Array.isArray(shipment.history) ? shipment.history : [])];
            const sortedDesc = allEvents.filter(e => e.timestamp).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const latestScan = sortedDesc[0];
            const latestStatus = resolveEventNormalizedStatus(latestScan);
            if (latestStatus && latestStatus !== 'exception' && ['in_transit', 'received_at_hub', 'out_for_delivery', 'delivered'].includes(latestStatus)) {
                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: { status: latestStatus }
                }).catch(() => {});
                shipment.status = latestStatus;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                dhlTrackingNumber: shipment.dhlTrackingNumber || null,
                status: normalizeStatus(shipment.status),
                carrierCode: shipment.carrierCode || null,
                serviceCode: shipment.serviceCode || null,
                shipmentType: shipment.shipmentType || 'package',
                codAmount: shipment.codAmount || null,
                codCurrency: shipment.codCurrency || null,
                codStatus: shipment.codStatus || null,

                // Route
                origin: {
                    city: shipment.origin?.city,
                    countryCode: shipment.origin?.countryCode,
                    formattedAddress: shipment.origin?.formattedAddress
                },
                destination: {
                    city: shipment.destination?.city,
                    countryCode: shipment.destination?.countryCode,
                    formattedAddress: shipment.destination?.formattedAddress
                },
                currentLocation: shipment.currentLocation,
                estimatedDelivery: shipment.estimatedDelivery,

                // Shipment details
                parcels: (shipment.parcels || []).map(p => ({
                    weight: p.weight,
                    dimensions: p.dimensions,
                    description: p.description
                })),
                totalPieces: shipment.parcels?.length || 1,
                createdAt: shipment.createdAt,

                // Unified events
                events,
                rawEvents,

                // Public update settings
                allowPublicLocationUpdate: shipment.allowPublicLocationUpdate || false,
                allowPublicInfoUpdate: shipment.allowPublicInfoUpdate || false
            }
        });
    } catch (error) {
        logger.error('Error fetching public shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipment' });
    }
};

/**
 * Receiver Location Pinning OTP Controllers
 */
const locationOtpStore = new Map(); // trackingNumber -> { otp, expiresAt, verified, otpToken }

exports.sendReceiverLocationOtp = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const phone = shipment.destination?.phone || shipment.customerPhone || shipment.origin?.phone;
        const countryCode = shipment.destination?.phoneCountryCode || shipment.customerPhoneCountryCode || '20';
        
        if (!phone) {
            return res.status(400).json({ success: false, error: 'No recipient phone number found on shipment' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
        locationOtpStore.set(trackingNumber, { otp, expiresAt, verified: false });

        // Dispatch OTP via WhatsApp
        try {
            const whatsappService = require('../services/whatsappIntegration.service');
            await whatsappService.sendNotification({
                shipment,
                recipientRole: 'customer',
                recipientPhone: phone,
                recipientCountryCode: countryCode,
                eventType: 'location_otp',
                templateName: 'new_shipment_created',
                customMessage: `Your Target Logistics Location Pin OTP is: ${otp}`
            });
        } catch (waErr) {
            logger.warn(`[WhatsApp OTP Dispatch Warning] ${waErr.message}`);
        }

        logger.info(`[Receiver OTP Generated] ${trackingNumber} -> ${otp}`);
        return res.json({
            success: true,
            message: `OTP sent via WhatsApp to registered receiver phone (${phone.slice(-4)})`,
            // Provide OTP in response only in dev environment for easy debugging
            devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (error) {
        logger.error('Error sending receiver OTP:', error);
        return res.status(500).json({ success: false, error: 'Failed to send OTP' });
    }
};

exports.verifyReceiverLocationOtp = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { otp } = req.body;

        const record = locationOtpStore.get(trackingNumber);
        if (!record || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, error: 'OTP has expired or was not requested. Please resend.' });
        }

        if (record.otp !== String(otp).trim()) {
            return res.status(400).json({ success: false, error: 'Invalid 6-digit verification code' });
        }

        const otpToken = `TOKEN_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        record.verified = true;
        record.otpToken = otpToken;
        locationOtpStore.set(trackingNumber, record);

        return res.json({
            success: true,
            message: 'OTP verified successfully!',
            otpToken
        });
    } catch (error) {
        logger.error('Error verifying receiver OTP:', error);
        return res.status(500).json({ success: false, error: 'Failed to verify OTP' });
    }
};

/**
 * Allow receiver to update destination details if enabled (OTP Protected & Audit Logged)
 */
exports.updatePublicLocation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { coordinates, address, streetLines, city, state, postalCode, country, otpToken, deliveryNotes, buildingName, unitNumber, landmark } = req.body;
        
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        
        // Verify OTP session token if not explicitly allowed via allowPublicLocationUpdate
        const record = locationOtpStore.get(trackingNumber);
        const isOtpVerified = record && record.verified && record.otpToken === otpToken;
        
        if (!shipment.allowPublicLocationUpdate && !isOtpVerified) {
            return res.status(403).json({ success: false, error: 'Location update requires valid Receiver OTP verification' });
        }

        if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
            return res.status(400).json({ success: false, error: 'Invalid coordinates' });
        }

        const oldDestination = shipment.destination || {};
        const updatedDestination = { 
            ...oldDestination, 
            formattedAddress: address || oldDestination.formattedAddress, 
            longitude: coordinates[0], 
            latitude: coordinates[1],
            streetLines: streetLines || oldDestination.streetLines,
            city: city || oldDestination.city,
            state: state || oldDestination.state,
            postalCode: postalCode || oldDestination.postalCode,
            country: country || oldDestination.country,
            buildingName: buildingName || oldDestination.buildingName,
            unitNumber: unitNumber || oldDestination.unitNumber,
            landmark: landmark || oldDestination.landmark,
            deliveryNotes: deliveryNotes || oldDestination.deliveryNotes
        };

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        const updatedHistory = [
            ...history,
            { 
                location: shipment.currentLocation, 
                status: shipment.status, 
                description: 'Destination location pinned & updated by receiver via OTP verification', 
                timestamp: new Date() 
            }
        ];

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                destination: updatedDestination,
                allowPublicLocationUpdate: false,
                history: updatedHistory
            }
        });

        // Record Audit Log for Superadmin
        try {
            await prisma.shipmentAuditLog.create({
                data: {
                    shipmentId: shipment.id,
                    trackingNumber: shipment.trackingNumber,
                    actorType: 'RECEIVER_OTP',
                    actorName: shipment.destination?.contactPerson || shipment.customerName || 'Receiver',
                    action: 'LOCATION_PINNED',
                    fieldChanges: {
                        oldDestination,
                        newDestination: updatedDestination
                    },
                    ipAddress: req.ip || req.headers['x-forwarded-for'] || null
                }
            });
        } catch (auditErr) {
            logger.warn(`[Audit Log Warning] Failed to log location update: ${auditErr.message}`);
        }

        // Clear OTP session token
        locationOtpStore.delete(trackingNumber);

        logger.info(`Shipment ${trackingNumber} destination pinned & updated by receiver via OTP`);
        res.status(200).json({ success: true, message: 'Location pinned successfully!' });
    } catch (error) {
        logger.error('Error updating public location:', error);
        res.status(500).json({ success: false, error: 'Failed to update location' });
    }
};

/**
 * Public visibility settings
 */
exports.updatePublicSettings = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { allowPublicLocationUpdate, allowPublicInfoUpdate } = req.body;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                allowPublicLocationUpdate: typeof allowPublicLocationUpdate === 'boolean' ? allowPublicLocationUpdate : shipment.allowPublicLocationUpdate,
                allowPublicInfoUpdate: typeof allowPublicInfoUpdate === 'boolean' ? allowPublicInfoUpdate : shipment.allowPublicInfoUpdate
            }
        });

        logger.info(`Shipment ${trackingNumber} public settings updated`);
        res.status(200).json({ success: true, message: 'Public settings updated successfully' });
    } catch (error) {
        logger.error('Error updating public settings:', error);
        res.status(500).json({ success: false, error: 'Failed to update public settings' });
    }
};

/**
 * Public checkout summary for pay-by-link
 */
exports.getPublicCheckout = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const priceNum = Number(shipment.price || 0);
        const remainingNum = Number(shipment.remainingBalance || 0);
        const amountDue = remainingNum > 0 ? remainingNum : (!shipment.paid ? priceNum : 0);
        const currency = shipment.currency || 'KWD';
        const totalPaid = Number(shipment.totalPaid || 0);
        const isPaid = Boolean(shipment.paid) || (amountDue <= 0 && totalPaid > 0);

        const parcels = Array.isArray(shipment.parcels) ? shipment.parcels : [];
        const items = Array.isArray(shipment.items) ? shipment.items : [];
        const parcelsCount = parcels.length > 0 ? parcels.length : (items.length > 0 ? items.length : 1);
        const totalWeight = parcels.length > 0
            ? parcels.reduce((sum, p) => sum + (Number(p.weight) || 0), 0)
            : (items.length > 0 ? items.reduce((sum, i) => sum + (Number(i.weight) || 0), 0) : 0);

        const carrierCode = (shipment.carrierCode || 'DGR').toUpperCase();
        let carrierName = carrierCode === 'OTE' ? 'Target GCC Express (OTE)' : (carrierCode === 'DGR' ? 'Target International Air (DHL DGR)' : 'Target Local Fleet');
        try {
            const systemSettings = require('../services/systemSettings.service').getSystemSettings();
            if (systemSettings?.carrierBranding?.[carrierCode]?.name) {
                carrierName = systemSettings.carrierBranding[carrierCode].name;
            }
        } catch (_) {}

        // Construct authentic rate breakdown from pricing snapshot without synthetic percentages (P2-12)
        const snapshot = shipment.pricingSnapshot || {};
        const fuelSurcharge = Number(snapshot.fuelSurcharge || 0);
        const handlingFee = Number(snapshot.handlingFee || snapshot.vat || snapshot.dgFee || snapshot.remoteAreaFee || 0);
        const baseFreight = Number(
            snapshot.basePrice ||
            snapshot.subtotal ||
            snapshot.baseRate ||
            Math.max(0, amountDue - fuelSurcharge - handlingFee)
        );

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                paid: isPaid,
                amount: amountDue,
                totalPaid,
                currency,
                origin: {
                    city: shipment.origin?.city || 'Kuwait',
                    country: shipment.origin?.countryCode || shipment.origin?.country || 'Kuwait',
                    contactPerson: shipment.origin?.contactPerson || shipment.origin?.company || ''
                },
                destination: {
                    city: shipment.destination?.city || '',
                    country: shipment.destination?.countryCode || shipment.destination?.country || '',
                    contactPerson: shipment.destination?.contactPerson || shipment.destination?.company || ''
                },
                parcelsCount,
                totalWeight: Number(totalWeight.toFixed(2)),
                carrierCode,
                carrierName,
                estimatedDelivery: shipment.estimatedDelivery,
                breakdown: {
                    baseFreight: Number(baseFreight.toFixed(3)),
                    fuelSurcharge: Number(fuelSurcharge.toFixed(3)),
                    handlingFee: Number(handlingFee.toFixed(3)),
                    total: Number(amountDue.toFixed(3))
                },
                createdAt: shipment.createdAt
            }
        });
    } catch (error) {
        logger.error('Error getting public checkout:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve checkout information' });
    }
};

/**
 * Public payment settlement endpoint (K-Net / Card / Apple Pay)
 */
exports.processPublicPayment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { paymentMethod = 'KNET', customerName, customerEmail, customerPhone, reference } = req.body || {};

        // Security Gate (SEC-01): Prevent unauthenticated direct settlement without gateway/staff verification
        if (process.env.ALLOW_DEMO_PUBLIC_CHECKOUT !== 'true') {
            let isAuthorized = false;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const jwt = require('jsonwebtoken');
                    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
                    if (decoded && ['admin', 'staff', 'accounting'].includes(String(decoded.role || '').toLowerCase())) {
                        isAuthorized = true;
                    }
                } catch (_) {
                    // Invalid token
                }
            }

            const paymentSig = req.headers['x-payment-signature'];
            const secret = process.env.PUBLIC_PAYMENT_SECRET || process.env.OTTU_WEBHOOK_SECRET;
            if (!isAuthorized && paymentSig && secret) {
                const crypto = require('crypto');
                const expectedSig = crypto
                    .createHmac('sha256', secret)
                    .update(`${trackingNumber}:${reference || ''}`)
                    .digest('hex');
                if (
                    paymentSig.length === expectedSig.length &&
                    crypto.timingSafeEqual(Buffer.from(paymentSig), Buffer.from(expectedSig))
                ) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized) {
                logger.warn(`[Security] Blocked unverified direct public payment attempt for ${trackingNumber}`);
                return res.status(403).json({
                    success: false,
                    error: 'Direct payment settlement requires gateway verification. Please complete payment via the Ottu checkout session.'
                });
            }
        }

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (shipment.paid && Number(shipment.remainingBalance || 0) <= 0) {
            return res.status(200).json({
                success: true,
                message: 'This shipment is already settled and fully paid.',
                alreadyPaid: true
            });
        }

        const amount = Number(shipment.remainingBalance || shipment.price || 0);
        const currency = shipment.currency || 'KWD';
        const paymentReference = reference || `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
        const normalizedMethod = String(paymentMethod || 'KNET').toUpperCase();

        const result = await prisma.$transaction(async (tx) => {
            // Deduplication: check if Payment with reference already exists
            const existingPayment = await tx.payment.findFirst({
                where: { reference: paymentReference }
            });
            if (existingPayment) {
                logger.info(`[Public Payment] Idempotent hit: Payment reference ${paymentReference} already processed.`);
                return { payment: existingPayment, updatedShipment: shipment, alreadySettled: true };
            }

            // 1. Create Payment record
            const payment = await tx.payment.create({
                data: {
                    organizationId: shipment.organizationId || null,
                    amount: Number(amount),
                    currency,
                    method: normalizedMethod,
                    reference: paymentReference,
                    notes: `Public online settlement for shipment ${trackingNumber} (${normalizedMethod}) by ${customerName || 'Customer'}`,
                    createdById: shipment.userId || null
                }
            });

            // 2. Create Ledger entry if org attached
            if (shipment.organizationId) {
                await financeLedgerService.createLedgerEntry(shipment.organizationId, {
                    sourceRepo: 'Payment',
                    sourceId: payment.id,
                    amount: Number(amount),
                    entryType: 'CREDIT',
                    category: 'PAYMENT',
                    description: `Online payment received via ${normalizedMethod} (Ref: ${paymentReference})`,
                    reference: paymentReference,
                    createdBy: shipment.userId || null,
                    metadata: { currency, trackingNumber }
                }, tx);
            }

            // 3. Create PaymentAllocation record to prevent FIFO double-sweep
            await tx.paymentAllocation.create({
                data: {
                    organizationId: shipment.organizationId || null,
                    paymentId: payment.id,
                    shipmentId: shipment.id,
                    amount: Number(amount),
                    currency,
                    status: 'ACTIVE',
                    isFifo: false
                }
            });

            // 4. Update Shipment status & financials
            const history = Array.isArray(shipment.history) ? shipment.history : [];
            const newHistory = {
                location: shipment.currentLocation,
                status: shipment.status,
                description: `Payment of ${amount.toFixed(3)} ${currency} settled online via ${normalizedMethod} (Ref: ${paymentReference})`,
                timestamp: new Date()
            };

            const updatedShipment = await tx.shipment.update({
                where: { id: shipment.id },
                data: {
                    paid: true,
                    totalPaid: { increment: Number(amount) },
                    remainingBalance: 0,
                    history: [...history, newHistory]
                }
            });

            // 5. Mark linked InvoiceLine / Invoice as paid if already issued
            if (typeof tx.invoiceLine?.findMany === 'function' && typeof tx.invoiceLine?.updateMany === 'function') {
                try {
                    const lines = await tx.invoiceLine.findMany({ where: { shipmentId: shipment.id } });
                    if (lines.length > 0) {
                        await tx.invoiceLine.updateMany({
                            where: { shipmentId: shipment.id },
                            data: {
                                paid: true,
                                totalPaid: Number(amount),
                                remainingBalance: 0
                            }
                        });
                        if (typeof tx.invoice?.updateMany === 'function') {
                            const invoiceIds = [...new Set(lines.map(l => l.invoiceId).filter(Boolean))];
                            if (invoiceIds.length > 0) {
                                await tx.invoice.updateMany({
                                    where: { id: { in: invoiceIds } },
                                    data: {
                                        status: 'paid',
                                        paidAt: new Date()
                                    }
                                });
                            }
                        }
                    }
                } catch (invSettleErr) {
                    logger.warn(`Public checkout invoice update non-fatal warning for ${trackingNumber}: ${invSettleErr.message}`);
                }
            }

            // 6. Post Payment Receipt to Double-Entry General Ledger (Dr 1010 Bank/Cash, Cr 1100 AR)
            try {
                const generalLedgerService = require('../services/generalLedger.service');
                if (typeof generalLedgerService?.postPaymentReceiptEntry === 'function') {
                    await generalLedgerService.postPaymentReceiptEntry({
                        paymentId: payment.id,
                        reference: paymentReference,
                        organizationId: shipment.organizationId || null,
                        amount: Number(amount),
                        currency,
                        createdById: shipment.userId || null
                    }, tx);
                }
            } catch (glErr) {
                logger.warn(`Public checkout GL payment receipt non-fatal warning for ${trackingNumber}: ${glErr.message}`);
            }

            return { payment, updatedShipment };
        });

        if (result.alreadySettled) {
            return res.status(200).json({
                success: true,
                message: 'Payment already processed for this reference.',
                alreadySettled: true,
                data: {
                    paymentId: result.payment.id,
                    reference: result.payment.reference,
                    amount: result.payment.amount,
                    currency: result.payment.currency,
                    paid: true
                }
            });
        }

        // 4. Trigger WhatsApp Payment Confirmation notification
        try {
            chatwootNotificationService.triggerShipmentNotification('payment_confirmed', result.updatedShipment, { force: true });
        } catch (notifErr) {
            logger.warn(`Failed to trigger payment confirmation WhatsApp: ${notifErr.message}`);
        }

        logger.info(`[PublicCheckout] Payment settled for ${trackingNumber}: ${amount} ${currency} via ${normalizedMethod} (Ref: ${paymentReference})`);

        res.status(200).json({
            success: true,
            message: 'Payment completed successfully!',
            data: {
                paymentId: result.payment.id,
                reference: paymentReference,
                amount,
                currency,
                method: normalizedMethod,
                paidAt: new Date()
            }
        });
    } catch (error) {
        logger.error('Error processing public payment:', error);
        res.status(500).json({ success: false, error: 'Failed to process payment settlement' });
    }
};

/**
 * Initiate Ottu Payment Gateway Session for Checkout
 * POST /api/public/shipments/:trackingNumber/ottu-session
 */
exports.createOttuSession = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        if (shipment.paid && Number(shipment.remainingBalance || 0) <= 0) {
            return res.status(200).json({
                success: true,
                message: 'This shipment is already settled and fully paid.',
                alreadyPaid: true
            });
        }

        const ottuService = require('../services/ottuPayment.service');
        const session = await ottuService.createPaymentSession({
            shipment,
            customerName: req.body?.customerName,
            customerPhone: req.body?.customerPhone,
            customerEmail: req.body?.customerEmail
        });

        res.status(200).json({
            success: true,
            data: session
        });
    } catch (error) {
        logger.error('Error creating Ottu payment session:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to initiate Ottu payment session' });
    }
};

/**
 * Handle incoming Ottu Webhook notification
 * POST /api/public/checkout/ottu/webhook
 */
exports.handleOttuWebhook = async (req, res) => {
    try {
        const webhookSecret = process.env.OTTU_WEBHOOK_SECRET;
        if (!webhookSecret) {
            logger.warn('[Ottu Webhook] Rejected request: OTTU_WEBHOOK_SECRET is not configured on server');
            return res.status(401).json({ success: false, error: 'Unauthorized: webhook secret is not configured' });
        }

        const providedSig = req.headers['x-ottu-signature'] || req.headers['x-webhook-secret'] || req.body?.signature;
        if (!providedSig) {
            logger.warn('[Ottu Webhook] Rejected request: missing webhook signature');
            return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
        }

        const crypto = require('crypto');
        const sigBuf = Buffer.from(String(providedSig));
        const secretBuf = Buffer.from(String(webhookSecret));
        const hmacHex = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body || {})).digest('hex');
        const hmacBuf = Buffer.from(hmacHex);
        const isDirectMatch = sigBuf.length === secretBuf.length && crypto.timingSafeEqual(sigBuf, secretBuf);
        const isHmacMatch = sigBuf.length === hmacBuf.length && crypto.timingSafeEqual(sigBuf, hmacBuf);
        if (!isDirectMatch && !isHmacMatch) {
            logger.warn('[Ottu Webhook] Rejected request: invalid webhook signature');
            return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        }

        const ottuService = require('../services/ottuPayment.service');
        const result = await ottuService.handleWebhook(req.body);
        res.status(200).json({ success: true, result });
    } catch (error) {
        logger.error('Error processing Ottu webhook:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to process Ottu webhook' });
    }
};

/**
 * Public Customer Return Eligibility Check
 */
exports.checkReturnEligibility = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: {
                organization: {
                    select: { name: true, billingEmail: true, billingWhatsappNumber: true }
                }
            }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Original shipment not found' });
        }

        const normalizedStatus = String(shipment.status || '').toLowerCase();
        if (normalizedStatus !== 'delivered') {
            return res.status(400).json({
                success: false,
                eligible: false,
                error: `Package is currently '${shipment.status}'. Returns are only eligible after delivery is confirmed.`
            });
        }

        // Check return window (14 days default)
        const RETURN_WINDOW_DAYS = 14;
        let deliveredAt = shipment.updatedAt;
        if (Array.isArray(shipment.history)) {
            const deliveredEvent = shipment.history.find(h => String(h.status).toUpperCase() === 'DELIVERED');
            if (deliveredEvent?.timestamp) deliveredAt = new Date(deliveredEvent.timestamp);
        }

        const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, RETURN_WINDOW_DAYS - daysSinceDelivery);

        if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
            return res.status(400).json({
                success: false,
                eligible: false,
                error: `The 14-day return window for this package expired ${daysSinceDelivery - RETURN_WINDOW_DAYS} days ago (Delivered on ${new Date(deliveredAt).toLocaleDateString()}).`
            });
        }

        // Check if an existing return waybill was already created
        const baseTracking = shipment.trackingNumber.replace(/^(TRK|DGR)-/, '');
        const existingReturn = await prisma.shipment.findFirst({
            where: {
                shipmentType: 'return',
                trackingNumber: { contains: baseTracking }
            }
        });

        if (existingReturn) {
            return res.status(200).json({
                success: true,
                eligible: false,
                alreadyReturned: true,
                existingReturnTracking: existingReturn.trackingNumber,
                returnStatus: existingReturn.status,
                message: `A return request has already been generated: ${existingReturn.trackingNumber}`
            });
        }

        const items = Array.isArray(shipment.items) ? shipment.items : [];
        const parcels = Array.isArray(shipment.parcels) ? shipment.parcels : [];

        res.status(200).json({
            success: true,
            eligible: true,
            data: {
                trackingNumber: shipment.trackingNumber,
                deliveredAt,
                daysRemaining,
                returnWindowDays: RETURN_WINDOW_DAYS,
                merchant: shipment.organization?.name || 'Target Logistics Merchant',
                originAddress: shipment.origin,
                destinationAddress: shipment.destination,
                items,
                parcels,
                allowedReasons: [
                    'Defective or Damaged',
                    'Wrong Item Received',
                    'Item Does Not Match Description',
                    'Size or Fit Exchange',
                    'Customer Change of Mind'
                ]
            }
        });
    } catch (error) {
        logger.error('Error checking return eligibility:', error);
        res.status(500).json({ success: false, error: 'Failed to verify return eligibility' });
    }
};

/**
 * Public Customer Self-Service Return Creation
 */
exports.createPublicReturn = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const {
            returnReason,
            customerNotes,
            returnItems = [],
            pickupPreference = 'DROP_OFF' // 'DROP_OFF' or 'COURIER_PICKUP'
        } = req.body || {};

        if (!returnReason) {
            return res.status(400).json({ success: false, error: 'Return reason is required' });
        }

        const original = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { organization: true }
        });

        if (!original) {
            return res.status(404).json({ success: false, error: 'Original shipment not found' });
        }

        const normalizedStatus = String(original.status || '').toLowerCase();
        if (normalizedStatus !== 'delivered') {
            return res.status(400).json({ success: false, error: 'Returns can only be requested for delivered packages.' });
        }

        // Generate unique return tracking number
        const now = new Date();
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const returnTrackingNumber = `RET-${original.trackingNumber.replace(/^(TRK|DGR)-/, '')}-${randNum}`;

        // Reversal of origin and destination addresses
        const returnSender = original.destination || {};
        const returnRecipient = original.origin || {};

        const initialHistory = [{
            location: returnSender.city || 'Origin',
            status: pickupPreference === 'COURIER_PICKUP' ? 'ready_for_pickup' : 'pending',
            description: `Self-service return waybill created by customer. Reason: ${returnReason}`,
            source: 'return_portal',
            timestamp: now
        }];

        const returnShipment = await prisma.shipment.create({
            data: {
                trackingNumber: returnTrackingNumber,
                carrierCode: original.carrierCode || 'MANUAL',
                serviceCode: original.serviceCode || 'DOMESTIC',
                shipmentType: 'return',
                status: pickupPreference === 'COURIER_PICKUP' ? 'ready_for_pickup' : 'pending',
                organizationId: original.organizationId || null,
                userId: original.userId,
                origin: returnSender,
                destination: returnRecipient,
                currentLocation: returnSender.city || 'Origin',
                items: returnItems.length > 0 ? returnItems : (original.items || []),
                parcels: original.parcels || [],
                currency: original.currency || 'KWD',
                history: initialHistory,
                documents: {
                    returnReason,
                    customerNotes: customerNotes || '',
                    pickupPreference,
                    originalTrackingNumber: original.trackingNumber,
                    parentShipmentId: original.id,
                    isReturn: true
                }
            }
        });

        logger.info(`[ReturnPortal] Created return shipment ${returnTrackingNumber} for original ${original.trackingNumber}`);

        // Trigger WhatsApp alert to recipient and merchant
        try {
            chatwootNotificationService.triggerShipmentNotification('return_requested', returnShipment, { force: true });
        } catch (notifErr) {
            logger.warn(`Failed to dispatch return notification WhatsApp: ${notifErr.message}`);
        }

        res.status(201).json({
            success: true,
            message: 'Return shipment authorized and waybill generated successfully',
            data: returnShipment
        });
    } catch (error) {
        logger.error('Error creating self-service return:', error);
        res.status(500).json({ success: false, error: 'Failed to create return waybill' });
    }
};

/**
 * Public location lookup by single-use/scoped token
 * @route GET /api/public/location/:token
 * @route GET /api/public/shipments/location/:token
 */
exports.getLocationByToken = async (req, res) => {
    try {
        const { token } = req.params;
        if (!token || typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({ success: false, error: 'Location token is required' });
        }

        const cleanToken = token.trim();
        const shipment = await prisma.shipment.findFirst({
            where: { locationToken: cleanToken }
        });

        if (!shipment) {
            return res.status(404).json({
                success: false,
                valid: false,
                error: 'Location link not found or invalid'
            });
        }

        const now = Date.now();
        if (shipment.locationTokenExpiresAt && new Date(shipment.locationTokenExpiresAt).getTime() < now) {
            return res.status(410).json({
                success: false,
                valid: false,
                code: 410,
                error: 'Location link has expired'
            });
        }

        // Check if token was already used past 15-minute grace window
        const usedAt = shipment.locationTokenUsedAt || shipment.destination?.locationTokenUsedAt;
        if (usedAt) {
            const gracePeriodMs = 15 * 60 * 1000;
            if (now - new Date(usedAt).getTime() > gracePeriodMs) {
                return res.status(410).json({
                    success: false,
                    valid: false,
                    code: 410,
                    error: 'Location pin already confirmed'
                });
            }
        }

        const recipientName = shipment.destination?.contactPerson || shipment.customerName || shipment.recipientName || 'Valued Customer';
        const currentDestination = shipment.destination || {};

        return res.status(200).json({
            success: true,
            valid: true,
            trackingNumber: shipment.trackingNumber,
            recipientName,
            currentDestination,
            status: shipment.status,
            data: {
                trackingNumber: shipment.trackingNumber,
                recipientName,
                status: shipment.status,
                currentDestination,
                destination: currentDestination,
                estimatedDelivery: shipment.estimatedDelivery,
                expiresAt: shipment.locationTokenExpiresAt
            }
        });
    } catch (error) {
        logger.error('Error fetching location by token:', error);
        return res.status(500).json({ success: false, error: 'Failed to retrieve location details' });
    }
};

/**
 * Update shipment destination location via single-use/scoped token
 * @route POST /api/public/location/:token
 * @route PATCH /api/public/location/:token
 * @route POST /api/public/shipments/location/:token
 * @route PATCH /api/public/shipments/location/:token
 */
exports.updateLocationByToken = async (req, res) => {
    try {
        const { token } = req.params;
        if (!token || typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({ success: false, error: 'Location token is required' });
        }

        const cleanToken = token.trim();
        const shipment = await prisma.shipment.findFirst({
            where: { locationToken: cleanToken }
        });

        if (!shipment) {
            return res.status(404).json({
                success: false,
                valid: false,
                error: 'Location link not found or invalid'
            });
        }

        const now = Date.now();
        if (shipment.locationTokenExpiresAt && new Date(shipment.locationTokenExpiresAt).getTime() < now) {
            return res.status(410).json({
                success: false,
                valid: false,
                code: 410,
                error: 'Location link has expired'
            });
        }

        // Check if token was already used past 15-minute grace window
        const existingUsedAt = shipment.locationTokenUsedAt || shipment.destination?.locationTokenUsedAt;
        if (existingUsedAt) {
            const gracePeriodMs = 15 * 60 * 1000;
            if (now - new Date(existingUsedAt).getTime() > gracePeriodMs) {
                return res.status(410).json({
                    success: false,
                    valid: false,
                    code: 410,
                    error: 'Location pin already confirmed'
                });
            }
        }

        // Coordinate extraction: support latitude/longitude, lat/lng, [lng, lat], [lat, lng]
        let lat = null;
        let lng = null;

        if (req.body.latitude !== undefined && req.body.longitude !== undefined) {
            lat = Number(req.body.latitude);
            lng = Number(req.body.longitude);
        } else if (req.body.lat !== undefined && req.body.lng !== undefined) {
            lat = Number(req.body.lat);
            lng = Number(req.body.lng);
        } else if (Array.isArray(req.body.coordinates) && req.body.coordinates.length >= 2) {
            const c0 = Number(req.body.coordinates[0]);
            const c1 = Number(req.body.coordinates[1]);

            // Detect inverted [lat, lng] specifically within Kuwait/GCC regional bounds
            // Kuwait Latitude is ~28.5 to ~30.5; Longitude is ~46.5 to ~49.0
            if (c0 >= 28 && c0 <= 31 && c1 >= 46 && c1 <= 49) {
                lat = c0;
                lng = c1;
            } else if (c1 >= 28 && c1 <= 31 && c0 >= 46 && c0 <= 49) {
                lng = c0;
                lat = c1;
            } else {
                // GeoJSON standard: [longitude, latitude]
                lng = c0;
                lat = c1;
            }
        }

        if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                success: false,
                error: 'Valid latitude and longitude coordinates are required'
            });
        }

        if (lat < -90 || lat > 90) {
            return res.status(400).json({
                success: false,
                error: 'Latitude must be a valid number between -90 and 90'
            });
        }

        if (lng < -180 || lng > 180) {
            return res.status(400).json({
                success: false,
                error: 'Longitude must be a valid number between -180 and 180'
            });
        }

        const oldDestination = shipment.destination || {};
        const formattedAddress = req.body.formattedAddress || req.body.address || oldDestination.formattedAddress || '';
        const deliveryNotes = req.body.deliveryNotes || req.body.notes || req.body.landmark || oldDestination.deliveryNotes || '';
        const buildingName = req.body.buildingName || oldDestination.buildingName || '';
        const unitNumber = req.body.unitNumber || oldDestination.unitNumber || '';
        const floor = req.body.floor || oldDestination.floor || '';
        const landmark = req.body.landmark || oldDestination.landmark || '';
        const city = req.body.city || oldDestination.city || '';
        const state = req.body.state || oldDestination.state || '';
        const postalCode = req.body.postalCode || oldDestination.postalCode || '';
        const country = req.body.country || oldDestination.country || 'Kuwait';
        const countryCode = req.body.countryCode || oldDestination.countryCode || 'KW';
        const streetLines = req.body.streetLines || oldDestination.streetLines || [formattedAddress, ''];

        const submissionTimestamp = new Date();
        const updatedDestination = {
            ...oldDestination,
            formattedAddress,
            latitude: lat,
            longitude: lng,
            coordinates: [lng, lat],
            streetLines,
            city,
            state,
            postalCode,
            country,
            countryCode,
            buildingName,
            unitNumber,
            floor,
            landmark,
            deliveryNotes,
            locationTokenUsedAt: submissionTimestamp.toISOString()
        };

        const existingHistory = Array.isArray(shipment.history) ? shipment.history : [];
        const historyEvent = {
            event: 'LOCATION_CONFIRMED_BY_CUSTOMER',
            status: shipment.status || 'out_for_delivery',
            source: 'consignee_portal',
            description: 'Consignee confirmed exact GPS delivery pin via self-service portal',
            location: formattedAddress || `${city || 'Kuwait'}, Kuwait`,
            coordinates: [lng, lat],
            latitude: lat,
            longitude: lng,
            timestamp: submissionTimestamp.toISOString()
        };
        const updatedHistory = [...existingHistory, historyEvent];

        // Maintain 15-minute grace window for re-edits, then expire
        const graceExpiry = new Date(Date.now() + 15 * 60 * 1000);

        const updateData = {
            destination: updatedDestination,
            history: updatedHistory,
            locationTokenExpiresAt: graceExpiry
        };

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: updateData
        });

        // Audit Log
        try {
            await prisma.shipmentAuditLog.create({
                data: {
                    shipmentId: shipment.id,
                    trackingNumber: shipment.trackingNumber,
                    actorType: 'CONSIGNEE_PORTAL',
                    actorName: shipment.destination?.contactPerson || shipment.customerName || 'Consignee',
                    action: 'LOCATION_CONFIRMED_BY_CUSTOMER',
                    fieldChanges: {
                        oldDestination,
                        newDestination: updatedDestination
                    },
                    ipAddress: req.ip || req.headers['x-forwarded-for'] || null
                }
            });
        } catch (auditErr) {
            logger.warn(`Failed to create audit log for customer GPS confirmation: ${auditErr.message}`);
        }

        logger.info(`Shipment ${shipment.trackingNumber} destination GPS confirmed by customer via token`);

        return res.status(200).json({
            success: true,
            message: 'Delivery location confirmed successfully!',
            trackingNumber: shipment.trackingNumber,
            destination: updatedDestination,
            data: {
                trackingNumber: shipment.trackingNumber,
                destination: updatedDestination
            }
        });
    } catch (error) {
        logger.error('Error updating location by token:', error);
        return res.status(500).json({ success: false, error: 'Failed to update location' });
    }
};

