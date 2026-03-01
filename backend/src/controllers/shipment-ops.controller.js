/**
 * Shipment Ops Controller
 * updateShipmentStatus, generateLabel, pickupShipment, processWarehouseScan
 */
const config = require('../config/config');
const Shipment = require('../models/shipment.model');
const PickupRequest = require('../models/pickupRequest.model');
const pickupController = require('./pickup.controller');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const { SHIPMENT_STATUSES } = require('../constants/statusConstants');

exports.updateShipmentStatus = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { status, description } = req.body;
        if (!status) return res.status(400).json({ success: false, error: 'Status is required' });
        if (!SHIPMENT_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid status '${status}'. Valid: ${SHIPMENT_STATUSES.join(', ')}` });
        }

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        shipment.status = status;
        shipment.history.push({ location: shipment.currentLocation, status, description: description || `Status updated to ${status}`, timestamp: new Date() });
        await shipment.save();
        logger.info(`Shipment ${trackingNumber} status updated to ${status}`);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment status updated successfully' });
    } catch (error) {
        logger.error('Error updating shipment status:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment status', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

exports.generateLabel = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).send('Shipment not found');

        const html = `<!DOCTYPE html><html><head><title>Label - ${trackingNumber}</title>
<style>body{font-family:'Arial',sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:20px}.label-container{width:400px;height:600px;background:#fff;padding:20px;border:2px solid #000;position:relative}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px}.logo{font-size:24px;font-weight:bold;color:#d32f2f}.tracking{font-size:14px;font-weight:bold}.barcode{margin:20px 0;text-align:center;border:1px dashed #ccc;padding:10px}.details{margin-bottom:20px}.section-title{font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:5px}.address-box{border:1px solid #000;padding:10px;margin-bottom:15px}.address-text{font-size:14px;line-height:1.4}.footer{position:absolute;bottom:20px;left:20px;right:20px;text-align:center;font-size:12px;color:#666}.print-btn{position:fixed;bottom:20px;right:20px;padding:10px 20px;background:#000;color:#fff;border:none;cursor:pointer;border-radius:5px}@media print{body{background:#fff;padding:0}.print-btn{display:none}.label-container{border:none;width:100%;height:100%}}</style></head>
<body><div class="label-container">
<div class="header"><div class="logo">TARGET LOGISTICS</div><div class="tracking">TN: ${trackingNumber}</div></div>
<div class="details"><div class="section-title">From (Sender)</div><div class="address-box"><div class="address-text"><strong>${shipment.origin.contactPerson}</strong><br>${shipment.origin.company ? shipment.origin.company + '<br>' : ''}${shipment.origin.formattedAddress}<br>${shipment.origin.city}, ${shipment.origin.postalCode}<br>Ph: ${shipment.origin.phone}</div></div>
<div class="section-title">To (Receiver)</div><div class="address-box"><div class="address-text"><strong>${shipment.destination.contactPerson}</strong><br>${shipment.destination.company ? shipment.destination.company + '<br>' : ''}${shipment.destination.formattedAddress}<br>${shipment.destination.city}, ${shipment.destination.postalCode}<br>Ph: ${shipment.destination.phone}</div></div></div>
<div class="barcode"><h3>*${trackingNumber}*</h3><p>Scan for Details</p></div>
<div class="details"><div class="section-title">Shipment Details</div><p><strong>Status:</strong> ${shipment.status.replace(/_/g, ' ').toUpperCase()}</p><p><strong>Pieces:</strong> ${shipment.items ? shipment.items.length : 1} | <strong>Weight:</strong> ${shipment.items ? shipment.items.reduce((acc, i) => acc + i.weight, 0) : 0} kg</p><p><strong>Date:</strong> ${new Date(shipment.createdAt).toLocaleDateString()}</p></div>
<div class="footer">Thank you for shipping with Target Logistics.<br>Track at: ${config.frontendUrl}</div></div>
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
        let shipment = await Shipment.findOne({ trackingNumber });
        logger.info(`Lookup by tracking ${trackingNumber}: ${shipment ? 'Found' : 'Not Found'}`);

        if (!shipment && trackingNumber.match(/^[0-9a-fA-F]{24}$/)) {
            shipment = await Shipment.findOne({ $or: [{ _id: trackingNumber }, { pickupRequest: trackingNumber }] });
        }

        if (!shipment) {
            if (trackingNumber.match(/^[0-9a-fA-F]{24}$/)) {
                const pickupRequest = await PickupRequest.findById(trackingNumber);
                if (pickupRequest) {
                    if (pickupRequest.status === 'READY_FOR_PICKUP') {
                        try {
                            const result = await pickupController.processApproval(pickupRequest._id, req.user._id);
                            shipment = result.shipment;
                        } catch (approvalError) {
                            logger.error('Auto-approval error on scan:', approvalError);
                            return res.status(500).json({ success: false, error: 'Failed to process pickup request' });
                        }
                    } else {
                        return res.status(400).json({ success: false, error: `Scan failed: This Pickup Request is ${pickupRequest.status}. It must be READY_FOR_PICKUP.` });
                    }
                }
            }
            if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        if (shipment.status === 'picked_up' || shipment.status === 'in_transit') {
            return res.status(200).json({ success: true, data: shipment, message: 'Shipment already picked up' });
        }
        if (!['pending', 'booked', 'ready_for_pickup'].includes(shipment.status)) {
            return res.status(400).json({ success: false, error: `Shipment cannot be picked up (Current status: ${shipment.status})` });
        }

        shipment.status = 'picked_up';
        shipment.history.push({ location: shipment.currentLocation, status: 'picked_up', description: 'Shipment picked up by driver', timestamp: new Date() });
        await shipment.save();
        logger.info(`Shipment ${trackingNumber} picked up by driver ${user.name}`);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment picked up successfully' });
    } catch (error) {
        logger.error('Error in pickupShipment:', error);
        res.status(500).json({ success: false, error: 'Failed to update shipment status' });
    }
};

exports.processWarehouseScan = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { user } = req;
        const { weight, dimensions } = req.body; // New: Accept weight/dims

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
        if (!['admin', 'staff'].includes(user.role)) return res.status(403).json({ success: false, error: 'Only Staff or Admin can process warehouse scans.' });

        const allowedStatuses = ['picked_up', 'booked', 'ready_for_pickup'];
        if (!allowedStatuses.includes(shipment.status)) {
            if (shipment.status === 'in_transit') return res.status(200).json({ success: true, message: 'Shipment already processed (In Transit)' });
            return res.status(400).json({ success: false, error: `Shipment status is ${shipment.status}. Must be 'Picked Up' or 'Ready' to process inbound.` });
        }

        // If weight/dims are provided, we need to update the shipment.
        // We reuse the updateShipment logic (via a direct call or duplicate logic) to ensure ledger adjustments match.
        // Since we are inside the same module/app, we can call the service logic or helper. 
        // Ideally, we should refactor updateShipment logic to a Service, but for now, we will handle it here 
        // by invoking the same re-rating steps if weight changes.

        let rerated = false;
        if (weight || dimensions) {
            // Basic Check: If weight changed significantly
            const currentWeight = shipment.items.reduce((acc, i) => acc + i.weight, 0);
            const newWeight = Number(weight);

            if (newWeight && Math.abs(currentWeight - newWeight) > 0.05) {
                // Update Items (Simplify: Assign total weight to first item or scale?)
                // Strategy: Update the first item's weight to match the total new weight (Simplification for single-piece mostly)
                // Or if we have parcels, update the parcel.

                // Construct fake "updates" object to pass to a re-rating helper if we had one.
                // Since `updateShipment` is a controller, we can't easily call it. 
                // We will rely on the CLIENT to call `updateShipment` SEPARATELY if they change weight, 
                // OR we accept that "Warehouse Scan" is just a status update.

                // REVISION based on Requirement: "Enhance processWarehouseScan to accept Weight Updates".
                // We will perform the update locally. For full re-rating, we should really use the `updateShipment` flow.
                // Let's perform a simple save here, but if we want LEDGER adjustments, we must duplicate the re-rating logic 
                // or (better) Instruct the Frontend to call "Update" first then "Scan".

                // HOWEVER, to be helpful, let's update the PARCELS/ITEMS if provided.
                if (shipment.parcels && shipment.parcels.length > 0) {
                    shipment.parcels[0].weight = newWeight;
                    if (dimensions) shipment.parcels[0].dimensions = dimensions;
                }
                if (shipment.items && shipment.items.length > 0) {
                    shipment.items[0].weight = newWeight;
                }

                // Mark for re-rating (async or synchronous?)
                // Given the complexity of re-rating (API calls + Ledger), relying on `updateShipment` is safer.
                // BUT, to fulfill the request inline:
                // We will just save the new weight. The *missing piece* is that this won't trigger the ledger update 
                // unless we duplicate that logic. 

                // DECISION: For robustness, we will ONLY update the physical properties here. 
                // The correct flow for financial adjustment is:
                // 1. Staff weighs package -> UI detects diff -> UI calls PUT /shipments/:id (Updates Weight + Re-rates + Ledger)
                // 2. Staff clicks "Process Inbound" -> UI calls POST /scan (Updates Status)

                // If we do it here, we risk diverging logic. 
                // I will add a log warning that financial update is skipped if not done via update endpoint.
                logger.warn(`Warehouse Scan updated weight for ${trackingNumber} to ${newWeight}kg. Note: Financial Ledger was NOT updated by this scan. Use PUT /shipments/:id for financial adjustments.`);
            }
        }

        shipment.status = 'in_transit';
        shipment.history.push({ location: shipment.currentLocation, status: 'in_transit', description: `Processed at Warehouse Facility by ${user.name}`, timestamp: new Date() });
        await shipment.save();
        logger.info(`Shipment ${trackingNumber} processed at warehouse by ${user.name}`);
        res.status(200).json({ success: true, data: shipment, message: 'Shipment processed at warehouse' });
    } catch (error) {
        logger.error('Error in processWarehouseScan:', error);
        res.status(500).json({ success: false, error: 'Failed to process warehouse scan' });
    }
};

exports.serveDocument = async (req, res) => {
    try {
        const { trackingNumber, filename } = req.params;
        const { user } = req;

        // 1. Find the shipment and verify access
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

        // Security check: Admin/Staff can see all. Org members can see their own.
        const isStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user.role);
        const isMember = user.organization && shipment.organization && user.organization.toString() === shipment.organization.toString();

        if (!isStaff && !isMember) {
            return res.status(403).json({ success: false, error: 'Unauthorized to view documents for this shipment' });
        }

        // 2. Resolve the file path
        const filePath = path.join(process.cwd(), 'uploads', 'documents', filename);

        // 3. Check if file exists
        if (!fs.existsSync(filePath)) {
            logger.error(`Document not found: ${filePath}`);
            return res.status(404).json({ success: false, error: 'Document file not found' });
        }

        // 4. Serve the file
        res.sendFile(filePath);
    } catch (error) {
        logger.error('Error serving document:', error);
        res.status(500).json({ success: false, error: 'Failed to serve document' });
    }
};
