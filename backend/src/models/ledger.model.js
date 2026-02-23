const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    shipment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: false // Optional for manual adjustments
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['CREDIT', 'DEBIT'],
        required: true
    },
    category: {
        type: String,
        enum: ['SHIPMENT_FEE', 'TOP_UP', 'REFUND', 'ADJUSTMENT'],
        default: 'SHIPMENT_FEE'
    },
    description: {
        type: String,
        required: true
    },
    balanceAfter: {
        type: Number,
        required: true
    },
    reference: {
        type: String, // Tracking number or Internal Ref
        index: true
    },
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

// Index for performance on listing transactions
ledgerSchema.index({ user: 1, createdAt: -1 });

const Ledger = mongoose.model('Ledger', ledgerSchema);

module.exports = Ledger;
