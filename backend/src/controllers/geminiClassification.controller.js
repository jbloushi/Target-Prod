const { prisma } = require('../config/database');

exports.getDashboard = async (req, res) => {
    const [total, byDecision, logs, auditLogs] = await Promise.all([
        prisma.geminiClassificationLog.count(),
        prisma.geminiClassificationLog.groupBy({ by: ['decision'], _count: { _all: true } }),
        prisma.geminiClassificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10000 }),
        prisma.systemAuditLog.findMany({ where: { resource: 'carrier_classification_mapping' }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { name: true, email: true } } } })
    ]);
    const groups = new Map();
    for (const log of logs) {
        const key = `${log.provider}|${log.rawStatus || ''}|${log.rawDescription}`;
        const group = groups.get(key) || { key, provider: log.provider, rawStatus: log.rawStatus, rawDescription: log.rawDescription, normalizedStatus: log.normalizedStatus, operationalFlags: log.operationalFlags || [], confidence: log.confidence, decision: log.decision, occurrences: 0, samples: [], lastSeen: log.createdAt };
        group.occurrences += 1;
        if (group.samples.length < 5 && log.trackingNumber) group.samples.push(log.trackingNumber);
        if (new Date(log.createdAt) > new Date(group.lastSeen)) group.lastSeen = log.createdAt;
        groups.set(key, group);
    }
    const canViewAudit = ['admin', 'accounting'].includes(String(req.user?.role || '').toLowerCase());
    res.json({ success: true, data: { total, byDecision, mappings: [...groups.values()], auditLogs: canViewAudit ? auditLogs : [], enabled: process.env.GEMINI_CLASSIFICATION_ENABLED === 'true' } });
};

exports.updateClassification = async (req, res) => {
    const { id } = req.params;
    const { action, normalizedStatus, operationalFlags, reviewNote, provider, rawStatus, rawDescription } = req.body || {};
    const decision = action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'manual_review';
    const data = {
            decision,
            normalizedStatus: normalizedStatus || null,
            operationalFlags: Array.isArray(operationalFlags) ? operationalFlags : [],
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
            reviewNote: reviewNote || null
    };
    let result;
    const previous = provider && rawDescription
        ? await prisma.geminiClassificationLog.findFirst({ where: { provider, rawStatus: rawStatus || null, rawDescription }, orderBy: { createdAt: 'desc' } })
        : await prisma.geminiClassificationLog.findUnique({ where: { id } });
    if (provider && rawDescription) {
        result = await prisma.geminiClassificationLog.updateMany({ where: { provider, rawStatus: rawStatus || null, rawDescription }, data });
    } else {
        result = await prisma.geminiClassificationLog.update({ where: { id }, data });
    }
    await prisma.systemAuditLog.create({ data: {
        userId: req.user.id,
        action: action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'edited',
        resource: 'carrier_classification_mapping',
        resourceId: `${provider || previous?.provider || ''}|${rawStatus || previous?.rawStatus || ''}|${rawDescription || previous?.rawDescription || ''}`,
        oldValues: previous ? { decision: previous.decision, normalizedStatus: previous.normalizedStatus, operationalFlags: previous.operationalFlags } : null,
        newValues: { decision, normalizedStatus: normalizedStatus || null, operationalFlags: Array.isArray(operationalFlags) ? operationalFlags : [], reviewNote: reviewNote || null },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null
    } });
    res.json({ success: true, data: result, message: 'Mapping review saved for all matching events. Shipment data was not changed.' });
};
