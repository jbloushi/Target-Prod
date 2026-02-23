const mongoose = require('mongoose');
const addressSchema = require('./addressSchema');

const pickupRequestSchema = new mongoose.Schema({
    client: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Pickup request must belong to a client']
    },
    status: {
        type: String,
        enum: ['DRAFT', 'READY_FOR_PICKUP', 'APPROVED', 'REJECTED', 'COMPLETED'],
        default: 'DRAFT',
        required: true
    },
    shipment: {
        type: mongoose.Schema.ObjectId,
        ref: 'Shipment',
        default: null
    },
    // Reusing Address Schema for consistency
    sender: {
        type: addressSchema,
        required: true
    },
    receiver: {
        type: addressSchema,
        required: true
    },
    parcels: [{
        weight: Number,
        length: Number,
        width: Number,
        height: Number,
        description: String,
        quantity: {
            type: Number,
            default: 1
        },
        declaredValue: Number
    }],
    serviceCode: {
        type: String,
        default: 'P' // Default to Express Worldwide
    },
    requestedPickupDate: {
        type: Date,
        required: true
    },
    formattedDate: String, // e.g. "2023-10-25" for easy querying
    pickupInstructions: String,

    // Approval/Rejection details
    rejectionReason: String,
    approvedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,

    // Audit Log
    auditLog: [{
        action: String, // CREATED, UPDATED, SUBMITTED, APPROVED, REJECTED, SHIPMENT_CREATED
        actor: {
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        metadata: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
pickupRequestSchema.index({ client: 1, status: 1 });
pickupRequestSchema.index({ status: 1 });

const PickupRequest = mongoose.model('PickupRequest', pickupRequestSchema);

module.exports = PickupRequest;
