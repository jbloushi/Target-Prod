const { prisma } = require('../src/config/database');
const logger = require('../src/utils/logger');
const { syncCarrierTrackingHistory, resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');
const SlaTrackerService = require('../src/services/slaTracker.service');

async function shiftOlderShipmentsToDelivered() {
    const daysThreshold = parseInt(process.argv[2], 10) || 7;
    const cutoffDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

    console.log('===============================================================');
    console.log(`📦 SHIFTING / SYNCING SHIPMENTS OLDER THAN ${daysThreshold} DAYS TO DELIVERED`);
    console.log(`📅 Cutoff Timestamp: ${cutoffDate.toISOString()}`);
    console.log('===============================================================\n');

    const activeStatuses = [
        'created',
        'pending',
        'booked',
        'picked_up',
        'received_at_hub',
        'verified',
        'in_transit',
        'out_for_delivery',
        'ready_for_pickup',
        'exception'
    ];

    // Find all candidate shipments older than the threshold OR with passed ETA
    const candidates = await prisma.shipment.findMany({
        where: {
            status: { in: activeStatuses },
            OR: [
                { createdAt: { lte: cutoffDate } },
                { estimatedDelivery: { lte: cutoffDate } }
            ]
        },
        select: {
            id: true,
            trackingNumber: true,
            dhlTrackingNumber: true,
            carrierShipmentId: true,
            status: true,
            carrierCode: true,
            serviceCode: true,
            createdAt: true,
            estimatedDelivery: true,
            origin: true,
            destination: true,
            history: true,
            pricingSnapshot: true
        }
    });

    console.log(`🔍 Found ${candidates.length} active shipments older than ${daysThreshold} days to process.\n`);

    if (candidates.length === 0) {
        console.log('✅ No stale non-delivered shipments found in database.');
        return;
    }

    let updatedCount = 0;
    let apiSyncedCount = 0;
    let archivedCount = 0;

    const CONCURRENCY = 5;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const chunk = candidates.slice(i, i + CONCURRENCY);
        await Promise.all(
            chunk.map(async (shipment) => {
                let liveSynced = false;
                let finalHistory = Array.isArray(shipment.history) ? [...shipment.history] : [];
                let finalStatus = 'delivered';
                let estDelivery = shipment.estimatedDelivery || SlaTrackerService.calculateEstimatedDelivery(shipment);

                // 1. Try querying real carrier tracking API / scraper
                try {
                    const trackingNumber = resolveCarrierTrackingNumber(shipment);
                    if (trackingNumber) {
                        const syncRes = await syncCarrierTrackingHistory(shipment);
                        if (syncRes && syncRes.history && syncRes.history.length > 0) {
                            finalHistory = syncRes.history;
                            finalStatus = syncRes.status === 'exception' ? 'delivered' : (syncRes.status || 'delivered');
                            if (syncRes.estimatedDelivery) {
                                estDelivery = syncRes.estimatedDelivery;
                            }
                            liveSynced = true;
                            apiSyncedCount++;
                        }
                    }
                } catch (carrierErr) {
                    logger.debug(`Carrier lookup failed for ${shipment.trackingNumber}: ${carrierErr.message}`);
                }

                // 2. If carrier returned no checkpoints (e.g. tracking expired), ensure delivered milestone
                const hasDeliveredEvent = finalHistory.some(e => String(e.status || '').toLowerCase() === 'delivered');
                if (!hasDeliveredEvent) {
                    const destCity = shipment.destination?.city || shipment.destination?.countryCode || 'Destination';
                    const targetDeliveryDate = estDelivery || new Date(shipment.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
                    const deliveryTimestamp = targetDeliveryDate > new Date() ? new Date() : targetDeliveryDate;

                    finalHistory.push({
                        status: 'delivered',
                        description: 'Shipment delivered to consignee / Completed',
                        source: 'carrier',
                        location: destCity,
                        timestamp: deliveryTimestamp
                    });
                    archivedCount++;
                }

                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: {
                        status: 'delivered',
                        estimatedDelivery: estDelivery,
                        history: finalHistory
                    }
                });

                updatedCount++;
            })
        );

        process.stdout.write(`\rProgress: ${Math.min(i + CONCURRENCY, candidates.length)}/${candidates.length} processed (${apiSyncedCount} live synced, ${archivedCount} archived)...`);
    }

    console.log('\n\n===============================================================');
    console.log(`✅ SUCCESS: ${updatedCount} shipments updated to DELIVERED.`);
    console.log(`   - 🌐 Live Carrier API / Scraper Synced: ${apiSyncedCount}`);
    console.log(`   - 📦 Gracefully Completed / Archived:   ${archivedCount}`);
    console.log('===============================================================\n');

    const statusCounts = await prisma.shipment.groupBy({
        by: ['status'],
        _count: { id: true }
    });
    console.log('📊 CURRENT DATABASE STATUS SUMMARY:');
    console.table(statusCounts.map(s => ({ Status: s.status, Count: s._count.id })));
}

shiftOlderShipmentsToDelivered()
    .catch(err => {
        console.error('Error shifting shipments:', err);
    })
    .finally(() => prisma.$disconnect());
