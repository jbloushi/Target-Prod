const mongoose = require('mongoose');
const crypto = require('crypto');

const ApiClientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    apiKeyHash: {
        type: String,
        required: true,
        select: false
    },
    apiKeyLast4: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    allowedCarriers: [{
        type: String,
        enum: ['DGR', 'DHL', 'FEDEX', 'UPS'],
        default: ['DGR']
    }],
    webhookUrl: {
        type: String,
        trim: true
    },
    rateLimit: {
        type: Number,
        default: 100 // requests per minute
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Helper to generate a new API Key securely
ApiClientSchema.methods.generateKey = async function () {
    const rawBytes = crypto.randomBytes(24).toString('hex');
    // Ensure we have an ID first so we can form the compound key
    if (!this._id) {
        this._id = new mongoose.Types.ObjectId();
    }
    const fullKey = `sk_live_${this._id.toString()}_${rawBytes}`;

    const bcrypt = require('bcryptjs');
    this.apiKeyHash = await bcrypt.hash(fullKey, 12);
    this.apiKeyLast4 = rawBytes.slice(-4);

    return fullKey;
};

module.exports = mongoose.model('ApiClient', ApiClientSchema);
