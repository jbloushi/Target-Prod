const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['PROCESSING', 'COMPLETED'], required: true },
    expiresAt: { type: Date, required: true, index: { expires: '1m' } } // Auto-delete document after TTL
}, { timestamps: true });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
