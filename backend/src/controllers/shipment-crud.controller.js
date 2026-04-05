/**
 * Shipment CRUD Controller
 * createShipment, getAllShipments, getShipmentByTrackingNumber, updateShipment, deleteShipment
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const ShipmentDraftService = require('../services/ShipmentDraftService');
const { handleControllerError } = require('../utils/controllerError');
const { hasCapability } = require('../middleware/rbac.policy');
const { syncCarrierTrackingHistory, hasCriticalChanges } = require('./shipment.helpers');

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

        // 2. Organization Filter
        if (organizationId) {
            where.organizationId = organizationId === 'none' ? null : organizationId;
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
        
        const orderBy = {};
        if (sortBy) {
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
        } else {
            orderBy.createdAt = 'desc';
        }

        // 6. Security & Projections
        const canViewCosts = hasCapability(req.user.role, 'VIEW_COST_DATA');
        const canViewDocs = hasCapability(req.user.role, 'VIEW_DOCUMENTS');
        const isSummary = summary === 'true' || summary === '1' || summary === true;

        const [shipments, totalCount] = await Promise.all([
            prisma.shipment.findMany({
                where,
                orderBy,
                skip,
                take: parsedLimit,
                include: {
                    user: { select: { id: true, name: true, email: true, role: true } },
                    organization: { select: { id: true, name: true } }
                }
            }),
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
            if (isSummary) {
                // Return only specific fields for list view optimization
                return {
                    id: s.id,
                    trackingNumber: s.trackingNumber,
                    status: s.status,
                    createdAt: s.createdAt,
                    estimatedDelivery: s.estimatedDelivery,
                    origin: s.origin,
                    destination: s.destination,
                    customer: s.customer,
                    paid: s.paid,
                    totalPaid: s.totalPaid,
                    price: s.price,
                    organization: s.organization,
                    user: s.user
                };
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
        const isAdminOrStaff = ['admin', 'staff'].includes(user.role);
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
        const isAdminOrStaff = ['admin', 'staff'].includes(user.role);
        if (!isAdminOrStaff && !isOwner) return res.status(403).json({ success: false, error: 'Not authorized' });

        const allowedFields = ['destination', 'origin', 'items', 'parcels', 'incoterm', 'currency', 'dangerousGoods', 'serviceCode', 'status', 'allowPublicLocationUpdate'];
        const updateData = {};
        let criticalChangesDetected = hasCriticalChanges(shipment, updates);

        // Filter updates
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) updateData[key] = updates[key];
        });

        // Handle Status Change History
        if (updates.status && updates.status !== shipment.status) {
            const history = Array.isArray(shipment.history) ? shipment.history : [];
            updateData.history = [
                ...history,
                {
                    status: updates.status,
                    description: `Status changed by ${user.name}`,
                    timestamp: new Date(),
                    location: shipment.currentLocation
                }
            ];
        }

        // --- Dynamic Re-rating Logic ---
        if (criticalChangesDetected) {
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
                updateData.markup = snapshot.markup;

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

