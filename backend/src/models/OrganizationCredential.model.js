const mongoose = require('mongoose');

const organizationCredentialSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    carrierCode: {
        type: String,
        required: true,
        enum: ['DGR', 'DHL', 'FEDEX', 'UPS']
    },
    accountNumber: {
        type: String,
        required: true
    },
    apiKey: {
        type: String,
        required: true
    },
    apiSecretEncrypted: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Ensure one carrier credential per org
organizationCredentialSchema.index({ organization: 1, carrierCode: 1 }, { unique: true });

// Mock encryption helper (In production use actual AES encryption)
organizationCredentialSchema.methods.setSecret = function (rawSecret) {
    // For MVP phase, just base64 encode or simple reversible mask
    this.apiSecretEncrypted = Buffer.from(rawSecret).toString('base64');
};

organizationCredentialSchema.methods.getSecret = function () {
    return Buffer.from(this.apiSecretEncrypted, 'base64').toString('utf8');
};

module.exports = mongoose.model('OrganizationCredential', organizationCredentialSchema);
