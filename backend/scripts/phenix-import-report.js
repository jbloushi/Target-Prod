require('dotenv').config();

const { prisma, closeDB } = require('../src/config/database');

function arg(name, fallback) {
    const prefix = `--${name}=`;
    const value = process.argv.find(item => item.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
}

async function main() {
    const limit = Math.min(100, Math.max(1, Number(arg('limit', '20')) || 20));
    const status = arg('status', null);
    const runs = await prisma.phenixImportRun.findMany({
        where: status ? { status } : undefined,
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: {
            items: {
                select: {
                    status: true,
                    rawDestination: true,
                    resolvedDestination: true,
                    phoneCountry: true,
                    errorMessage: true,
                    carrierTracking: true,
                    billId: true
                }
            }
        }
    });

    const report = runs.map(run => {
        const conflicts = run.items.filter(item =>
            item.phoneCountry && item.resolvedDestination && item.phoneCountry !== item.resolvedDestination
        );
        const itemStatuses = run.items.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});

        return {
            id: run.id,
            status: run.status,
            carrierFilter: run.carrierFilter,
            window: { from: run.windowFrom, to: run.windowTo },
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            totals: {
                fetched: run.totalFetched,
                matched: run.matchedCount,
                complete: run.completeCount,
                skipped: run.skippedCount,
                created: run.createdCount,
                updated: run.updatedCount,
                errors: run.errorCount,
                destinationConflicts: conflicts.length
            },
            itemStatuses,
            conflicts: conflicts.slice(0, 100).map(item => ({
                billId: item.billId,
                carrierTracking: item.carrierTracking,
                rawDestination: item.rawDestination,
                resolvedDestination: item.resolvedDestination,
                phoneCountry: item.phoneCountry
            })),
            errorMessage: run.errorMessage
        };
    });

    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), count: report.length, runs: report }, null, 2));
}

main()
    .catch(error => {
        console.error(`Phenix import report failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB().catch(() => {});
    });
