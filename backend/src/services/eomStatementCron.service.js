const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const financeLedgerService = require('./financeLedger.service');

class EomStatementCronService {
    constructor() {
        this.timer = null;
        this.isRunning = false;
        // Interval check: check hourly if it's the 1st day of the month at 02:00
        this.checkIntervalMs = parseInt(process.env.EOM_STATEMENT_CHECK_INTERVAL_MS, 10) || 60 * 60 * 1000;
        this.lastRunMonth = null;
    }

    /**
     * Start the scheduled EOM statement service
     */
    start() {
        if (this.isRunning) {
            logger.warn('[EOM-Cron] Service is already running');
            return;
        }

        this.isRunning = true;
        logger.info('[EOM-Cron] Service initialized');

        this.timer = setInterval(async () => {
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
            // If it's the 1st of the month at or after 02:00 AM UTC and hasn't run this month
            if (now.getDate() === 1 && now.getHours() >= 2 && this.lastRunMonth !== currentMonthKey) {
                this.lastRunMonth = currentMonthKey;
                logger.info('[EOM-Cron] Triggered monthly End-of-Month account statement generation');
                try {
                    await EomStatementCronService.runEomStatementSync();
                } catch (err) {
                    logger.error('[EOM-Cron] Scheduled run failed:', err);
                }
            }
        }, this.checkIntervalMs);

        if (this.timer && typeof this.timer.unref === 'function') {
            this.timer.unref();
        }
    }

    /**
     * Stop the scheduled cron job
     */
    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.info('[EOM-Cron] Service stopped');
        }
    }

    /**
     * Executes the EOM Account Statement process across all active organizations
     * @param {Object} [options]
     * @param {string} [options.targetOrgId] - Optional specific org ID for manual ad-hoc run
     * @param {Date} [options.statementDate] - Statement date (defaults to previous month)
     * @returns {Promise<Object>} Execution summary report
     */
    static async runEomStatementSync(options = {}) {
        const now = options.statementDate ? new Date(options.statementDate) : new Date();
        
        // Calculate previous calendar month range
        const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevMonthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const periodStart = new Date(Date.UTC(prevMonthYear, prevMonthIndex, 1, 0, 0, 0));
        const periodEnd = new Date(Date.UTC(prevMonthYear, prevMonthIndex + 1, 0, 23, 59, 59, 999));

        logger.info(`[EOM-Cron] Generating statements for period: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`);

        const where = { active: true };
        if (options.targetOrgId) {
            where.id = options.targetOrgId;
        }

        const organizations = await prisma.organization.findMany({
            where,
            include: {
                members: {
                    where: { active: true },
                    select: { id: true, name: true, phone: true, email: true, role: true }
                }
            }
        });

        const results = {
            periodStart: periodStart.toISOString().slice(0, 10),
            periodEnd: periodEnd.toISOString().slice(0, 10),
            totalOrganizations: organizations.length,
            processedCount: 0,
            notifiedCount: 0,
            skippedCount: 0,
            errors: []
        };

        for (const org of organizations) {
            try {
                // Check if org has balance or activity
                const [ledgerEntries, currentBalance] = await Promise.all([
                    prisma.organizationLedger.findMany({
                        where: {
                            organizationId: org.id,
                            createdAt: {
                                gte: periodStart,
                                lte: periodEnd
                            }
                        }
                    }),
                    financeLedgerService.getOrganizationBalance(org.id, org.currency || 'KWD')
                ]);

                // If no balance and no activity in the period, skip
                if (ledgerEntries.length === 0 && Number(currentBalance) === 0) {
                    results.skippedCount++;
                    continue;
                }

                let totalDebits = 0;
                let totalCredits = 0;
                for (const entry of ledgerEntries) {
                    const amount = Number(entry.amount || 0);
                    if (entry.entryType === 'DEBIT') {
                        totalDebits += amount;
                    } else if (entry.entryType === 'CREDIT') {
                        totalCredits += amount;
                    }
                }

                const contactPhone = org.billingWhatsappNumber || org.members.find(m => m.phone)?.phone;
                const contactEmail = org.billingEmail || org.members.find(m => m.email)?.email;
                const currency = org.currency || 'KWD';

                const statementSummary = {
                    orgId: org.id,
                    orgName: org.name,
                    currency,
                    periodStart: periodStart.toISOString().slice(0, 10),
                    periodEnd: periodEnd.toISOString().slice(0, 10),
                    periodDebits: Math.round(totalDebits * 1000) / 1000,
                    periodCredits: Math.round(totalCredits * 1000) / 1000,
                    closingBalance: Number(currentBalance),
                    contactPhone,
                    contactEmail
                };

                // If contact phone is present, log statement notification ready
                if (contactPhone) {
                    logger.info(`[EOM-Cron] Statement ready for ${org.name} (Balance: ${currentBalance} ${currency}). Recipient: ${contactPhone}`);
                    results.notifiedCount++;
                }

                results.processedCount++;
            } catch (err) {
                logger.error(`[EOM-Cron] Error processing statement for org ${org.name} (${org.id}):`, err);
                results.errors.push({ orgId: org.id, orgName: org.name, error: err.message });
            }
        }

        logger.info(`[EOM-Cron] Completed statement run: ${results.processedCount} processed, ${results.notifiedCount} notified, ${results.skippedCount} skipped`);
        return results;
    }
}

const eomStatementCronInstance = new EomStatementCronService();
module.exports = eomStatementCronInstance;
