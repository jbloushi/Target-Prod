require('dotenv').config();
const { prisma } = require('../src/config/database');
const { syncCarrierTrackingHistory, compactHistory, buildDisplayHistory } = require('../src/controllers/shipment.helpers');
const { normalizeStatus } = require('../src/constants/statusConstants');

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
    const originalHistory = Array.isArray(shipment.history) ? shipment.history : [];
    console.log(`[SyncScript] Existing checkpoints in DB: ${originalHistory.length}`);

    // Pre-clean synthetic placeholder checkpoints
    const cleanedHistory = compactHistory(originalHistory);

    console.log(`[SyncScript] Querying carrier tracking...`);
    const updates = await syncCarrierTrackingHistory({
        ...shipment,
        history: cleanedHistory
    });

    let finalHistory = updates ? updates.history : cleanedHistory;
    let finalStatus = updates ? updates.status : shipment.status;

    // Verify latest event to ensure status isn't prematurely 'delivered'
    if (Array.isArray(finalHistory) && finalHistory.length > 0) {
        const sorted = [...finalHistory].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const latest = sorted[sorted.length - 1];
        const latestDesc = (latest?.description || '').toLowerCase();
        
        if (
            latestDesc.includes('delivery champion') ||
            latestDesc.includes('doorstep') ||
            latestDesc.includes('out for delivery') ||
            latest?.status === 'out_for_delivery'
        ) {
            finalStatus = 'out_for_delivery';
        }
    }

    const dataToUpdate = {
        history: finalHistory,
        status: finalStatus
    };

    if (updates?.actualWeight) dataToUpdate.actualWeight = updates.actualWeight;
    if (updates?.totalPieces) dataToUpdate.totalPieces = updates.totalPieces;

    await prisma.shipment.update({
        where: { id: shipment.id },
        data: dataToUpdate
    });

    console.log(`\n========================================`);
    console.log(`[SyncScript] SUCCESSFUL SYNC & REPAIR`);
    console.log(`========================================`);
    console.log(`Tracking Number: ${shipment.trackingNumber}`);
    console.log(`Carrier:         ${shipment.carrierCode}`);
    console.log(`New Status:      ${finalStatus}`);
    if (dataToUpdate.actualWeight) console.log(`Actual Weight:   ${dataToUpdate.actualWeight} KG`);
    if (dataToUpdate.totalPieces) console.log(`Total Pieces:    ${dataToUpdate.totalPieces}`);
    console.log(`Total Events:    ${finalHistory.length}`);
    console.log(`----------------------------------------`);
    console.log(`Milestone Timeline:`);
    finalHistory.forEach((evt, idx) => {
        const loc = typeof evt.location === 'object' ? (evt.location.formattedAddress || evt.location.city || '') : (evt.location || '');
        console.log(` [${idx + 1}] ${new Date(evt.timestamp).toLocaleString()} | [${evt.status}] ${evt.description} (${loc})`);
    });
    console.log(`========================================\n`);
}

main()
    .catch(err => {
        console.error('[SyncScript Error]', err);
        process.exit(1);
    })
    .finally(() => {
        prisma.$disconnect();
    });
