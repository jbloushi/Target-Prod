const { prisma } = require('../config/database');

exports.getDashboard = async (req, res) => {
    const [total, byDecision, recent] = await Promise.all([
        prisma.geminiClassificationLog.count(),
        prisma.geminiClassificationLog.groupBy({ by: ['decision'], _count: { _all: true } }),
        prisma.geminiClassificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    ]);
    res.json({ success: true, data: { total, byDecision, recent, enabled: process.env.GEMINI_CLASSIFICATION_ENABLED === 'true' } });
};
