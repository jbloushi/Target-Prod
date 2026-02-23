const mongoose = require('mongoose');

const carrierLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    shipment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        index: true
    },
    carrier: {
        type: String,
        required: true, // e.g., 'DHL', 'FEDEX'
        index: true
    },
    endpoint: {
        type: String, // e.g., 'createShipment', 'getRates'
        required: true
    },
    trackingNumber: String,
    requestPayload: {
        type: Object, // Store full JSON
    },
    responsePayload: {
        type: Object, // Store full JSON response
    },
    statusCode: Number, // HTTP Status of the carrier response
    success: Boolean,
    error: String, // Error message if failed
    durationMs: Number,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

module.exports = mongoose.model('CarrierLog', carrierLogSchema);
