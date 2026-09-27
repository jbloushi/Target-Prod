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
Target Logistics — Backlog & Retroactive Audit Sync Tool
=========================================================
IMPORTANT: By default, this tool operates in SAFETY AUDIT MODE.
It synchronizes logs, database records, and carrier telemetry WITHOUT
sending outdated live WhatsApp messages to recipients.

Usage: node scripts/backlog-sync.js [OPTIONS]

Options:
  --all                 Run Phenix sync, audit log backfill, and carrier tracking sync
  --phenix              Fetch and update consignments from Phenix ERP (skips sending messages for past dates)
  --logs                Backfill notification audit records for past shipments without sending live messages
  --tracking            Sync real-time carrier tracking telemetry (Aramex, FedEx, DHL, LogesTechs)
  --days=<n>            Number of days back to fetch from Phenix (default: 7)
  --role=<role>         Target role for audit: 'all', 'sender', or 'receiver' (default: all)
  --limit=<n>           Maximum number of shipments to process
  --force-send-live     ⚠️ DANGER: Force sending live WhatsApp messages to phones for past shipments (OFF by default)
  --dry-run             Preview actions without writing to database

Examples:
  # Safely backfill audit logs and carrier telemetry without messaging anyone:
  node scripts/backlog-sync.js --logs --tracking

  # Sync past 14 days of Phenix consignments and carrier history safely:
  node scripts/backlog-sync.js --phenix --tracking --days=14

  # Run full system sync in safe log-only mode (zero outbound messages):
  node scripts/backlog-sync.js --all --days=7
`);
        process.exit(0);
    }

    const isAll = args.includes('--all') || args.includes('-a');
    const doPhenix = isAll || args.includes('--phenix');
    const doLogs = isAll || args.includes('--logs') || args.includes('--whatsapp');
    const doTracking = isAll || args.includes('--tracking');
    const forceSendLive = args.includes('--force-send-live');
    const isDryRun = args.includes('--dry-run');

    const daysArg = args.find(a => a.startsWith('--days='));
    const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : 7;

    const roleArg = args.find(a => a.startsWith('--role='));
    const targetRole = roleArg ? roleArg.split('=')[1].toLowerCase() : 'all';

    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

    if (!doPhenix && !doLogs && !doTracking) {
        console.log(`⚠️  No action selected. Please specify --all, --phenix, --logs, or --tracking.`);
        console.log(`   Run with --help for detailed options.\n`);
        process.exit(1);
    }

    console.log(`\n================================================================`);
    console.log(`🔄 TARGET LOGISTICS — BACKLOG & RETROACTIVE AUDIT SYNC`);
    console.log(`Mode:            ${isDryRun ? '🔍 DRY RUN (Preview only)' : '⚡ LIVE DATABASE UPDATE'}`);
    console.log(`Messaging Guard: ${forceSendLive ? '⚠️ LIVE OUTBOUND ACTIVE (--force-send-live)' : '🛡️ SAFE LOG-ONLY (No outdated messages sent to phones)'}`);
    console.log(`Days Back:       ${daysBack} days`);
    console.log(`Actions:         ${[doPhenix ? 'Phenix ERP' : null, doLogs ? `Audit Logs Backfill (${targetRole})` : null, doTracking ? 'Carrier Telemetry' : null].filter(Boolean).join(', ')}`);
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
                // sendWhatsApp is passed as false so past consignments do not trigger live messages
                const result = await phenixSyncService.syncPhenixShipments({
                    daysBack,
                    carrier: 'ALL',
                    sendWhatsApp: forceSendLive,
                    onlyComplete: true
                });
                console.log(`  ✅ Phenix Sync Complete!`);
                console.log(`     Fetched: ${result.totalFetched} | Created: ${result.createdCount} | Updated: ${result.updatedCount}`);
                console.log(`     (Live outbound WhatsApp dispatches skipped for past dates to prevent outdated messages)`);
            }
        } catch (err) {
            console.error(`  ❌ Phenix Sync Error: ${err.message}`);
        }
        console.log('');
    }

    // -------------------------------------------------------------
    // PHASE 2: WhatsApp Notification Audit Log Backfill (Safe Mode)
    // -------------------------------------------------------------
    if (doLogs) {
        console.log(`▶ Phase 2: Auditing Notification Logs Coverage for Existing Shipments...`);

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

        const missingLogs = [];

        for (const s of shipments) {
            const logs = s.notificationLogs || [];

            const hasReceiverLog = logs.some(l => 
                ['receiver', 'customer', 'consignee'].includes((l.recipientRole || '').toLowerCase())
            );

            const hasSenderLog = logs.some(l => 
                ['sender', 'shipper', 'merchant'].includes((l.recipientRole || '').toLowerCase())
            );

            const receiverPhone = s.destination?.phone || s.customer?.phone;
            const receiverName = s.destination?.contactPerson || s.customer?.name || 'Receiver';

            const senderPhone = s.origin?.phone;
            const senderName = s.origin?.contactPerson || s.origin?.companyName || 'Shipper';

            const billId = s.documents?.phenixBillId;

            // Check receiver missing log
            if ((targetRole === 'all' || targetRole === 'receiver') && !hasReceiverLog && receiverPhone) {
                missingLogs.push({
                    shipment: s,
                    billId,
                    role: 'receiver',
                    phone: receiverPhone,
                    name: receiverName
                });
            }

            // Check sender missing log
            if ((targetRole === 'all' || targetRole === 'sender') && !hasSenderLog && senderPhone) {
                missingLogs.push({
                    shipment: s,
                    billId,
                    role: 'sender',
                    phone: senderPhone,
                    name: senderName
                });
            }
        }

        console.log(`  Found ${missingLogs.length} shipments missing audit log entries:`);
        const senderMissing = missingLogs.filter(d => d.role === 'sender').length;
        const receiverMissing = missingLogs.filter(d => d.role === 'receiver').length;
        console.log(`    - Missing Sender Log Entries:   ${senderMissing}`);
        console.log(`    - Missing Receiver Log Entries: ${receiverMissing}\n`);

        if (missingLogs.length > 0) {
            if (isDryRun) {
                console.log(`  [DRY RUN] First 10 audit log candidates to backfill:`);
                missingLogs.slice(0, 10).forEach((d, idx) => {
                    console.log(`    ${idx + 1}. [${d.role.toUpperCase()}] ${d.shipment.trackingNumber} (${d.name}) — Bill #${d.billId || 'N/A'}`);
                });
                if (missingLogs.length > 10) {
                    console.log(`    ... and ${missingLogs.length - 10} more.`);
                }
            } else {
                let syncedFromMicroCount = 0;
                let recordedLogCount = 0;

                for (let i = 0; i < missingLogs.length; i++) {
                    const item = missingLogs[i];

                    if (forceSendLive) {
                        // Explicit dangerous override: send live message
                        process.stdout.write(`  [${i + 1}/${missingLogs.length}] [FORCE LIVE] Sending WhatsApp for ${item.shipment.trackingNumber} (${item.phone})... `);
                        try {
                            const res = await whatsappService.sendNotification({
                                shipment: item.shipment,
                                recipientRole: item.role,
                                recipientPhone: item.phone,
                                recipientName: item.name,
                                templateName: 'shipment_confirmation_2',
                                eventType: 'shipment_created'
                            });
                            console.log(res?.success ? `✅ Sent` : `⚠️ Skipped/Failed: ${res?.error || 'Unknown'}`);
                        } catch (e) {
                            console.log(`❌ Error: ${e.message}`);
                        }
                    } else {
                        // SAFE AUDIT MODE: Check if microservice already recorded a send historically
                        let historicalSent = null;
                        if (item.billId) {
                            try {
                                historicalSent = await whatsappService.checkMicroserviceSent(item.billId, item.role);
                            } catch (_) {}
                        }

                        if (historicalSent?.sent) {
                            // Microservice has record of this message: sync into platform audit log!
                            await prisma.shipmentNotificationLog.create({
                                data: {
                                    shipmentId: item.shipment.id,
                                    trackingNumber: item.shipment.trackingNumber,
                                    eventType: 'shipment_created',
                                    recipientRole: item.role,
                                    recipientName: item.name,
                                    recipientPhone: item.phone,
                                    provider: 'SHIPMENT_WHATSAPP',
                                    templateName: 'shipment_confirmation_2',
                                    status: 'SENT',
                                    chatwootMessageId: `msg-historical-${historicalSent.sentAt || Date.now()}`,
                                    payloadJson: { source: 'HISTORICAL_MICROSERVICE_SYNC', billId: item.billId },
                                    responseJson: { historical: true, sentAt: historicalSent.sentAt },
                                    sentAt: historicalSent.sentAt ? new Date(historicalSent.sentAt) : new Date(item.shipment.createdAt)
                                }
                            });
                            syncedFromMicroCount++;
                        } else {
                            // Record historical audit entry without dispatching any message
                            await prisma.shipmentNotificationLog.create({
                                data: {
                                    shipmentId: item.shipment.id,
                                    trackingNumber: item.shipment.trackingNumber,
                                    eventType: 'shipment_created',
                                    recipientRole: item.role,
                                    recipientName: item.name,
                                    recipientPhone: item.phone,
                                    provider: 'SHIPMENT_WHATSAPP',
                                    templateName: 'shipment_confirmation_2',
                                    status: 'QUEUED',
                                    chatwootMessageId: `audit-historical-${item.shipment.trackingNumber}-${item.role}`,
                                    payloadJson: { source: 'HISTORICAL_AUDIT_LOG_BACKFILL', note: 'Logged retroactively; live message skipped to avoid sending outdated notification' },
                                    responseJson: { skippedOutbound: true },
                                    errorMessage: 'Past shipment: live message avoided to prevent outdated customer notification'
                                }
                            });
                            recordedLogCount++;
                        }
                    }

                    // Gentle delay to keep DB pool calm
                    if (i % 20 === 0 && i > 0) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                }

                console.log(`  ✅ Audit Log Backfill Complete!`);
                console.log(`     - Verified & Synced from microservice: ${syncedFromMicroCount}`);
                console.log(`     - Recorded historical coverage logs:   ${recordedLogCount}`);
                console.log(`     - Live messages sent to phones:        ${forceSendLive ? missingLogs.length : 0} (Strictly 0 in Safe Mode)`);
            }
        } else {
            console.log(`  🎉 All shipments have complete notification audit logs!`);
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
    console.log(`🏁 BACKLOG SYNCHRONIZATION COMPLETE`);
    console.log(`================================================================\n`);
    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal backlog error:', err);
    process.exit(1);
});
