const SystemAuditLog = require('../models/SystemAuditLog.model');

module.exports = function auditLogPlugin(schema, options = {}) {
    schema.pre('save', async function (next) {
        if (this.isNew) {
            this.$locals.auditData = {
                action: 'CREATE',
                snapshot: this.toObject()
            };
            return next();
        }

        const modifiedPaths = this.modifiedPaths();
        if (modifiedPaths.length === 0) return next();

        try {
            const original = await this.constructor.findById(this._id).lean();
            if (!original) return next();

            const changes = {};
            modifiedPaths.forEach(path => {
                if (path === 'updatedAt') return;

                let oldVal = original[path];
                let newVal = this.get(path);

                if (path.includes('.')) {
                    const parts = path.split('.');
                    oldVal = parts.reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, original);
                }

                changes[path] = {
                    old: oldVal,
                    new: newVal
                };
            });

            if (Object.keys(changes).length > 0) {
                this.$locals.auditData = {
                    action: 'UPDATE',
                    changes,
                    snapshot: this.toObject()
                };
            }
        } catch (e) {
            console.error('Audit Plugin Error:', e);
        }

        next();
    });

    schema.post('save', async function (doc, next) {
        if (doc.$locals && doc.$locals.auditData) {
            try {
                // If a controller wants to log who did this, they assign doc._actor = req.user._id before saving
                const actor = doc._actor || null;

                await SystemAuditLog.create({
                    entityType: doc.constructor.modelName,
                    entityId: doc._id,
                    action: doc.$locals.auditData.action,
                    actor: actor,
                    changes: doc.$locals.auditData.changes,
                    snapshot: doc.$locals.auditData.snapshot
                });
            } catch (error) {
                console.error('Audit Log DB Write Failed:', error);
            }
        }
        next();
    });
};
