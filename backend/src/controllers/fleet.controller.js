/**
 * Fleet Operations Controller
 */
const fleetService = require('../services/fleet.service');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');

/**
 * GET /api/fleet/dispatch-deck
 * Returns unassigned shipments grouped by Kuwait zone, active drivers, and vehicles
 */
exports.getDispatchDeck = async (req, res) => {
    try {
        const [clustersData, drivers, vehicles] = await Promise.all([
            fleetService.getDispatchableShipments(),
            prisma.user.findMany({
                where: { role: 'driver', active: true },
                select: { id: true, name: true, phone: true, email: true }
            }),
            fleetService.getVehicles()
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalPending: clustersData.totalPending,
                clusters: clustersData.clusters,
                drivers,
                vehicles
            }
        });
    } catch (err) {
        return handleControllerError(res, err, 'Get dispatch deck');
    }
};

/**
 * POST /api/fleet/runs
 * Create a new Delivery Run
 */
exports.createRun = async (req, res) => {
    try {
        const { driverId, vehicleId, zone, shipmentIds, notes } = req.body;
        const run = await fleetService.createDeliveryRun({
            driverId,
            vehicleId,
            zone,
            shipmentIds,
            notes,
            createdById: req.user.id
        });

        res.status(201).json({
            success: true,
            data: run,
            message: `Delivery run ${run.runNumber} created successfully`
        });
    } catch (err) {
        return handleControllerError(res, err, 'Create delivery run');
    }
};

/**
 * GET /api/fleet/runs
 * List delivery runs
 */
exports.getRuns = async (req, res) => {
    try {
        const { status, driverId, zone, page, limit } = req.query;
        const result = await fleetService.getDeliveryRuns({
            status,
            driverId,
            zone,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50
        });

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (err) {
        return handleControllerError(res, err, 'Get delivery runs');
    }
};

/**
 * GET /api/fleet/runs/:id
 * Get single run details
 */
exports.getRunDetails = async (req, res) => {
    try {
        const run = await fleetService.getDeliveryRunById(req.params.id);
        res.status(200).json({
            success: true,
            data: run
        });
    } catch (err) {
        return handleControllerError(res, err, 'Get delivery run details');
    }
};

/**
 * GET /api/fleet/driver/active-run
 * Returns current active run for the logged-in driver
 */
exports.getDriverActiveRun = async (req, res) => {
    try {
        const driverId = req.user.id;
        const run = await fleetService.getDriverActiveRun(driverId);

        res.status(200).json({
            success: true,
            data: run
        });
    } catch (err) {
        return handleControllerError(res, err, 'Get driver active run');
    }
};

/**
 * POST /api/fleet/driver/complete-stop
 * Mark stop delivered with POD and collected COD
 */
exports.completeStop = async (req, res) => {
    try {
        const {
            shipmentId,
            trackingNumber,
            recipientName,
            signatureUrl,
            photoUrl,
            location,
            collectedCodAmount,
            paymentMethod,
            notes
        } = req.body;

        const updated = await fleetService.completeDeliveryStop({
            shipmentId,
            trackingNumber,
            driverId: req.user.id,
            recipientName,
            signatureUrl,
            photoUrl,
            location,
            collectedCodAmount,
            paymentMethod,
            notes
        });

        res.status(200).json({
            success: true,
            data: updated,
            message: 'Stop marked as delivered and POD recorded'
        });
    } catch (err) {
        return handleControllerError(res, err, 'Complete delivery stop');
    }
};

/**
 * POST /api/fleet/driver/record-exception
 * Record failed delivery attempt
 */
exports.recordException = async (req, res) => {
    try {
        const {
            shipmentId,
            trackingNumber,
            failureReason,
            failureNotes,
            rescheduleDate
        } = req.body;

        const updated = await fleetService.recordDeliveryException({
            shipmentId,
            trackingNumber,
            driverId: req.user.id,
            failureReason,
            failureNotes,
            rescheduleDate
        });

        res.status(200).json({
            success: true,
            data: updated,
            message: 'Delivery exception recorded'
        });
    } catch (err) {
        return handleControllerError(res, err, 'Record delivery exception');
    }
};

/**
 * POST /api/fleet/runs/:id/settle-cod
 * Cashier reconciles Driver COD into the Main Cash Vault
 */
exports.settleRunCod = async (req, res) => {
    try {
        const run = await fleetService.settleDeliveryRunCod(req.params.id, req.user);
        res.status(200).json({
            success: true,
            data: run,
            message: `COD for run ${run.runNumber} successfully settled into Vault`
        });
    } catch (err) {
        return handleControllerError(res, err, 'Settle run COD');
    }
};

/**
 * GET /api/fleet/vehicles
 */
exports.getVehicles = async (req, res) => {
    try {
        const vehicles = await fleetService.getVehicles();
        res.status(200).json({
            success: true,
            data: vehicles
        });
    } catch (err) {
        return handleControllerError(res, err, 'Get vehicles');
    }
};

/**
 * POST /api/fleet/vehicles
 */
exports.createVehicle = async (req, res) => {
    try {
        const vehicle = await fleetService.createVehicle(req.body);
        res.status(201).json({
            success: true,
            data: vehicle,
            message: 'Vehicle added successfully'
        });
    } catch (err) {
        return handleControllerError(res, err, 'Create vehicle');
    }
};

/**
 * PATCH /api/fleet/vehicles/:id
 */
exports.updateVehicle = async (req, res) => {
    try {
        const vehicle = await fleetService.updateVehicle(req.params.id, req.body);
        res.status(200).json({
            success: true,
            data: vehicle,
            message: 'Vehicle updated successfully'
        });
    } catch (err) {
        return handleControllerError(res, err, 'Update vehicle');
    }
};
