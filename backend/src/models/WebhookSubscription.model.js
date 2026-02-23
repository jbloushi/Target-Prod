const mongoose = require('mongoose');

const webhookSubscriptionSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    targetUrl: {
        type: String,
        required: true,
        validate: {
            validator: function (v) {
                return /^(http|https):\/\/[^ "]+$/.test(v);
            },
            message: 'Invalid URL format'
        }
    },
    secret: {
        type: String,
        required: true,
        default: () => require('crypto').randomBytes(24).toString('hex')
    },
    events: [{
        type: String,
        enum: ['shipment.created', 'shipment.status_updated', 'pickup.created', 'pickup.status_updated', '*']
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('WebhookSubscription', webhookSubscriptionSchema);
