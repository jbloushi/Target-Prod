/**
 * Shipment CRUD Controller
 * createShipment, getAllShipments, getShipmentByTrackingNumber, updateShipment, deleteShipment
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const ShipmentDraftService = require('../services/ShipmentDraftService');
const { handleControllerError } = require('../utils/controllerError');
const { hasCapability, isPlatformRole } = require('../middleware/rbac.policy');
const { canAccessShipment, scopeShipmentWhere } = require('../middleware/authorize.middleware');
const { MANUAL_SHIPMENT_STATUSES, SHIPMENT_STATUSES } = require('../constants/statusConstants');
const { DELETABLE_SHIPMENT_STATUSES, buildShipmentDeleteBlockedMessage } = require('../utils/shipmentDeletionPolicy');
const { syncCarrierTrackingHistory, hasCriticalChanges, canUpdateShipmentStatus, isManualShipment, buildDisplayHistory } = require('./shipment.helpers');
const chatwootNotificationService = require('../services/chatwootNotificationService');

/**
 * Get shipment statistics (Status counts and Monthly volume)
 * @route GET /api/shipments/stats
 */
exports.getShipmentStats = async (req, res) => {
    try {
        const { organizationId } = req.query;
        const where = {};

        if (isPlatformRole(req.user.role) && organizationId) {
            where.organizationId = organizationId === 'none' ? null : organizationId;
        }

        scopeShipmentWhere(req, where);

        // 1. Group by Status
        const statusGroups = await prisma.shipment.groupBy({
            by: ['status'],
            where,
            _count: {
                _all: true
            }
        });

        // 2. Monthly Stats (Last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const monthlyShipments = await prisma.shipment.findMany({
            where: { ...where, createdAt: { gte: sixMonthsAgo } },
            select: { createdAt: true }
        });
        const monthlyStats = Object.values(monthlyShipments.reduce((acc, shipment) => {
            const createdAt = new Date(shipment.createdAt);
            const key = `${createdAt.getFullYear()}-${createdAt.getMonth() + 1}`;
            if (!acc[key]) {
                acc[key] = { year: createdAt.getFullYear(), month: createdAt.getMonth() + 1, count: 0 };
            }
            acc[key].count += 1;
            return acc;
        }, {})).sort((a, b) => (a.year - b.year) || (a.month - b.month));

        const result = {
            total: 0,
            drafts: 0,
            pending: 0,
            pickedUp: 0,
            inTransit: 0,
            delivered: 0,
            exceptions: 0,
            monthly: monthlyStats.map(stat => ({
                month: Number(stat.month),
                year: Number(stat.year),
                count: Number(stat.count)
            }))
        };

        statusGroups.forEach(s => {
            const count = s._count._all;
            result.total += count;
            if (s.status === 'draft') result.drafts += count;
            else if (['pending', 'ready_for_pickup', 'updated'].includes(s.status)) result.pending += count;
            else if (s.status === 'picked_up') result.pickedUp += count;
            else if (['in_transit', 'out_for_delivery'].includes(s.status)) result.inTransit += count;
            else if (s.status === 'delivered') result.delivered += count;
            else if (['exception', 'failed', 'cancelled', 'returned'].includes(s.status)) result.exceptions += count;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error('Error fetching shipment stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
};

/**
 * Create a new shipment (Draft)
 * @route POST /api/shipments
 */
exports.createShipment = async (req, res) => {
    try {
        const shipment = await ShipmentDraftService.createDraft(req.body, req.user);
        logger.info(`Shipment ${shipment.trackingNumber} created (Draft).`);
        chatwootNotificationService.triggerShipmentNotification('shipment_created', shipment);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment created successfully' });
    } catch (error) {
        return handleControllerError(res, error, 'Shipment creation');
    }
};

/**
 * Get shipment by tracking number
 * @route GET /api/shipments/:trackingNumber
 */
exports.getShipmentByTrackingNumber = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        
        if (trackingNumber === 'stats') {
            return exports.getShipmentStats(req, res);
        }

        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true }
                },
                organization: {
                    select: { id: true, name: true }
                },
                notificationLogs: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    select: {
                        id: true,
                        eventType: true,
                        recipientRole: true,
                        recipientName: true,
                        recipientPhone: true,
                        provider: true,
                        chatwootContactId: true,
                        chatwootConversationId: true,
                        templateName: true,
                        status: true,
                        errorMessage: true,
                        sentAt: true,
                        createdAt: true,
                        updatedAt: true
                    }
                }
            }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        // Capability checks
        if (!hasCapability(req.user.role, 'VIEW_COST_DATA')) { 
            shipment.costPrice = null; 
            if (shipment.pricingSnapshot) shipment.pricingSnapshot.carrierRate = null;
        }
        if (!hasCapability(req.user.role, 'VIEW_DOCUMENTS')) { 
            shipment.labelUrl = null; 
            shipment.invoiceUrl = null; 
            shipment.awbUrl = null; 
        }

        // Sync tracking from carrier if needed
        const updates = await syncCarrierTrackingHistory(shipment);
        if (updates) {
            await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                    history: updates.history,
                    status: updates.status
                }
            });
            shipment.history = updates.history;
            shipment.status = updates.status;
        }

        const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
        const originLocation = shipment.origin?.formattedAddress || shipment.origin?.city || '';
        const displayHistory = buildDisplayHistory(rawHistory, { originLocation });
        res.status(200).json({ success: true, data: { ...shipment, rawHistory, displayHistory, history: displayHistory } });
    } catch (error) {
        logger.error('Error fetching shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipment' });
    }
};

/**
 * Get all shipments with filtering and sorting
 * @route GET /api/shipments
 */
exports.getAllShipments = async (req, res) => {
    try {
        const { status, statusIn, q, sortBy, sortOrder, limit = 50, page = 1, organizationId, paid, summary } = req.query;
        const where = {};

        // 1. Status Filters
        if (status) where.status = status;
        if (statusIn) {
            const statuses = String(statusIn).split(',').map(v => v.trim()).filter(Boolean);
            if (statuses.length > 0) where.status = { in: statuses };
        }

        // 2. Organization Filter — enforce tenant isolation for non-platform users
        if (isPlatformRole(req.user.role)) {
            // Platform staff can filter by any org or see all
            if (organizationId) {
                where.organizationId = organizationId === 'none' ? null : organizationId;
            }
        }

        // 3. Payment Filter
        if (paid !== undefined) {
            const isPaid = paid === 'true' || paid === true;
            where.paid = isPaid;
        }

        // 4. Search Query (Tracking, Customer, City)
        if (q) {
            where.OR = [
                { trackingNumber: { contains: q } },
                { customer: { path: '$.name', string_contains: q } },
                { destination: { path: '$.city', string_contains: q } }
            ];
        }

        scopeShipmentWhere(req, where);

        // 5. Pagination & Sorting
        const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const skip = (parsedPage - 1) * parsedLimit;
        
        const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'status', 'estimatedDelivery', 'price', 'trackingNumber'];
        const orderBy = {};
        if (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy)) {
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
        } else {
            orderBy.createdAt = 'desc';
        }

        // 6. Security & Projections
        const canViewCosts = hasCapability(req.user.role, 'VIEW_COST_DATA');
        const canViewDocs = hasCapability(req.user.role, 'VIEW_DOCUMENTS');
        const isSummary = summary === 'true' || summary === '1' || summary === true;

        const shipmentListQuery = {
            where,
            orderBy,
            skip,
            take: parsedLimit
        };

        if (isSummary) {
            shipmentListQuery.select = {
                id: true,
                trackingNumber: true,
                status: true,
                createdAt: true,
                estimatedDelivery: true,
                origin: true,
                destination: true,
                customer: true,
                paid: true,
                totalPaid: true,
                price: true,
                user: { select: { id: true, name: true, email: true, role: true } },
                organization: { select: { id: true, name: true } }
            };
        } else {
            shipmentListQuery.include = {
                user: { select: { id: true, name: true, email: true, role: true } },
                organization: { select: { id: true, name: true } }
            };
        }

        const [shipments, totalCount] = await Promise.all([
            prisma.shipment.findMany(shipmentListQuery),
            prisma.shipment.count({ where })
        ]);

        // Post-process for security
        const sanitizedShipments = shipments.map(s => {
            if (!canViewCosts) {
                delete s.costPrice;
                delete s.markup;
            }
            if (!canViewDocs) {
                delete s.labelUrl;
                delete s.invoiceUrl;
                delete s.awbUrl;
            }
            return s;
        });

        res.status(200).json({
            success: true,
            data: sanitizedShipments,
            pagination: {
                total: totalCount,
                page: parsedPage,
                limit: parsedLimit,
                pages: Math.ceil(totalCount / parsedLimit)
            }
        });
    } catch (error) {
        logger.error('Error fetching shipments:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch shipments' });
    }
};

/**
 * Delete shipment
 * @route DELETE /api/shipments/:trackingNumber
 */
exports.deleteShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { user } = req;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const isAdminOrStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user.role);
        if (!isAdminOrStaff && !canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Not authorized' });

        if (!DELETABLE_SHIPMENT_STATUSES.includes(shipment.status)) {
            const message = buildShipmentDeleteBlockedMessage(shipment.status);
            return res.status(409).json({
                success: false,
                code: 'SHIPMENT_DELETE_NOT_ALLOWED',
                error: message.short,
                message,
                status: shipment.status,
                allowedStatuses: DELETABLE_SHIPMENT_STATUSES
            });
        }

        await prisma.shipment.delete({ where: { id: shipment.id } });
        return res.status(200).json({ success: true, message: 'Shipment deleted successfully' });
    } catch (error) {
        logger.error('Error deleting shipment:', error);
        res.status(500).json({ success: false, error: 'Failed to delete shipment' });
    }
};

/**
 * Update shipment details
 * @route PATCH /api/shipments/:trackingNumber
 */
exports.updateShipment = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const updates = req.body;
        const { user } = req;

        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { organization: true }
        });
        
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        const isAdminOrStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user.role);
        if (!isAdminOrStaff && !canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Not authorized' });

        const allowedFields = ['destination', 'origin', 'items', 'parcels', 'incoterm', 'currency', 'serviceCode', 'status', 'allowPublicLocationUpdate'];
        const manualEditableFields = ['price', 'costPrice', 'estimatedDelivery'];
        const updateData = {};
        let nextOrigin = null;
        let criticalChangesDetected = hasCriticalChanges(shipment, updates);
        const shipmentIsManual = isManualShipment(shipment);
        const shipmentCarrier = String(shipment.carrierCode || '').toUpperCase();
        const shipmentAllowsManualPricing = shipmentIsManual || ['OTE', 'LOGESTECHS'].includes(shipmentCarrier);
        const canManageManualFields = shipmentAllowsManualPricing && ['admin', 'staff', 'manager', 'accounting'].includes(user.role);

        if (updates.status && updates.status !== shipment.status) {
            const validStatuses = shipmentIsManual ? MANUAL_SHIPMENT_STATUSES : SHIPMENT_STATUSES;
            if (!validStatuses.includes(updates.status)) {
                return res.status(400).json({ success: false, error: `Invalid shipment status '${updates.status}'. Valid: ${validStatuses.join(', ')}` });
            }
            if (!canUpdateShipmentStatus(user, shipment, updates.status)) {
                return res.status(403).json({ success: false, error: 'Permission denied to update shipment status' });
            }
        }

        const currentOrigin = shipment.origin && typeof shipment.origin === 'object' ? shipment.origin : {};
        if (updates.origin && typeof updates.origin === 'object') {
            nextOrigin = { ...currentOrigin, ...updates.origin };
        }
        if (updates.dangerousGoods !== undefined) {
            nextOrigin = nextOrigin || { ...currentOrigin };
            nextOrigin.dangerousGoods = updates.dangerousGoods;
        }
        if (updates.insuredValue !== undefined) {
            nextOrigin = nextOrigin || { ...currentOrigin };
            nextOrigin.insuredValue = updates.insuredValue;
        }
        if (updates.optionalServiceCodes !== undefined) {
            nextOrigin = nextOrigin || { ...currentOrigin };
            nextOrigin.optionalServiceCodes = updates.optionalServiceCodes;
        }

        logger.info(`[shipment.update] ${trackingNumber} payload keys: ${Object.keys(updates || {}).join(', ')}`);

        // Filter updates
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) updateData[key] = updates[key];
            if (manualEditableFields.includes(key)) {
                if (!canManageManualFields) return;
                if (key === 'estimatedDelivery') {
                    updateData[key] = updates[key] ? new Date(updates[key]) : null;
                } else if (updates[key] !== '' && updates[key] != null) {
                    updateData[key] = Number(updates[key]);
                }
            }
        });

        if (nextOrigin) {
            updateData.origin = nextOrigin;
        }

        if (canManageManualFields && updates.price !== undefined) {
            const price = Number(updates.price);
            updateData.price = price;
            updateData.pricingSnapshot = {
                ...(shipment.pricingSnapshot || {}),
                carrierRate: Number(updates.costPrice ?? shipment.costPrice ?? 0),
                totalPrice: price,
                currency: updates.currency || shipment.currency || 'KWD',
                policySource: 'manual',
                rulesVersion: 'manual'
            };
        }

        // Handle Status Change History
        if (updates.status && updates.status !== shipment.status) {
            const history = Array.isArray(shipment.history) ? shipment.history : [];
            updateData.history = [
                ...history,
                {
                    status: updates.status,
                    description: updates.statusDescription || updates.description || `Status changed by ${user.name}`,
                    source: 'platform',
                    timestamp: new Date(),
                    location: shipment.currentLocation
                }
            ];
        }

        // --- Dynamic Re-rating Logic ---
        if (criticalChangesDetected && !shipmentIsManual) {
            logger.info(`Critical changes detected for ${trackingNumber}. Initiating re-rating.`);
            try {
                const PricingService = require('../services/pricing.service');
                const CarrierFactory = require('../services/CarrierFactory');
                
                // Merge current state with updates for rating
                const mergedState = { ...shipment, ...updates };
                const carrier = CarrierFactory.getAdapter(mergedState.carrierCode);
                const quotes = await carrier.getRates(mergedState);
                
                const selectedService = quotes.find(q => q.serviceCode === (updates.serviceCode || shipment.serviceCode)) || quotes[0];
                
                // Fetch user for fresh markup resolution
                const targetUser = await prisma.user.findUnique({
                    where: { id: shipment.userId },
                    include: { organization: true }
                });

                const { markup, source } = PricingService.resolveMarkup(targetUser, targetUser.organization, shipment.carrierCode);
                const snapshot = PricingService.createSnapshot(selectedService.totalPrice, markup, selectedService.currency, source);
                const selectedOptionalCodes = new Set(
                    (updates.optionalServiceCodes ?? currentOrigin.optionalServiceCodes ?? [])
                        .map(code => String(code))
                        .filter(Boolean)
                );
                const optionalServices = (selectedService.optionalServices || [])
                    .filter(service => selectedOptionalCodes.has(service.serviceCode))
                    .map(service => {
                        const carrierAmount = Number(PricingService.normalizeAmount(service.totalPrice || 0).toFixed(3));
                        const currency = service.currency || selectedService.currency || shipment.currency || 'KWD';
                        const { markup: optionalMarkup, source: optionalMarkupSource } =
                            PricingService.resolveOptionalServiceMarkup(targetUser, targetUser.organization, mergedState.carrierCode || shipment.carrierCode, service.serviceCode);

                        if (!optionalMarkup) {
                            return {
                                serviceCode: service.serviceCode,
                                serviceName: service.serviceName,
                                totalPrice: carrierAmount,
                                carrierAmount,
                                markupAmount: 0,
                                currency
                            };
                        }

                        const optionalCalc = PricingService.calculateFinalPrice(carrierAmount, optionalMarkup, currency);
                        return {
                            serviceCode: service.serviceCode,
                            serviceName: service.serviceName,
                            totalPrice: Number(optionalCalc.finalPrice.toFixed(3)),
                            carrierAmount,
                            markupAmount: Number(optionalCalc.markupAmount.toFixed(3)),
                            markupPolicySource: optionalMarkupSource,
                            currency
                        };
                    });
                const optionalServicesTotal = optionalServices.reduce((sum, service) => sum + Number(service.totalPrice || 0), 0);
                const estimatedShipmentCost = Number(snapshot.totalPrice || 0);
                snapshot.optionalServices = optionalServices;
                snapshot.optionalServicesTotal = Number(optionalServicesTotal.toFixed(3));
                snapshot.estimatedShipmentCost = Number(estimatedShipmentCost.toFixed(3));
                snapshot.totalPrice = Number((estimatedShipmentCost + optionalServicesTotal).toFixed(3));
                snapshot.declaredCurrency = updates.currency || shipment.currency || selectedService.currency || 'KWD';
                snapshot.insuredValue = updates.insuredValue ?? currentOrigin.insuredValue ?? null;

                const oldPrice = shipment.price || 0;
                const newPrice = snapshot.totalPrice;
                
                updateData.price = newPrice;
                updateData.pricingSnapshot = snapshot;
                updateData.costPrice = snapshot.carrierRate;
                updateData.markupAmount = snapshot.markup;
                updateData.remainingBalance = Number(Math.max(0, (newPrice - Number(shipment.totalPaid || 0))).toFixed(4));

                // Ledger Adjustment
                if (shipment.organizationId && oldPrice !== newPrice) {
                    const financeLedgerService = require('../services/financeLedger.service');
                    const diff = parseFloat((newPrice - oldPrice).toFixed(3));
                    
                    await financeLedgerService.createLedgerEntry(shipment.organizationId, {
                        sourceRepo: 'Shipment',
                        sourceId: shipment.id,
                        amount: Math.abs(diff),
                        entryType: diff > 0 ? 'DEBIT' : 'CREDIT',
                        category: 'ADJUSTMENT',
                        description: `Price adjustment due to shipment update: ${oldPrice} -> ${newPrice}`,
                        reference: trackingNumber,
                        createdBy: user.id
                    });
                }
            } catch (pricingError) {
                logger.error('Automatic re-rating failed:', pricingError);
                return res.status(400).json({ success: false, error: 'Re-rating failed with new details.' });
            }
        }

        const updatedShipment = await prisma.shipment.update({
            where: { id: shipment.id },
            data: updateData
        });

        if (updates.status && updates.status !== shipment.status) {
            const eventType = chatwootNotificationService.mapStatusToNotificationEvent(
                updates.status,
                updates.statusDescription || updates.description
            );
            if (eventType) {
                chatwootNotificationService.triggerShipmentNotification(eventType, updatedShipment);
            }
        }

        res.status(200).json({ success: true, data: updatedShipment });
    } catch (error) {
        logger.error('Error updating shipment:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
