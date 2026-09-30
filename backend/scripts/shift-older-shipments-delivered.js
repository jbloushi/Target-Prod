const { prisma } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function shiftOlderShipmentsToDelivered() {
    const daysThreshold = parseInt(process.argv[2], 10) || 30;
    const cutoffDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

    console.log('===============================================================');
    console.log(`📦 SHIFTING SHIPMENTS OLDER THAN ${daysThreshold} DAYS TO DELIVERED`);
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

    // Find all candidate shipments older than the threshold
    const candidates = await prisma.shipment.findMany({
        where: {
            status: { in: activeStatuses },
            createdAt: { lte: cutoffDate }
        },
        select: {
            id: true,
            trackingNumber: true,
            status: true,
            carrierCode: true,
            createdAt: true,
            destination: true,
            history: true,
            pricingSnapshot: true
        }
    });

    console.log(`🔍 Found ${candidates.length} active shipments older than ${daysThreshold} days to mark as DELIVERED.\n`);

    if (candidates.length === 0) {
        console.log('✅ No stale non-delivered shipments found in database.');
        return;
    }

    let updatedCount = 0;

    for (const shipment of candidates) {
        const existingHistory = Array.isArray(shipment.history) ? shipment.history : [];
        const hasDeliveredEvent = existingHistory.some(e => String(e.status || '').toLowerCase() === 'delivered');

        const destCity = shipment.destination?.city || shipment.destination?.countryCode || 'Destination';
        const deliveryTimestamp = new Date(shipment.createdAt.getTime() + 4 * 24 * 60 * 60 * 1000); // ~4 days after creation

        const updatedHistory = [...existingHistory];
        if (!hasDeliveredEvent) {
            updatedHistory.push({
                status: 'delivered',
                description: 'Consignment Historical Completion / Archived Delivery',
                source: 'carrier',
                location: destCity,
                timestamp: deliveryTimestamp > new Date() ? new Date() : deliveryTimestamp
            });
        }

        await prisma.shipment.update({
            where: { id: shipment.id },
            data: {
                status: 'delivered',
                history: updatedHistory
            }
        });

        updatedCount++;
        if (updatedCount % 25 === 0 || updatedCount === candidates.length) {
            console.log(`  Processed ${updatedCount}/${candidates.length} shipments...`);
        }
    }

    console.log('\n===============================================================');
    console.log(`✅ SUCCESS: ${updatedCount} historical shipments shifted to DELIVERED.`);
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
    .then(() => process.exit(0));
