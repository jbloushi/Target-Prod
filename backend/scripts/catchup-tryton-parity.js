const trytonClient = require('../src/services/tryton/trytonClient');
const auditor = require('../src/services/tryton/parityAuditor');
const { prisma, closeDB } = require('../src/config/database');

async function runSafeCatchup() {
  console.log('================================================================');
  console.log('   🚀 RUNNING TRYTON CATCH-UP & STATUS SYNCHRONIZATION');
  console.log('================================================================\n');

  // 1. Fetch all existing waybills in Tryton
  console.log('1. Loading existing shipments from Tryton ERP...');
  const trytonRecords = await trytonClient.modelCall('stock.shipment.out', 'search_read', [], 0, 10000, null, ['id', 'carrier_waybill', 'state']);
  const trytonMap = new Map();
  for (const r of trytonRecords) {
    if (r.carrier_waybill) trytonMap.set(r.carrier_waybill, r);
  }
  console.log('   ✓ Found ' + trytonMap.size + ' existing shipments in Tryton.\n');

  // 2. Fetch all MySQL shipments
  console.log('2. Querying live MySQL shipments...');
  const mysqlShipments = await prisma.shipment.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log('   ✓ Found ' + mysqlShipments.length + ' total shipments in MySQL.\n');

  // 3. Mirror the missing shipments
  const missing = mysqlShipments.filter(s => s.trackingNumber && !trytonMap.has(s.trackingNumber));
  console.log('3. Mirroring ' + missing.length + ' missing shipments into Tryton...');
  let createdCount = 0;
  for (let i = 0; i < missing.length; i++) {
    const s = missing[i];
    try {
      const res = await trytonClient.mirrorShipment(s);
      if (res && res.trytonShipmentId) {
        trytonMap.set(s.trackingNumber, { id: res.trytonShipmentId, carrier_waybill: s.trackingNumber, state: 'client_submitted' });
        createdCount++;
      }
    } catch (err) {
      // Gracefully continue on single record error
    }
    if ((i + 1) % 50 === 0 || i === missing.length - 1) {
      console.log('   • Progress: ' + (i + 1) + ' / ' + missing.length + ' processed (' + createdCount + ' created)');
    }
  }
  console.log('   ✅ Successfully created ' + createdCount + ' shipments in Tryton.\n');

  // 4. Synchronize states from client_submitted -> reality
  console.log('4. Fast-forwarding shipment states to match carrier milestones...');
  let advancedCount = 0;
  for (let i = 0; i < mysqlShipments.length; i++) {
    const s = mysqlShipments[i];
    const tr = trytonMap.get(s.trackingNumber);
    if (!tr) continue;

    // If Tryton is client_submitted but real status is booked, in_transit, out_for_delivery, delivered
    if (tr.state === 'client_submitted' && ['booked', 'in_transit', 'out_for_delivery', 'delivered'].includes(s.status)) {
      try {
        await trytonClient.modelCall('stock.shipment.out', 'receive_at_hub', [tr.id]);
        await trytonClient.modelCall('stock.shipment.out', 'verify', [tr.id]);
        await trytonClient.modelCall('stock.shipment.out', 'book_carrier', [tr.id]);
        if (s.status === 'delivered') {
          await trytonClient.modelCall('stock.shipment.out', 'done', [tr.id]);
        }
        advancedCount++;
      } catch (e) {
        // Continue safely
      }
    } else if (tr.state === 'client_submitted' && s.status === 'cancelled') {
      try {
        await trytonClient.modelCall('stock.shipment.out', 'cancel', [tr.id]);
        advancedCount++;
      } catch (e) {}
    }

    if ((i + 1) % 200 === 0 || i === mysqlShipments.length - 1) {
      console.log('   • Verified ' + (i + 1) + ' / ' + mysqlShipments.length + ' (' + advancedCount + ' states advanced)');
    }
  }
  console.log('   ✅ Successfully advanced ' + advancedCount + ' shipment lifecycles in Tryton.\n');

  // 5. Run Parity Verification
  console.log('5. Running Parity Audit Verification...');
  const audit = await auditor.auditShipmentParity(100);
  const ledgerAudit = await auditor.auditLedgerInvariant();
  const trytonTotal = await trytonClient.modelCall('stock.shipment.out', 'search_count', []);
  const mysqlTotal = await prisma.shipment.count();

  console.log('\n================================================================');
  console.log('   📊 POST CATCH-UP RESULTS');
  console.log('================================================================');
  console.log('• MySQL Total Shipments     : ' + mysqlTotal);
  console.log('• Tryton Total Shipments    : ' + trytonTotal);
  console.log('• Volume Delta Remaining    : ' + (mysqlTotal - trytonTotal));
  console.log('• Recent 100 Match Rate     : ' + audit.matchRate + '%');
  console.log('• Status Mismatches         : ' + audit.mismatched);
  console.log('• Missing In Tryton         : ' + audit.missing);
  console.log('• Ledger Total Debits       : ' + (ledgerAudit?.totalDebit ?? '0.000') + ' KWD');
  console.log('• Ledger Total Credits      : ' + (ledgerAudit?.totalCredit ?? '0.000') + ' KWD');
  console.log('• Ledger Invariant Drift    : ' + (ledgerAudit?.drift ?? '0.000') + ' KWD (' + (ledgerAudit?.isInvariantHold ? 'PERFECT INVARIANT' : 'DRIFT DETECTED') + ')');
  console.log('================================================================\n');

  await closeDB().catch(() => {});
  process.exit(0);
}

runSafeCatchup().catch(err => {
  console.error('Fatal Catch-up Error:', err);
  process.exit(1);
});
