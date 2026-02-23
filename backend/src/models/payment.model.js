const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: [0.001, 'Amount must be greater than zero']
    },
    currency: {
        type: String,
        default: 'KWD'
    },
    status: {
        type: String,
        enum: ['UNAPPLIED', 'PARTIALLY_APPLIED', 'APPLIED'],
        default: 'UNAPPLIED'
    },
    method: {
        type: String,
        default: 'manual'
    },
    reference: {
        type: String,
        maxLength: [100, 'Reference must be under 100 characters'],
        index: true
    },
    notes: {
        type: String,
        maxLength: [1000, 'Notes must be under 1000 characters']
    },
    postedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    ledgerEntry: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrganizationLedger'
    },
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

paymentSchema.index({ organization: 1, postedAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
