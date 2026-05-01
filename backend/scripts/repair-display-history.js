#!/usr/bin/env node
const { prisma } = require('../src/config/database');
const { syncCarrierTrackingHistory } = require('../src/controllers/shipment.helpers');

async function run() {
  const batchSize = 200;
  let cursor = null;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const shipments = await prisma.shipment.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' }
    });
    if (!shipments.length) break;

    for (const shipment of shipments) {
      scanned += 1;
      const updates = await syncCarrierTrackingHistory(shipment);
      if (updates) {
        await prisma.shipment.update({ where: { id: shipment.id }, data: { history: updates.history, status: updates.status } });
        updated += 1;
      }
    }

    cursor = shipments[shipments.length - 1].id;
  }

  console.log(JSON.stringify({ ok: true, scanned, updated }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
