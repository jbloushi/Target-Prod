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
 * Country normalization dictionary and helper
 */
const COUNTRY_MAP = {
    'KSA': { code: 'SA', name: 'Saudi Arabia' },
    'SAUDI ARABIA': { code: 'SA', name: 'Saudi Arabia' },
    'SA': { code: 'SA', name: 'Saudi Arabia' },
    'QATAR': { code: 'QA', name: 'Qatar' },
    'QA': { code: 'QA', name: 'Qatar' },
    'KUWAIT': { code: 'KW', name: 'Kuwait' },
    'KW': { code: 'KW', name: 'Kuwait' },
    'UAE': { code: 'AE', name: 'United Arab Emirates' },
    'UNITED ARAB EMIRATES': { code: 'AE', name: 'United Arab Emirates' },
    'DUBAI': { code: 'AE', name: 'United Arab Emirates' },
    'ABU DHABI': { code: 'AE', name: 'United Arab Emirates' },
    'AE': { code: 'AE', name: 'United Arab Emirates' },
    'BAHRAIN': { code: 'BH', name: 'Bahrain' },
    'BH': { code: 'BH', name: 'Bahrain' },
    'OMAN': { code: 'OM', name: 'Oman' },
    'OM': { code: 'OM', name: 'Oman' },
    'USA': { code: 'US', name: 'United States' },
    'UNITED STATES': { code: 'US', name: 'United States' },
    'US': { code: 'US', name: 'United States' },
    'UK': { code: 'GB', name: 'United Kingdom' },
    'UNITED KINGDOM': { code: 'GB', name: 'United Kingdom' },
    'GREAT BRITAIN': { code: 'GB', name: 'United Kingdom' },
    'GB': { code: 'GB', name: 'United Kingdom' },
    'CANADA': { code: 'CA', name: 'Canada' },
    'CA': { code: 'CA', name: 'Canada' },
    'FRANCE': { code: 'FR', name: 'France' },
    'FR': { code: 'FR', name: 'France' },
    'GERMANY': { code: 'DE', name: 'Germany' },
    'DE': { code: 'DE', name: 'Germany' },
    'ITALY': { code: 'IT', name: 'Italy' },
    'IT': { code: 'IT', name: 'Italy' },
    'SPAIN': { code: 'ES', name: 'Spain' },
    'ES': { code: 'ES', name: 'Spain' },
    'AUSTRALIA': { code: 'AU', name: 'Australia' },
    'AU': { code: 'AU', name: 'Australia' },
    'EGYPT': { code: 'EG', name: 'Egypt' },
    'EG': { code: 'EG', name: 'Egypt' },
    'JORDAN': { code: 'JO', name: 'Jordan' },
    'JO': { code: 'JO', name: 'Jordan' },
    'LEBANON': { code: 'LB', name: 'Lebanon' },
    'LB': { code: 'LB', name: 'Lebanon' },
    'TURKEY': { code: 'TR', name: 'Turkey' },
    'TR': { code: 'TR', name: 'Turkey' },
    'IRAQ': { code: 'IQ', name: 'Iraq' },
    'IQ': { code: 'IQ', name: 'Iraq' },
    'INDIA': { code: 'IN', name: 'India' },
    'IN': { code: 'IN', name: 'India' },
    'CHINA': { code: 'CN', name: 'China' },
    'CN': { code: 'CN', name: 'China' },
    'HONG KONG': { code: 'HK', name: 'Hong Kong' },
    'HK': { code: 'HK', name: 'Hong Kong' },
    'JAPAN': { code: 'JP', name: 'Japan' },
    'JP': { code: 'JP', name: 'Japan' },
    'SWITZERLAND': { code: 'CH', name: 'Switzerland' },
    'CH': { code: 'CH', name: 'Switzerland' },
    'NETHERLANDS': { code: 'NL', name: 'Netherlands' },
    'NL': { code: 'NL', name: 'Netherlands' },
    'BELGIUM': { code: 'BE', name: 'Belgium' },
    'BE': { code: 'BE', name: 'Belgium' },
    'AUSTRIA': { code: 'AT', name: 'Austria' },
    'AT': { code: 'AT', name: 'Austria' },
    'SWEDEN': { code: 'SE', name: 'Sweden' },
    'SE': { code: 'SE', name: 'Sweden' },
    'NORWAY': { code: 'NO', name: 'Norway' },
    'NO': { code: 'NO', name: 'Norway' },
    'DENMARK': { code: 'DK', name: 'Denmark' },
    'DK': { code: 'DK', name: 'Denmark' },
    'IRELAND': { code: 'IE', name: 'Ireland' },
    'IE': { code: 'IE', name: 'Ireland' },
    'SINGAPORE': { code: 'SG', name: 'Singapore' },
    'SG': { code: 'SG', name: 'Singapore' },
    'MALAYSIA': { code: 'MY', name: 'Malaysia' },
    'MY': { code: 'MY', name: 'Malaysia' },
    'THAILAND': { code: 'TH', name: 'Thailand' },
    'TH': { code: 'TH', name: 'Thailand' },
    'MOROCCO': { code: 'MA', name: 'Morocco' },
    'MA': { code: 'MA', name: 'Morocco' },
    'TUNISIA': { code: 'TN', name: 'Tunisia' },
    'TN': { code: 'TN', name: 'Tunisia' },
    'ALGERIA': { code: 'DZ', name: 'Algeria' },
    'DZ': { code: 'DZ', name: 'Algeria' }
};

function resolveCountry(rawCountry, phone) {
    if (rawCountry) {
        const key = String(rawCountry).trim().toUpperCase();
        if (COUNTRY_MAP[key]) {
            return COUNTRY_MAP[key];
        }
        if (key.length === 2 && /^[A-Z]{2}$/.test(key)) {
            return { code: key, name: String(rawCountry).trim() };
        }
    }
    // Phone prefix fallback if rawCountry is empty or unrecognized
    if (phone) {
        const cleanPhone = String(phone).replace(/\D/g, '');
        if (cleanPhone.startsWith('966')) return { code: 'SA', name: 'Saudi Arabia' };
        if (cleanPhone.startsWith('974')) return { code: 'QA', name: 'Qatar' };
        if (cleanPhone.startsWith('971')) return { code: 'AE', name: 'United Arab Emirates' };
        if (cleanPhone.startsWith('973')) return { code: 'BH', name: 'Bahrain' };
        if (cleanPhone.startsWith('968')) return { code: 'OM', name: 'Oman' };
        if (cleanPhone.startsWith('965')) return { code: 'KW', name: 'Kuwait' };
        if (cleanPhone.startsWith('962')) return { code: 'JO', name: 'Jordan' };
        if (cleanPhone.startsWith('961')) return { code: 'LB', name: 'Lebanon' };
        if (cleanPhone.startsWith('20'))  return { code: 'EG', name: 'Egypt' };
        if (cleanPhone.startsWith('44'))  return { code: 'GB', name: 'United Kingdom' };
        if (cleanPhone.startsWith('33'))  return { code: 'FR', name: 'France' };
        if (cleanPhone.startsWith('49'))  return { code: 'DE', name: 'Germany' };
        if (cleanPhone.startsWith('1'))   return { code: 'US', name: 'United States' };
    }
    return { code: 'KW', name: 'Kuwait' };
}

/**
 * Resolve or auto-create Merchant Organization in database
 */
async function resolveOrCreateMerchantOrg(merchantName, senderPhone, merchantId) {
    if (!merchantName || merchantName.toLowerCase() === 'target logistics' || merchantName.toLowerCase() === 'target') {
        return null;
    }

    const trimmedName = merchantName.trim();
    try {
        let org = await prisma.organization.findFirst({
            where: {
                name: trimmedName
            }
        });

        if (!org) {
            org = await prisma.organization.create({
                data: {
                    name: trimmedName,
                    type: 'BUSINESS',
                    billingContactName: trimmedName,
                    billingWhatsappNumber: senderPhone || null,
                    currency: 'KWD',
                    active: true
                }
            });
            logger.info(`[PhenixSync] Created new Organization "${trimmedName}" (ID: ${org.id}) for merchant`);
        }

        return org;
    } catch (err) {
        logger.warn(`[PhenixSync] Merchant organization lookup/create failed for "${trimmedName}": ${err.message}`);
        try {
            return await prisma.organization.findFirst({ where: { name: trimmedName } });
        } catch {
            return null;
        }
    }
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

    // Merchant Store Organization & Client ID
    const merchantName = String(row.Client || '').trim() || 'Target Logistics';
    const merchantId = String(row.client_id || '').trim();
    
    // Sender Contact (may differ from Merchant Store Name)
    const rawSenderContact = String(row.billCustomField_2 || row.Sender || '').trim();
    const senderName = rawSenderContact || merchantName;
    const rawSenderPhone = String(row.billCustomField_1 || '').trim();
    const senderPhone = normalizePhenixPhone(rawSenderPhone) || '+96597691271';

    // Consignee / Recipient info
    const receiverName = String(row.bill_detailCustomField_3 || '').trim();
    const rawReceiverPhone = String(row.bill_detailCustomField_4 || '').trim();
    const receiverPhone = normalizePhenixPhone(rawReceiverPhone);

    // Destination Country
    const rawCountry = row.Mcolor || '';
    const destCountry = resolveCountry(rawCountry, receiverPhone || rawReceiverPhone);

    // Financials
    const totalAmount = parseFloat(row.Total || row.payment || 0) || 0;
    const paymentMethod = String(row.Payment_method || '').trim();

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
        merchantName,
        merchantId,
        senderName,
        rawSenderContact,
        senderPhone,
        rawSenderPhone,
        receiverName,
        receiverPhone,
        rawReceiverPhone,
        destCountryCode: destCountry.code,
        destCountryName: destCountry.name,
        totalAmount,
        paymentMethod,
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
                merchantName: v.merchantName,
                merchantId: v.merchantId,
                senderName: v.senderName,
                senderPhone: v.senderPhone,
                destCountryCode: v.destCountryCode,
                destCountryName: v.destCountryName,
                receiverName: v.receiverName || '-',
                receiverPhone: v.receiverPhone || (v.rawReceiverPhone ? `Invalid: ${v.rawReceiverPhone}` : 'Missing Phone'),
                totalAmount: v.totalAmount,
                paymentMethod: v.paymentMethod,
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

                // Resolve or auto-create Merchant Store Organization
                const merchantOrg = await resolveOrCreateMerchantOrg(v.merchantName, v.senderPhone, v.merchantId);
                const assignedOrgId = merchantOrg?.id || defaultUser.organizationId || null;

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
                    // Create new shipment with proper Merchant (Origin) & Consignee (Destination)
                    shipment = await prisma.shipment.create({
                        data: {
                            trackingNumber,
                            carrierCode: v.derivedCarrier,
                            serviceCode: v.derivedCarrier === 'DGR' ? 'P' : 'STD',
                            shipmentType: 'package',
                            status: 'booked',
                            dhlTrackingNumber: v.carrierTracking || null,
                            userId: defaultUser.id,
                            organizationId: assignedOrgId,
                            price: v.totalAmount > 0 ? v.totalAmount : null,
                            currency: 'KWD',
                            origin: {
                                city: 'Kuwait City',
                                countryCode: 'KW',
                                phone: v.senderPhone,
                                contactPerson: v.senderName,
                                companyName: v.merchantName,
                                merchantId: v.merchantId
                            },
                            destination: {
                                city: v.destCountryName,
                                countryCode: v.destCountryCode,
                                contactPerson: v.receiverName,
                                phone: v.receiverPhone
                            },
                            customer: {
                                name: v.receiverName,
                                phone: v.receiverPhone,
                                merchant: v.merchantName,
                                merchantId: v.merchantId
                            },
                            history: [],
                            documents: {
                                phenixBillId: v.billId,
                                phenixReceiptNo: v.receiptNo,
                                phenixClientId: v.merchantId,
                                merchantName: v.merchantName,
                                senderName: v.senderName,
                                paymentMethod: v.paymentMethod,
                                destCountry: v.destCountryName,
                                destCountryCode: v.destCountryCode,
                                costCenter: v.costCenter,
                                source: 'PHENIX_ERP',
                                rawDate: v.date,
                                ingestedAt: new Date().toISOString()
                            }
                        }
                    });

                    wasCreated = true;
                    summary.createdCount++;
                    logger.info(`[PhenixSync] Created new shipment ${trackingNumber} for Merchant "${v.merchantName}" (ID: ${v.merchantId}) -> Dest: ${v.destCountryName} (AWB: ${v.carrierTracking})`);
                } else {
                    // Update existing record with any missing Phenix metadata & link org if unassigned
                    const currentDocs = (existing.documents && typeof existing.documents === 'object') ? existing.documents : {};
                    const updatedDocs = {
                        ...currentDocs,
                        phenixBillId: v.billId,
                        phenixReceiptNo: v.receiptNo,
                        phenixClientId: v.merchantId,
                        merchantName: v.merchantName,
                        senderName: v.senderName,
                        paymentMethod: v.paymentMethod,
                        destCountry: v.destCountryName,
                        destCountryCode: v.destCountryCode,
                        costCenter: v.costCenter,
                        lastSyncedAt: new Date().toISOString()
                    };

                    shipment = await prisma.shipment.update({
                        where: { id: existing.id },
                        data: {
                            dhlTrackingNumber: v.carrierTracking || existing.dhlTrackingNumber,
                            organizationId: existing.organizationId || assignedOrgId,
                            price: existing.price || (v.totalAmount > 0 ? v.totalAmount : undefined),
                            customer: {
                                name: v.receiverName || existing.customer?.name,
                                phone: v.receiverPhone || existing.customer?.phone,
                                merchant: v.merchantName,
                                merchantId: v.merchantId
                            },
                            origin: {
                                ...(typeof existing.origin === 'object' ? existing.origin : {}),
                                contactPerson: v.senderName || existing.origin?.contactPerson,
                                companyName: v.merchantName,
                                merchantId: v.merchantId,
                                phone: v.senderPhone || existing.origin?.phone,
                                city: 'Kuwait City',
                                countryCode: 'KW'
                            },
                            destination: {
                                ...(typeof existing.destination === 'object' ? existing.destination : {}),
                                contactPerson: v.receiverName || existing.destination?.contactPerson,
                                phone: v.receiverPhone || existing.destination?.phone,
                                city: v.destCountryName || existing.destination?.city,
                                countryCode: v.destCountryCode || existing.destination?.countryCode
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
