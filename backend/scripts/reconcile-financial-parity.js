#!/usr/bin/env node
/**
 * Target Logistics Financial Hardening & Parity Backfill CLI Script
 * File: backend/scripts/reconcile-financial-parity.js
 *
 * Requirements (R5.4 / F22):
 * - Safe, idempotent execution supporting --dry-run (default) and --commit flags.
 * - Audits all existing non-draft/non-cancelled shipments.
 * - Recomputes and repairs remainingBalance desynchronization.
 * - Backfills missing customer AR SHIPMENT_CHARGE ledger entries.
 * - Backfills missing platform-level CARRIER_PAYABLE (organizationId: null) entries.
 * - Backfills missing Invoices & InvoiceLines.
 * - Backfills missing Double-Entry General Ledger journal entries (sourceType: 'SHIPMENT_BOOKING').
 * - Subsequent passes report zero discrepancies (100% idempotent).
 */

require('dotenv').config();
const { prisma } = require('../src/config/database');
const financeLedgerService = require('../src/services/financeLedger.service');
const generalLedgerService = require('../src/services/generalLedger.service');
const logger = require('../src/utils/logger');

/**
 * Executes financial parity audit and idempotent backfill.
 * @param {boolean} [dryRun=true] If true, audits discrepancies without mutating database.
 * @returns {Promise<{auditedCount: number, discrepanciesCount: number, fixedCount: number, dryRun: boolean, discrepancies: Array}>}
 */
async function runFinancialParityAudit(dryRun = true) {
    let defaultAdmin = null;
    if (typeof prisma.user?.findFirst === 'function') {
        defaultAdmin = await prisma.user.findFirst({
            where: { role: 'admin' }
        });
    }

    const shipments = (typeof prisma.shipment?.findMany === 'function')
        ? await prisma.shipment.findMany({
            where: { status: { notIn: ['draft', 'cancelled'] } },
            select: {
                id: true,
                trackingNumber: true,
                organizationId: true,
                userId: true,
                status: true,
                carrierCode: true,
                price: true,
                costPrice: true,
                markupAmount: true,
                currency: true,
                paid: true,
                totalPaid: true,
                remainingBalance: true,
                createdAt: true,
                updatedAt: true
            }
        })
        : [];

    const discrepancies = [];
    let fixedCount = 0;

    for (const s of shipments) {
        const price = Number(s.price || 0);
        const costPrice = Number(s.costPrice || 0);
        const totalPaid = Number(s.totalPaid || 0);
        const expectedRemaining = s.paid ? 0 : Math.max(0, price - totalPaid);

        // 1. Check remainingBalance / totalPaid parity
        if (s.paid && Number(s.remainingBalance || 0) > 0) {
            discrepancies.push({ shipmentId: s.id, trackingNumber: s.trackingNumber, type: 'PAID_WITH_NONZERO_BALANCE' });
            if (!dryRun && typeof prisma.shipment?.update === 'function') {
                await prisma.shipment.update({
                    where: { id: s.id },
                    data: { remainingBalance: 0, totalPaid: price }
                });
                fixedCount++;
            }
        } else if (!s.paid && Math.abs(Number(s.remainingBalance || 0) - expectedRemaining) > 0.001) {
            discrepancies.push({ shipmentId: s.id, trackingNumber: s.trackingNumber, type: 'REMAINING_BALANCE_DESYNC' });
            if (!dryRun && typeof prisma.shipment?.update === 'function') {
                await prisma.shipment.update({
                    where: { id: s.id },
                    data: { remainingBalance: expectedRemaining }
                });
                fixedCount++;
            }
        }

        // 2. Check Customer Sub-Ledger SHIPMENT_CHARGE
        let chargeEntry = null;
        if (s.organizationId && price > 0 && typeof prisma.organizationLedger?.findFirst === 'function') {
            chargeEntry = await prisma.organizationLedger.findFirst({
                where: {
                    sourceRepo: 'Shipment',
                    sourceId: s.id,
                    category: 'SHIPMENT_CHARGE'
                }
            });

            if (!chargeEntry) {
                discrepancies.push({ shipmentId: s.id, trackingNumber: s.trackingNumber, type: 'MISSING_SHIPMENT_CHARGE' });
                if (!dryRun) {
                    try {
                        chargeEntry = await financeLedgerService.createLedgerEntry(s.organizationId, {
                            sourceRepo: 'Shipment',
                            sourceId: s.id,
                            amount: price,
                            currency: s.currency || 'KWD',
                            entryType: 'DEBIT',
                            category: 'SHIPMENT_CHARGE',
                            description: `Freight Charge (${s.trackingNumber})`,
                            reference: s.trackingNumber,
                            createdBy: defaultAdmin?.id || s.userId || null,
                            createdAt: s.createdAt || new Date()
                        });
                        fixedCount++;
                    } catch (chargeErr) {
                        logger.warn(`Failed to backfill SHIPMENT_CHARGE for ${s.trackingNumber}: ${chargeErr.message}`);
                    }
                }
            }
        }

        // 3. Check Platform CARRIER_PAYABLE
        if (costPrice > 0 && typeof prisma.organizationLedger?.findFirst === 'function') {
            const payableEntry = await prisma.organizationLedger.findFirst({
                where: {
                    sourceRepo: 'Shipment',
                    sourceId: s.id,
                    category: 'CARRIER_PAYABLE'
                }
            });

            if (!payableEntry) {
                discrepancies.push({ shipmentId: s.id, trackingNumber: s.trackingNumber, type: 'MISSING_CARRIER_PAYABLE' });
                if (!dryRun) {
                    try {
                        await financeLedgerService.recordCarrierPayable({
                            organizationId: null,
                            shipmentId: s.id,
                            carrierCode: s.carrierCode || 'MANUAL',
                            costPrice,
                            currency: s.currency || 'KWD',
                            trackingNumber: s.trackingNumber,
                            createdBy: defaultAdmin?.id || s.userId || null
                        });
                        fixedCount++;
                    } catch (payableErr) {
                        logger.warn(`Failed to backfill CARRIER_PAYABLE for ${s.trackingNumber}: ${payableErr.message}`);
                    }
                }
            }
        }

        // 4. Check Invoice & InvoiceLine
        if (s.organizationId && price > 0 && typeof prisma.invoiceLine?.findFirst === 'function') {
            const existingLine = await prisma.invoiceLine.findFirst({
                where: { shipmentId: s.id }
            });

            if (!existingLine) {
                discrepancies.push({ shipmentId: s.id, trackingNumber: s.trackingNumber, type: 'MISSING_INVOICE' });
                if (!dryRun && typeof prisma.invoice?.create === 'function') {
                    try {
                        const invoiceNumber = `INV-SHP-${s.trackingNumber}`;
                        let invoice = typeof prisma.invoice.findUnique === 'function'
                            ? await prisma.invoice.findUnique({ where: { invoiceNumber } })
                            : null;

                        if (!invoice) {
                            await prisma.invoice.create({
                                data: {
                                    invoiceNumber,
                                    organizationId: s.organizationId,
                                    periodStart: s.createdAt || new Date(),
                                    periodEnd: s.createdAt || new Date(),
                                    subtotal: price,
                                    vat: 0,
                                    total: price,
                                    currency: s.currency || 'KWD',
                                    status: s.paid ? 'paid' : 'issued',
                                    paidAt: s.paid ? (s.updatedAt || s.createdAt || new Date()) : null,
                                    notes: `System generated consignment invoice for ${s.trackingNumber}`,
                                    createdById: defaultAdmin?.id || s.userId || null,
                                    createdAt: s.createdAt || new Date(),
                                    lines: {
                                        create: {
                                            shipmentId: s.id,
                                            ledgerEntryId: chargeEntry?.id || null,
                                            trackingNumber: s.trackingNumber,
                                            shipmentDate: s.createdAt || new Date(),
                                            amount: price,
                                            currency: s.currency || 'KWD',
                                            paid: Boolean(s.paid),
                                            totalPaid: s.paid ? price : Number(s.totalPaid || 0),
                                            remainingBalance: s.paid ? 0 : expectedRemaining,
                                            createdAt: s.createdAt || new Date()
                                        }
                                    }
                                }
                            });
                            fixedCount++;
                        }
                    } catch (invErr) {
                        logger.warn(`Failed to backfill Invoice for ${s.trackingNumber}: ${invErr.message}`);
                    }
                }
            }
        }

        // 5. Check Double-Entry General Ledger (sourceType: 'SHIPMENT_BOOKING')
        if (typeof prisma.journalEntry?.findFirst === 'function') {
            const existingJE = await prisma.journalEntry.findFirst({
                where: {
                    sourceType: 'SHIPMENT_BOOKING',
                    sourceId: s.id
                }
            });

            if (!existingJE) {
                discrepancies.push({ shipmentId: s.id, trackingNumber: s.trackingNumber, type: 'MISSING_JOURNAL_ENTRY' });
                if (!dryRun) {
                    try {
                        if (typeof generalLedgerService?.postShipmentBookingEntry === 'function') {
                            await generalLedgerService.postShipmentBookingEntry({
                                shipmentId: s.id,
                                trackingNumber: s.trackingNumber,
                                organizationId: s.organizationId || null,
                                customerPrice: price,
                                carrierCost: costPrice,
                                carrierCode: s.carrierCode || 'INTERNAL',
                                currency: s.currency || 'KWD',
                                createdById: defaultAdmin?.id || s.userId || null
                            });
                            fixedCount++;
                        }
                    } catch (glErr) {
                        logger.warn(`Failed to backfill Journal Entry for ${s.trackingNumber}: ${glErr.message}`);
                    }
                }
            }
        }
    }

    return {
        auditedCount: shipments.length,
        discrepanciesCount: discrepancies.length,
        fixedCount,
        dryRun,
        discrepancies
    };
}

async function main() {
    const args = process.argv.slice(2);
    const isCommit = args.includes('--commit');
    const isDryRun = args.includes('--dry-run') || !isCommit;

    console.log('======================================================================');
    console.log(`⚖️  TARGET LOGISTICS FINANCIAL PARITY & AUDIT BACKFILL CLI`);
    console.log(`MODE: ${isCommit ? '🚀 COMMIT (Applying database mutations)' : '🔍 DRY-RUN (Audit only, zero mutations)'}`);
    console.log('======================================================================\n');

    try {
        const result = await runFinancialParityAudit(!isCommit);

        console.log(`📦 Shipments Audited:     ${result.auditedCount}`);
        console.log(`⚠️  Discrepancies Found:   ${result.discrepanciesCount}`);
        if (isCommit) {
            console.log(`✅ Discrepancies Repaired: ${result.fixedCount}`);
        } else {
            console.log(`ℹ️  Dry-run complete. Re-run with --commit to apply repairs.`);
        }

        if (result.discrepanciesCount > 0) {
            console.log('\nDiscrepancy Details:');
            result.discrepancies.slice(0, 20).forEach((d, idx) => {
                console.log(`  ${idx + 1}. [${d.type}] Shipment: ${d.shipmentId} (${d.trackingNumber || 'N/A'})`);
            });
            if (result.discrepancies.length > 20) {
                console.log(`  ... and ${result.discrepancies.length - 20} more.`);
            }
        } else {
            console.log('\n🎉 Parity 100% clean! Zero financial discrepancies found.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Fatal error during financial parity backfill:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    runFinancialParityAudit,
    reconcileFinancialParity: runFinancialParityAudit
};
