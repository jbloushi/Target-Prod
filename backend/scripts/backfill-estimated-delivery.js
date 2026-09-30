const { prisma } = require('../src/config/database');
const logger = require('../src/utils/logger');
const SlaTrackerService = require('../src/services/slaTracker.service');

/**
 * Backfills missing estimatedDelivery on existing shipments using SLA calculations
 */
async function backfillEstimatedDelivery() {
    console.log('===============================================================');
    console.log('📦 BACKFILLING ESTIMATED DELIVERY DATES ON EXISTING SHIPMENTS');
    console.log('===============================================================\n');

    try {
        const nullEtaShipments = await prisma.shipment.findMany({
            where: {
                estimatedDelivery: null
            },
            select: {
                id: true,
                trackingNumber: true,
                carrierCode: true,
                serviceCode: true,
                status: true,
                createdAt: true,
                origin: true,
                destination: true
            }
        });

        console.log(`Found ${nullEtaShipments.length} shipment(s) with missing estimatedDelivery.`);

        if (nullEtaShipments.length === 0) {
            console.log('✅ All shipments already have estimatedDelivery populated!');
            return;
        }

        let updatedCount = 0;
        const BATCH_SIZE = 50;

        for (let i = 0; i < nullEtaShipments.length; i += BATCH_SIZE) {
            const batch = nullEtaShipments.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async (s) => {
                    const estDelivery = SlaTrackerService.calculateEstimatedDelivery(s);
                    if (estDelivery) {
                        await prisma.shipment.update({
                            where: { id: s.id },
                            data: { estimatedDelivery: estDelivery }
                        });
                        updatedCount++;
                    }
                })
            );
            process.stdout.write(`\rProgress: ${Math.min(i + BATCH_SIZE, nullEtaShipments.length)}/${nullEtaShipments.length} processed...`);
        }

        console.log(`\n\n✅ Successfully updated estimatedDelivery for ${updatedCount} shipments!`);
    } catch (error) {
        console.error('❌ Backfill failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

backfillEstimatedDelivery();
