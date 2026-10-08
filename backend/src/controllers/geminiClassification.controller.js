const { prisma } = require('../config/database');

exports.getDashboard = async (req, res) => {
    const [total, byDecision, recent] = await Promise.all([
        prisma.geminiClassificationLog.count(),
        prisma.geminiClassificationLog.groupBy({ by: ['decision'], _count: { _all: true } }),
        prisma.geminiClassificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    ]);
    res.json({ success: true, data: { total, byDecision, recent, enabled: process.env.GEMINI_CLASSIFICATION_ENABLED === 'true' } });
};

exports.updateClassification = async (req, res) => {
    const { id } = req.params;
    const { action, normalizedStatus, operationalFlags, reviewNote } = req.body || {};
    const decision = action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'manual_review';
    const updated = await prisma.geminiClassificationLog.update({
        where: { id },
        data: {
            decision,
            normalizedStatus: normalizedStatus || null,
            operationalFlags: Array.isArray(operationalFlags) ? operationalFlags : [],
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
            reviewNote: reviewNote || null
        }
    });
    res.json({ success: true, data: updated, message: 'Classification review saved. Shipment data was not changed.' });
};
