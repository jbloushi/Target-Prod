const trytonClient = require('../src/services/tryton/trytonClient');
const { prisma, closeDB } = require('../src/config/database');

async function inspectRemaining() {
  console.log('1. Fetching all carrier waybills in Tryton...');
  const trytonRecords = await trytonClient.modelCall('stock.shipment.out', 'search_read', [], 0, 10000, null, ['carrier_waybill']);
  const trytonSet = new Set(trytonRecords.map(r => r.carrier_waybill).filter(Boolean));
  console.log(`   ✓ Found ${trytonSet.size} shipments in Tryton.\n`);

  console.log('2. Querying all MySQL shipments...');
  const mysqlShipments = await prisma.shipment.findMany({
    include: { user: true, organization: true },
    orderBy: { createdAt: 'desc' }
  });

  const missing = mysqlShipments.filter(s => s.trackingNumber && trytonSet.has(s.trackingNumber) === false);
  console.log(`3. Found ${missing.length} remaining shipments missing from Tryton.\n`);

  console.log('4. Diagnosing exact error for each missing shipment:');
  for (let i = 0; i < Math.min(10, missing.length); i++) {
    const s = missing[i];
    try {
      await trytonClient.mirrorShipment(s);
      console.log(`   ✓ ${s.trackingNumber}: Succeeded on retry!`);
    } catch (err) {
      console.log(`   ✗ ${s.trackingNumber}: ${err.message}`);
      console.log(`     • Merchant Org : ${s.organization?.name || '(None/Null)'}`);
      console.log(`     • User / Client : ${s.user?.email || s.user?.name || '(None/Null)'}`);
      console.log(`     • Destination   : ${s.destination?.city || s.destination?.countryCode || JSON.stringify(s.destination || 'Empty')}`);
      console.log(`     • Total Weight  : ${s.totalWeight || s.weight || 0}`);
      console.log(`     • Price         : ${s.price || 0}`);
    }
  }

  await closeDB().catch(() => {});
  process.exit(0);
}

inspectRemaining().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
