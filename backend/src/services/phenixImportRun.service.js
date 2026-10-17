const os = require('os');
const { randomUUID } = require('crypto');
const { prisma } = require('../config/database');

const AUTO_SYNC_LOCK_KEY = 'phenix-auto-sync';
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const PROCESS_OWNER = `${os.hostname()}:${process.pid}:${randomUUID()}`;

function ownerId() {
    return PROCESS_OWNER;
}

function isLocalOwnerDead(ownerStr) {
    if (!ownerStr || typeof ownerStr !== 'string') return false;
    const parts = ownerStr.split(':');
    if (parts.length < 2) return false;
    const [host, pidStr] = parts;
    if (host !== os.hostname()) return false;
    const pid = parseInt(pidStr, 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    if (pid === process.pid) return false;
    try {
        process.kill(pid, 0);
        return false; // Process is alive
    } catch (err) {
        return err && err.code === 'ESRCH'; // Process does not exist (killed/reloaded)
    }
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
        // Check if existing lease is expired, owned by us, owned by a dead local PID (after pm2 reload),
        // or holds a legacy oversized TTL (> ttlMs in the future)
        let forceReclaimOwner = null;
        if (typeof prisma.phenixImportLease.findUnique === 'function') {
            try {
                const current = await prisma.phenixImportLease.findUnique({ where: { lockKey } });
                if (current && current.ownerId) {
                    const remainingMs = current.lockedUntil ? (new Date(current.lockedUntil).getTime() - now.getTime()) : 0;
                    if (isLocalOwnerDead(current.ownerId) || remainingMs > ttlMs) {
                        forceReclaimOwner = current.ownerId;
                    }
                }
            } catch (_) {}
        }

        const orConditions = [
            { lockedUntil: { lt: now } },
            { ownerId: owner }
        ];
        if (forceReclaimOwner) {
            orConditions.push({ ownerId: forceReclaimOwner });
        }

        const renewed = await prisma.phenixImportLease.updateMany({
            where: {
                lockKey,
                OR: orConditions
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

async function renewLease(lease, ttlMs = DEFAULT_LEASE_MS) {
    if (!lease?.lockKey || !lease?.owner || !prisma.phenixImportLease) return false;
    const result = await prisma.phenixImportLease.updateMany({
        where: { lockKey: lease.lockKey, ownerId: lease.owner },
        data: { lockedUntil: new Date(Date.now() + ttlMs) }
    });
    return result.count === 1;
}

async function recoverStaleRuns(maxAgeMs = 15 * 60 * 1000) {
    if (!prisma.phenixImportRun) return 0;
    const result = await prisma.phenixImportRun.updateMany({
        where: {
            status: 'RUNNING',
            startedAt: { lt: new Date(Date.now() - maxAgeMs) }
        },
        data: {
            status: 'TIMED_OUT',
            finishedAt: new Date(),
            errorMessage: 'Import exceeded the maximum runtime and was marked timed out.'
        }
    });
    return result.count;
}

async function createRun({ from, to, carrierFilter, triggeredBy }) {
    if (!prisma.phenixImportRun) return null;
    await recoverStaleRuns();
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
    renewLease,
    releaseLease,
    recoverStaleRuns,
    createRun,
    recordItem,
    finishRun
};
