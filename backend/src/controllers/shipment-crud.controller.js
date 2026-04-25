/**
 * Shipment CRUD Controller
 * createShipment, getAllShipments, getShipmentByTrackingNumber, updateShipment, deleteShipment
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const ShipmentDraftService = require('../services/ShipmentDraftService');
const { handleControllerError } = require('../utils/controllerError');
const { hasCapability, isPlatformRole } = require('../middleware/rbac.policy');
const { MANUAL_SHIPMENT_STATUSES, SHIPMENT_STATUSES } = require('../constants/statusConstants');
const { syncCarrierTrackingHistory, hasCriticalChanges, canUpdateShipmentStatus, isManualShipment } = require('./shipment.helpers');

/**
 * Get shipment statistics (Status counts and Monthly volume)
 * @route GET /api/shipments/stats
 */
exports.getShipmentStats = async (req, res) => {
    try {
        const { organizationId } = req.query;
        const where = {};

        if (organizationId) {
            where.organizationId = organizationId === 'none' ? null : organizationId;
        }

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
        
        let monthlyStats;
        if (organizationId) {
            if (organizationId === 'none') {
                monthlyStats = await prisma.$queryRaw`
                    SELECT MONTH(createdAt) as month, YEAR(createdAt) as year, COUNT(*) as count
                    FROM Shipment
                    WHERE createdAt >= ${sixMonthsAgo} AND organizationId IS NULL
                    GROUP BY year, month ORDER BY year ASC, month ASC
                `;
            } else {
                monthlyStats = await prisma.$queryRaw`
                    SELECT MONTH(createdAt) as month, YEAR(createdAt) as year, COUNT(*) as count
                    FROM Shipment
                    WHERE createdAt >= ${sixMonthsAgo} AND organizationId = ${organizationId}
                    GROUP BY year, month ORDER BY year ASC, month ASC
                `;
            }
        } else {
            monthlyStats = await prisma.$queryRaw`
                SELECT MONTH(createdAt) as month, YEAR(createdAt) as year, COUNT(*) as count
                FROM Shipment
                WHERE createdAt >= ${sixMonthsAgo}
                GROUP BY year, month ORDER BY year ASC, month ASC
            `;
        }

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
                }
            }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
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

        res.status(200).json({ success: true, data: shipment });
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
        } else {
            // Org users are hard-scoped to their own organization / user ID
            if (req.user.organizationId) {
                where.organizationId = req.user.organizationId;
            } else {
                where.userId = req.user.id;
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

        const isOwner = shipment.userId === user.id;
        const isAdminOrStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user.role);
        if (!isAdminOrStaff && !isOwner) return res.status(403).json({ success: false, error: 'Not authorized' });

        if (shipment.status !== 'draft' && shipment.status !== 'ready_for_pickup') {
            return res.status(400).json({ success: false, error: 'Cannot delete shipment that is beyond draft/ready status' });
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

        const isOwner = shipment.userId === user.id;
        const isAdminOrStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user.role);
        if (!isAdminOrStaff && !isOwner) return res.status(403).json({ success: false, error: 'Not authorized' });

        const allowedFields = ['destination', 'origin', 'items', 'parcels', 'incoterm', 'currency', 'serviceCode', 'status', 'allowPublicLocationUpdate'];
        const manualEditableFields = ['price', 'costPrice', 'estimatedDelivery'];
        const updateData = {};
        let nextOrigin = null;
        let criticalChangesDetected = hasCriticalChanges(shipment, updates);
        const shipmentIsManual = isManualShipment(shipment);
        const canManageManualFields = shipmentIsManual && ['admin', 'manager', 'accounting'].includes(user.role);

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

                const oldPrice = shipment.price || 0;
                const newPrice = snapshot.totalPrice;
                
                updateData.price = newPrice;
                updateData.pricingSnapshot = snapshot;
                updateData.costPrice = snapshot.carrierRate;
                updateData.markupAmount = snapshot.markup;

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

        res.status(200).json({ success: true, data: updatedShipment });
    } catch (error) {
        logger.error('Error updating shipment:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
