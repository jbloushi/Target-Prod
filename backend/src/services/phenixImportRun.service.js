const os = require('os');
const { randomUUID } = require('crypto');
const { prisma } = require('../config/database');

const AUTO_SYNC_LOCK_KEY = 'phenix-auto-sync';
const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const PROCESS_OWNER = `${os.hostname()}:${process.pid}:${randomUUID()}`;

function ownerId() {
    return PROCESS_OWNER;
}

async function acquireLease(lockKey = AUTO_SYNC_LOCK_KEY, ttlMs = DEFAULT_LEASE_MS) {
    if (!prisma.phenixImportLease) return { acquired: true, owner: null, lockKey, unavailable: true };
    const owner = ownerId();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    try {
        await prisma.phenixImportLease.create({
            data: { lockKey, ownerId: owner, lockedUntil }
        });
        return { acquired: true, owner, lockKey };
    } catch (error) {
        // A unique-key race is expected when another PM2 worker created the lease.
        const renewed = await prisma.phenixImportLease.updateMany({
            where: {
                lockKey,
                OR: [
                    { lockedUntil: { lt: now } },
                    { ownerId: owner }
                ]
            },
            data: { ownerId: owner, lockedUntil }
        });
        return { acquired: renewed.count === 1, owner, lockKey };
    }
}

async function releaseLease(lease) {
    if (!lease?.lockKey || !lease?.owner) return;
    if (!prisma.phenixImportLease) return;
    await prisma.phenixImportLease.deleteMany({
        where: { lockKey: lease.lockKey, ownerId: lease.owner }
    });
}

async function createRun({ from, to, carrierFilter, triggeredBy }) {
    if (!prisma.phenixImportRun) return null;
    return prisma.phenixImportRun.create({
        data: {
            windowFrom: new Date(Date.UTC(from.year, from.month - 1, from.day)),
            windowTo: new Date(Date.UTC(to.year, to.month - 1, to.day)),
            carrierFilter,
            triggeredBy: triggeredBy || null
        }
    });
}

async function recordItem(runId, item) {
    if (!runId || !prisma.phenixImportItem) return null;
    return prisma.phenixImportItem.create({
        data: {
            runId,
            sourceKey: item.sourceKey,
            billId: item.billId || null,
            receiptNo: item.receiptNo || null,
            carrierTracking: item.carrierTracking || null,
            derivedCarrier: item.derivedCarrier || null,
            rawDestination: item.rawDestination || null,
            resolvedDestination: item.resolvedDestination || null,
            phoneCountry: item.phoneCountry || null,
            status: item.status || 'PENDING',
            shipmentId: item.shipmentId || null,
            errorMessage: item.errorMessage || null,
            rawRow: item.rawRow || undefined
        }
    });
}

async function finishRun(runId, summary, status = 'SUCCESS', errorMessage = null) {
    if (!runId || !prisma.phenixImportRun) return null;
    return prisma.phenixImportRun.update({
        where: { id: runId },
        data: {
            status,
            finishedAt: new Date(),
            totalFetched: summary.totalFetched || 0,
            matchedCount: summary.matchedCount || 0,
            completeCount: summary.completeCount || 0,
            skippedCount: summary.skippedIncompleteCount || 0,
            createdCount: summary.createdCount || 0,
            updatedCount: summary.updatedCount || 0,
            errorCount: summary.errors?.length || 0,
            summary,
            errorMessage
        }
    });
}

module.exports = {
    AUTO_SYNC_LOCK_KEY,
    acquireLease,
    releaseLease,
    createRun,
    recordItem,
    finishRun
};
