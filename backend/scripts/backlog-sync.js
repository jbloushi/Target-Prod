require('dotenv').config();
const { prisma } = require('../src/config/database');
const phenixSyncService = require('../src/services/phenixSync.service');
const whatsappService = require('../src/services/whatsappIntegration.service');
const { syncCarrierTrackingHistory, resolveCarrierTrackingNumber } = require('../src/controllers/shipment.helpers');

async function main() {
    const args = process.argv.slice(2);

    const help = args.includes('--help') || args.includes('-h');
    if (help) {
        console.log(`
Target Logistics — Backlog & Retroactive Sync Tool
==================================================
Usage: node scripts/backlog-sync.js [OPTIONS]

Options:
  --all               Run Phenix sync, missing WhatsApp backlog, and carrier tracking sync
  --phenix            Fetch and sync past consignments from Phenix ERP
  --whatsapp          Backfill WhatsApp notifications for any missing recipient (sender/receiver)
  --tracking          Sync real-time carrier tracking telemetry (Aramex, FedEx, DHL, LogesTechs)
  --days=<n>          Number of days back to fetch from Phenix (default: 7)
  --role=<role>       Target role for WhatsApp backlog: 'all', 'sender', or 'receiver' (default: all)
  --limit=<n>         Maximum number of shipments to process for WhatsApp / tracking
  --dry-run           Preview actions without sending messages or modifying data

Examples:
  # Preview missing WhatsApp notifications from recent shipments
  node scripts/backlog-sync.js --whatsapp --dry-run

  # Backfill missing WhatsApp messages to senders who never received them
  node scripts/backlog-sync.js --whatsapp --role=sender

  # Sync past 14 days of Phenix consignments and dispatch notifications for both parties
  node scripts/backlog-sync.js --phenix --whatsapp --days=14

  # Run full synchronization across all subsystems (Phenix + WhatsApp + Carrier tracking)
  node scripts/backlog-sync.js --all --days=7
`);
        process.exit(0);
    }

    const isAll = args.includes('--all') || args.includes('-a');
    const doPhenix = isAll || args.includes('--phenix');
    const doWhatsApp = isAll || args.includes('--whatsapp');
    const doTracking = isAll || args.includes('--tracking');
    const isDryRun = args.includes('--dry-run');

    const daysArg = args.find(a => a.startsWith('--days='));
    const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : 7;

    const roleArg = args.find(a => a.startsWith('--role='));
    const targetRole = roleArg ? roleArg.split('=')[1].toLowerCase() : 'all';

    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

    if (!doPhenix && !doWhatsApp && !doTracking) {
        console.log(`⚠️  No action selected. Please specify --all, --phenix, --whatsapp, or --tracking.`);
        console.log(`   Run with --help for detailed options.\n`);
        process.exit(1);
    }

    console.log(`\n================================================================`);
    console.log(`🔄 TARGET LOGISTICS — BACKLOG & RETROACTIVE SYNCHRONIZATION`);
    console.log(`Mode:       ${isDryRun ? '🔍 DRY RUN (Preview only, no actions executed)' : '⚡ LIVE EXECUTION'}`);
    console.log(`Days Back:  ${daysBack} days`);
    console.log(`Actions:    ${[doPhenix ? 'Phenix ERP' : null, doWhatsApp ? `WhatsApp Backlog (${targetRole})` : null, doTracking ? 'Carrier Tracking' : null].filter(Boolean).join(', ')}`);
    console.log(`================================================================\n`);

    // -------------------------------------------------------------
    // PHASE 1: Phenix ERP Ingestion & Retroactive Consignment Sync
    // -------------------------------------------------------------
    if (doPhenix) {
        console.log(`▶ Phase 1: Fetching & Synchronizing Phenix Consignments (${daysBack} days back)...`);
        try {
            if (isDryRun) {
                const preview = await phenixSyncService.previewPhenixShipments({
                    daysBack,
                    carrier: 'ALL',
                    onlyComplete: true
                });
                console.log(`  Preview: ${preview.totalFetched} raw bills fetched.`);
                console.log(`  Matched actionable consignments: ${preview.matchedCount}`);
                console.log(`  Window: ${preview.window.from.year}-${preview.window.from.month}-${preview.window.from.day} to ${preview.window.to.year}-${preview.window.to.month}-${preview.window.to.day}`);
            } else {
                const result = await phenixSyncService.syncPhenixShipments({
                    daysBack,
                    carrier: 'ALL',
                    sendWhatsApp: doWhatsApp,
                    onlyComplete: true
                });
                console.log(`  ✅ Phenix Sync Complete!`);
                console.log(`     Fetched: ${result.totalFetched} | Created: ${result.createdCount} | Updated: ${result.updatedCount}`);
                if (doWhatsApp) {
                    console.log(`     WhatsApp confirmation queue queued during sync.`);
                }
            }
        } catch (err) {
            console.error(`  ❌ Phenix Sync Error: ${err.message}`);
        }
        console.log('');
    }

    // -------------------------------------------------------------
    // PHASE 2: WhatsApp Notification Backlog / Retroactive Dispatch
    // -------------------------------------------------------------
    if (doWhatsApp) {
        console.log(`▶ Phase 2: Auditing WhatsApp Notification Coverage for Existing Shipments...`);

        const shipments = await prisma.shipment.findMany({
            where: {
                status: { not: 'draft' }
            },
            include: {
                notificationLogs: true
            },
            orderBy: { createdAt: 'desc' },
            ...(limit ? { take: limit } : {})
        });

        console.log(`  Evaluating ${shipments.length} non-draft shipments in database...\n`);

        const missingDispatches = [];

        for (const s of shipments) {
            const logs = s.notificationLogs || [];

            const hasReceiverSent = logs.some(l => 
                ['receiver', 'customer', 'consignee'].includes((l.recipientRole || '').toLowerCase()) &&
                ['SENT', 'DELIVERED', 'READ'].includes((l.status || '').toUpperCase())
            );

            const hasSenderSent = logs.some(l => 
                ['sender', 'shipper', 'merchant'].includes((l.recipientRole || '').toLowerCase()) &&
                ['SENT', 'DELIVERED', 'READ'].includes((l.status || '').toUpperCase())
            );

            const receiverPhone = s.destination?.phone || s.customer?.phone;
            const receiverName = s.destination?.contactPerson || s.customer?.name || 'Receiver';

            const senderPhone = s.origin?.phone;
            const senderName = s.origin?.contactPerson || s.origin?.companyName || 'Shipper';

            // Check receiver backlog
            if ((targetRole === 'all' || targetRole === 'receiver') && !hasReceiverSent && receiverPhone) {
                missingDispatches.push({
                    shipment: s,
                    role: 'receiver',
                    phone: receiverPhone,
                    name: receiverName
                });
            }

            // Check sender backlog
            if ((targetRole === 'all' || targetRole === 'sender') && !hasSenderSent && senderPhone) {
                missingDispatches.push({
                    shipment: s,
                    role: 'sender',
                    phone: senderPhone,
                    name: senderName
                });
            }
        }

        console.log(`  Found ${missingDispatches.length} pending / unnotified parties:`);
        const senderMissing = missingDispatches.filter(d => d.role === 'sender').length;
        const receiverMissing = missingDispatches.filter(d => d.role === 'receiver').length;
        console.log(`    - Missing Sender Notifications:   ${senderMissing}`);
        console.log(`    - Missing Receiver Notifications: ${receiverMissing}\n`);

        if (missingDispatches.length > 0) {
            if (isDryRun) {
                console.log(`  [DRY RUN] First 10 backlog candidates:`);
                missingDispatches.slice(0, 10).forEach((d, idx) => {
                    console.log(`    ${idx + 1}. [${d.role.toUpperCase()}] ${d.shipment.trackingNumber} -> ${d.name} (${d.phone})`);
                });
                if (missingDispatches.length > 10) {
                    console.log(`    ... and ${missingDispatches.length - 10} more.`);
                }
            } else {
                let sentCount = 0;
                let failCount = 0;

                for (let i = 0; i < missingDispatches.length; i++) {
                    const item = missingDispatches[i];
                    process.stdout.write(`  [${i + 1}/${missingDispatches.length}] Dispatching ${item.role} WhatsApp for ${item.shipment.trackingNumber} (${item.phone})... `);
                    try {
                        const res = await whatsappService.sendNotification({
                            shipment: item.shipment,
                            recipientRole: item.role,
                            recipientPhone: item.phone,
                            recipientName: item.name,
                            templateName: 'shipment_confirmation_2',
                            eventType: 'shipment_created'
                        });

                        if (res?.success) {
                            console.log(`✅ Sent (ID: ${res.log?.id || res.messageId})`);
                            sentCount++;
                        } else {
                            console.log(`⚠️ Skipped/Failed: ${res?.error || 'Unknown'}`);
                            failCount++;
                        }
                    } catch (err) {
                        console.log(`❌ Error: ${err.message}`);
                        failCount++;
                    }

                    // Gentle rate limit pause (300ms)
                    await new Promise(r => setTimeout(r, 300));
                }

                console.log(`\n  ✅ WhatsApp Backlog Dispatch Completed: ${sentCount} sent, ${failCount} failed/skipped.`);
            }
        } else {
            console.log(`  🎉 All shipments are already 100% notified! No WhatsApp backlog required.`);
        }
        console.log('');
    }

    // -------------------------------------------------------------
    // PHASE 3: Real-Time Carrier Telemetry & Status Sync
    // -------------------------------------------------------------
    if (doTracking) {
        console.log(`▶ Phase 3: Synchronizing Carrier Tracking Telemetry (Aramex, FedEx, DHL, LogesTechs)...`);

        const shipments = await prisma.shipment.findMany({
            where: {
                status: { notIn: ['draft', 'cancelled'] }
            },
            orderBy: { createdAt: 'desc' },
            ...(limit ? { take: limit } : {})
        });

        console.log(`  Checking carrier updates for ${shipments.length} active shipments...\n`);

        let updatedTrackingCount = 0;
        let failedTrackingCount = 0;

        for (let i = 0; i < shipments.length; i++) {
            const s = shipments[i];
            const awb = resolveCarrierTrackingNumber(s);

            if (!awb) {
                continue;
            }

            process.stdout.write(`  [${i + 1}/${shipments.length}] #${s.trackingNumber} (${s.carrierCode || 'CARRIER'}: ${awb})... `);

            if (isDryRun) {
                console.log(`[DRY RUN - Skipped carrier poll]`);
                continue;
            }

            try {
                const carrierResult = await syncCarrierTrackingHistory(s);
                if (carrierResult && carrierResult.synced) {
                    const newStatus = carrierResult.status || s.status;
                    const checkpointCount = carrierResult.history?.length || 0;
                    console.log(`✅ Synced! Status: ${newStatus} (${checkpointCount} checkpoints)`);
                    updatedTrackingCount++;
                } else {
                    console.log(`ℹ️ Up to date (No changes)`);
                }
            } catch (err) {
                console.log(`⚠️ Poll failed: ${err.message}`);
                failedTrackingCount++;
            }

            // Small delay to prevent carrier rate-limiting
            await new Promise(r => setTimeout(r, 400));
        }

        if (!isDryRun) {
            console.log(`\n  ✅ Carrier Telemetry Sync Complete: ${updatedTrackingCount} updated, ${failedTrackingCount} errors.`);
        }
        console.log('');
    }

    console.log(`================================================================`);
    console.log(`🏁 BACKLOG SYNCHRONIZATION RUN COMPLETE`);
    console.log(`================================================================\n`);
    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal backlog error:', err);
    process.exit(1);
});
