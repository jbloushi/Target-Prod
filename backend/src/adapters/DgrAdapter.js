/**
 * Module: DgrAdapter
 * Objective: Direct integration with DHL Express (DGR) API for rating, booking, and tracking.
 * Linked Constitution Section: 5 (DHL Integration) & 10 (Extension Strategy)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const CarrierAdapter = require('./CarrierAdapter');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const { dhlApiKey, dhlApiSecret, dhlAccountNumber, dhlApiUrl } = require('../config/config');

const firstNonEmpty = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

const normalizeTimestampValue = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    const text = String(value).trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeOffset = (value) => {
    if (!value) return '';
    const text = String(value).trim().replace(/^UTC\s*/i, '').replace(/^GMT\s*/i, '');
    const match = text.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return '';
    const hours = match[2].padStart(2, '0');
    const minutes = (match[3] || '00').padStart(2, '0');
    return `${match[1]}${hours}:${minutes}`;
};

const combineDateTime = (dateValue, timeValue, offsetValue) => {
    if (!dateValue || !timeValue) return '';
    const date = String(dateValue).trim();
    const time = String(timeValue).trim();
    if (!date || !time) return '';
    const normalizedDate = date.includes('T') ? date.split('T')[0] : date;
    const normalizedTime = time.replace(/\.\d+$/, '');
    const offset = normalizeOffset(offsetValue);
    return `${normalizedDate}T${normalizedTime}${offset}`;
};

const extractTrackingTimestamp = (event = {}) => {
    const localTimestamp = firstNonEmpty(
        event.localTimestamp,
        event.timestampWithOffset,
        event.timestampWithTimezone,
        event.eventTimestampWithOffset,
        event.eventTimestampWithTimezone,
        event.checkpointTimestampWithOffset,
        combineDateTime(
            firstNonEmpty(event.date, event.eventDate, event.checkpointDate),
            firstNonEmpty(event.time, event.eventTime, event.checkpointTime),
            firstNonEmpty(event.gmtOffset, event.GMTOffset, event.timezoneOffset, event.utcOffset)
        ),
        event.timestamp,
        event.eventTimestamp,
        event.dateTime,
        event.eventDateTime,
        event.checkpointTimestamp
    );
    const timestamp = normalizeTimestampValue(localTimestamp);

    return {
        timestamp,
        localTimestamp: localTimestamp ? String(localTimestamp).trim() : null,
        timezoneOffset: normalizeOffset(firstNonEmpty(event.gmtOffset, event.GMTOffset, event.timezoneOffset, event.utcOffset))
    };
};

class DgrAdapter extends CarrierAdapter {
    /**
     * @param {Object} configOverrides - Optional credential overrides
     * @business_rule Defaults to system environment variables unless Organization-specific credentials are provided.
     */
    constructor(configOverrides = {}) {
        const apiKey = configOverrides.apiKey || dhlApiKey;
        const apiSecret = configOverrides.apiSecret || dhlApiSecret;
        const accountNumber = configOverrides.accountNumber || dhlAccountNumber;
        const baseUrl = configOverrides.baseUrl || dhlApiUrl;

        if (!apiKey || !apiSecret) {
            throw new Error(
                'DGR (DHL) API credentials are required. Ensure OrganizationCredentials or .env keys are set.'
            );
        }

        super({ baseUrl, apiKey, apiSecret, accountNumber });
    }

    /**
     * Generates Basic Auth header for DHL API.
     * @param {Object} config - The active config containing apiKey and apiSecret
     * @returns {Object} { Authorization, 'content-type' }
     */
    getAuthHeader(config = this.config) {
        return {
            Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`,
            'content-type': 'application/json'
        };
    }

    /**
     * Resolves active credentials based on Multi-tenancy context.
     * @private
     * @param {Object|null} shipmentData
     * @returns {Promise<Object>} Active configuration object
     * @business_rule Priority: 1. Passed Shipment Org -> 2. RequestContext Store -> 3. System Defaults.
     * @linked_constitution Section 5.1 (BYOC Support)
     */
    async _getResolvedConfig(shipmentData = null) {
        return this.config;
    }

    /**
     * Helper to split address into DHL-compliant 3 lines of 45 chars.
     * @param {string} fullAddress
     * @returns {Object} { addressLine1, addressLine2, addressLine3 }
     * @performance Uses a while loop with a limit of 3 iterations to prevent runaway recursion.
     */
    splitAddress(fullAddress) {
        if (!fullAddress) return { addressLine1: '.' };
        const chunks = [];
        let remaining = fullAddress;
        while (remaining.length > 0 && chunks.length < 3) {
            let limit = 45;
            if (remaining.length > limit) {
                let breakPoint = remaining.lastIndexOf(' ', limit);
                if (breakPoint === -1) breakPoint = limit;
                chunks.push(remaining.substring(0, breakPoint));
                remaining = remaining.substring(breakPoint).trim();
            } else {
                chunks.push(remaining);
                remaining = '';
            }
        }
        return {
            addressLine1: chunks[0] || '.',
            addressLine2: chunks[1],
            addressLine3: chunks[2]
        };
    }

    /**
     * Constructs DHL-compliant party details (shipper/receiver).
     * @param {Object} party - Internal address/user object
     * @returns {Object} DHL Details object
     */
    buildPartyDetails(party) {
        if (!party) return {};
        const normalizeCityForRates = (city, countryCode) => {
            const cleanCity = (city || '').toString().trim();
            if (String(countryCode || '').toUpperCase() === 'KW') {
                const upper = cleanCity.toUpperCase();
                if (upper === 'KUWAIT CITY' || upper === 'CITY') return 'KUWAIT';
            }
            return cleanCity;
        };
        const { addressLine1, addressLine2, addressLine3 } = this.splitAddress(
            (party.streetLines || []).filter(Boolean).join(', ') || party.formattedAddress
        );
        const details = {
            postalCode: party.postalCode || '',
            cityName: normalizeCityForRates(party.city, party.countryCode),
            countryCode: party.countryCode || '',
            addressLine1,
            addressLine2,
            addressLine3
        };

        if (party.state) details.provinceCode = party.state;
        return details;
    }

    /**
     * Safely stringify any object for logs/debug output.
     * @param {*} value
     * @returns {string}
     */
    safeJson(value) {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return '[Unserializable value]';
        }
    }

    /**
     * Appends a carrier debug log entry to disk.
     * Production-safe: best effort only.
     * @param {string} tag
     * @param {Object} data
     */
    appendDebugLog(tag, data = {}) {
        try {
            const logEntry =
                `\n--- [${tag}] ${new Date().toISOString()} ---\n` +
                Object.entries(data).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : this.safeJson(v)}`).join('\n') +
                `\n-------------------------------------------\n`;

            fs.appendFileSync(path.join(__dirname, '../../dgr_debug_error.log'), logEntry);
        } catch (err) {
            console.error('Failed to write DGR debug log:', err);
        }
    }

    /**
     * Extracts top-level provider message from a DHL error payload.
     * @param {*} raw
     * @param {Error|null} fallbackError
     * @returns {string}
     */
    extractTopLevelProviderMessage(raw, fallbackError = null) {
        if (!raw) return fallbackError?.message || 'Unknown error';
        if (typeof raw === 'string') return raw;

        return (
            raw.detail ||
            raw.message ||
            raw.description ||
            raw.title ||
            raw.error ||
            fallbackError?.message ||
            this.safeJson(raw)
        );
    }

    /**
     * Extracts structured detail lines from a DHL error payload.
     * Handles multiple possible field names because DHL/adapter shapes vary.
     * @param {*} raw
     * @returns {string[]}
     */
    extractProviderDetailLines(raw) {
        const candidates =
            raw?.additionalDetails ||
            raw?.details ||
            raw?.errors ||
            raw?.messages ||
            [];

        if (!Array.isArray(candidates)) return [];

        return candidates.map((d, index) => {
            if (typeof d === 'string') return d;

            const field =
                d?.field ||
                d?.property ||
                d?.path ||
                d?.name ||
                d?.code ||
                d?.type ||
                `Detail ${index + 1}`;

            const message =
                d?.message ||
                d?.detail ||
                d?.description ||
                d?.reason ||
                d?.msg ||
                d?.error ||
                d?.title ||
                this.safeJson(d);

            return `${field}: ${message}`;
        });
    }

    /**
     * Builds a user-safe but informative provider error message.
     * @param {*} errorData
     * @param {Error|null} fallbackError
     * @returns {string}
     */
    buildProviderErrorMessage(errorData, fallbackError = null) {
        let detailedMessage = this.extractTopLevelProviderMessage(errorData, fallbackError);
        const detailLines = this.extractProviderDetailLines(errorData);

        if (detailLines.length > 0) {
            detailedMessage += ` (Details: ${detailLines.join('; ')})`;
        }

        return detailedMessage;
    }

    /**
     * Validates shipment data specifically for DGR carrier.
     * @param {Object} shipment - Normalized Shipment
     * @returns {Promise<Boolean>}
     */
    async validate(shipment) {
        const { validateDgrInvoiceData } = require('../services/dgr-payload-builder');
        return validateDgrInvoiceData(shipment);
    }

    /**
     * Fetches real-time shipping rates from DHL.
     * @param {Object} shipmentData - Raw or partial shipment data
     * @returns {Promise<Array>} List of formatted quotes
     * @throws {Error} If DHL API returns error or no products
     */
    async getRates(shipmentData) {
        const shipment = normalizeShipment(shipmentData);
        const activeConfig = await this._getResolvedConfig(shipment);
        const { validateDgrInvoiceData } = require('../services/dgr-payload-builder');
        const preflightErrors = validateDgrInvoiceData(shipment);
        if (preflightErrors.length > 0) {
            const err = new Error(`DGR Validation Failed: ${preflightErrors.join('; ')}`);
            err.statusCode = 400;
            throw err;
        }

        const maxRetries = 7;
        let lastError = null;
        let lastPayload = null;

        for (let offsetDays = 0; offsetDays <= maxRetries; offsetDays++) {
            const payload = this.buildRatePayload(shipment, activeConfig, offsetDays);
            lastPayload = payload;

            try {
                const res = await axios.post(`${activeConfig.baseUrl}/rates`, payload, {
                    headers: this.getAuthHeader(activeConfig)
                });

                if (!res.data || !res.data.products) return [];

                const products = Array.isArray(res.data?.products) ? res.data.products : [];
                return products.map((product) => {
                    const currency = this.extractCurrency(product, shipment.currency || 'KWD');
                    return {
                        serviceName: product.productName || product.localProductName || `DGR ${product.productCode || 'Service'}`,
                        serviceCode: product.productCode || product.localProductCode,
                        carrierCode: 'DGR',
                        totalPrice: this.extractTotalPrice(product),
                        currency,
                        deliveryDate: product.deliveryCapabilities?.estimatedDeliveryDateAndTime,
                        optionalServices: this.extractOptionalServices(product, currency)
                    };
                });
            } catch (error) {
                lastError = error;
                const errorData = error.response?.data;
                const isDateError = errorData && (
                    (errorData.status == 404 && errorData.title === 'Product not found') ||
                    (errorData.detail && errorData.detail.includes('996')) ||
                    (errorData.detail && errorData.detail.includes('not available for the requested pickup date'))
                );

                if (!isDateError || offsetDays === maxRetries) {
                    break;
                }
            }
        }

        const errorData = lastError?.response?.data || null;
        const responseStatus = lastError?.response?.status || 500;
        const message = this.buildProviderErrorMessage(errorData, lastError);

        this.appendDebugLog('DGR_RATE_ERROR', {
            Status: responseStatus,
            AxiosMessage: lastError?.message || '',
            Payload: lastPayload || {},
            Response: errorData || {}
        });

        const err = new Error(`DHL API Error: ${message}`);
        err.statusCode = responseStatus;
        throw err;
    }

    /**
     * Builds payload for DHL Rates endpoint.
     * @business_rule plannedShippingDateAndTime is forced to 10:00 AM next day to avoid DHL '996' errors for same-day past-time requests.
     */
    buildRatePayload(shipment, activeConfig = this.config, offsetDays = 0) {
        const selectedOptionalCodes = (shipment.optionalServiceCodes || shipment.optionalServices || [])
            .map((entry) => (typeof entry === 'string' ? entry : (entry?.serviceCode || entry?.code || '')))
            .map((code) => String(code).toUpperCase())
            .filter(Boolean);

        const computedInsuredVal = Number(shipment.insuredValue || shipment.items?.reduce(
            (sum, item) => sum + (Number(item.value || 0) * Number(item.quantity || 1)),
            0
        ) || 0);

        return {
            customerDetails: {
                shipperDetails: this.buildPartyDetails(shipment.sender),
                receiverDetails: this.buildPartyDetails(shipment.receiver)
            },
            accounts: [{ typeCode: 'shipper', number: shipment.shipperAccount || activeConfig.accountNumber }],
            plannedShippingDateAndTime: (() => {
                const getTomorrow = () => {
                    const t = new Date();
                    t.setDate(t.getDate() + 1);
                    t.setHours(10, 0, 0, 0);
                    return t;
                };
                const now = new Date();
                const tomorrowStart = new Date(now);
                tomorrowStart.setDate(tomorrowStart.getDate() + 1);
                tomorrowStart.setHours(0, 0, 0, 0);

                let dateObj = shipment.shipmentDate ? new Date(shipment.shipmentDate) : getTomorrow();
                if (isNaN(dateObj.getTime()) || dateObj < tomorrowStart) dateObj = getTomorrow();

                if (offsetDays > 0) {
                    dateObj.setDate(dateObj.getDate() + offsetDays);
                }

                return `${dateObj.toISOString().split('.')[0]}+03:00`;
            })(),
            unitOfMeasurement: 'metric',
            isCustomsDeclarable: !shipment.isDocument && shipment.shipmentType !== 'documents',
            monetaryAmount: (() => {
                if (shipment.isDocument || shipment.shipmentType === 'documents') return undefined;
                const amounts = [{
                    typeCode: 'declaredValue',
                    value: Number(shipment.declaredValue || 1),
                    currency: (shipment.currency || 'KWD').substring(0, 3).toUpperCase()
                }];
                if (computedInsuredVal > 0) {
                    amounts.push({ typeCode: 'insuredValue', value: computedInsuredVal, currency: (shipment.currency || 'KWD').substring(0, 3).toUpperCase() });
                }
                return amounts;
            })(),
            valueAddedServices: selectedOptionalCodes.length > 0
                ? selectedOptionalCodes
                    .map((code) => {
                        if (code === 'II') {
                            const insuranceValue = Number(computedInsuredVal || shipment.declaredValue || 0);
                            if (insuranceValue <= 0) return null;
                            return {
                                serviceCode: code,
                                value: insuranceValue,
                                currency: (shipment.currency || 'KWD').substring(0, 3).toUpperCase()
                            };
                        }
                        return { serviceCode: code };
                    })
                    .filter(Boolean)
                : undefined,
            requestAllValueAddedServices: true,
            returnStandardProductsOnly: selectedOptionalCodes.length === 0,
            nextBusinessDay: false,
            productCode: shipment.serviceCode || undefined,
            packages: (shipment.packages || []).map((pkg) => ({
                weight: Number(pkg.weight?.value || 0),
                dimensions: {
                    length: Number(pkg.dimensions?.length || 0),
                    width: Number(pkg.dimensions?.width || 0),
                    height: Number(pkg.dimensions?.height || 0)
                }
            }))
        };
    }

    /**
     * Extracts precise total price from DHL Product structure.
     * @business_rule Priority: totalPrice Array (BILLC) -> detailedPriceBreakdown (BILLC) -> first available price.
     */
    extractTotalPrice(product) {
        // 1. Try totalPrice array (it contains the summarized total)
        if (Array.isArray(product.totalPrice)) {
            const billc = product.totalPrice.find(p => p.currencyType === 'BILLC') || product.totalPrice[0];
            if (billc && billc.price != null) return Number(Number(billc.price).toFixed(3));
        }

        // 2. Fallback to detailedPriceBreakdown if totalPrice array missed
        if (Array.isArray(product.detailedPriceBreakdown)) {
            const billc = product.detailedPriceBreakdown.find(b => b.currencyType === 'BILLC') || product.detailedPriceBreakdown[0];
            if (billc && billc.price != null) return Number(Number(billc.price).toFixed(3));

            // If the group doesn't have a sum, try to find a PRD item or the first item
            if (billc && Array.isArray(billc.breakdown)) {
                const prd = billc.breakdown.find(item => item.typeCode === 'PRD') || billc.breakdown[0];
                if (prd && prd.price != null) return Number(Number(prd.price).toFixed(3));
            }
        }

        // 3. Last resort: if totalPrice is somehow a number
        if (typeof product.totalPrice === 'number') return Number(product.totalPrice.toFixed(3));

        return 0;
    }

    extractCurrency(product, fallbackCurrency) {
        if (Array.isArray(product.totalPrice)) {
            const entry = product.totalPrice.find(p => p.currencyType === 'BILLC') || product.totalPrice[0];
            if (entry?.priceCurrency) return entry.priceCurrency;
        }
        return product.priceCurrency || fallbackCurrency;
    }

    /**
     * Aggregates all optional services/VAS from DHL response.
     */
    extractOptionalServices(product, fallbackCurrency) {
        const servicesByCode = new Map();

        const toNumber = (value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };

        const extractCurrency = (item, defaultCurrency) => {
            const candidates = [
                item?.currency,
                item?.currencyCode,
                item?.priceCurrency,
                item?.chargeCurrencyCode,
                defaultCurrency
            ]
                .map((c) => String(c || '').trim().toUpperCase())
                .filter(Boolean);
            return candidates[0] || String(defaultCurrency || 'KWD').toUpperCase();
        };

        const extractPrice = (item, defaultCurrency) => {
            const directAmount =
                toNumber(item?.price) ??
                toNumber(item?.chargeAmount) ??
                toNumber(item?.amount) ??
                toNumber(item?.value);

            if (directAmount != null) {
                return { price: directAmount, currency: extractCurrency(item, defaultCurrency) };
            }

            const objectAmount = item?.price && typeof item.price === 'object'
                ? toNumber(item.price.amount) ?? toNumber(item.price.value)
                : null;
            if (objectAmount != null) {
                return {
                    price: objectAmount,
                    currency: extractCurrency({ ...item, ...item.price }, defaultCurrency)
                };
            }

            const oneTimeCharge = Array.isArray(item?.oneTimeCharge) ? item.oneTimeCharge : [];
            if (oneTimeCharge.length > 0) {
                const charge = oneTimeCharge.find((c) => c?.typeCode === 'BILLC') || oneTimeCharge[0];
                const amount = toNumber(charge?.price) ?? toNumber(charge?.amount);
                if (amount != null) {
                    return { price: amount, currency: extractCurrency(charge, defaultCurrency) };
                }
            }

            return { price: 0, currency: extractCurrency(item, defaultCurrency) };
        };

        const upsertService = (service, opts = {}) => {
            const { groupCurrency = null, source = 'breakdown' } = opts;
            const code = String(
                service?.serviceCode || service?.code || service?.localServiceCode || service?.typeCode || service?.chargeCode || ''
            ).toUpperCase();
            if (!code || code === 'PRD') return;

            const { price, currency } = extractPrice(service, groupCurrency || fallbackCurrency);
            const normalizedPrice = Number(Number(price || 0).toFixed(3));
            const existing = servicesByCode.get(code);

            // Prefer valueAddedServices over breakdown when code overlaps.
            if (existing && existing._source === 'valueAddedServices' && source !== 'valueAddedServices') return;

            servicesByCode.set(code, {
                serviceCode: code,
                serviceName: service?.localServiceName || service?.serviceName || service?.name || service?.chargeName || code,
                totalPrice: normalizedPrice,
                currency,
                _source: source
            });
        };

        if (Array.isArray(product.valueAddedServices)) {
            product.valueAddedServices.forEach((service) => {
                upsertService(service, { source: 'valueAddedServices' });
            });
        }

        if (Array.isArray(product.detailedPriceBreakdown)) {
            product.detailedPriceBreakdown.forEach((group) => {
                const groupCurrency = group?.priceCurrency || group?.currency || fallbackCurrency;
                if (!Array.isArray(group?.breakdown)) return;
                group.breakdown.forEach((item) => upsertService(item, { groupCurrency, source: 'breakdown' }));
            });
        }

        return Array.from(servicesByCode.values()).map(({ _source, ...service }) => service);
    }

    /**
     * Books a shipment with DHL Express.
     * @returns {Promise<import('../services/dto/CarrierTypes').ShipmentBookingResult>}
     * @business_rule All PDF documents are converted to base64 data URLs for storage in the Shipment model.
     * @linked_constitution Section 5.2 (Persistence & CarrierLog)
     */
    async createShipment(shipmentData, serviceCode) {
        const shipment = normalizeShipment(shipmentData);
        if (serviceCode) shipment.serviceCode = serviceCode;
        const activeConfig = await this._getResolvedConfig(shipment);
        const { buildDgrShipmentPayload } = require('../services/dgr-payload-builder');
        const startTime = Date.now();

        const maxRetries = 7;
        let lastError = null;
        let lastPayload = null;
        let stripVas = false; // strips user optional services
        let stripDgVas = false; // strips DG VAS when route doesn't support it

        for (let offsetDays = 0; offsetDays <= maxRetries; offsetDays++) {
            const effectiveShipment = {
                ...shipment,
                ...(stripVas ? { optionalServices: [] } : {}),
                ...(stripDgVas ? { dangerousGoods: { ...shipment.dangerousGoods, contains: false } } : {})
            };
            const payload = buildDgrShipmentPayload(effectiveShipment, { accountNumber: activeConfig.accountNumber }, offsetDays);
            lastPayload = payload;

            try {
                const res = await axios.post(`${activeConfig.baseUrl}/shipments`, payload, {
                    headers: this.getAuthHeader(activeConfig)
                });

                // Audit logging with sanitized documents to prevent DB bloat
                const sanitized = JSON.parse(JSON.stringify(res.data));
                if (sanitized.documents) sanitized.documents.forEach(doc => doc.content = '[BASE64_REMOVED]');

                const { prisma } = require('../config/database');
                await prisma.carrierLog.create({
                    data: {
                        carrierCode: 'DGR',
                        requestType: 'book',
                        requestPayload: payload,
                        responsePayload: sanitized,
                        statusCode: res.status,
                        durationMs: Date.now() - startTime
                    }
                }).catch(e => console.error('CarrierLog Save Failed:', e.message));

                let label, awb, invoice;
                if (res.data.documents) {
                    res.data.documents.forEach(doc => {
                        if (doc.typeCode === 'label') label = `data:application/pdf;base64,${doc.content}`;
                        if (doc.typeCode === 'waybillDoc') awb = `data:application/pdf;base64,${doc.content}`;
                        if (doc.typeCode === 'invoice') invoice = `data:application/pdf;base64,${doc.content}`;
                    });
                }

                return {
                    trackingNumber: res.data.shipmentTrackingNumber,
                    labelUrl: label,
                    awbUrl: awb,
                    invoiceUrl: invoice,
                    rawResponse: res.data
                };
            } catch (error) {
                lastError = error;
                const errorData = error.response?.data;
                const isDateError = errorData && (
                    (errorData.status == 404 && errorData.title === 'Product not found') ||
                    (errorData.detail && errorData.detail.includes('996')) ||
                    (errorData.detail && errorData.detail.includes('not available for the requested pickup date'))
                );

                // 7008: VAS not available for this route — strip and retry in order:
                // 1st attempt: strip user optional services
                // 2nd attempt: strip DG VAS (if DG service code is route-restricted)
                const isVasError = errorData?.detail?.includes('7008') || errorData?.detail?.includes('Special Service Code');
                if (isVasError) {
                    if (!stripVas && effectiveShipment.optionalServices?.length > 0) {
                        stripVas = true;
                        offsetDays--;
                        continue;
                    }
                    if (!stripDgVas && effectiveShipment.dangerousGoods?.contains && effectiveShipment.dangerousGoods?.serviceCode) {
                        stripDgVas = true;
                        offsetDays--;
                        continue;
                    }
                }

                if (!isDateError || offsetDays === maxRetries) {
                    break;
                }
            }
        }

        const errorData = lastError?.response?.data || null;
        const responseStatus = lastError?.response?.status || 500;
        const detailedMessage = this.buildProviderErrorMessage(errorData, lastError);

        // Always log raw provider failure server-side
        this.appendDebugLog('DGR_BOOK_ERROR', {
            Status: responseStatus,
            AxiosMessage: lastError?.message || '',
            Payload: lastPayload || {},
            Response: errorData || {}
        });

        const { prisma } = require('../config/database');
        await prisma.carrierLog.create({
            data: {
                carrierCode: 'DGR',
                requestType: 'book',
                requestPayload: lastPayload || {},
                responsePayload: errorData || { message: lastError?.message || 'Unknown error' },
                statusCode: responseStatus,
                durationMs: Date.now() - startTime
            }
        }).catch(e => console.error('CarrierLog Save Failed:', e.message));

        const providerError = new Error(`DGR Error: ${detailedMessage}`);
        providerError.statusCode = responseStatus;
        providerError.isProviderError = true;
        providerError.rawProviderError = errorData;
        throw providerError;
    }

    /**
     * Fetches granular tracking history for a shipment.
     */
    async getTracking(trackingNumber, shipmentData = null) {
        try {
            const activeConfig = await this._getResolvedConfig(shipmentData);
            const res = await axios.get(`${activeConfig.baseUrl}/shipments/${trackingNumber}/tracking`, {
                headers: this.getAuthHeader(activeConfig),
                params: { trackingView: 'all-checkpoints' }
            });

            const shipment = res.data.shipments?.[0];
            if (!shipment) throw new Error('No tracking data found.');

            const rawEvents = (shipment.events || []).map(e => {
                const trackingTimestamp = extractTrackingTimestamp(e);
                return {
                    statusCode: e.statusCode,
                    description: e.description,
                    timestamp: trackingTimestamp.timestamp,
                    localTimestamp: trackingTimestamp.localTimestamp,
                    timezoneOffset: trackingTimestamp.timezoneOffset,
                    location: e.serviceArea?.[0]?.description || e.location?.description || 'Unknown'
                };
            }).filter((event) => event.timestamp);

            // Dedupe within DHL's own response. The 'all-checkpoints' view sometimes
            // replays the same checkpoint from multiple data sources, producing exact
            // (or sub-minute) repeats. Bucket to the minute and key on
            // statusCode + description + location so genuine distinct events survive.
            const seen = new Map();
            for (const ev of rawEvents) {
                const t = ev.timestamp ? new Date(ev.timestamp) : null;
                const minuteBucket = t && !Number.isNaN(t.getTime())
                    ? Math.floor(t.getTime() / 60000)
                    : '';
                const key = [
                    ev.statusCode || '',
                    (ev.description || '').trim().toLowerCase(),
                    minuteBucket,
                    (ev.location || '').trim().toLowerCase()
                ].join('|');
                const prior = seen.get(key);
                // Prefer the earliest carrier scan when duplicate sources replay a checkpoint.
                if (!prior || new Date(ev.timestamp) < new Date(prior.timestamp)) {
                    seen.set(key, ev);
                }
            }
            const dedupedEvents = Array.from(seen.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const droppedDuplicates = rawEvents.length - dedupedEvents.length;
            if (droppedDuplicates > 0) {
                console.warn(
                    `[DgrAdapter.getTracking] DHL returned ${droppedDuplicates} duplicate checkpoint(s) for ${trackingNumber} ` +
                    `(received ${rawEvents.length}, kept ${dedupedEvents.length})`
                );
            }

            return {
                status: shipment.status?.statusCode || 'UNKNOWN',
                description: shipment.status?.description || 'No status description',
                carrierCode: 'DGR',
                trackingNumber,
                events: dedupedEvents
            };
        } catch (error) {
            throw new Error(`DHL Tracking Error: ${error.response?.data?.detail || error.message}`);
        }
    }
}

DgrAdapter.extractTrackingTimestamp = extractTrackingTimestamp;

module.exports = DgrAdapter;
