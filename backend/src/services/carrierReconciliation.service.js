const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { Prisma } = require('@prisma/client');
const financeLedgerService = require('./financeLedger.service');

class CarrierReconciliationService {
    /**
     * Process and match parsed carrier invoice rows against Target-Prod shipments and CARRIER_PAYABLE records.
     * @param {Array<{trackingNumber: string, billedAmount: number, billedWeight?: number, currency?: string, notes?: string}>} records
     * @param {string} carrier - e.g. 'DHL', 'LOGESTECHS', 'OTE', 'DGR', 'OTHER'
     */
    async reconcileInvoiceRows(records, carrier = 'GENERIC') {
        if (!Array.isArray(records) || records.length === 0) {
            throw new Error('No invoice records provided for reconciliation');
        }

        const trackingNumbers = records
            .map(r => (r.trackingNumber || r.awb || '').trim())
            .filter(Boolean);

        if (trackingNumbers.length === 0) {
            throw new Error('No valid tracking numbers found in invoice records');
        }

        // Fetch matching shipments from database
        const shipments = await prisma.shipment.findMany({
            where: {
                OR: [
                    { trackingNumber: { in: trackingNumbers } },
                    { dhlTrackingNumber: { in: trackingNumbers } },
                    { carrierShipmentId: { in: trackingNumbers } }
                ]
            },
            include: {
                organization: {
                    select: { id: true, name: true }
                }
            }
        });

        const shipmentMap = new Map();
        for (const s of shipments) {
            if (s.trackingNumber) shipmentMap.set(s.trackingNumber.toLowerCase(), s);
            if (s.dhlTrackingNumber) shipmentMap.set(s.dhlTrackingNumber.toLowerCase(), s);
            if (s.carrierShipmentId) shipmentMap.set(s.carrierShipmentId.toLowerCase(), s);
        }

        // Fetch existing CARRIER_PAYABLE ledger entries for these shipments
        const shipmentIds = shipments.map(s => s.id);
        const payableEntries = await prisma.organizationLedger.findMany({
            where: {
                sourceRepo: 'Shipment',
                sourceId: { in: shipmentIds },
                category: 'CARRIER_PAYABLE'
            }
        });

        const ledgerMap = new Map();
        for (const l of payableEntries) {
            if (l.sourceId) ledgerMap.set(l.sourceId, l);
        }

        let totalBilled = 0;
        let totalExpected = 0;
        let matchedCount = 0;
        let discrepancyCount = 0;
        let unmatchedCount = 0;

        const results = [];

        for (const record of records) {
            const rawAwb = (record.trackingNumber || record.awb || '').trim();
            const billedAmount = parseFloat(record.billedAmount || record.amount || 0);
            const billedWeight = record.billedWeight ? parseFloat(record.billedWeight) : null;
            const currency = record.currency || 'KWD';

            totalBilled += billedAmount;

            const shipment = shipmentMap.get(rawAwb.toLowerCase());

            if (!shipment) {
                unmatchedCount++;
                results.push({
                    trackingNumber: rawAwb,
                    carrier,
                    status: 'UNMATCHED',
                    billedAmount,
                    expectedAmount: 0,
                    deltaAmount: billedAmount,
                    billedWeight,
                    recordedWeight: null,
                    currency,
                    shipmentId: null,
                    organizationName: null,
                    reason: 'Tracking number not found in internal system'
                });
                continue;
            }

            matchedCount++;
            const payable = ledgerMap.get(shipment.id);
            // Default expected wholesale carrier cost
            const expectedAmount = payable ? parseFloat(payable.amount) : (parseFloat(shipment.costPrice) || 0);
            const recordedWeight = Array.isArray(shipment.parcels) && shipment.parcels[0]?.weight
                ? parseFloat(shipment.parcels[0].weight)
                : null;
            const deltaAmount = Number((billedAmount - expectedAmount).toFixed(4));
            
            totalExpected += expectedAmount;

            let status = 'MATCHED_EXACT';
            let reason = 'Wholesale cost matches recorded carrier payable';

            if (Math.abs(deltaAmount) > 0.001) {
                status = deltaAmount > 0 ? 'SURCHARGE_DISCREPANCY' : 'CREDIT_DISCREPANCY';
                reason = deltaAmount > 0 
                    ? `Carrier billed ${deltaAmount.toFixed(3)} ${currency} above expected cost`
                    : `Carrier billed ${Math.abs(deltaAmount).toFixed(3)} ${currency} below expected cost`;
                discrepancyCount++;
            }

            results.push({
                trackingNumber: rawAwb,
                internalTracking: shipment.trackingNumber,
                carrierTrackingNumber: shipment.dhlTrackingNumber || shipment.carrierShipmentId,
                carrier: shipment.carrierCode || carrier,
                status,
                billedAmount,
                expectedAmount,
                deltaAmount,
                billedWeight,
                recordedWeight,
                currency: payable?.currency || currency,
                shipmentId: shipment.id,
                organizationId: shipment.organizationId,
                organizationName: shipment.organization?.name || 'Unknown',
                reason
            });
        }

        return {
            summary: {
                carrier,
                totalRecords: records.length,
                matchedCount,
                unmatchedCount,
                discrepancyCount,
                totalBilled: Number(totalBilled.toFixed(4)),
                totalExpected: Number(totalExpected.toFixed(4)),
                totalVariance: Number((totalBilled - totalExpected).toFixed(4)),
                reconciledAt: new Date().toISOString()
            },
            items: results
        };
    }

    /**
     * Post corrective ledger entries for reconciliation discrepancies
     * @param {Array<{shipmentId: string, organizationId: string, deltaAmount: number, currency: string, reason: string}>} adjustments
     * @param {string} userId
     */
    async postAdjustments(adjustments, userId) {
        if (!Array.isArray(adjustments) || adjustments.length === 0) {
            throw new Error('No adjustments provided to post');
        }

        const posted = [];

        await prisma.$transaction(async (tx) => {
            for (const adj of adjustments) {
                if (!adj.shipmentId || !adj.deltaAmount || Math.abs(adj.deltaAmount) <= 0.0001) {
                    continue;
                }

                const delta = parseFloat(adj.deltaAmount);
                const currency = adj.currency || 'KWD';
                const description = `Carrier Invoice Reconciliation Adjustment: ${adj.reason || 'Cost discrepancy'}`;
                const entryType = delta > 0 ? 'CREDIT' : 'DEBIT';

                const entry = await financeLedgerService.createLedgerEntry(
                    adj.organizationId || null,
                    {
                        sourceRepo: 'Shipment',
                        sourceId: adj.shipmentId,
                        amount: Math.abs(delta),
                        currency,
                        entryType,
                        category: 'CARRIER_PAYABLE',
                        description,
                        reference: adj.shipmentId,
                        createdBy: userId,
                        metadata: {
                            adjustmentDelta: delta,
                            reason: adj.reason
                        }
                    },
                    tx
                );

                posted.push(entry);
            }
        });

        logger.info(`[CarrierReconciliation] Successfully posted ${posted.length} adjustment entries.`);
        return { success: true, count: posted.length, entries: posted };
    }
}

module.exports = new CarrierReconciliationService();
