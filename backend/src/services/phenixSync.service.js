const axios = require('axios');
const logger = require('../utils/logger');
const { createHash } = require('crypto');
const config = require('../config/config');
const { prisma } = require('../config/database');
const { syncCarrierTrackingHistory, buildTrackingSyncDocuments } = require('../controllers/shipment.helpers');
const whatsappService = require('./whatsappIntegration.service');
const financeLedgerService = require('./financeLedger.service');
const SlaTrackerService = require('./slaTracker.service');
const { jobQueue } = require('./queue');
const phenixImportRunService = require('./phenixImportRun.service');

const MAX_PHENIX_DAYS_BACK = 62;

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

/**
 * Parse Phenix raw date string (e.g. "26/9/2026", "2026-09-26", "26/09/2026") into valid Date object
 */
function parsePhenixDate(rawDate) {
    if (!rawDate) return new Date();
    const s = String(rawDate).trim();
    if (!s) return new Date();

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
        return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date() : d;
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

function countryFromPhone(phone) {
    if (!phone) return null;
    const cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('966')) return COUNTRY_MAP.SA;
    if (cleanPhone.startsWith('974')) return COUNTRY_MAP.QA;
    if (cleanPhone.startsWith('971')) return COUNTRY_MAP.AE;
    if (cleanPhone.startsWith('973')) return COUNTRY_MAP.BH;
    if (cleanPhone.startsWith('968')) return COUNTRY_MAP.OM;
    if (cleanPhone.startsWith('965')) return COUNTRY_MAP.KW;
    if (cleanPhone.startsWith('962')) return { code: 'JO', name: 'Jordan' };
    if (cleanPhone.startsWith('961')) return { code: 'LB', name: 'Lebanon' };
    if (cleanPhone.startsWith('20')) return { code: 'EG', name: 'Egypt' };
    if (cleanPhone.startsWith('44')) return { code: 'GB', name: 'United Kingdom' };
    if (cleanPhone.startsWith('33')) return { code: 'FR', name: 'France' };
    if (cleanPhone.startsWith('49')) return { code: 'DE', name: 'Germany' };
    if (cleanPhone.startsWith('1')) return { code: 'US', name: 'United States' };
    return null;
}

function destinationSignals(rawCountry, phone) {
    const rawKey = String(rawCountry || '').trim().toUpperCase();
    const source = rawKey && (COUNTRY_MAP[rawKey] || /^[A-Z]{2}$/.test(rawKey))
        ? resolveCountry(rawCountry, null)
        : null;
    const phoneCountry = countryFromPhone(phone);
    const resolved = source || phoneCountry || { code: 'KW', name: 'Kuwait' };
    return {
        resolved,
        sourceCountry: source,
        phoneCountry,
        hasSignal: Boolean(source || phoneCountry),
        conflict: Boolean(source && phoneCountry && source.code !== phoneCountry.code)
    };
}

function sourceKeyForRow(row, v) {
    const natural = v.billId || `${v.carrierTracking}|${v.receiptNo}`;
    return createHash('sha256').update(`phenix:${natural}`).digest('hex');
}

/**
 * Resolve or auto-create Merchant Organization in database
 */
async function resolveOrCreateMerchantOrg(merchantName, senderPhone, merchantId, orgCache = null) {
    if (!merchantName || merchantName.toLowerCase() === 'target logistics' || merchantName.toLowerCase() === 'target') {
        return null;
    }

    const trimmedName = merchantName.trim();
    const cacheKey = trimmedName.toLowerCase();
    if (orgCache && orgCache.has(cacheKey)) {
        return orgCache.get(cacheKey);
    }

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

        if (orgCache && org) orgCache.set(cacheKey, org);
        return org;
    } catch (err) {
        logger.warn(`[PhenixSync] Merchant organization lookup/create failed for "${trimmedName}": ${err.message}`);
        try {
            const fallbackOrg = await prisma.organization.findFirst({ where: { name: trimmedName } });
            if (orgCache && fallbackOrg) orgCache.set(cacheKey, fallbackOrg);
            return fallbackOrg;
        } catch {
            return null;
        }
    }
}

/**
 * Automatically posts Double-Entry Ledger entries, Payments, Allocations, and Invoices
 * for synced Phenix consignments into Target-Prod's Finance subsystem.
 */
async function syncPhenixFinancialRecord({ shipment, v, orgId, defaultUserId }) {
    const hasSellPrice = Boolean(v.totalAmount && v.totalAmount > 0);
    const hasCostPrice = Boolean(v.costPrice && v.costPrice > 0);
    if (!hasSellPrice && !hasCostPrice) {
        return;
    }

    try {
        const billDate = parsePhenixDate(v.date);
        const isPaid = Boolean(
            (v.paymentMethod && (
                v.paymentMethod.includes('نقداً') || 
                v.paymentMethod.toLowerCase().includes('cash') || 
                v.paymentMethod.toLowerCase().includes('knet') || 
                v.paymentMethod.toLowerCase().includes('card') ||
                v.paymentMethod.toLowerCase().includes('pos')
            )) ||
            (v.paidAmount >= v.totalAmount && v.totalAmount > 0)
        );

        if (hasSellPrice) {
            // 1. Ensure Debit Ledger Entry exists (Freight Charge)
            let chargeEntry = await prisma.organizationLedger.findFirst({
                where: {
                    sourceRepo: 'Shipment',
                    sourceId: shipment.id,
                    category: 'SHIPMENT_CHARGE'
                }
            });

            if (!chargeEntry) {
                chargeEntry = await financeLedgerService.createLedgerEntry(orgId, {
                    amount: v.totalAmount,
                    currency: 'KWD',
                    entryType: 'DEBIT',
                    category: 'SHIPMENT_CHARGE',
                    description: `Consignment Freight Charge (Phenix Bill #${v.billId} - ${shipment.trackingNumber})`,
                    reference: v.receiptNo || v.billId,
                    sourceRepo: 'Shipment',
                    sourceId: shipment.id,
                    createdBy: defaultUserId,
                    createdAt: billDate,
                    metadata: {
                        phenixBillId: v.billId,
                        phenixReceiptNo: v.receiptNo,
                        merchantId: v.merchantId,
                        merchantName: v.merchantName,
                        paymentMethod: v.paymentMethod,
                        weightKg: v.weightKg,
                        costPrice: v.costPrice,
                        customsFee: v.customsFee,
                        isPaid
                    }
                });

                // Mirror freight charge to Tryton General Ledger
                try {
                    jobQueue.enqueue('tryton_dual_write', {
                        action: 'MIRROR_FINANCIAL_ENTRY',
                        partyName: v.merchantName || v.senderName || 'Phenix Merchant',
                        amount: v.totalAmount,
                        entryType: 'DEBIT',
                        description: `Consignment Freight Charge (Phenix Bill #${v.billId} - ${shipment.trackingNumber})`,
                        reference: v.receiptNo || v.billId,
                        source: 'PHENIX_CHARGE'
                    }, { maxRetries: 3, backoffMs: 5000 }).catch(err => {
                        logger.warn(`[PhenixSync] Tryton freight charge dual-write enqueue failed: ${err.message}`);
                    });
                } catch (err) {
                    logger.warn(`[PhenixSync] Dual-write queue dispatch error: ${err.message}`);
                }
            }

            // 2. If Paid at counter / KNET, record Payment & Credit Ledger Entry
            if (isPaid) {
                const paymentRef = `PHENIX-${v.receiptNo || v.billId}`;
                let payment = await prisma.payment.findFirst({
                    where: {
                        reference: paymentRef
                    }
                });

                if (!payment) {
                    payment = await prisma.payment.create({
                        data: {
                            organizationId: orgId,
                            amount: v.totalAmount,
                            currency: 'KWD',
                            status: 'APPLIED',
                            method: v.paymentMethod || 'CASH',
                            reference: paymentRef,
                            notes: `Automated payment receipt from Phenix ERP Bill #${v.billId} (${v.paymentMethod || 'Cash'})`,
                            createdById: defaultUserId,
                            postedAt: billDate,
                            createdAt: billDate,
                            metadata: {
                                phenixBillId: v.billId,
                                phenixReceiptNo: v.receiptNo,
                                shipmentId: shipment.id
                            }
                        }
                    });

                    // Link payment allocation to shipment
                    await prisma.paymentAllocation.create({
                        data: {
                            organizationId: orgId,
                            paymentId: payment.id,
                            shipmentId: shipment.id,
                            amount: v.totalAmount,
                            currency: 'KWD',
                            status: 'ACTIVE',
                            createdBy: defaultUserId,
                            createdAt: billDate
                        }
                    });

                    // Create Credit Ledger entry for the payment
                    await financeLedgerService.createLedgerEntry(orgId, {
                        amount: v.totalAmount,
                        currency: 'KWD',
                        entryType: 'CREDIT',
                        category: 'PAYMENT',
                        description: `Payment Receipt (${v.paymentMethod || 'CASH'} - Phenix #${v.receiptNo || v.billId})`,
                        reference: paymentRef,
                        sourceRepo: 'Payment',
                        sourceId: payment.id,
                        createdBy: defaultUserId,
                        createdAt: billDate,
                        metadata: {
                            phenixBillId: v.billId,
                            paymentId: payment.id,
                            shipmentId: shipment.id
                        }
                    });

                    // Mirror payment receipt to Tryton General Ledger
                    try {
                        jobQueue.enqueue('tryton_dual_write', {
                            action: 'MIRROR_FINANCIAL_ENTRY',
                            partyName: v.merchantName || v.senderName || 'Phenix Merchant',
                            amount: v.totalAmount,
                            entryType: 'CREDIT',
                            description: `Payment Receipt (${v.paymentMethod || 'CASH'} - Phenix #${v.receiptNo || v.billId})`,
                            reference: paymentRef,
                            source: 'PAYMENT'
                        }, { maxRetries: 3, backoffMs: 5000 }).catch(err => {
                            logger.warn(`[PhenixSync] Tryton payment dual-write enqueue failed: ${err.message}`);
                        });
                    } catch (err) {
                        logger.warn(`[PhenixSync] Dual-write queue payment dispatch error: ${err.message}`);
                    }

                    // Post Payment Receipt to internal Double-Entry General Ledger (Dr 1010 Cash/Bank, Cr 1100 AR)
                    try {
                        const generalLedgerService = require('./generalLedger.service');
                        if (typeof generalLedgerService?.postPaymentReceiptEntry === 'function') {
                            await generalLedgerService.postPaymentReceiptEntry({
                                paymentId: payment.id,
                                reference: paymentRef,
                                organizationId: orgId,
                                amount: v.totalAmount,
                                currency: 'KWD',
                                createdById: defaultUserId
                            });
                        }
                    } catch (glPayErr) {
                        logger.warn(`[PhenixSync] GL payment receipt non-fatal warning for ${shipment.trackingNumber}: ${glPayErr.message}`);
                    }
                }

                // Update shipment paid state
                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: {
                        paid: true,
                        totalPaid: v.totalAmount,
                        remainingBalance: 0
                    }
                });
            } else {
                // Unpaid / On Account (آجل)
                await prisma.shipment.update({
                    where: { id: shipment.id },
                    data: {
                        paid: false,
                        totalPaid: 0,
                        remainingBalance: v.totalAmount
                    }
                });
            }

            // 3. Auto-generate / link official Invoice in Finance Module
            const invoiceNumber = `INV-PH-${v.receiptNo || v.billId}`;
            let invoice = await prisma.invoice.findUnique({
                where: { invoiceNumber }
            });

            if (!invoice && chargeEntry) {
                invoice = await prisma.invoice.create({
                    data: {
                        invoiceNumber,
                        organizationId: orgId,
                        periodStart: billDate,
                        periodEnd: billDate,
                        subtotal: v.totalAmount,
                        vat: 0,
                        total: v.totalAmount,
                        currency: 'KWD',
                        status: isPaid ? 'paid' : 'issued',
                        paidAt: isPaid ? billDate : null,
                        notes: `Phenix ERP Official Tax Invoice (Bill #${v.billId}, Receipt #${v.receiptNo}) - Method: ${v.paymentMethod || 'Standard'}`,
                        createdById: defaultUserId,
                        createdAt: billDate,
                        lines: {
                            create: {
                                shipmentId: shipment.id,
                                ledgerEntryId: chargeEntry.id,
                                trackingNumber: shipment.trackingNumber,
                                shipmentDate: billDate,
                                amount: v.totalAmount,
                                currency: 'KWD',
                                paid: isPaid,
                                totalPaid: isPaid ? v.totalAmount : 0,
                                remainingBalance: isPaid ? 0 : v.totalAmount,
                                createdAt: billDate
                            }
                        }
                    }
                });
                logger.info(`[PhenixSync] Generated official Invoice ${invoiceNumber} (${isPaid ? 'PAID' : 'ISSUED'}) for Merchant "${v.merchantName}" [Date: ${billDate.toISOString()}]`);
            }
        }

        // 4. Record Platform-Level Carrier Wholesale Payable (COGS / Carrier AP) from bill_detailCustomField_11
        let postedNewPayable = false;
        if (hasCostPrice) {
            const existingPayable = await prisma.organizationLedger.findFirst({
                where: {
                    sourceRepo: 'Shipment',
                    sourceId: shipment.id,
                    category: 'CARRIER_PAYABLE'
                }
            });

            if (!existingPayable) {
                await financeLedgerService.recordCarrierPayable({
                    organizationId: null,
                    shipmentId: shipment.id,
                    carrierCode: shipment.carrierCode || v.derivedCarrier || 'DGR',
                    costPrice: v.costPrice,
                    currency: 'KWD',
                    trackingNumber: shipment.trackingNumber,
                    createdBy: defaultUserId
                });
                postedNewPayable = true;
            }
        }

        // 5. Post Double-Entry General Ledger Entry (Dr 1100 AR, Cr 4010 Revenue, Dr 5010 Carrier Expense, Cr 2010 Carrier AP)
        if ((hasSellPrice || postedNewPayable) && typeof prisma.journalEntry?.findFirst === 'function') {
            try {
                const existingGl = await prisma.journalEntry.findFirst({
                    where: {
                        sourceType: 'SHIPMENT_BOOKING',
                        sourceId: String(shipment.id)
                    }
                });
                if (!existingGl) {
                    const generalLedgerService = require('./generalLedger.service');
                    if (typeof generalLedgerService?.postShipmentBookingEntry === 'function') {
                        await generalLedgerService.postShipmentBookingEntry({
                            shipmentId: shipment.id,
                            trackingNumber: shipment.trackingNumber,
                            organizationId: orgId,
                            customerPrice: v.totalAmount || 0,
                            carrierCost: v.costPrice || 0,
                            carrierCode: shipment.carrierCode || v.derivedCarrier || 'DGR',
                            currency: 'KWD',
                            createdById: defaultUserId
                        });
                    }
                }
            } catch (glErr) {
                logger.warn(`[PhenixSync] GL booking entry non-fatal warning for ${shipment.trackingNumber}: ${glErr.message}`);
            }
        }
    } catch (finErr) {
        logger.warn(`[PhenixSync] Financial sync error for shipment ${shipment.trackingNumber}: ${finErr.message}`);
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
 * Derive carrier code from Phenix Cost_Center and Tracking Number pattern
 * @param {string} costCenter
 * @param {string} [carrierTracking]
 * @returns {'DGR'|'ARAMEX'|'FEDEX'|'OTE'|'IW_EXPRESS'|'MANUAL'}
 */
function deriveCarrier(costCenter, carrierTracking = '') {
    const cc = String(costCenter || '').toUpperCase().trim();
    const trk = String(carrierTracking || '').trim().toUpperCase();

    if (cc.includes('POSTA PLUS') || cc.includes('POSTAPLUS') || trk.startsWith('PP')) {
        return 'POSTA_PLUS';
    }
    if (cc.includes('TKW') || trk.startsWith('TKW')) {
        return 'INTERNAL';
    }
    if (cc.includes('بحري') || cc.includes('SEA')) {
        return 'SEA_FREIGHT';
    }
    if (cc.includes('بري') || cc.includes('LAND')) {
        return 'LAND_FREIGHT';
    }
    if (cc.includes('FEDEX') || cc.includes('FEEDEX') || cc.startsWith('FED') || trk.startsWith('FED') || (/^\d{12}$/.test(trk) && !cc.includes('ARAMEX') && !cc.includes('DHL'))) {
        return 'FEDEX';
    }
    if (cc.includes('ARAMEX') || cc.includes('ARM') || (trk.startsWith('38') && (trk.length === 10 || trk.length === 11))) {
        return 'ARAMEX';
    }
    if (cc.includes('DHL') || cc === 'D' || cc.includes('DGR') || cc.includes('جوي') || (/^\d{10}$/.test(trk) && !cc.includes('ARAMEX'))) {
        return 'DGR';
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
    const derivedCarrier = deriveCarrier(costCenter, carrierTracking);

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
    const rawCountry = String(row.Mcolor || '').trim();
    const destination = destinationSignals(rawCountry, receiverPhone || rawReceiverPhone);
    const destCountry = destination.resolved;

    // Weight & Financials
    const weightKg = parseFloat(row.Mat_Amount || 0) || 0;
    const unitPrice = parseFloat(row.Sale_price || row.Price || 0) || 0;
    const totalAmount = parseFloat(row.Total || row.payment || 0) || 0;
    const paidAmount = parseFloat(row.payment || 0) || 0;
    const costPrice = parseFloat(row.bill_detailCustomField_11 || 0) || 0;
    const customsFee = parseFloat(row.bill_detailCustomField_12 || row.Extra || 0) || 0;
    const markupAmount = (totalAmount > 0 && costPrice > 0)
        ? Number((totalAmount - costPrice).toFixed(4))
        : null;
    const paymentMethod = String(row.Payment_method || '').trim();

    // Operational metadata
    const billType = String(row.Type || '').trim();
    const itemDescription = String(row.Item || '').trim();
    const employee = String(row.Employee || '').trim();
    const phenixUser = String(row.User || '').trim();
    const branch = String(row.Branch || '').trim();
    const note = String(row.Note || '').trim();

    const missing = [];
    if (!billId) missing.push('Bill ID');
    if (!carrierTracking) missing.push('Carrier AWB');
    if (!receiverName) missing.push('Receiver Name');
    if (!receiverPhone) missing.push('Receiver Phone');
    if (!destination.hasSignal) missing.push('Destination Country');

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
        rawCountry,
        phoneCountryCode: destination.phoneCountry?.code || null,
        phoneCountryName: destination.phoneCountry?.name || null,
        destinationConflict: destination.conflict,
        weightKg,
        unitPrice,
        totalAmount,
        paidAmount,
        costPrice,
        customsFee,
        markupAmount,
        paymentMethod,
        billType,
        itemDescription,
        employee,
        phenixUser,
        branch,
        note,
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
        if (daysBack > MAX_PHENIX_DAYS_BACK) {
            throw new Error(`Phenix import window cannot exceed ${MAX_PHENIX_DAYS_BACK} days; run smaller dated windows for historical backfills.`);
        }

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

        // Batch-preload existing shipments in 1 query instead of N sequential findFirst calls
        const allAwbs = [];
        const allTrkAwbs = [];
        const validatedRows = rows.map((row) => {
            const v = validatePhenixRow(row);
            if (v.carrierTracking) {
                allAwbs.push(v.carrierTracking);
                allTrkAwbs.push(`TRK-${v.carrierTracking}`);
            }
            return { row, v };
        });

        const existingByLookup = new Map();
        if (allAwbs.length > 0 && typeof prisma.shipment?.findMany === 'function') {
            try {
                const existingBatch = await prisma.shipment.findMany({
                    where: {
                        OR: [
                            { dhlTrackingNumber: { in: allAwbs } },
                            { trackingNumber: { in: [...allAwbs, ...allTrkAwbs] } }
                        ]
                    },
                    select: { id: true, trackingNumber: true, dhlTrackingNumber: true, status: true, carrierCode: true }
                });
                for (const s of existingBatch) {
                    if (s.trackingNumber) existingByLookup.set(s.trackingNumber, s);
                    if (s.dhlTrackingNumber) existingByLookup.set(s.dhlTrackingNumber, s);
                }
            } catch (_) {}
        }

        for (const { row, v } of validatedRows) {
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

            // Check if already in DB via preloaded Map
            let existing = null;
            if (v.carrierTracking) {
                existing = existingByLookup.get(v.carrierTracking)
                    || existingByLookup.get(`TRK-${v.carrierTracking}`)
                    || null;
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
                weightKg: v.weightKg,
                unitPrice: v.unitPrice,
                totalAmount: v.totalAmount,
                paidAmount: v.paidAmount,
                costPrice: v.costPrice,
                customsFee: v.customsFee,
                markupAmount: v.markupAmount,
                paymentMethod: v.paymentMethod,
                billType: v.billType,
                itemDescription: v.itemDescription,
                employee: v.employee,
                date: v.date,
                isComplete: v.isComplete,
                missingFields: v.missingFields,
                existsInDb: Boolean(existing),
                existingTrackingNumber: existing?.trackingNumber || null,
                existingStatus: existing?.status || null,
                rawRow: row
            });
        }

        const missingBreakdown = {
            missingPhone: 0,
            missingAwb: 0,
            missingName: 0,
            missingCountry: 0,
            missingSenderPhone: 0
        };

        for (const it of previewList) {
            if (!it.isComplete) {
                if (it.missingFields.includes('Receiver Phone')) missingBreakdown.missingPhone++;
                if (it.missingFields.includes('Carrier AWB')) missingBreakdown.missingAwb++;
                if (it.missingFields.includes('Receiver Name')) missingBreakdown.missingName++;
                if (it.missingFields.includes('Destination Country')) missingBreakdown.missingCountry++;
                if (it.missingFields.includes('Sender Phone')) missingBreakdown.missingSenderPhone++;
            }
        }

        const completionRate = totalMatched > 0 ? Math.round((completeCount / totalMatched) * 100) : 100;

        return {
            window: { from, to },
            totalFetched: rows.length,
            carrierFilter: targetCarrier,
            totalMatched,
            completeCount,
            incompleteCount,
            completionRate,
            missingBreakdown,
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
        const sendWhatsApp = opts.sendWhatsApp !== false; // default true: upcoming imports are automatically notified
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

        const importRun = await phenixImportRunService.createRun({
            from,
            to,
            carrierFilter: targetCarrier,
            triggeredBy: opts.triggeredBy || 'system'
        });
        const importRunId = importRun?.id || null;

        const orgCache = new Map();
        const shipmentsToSyncCarrier = [];
        const notificationsToSend = [];
        const resultIndexByShipmentId = new Map();

        // Batch-preload existing shipments in 1 query to avoid N+1 round-trips
        const batchSourceKeys = [];
        const batchTrackingNumbers = [];
        const batchCarrierTrackings = [];
        const preparedRows = rows.map((row) => {
            const v = validatePhenixRow(row);
            const sourceKey = sourceKeyForRow(row, v);
            if (v.isComplete) {
                const baseTracking = v.carrierTracking || v.receiptNo;
                const trackingNumber = baseTracking.startsWith('TRK-') || baseTracking.startsWith('DGR-')
                    ? baseTracking
                    : `TRK-${baseTracking}`;
                batchSourceKeys.push(sourceKey);
                batchTrackingNumbers.push(trackingNumber);
                if (v.carrierTracking) {
                    batchCarrierTrackings.push(v.carrierTracking);
                }
            }
            return { row, v, sourceKey };
        });

        const existingMap = new Map();
        if (batchSourceKeys.length > 0 && typeof prisma.shipment?.findMany === 'function') {
            try {
                const existingRecords = await prisma.shipment.findMany({
                    where: {
                        OR: [
                            { phenixSourceKey: { in: batchSourceKeys } },
                            { trackingNumber: { in: [...batchTrackingNumbers, ...batchCarrierTrackings] } },
                            ...(batchCarrierTrackings.length > 0 ? [{ dhlTrackingNumber: { in: batchCarrierTrackings } }] : [])
                        ]
                    }
                });
                for (const rec of existingRecords) {
                    if (rec.phenixSourceKey) existingMap.set(`src:${rec.phenixSourceKey}`, rec);
                    if (rec.trackingNumber) existingMap.set(`trk:${rec.trackingNumber}`, rec);
                    if (rec.dhlTrackingNumber) existingMap.set(`awb:${rec.dhlTrackingNumber}`, rec);
                }
            } catch (_) {}
        }

        for (const { row, v, sourceKey } of preparedRows) {
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
                await phenixImportRunService.recordItem(importRunId, {
                    sourceKey,
                    billId: v.billId,
                    receiptNo: v.receiptNo,
                    carrierTracking: v.carrierTracking,
                    derivedCarrier: v.derivedCarrier,
                    rawDestination: v.rawCountry,
                    resolvedDestination: v.destCountryCode,
                    phoneCountry: v.phoneCountryCode,
                    status: 'SKIPPED_INCOMPLETE',
                    errorMessage: `Missing: ${v.missingFields.join(', ')}`,
                    rawRow: row
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

                // Resolve or auto-create Merchant Store Organization (cached per run)
                const merchantOrg = await resolveOrCreateMerchantOrg(v.merchantName, v.senderPhone, v.merchantId, orgCache);
                const assignedOrgId = merchantOrg?.id || defaultUser.organizationId || null;

                // 1. Check if shipment already exists (using preloaded Map, fallback to findFirst)
                let existing = existingMap.get(`src:${sourceKey}`)
                    || existingMap.get(`trk:${trackingNumber}`)
                    || (v.carrierTracking ? existingMap.get(`awb:${v.carrierTracking}`) : null)
                    || (v.carrierTracking ? existingMap.get(`trk:${v.carrierTracking}`) : null)
                    || null;

                if (!existing && existingMap.size === 0) {
                    existing = await prisma.shipment.findFirst({
                        where: {
                            OR: [
                                { phenixSourceKey: sourceKey },
                                { trackingNumber },
                                { dhlTrackingNumber: v.carrierTracking },
                                { trackingNumber: v.carrierTracking }
                            ]
                        }
                    });
                }

                let shipment = null;
                let wasCreated = false;

                const consignmentDate = parsePhenixDate(v.date);
                const estimatedDelivery = SlaTrackerService.calculateEstimatedDelivery({
                    createdAt: consignmentDate,
                    origin: { countryCode: 'KW' },
                    destination: { countryCode: v.destCountryCode },
                    carrierCode: v.derivedCarrier,
                    serviceCode: v.derivedCarrier === 'DGR' ? 'P' : 'STD'
                });

                const phenixParcels = v.weightKg > 0 ? [{
                    weight: v.weightKg,
                    quantity: 1,
                    description: v.itemDescription || 'General Cargo',
                    dimensions: { length: 20, width: 15, height: 10, unit: 'cm' }
                }] : undefined;

                const phenixPricingSnapshot = (v.totalAmount > 0 || v.costPrice > 0 || v.weightKg > 0) ? {
                    totalPrice: v.totalAmount,
                    costPrice: v.costPrice,
                    markupAmount: v.markupAmount,
                    chargeableWeight: v.weightKg,
                    unitPrice: v.unitPrice,
                    customsFee: v.customsFee,
                    currency: 'KWD',
                    source: 'PHENIX_ERP'
                } : undefined;

                let needsFinancialSync = true;

                if (!existing) {
                    // Create new shipment with proper Merchant (Origin) & Consignee (Destination)
                    shipment = await prisma.shipment.create({
                        data: {
                            trackingNumber,
                            phenixSourceKey: sourceKey,
                            carrierCode: v.derivedCarrier,
                            serviceCode: v.derivedCarrier === 'DGR' ? 'P' : 'STD',
                            shipmentType: 'package',
                            status: 'booked',
                            dhlTrackingNumber: v.carrierTracking || null,
                            userId: defaultUser.id,
                            organizationId: assignedOrgId,
                            price: v.totalAmount > 0 ? v.totalAmount : null,
                            costPrice: v.costPrice > 0 ? v.costPrice : null,
                            markupAmount: v.markupAmount !== null ? v.markupAmount : null,
                            currency: 'KWD',
                            createdAt: consignmentDate,
                            estimatedDelivery,
                            parcels: phenixParcels,
                            pricingSnapshot: phenixPricingSnapshot,
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
                                paidAmount: v.paidAmount,
                                weightKg: v.weightKg,
                                unitPrice: v.unitPrice,
                                costPrice: v.costPrice,
                                customsFee: v.customsFee,
                                markupAmount: v.markupAmount,
                                billType: v.billType,
                                itemDescription: v.itemDescription,
                                employee: v.employee,
                                phenixUser: v.phenixUser,
                                branch: v.branch,
                                note: v.note,
                                destCountry: v.destCountryName,
                                destCountryCode: v.destCountryCode,
                                destinationSignals: {
                                    rawCountry: v.rawCountry,
                                    phoneCountryCode: v.phoneCountryCode,
                                    conflict: v.destinationConflict
                                },
                                costCenter: v.costCenter,
                                source: 'PHENIX_ERP',
                                rawDate: v.date,
                                financialSyncComplete: true,
                                ingestedAt: new Date().toISOString()
                            }
                        }
                    });

                    wasCreated = true;
                    summary.createdCount++;
                    existingMap.set(`src:${sourceKey}`, shipment);
                    existingMap.set(`trk:${shipment.trackingNumber}`, shipment);
                    if (v.carrierTracking) existingMap.set(`awb:${v.carrierTracking}`, shipment);
                    logger.info(`[PhenixSync] Created new shipment ${trackingNumber} for Merchant "${v.merchantName}" (ID: ${v.merchantId}) -> Dest: ${v.destCountryName} (AWB: ${v.carrierTracking}, Weight: ${v.weightKg}kg, Sell: ${v.totalAmount} KWD, Cost: ${v.costPrice} KWD) [Date: ${consignmentDate.toISOString()}]`);

                    // Tryton ERP Shadow Dual-Writing Ingestion
                    try {
                        jobQueue.enqueue('tryton_dual_write', {
                            action: 'CREATE_SHIPMENT',
                            shipmentId: shipment.id,
                            trackingNumber: shipment.trackingNumber,
                            source: 'PHENIX_SYNC'
                        }, { maxRetries: 3, backoffMs: 5000 }).catch(err => {
                            logger.warn(`[PhenixSync] Tryton dual-write enqueue failed for ${shipment.trackingNumber}: ${err.message}`);
                        });
                    } catch (queueErr) {
                        logger.warn(`[PhenixSync] Dual-write queue error: ${queueErr.message}`);
                    }
                } else {
                    const currentDocs = (existing.documents && typeof existing.documents === 'object') ? existing.documents : {};
                    const isAlreadySyncedUnchanged = Boolean(
                        existing.phenixSourceKey === sourceKey &&
                        currentDocs.phenixBillId === v.billId &&
                        currentDocs.financialSyncComplete === true &&
                        Number(existing.price || 0) === Number(v.totalAmount || 0) &&
                        Number(existing.costPrice || 0) === Number(v.costPrice || 0) &&
                        existing.organizationId
                    );

                    if (isAlreadySyncedUnchanged) {
                        shipment = existing;
                        needsFinancialSync = false;
                        summary.updatedCount++;
                    } else {
                        // Update existing record with any missing Phenix metadata & link org if unassigned
                        const updatedDocs = {
                            ...currentDocs,
                            phenixBillId: v.billId,
                            phenixReceiptNo: v.receiptNo,
                            phenixClientId: v.merchantId,
                            merchantName: v.merchantName,
                            senderName: v.senderName,
                            paymentMethod: v.paymentMethod,
                            paidAmount: v.paidAmount,
                            weightKg: v.weightKg || currentDocs.weightKg,
                            unitPrice: v.unitPrice || currentDocs.unitPrice,
                            costPrice: v.costPrice || currentDocs.costPrice,
                            customsFee: v.customsFee || currentDocs.customsFee,
                            markupAmount: v.markupAmount !== null ? v.markupAmount : currentDocs.markupAmount,
                            billType: v.billType || currentDocs.billType,
                            itemDescription: v.itemDescription || currentDocs.itemDescription,
                            employee: v.employee || currentDocs.employee,
                            phenixUser: v.phenixUser || currentDocs.phenixUser,
                            branch: v.branch || currentDocs.branch,
                            note: v.note || currentDocs.note,
                            destCountry: v.destCountryName,
                            destCountryCode: v.destCountryCode,
                            costCenter: v.costCenter,
                            destinationSignals: {
                                rawCountry: v.rawCountry,
                                phoneCountryCode: v.phoneCountryCode,
                                conflict: v.destinationConflict
                            },
                            rawDate: v.date || currentDocs.rawDate,
                            financialSyncComplete: true,
                            lastSyncedAt: new Date().toISOString()
                        };

                        const hasExistingParcels = Array.isArray(existing.parcels) && existing.parcels.length > 0;

                        shipment = await prisma.shipment.update({
                            where: { id: existing.id },
                            data: {
                                phenixSourceKey: existing.phenixSourceKey || sourceKey,
                                createdAt: consignmentDate,
                                estimatedDelivery: existing.estimatedDelivery || estimatedDelivery,
                                dhlTrackingNumber: v.carrierTracking || existing.dhlTrackingNumber,
                                organizationId: existing.organizationId || assignedOrgId,
                                price: existing.price || (v.totalAmount > 0 ? v.totalAmount : undefined),
                                costPrice: existing.costPrice || (v.costPrice > 0 ? v.costPrice : undefined),
                                markupAmount: (existing.markupAmount !== null && existing.markupAmount !== undefined)
                                    ? existing.markupAmount
                                    : (v.markupAmount !== null ? v.markupAmount : undefined),
                                parcels: hasExistingParcels ? existing.parcels : phenixParcels,
                                pricingSnapshot: existing.pricingSnapshot || phenixPricingSnapshot,
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
                        logger.info(`[PhenixSync] Updated existing shipment ${shipment.trackingNumber} with Phenix metadata [Date: ${consignmentDate.toISOString()}]`);
                    }
                }

                // 2. Post financial transactions (Double-Entry Ledger, Invoice, Payment Receipt, Carrier Payable)
                if (needsFinancialSync) {
                    await syncPhenixFinancialRecord({
                        shipment,
                        v,
                        orgId: shipment.organizationId || assignedOrgId,
                        defaultUserId: defaultUser.id
                    });
                }

                const existingHistory = Array.isArray(shipment.history) ? shipment.history : [];
                const isTerminal = ['delivered', 'completed', 'cancelled', 'returned'].includes(String(shipment.status || '').toLowerCase());

                if (v.carrierTracking && v.derivedCarrier !== 'INTERNAL' && v.derivedCarrier !== 'MANUAL') {
                    const isWithin7Days = (Date.now() - new Date(consignmentDate).getTime()) <= 7 * 24 * 60 * 60 * 1000;
                    // Only queue initial carrier scraping during Phenix import for newly created shipments
                    // or shipments with empty tracking history (ongoing active shipments are polled by carrierSyncCron)
                    if (isWithin7Days && !isTerminal && (wasCreated || existingHistory.length === 0)) {
                        shipmentsToSyncCarrier.push(shipment);
                    }
                }

                if (sendWhatsApp && (wasCreated || needsFinancialSync) && !isTerminal) {
                    const senderPhone = v.senderPhone || shipment.origin?.phone;
                    if (senderPhone) {
                        notificationsToSend.push({
                            shipment,
                            v,
                            recipientRole: 'sender',
                            recipientPhone: senderPhone,
                            recipientName: v.senderName || v.merchantName || shipment.origin?.contactPerson || 'Shipper'
                        });
                    }
                }

                const resultIndex = summary.results.length;
                resultIndexByShipmentId.set(shipment.id, resultIndex);
                summary.results.push({
                    trackingNumber: shipment.trackingNumber,
                    billId: v.billId,
                    receiptNo: v.receiptNo,
                    carrierTracking: v.carrierTracking,
                    carrierCode: shipment.carrierCode,
                    merchantName: v.merchantName,
                    merchantId: v.merchantId,
                    senderName: v.senderName,
                    senderPhone: v.senderPhone,
                    destCountryCode: v.destCountryCode,
                    receiverName: v.receiverName,
                    receiverPhone: v.receiverPhone,
                    weightKg: v.weightKg,
                    totalAmount: v.totalAmount,
                    costPrice: v.costPrice,
                    markupAmount: v.markupAmount,
                    paymentMethod: v.paymentMethod,
                    status: shipment.status,
                    action: wasCreated ? 'CREATED' : 'UPDATED',
                    carrierSynced: existingHistory.length > 0,
                    whatsAppSent: false,
                    publicTrackingUrl: `https://target-kw.com/track/${shipment.trackingNumber}`
                });

                if (wasCreated || needsFinancialSync) {
                    await phenixImportRunService.recordItem(importRunId, {
                        sourceKey,
                        billId: v.billId,
                        receiptNo: v.receiptNo,
                        carrierTracking: v.carrierTracking,
                        derivedCarrier: v.derivedCarrier,
                        rawDestination: v.rawCountry,
                        resolvedDestination: v.destCountryCode,
                        phoneCountry: v.phoneCountryCode,
                        status: wasCreated ? 'CREATED' : 'UPDATED',
                        shipmentId: shipment.id,
                        rawRow: row
                    });
                }

            } catch (itemErr) {
                logger.error(`[PhenixSync] Error processing bill #${v.billId}: ${itemErr.message}`);
                summary.errors.push({
                    billId: v.billId,
                    carrierTracking: v.carrierTracking,
                    error: itemErr.message
                });
                await phenixImportRunService.recordItem(importRunId, {
                    sourceKey,
                    billId: v.billId,
                    receiptNo: v.receiptNo,
                    carrierTracking: v.carrierTracking,
                    derivedCarrier: v.derivedCarrier,
                    rawDestination: v.rawCountry,
                    resolvedDestination: v.destCountryCode,
                    phoneCountry: v.phoneCountryCode,
                    status: 'FAILED',
                    errorMessage: itemErr.message,
                    rawRow: row
                });
            }
        }

        // Execute post-import carrier checkpoint seeding & WhatsApp notifications within a strict
        // inline time budget (20s) so Nginx/Axios HTTP requests never time out, while continuing
        // any remaining items asynchronously in the background.
        const inlineDeadline = Date.now() + 20000;
        const deferredCarrierShipments = [];

        if (shipmentsToSyncCarrier.length > 0) {
            logger.info(`[PhenixSync] Starting carrier checkpoints sync for ${shipmentsToSyncCarrier.length} shipments...`);
            const concurrency = Math.max(1, Math.min(8, parseInt(process.env.PHENIX_CARRIER_SYNC_CONCURRENCY, 10) || 4));
            let nextCarrierIndex = 0;
            const syncWorker = async () => {
                while (nextCarrierIndex < shipmentsToSyncCarrier.length) {
                    const s = shipmentsToSyncCarrier[nextCarrierIndex++];
                    if (Date.now() > inlineDeadline) {
                        deferredCarrierShipments.push(s);
                        continue;
                    }
                    try {
                        const carrierUpdates = await syncCarrierTrackingHistory(s);
                        if (carrierUpdates) {
                            await prisma.shipment.update({
                                where: { id: s.id },
                                data: {
                                    history: carrierUpdates.history,
                                    status: carrierUpdates.status,
                                    documents: buildTrackingSyncDocuments(s, carrierUpdates)
                                }
                            });
                            const rIdx = resultIndexByShipmentId.get(s.id);
                            if (rIdx !== undefined && summary.results[rIdx]) {
                                summary.results[rIdx].carrierSynced = true;
                                summary.results[rIdx].status = carrierUpdates.status || summary.results[rIdx].status;
                            }
                        }
                        summary.carrierSyncedCount++;
                    } catch (err) {
                        summary.errors.push({ carrierTracking: s.dhlTrackingNumber || s.trackingNumber, error: `Carrier sync failed: ${err.message}` });
                        logger.warn(`[PhenixSync] Carrier sync failed for ${s.trackingNumber}: ${err.message}`);
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(concurrency, shipmentsToSyncCarrier.length) }, () => syncWorker()));
            logger.info(`[PhenixSync] Finished inline carrier checkpoints sync (synced=${summary.carrierSyncedCount}, deferred=${deferredCarrierShipments.length})`);
        }

        if (deferredCarrierShipments.length > 0) {
            setImmediate(async () => {
                for (const s of deferredCarrierShipments) {
                    try {
                        const carrierUpdates = await syncCarrierTrackingHistory(s);
                        if (carrierUpdates) {
                            await prisma.shipment.update({
                                where: { id: s.id },
                                data: {
                                    history: carrierUpdates.history,
                                    status: carrierUpdates.status,
                                    documents: buildTrackingSyncDocuments(s, carrierUpdates)
                                }
                            });
                        }
                    } catch (err) {
                        logger.warn(`[PhenixSync Background] Deferred carrier sync failed for ${s.trackingNumber}: ${err.message}`);
                    }
                }
            });
        }

        if (notificationsToSend.length > 0) {
            const dispatchWhatsAppBatch = async (items, isBackground = false) => {
                for (const item of items) {
                    try {
                        const isSender = item.recipientRole === 'sender';
                        const roleGroup = isSender ? ['sender', 'shipper', 'merchant'] : ['receiver', 'customer', 'consignee'];

                        const alreadyNotified = await prisma.shipmentNotificationLog.findFirst({
                            where: {
                                shipmentId: item.shipment.id,
                                recipientRole: { in: roleGroup },
                                status: { in: ['SENT', 'DELIVERED', 'READ'] }
                            }
                        });

                        if (alreadyNotified) {
                            continue;
                        }

                        const billId = item.v.billId;
                        const microRole = isSender ? 'sender' : 'receiver';
                        if (billId) {
                            const microSent = await whatsappService.checkMicroserviceSent(billId, microRole);
                            if (microSent?.sent) {
                                logger.info(`[PhenixSync Background] Bill #${billId} (${microRole}) already messaged via msg.target-kw.com autosend (at ${microSent.sentAt}). Skipping dispatch and logging state.`);
                                await prisma.shipmentNotificationLog.create({
                                    data: {
                                        shipmentId: item.shipment.id,
                                        trackingNumber: item.shipment.trackingNumber,
                                        eventType: 'shipment_created',
                                        recipientRole: item.recipientRole,
                                        recipientName: item.recipientName || null,
                                        recipientPhone: item.recipientPhone,
                                        provider: 'SHIPMENT_WHATSAPP',
                                        templateName: 'shipment_confirmation_2',
                                        status: 'SENT',
                                        chatwootMessageId: `msg-autosend-${microSent.sentAt || Date.now()}`,
                                        payloadJson: { source: 'MICROSERVICE_AUTOSEND', billId, role: microRole },
                                        responseJson: { autoSent: true, sentAt: microSent.sentAt },
                                        sentAt: microSent.sentAt ? new Date(microSent.sentAt) : new Date()
                                    }
                                });
                                if (!isBackground) summary.whatsAppSentCount++;
                                continue;
                            }
                        }

                        await whatsappService.sendNotification({
                            shipment: item.shipment,
                            recipientRole: item.recipientRole,
                            recipientPhone: item.recipientPhone,
                            recipientName: item.recipientName,
                            templateName: 'shipment_confirmation_2',
                            eventType: 'shipment_created'
                        });
                        if (!isBackground) summary.whatsAppSentCount++;
                    } catch (err) {
                        if (!isBackground) {
                            summary.errors.push({ billId: item.v.billId, carrierTracking: item.v.carrierTracking, error: `WhatsApp dispatch failed: ${err.message}` });
                        }
                        logger.warn(`[PhenixSync] WhatsApp dispatch failed for ${item.shipment.trackingNumber} to ${item.recipientRole}: ${err.message}`);
                    }
                }
            };

            if (Date.now() > inlineDeadline || notificationsToSend.length > 10) {
                logger.info(`[PhenixSync] Dispatching ${notificationsToSend.length} WhatsApp notifications asynchronously in background...`);
                setImmediate(() => {
                    dispatchWhatsAppBatch(notificationsToSend, true).catch(() => {});
                });
            } else {
                logger.info(`[PhenixSync] Starting inline WhatsApp notification dispatch for ${notificationsToSend.length} recipients...`);
                await dispatchWhatsAppBatch(notificationsToSend, false);
            }
        }

        await phenixImportRunService.finishRun(
            importRunId,
            summary,
            summary.errors.length > 0 ? 'PARTIAL' : 'SUCCESS'
        );
        logger.info(`[PhenixSync] Sync completed: Matched=${summary.matchedCount}, FullData=${summary.completeCount}, SkippedIncomplete=${summary.skippedIncompleteCount}, Created=${summary.createdCount}, Updated=${summary.updatedCount}, Errors=${summary.errors.length}`);
        return summary;
    }
}

const phenixSyncService = new PhenixSyncService();
phenixSyncService.MAX_PHENIX_DAYS_BACK = MAX_PHENIX_DAYS_BACK;
phenixSyncService.resolveDestinationSignals = destinationSignals;
phenixSyncService.sourceKeyForRow = sourceKeyForRow;
phenixSyncService.validatePhenixRow = validatePhenixRow;

module.exports = phenixSyncService;
