const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/config');
const { prisma } = require('../config/database');
const { syncCarrierTrackingHistory } = require('../controllers/shipment.helpers');
const whatsappService = require('./whatsappIntegration.service');

/**
 * Phenix ERP Synchronization Service
 * 
 * Fetches billing / shipment records from Phenix Reporting API,
 * validates and normalizes recipient data & international phones,
 * maps them to Target-Prod database models, fetches real-time carrier
 * checkpoints via Carrier Adapters, and issues branded tracking URLs.
 */

function assertPhenixConfigured() {
    const phenixCfg = config.phenix || {};
    const missing = [];
    if (!phenixCfg.apiUser) missing.push('PHENIX_API_USER');
    if (!phenixCfg.apiPassword) missing.push('PHENIX_API_PASSWORD');
    if (!phenixCfg.token) missing.push('PHENIX_TOKEN');
    if (!phenixCfg.endpoint) missing.push('PHENIX_ENDPOINT');

    if (missing.length > 0) {
        throw new Error(`Phenix ERP is not configured on server. Missing: ${missing.join(', ')}`);
    }
}

/**
 * Year/month/day for a Date as seen in the given IANA timezone.
 */
function dateParts(date, timeZone = 'Asia/Kuwait') {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = Object.fromEntries(
        fmt.formatToParts(date).map((p) => [p.type, p.value])
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
    };
}

/**
 * Add days offset to year/month/day object
 */
function addDays({ year, month, day }, daysOffset) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + daysOffset);
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
    };
}

function buildPhenixRequestBody(from, to) {
    return {
        _parameters: [
            {
                controls: [
                    { Vyear: from.year, Vmonth: from.month, Vday: from.day, type: 9, name: 'DATETIMEFROM' },
                    { Vyear: to.year, Vmonth: to.month, Vday: to.day, type: 9, name: 'DATETIMETO' },
                    { value: '9', type: 2, name: 'FRM_PERIOD' },
                    { value: 0, type: 8, name: 'CH_GROUPBYBILLS' },
                    { value: 1, type: 8, name: 'CH_SHOWDETAILS' },
                ],
            },
        ],
    };
}

/**
 * Normalize Phenix phone numbers toward E.164 without corrupting international codes.
 * Phenix fields already contain international prefixes (e.g. 966..., 971..., 1..., 33..., 44..., 852...).
 */
function normalizePhenixPhone(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;

    let digits = s.replace(/\D/g, '');
    if (!digits) return null;

    // Strip leading 00 (e.g. 00966555 -> 966555)
    if (s.startsWith('00') || digits.startsWith('00')) {
        digits = digits.replace(/^00/, '');
    }

    // Kuwait local 8-digit mobile numbers starting with 2, 5, 6, 9 (e.g. 97959567 -> +96597959567)
    if (digits.length === 8 && ['2', '5', '6', '9'].includes(digits[0])) {
        return `+965${digits}`;
    }

    // E.164 standard is 8 to 15 digits
    if (digits.length >= 8 && digits.length <= 16) {
        return `+${digits}`;
    }

    return null;
}

/**
 * Derive carrier code from Phenix Cost_Center
 * @param {string} costCenter
 * @returns {'DGR'|'ARAMEX'|'FEDEX'|'OTE'|'IW_EXPRESS'|'MANUAL'}
 */
function deriveCarrier(costCenter) {
    const cc = String(costCenter || '').toUpperCase().trim();
    if (!cc) return 'DGR';

    if (cc.includes('DHL') || cc === 'D' || cc.includes('DGR')) {
        return 'DGR';
    }
    if (cc.includes('ARAMEX')) {
        return 'ARAMEX';
    }
    if (cc.includes('FEDEX') || cc.includes('FEEDEX')) {
        return 'FEDEX';
    }
    if (cc.includes('OTE') || cc.includes('LOGESTECHS')) {
        return 'OTE';
    }
    if (cc.includes('IW.EXPRESS') || cc.includes('IW EXPRESS')) {
        return 'IW_EXPRESS';
    }
    return 'DGR';
}

/**
 * Validates whether a Phenix row has complete actionable consignment data
 */
function validatePhenixRow(row) {
    const billId = String(row.bill_id || '').trim();
    const receiptNo = String(row.Receipt_no || '').trim();
    const carrierTracking = String(row.bill_detailCustomField_1 || '').trim();
    const costCenter = String(row.Cost_Center || '').trim();
    const derivedCarrier = deriveCarrier(costCenter);

    const receiverName = String(row.bill_detailCustomField_3 || '').trim();
    const rawReceiverPhone = String(row.bill_detailCustomField_4 || '').trim();
    const receiverPhone = normalizePhenixPhone(rawReceiverPhone);
    const rawSenderPhone = String(row.billCustomField_1 || '').trim();
    const senderPhone = normalizePhenixPhone(rawSenderPhone) || '+96597691271';

    const missing = [];
    if (!billId) missing.push('Bill ID');
    if (!carrierTracking) missing.push('Carrier AWB');
    if (!receiverName) missing.push('Receiver Name');
    if (!receiverPhone) missing.push('Receiver Phone');

    const isComplete = missing.length === 0;

    return {
        isComplete,
        missingFields: missing,
        billId,
        receiptNo,
        carrierTracking,
        costCenter,
        derivedCarrier,
        receiverName,
        receiverPhone,
        rawReceiverPhone,
        senderPhone,
        date: row.Date
    };
}

class PhenixSyncService {
    /**
     * Raw fetch from Phenix Reporting API
     */
    async fetchPhenixReportData(opts = {}) {
        assertPhenixConfigured();

        const timeZone = opts.timeZone || 'Asia/Kuwait';
        const daysBack = Math.max(1, parseInt(opts.daysBack, 10) || config.phenix?.syncDaysBack || 3);

        const today = dateParts(opts.date || new Date(), timeZone);
        const from = addDays(today, -(daysBack - 1));
        const to = addDays(today, 1);

        const phenixCfg = config.phenix;
        const credentials = Buffer.from(
            `${phenixCfg.apiUser}:${phenixCfg.apiPassword}`
        ).toString('base64');

        logger.info(`[PhenixSync] Fetching report from ${from.year}-${from.month}-${from.day} to ${to.year}-${to.month}-${to.day}`);

        const response = await axios.post(
            phenixCfg.endpoint,
            buildPhenixRequestBody(from, to),
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    phenixtoken: phenixCfg.token,
                    Username: phenixCfg.apiUser,
                    Accept: 'application/json',
                    'Content-Type': 'application/json; charset=utf-8',
                },
                timeout: 30000,
            }
        );

        const data = response.data?.result?.[0]?.DATA;
        const rows = Array.isArray(data) ? data : [];
        logger.info(`[PhenixSync] Received ${rows.length} raw bills from Phenix`);

        return {
            from,
            to,
            rows,
        };
    }

    /**
     * Preview Phenix shipments without modifying database
     */
    async previewPhenixShipments(opts = {}) {
        const { rows, from, to } = await this.fetchPhenixReportData(opts);
        const targetCarrier = String(opts.carrier || 'ALL').toUpperCase();
        const onlyComplete = opts.onlyComplete !== false && opts.onlyComplete !== 'false';

        const previewList = [];
        let totalMatched = 0;
        let completeCount = 0;
        let incompleteCount = 0;

        for (const row of rows) {
            const v = validatePhenixRow(row);

            // Filter by carrier
            if (targetCarrier !== 'ALL') {
                if ((targetCarrier === 'DHL' || targetCarrier === 'DGR') && v.derivedCarrier !== 'DGR') continue;
                if (targetCarrier === 'ARAMEX' && v.derivedCarrier !== 'ARAMEX') continue;
                if (targetCarrier === 'FEDEX' && v.derivedCarrier !== 'FEDEX') continue;
                if (targetCarrier === 'OTE' && v.derivedCarrier !== 'OTE') continue;
            }

            totalMatched++;
            if (v.isComplete) {
                completeCount++;
            } else {
                incompleteCount++;
            }

            if (onlyComplete && !v.isComplete) {
                continue;
            }

            // Check if already in DB
            let existing = null;
            if (v.carrierTracking) {
                existing = await prisma.shipment.findFirst({
                    where: {
                        OR: [
                            { dhlTrackingNumber: v.carrierTracking },
                            { trackingNumber: `TRK-${v.carrierTracking}` },
                            { trackingNumber: v.carrierTracking }
                        ]
                    },
                    select: { id: true, trackingNumber: true, status: true, carrierCode: true }
                });
            }

            previewList.push({
                billId: v.billId,
                receiptNo: v.receiptNo,
                carrierTracking: v.carrierTracking,
                costCenter: v.costCenter,
                derivedCarrier: v.derivedCarrier,
                receiverName: v.receiverName || '-',
                receiverPhone: v.receiverPhone || (v.rawReceiverPhone ? `Invalid: ${v.rawReceiverPhone}` : 'Missing Phone'),
                senderPhone: v.senderPhone,
                date: v.date,
                isComplete: v.isComplete,
                missingFields: v.missingFields,
                existsInDb: Boolean(existing),
                existingTrackingNumber: existing?.trackingNumber || null,
                existingStatus: existing?.status || null
            });
        }

        return {
            window: { from, to },
            totalFetched: rows.length,
            carrierFilter: targetCarrier,
            totalMatched,
            completeCount,
            incompleteCount,
            onlyComplete,
            matchedCount: previewList.length,
            items: previewList
        };
    }

    /**
     * Ingest / Synchronize Phenix Shipments into Target-Prod Database
     * Enforces complete data requirements so incomplete consignments are skipped safely.
     */
    async syncPhenixShipments(opts = {}) {
        const { rows, from, to } = await this.fetchPhenixReportData(opts);
        const targetCarrier = String(opts.carrier || 'ALL').toUpperCase();
        const sendWhatsApp = Boolean(opts.sendWhatsApp);
        const onlyComplete = opts.onlyComplete !== false; // default true

        // Resolve default admin / user for assigning shipment ownership
        let defaultUser = null;
        if (opts.userId) {
            defaultUser = await prisma.user.findUnique({ where: { id: opts.userId }, include: { organization: true } });
        }
        if (!defaultUser) {
            defaultUser = await prisma.user.findFirst({
                where: { role: 'admin' },
                include: { organization: true }
            });
        }

        if (!defaultUser) {
            throw new Error('Cannot ingest shipments: No admin user found in database.');
        }

        const summary = {
            window: { from, to },
            totalFetched: rows.length,
            carrierFilter: targetCarrier,
            matchedCount: 0,
            completeCount: 0,
            skippedIncompleteCount: 0,
            createdCount: 0,
            updatedCount: 0,
            carrierSyncedCount: 0,
            whatsAppSentCount: 0,
            errors: [],
            results: []
        };

        for (const row of rows) {
            const v = validatePhenixRow(row);

            // Filter by carrier
            if (targetCarrier !== 'ALL') {
                if ((targetCarrier === 'DHL' || targetCarrier === 'DGR') && v.derivedCarrier !== 'DGR') continue;
                if (targetCarrier === 'ARAMEX' && v.derivedCarrier !== 'ARAMEX') continue;
                if (targetCarrier === 'FEDEX' && v.derivedCarrier !== 'FEDEX') continue;
                if (targetCarrier === 'OTE' && v.derivedCarrier !== 'OTE') continue;
            }

            summary.matchedCount++;

            // Strictly require full data
            if (!v.isComplete) {
                summary.skippedIncompleteCount++;
                summary.errors.push({
                    billId: v.billId,
                    receiptNo: v.receiptNo,
                    carrierTracking: v.carrierTracking,
                    error: `Incomplete consignment data. Missing: ${v.missingFields.join(', ')}`
                });
                continue;
            }

            summary.completeCount++;

            try {
                // Determine unique tracking number: TRK-{carrierTracking}
                const baseTracking = v.carrierTracking || v.receiptNo;
                const trackingNumber = baseTracking.startsWith('TRK-') || baseTracking.startsWith('DGR-') 
                    ? baseTracking 
                    : `TRK-${baseTracking}`;

                // 1. Check if shipment already exists
                let existing = await prisma.shipment.findFirst({
                    where: {
                        OR: [
                            { trackingNumber },
                            { dhlTrackingNumber: v.carrierTracking },
                            { trackingNumber: v.carrierTracking }
                        ]
                    }
                });

                let shipment = null;
                let wasCreated = false;

                if (!existing) {
                    // Create new shipment
                    shipment = await prisma.shipment.create({
                        data: {
                            trackingNumber,
                            carrierCode: v.derivedCarrier,
                            serviceCode: v.derivedCarrier === 'DGR' ? 'P' : 'STD',
                            shipmentType: 'package',
                            status: 'booked',
                            dhlTrackingNumber: v.carrierTracking || null,
                            userId: defaultUser.id,
                            organizationId: defaultUser.organizationId || null,
                            origin: {
                                city: 'Kuwait City',
                                countryCode: 'KW',
                                phone: v.senderPhone,
                                contactPerson: 'Target Logistics'
                            },
                            destination: {
                                city: 'Kuwait',
                                countryCode: 'KW',
                                contactPerson: v.receiverName,
                                phone: v.receiverPhone
                            },
                            customer: {
                                name: v.receiverName,
                                phone: v.receiverPhone
                            },
                            history: [],
                            documents: {
                                phenixBillId: v.billId,
                                phenixReceiptNo: v.receiptNo,
                                costCenter: v.costCenter,
                                source: 'PHENIX_ERP',
                                rawDate: v.date,
                                ingestedAt: new Date().toISOString()
                            }
                        }
                    });

                    wasCreated = true;
                    summary.createdCount++;
                    logger.info(`[PhenixSync] Created new shipment ${trackingNumber} for Phenix Bill #${v.billId} (Carrier AWB: ${v.carrierTracking})`);
                } else {
                    // Update existing record with any missing Phenix metadata
                    const currentDocs = (existing.documents && typeof existing.documents === 'object') ? existing.documents : {};
                    const updatedDocs = {
                        ...currentDocs,
                        phenixBillId: v.billId,
                        phenixReceiptNo: v.receiptNo,
                        costCenter: v.costCenter,
                        lastSyncedAt: new Date().toISOString()
                    };

                    shipment = await prisma.shipment.update({
                        where: { id: existing.id },
                        data: {
                            dhlTrackingNumber: v.carrierTracking || existing.dhlTrackingNumber,
                            customer: {
                                name: v.receiverName || existing.customer?.name,
                                phone: v.receiverPhone || existing.customer?.phone
                            },
                            destination: {
                                ...(typeof existing.destination === 'object' ? existing.destination : {}),
                                contactPerson: v.receiverName || existing.destination?.contactPerson,
                                phone: v.receiverPhone || existing.destination?.phone
                            },
                            documents: updatedDocs
                        }
                    });

                    summary.updatedCount++;
                    logger.info(`[PhenixSync] Updated existing shipment ${shipment.trackingNumber} with Phenix metadata`);
                }

                // 2. Fetch live tracking checkpoints from Carrier API
                let carrierSynced = false;
                let carrierUpdates = null;
                if (v.carrierTracking && v.derivedCarrier !== 'INTERNAL' && v.derivedCarrier !== 'MANUAL') {
                    try {
                        carrierUpdates = await syncCarrierTrackingHistory(shipment);
                        if (carrierUpdates) {
                            shipment = await prisma.shipment.update({
                                where: { id: shipment.id },
                                data: {
                                    history: carrierUpdates.history,
                                    status: carrierUpdates.status
                                }
                            });
                            carrierSynced = true;
                            summary.carrierSyncedCount++;
                            logger.info(`[PhenixSync] Synced carrier checkpoints for ${shipment.trackingNumber} (Status: ${carrierUpdates.status})`);
                        }
                    } catch (carrierErr) {
                        logger.warn(`[PhenixSync] Carrier API sync failed for ${shipment.trackingNumber}: ${carrierErr.message}`);
                    }
                }

                // 3. Send WhatsApp notification if requested and not previously messaged
                let waSent = false;
                if (sendWhatsApp && v.receiverPhone) {
                    try {
                        // Check if already notified
                        const alreadyNotified = await prisma.shipmentNotificationLog.findFirst({
                            where: {
                                shipmentId: shipment.id,
                                status: 'SENT'
                            }
                        });

                        if (!alreadyNotified) {
                            await whatsappService.sendNotification({
                                shipment,
                                recipientRole: 'customer',
                                recipientPhone: v.receiverPhone,
                                recipientName: v.receiverName,
                                templateName: 'shipment_confirmation_2',
                                eventType: 'shipment_created'
                            });
                            waSent = true;
                            summary.whatsAppSentCount++;
                        }
                    } catch (waErr) {
                        logger.warn(`[PhenixSync] WhatsApp dispatch failed for ${shipment.trackingNumber}: ${waErr.message}`);
                    }
                }

                summary.results.push({
                    trackingNumber: shipment.trackingNumber,
                    billId: v.billId,
                    receiptNo: v.receiptNo,
                    carrierTracking: v.carrierTracking,
                    carrierCode: shipment.carrierCode,
                    receiverName: v.receiverName,
                    receiverPhone: v.receiverPhone,
                    status: shipment.status,
                    action: wasCreated ? 'CREATED' : 'UPDATED',
                    carrierSynced,
                    whatsAppSent: waSent,
                    publicTrackingUrl: `https://target-kw.com/track/${shipment.trackingNumber}`
                });

            } catch (itemErr) {
                logger.error(`[PhenixSync] Error processing bill #${v.billId}: ${itemErr.message}`);
                summary.errors.push({
                    billId: v.billId,
                    carrierTracking: v.carrierTracking,
                    error: itemErr.message
                });
            }
        }

        logger.info(`[PhenixSync] Sync completed: Matched=${summary.matchedCount}, FullData=${summary.completeCount}, SkippedIncomplete=${summary.skippedIncompleteCount}, Created=${summary.createdCount}, Updated=${summary.updatedCount}`);
        return summary;
    }
}

module.exports = new PhenixSyncService();
