/**
 * Shipment Ops Controller
 * updateShipmentStatus, generateLabel, pickupShipment, processWarehouseScan
 */
const config = require('../config/config');
const { prisma } = require('../config/database');
const pickupController = require('./pickup.controller');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const { SHIPMENT_STATUSES, MANUAL_SHIPMENT_STATUSES } = require('../constants/statusConstants');
const { canUpdateShipmentStatus, isManualShipment } = require('./shipment.helpers');
const { canAccessShipment } = require('../middleware/authorize.middleware');
const chatwootNotificationService = require('../services/chatwootNotificationService');

exports.updateShipmentStatus = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { status, description } = req.body;
        if (!status) return res.status(400).json({ success: false, error: 'Status is required' });
        if (!SHIPMENT_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid status '${status}'. Valid: ${SHIPMENT_STATUSES.join(', ')}` });
        }

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        if (isManualShipment(shipment) && !MANUAL_SHIPMENT_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid manual shipment status '${status}'. Valid: ${MANUAL_SHIPMENT_STATUSES.join(', ')}` });
        }

        if (!canUpdateShipmentStatus(req.user, shipment, status)) {
            return res.status(403).json({ success: false, error: 'Permission denied to update shipment status' });
        }

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        const newHistoryEntry = {
            location: shipment.currentLocation,
            status,
            description: description || `Status updated to ${status} by ${req.user.name}`,
            source: 'platform',
            timestamp: new Date()
        };

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                status,
                history: [...history, newHistoryEntry]
            }
        });

        logger.info(`Shipment ${trackingNumber} status updated to ${status}`);
        const eventType = chatwootNotificationService.mapStatusToNotificationEvent(status, description);
        if (eventType) {
            chatwootNotificationService.triggerShipmentNotification(eventType, updated);
        }
        res.status(200).json({ success: true, data: updated, message: 'Shipment status updated successfully' });
    } catch (error) {
        logger.error('Error updating shipment status:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment status', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

const escapeHtml = (unsafe) => {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

exports.generateLabel = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).send('Shipment not found');
        if (!canAccessShipment(req, shipment)) return res.status(403).send('Permission denied');

        const origin = shipment.origin && typeof shipment.origin === 'object' ? shipment.origin : {};
        const destination = shipment.destination && typeof shipment.destination === 'object' ? shipment.destination : {};
        const safeTrackingNumber = escapeHtml(trackingNumber);
        const safeOriginContact = escapeHtml(origin.contactPerson || '');
        const safeOriginCompany = origin.company ? `${escapeHtml(origin.company)}<br>` : '';
        const safeOriginAddress = escapeHtml(origin.formattedAddress || 'N/A');
        const safeOriginCity = escapeHtml(origin.city || '');
        const safeOriginCountry = escapeHtml(origin.countryCode || '');
        const safeOriginPhone = escapeHtml(origin.phone || '');

        const safeDestContact = escapeHtml(destination.contactPerson || '');
        const safeDestCompany = destination.company ? `${escapeHtml(destination.company)}<br>` : '';
        const safeDestAddress = escapeHtml(destination.formattedAddress || 'N/A');
        const safeDestCity = escapeHtml(destination.city || '');
        const safeDestCountry = escapeHtml(destination.countryCode || '');
        const safeDestPhone = escapeHtml(destination.phone || '');

        const safeStatus = escapeHtml((shipment.status || '').replace(/_/g, ' ').toUpperCase());
        const safePieces = Array.isArray(shipment.items) ? shipment.items.length : 1;
        const safeWeight = Array.isArray(shipment.items) ? shipment.items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0) : 0;
        const safeDate = escapeHtml(new Date(shipment.createdAt || Date.now()).toLocaleDateString());
        const safeTrackUrl = escapeHtml(config.frontendUrl || 'https://targetlogistics.demo');

        const html = `<!DOCTYPE html><html><head><title>Label - ${safeTrackingNumber}</title>
<style>body{font-family:'Arial',sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:20px}.label-container{width:400px;height:600px;background:#fff;padding:20px;border:2px solid #000;position:relative}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px}.logo{font-size:24px;font-weight:bold;color:#d32f2f}.tracking{font-size:14px;font-weight:bold}.barcode{margin:20px 0;text-align:center;border:1px dashed #ccc;padding:10px}.details{margin-bottom:20px}.section-title{font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:5px}.address-box{border:1px solid #000;padding:10px;margin-bottom:15px}.address-text{font-size:14px;line-height:1.4}.footer{position:absolute;bottom:20px;left:20px;right:20px;text-align:center;font-size:12px;color:#666}.print-btn{position:fixed;bottom:20px;right:20px;padding:10px 20px;background:#000;color:#fff;border:none;cursor:pointer;border-radius:5px}@media print{body{background:#fff;padding:0}.print-btn{display:none}.label-container{border:none;width:100%;height:100%}}</style></head>
<body><div class="label-container">
<div class="header"><div class="logo">TARGET LOGISTICS</div><div class="tracking">TN: ${safeTrackingNumber}</div></div>
<div class="details"><div class="section-title">From (Sender)</div><div class="address-box"><div class="address-text"><strong>${safeOriginContact}</strong><br>${safeOriginCompany}${safeOriginAddress}<br>${safeOriginCity}, ${safeOriginCountry}<br>Ph: ${safeOriginPhone}</div></div>
<div class="section-title">To (Receiver)</div><div class="address-box"><div class="address-text"><strong>${safeDestContact}</strong><br>${safeDestCompany}${safeDestAddress}<br>${safeDestCity}, ${safeDestCountry}<br>Ph: ${safeDestPhone}</div></div></div>
<div class="barcode"><h3>*${safeTrackingNumber}*</h3><p>Scan for Details</p></div>
<div class="details"><div class="section-title">Shipment Details</div><p><strong>Status:</strong> ${safeStatus}</p><p><strong>Pieces:</strong> ${safePieces} | <strong>Weight:</strong> ${safeWeight} kg</p><p><strong>Date:</strong> ${safeDate}</p></div>
<div class="footer">Thank you for shipping with Target Logistics.<br>Track at: ${safeTrackUrl}</div></div>
<button class="print-btn" onclick="window.print()">Print Label</button></body></html>`;

        res.send(html);
    } catch (error) {
        logger.error('Error generating label:', error);
        res.status(500).send('Failed to generate label');
    }
};

exports.pickupShipment = async (req, res) => {
    try {
        const trackingNumber = req.params.trackingNumber.trim();
        const { user } = req;
        if (user.role !== 'driver' && user.role !== 'staff' && user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        logger.info(`Processing pickup for: [${trackingNumber}]`);
        // We match by trackingNumber natively.
        let shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        logger.info(`Lookup by tracking ${trackingNumber}: ${shipment ? 'Found' : 'Not Found'}`);

        // If not found by tracking number, but matches UUID format, check ID
        if (!shipment && trackingNumber.match(/^[0-9a-fA-F-]{36}$/)) {
            shipment = await prisma.shipment.findUnique({ where: { id: trackingNumber } });
            
            if (!shipment) {
                const pickupRequest = await prisma.pickupRequest.findUnique({ where: { id: trackingNumber } });
                if (pickupRequest) {
                    if (pickupRequest.status === 'READY_FOR_PICKUP' || pickupRequest.status === 'pending') {
                        try {
                            const result = await pickupController.processApproval(pickupRequest.id, req.user.id);
                            shipment = result.shipment;
                        } catch (approvalError) {
                            logger.error('Auto-approval error on scan:', approvalError);
                            return res.status(500).json({ success: false, error: 'Failed to process pickup request' });
                        }
                    } else {
                        return res.status(400).json({ success: false, error: `Scan failed: This Pickup Request is ${pickupRequest.status}.` });
                    }
                }
            }
        }

        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        if (shipment.status === 'picked_up' || shipment.status === 'in_transit') {
            return res.status(200).json({ success: true, data: shipment, message: 'Shipment already picked up' });
        }
        if (!['pending', 'draft', 'booked', 'ready_for_pickup'].includes(shipment.status)) {
            return res.status(400).json({ success: false, error: `Shipment cannot be picked up (Current status: ${shipment.status})` });
        }

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        const newHistory = { 
            location: shipment.currentLocation, 
            status: 'picked_up', 
            description: 'Shipment picked up by driver', 
            timestamp: new Date() 
        };

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                status: 'picked_up',
                history: [...history, newHistory]
            }
        });

        logger.info(`Shipment ${trackingNumber} picked up by driver ${user.name}`);
        res.status(200).json({ success: true, data: updated, message: 'Shipment picked up successfully' });
    } catch (error) {
        logger.error('Error in pickupShipment:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment status' });
    }
};

exports.processWarehouseScan = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { user } = req;
        const { weight, dimensions } = req.body;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });
        if (!['admin', 'staff'].includes(user.role)) return res.status(403).json({ success: false, error: 'Only Staff or Admin can process warehouse scans.' });

        const allowedStatuses = ['picked_up', 'booked', 'ready_for_pickup', 'received_at_hub', 'verified', 'in_transit'];
        if (!allowedStatuses.includes(shipment.status)) {
            return res.status(400).json({ success: false, error: `Shipment status is ${shipment.status}. Must be in inbound/intake status to process.` });
        }

        const nextStatus = req.body.action === 'receive' ? 'received_at_hub' : (req.body.action === 'verify' ? 'verified' : 'in_transit');
        const updateData = { status: nextStatus };

        let discrepancyDetected = false;
        let weightDifference = 0;

        if (weight || dimensions) {
            const currentWeight = Array.isArray(shipment.parcels) && shipment.parcels.length > 0
                ? shipment.parcels.reduce((acc, p) => acc + (Number(p.weight) || 0), 0)
                : (Array.isArray(shipment.items) ? shipment.items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0) : 0);
            
            const newWeight = Number(weight);

            if (newWeight && Math.abs(currentWeight - newWeight) > 0.05) {
                discrepancyDetected = true;
                weightDifference = Number((newWeight - currentWeight).toFixed(3));

                const parcels = Array.isArray(shipment.parcels) ? shipment.parcels : [];
                const items = Array.isArray(shipment.items) ? shipment.items : [];

                if (parcels.length > 0) {
                    parcels[0].weight = newWeight;
                    if (dimensions) parcels[0].dimensions = dimensions;
                    updateData.parcels = parcels;
                }
                if (items.length > 0) {
                    items[0].weight = newWeight;
                    updateData.items = items;
                }
                logger.warn(`Warehouse Scan updated weight for ${trackingNumber}: declared ${currentWeight}kg -> actual ${newWeight}kg (diff: ${weightDifference}kg)`);
            }
        }

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        const description = discrepancyDetected
            ? `Hub intake verified by ${user.name}: Weight discrepancy of ${weightDifference > 0 ? '+' : ''}${weightDifference} kg recorded on certified scale.`
            : `Processed at Warehouse Hub facility (${nextStatus}) by ${user.name}`;

        updateData.history = [
            ...history,
            { 
                location: shipment.currentLocation, 
                status: nextStatus, 
                description, 
                timestamp: new Date() 
            }
        ];

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: updateData
        });

        logger.info(`Shipment ${trackingNumber} processed at warehouse by ${user.name} -> ${nextStatus}`);
        
        const eventType = chatwootNotificationService.mapStatusToNotificationEvent(nextStatus, description);
        if (eventType) {
            chatwootNotificationService.triggerShipmentNotification(eventType, updated);
        }

        res.status(200).json({ 
            success: true, 
            data: updated, 
            discrepancyDetected,
            weightDifference,
            message: `Shipment processed at warehouse as ${nextStatus}` 
        });
    } catch (error) {
        logger.error('Error in processWarehouseScan:', error);
        res.status(500).json({ success: false, error: 'Failed to process warehouse scan' });
    }
};

exports.serveDocument = async (req, res) => {
    try {
        const { trackingNumber, filename } = req.params;
        const { user } = req;

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Unauthorized to view documents for this shipment' });

        const isStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user.role);
        const isMember = user.organizationId && shipment.organizationId && user.organizationId === shipment.organizationId;

        if (!isStaff && !isMember) {
            return res.status(403).json({ success: false, error: 'Unauthorized to view documents for this shipment' });
        }

        // Prevent path traversal: reject any filename containing directory separators or dots
        if (!filename || /[/\\]/.test(filename) || filename.includes('..')) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }

        const uploadsDir = path.resolve(process.cwd(), 'uploads', 'documents');
        const filePath = path.resolve(uploadsDir, filename);

        // Ensure resolved path is still within the uploads directory
        if (!filePath.startsWith(uploadsDir + path.sep)) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }

        if (!fs.existsSync(filePath)) {
            logger.error(`Document not found: ${filePath}`);
            return res.status(404).json({ success: false, error: 'Document file not found' });
        }

        res.sendFile(filePath);
    } catch (error) {
        logger.error('Error serving document:', error);
        res.status(500).json({ success: false, error: 'Failed to serve document' });
    }
};

exports.sendPaymentLink = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { recipientRole = 'sender' } = req.body || {};

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        let shipmentForSend = shipment;
        if (recipientRole) {
            shipmentForSend = {
                ...shipment,
                origin: recipientRole === 'sender' ? shipment.origin : { ...(shipment.origin || {}), phone: null },
                destination: recipientRole === 'receiver' ? shipment.destination : { ...(shipment.destination || {}), phone: null }
            };
        }

        chatwootNotificationService.triggerShipmentNotification('payment_link_ready', shipmentForSend, { force: true });

        const baseUrl = config.publicTrackingBaseUrl || config.frontendUrl || 'http://localhost:3000';
        const paymentLink = `${String(baseUrl).replace(/\/+$/, '')}/pay/${encodeURIComponent(trackingNumber)}`;

        logger.info(`[PaymentLink] Dispatched payment link for ${trackingNumber} to ${recipientRole}`);
        res.status(200).json({
            success: true,
            message: 'Payment link dispatched via WhatsApp successfully',
            paymentLink
        });
    } catch (error) {
        logger.error('Error sending payment link:', error);
        res.status(500).json({ success: false, error: 'Failed to send payment link' });
    }
};

/**
 * Generate End-of-Day (EOD) Carrier Dispatch & Handover Manifest
 */
exports.generateCarrierManifest = async (req, res) => {
    try {
        const { carrier, status, shipmentIds, startDate, endDate, hub = 'Kuwait Central Sorting Facility' } = req.body || {};
        
        const whereClause = {};

        // Scope to user's accessible organization if org role
        if (req.user && req.user.role && req.user.role !== 'SUPERADMIN' && req.user.role !== 'ADMIN' && req.user.role !== 'DISPATCHER' && req.user.role !== 'ACCOUNTING') {
            if (req.user.organizationId) {
                whereClause.organizationId = req.user.organizationId;
            }
        }

        if (carrier && carrier !== 'ALL') {
            whereClause.carrierCode = { contains: carrier };
        }

        if (status) {
            whereClause.status = status;
        }

        if (Array.isArray(shipmentIds) && shipmentIds.length > 0) {
            whereClause.OR = [
                { id: { in: shipmentIds } },
                { trackingNumber: { in: shipmentIds } },
                { dhlTrackingNumber: { in: shipmentIds } }
            ];
        }

        if (startDate || endDate) {
            whereClause.createdAt = {};
            if (startDate) whereClause.createdAt.gte = new Date(startDate);
            if (endDate) whereClause.createdAt.lte = new Date(endDate);
        }

        const shipments = await prisma.shipment.findMany({
            where: whereClause,
            include: {
                organization: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 250
        });

        let totalPieces = 0;
        let totalActualWeight = 0;
        let totalVolumetricWeight = 0;
        let totalDeclaredValue = 0;

        const manifestItems = shipments.map((s, idx) => {
            const parcels = Array.isArray(s.parcels) ? s.parcels : [];
            const pieces = parcels.length > 0 
                ? parcels.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0) 
                : 1;
            const actualWeight = parseFloat(s.actualWeight || 0);
            const volumetricWeight = parseFloat(s.volumetricWeight || 0);
            const declaredValue = parseFloat(s.declaredValue || 0);

            totalPieces += pieces;
            totalActualWeight += actualWeight;
            totalVolumetricWeight += volumetricWeight;
            totalDeclaredValue += declaredValue;

            const origin = s.origin || {};
            const destination = s.destination || {};

            return {
                seq: idx + 1,
                id: s.id,
                trackingNumber: s.trackingNumber,
                carrierTrackingNumber: s.dhlTrackingNumber || s.carrierShipmentId || s.trackingNumber,
                carrier: s.carrierCode || carrier || 'STANDARD',
                serviceType: s.serviceCode || s.shipmentType || 'EXPRESS',
                pieces,
                actualWeight,
                volumetricWeight,
                chargeableWeight: s.chargeableWeight ? parseFloat(s.chargeableWeight) : Math.max(actualWeight, volumetricWeight),
                declaredValue,
                currency: s.currency || 'KWD',
                senderName: origin.company || origin.contactPerson || origin.fullName || 'Shipper',
                senderCity: origin.city || origin.country || 'Kuwait',
                receiverName: destination.company || destination.contactPerson || destination.fullName || 'Consignee',
                receiverCity: destination.city || destination.country || 'Destination',
                destinationCountry: destination.country || destination.countryCode || 'KW',
                status: s.status,
                createdAt: s.createdAt
            };
        });

        const now = new Date();
        const manifestNumber = `MNF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const manifestData = {
            manifestNumber,
            carrier: carrier || 'ALL',
            hub,
            dispatcherName: req.user?.name || 'Dispatcher',
            generatedAt: now.toISOString(),
            summary: {
                totalShipments: shipments.length,
                totalPieces,
                totalActualWeight: Number(totalActualWeight.toFixed(3)),
                totalVolumetricWeight: Number(totalVolumetricWeight.toFixed(3)),
                totalBillableWeight: Number(Math.max(totalActualWeight, totalVolumetricWeight).toFixed(3)),
                totalDeclaredValue: Number(totalDeclaredValue.toFixed(2))
            },
            items: manifestItems
        };

        res.status(200).json({ success: true, data: manifestData });
    } catch (error) {
        logger.error('Error generating carrier manifest:', error);
        res.status(500).json({ success: false, error: 'Failed to generate carrier manifest' });
    }
};

/**
 * Confirm delivery with digital signature & Proof-of-Delivery (POD)
 */
exports.confirmDeliveryWithPod = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const {
            recipientName,
            recipientRelationship = 'Self',
            signatureDataUrl,
            photoUrl,
            notes,
            coordinates,
            codCollected = 0
        } = req.body || {};

        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        const existingDocs = (shipment.documents && typeof shipment.documents === 'object') ? shipment.documents : {};

        const podData = {
            recipientName: recipientName || shipment.destination?.contactPerson || 'Recipient',
            recipientRelationship,
            signatureDataUrl: signatureDataUrl || null,
            photoUrl: photoUrl || null,
            deliveredAt: new Date().toISOString(),
            driverId: req.user?.id || null,
            driverName: req.user?.name || 'Driver',
            notes: notes || 'Delivered to consignee with signature',
            coordinates: coordinates || null,
            codCollected: parseFloat(codCollected || 0)
        };

        const newHistoryEntry = {
            location: shipment.currentLocation || shipment.destination,
            status: 'DELIVERED',
            description: `Delivered to ${podData.recipientName} (${podData.recipientRelationship}) by ${podData.driverName}`,
            source: 'driver_pod',
            timestamp: new Date(),
            pod: podData
        };

        const updateData = {
            status: 'DELIVERED',
            history: [...history, newHistoryEntry],
            documents: {
                ...existingDocs,
                pod: podData
            }
        };

        if (podData.codCollected > 0 && shipment.codAmount) {
            updateData.codStatus = 'COLLECTED';
        }

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: updateData
        });

        logger.info(`[POD] Shipment ${trackingNumber} marked as DELIVERED with POD signature by ${req.user?.name || 'Driver'}`);
        chatwootNotificationService.triggerShipmentNotification('delivered', updated);

        res.status(200).json({
            success: true,
            data: updated,
            message: 'Proof of Delivery recorded and shipment marked as DELIVERED successfully'
        });
    } catch (error) {
        logger.error('Error recording proof of delivery:', error);
        res.status(500).json({ success: false, error: 'Failed to record proof of delivery' });
    }
};

/**
 * Manual Admin/Staff trigger to execute carrier tracking synchronization batch
 */
exports.triggerCarrierSync = async (req, res) => {
    try {
        const carrierSyncCronService = require('../services/carrierSyncCron.service');
        const { limit = 20, carrier } = req.body || {};

        const result = await carrierSyncCronService.runSyncBatch({
            limit: Number(limit) || 20,
            carrier
        });

        res.status(200).json({
            success: true,
            data: result,
            message: `Carrier synchronization batch completed: ${result.synced} checked, ${result.updated} updated.`
        });
    } catch (error) {
        logger.error('Error triggering carrier sync:', error);
        res.status(500).json({ success: false, error: 'Failed to trigger carrier sync batch' });
    }
};


