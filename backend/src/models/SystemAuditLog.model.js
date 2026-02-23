const mongoose = require('mongoose');

const SystemAuditLogSchema = new mongoose.Schema({
    entityType: {
        type: String,
        required: true,
        index: true
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    action: {
        type: String,
        enum: ['CREATE', 'UPDATE', 'DELETE'],
        required: true
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // Null implies System action
    },
    changes: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Object containing exactly what fields changed and their old/new values'
    },
    snapshot: {
        type: mongoose.Schema.Types.Mixed,
        description: 'State of the document after mutation'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SystemAuditLog', SystemAuditLogSchema);
