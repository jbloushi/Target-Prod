require('dotenv').config();
const { prisma } = require('../src/config/database');
const { syncCarrierTrackingHistory, compactHistory, buildDisplayHistory, resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');
const { normalizeStatus } = require('../src/constants/statusConstants');

async function main() {
    const args = process.argv.slice(2);
    const shouldFix = args.includes('--fix') || args.includes('-f') || args.includes('--sync');
    const isAll = args.includes('--all') || args.includes('-a');
    const limitArg = args.find(a => a.startsWith('--limit='));
    const customLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
    const specificTracking = args.find(a => !a.startsWith('-')) || null;

    console.log(`\n================================================================`);
    console.log(`🔍 TARGET LOGISTICS — SHIPMENT TRACKING INVESTIGATION & AUDIT`);
    console.log(`Mode: ${shouldFix ? '⚡ AUDIT & AUTO-REPAIR (--fix)' : '📋 READ-ONLY AUDIT (pass --fix to repair)'}`);
    if (isAll) console.log(`Scope: ALL shipments in database`);
    if (specificTracking) console.log(`Filter: ${specificTracking}`);
    console.log(`================================================================\n`);

    const where = {};
    if (specificTracking) {
        const cleanNumeric = specificTracking.replace(/^TRK-/i, '').replace(/^ARM-/i, '').trim();
        where.OR = [
            { trackingNumber: specificTracking },
            { trackingNumber: `TRK-${cleanNumeric}` },
            { trackingNumber: cleanNumeric },
            { dhlTrackingNumber: cleanNumeric },
            { carrierShipmentId: cleanNumeric }
        ];
    } else {
        // Audit non-draft shipments
        where.status = { not: 'draft' };
    }

    const take = specificTracking ? 10 : (isAll ? undefined : (customLimit || 50));

    const shipments = await prisma.shipment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...(take ? { take } : {})
    });

    if (shipments.length === 0) {
        console.log(`No shipments found matching the criteria.`);
        process.exit(0);
    }

    console.log(`Auditing ${shipments.length} shipments...\n`);

    const anomalies = [];
    let fixedCount = 0;

    for (let i = 0; i < shipments.length; i++) {
        const s = shipments[i];
        const rawHistory = Array.isArray(s.history) ? s.history : [];
        const carrierTrackingNum = resolveCarrierTrackingNumber(s);
        const issues = [];

        // Check 1: Empty or minimal history
        const hasRealCarrierEvents = rawHistory.some(e => {
            const desc = (e?.description || '').toLowerCase();
            const loc = (typeof e?.location === 'string' ? e.location : (e?.location?.formattedAddress || e?.location?.city || '')).toLowerCase();
            return !desc.includes('manifested under') && !loc.includes('operations gateway') && !desc.includes('synchronized from phenix') && !desc.includes('phenix erp') && e.source !== 'platform';
        });

        if (rawHistory.length === 0) {
            issues.push('EMPTY_HISTORY (0 events)');
        } else if (!hasRealCarrierEvents && s.carrierCode && s.carrierCode !== 'INTERNAL' && s.carrierCode !== 'MANUAL') {
            issues.push('NO_CARRIER_EVENTS (Only platform/draft baseline)');
        }

        // Check 2: Synthetic manifested placeholder present
        const hasSynthetic = rawHistory.some(e => {
            const desc = (e?.description || '').toLowerCase();
            const loc = (typeof e?.location === 'string' ? e.location : (e?.location?.formattedAddress || e?.location?.city || '')).toLowerCase();
            return desc.includes('manifested under') || loc.includes('operations gateway');
        });
        if (hasSynthetic) {
            issues.push('SYNTHETIC_MANIFEST_PLACEHOLDER');
        }

        // Check 3: Premature delivered status check
        let latestEvent = null;
        if (rawHistory.length > 0) {
            const sorted = [...rawHistory].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
            latestEvent = sorted[sorted.length - 1];
        }

        const latestDesc = (latestEvent?.description || '').toLowerCase();
        const latestStatus = (latestEvent?.status || '').toLowerCase();
        const isLatestOutForDelivery = latestDesc.includes('delivery champion') ||
            latestDesc.includes('doorstep') ||
            latestDesc.includes('out for delivery') ||
            latestStatus === 'out_for_delivery';

        if (s.status === 'delivered' && isLatestOutForDelivery) {
            issues.push(`PREMATURE_DELIVERED (DB='delivered' but latest checkpoint='${latestEvent?.description}')`);
        }

        // Print shipment row summary
        const statusBadge = s.status === 'delivered' ? '✅ DELIVERED' : s.status === 'out_for_delivery' ? '🚚 OUT_FOR_DELIVERY' : `📦 ${s.status.toUpperCase()}`;
        console.log(`[${i + 1}] ${s.trackingNumber} | Carrier: ${s.carrierCode || 'N/A'} (AWB: ${carrierTrackingNum || 'None'}) | Status: ${statusBadge}`);
        console.log(`    Events: ${rawHistory.length} | Latest: ${latestEvent ? `[${latestEvent.status}] ${latestEvent.description} (${new Date(latestEvent.timestamp).toLocaleDateString()})` : 'None'}`);

        if (issues.length > 0) {
            console.log(`    ⚠️  ANOMALIES DETECTED:`);
            issues.forEach(iss => console.log(`       - ${iss}`));
            anomalies.push({ shipment: s, issues });

            // Repair if requested
            if (shouldFix) {
                console.log(`    🔧 Attempting repair...`);
                try {
                    // Strip synthetic events
                    const cleanedHistory = compactHistory(rawHistory);
                    const updates = await syncCarrierTrackingHistory({
                        ...s,
                        history: cleanedHistory
                    });

                    let finalHistory = updates ? updates.history : cleanedHistory;
                    let finalStatus = updates ? updates.status : s.status;

                    // Ensure status is corrected if latest event is out for delivery
                    if (Array.isArray(finalHistory) && finalHistory.length > 0) {
                        const sortedFinal = [...finalHistory].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
                        const lastFinal = sortedFinal[sortedFinal.length - 1];
                        const lastDesc = (lastFinal?.description || '').toLowerCase();
                        if (
                            lastDesc.includes('delivery champion') ||
                            lastDesc.includes('doorstep') ||
                            lastDesc.includes('out for delivery') ||
                            lastFinal?.status === 'out_for_delivery'
                        ) {
                            finalStatus = 'out_for_delivery';
                        }
                    }

                    const dataToUpdate = {
                        history: finalHistory,
                        status: finalStatus
                    };

                    if (updates?.actualWeight || updates?.totalPieces) {
                        dataToUpdate.pricingSnapshot = {
                            ...(s.pricingSnapshot && typeof s.pricingSnapshot === 'object' ? s.pricingSnapshot : {}),
                            carrierWeight: updates.actualWeight || s.pricingSnapshot?.carrierWeight,
                            carrierPieces: updates.totalPieces || s.pricingSnapshot?.carrierPieces
                        };
                    }

                    await prisma.shipment.update({
                        where: { id: s.id },
                        data: dataToUpdate
                    });

                    fixedCount++;
                    console.log(`    ✅ REPAIRED: Status -> ${finalStatus}, Checkpoints -> ${finalHistory.length}`);
                } catch (repairErr) {
                    console.error(`    ❌ Repair failed: ${repairErr.message}`);
                }
            }
        } else {
            console.log(`    ✨ Clean & Synced`);
        }
        console.log('');
    }

    console.log(`================================================================`);
    console.log(`AUDIT COMPLETE`);
    console.log(`Total Audited:      ${shipments.length}`);
    console.log(`Anomalies Found:    ${anomalies.length}`);
    if (shouldFix) {
        console.log(`Repaired:           ${fixedCount}`);
    } else if (anomalies.length > 0) {
        console.log(`\n💡 To automatically heal and sync all flagged shipments with carriers, run:`);
        console.log(`   node scripts/investigate-tracking.js --fix`);
    }
    console.log(`================================================================\n`);
}

main()
    .catch(err => {
        console.error('Audit Error:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
