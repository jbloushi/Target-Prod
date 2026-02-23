/**
 * Module: DgrAdapter
 * Objective: Direct integration with DHL Express (DGR) API for rating, booking, and tracking.
 * Linked Constitution Section: 5 (DHL Integration) & 10 (Extension Strategy)
 */

const axios = require('axios');
const CarrierAdapter = require('./CarrierAdapter');
const { normalizeShipment } = require('../utils/shipmentNormalizer');
const { dhlApiKey, dhlApiSecret, dhlAccountNumber, dhlApiUrl } = require('../config/config');

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
        const requestContext = require('../utils/RequestContext');
        const OrganizationCredential = require('../models/OrganizationCredential.model');

        let organizationId = shipmentData?.organization || requestContext.getStore()?.organizationId;

        if (!organizationId && shipmentData?.user?.organization) {
            organizationId = shipmentData.user.organization;
        }

        if (organizationId) {
            const cred = await OrganizationCredential.findOne({
                organization: organizationId,
                carrierCode: { $in: ['DGR', 'DHL'] },
                isActive: true
            });

            if (cred) {
                return {
                    baseUrl: this.config.baseUrl,
                    apiKey: cred.apiKey,
                    apiSecret: cred.getSecret(),
                    accountNumber: cred.accountNumber
                };
            }
        }
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
        const { addressLine1, addressLine2, addressLine3 } = this.splitAddress(
            (party.streetLines || []).filter(Boolean).join(', ') || party.formattedAddress
        );
        const details = {
            postalCode: party.postalCode || '',
            cityName: party.city || '',
            countryCode: party.countryCode || '',
            addressLine1,
            addressLine2,
            addressLine3
        };

        if (party.state) details.provinceCode = party.state;
        return details;
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
        const payload = this.buildRatePayload(shipment, activeConfig);

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
            const errorData = error.response?.data;
            const message = errorData ? `DHL API Error: ${JSON.stringify(errorData)}` : error.message;
            const err = new Error(message);
            err.statusCode = error.response?.status || 500;
            throw err;
        }
    }

    /**
     * Builds payload for DHL Rates endpoint.
     * @business_rule plannedShippingDateAndTime is forced to 10:00 AM next day to avoid DHL '996' errors for same-day past-time requests.
     */
    buildRatePayload(shipment, activeConfig = this.config) {
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
                const insuredVal = Number(shipment.items?.reduce((sum, item) => sum + (Number(item.value || 0) * Number(item.quantity || 1)), 0) || 0);
                if (insuredVal > 0) {
                    amounts.push({ typeCode: 'insuredValue', value: insuredVal, currency: (shipment.currency || 'KWD').substring(0, 3).toUpperCase() });
                }
                return amounts;
            })(),
            requestAllValueAddedServices: false,
            returnStandardProductsOnly: true,
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
     * @business_rule Priority: detailedPriceBreakdown (BILLC) -> PRD breakdown item -> global totalPrice.
     */
    extractTotalPrice(product) {
        if (Array.isArray(product.detailedPriceBreakdown)) {
            const billc = product.detailedPriceBreakdown.find(b => b.currencyType === 'BILLC') || product.detailedPriceBreakdown[0];
            if (billc && Array.isArray(billc.breakdown)) {
                const prd = billc.breakdown.find(item => item.typeCode === 'PRD');
                if (prd && prd.price != null) return Number(prd.price.toFixed(3));
                if (billc.price != null) return Number(billc.price.toFixed(3));
            }
        }
        if (typeof product.totalPrice === 'number') return Number(product.totalPrice.toFixed(3));
        return 0;
    }

    extractCurrency(product, fallbackCurrency) {
        if (Array.isArray(product.totalPrice)) {
            const entry = product.totalPrice.find(p => p.priceCurrency) || product.totalPrice[0];
            if (entry?.priceCurrency) return entry.priceCurrency;
            if (entry?.currencyType && entry.currencyType.length === 3 && entry.currencyType !== 'BILLC') return entry.currencyType;
        }
        return product.priceCurrency || fallbackCurrency;
    }

    /**
     * Aggregates all optional services/VAS from DHL response.
     */
    extractOptionalServices(product, fallbackCurrency) {
        const services = [];
        const seenCodes = new Set();

        const getPrice = (item, defaultCurrency) => {
            let price = item.price || item.chargeAmount || 0;
            let currency = item.currency || item.currencyType || item.chargeCurrencyCode || defaultCurrency;
            if (typeof price === 'object') {
                price = price.amount || price.value || 0;
                currency = price.currency || currency;
            }
            return { price: Number(price), currency };
        };

        const processService = (s, groupCurrency = null) => {
            const code = s.serviceCode || s.code || s.localServiceCode || s.typeCode || s.chargeCode;
            if (!code || seenCodes.has(code) || s.typeCode === 'PRD') return;

            const { price, currency } = getPrice(s, groupCurrency || fallbackCurrency);
            services.push({
                serviceCode: code,
                serviceName: s.localServiceName || s.serviceName || s.name || s.chargeName || code,
                totalPrice: Number(price.toFixed(3)),
                currency: currency
            });
            seenCodes.add(code);
        };

        if (Array.isArray(product.detailedPriceBreakdown)) {
            product.detailedPriceBreakdown.forEach(group => {
                if (Array.isArray(group.breakdown)) group.breakdown.forEach(item => processService(item, group.currencyType));
            });
        }
        if (Array.isArray(product.valueAddedServices)) product.valueAddedServices.forEach(s => processService(s));
        return services;
    }

    /**
     * Books a shipment with DHL Express.
     * @returns {Promise<import('../services/dto/CarrierTypes').ShipmentBookingResult>}
     * @business_rule All PDF documents are converted to base64 data URLs for storage in the Shipment model.
     * @linked_constitution Section 5.2 (Persistence & CarrierLog)
     */
    async createShipment(shipmentData, serviceCode) {
        const shipment = normalizeShipment(shipmentData);
        const activeConfig = await this._getResolvedConfig(shipment);
        const { buildDgrShipmentPayload } = require('../services/dgr-payload-builder');
        const CarrierLog = require('../models/CarrierLog');
        const startTime = Date.now();

        const payload = buildDgrShipmentPayload(shipment, { accountNumber: activeConfig.accountNumber });

        try {
            const res = await axios.post(`${activeConfig.baseUrl}/shipments`, payload, { headers: this.getAuthHeader(activeConfig) });

            // Audit logging with sanitized documents to prevent DB bloat
            const sanitized = JSON.parse(JSON.stringify(res.data));
            if (sanitized.documents) sanitized.documents.forEach(doc => doc.content = '[BASE64_REMOVED]');

            await CarrierLog.create({
                user: shipmentData.user,
                shipment: shipmentData._id,
                carrier: 'DGR',
                endpoint: 'createShipment',
                requestPayload: payload,
                responsePayload: sanitized,
                statusCode: res.status,
                success: true,
                durationMs: Date.now() - startTime
            }).catch(e => console.error('CarrierLog Save Failed:', e));

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
            const errorData = error.response?.data || error.message;
            await CarrierLog.create({
                user: shipmentData.user,
                shipment: shipmentData._id,
                carrier: 'DGR',
                endpoint: 'createShipment',
                requestPayload: payload,
                responsePayload: errorData,
                statusCode: error.response?.status || 500,
                success: false,
                error: JSON.stringify(errorData),
                durationMs: Date.now() - startTime
            }).catch(e => console.error('CarrierLog Save Failed:', e));

            const providerError = new Error(`DGR Error: ${errorData.detail || JSON.stringify(errorData)}`);
            providerError.statusCode = error.response?.status || 500;
            providerError.isProviderError = true;
            throw providerError;
        }
    }

    /**
     * Fetches granular tracking history for a shipment.
     */
    async getTracking(trackingNumber) {
        try {
            const activeConfig = await this._getResolvedConfig();
            const res = await axios.get(`${activeConfig.baseUrl}/shipments/${trackingNumber}/tracking`, {
                headers: this.getAuthHeader(activeConfig),
                params: { trackingView: 'all-checkpoints' }
            });

            const shipment = res.data.shipments?.[0];
            if (!shipment) throw new Error('No tracking data found.');

            return {
                status: shipment.status?.statusCode || 'UNKNOWN',
                description: shipment.status?.description || 'No status description',
                carrierCode: 'DGR',
                trackingNumber,
                events: (shipment.events || []).map(e => ({
                    statusCode: e.statusCode,
                    description: e.description,
                    timestamp: e.timestamp,
                    location: e.serviceArea?.[0]?.description || e.location?.description || 'Unknown'
                })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            };
        } catch (error) {
            throw new Error(`DHL Tracking Error: ${error.response?.data?.detail || error.message}`);
        }
    }
}

module.exports = DgrAdapter;
