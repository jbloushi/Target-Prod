require('dotenv').config();
const { prisma } = require('../src/config/database');
const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');

async function main() {
    const trackingArg = process.argv[2] || 'TRK-38290175630';
    console.log(`[SyncScript] Looking up shipment: ${trackingArg}`);

    const cleanNumeric = trackingArg.replace(/^TRK-/i, '').replace(/^ARM-/i, '').trim();

    const shipment = await prisma.shipment.findFirst({
        where: {
            OR: [
                { trackingNumber: trackingArg },
                { trackingNumber: `TRK-${cleanNumeric}` },
                { trackingNumber: cleanNumeric },
                { dhlTrackingNumber: cleanNumeric },
                { carrierShipmentId: cleanNumeric }
            ]
        }
    });

    if (!shipment) {
        console.error(`[SyncScript] Shipment not found for: ${trackingArg}`);
        process.exit(1);
    }

    console.log(`[SyncScript] Found shipment: ID=${shipment.id}, Tracking=${shipment.trackingNumber}, Carrier=${shipment.carrierCode}, CurrentStatus=${shipment.status}`);
    console.log(`[SyncScript] Existing checkpoints: ${Array.isArray(shipment.history) ? shipment.history.length : 0}`);

    console.log(`[SyncScript] Querying carrier tracking...`);
    const updates = await syncCarrierTrackingHistory(shipment);

    if (!updates) {
        console.log(`[SyncScript] No new updates returned by carrier feed.`);
        process.exit(0);
    }

    console.log(`[SyncScript] Received updates!`);
    console.log(`  New Status: ${updates.status}`);
    console.log(`  Total Checkpoints: ${updates.history?.length || 0}`);
    if (updates.actualWeight) console.log(`  Actual Weight: ${updates.actualWeight} KG`);
    if (updates.totalPieces) console.log(`  Total Pieces: ${updates.totalPieces}`);

    const dataToUpdate = {
        history: updates.history,
        status: updates.status
    };
    if (updates.actualWeight) dataToUpdate.actualWeight = updates.actualWeight;
    if (updates.totalPieces) dataToUpdate.totalPieces = updates.totalPieces;

    await prisma.shipment.update({
        where: { id: shipment.id },
        data: dataToUpdate
    });

    console.log(`[SyncScript] Successfully updated database for shipment #${shipment.trackingNumber}!`);
}

main()
    .catch(err => {
        console.error('[SyncScript Error]', err);
        process.exit(1);
    })
    .finally(() => {
        prisma.$disconnect();
    });
