const mongoose = require('mongoose');

const organizationLedgerSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: false,
        index: true
    },
    // Consolidation of references for better traceability
    sourceRepo: {
        type: String,
        enum: ['Shipment', 'Payment', 'Adjustment', 'Reversal'],
        required: true
    },
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'sourceRepo',
        index: true
    },
    parentEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrganizationLedger',
        index: true // Used for Reversals to point back to the original entry
    },
    amount: {
        type: Number,
        required: true
    },
    entryType: {
        type: String,
        enum: ['DEBIT', 'CREDIT'],
        required: true
    },
    category: {
        type: String,
        enum: ['SHIPMENT_CHARGE', 'PAYMENT', 'ADJUSTMENT', 'REVERSAL', 'ALLOCATION'],
        default: 'SHIPMENT_CHARGE'
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
        type: String,
        index: true
    },
    createdBy: {
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

organizationLedgerSchema.index({ organization: 1, createdAt: -1 });

const OrganizationLedger = mongoose.model('OrganizationLedger', organizationLedgerSchema);

module.exports = OrganizationLedger;
