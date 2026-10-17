require('dotenv').config();
const { prisma } = require('../src/config/database');
const phenixSyncService = require('../src/services/phenixSync.service');
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
    console.log(`🔗 RECONCILING PHENIX SHIPMENTS: LIVE ERP DATES & FINANCIALS`);
    console.log('===============================================================\n');

    const defaultAdmin = await prisma.user.findFirst({
        where: { role: 'admin' },
        include: { organization: true }
    });

    if (!defaultAdmin) {
        console.error('❌ No admin user found in database.');
        process.exit(1);
    }

    // 1. Fetch live 35-day backlog from Phenix ERP
    console.log(`1. Fetching 35-day operational report from Phenix ERP API...`);
    let phenixRows = [];
    try {
        const phenixRes = await phenixSyncService.fetchPhenixReportData({ daysBack: 35 });
        phenixRows = phenixRes.rows || [];
        console.log(`✅ Phenix API Response: Received ${phenixRows.length} total bills from Phenix\n`);
    } catch (err) {
        console.warn(`⚠️ Could not reach Phenix API live: ${err.message}. Proceeding with local documents reconciliation.`);
    }

    // Index Phenix rows by AWB, Receipt No, and Bill ID
    const phenixByAwb = new Map();
    const phenixByReceipt = new Map();
    const phenixByBill = new Map();

    for (const r of phenixRows) {
        const awb = String(r.bill_detailCustomField_1 || '').trim();
        const receipt = String(r.Receipt_no || '').trim();
        const bill = String(r.bill_id || '').trim();

        if (awb) phenixByAwb.set(awb, r);
        if (receipt) phenixByReceipt.set(receipt, r);
        if (bill) phenixByBill.set(bill, r);
    }

    // 2. Fetch all shipments from database
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
    const dateDistribution = {};

    for (let i = 0; i < shipments.length; i++) {
        const s = shipments[i];
        const docs = (s.documents && typeof s.documents === 'object') ? s.documents : {};
        const cleanAwb = s.dhlTrackingNumber || s.trackingNumber.replace(/^TRK-/i, '').replace(/^ARM-/i, '');
        const phenixBillId = docs.phenixBillId || null;
        const phenixReceiptNo = docs.phenixReceiptNo || null;

        // Match with Phenix live row
        const matchedRow = (cleanAwb && phenixByAwb.get(cleanAwb))
            || (phenixReceiptNo && phenixByReceipt.get(phenixReceiptNo))
            || (phenixBillId && phenixByBill.get(phenixBillId))
            || (s.trackingNumber && phenixByAwb.get(s.trackingNumber));

        const rawPhenixDate = matchedRow ? (matchedRow.Date || matchedRow.date) : (docs.rawDate || docs.date);
        const actualDate = parsePhenixDate(rawPhenixDate);

        const rawAmount = s.price ? Number(s.price) : (matchedRow ? (parseFloat(matchedRow.Total || matchedRow.payment || 0) || 0) : 0);
        const weightKg = matchedRow ? (parseFloat(matchedRow.Mat_Amount || 0) || 0) : (docs.weightKg || 0);
        const unitPrice = matchedRow ? (parseFloat(matchedRow.Sale_price || matchedRow.Price || 0) || 0) : (docs.unitPrice || 0);
        const costPrice = s.costPrice ? Number(s.costPrice) : (matchedRow ? (parseFloat(matchedRow.bill_detailCustomField_11 || 0) || 0) : (docs.costPrice || 0));
        const customsFee = matchedRow ? (parseFloat(matchedRow.bill_detailCustomField_12 || matchedRow.Extra || 0) || 0) : (docs.customsFee || 0);
        const markupAmount = (rawAmount > 0 && costPrice > 0) ? Number((rawAmount - costPrice).toFixed(4)) : (s.markupAmount ? Number(s.markupAmount) : null);
        const paymentMethod = matchedRow ? String(matchedRow.Payment_method || '').trim() : (docs.paymentMethod || '');
        const paidAmount = matchedRow ? (parseFloat(matchedRow.payment || 0) || 0) : (docs.paidAmount || 0);
        const isPaid = s.paid || Boolean(paymentMethod && !paymentMethod.includes('آجل'));

        // 1. Determine True Real-World Booking Date
        // Earliest between Phenix invoice Date and Carrier initial history checkpoint (e.g. Aramex / DHL initial scan / pickup)
        let trueBookingDate = actualDate;
        if (Array.isArray(s.history) && s.history.length > 0) {
            for (const h of s.history) {
                if (h.timestamp) {
                    const ht = new Date(h.timestamp);
                    if (!Number.isNaN(ht.getTime())) {
                        if (!trueBookingDate || ht.getTime() < trueBookingDate.getTime()) {
                            trueBookingDate = ht;
                        }
                    }
                }
            }
        }

        const effectiveDate = trueBookingDate || actualDate || new Date(s.createdAt);

        // Update Shipment createdAt, costPrice, markupAmount, parcels, pricingSnapshot & documents if live Phenix data exists
        if (effectiveDate || matchedRow) {
            const currentCreatedTime = new Date(s.createdAt).getTime();
            const actualTime = effectiveDate.getTime();
            const needsDateUpdate = Math.abs(currentCreatedTime - actualTime) > 60000;
            const needsDocsUpdate = (rawPhenixDate && docs.rawDate !== rawPhenixDate)
                || (weightKg > 0 && !docs.weightKg)
                || (costPrice > 0 && !s.costPrice);
            const hasExistingParcels = Array.isArray(s.parcels) && s.parcels.length > 0;
            const phenixParcels = (!hasExistingParcels && weightKg > 0) ? [{
                weight: weightKg,
                quantity: 1,
                description: (matchedRow && matchedRow.Item) ? String(matchedRow.Item).trim() : 'General Cargo',
                dimensions: { length: 20, width: 15, height: 10, unit: 'cm' }
            }] : undefined;
            const phenixPricingSnapshot = (!s.pricingSnapshot && (rawAmount > 0 || costPrice > 0 || weightKg > 0)) ? {
                totalPrice: rawAmount,
                costPrice,
                markupAmount,
                chargeableWeight: weightKg,
                unitPrice,
                customsFee,
                currency: s.currency || 'KWD',
                source: 'PHENIX_ERP'
            } : undefined;

            if (needsDateUpdate || needsDocsUpdate || phenixParcels || phenixPricingSnapshot) {
                await prisma.shipment.update({
                    where: { id: s.id },
                    data: {
                        createdAt: effectiveDate,
                        costPrice: s.costPrice || (costPrice > 0 ? costPrice : undefined),
                        markupAmount: (s.markupAmount !== null && s.markupAmount !== undefined) ? s.markupAmount : (markupAmount !== null ? markupAmount : undefined),
                        parcels: phenixParcels || undefined,
                        pricingSnapshot: phenixPricingSnapshot || undefined,
                        documents: {
                            ...docs,
                            rawDate: rawPhenixDate || docs.rawDate,
                            date: rawPhenixDate || docs.date,
                            phenixBillId: docs.phenixBillId || (matchedRow ? matchedRow.bill_id : undefined),
                            phenixReceiptNo: docs.phenixReceiptNo || (matchedRow ? matchedRow.Receipt_no : undefined),
                            paymentMethod: docs.paymentMethod || paymentMethod || undefined,
                            paidAmount: paidAmount || docs.paidAmount,
                            weightKg: weightKg || docs.weightKg,
                            unitPrice: unitPrice || docs.unitPrice,
                            costPrice: costPrice || docs.costPrice,
                            customsFee: customsFee || docs.customsFee,
                            markupAmount: markupAmount !== null ? markupAmount : docs.markupAmount,
                            billType: (matchedRow && matchedRow.Type) ? String(matchedRow.Type).trim() : docs.billType,
                            itemDescription: (matchedRow && matchedRow.Item) ? String(matchedRow.Item).trim() : docs.itemDescription,
                            employee: (matchedRow && matchedRow.Employee) ? String(matchedRow.Employee).trim() : docs.employee,
                            phenixUser: (matchedRow && matchedRow.User) ? String(matchedRow.User).trim() : docs.phenixUser,
                            branch: (matchedRow && matchedRow.Branch) ? String(matchedRow.Branch).trim() : docs.branch,
                            note: (matchedRow && matchedRow.Note) ? String(matchedRow.Note).trim() : docs.note,
                            source: 'PHENIX_ERP'
                        }
                    }
                });
                datesUpdated++;
            }
        }

        const dayKey = effectiveDate.toISOString().slice(0, 10);
        dateDistribution[dayKey] = (dateDistribution[dayKey] || 0) + 1;

        // 2. Reconcile Double-Entry Ledger, Invoices, Payments, and Platform Carrier Payable
        if ((s.organizationId && rawAmount > 0) || costPrice > 0) {
            try {
                // Ensure Debit Ledger Entry exists & matches date
                let ledgerEntry = null;
                if (s.organizationId && rawAmount > 0) {
                    ledgerEntry = await prisma.organizationLedger.findFirst({
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
                }

                // If Paid, ensure Payment & Allocation exist & match date
                if (s.organizationId && rawAmount > 0 && isPaid && (phenixReceiptNo || phenixBillId)) {
                    const refCode = phenixReceiptNo || phenixBillId;
                    const paymentRef = `PHENIX-${refCode}`;
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
                                method: paymentMethod || 'CASH',
                                reference: paymentRef,
                                notes: `Automated payment receipt from Phenix ERP #${refCode}`,
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
                            description: `Payment Receipt (${paymentMethod || 'CASH'} - Phenix #${refCode})`,
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
                if (s.organizationId && rawAmount > 0 && (phenixReceiptNo || phenixBillId)) {
                    const refCode = phenixReceiptNo || phenixBillId;
                    const invoiceNumber = `INV-PH-${refCode}`;
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

                // Ensure Platform Carrier Payable exists if costPrice > 0
                if (costPrice > 0) {
                    const existingPayable = await prisma.organizationLedger.findFirst({
                        where: {
                            sourceRepo: 'Shipment',
                            sourceId: s.id,
                            category: 'CARRIER_PAYABLE'
                        }
                    });
                    if (!existingPayable) {
                        await financeLedgerService.recordCarrierPayable({
                            organizationId: null,
                            shipmentId: s.id,
                            carrierCode: s.carrierCode || 'DGR',
                            costPrice,
                            currency: s.currency || 'KWD',
                            trackingNumber: s.trackingNumber,
                            createdBy: defaultAdmin.id
                        });
                        financeReconciled++;
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
        } catch (_) {}

        if ((i + 1) % 50 === 0 || i === shipments.length - 1) {
            console.log(`Processed ${i + 1}/${shipments.length} shipments...`);
        }
    }

    console.log('\n===============================================================');
    console.log('🎉 RECONCILIATION COMPLETE');
    console.log('===============================================================');
    console.log(`   • Shipment Dates Updated    : ${datesUpdated}`);
    console.log(`   • Finance Records Synced    : ${financeReconciled}`);
    console.log(`   • WhatsApp Logs Linked      : ${whatsappLogsLinked}`);
    console.log('\n📅 Reconciled Shipment Date Distribution across Database:');
    Object.entries(dateDistribution)
        .sort(([a], [b]) => b.localeCompare(a))
        .forEach(([date, count]) => {
            console.log(`   • ${date}: ${count} shipments`);
        });
    console.log('===============================================================\n');
}

reconcilePhenixRecords()
    .catch((err) => {
        console.error('❌ Reconciliation error:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
