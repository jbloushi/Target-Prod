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

const esc = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};

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
        res.status(200).json({ success: true, data: updated, message: 'Shipment status updated successfully' });
    } catch (error) {
        logger.error('Error updating shipment status:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment status', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

exports.generateLabel = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({ where: { trackingNumber } });
        if (!shipment) return res.status(404).send('Shipment not found');

        const html = `<!DOCTYPE html><html><head><title>Label - ${esc(trackingNumber)}</title>
<style>body{font-family:'Arial',sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:20px}.label-container{width:400px;height:600px;background:#fff;padding:20px;border:2px solid #000;position:relative}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px}.logo{font-size:24px;font-weight:bold;color:#d32f2f}.tracking{font-size:14px;font-weight:bold}.barcode{margin:20px 0;text-align:center;border:1px dashed #ccc;padding:10px}.details{margin-bottom:20px}.section-title{font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:5px}.address-box{border:1px solid #000;padding:10px;margin-bottom:15px}.address-text{font-size:14px;line-height:1.4}.footer{position:absolute;bottom:20px;left:20px;right:20px;text-align:center;font-size:12px;color:#666}.print-btn{position:fixed;bottom:20px;right:20px;padding:10px 20px;background:#000;color:#fff;border:none;cursor:pointer;border-radius:5px}@media print{body{background:#fff;padding:0}.print-btn{display:none}.label-container{border:none;width:100%;height:100%}}</style></head>
<body><div class="label-container">
<div class="header"><div class="logo">TARGET LOGISTICS</div><div class="tracking">TN: ${esc(trackingNumber)}</div></div>
<div class="details"><div class="section-title">From (Sender)</div><div class="address-box"><div class="address-text"><strong>${esc(shipment.origin.contactPerson)}</strong><br>${shipment.origin.company ? esc(shipment.origin.company) + '<br>' : ''}${esc(shipment.origin.formattedAddress || 'N/A')}<br>${esc(shipment.origin.city)}, ${esc(shipment.origin.countryCode)}<br>Ph: ${esc(shipment.origin.phone)}</div></div>
<div class="section-title">To (Receiver)</div><div class="address-box"><div class="address-text"><strong>${esc(shipment.destination.contactPerson)}</strong><br>${shipment.destination.company ? esc(shipment.destination.company) + '<br>' : ''}${esc(shipment.destination.formattedAddress || 'N/A')}<br>${esc(shipment.destination.city)}, ${esc(shipment.destination.countryCode)}<br>Ph: ${esc(shipment.destination.phone)}</div></div></div>
<div class="barcode"><h3>*${esc(trackingNumber)}*</h3><p>Scan for Details</p></div>
<div class="details"><div class="section-title">Shipment Details</div><p><strong>Status:</strong> ${esc((shipment.status || '').replace(/_/g, ' ').toUpperCase())}</p><p><strong>Pieces:</strong> ${Array.isArray(shipment.items) ? shipment.items.length : 1} | <strong>Weight:</strong> ${Array.isArray(shipment.items) ? shipment.items.reduce((acc, i) => acc + (i.weight || 0), 0) : 0} kg</p><p><strong>Date:</strong> ${new Date(shipment.createdAt).toLocaleDateString()}</p></div>
<div class="footer">Thank you for shipping with Target Logistics.<br>Track at: ${esc(config.frontendUrl || 'https://targetlogistics.demo')}</div></div>
<button class="print-btn" onclick="window.print()">Print Label</button></body></html>`;

        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
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
        if (!['admin', 'staff'].includes(user.role)) return res.status(403).json({ success: false, error: 'Only Staff or Admin can process warehouse scans.' });

        const allowedStatuses = ['picked_up', 'booked', 'ready_for_pickup'];
        if (!allowedStatuses.includes(shipment.status)) {
            if (shipment.status === 'in_transit') return res.status(200).json({ success: true, message: 'Shipment already processed (In Transit)' });
            return res.status(400).json({ success: false, error: `Shipment status is ${shipment.status}. Must be 'Picked Up' or 'Ready' to process inbound.` });
        }

        const updateData = { status: 'in_transit' };

        if (weight || dimensions) {
            const currentWeight = Array.isArray(shipment.items) ? shipment.items.reduce((acc, i) => acc + (i.weight || 0), 0) : 0;
            const newWeight = Number(weight);

            if (newWeight && Math.abs(currentWeight - newWeight) > 0.05) {
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
                logger.warn(`Warehouse Scan updated weight for ${trackingNumber} to ${newWeight}kg.`);
            }
        }

        const history = Array.isArray(shipment.history) ? shipment.history : [];
        updateData.history = [
            ...history,
            { 
                location: shipment.currentLocation, 
                status: 'in_transit', 
                description: `Processed at Warehouse Facility by ${user.name}`, 
                timestamp: new Date() 
            }
        ];

        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: updateData
        });

        logger.info(`Shipment ${trackingNumber} processed at warehouse by ${user.name}`);
        res.status(200).json({ success: true, data: updated, message: 'Shipment processed at warehouse' });
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

        if (!canAccessShipment(req, shipment)) {
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
