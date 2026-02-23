const mongoose = require('mongoose');

const paymentAllocationSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    payment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
        required: true,
        index: true
    },
    shipment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: [0.001, 'Amount must be greater than zero']
    },
    isFifo: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'REVERSED'],
        default: 'ACTIVE'
    },
    allocatedAt: {
        type: Date,
        default: Date.now
    },
    reversedAt: Date,
    reversalReason: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reversedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

paymentAllocationSchema.index({ organization: 1, shipment: 1 });

const PaymentAllocation = mongoose.model('PaymentAllocation', paymentAllocationSchema);

module.exports = PaymentAllocation;
