const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    subscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WebhookSubscription',
        required: true
    },
    event: {
        type: String,
        required: true,
        index: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending',
        index: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastAttemptAt: {
        type: Date
    },
    lastError: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
