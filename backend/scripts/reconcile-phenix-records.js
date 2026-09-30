require('dotenv').config();
const { prisma } = require('../src/config/database');
const whatsappService = require('../src/services/whatsappIntegration.service');
const financeLedgerService = require('../src/services/financeLedger.service');

function parsePhenixDate(rawDate) {
    if (!rawDate) return null;
    const s = String(rawDate).trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
        return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

async function reconcilePhenixRecords() {
    console.log('===============================================================');
    console.log(`🔗 RECONCILING PHENIX SHIPMENTS: DATES, FINANCIALS & WHATSAPP LOGS`);
    console.log('===============================================================\n');

    const defaultAdmin = await prisma.user.findFirst({
        where: { role: 'admin' },
        include: { organization: true }
    });

    if (!defaultAdmin) {
        console.error('❌ No admin user found in database.');
        process.exit(1);
    }

    // 1. Fetch all shipments from database
    const shipments = await prisma.shipment.findMany({
        include: {
            organization: true,
            notificationLogs: true,
            invoiceLines: true
        }
    });

    console.log(`📦 Found ${shipments.length} total shipments in database to inspect...\n`);

    let datesUpdated = 0;
    let financeReconciled = 0;
    let whatsappLogsLinked = 0;

    for (let i = 0; i < shipments.length; i++) {
        const s = shipments[i];
        const docs = (s.documents && typeof s.documents === 'object') ? s.documents : {};
        const rawDate = docs.rawDate || docs.date || s.history?.[0]?.timestamp;
        const phenixBillId = docs.phenixBillId || null;
        const phenixReceiptNo = docs.phenixReceiptNo || null;
        const rawAmount = s.price ? Number(s.price) : 0;
        const isPaid = s.paid || (docs.paymentMethod && !docs.paymentMethod.includes('آجل'));

        const cleanAwb = s.dhlTrackingNumber || s.trackingNumber.replace(/^TRK-/i, '');

        // 1. Correct Shipment createdAt if rawDate exists
        const actualDate = parsePhenixDate(rawDate);
        if (actualDate && Math.abs(new Date(s.createdAt).getTime() - actualDate.getTime()) > 60000) {
            await prisma.shipment.update({
                where: { id: s.id },
                data: { createdAt: actualDate }
            });
            datesUpdated++;
        }

        const effectiveDate = actualDate || new Date(s.createdAt);

        // 2. Reconcile Double-Entry Ledger, Invoices, and Payments
        if (s.organizationId && rawAmount > 0) {
            try {
                // Ensure Debit Ledger Entry exists & matches date
                let ledgerEntry = await prisma.organizationLedger.findFirst({
                    where: {
                        sourceRepo: 'Shipment',
                        sourceId: s.id,
                        category: 'SHIPMENT_CHARGE'
                    }
                });

                if (!ledgerEntry) {
                    ledgerEntry = await financeLedgerService.createLedgerEntry(s.organizationId, {
                        amount: rawAmount,
                        currency: s.currency || 'KWD',
                        entryType: 'DEBIT',
                        category: 'SHIPMENT_CHARGE',
                        description: `Consignment Freight Charge (${s.trackingNumber})`,
                        reference: phenixReceiptNo || phenixBillId || s.trackingNumber,
                        sourceRepo: 'Shipment',
                        sourceId: s.id,
                        createdBy: defaultAdmin.id,
                        createdAt: effectiveDate
                    });
                    financeReconciled++;
                } else if (actualDate && Math.abs(new Date(ledgerEntry.createdAt).getTime() - actualDate.getTime()) > 60000) {
                    await prisma.organizationLedger.update({
                        where: { id: ledgerEntry.id },
                        data: { createdAt: actualDate }
                    });
                }

                // If Paid, ensure Payment & Allocation exist & match date
                if (isPaid && phenixReceiptNo) {
                    const paymentRef = `PHENIX-${phenixReceiptNo}`;
                    let payment = await prisma.payment.findFirst({
                        where: { reference: paymentRef }
                    });

                    if (!payment) {
                        payment = await prisma.payment.create({
                            data: {
                                organizationId: s.organizationId,
                                amount: rawAmount,
                                currency: s.currency || 'KWD',
                                status: 'APPLIED',
                                method: docs.paymentMethod || 'CASH',
                                reference: paymentRef,
                                notes: `Automated payment receipt from Phenix ERP #${phenixReceiptNo}`,
                                createdById: defaultAdmin.id,
                                postedAt: effectiveDate,
                                createdAt: effectiveDate,
                                metadata: {
                                    phenixBillId,
                                    phenixReceiptNo,
                                    shipmentId: s.id
                                }
                            }
                        });

                        await prisma.paymentAllocation.create({
                            data: {
                                organizationId: s.organizationId,
                                paymentId: payment.id,
                                shipmentId: s.id,
                                amount: rawAmount,
                                currency: s.currency || 'KWD',
                                status: 'ACTIVE',
                                createdBy: defaultAdmin.id,
                                createdAt: effectiveDate
                            }
                        });

                        await financeLedgerService.createLedgerEntry(s.organizationId, {
                            amount: rawAmount,
                            currency: s.currency || 'KWD',
                            entryType: 'CREDIT',
                            category: 'PAYMENT',
                            description: `Payment Receipt (${docs.paymentMethod || 'CASH'} - Phenix #${phenixReceiptNo})`,
                            reference: paymentRef,
                            sourceRepo: 'Payment',
                            sourceId: payment.id,
                            createdBy: defaultAdmin.id,
                            createdAt: effectiveDate
                        });
                        financeReconciled++;
                    } else if (actualDate && Math.abs(new Date(payment.createdAt).getTime() - actualDate.getTime()) > 60000) {
                        await prisma.payment.update({
                            where: { id: payment.id },
                            data: { createdAt: actualDate, postedAt: actualDate }
                        });
                    }
                }

                // Ensure Official Invoice exists & matches date
                if (phenixReceiptNo || phenixBillId) {
                    const invoiceNumber = `INV-PH-${phenixReceiptNo || phenixBillId}`;
                    let invoice = await prisma.invoice.findUnique({
                        where: { invoiceNumber }
                    });

                    if (!invoice && ledgerEntry) {
                        const existingLine = await prisma.invoiceLine.findUnique({
                            where: { ledgerEntryId: ledgerEntry.id }
                        });

                        if (!existingLine) {
                            await prisma.invoice.create({
                                data: {
                                    invoiceNumber,
                                    organizationId: s.organizationId,
                                    periodStart: effectiveDate,
                                    periodEnd: effectiveDate,
                                    subtotal: rawAmount,
                                    vat: 0,
                                    total: rawAmount,
                                    currency: s.currency || 'KWD',
                                    status: isPaid ? 'paid' : 'issued',
                                    paidAt: isPaid ? effectiveDate : null,
                                    notes: `Phenix ERP Official Tax Invoice (Bill #${phenixBillId}, Receipt #${phenixReceiptNo})`,
                                    createdById: defaultAdmin.id,
                                    createdAt: effectiveDate,
                                    lines: {
                                        create: {
                                            shipmentId: s.id,
                                            ledgerEntryId: ledgerEntry.id,
                                            trackingNumber: s.trackingNumber,
                                            shipmentDate: effectiveDate,
                                            amount: rawAmount,
                                            currency: s.currency || 'KWD',
                                            paid: isPaid,
                                            totalPaid: isPaid ? rawAmount : 0,
                                            remainingBalance: isPaid ? 0 : rawAmount,
                                            createdAt: effectiveDate
                                        }
                                    }
                                }
                            });
                            financeReconciled++;
                        }
                    } else if (invoice && actualDate && Math.abs(new Date(invoice.createdAt).getTime() - actualDate.getTime()) > 60000) {
                        await prisma.invoice.update({
                            where: { id: invoice.id },
                            data: {
                                createdAt: actualDate,
                                periodStart: actualDate,
                                periodEnd: actualDate,
                                paidAt: isPaid ? actualDate : null
                            }
                        });
                    }
                }
            } catch (finErr) {
                // skip individual financial errors
            }
        }

        // 3. Link Orphaned WhatsApp Notification Logs
        try {
            const unlinkedLogs = await prisma.shipmentNotificationLog.findMany({
                where: {
                    OR: [
                        { trackingNumber: s.trackingNumber },
                        { trackingNumber: cleanAwb },
                        { trackingNumber: `TRK-${cleanAwb}` }
                    ],
                    shipmentId: { not: s.id }
                }
            });

            for (const log of unlinkedLogs) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: { shipmentId: s.id }
                });
                whatsappLogsLinked++;
            }

            // Check if microservice has autosend history for this bill
            if (phenixBillId && s.notificationLogs.length === 0) {
                for (const role of ['receiver', 'sender']) {
                    const microSent = await whatsappService.checkMicroserviceSent(phenixBillId, role);
                    if (microSent?.sent) {
                        const sentAtDate = microSent.sentAt ? new Date(microSent.sentAt) : effectiveDate;
                        await prisma.shipmentNotificationLog.create({
                            data: {
                                shipmentId: s.id,
                                trackingNumber: s.trackingNumber,
                                eventType: 'shipment_created',
                                recipientRole: role,
                                recipientName: role === 'receiver' ? s.customer?.name : (s.origin?.contactPerson || 'Shipper'),
                                recipientPhone: role === 'receiver' ? s.customer?.phone : (s.origin?.phone || null),
                                provider: 'SHIPMENT_WHATSAPP',
                                templateName: 'shipment_confirmation_2',
                                status: 'SENT',
                                chatwootMessageId: `msg-autosend-${microSent.sentAt || Date.now()}`,
                                payloadJson: { source: 'MICROSERVICE_AUTOSEND', billId: phenixBillId, role },
                                responseJson: { autoSent: true, sentAt: microSent.sentAt },
                                sentAt: sentAtDate,
                                createdAt: sentAtDate
                            }
                        });
                        whatsappLogsLinked++;
                    }
                }
            }
        } catch (waErr) {
            // skip wa log linking error
        }

        if ((i + 1) % 50 === 0 || i === shipments.length - 1) {
            console.log(`Processed ${i + 1}/${shipments.length} shipments...`);
        }
    }

    console.log('\n===============================================================');
    console.log(`🎉 RECONCILIATION COMPLETE`);
    console.log('===============================================================');
    console.log(`   • Shipment Dates Updated    : ${datesUpdated}`);
    console.log(`   • Finance Records Synced    : ${financeReconciled}`);
    console.log(`   • WhatsApp Logs Linked      : ${whatsappLogsLinked}`);
    console.log('===============================================================\n');

    await prisma.$disconnect();
}

reconcilePhenixRecords().catch(err => {
    console.error('Reconciliation error:', err);
    process.exit(1);
});
