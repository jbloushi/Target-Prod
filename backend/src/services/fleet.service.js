/**
 * Fleet Operations & Dispatcher Service
 * Handles delivery run generation, zone clustering, driver stop execution, POD capture, and COD vault reconciliation.
 */
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const chatwootNotificationService = require('./chatwootNotificationService');
const { postJournalEntry } = require('./generalLedger.service');

// Standard Kuwait Governorate Zone Map
const KUWAIT_GOVERNORATES = {
    CAPITAL: ['kuwait city', 'sharq', 'dasman', 'mirgab', 'jibla', 'salhiya', 'bneid al-gar', 'bneid al gar', 'kaifan', 'mansouriya', 'abdullah al-salem', 'nuzha', 'faiha', 'shamiya', 'rawda', 'adailiya', 'khaldiya', 'qadsiya', 'yarmouk', 'shuwaikh', 'rai', 'sulaibikhat', 'doha', 'nahda', 'qairawan'],
    HAWALLI: ['hawalli', 'salmiya', 'rumaithiya', 'jabriya', 'bayan', 'mishref', 'shaab', 'salwa', 'bidaa', 'west mishref', 'mubarak al-abdullah', 'hitteen', 'zahra', 'siddiq', 'salam', 'shuhada'],
    FARWANIYA: ['farwaniya', 'khaitan', 'omariya', 'rabia', 'andalus', 'riggae', 'rehab', 'jleeb al-shuyoukh', 'jleeb', 'dajeej', 'abdullah al-mubarak', 'ardiya', 'firdous', 'sabah al-nasser'],
    AHMADI: ['ahmadi', 'fahaheel', 'mangaf', 'mahboula', 'abu halifa', 'sabahiya', 'reqqa', 'hadiya', 'egaila', 'dhahar', 'fintas', 'wafra', 'khiran', 'sabah al-ahmad', 'bnaider', 'zour'],
    JAHRA: ['jahra', 'saad al-abdullah', 'naeem', 'qasr', 'oyoun', 'naseem', 'taima', 'waha', 'sulaibiya', 'amghara', 'mutlaa', 'abdali'],
    MUBARAK_AL_KABEER: ['mubarak al-kabeer', 'mubarak al kabeer', 'qurain', 'qusoor', 'adan', 'sabah al-salem', 'messila', 'abu fatira', 'abu al-hasaniya', 'funitees', 'funaitees', 'subhan']
};

/**
 * Detect Kuwait Governorate from address text or metadata
 */
function detectKuwaitZone(destination = {}) {
    if (!destination) return 'OTHER';
    const combined = `${destination.governorate || ''} ${destination.city || ''} ${destination.formattedAddress || ''} ${destination.street || ''} ${destination.area || ''}`.toLowerCase();

    for (const [gov, areas] of Object.entries(KUWAIT_GOVERNORATES)) {
        if (combined.includes(gov.toLowerCase().replace(/_/g, ' '))) return gov;
        for (const area of areas) {
            if (combined.includes(area)) return gov;
        }
    }
    return 'OTHER';
}

/**
 * Generate unique Run Number (e.g. RUN-20261001-001)
 */
async function generateRunNumber() {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RUN-${dateStr}-`;
    
    const count = await prisma.deliveryRun.count({
        where: {
            runNumber: {
                startsWith: prefix
            }
        }
    });
    const nextSeq = String(count + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
}

/**
 * Get unassigned shipments ready for dispatch clustered by Zone
 */
async function getDispatchableShipments() {
    const shipments = await prisma.shipment.findMany({
        where: {
            status: { in: ['approved', 'in_warehouse', 'pickup_completed', 'out_for_delivery'] },
            deliveryRunId: null
        },
        orderBy: { createdAt: 'desc' },
        include: {
            user: { select: { id: true, name: true, phone: true } },
            organization: { select: { id: true, name: true } }
        }
    });

    const clustered = {};
    for (const s of shipments) {
        const zone = detectKuwaitZone(s.destination);
        if (!clustered[zone]) clustered[zone] = [];
        clustered[zone].push({
            ...s,
            detectedZone: zone
        });
    }

    return {
        totalPending: shipments.length,
        clusters: clustered
    };
}

/**
 * Create a new Delivery Run with assigned shipments
 */
async function createDeliveryRun({ driverId, vehicleId, zone, shipmentIds = [], notes, createdById }) {
    if (!shipmentIds || shipmentIds.length === 0) {
        throw new Error('At least one shipment must be selected for a delivery run');
    }

    const runNumber = await generateRunNumber();

    // Verify shipments exist and are unassigned
    const shipments = await prisma.shipment.findMany({
        where: { id: { in: shipmentIds } }
    });

    if (shipments.length !== shipmentIds.length) {
        throw new Error('One or more selected shipments could not be found');
    }

    let totalCodExpected = 0;
    for (const s of shipments) {
        if (s.codAmount) {
            totalCodExpected += Number(s.codAmount);
        }
    }

    const run = await prisma.deliveryRun.create({
        data: {
            runNumber,
            driverId: driverId || null,
            vehicleId: vehicleId || null,
            zone: zone || 'ALL',
            status: driverId ? 'ASSIGNED' : 'DRAFT',
            totalStops: shipments.length,
            totalCodExpected,
            notes: notes || null,
            createdById: createdById || null
        }
    });

    // Update shipments to link with this run
    let seq = 1;
    for (const s of shipments) {
        const history = Array.isArray(s.history) ? s.history : [];
        const newHistory = [
            ...history,
            {
                location: s.currentLocation || 'Target Kuwait Hub',
                status: 'out_for_delivery',
                description: `Assigned to Delivery Run ${runNumber}`,
                source: 'fleet_dispatch',
                timestamp: new Date()
            }
        ];

        await prisma.shipment.update({
            where: { id: s.id },
            data: {
                deliveryRunId: run.id,
                stopSequence: seq++,
                assignedDriverId: driverId || s.assignedDriverId,
                status: 'out_for_delivery',
                history: newHistory
            }
        });

        // Trigger WhatsApp Out For Delivery notification to recipient
        try {
            chatwootNotificationService.triggerShipmentNotification('out_for_delivery', {
                ...s,
                status: 'out_for_delivery'
            });
        } catch (notifErr) {
            logger.warn(`Failed sending out_for_delivery WhatsApp for ${s.trackingNumber}:`, notifErr.message);
        }
    }

    return getDeliveryRunById(run.id);
}

/**
 * Get delivery runs with filters
 */
async function getDeliveryRuns({ status, driverId, zone, limit = 50, page = 1 }) {
    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (driverId) where.driverId = driverId;
    if (zone && zone !== 'ALL') where.zone = zone;

    const skip = (page - 1) * limit;

    const [total, runs] = await Promise.all([
        prisma.deliveryRun.count({ where }),
        prisma.deliveryRun.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                driver: { select: { id: true, name: true, phone: true, email: true } },
                vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
                _count: { select: { shipments: true } }
            }
        })
    ]);

    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        runs
    };
}

/**
 * Get full run details by ID including sequenced shipments
 */
async function getDeliveryRunById(id) {
    const run = await prisma.deliveryRun.findUnique({
        where: { id },
        include: {
            driver: { select: { id: true, name: true, phone: true, email: true } },
            vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
            shipments: {
                orderBy: { stopSequence: 'asc' },
                include: {
                    user: { select: { id: true, name: true, phone: true } },
                    organization: { select: { id: true, name: true } }
                }
            }
        }
    });

    if (!run) throw new Error('Delivery run not found');
    return run;
}

/**
 * Get active delivery run for a specific driver
 */
async function getDriverActiveRun(driverId) {
    const run = await prisma.deliveryRun.findFirst({
        where: {
            driverId,
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] }
        },
        orderBy: { createdAt: 'desc' },
        include: {
            vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
            shipments: {
                orderBy: { stopSequence: 'asc' },
                include: {
                    user: { select: { id: true, name: true, phone: true } },
                    organization: { select: { id: true, name: true } }
                }
            }
        }
    });

    return run;
}

/**
 * Driver completes a delivery stop with digital POD & COD collection
 */
async function completeDeliveryStop({
    shipmentId,
    trackingNumber,
    driverId,
    recipientName,
    signatureUrl,
    photoUrl,
    location,
    collectedCodAmount,
    paymentMethod = 'CASH',
    notes
}) {
    const shipment = await prisma.shipment.findFirst({
        where: shipmentId ? { id: shipmentId } : { trackingNumber }
    });

    if (!shipment) throw new Error('Shipment not found');

    const history = Array.isArray(shipment.history) ? shipment.history : [];
    const codAmt = collectedCodAmount !== undefined ? Number(collectedCodAmount) : (shipment.codAmount ? Number(shipment.codAmount) : 0);

    const newHistoryEntry = {
        location: location || shipment.destination?.city || 'Customer Doorstep',
        status: 'delivered',
        description: `Delivered to ${recipientName || 'Recipient'}. POD Signature & Photo recorded. ${codAmt > 0 ? `COD Collected: ${codAmt} KWD via ${paymentMethod}` : ''}`,
        source: 'driver_pod',
        timestamp: new Date()
    };

    const updatedShipment = await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
            status: 'delivered',
            deliveredAt: new Date(),
            podRecipientName: recipientName || null,
            podSignatureUrl: signatureUrl || null,
            podPhotoUrl: photoUrl || null,
            podLocation: location || null,
            podTimestamp: new Date(),
            codStatus: codAmt > 0 ? 'COLLECTED' : shipment.codStatus,
            history: [...history, newHistoryEntry]
        }
    });

    // Update the Delivery Run counters
    if (shipment.deliveryRunId) {
        const run = await prisma.deliveryRun.findUnique({
            where: { id: shipment.deliveryRunId },
            include: { shipments: true }
        });

        if (run) {
            const completedCount = run.shipments.filter(s => s.id === shipment.id || s.status === 'delivered').length;
            const failedCount = run.shipments.filter(s => s.id !== shipment.id && s.status === 'exception').length;
            const newCollected = Number(run.totalCodCollected) + codAmt;

            const isAllFinished = (completedCount + failedCount) >= run.totalStops;

            await prisma.deliveryRun.update({
                where: { id: run.id },
                data: {
                    status: isAllFinished ? 'COMPLETED' : 'IN_TRANSIT',
                    startedAt: run.startedAt || new Date(),
                    completedAt: isAllFinished ? new Date() : null,
                    completedStops: completedCount,
                    failedStops: failedCount,
                    totalCodCollected: newCollected
                }
            });
        }
    }

    // Trigger WhatsApp Delivered notification with Proof of Delivery confirmation
    try {
        chatwootNotificationService.triggerShipmentNotification('delivered', updatedShipment);
    } catch (err) {
        logger.warn(`Failed sending delivered WhatsApp for ${shipment.trackingNumber}:`, err.message);
    }

    return updatedShipment;
}

/**
 * Driver marks a stop as failed / exception
 */
async function recordDeliveryException({
    shipmentId,
    trackingNumber,
    driverId,
    failureReason,
    failureNotes,
    rescheduleDate
}) {
    const shipment = await prisma.shipment.findFirst({
        where: shipmentId ? { id: shipmentId } : { trackingNumber }
    });

    if (!shipment) throw new Error('Shipment not found');

    const history = Array.isArray(shipment.history) ? shipment.history : [];
    const reasonText = failureReason ? failureReason.replace(/_/g, ' ') : 'Delivery Attempt Failed';

    const newHistoryEntry = {
        location: shipment.destination?.city || 'Recipient Location',
        status: 'exception',
        description: `Delivery Failed: ${reasonText}. ${failureNotes ? `Notes: ${failureNotes}` : ''} ${rescheduleDate ? `(Rescheduled for ${rescheduleDate})` : ''}`,
        source: 'driver_exception',
        timestamp: new Date()
    };

    const updatedShipment = await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
            status: 'exception',
            failureReason: failureReason || 'FAILED_ATTEMPT',
            failureNotes: failureNotes || null,
            estimatedDelivery: rescheduleDate ? new Date(rescheduleDate) : shipment.estimatedDelivery,
            history: [...history, newHistoryEntry]
        }
    });

    if (shipment.deliveryRunId) {
        const run = await prisma.deliveryRun.findUnique({
            where: { id: shipment.deliveryRunId },
            include: { shipments: true }
        });

        if (run) {
            const completedCount = run.shipments.filter(s => s.status === 'delivered').length;
            const failedCount = run.shipments.filter(s => s.id === shipment.id || s.status === 'exception').length;
            const isAllFinished = (completedCount + failedCount) >= run.totalStops;

            await prisma.deliveryRun.update({
                where: { id: run.id },
                data: {
                    status: isAllFinished ? 'COMPLETED' : 'IN_TRANSIT',
                    completedStops: completedCount,
                    failedStops: failedCount,
                    completedAt: isAllFinished ? new Date() : null
                }
            });
        }
    }

    return updatedShipment;
}

/**
 * Cashier reconciles Driver COD money bag into the Main Cash Vault (General Ledger)
 */
async function settleDeliveryRunCod(runId, cashierUser) {
    const run = await prisma.deliveryRun.findUnique({
        where: { id: runId },
        include: {
            driver: true,
            shipments: true
        }
    });

    if (!run) throw new Error('Delivery run not found');
    if (run.codSettled) throw new Error('This delivery run COD has already been settled');

    const collectedAmt = Number(run.totalCodCollected);

    // Update run as settled
    const updatedRun = await prisma.deliveryRun.update({
        where: { id: runId },
        data: {
            codSettled: true,
            codSettledAt: new Date()
        }
    });

    // If there is collected cash, post automated journal entry from Driver Cash in Transit to Main Vault
    if (collectedAmt > 0) {
        try {
            await postJournalEntry({
                entryNumber: `REMIT-${run.runNumber}`,
                date: new Date(),
                memo: `Driver COD Remittance: ${run.driver?.name || 'Driver'} for Run ${run.runNumber}`,
                createdById: cashierUser?.id,
                lines: [
                    {
                        accountCode: '1010', // Main Cash Vault / Safe
                        debit: collectedAmt,
                        credit: 0,
                        memo: `Cash received from Driver ${run.driver?.name || ''} - Run ${run.runNumber}`
                    },
                    {
                        accountCode: '1020', // Cash in Transit - Driver COD
                        debit: 0,
                        credit: collectedAmt,
                        memo: `Clearing driver in-transit COD - Run ${run.runNumber}`
                    }
                ]
            });
            logger.info(`COD remittance journal posted for run ${run.runNumber} amount ${collectedAmt} KWD`);
        } catch (glErr) {
            logger.error(`GL posting skipped for run ${run.runNumber}:`, glErr.message);
        }
    }

    return updatedRun;
}

/**
 * Vehicles Management
 */
async function getVehicles() {
    return prisma.vehicle.findMany({
        where: { active: true },
        include: {
            driver: { select: { id: true, name: true, phone: true } },
            _count: { select: { runs: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}

async function createVehicle(data) {
    return prisma.vehicle.create({
        data: {
            plateNumber: data.plateNumber,
            make: data.make || null,
            model: data.model || null,
            year: data.year ? parseInt(data.year) : null,
            driverId: data.driverId || null,
            capacityParcels: data.capacityParcels ? parseInt(data.capacityParcels) : 50,
            capacityWeightKg: data.capacityWeightKg ? parseFloat(data.capacityWeightKg) : 500.0,
            registrationExpiry: data.registrationExpiry ? new Date(data.registrationExpiry) : null,
            insuranceExpiry: data.insuranceExpiry ? new Date(data.insuranceExpiry) : null,
            odometerKm: data.odometerKm ? parseInt(data.odometerKm) : 0,
            notes: data.notes || null
        }
    });
}

async function updateVehicle(id, data) {
    const updateData = { ...data };
    if (updateData.year) updateData.year = parseInt(updateData.year);
    if (updateData.capacityParcels) updateData.capacityParcels = parseInt(updateData.capacityParcels);
    if (updateData.capacityWeightKg) updateData.capacityWeightKg = parseFloat(updateData.capacityWeightKg);
    if (updateData.odometerKm) updateData.odometerKm = parseInt(updateData.odometerKm);
    if (updateData.registrationExpiry) updateData.registrationExpiry = new Date(updateData.registrationExpiry);
    if (updateData.insuranceExpiry) updateData.insuranceExpiry = new Date(updateData.insuranceExpiry);

    return prisma.vehicle.update({
        where: { id },
        data: updateData
    });
}

module.exports = {
    detectKuwaitZone,
    getDispatchableShipments,
    createDeliveryRun,
    getDeliveryRuns,
    getDeliveryRunById,
    getDriverActiveRun,
    completeDeliveryStop,
    recordDeliveryException,
    settleDeliveryRunCod,
    getVehicles,
    createVehicle,
    updateVehicle
};
