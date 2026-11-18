const axios = require('axios');
const universalTracking = require('../services/UniversalTrackingService');
const logger = require('../utils/logger');
const { isNegativeOrExceptionPhrase } = require('../constants/statusConstants');
const {
    aramexUsername,
    aramexPassword,
    aramexAccountNumber,
    aramexAccountPin,
    aramexAccountEntity,
    aramexAccountCountryCode,
    aramexApiUrl,
    aramexTestUsername,
    aramexTestPassword,
    aramexTestAccountNumber,
    aramexTestAccountPin,
    aramexTestAccountEntity,
    aramexTestAccountCountryCode,
    aramexTestApiUrl
} = require('../config/config');

const DEFAULT_LIVE_URL = 'https://ws.aramex.net/ShippingAPI.V2';
const DEFAULT_UAT_URL = 'https://ws.uat.aramex.net/ShippingAPI.V2';

class AramexAdapter {
    constructor(config = {}) {
        const isTest = config.isTest === true || config.environment === 'test' || config.environment === 'uat';
        this.config = { ...config, isTest, environment: isTest ? 'test' : 'production' };
        this.name = 'Aramex';
        this.code = 'ARAMEX';

        this.username = config.username || (isTest ? aramexTestUsername : aramexUsername) || process.env.ARAMEX_USERNAME;
        this.password = config.password || (isTest ? aramexTestPassword : aramexPassword) || process.env.ARAMEX_PASSWORD;
        this.accountNumber = config.accountNumber || (isTest ? aramexTestAccountNumber : aramexAccountNumber) || process.env.ARAMEX_ACCOUNT_NUMBER;
        this.accountPin = config.accountPin || (isTest ? aramexTestAccountPin : aramexAccountPin) || process.env.ARAMEX_ACCOUNT_PIN;
        this.accountEntity = config.accountEntity || (isTest ? aramexTestAccountEntity : aramexAccountEntity) || process.env.ARAMEX_ACCOUNT_ENTITY || 'KWI';
        this.accountCountryCode = config.accountCountryCode || (isTest ? aramexTestAccountCountryCode : aramexAccountCountryCode) || process.env.ARAMEX_ACCOUNT_COUNTRY_CODE || 'KW';
        this.baseUrl = String(
            config.baseUrl || (isTest ? (aramexTestApiUrl || DEFAULT_UAT_URL) : (aramexApiUrl || DEFAULT_LIVE_URL))
        ).replace(/\/+$/, '');
    }

    hasOfficialCredentials() {
        return Boolean(this.username && this.password && this.accountNumber && this.accountPin);
    }

    _buildClientInfo() {
        return {
            UserName: this.username,
            Password: this.password,
            Version: 'v1.0',
            AccountNumber: this.accountNumber,
            AccountPin: this.accountPin,
            AccountEntity: this.accountEntity || 'KWI',
            AccountCountryCode: this.accountCountryCode || 'KW'
        };
    }

    _toAramexAddress(addr = {}) {
        const lines = Array.isArray(addr.streetLines) ? addr.streetLines : [];
        return {
            Line1: addr.Line1 || addr.addressLine1 || addr.street1 || addr.line1 || lines[0] || addr.address || addr.formattedAddress || 'Address Line 1',
            Line2: addr.Line2 || addr.addressLine2 || addr.street2 || addr.line2 || lines[1] || '',
            Line3: '',
            City: addr.City || addr.city || 'Kuwait City',
            StateOrProvinceCode: addr.state || '',
            PostCode: addr.PostCode || addr.postalCode || addr.zip || '00000',
            CountryCode: String(addr.countryCode || addr.CountryCode || (addr.country && String(addr.country).length === 2 ? addr.country : '') || 'KW').trim().toUpperCase()
        };
    }

    _toAramexParty(party = {}, fallbackAccountNumber = null) {
        const contactName = party.contactPerson || party.name || party.fullName || party.company || 'Customer';
        const companyName = party.company || contactName;
        const phone = party.phone || party.phoneNumber || '+96500000000';
        const email = party.email || party.customer?.email || 'noreply@target-kw.com';

        const out = {
            Reference1: party.reference || '',
            PartyAddress: this._toAramexAddress(party),
            Contact: {
                PersonName: contactName,
                CompanyName: companyName,
                PhoneNumber1: phone,
                CellPhone: phone,
                EmailAddress: email
            }
        };
        if (fallbackAccountNumber) {
            out.AccountNumber = fallbackAccountNumber;
        }
        return out;
    }

    _extractWeightAndPieces(payload = {}) {
        const parcels = Array.isArray(payload.packages) && payload.packages.length > 0
            ? payload.packages
            : (Array.isArray(payload.parcels) && payload.parcels.length > 0 ? payload.parcels : []);

        const weight = parcels.length > 0
            ? parcels.reduce((sum, p) => sum + (Number(p?.weight?.value ?? p?.weight ?? 0) || 0), 0)
            : Number(payload?.weight || 1.5);

        const pieces = parcels.length > 0 ? parcels.length : Number(payload?.numberOfPieces || 1);
        const descriptions = parcels.map(p => p?.description || p?.contents || p?.name).filter(Boolean).join('; ');
        const declaredSum = parcels.reduce((sum, p) => sum + (Number(p?.declaredValue ?? p?.value ?? 0) || 0), 0);

        return {
            weight: weight > 0 ? Number(weight.toFixed(3)) : 1.5,
            pieces: pieces > 0 ? pieces : 1,
            description: payload?.description || payload?.contentDescription || descriptions || 'Commercial Merchandise',
            declaredValue: Number(
                payload?.declaredValue
                ?? payload?.customsValue
                ?? payload?.documents?.declaredValue
                ?? payload?.customsInvoice?.declaredValue
                ?? (declaredSum > 0 ? declaredSum : 10)
            )
        };
    }

    _extractAramexErrors(data) {
        const notifications = Array.isArray(data?.Notifications) ? data.Notifications : [];
        const shipmentErrors = Array.isArray(data?.Shipments)
            ? data.Shipments.flatMap(s => Array.isArray(s?.Notifications) ? s.Notifications : [])
            : [];
        const all = [...notifications, ...shipmentErrors].map(n => n?.Message || n?.Code).filter(Boolean);
        return all.join('; ') || 'Unknown Aramex API error';
    }

    async _logToCarrier(requestType, requestPayload, responsePayload, statusCode, durationMs, trackingNumber = null) {
        try {
            const { prisma } = require('../config/database');
            const sanitizedReq = JSON.parse(JSON.stringify(requestPayload || {}));
            if (sanitizedReq?.ClientInfo) {
                sanitizedReq.ClientInfo = { ...sanitizedReq.ClientInfo, Password: '[REDACTED]', AccountPin: '[REDACTED]' };
            }
            const sanitizedRes = JSON.parse(JSON.stringify(responsePayload || {}));
            if (Array.isArray(sanitizedRes?.Shipments)) {
                sanitizedRes.Shipments = sanitizedRes.Shipments.map(s => ({
                    ...s,
                    ShipmentLabel: s?.ShipmentLabel ? { ...s.ShipmentLabel, LabelFileContents: s.ShipmentLabel.LabelFileContents ? '[BASE64_REMOVED]' : undefined } : undefined
                }));
            }
            if (sanitizedRes?.ShipmentLabel?.LabelFileContents) {
                sanitizedRes.ShipmentLabel = { ...sanitizedRes.ShipmentLabel, LabelFileContents: '[BASE64_REMOVED]' };
            }
            await prisma.carrierLog.create({
                data: {
                    carrierCode: this.code,
                    requestType,
                    requestPayload: sanitizedReq,
                    responsePayload: sanitizedRes,
                    statusCode: Number(statusCode || 200),
                    durationMs: Number(durationMs || 0),
                    trackingNumber
                }
            });
        } catch (err) {
            logger.debug(`[AramexAdapter] CarrierLog skip: ${err.message}`);
        }
    }

    /**
     * Calculate shipping rates via Aramex RateCalculator API (falls back to estimate in dev when credentials are absent)
     */
    async getRates(payload = {}) {
        const origin = this._toAramexAddress(payload.sender || payload.origin || {});
        const destination = this._toAramexAddress(payload.receiver || payload.destination || {});
        const { weight, pieces } = this._extractWeightAndPieces(payload);
        const currency = payload?.currency || 'KWD';

        if (!this.hasOfficialCredentials()) {
            if (process.env.NODE_ENV === 'production' && !this.config.isTest) {
                throw new Error('Aramex API credentials (including ARAMEX_ACCOUNT_PIN) are not configured.');
            }
            const baseRate = Number((11.000 + weight * 2.2).toFixed(3));
            return [
                {
                    serviceName: 'Aramex Priority Parcel Express (PPX)',
                    serviceCode: 'PPX',
                    carrierCode: 'ARAMEX',
                    totalPrice: baseRate,
                    currency,
                    deliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                    optionalServices: []
                },
                {
                    serviceName: 'Aramex Value Express (EPX)',
                    serviceCode: 'EPX',
                    carrierCode: 'ARAMEX',
                    totalPrice: Number((baseRate * 0.70).toFixed(3)),
                    currency,
                    deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                    optionalServices: []
                }
            ];
        }

        const isDomestic = origin.CountryCode && destination.CountryCode && origin.CountryCode === destination.CountryCode;
        const productGroup = isDomestic ? 'DOM' : 'EXP';
        const productType = isDomestic ? 'OND' : (payload.serviceCode === 'EPX' ? 'EPX' : 'PPX');

        const requestBody = {
            ClientInfo: this._buildClientInfo(),
            OriginAddress: origin,
            DestinationAddress: destination,
            ShipmentDetails: {
                ActualWeight: { Unit: 'KG', Value: weight },
                ChargeableWeight: { Unit: 'KG', Value: weight },
                NumberOfPieces: pieces,
                ProductGroup: productGroup,
                ProductType: productType,
                PaymentType: 'P'
            },
            PreferredCurrencyCode: currency
        };

        const startTime = Date.now();
        const url = `${this.baseUrl}/RateCalculator/Service_1_0.svc/json/CalculateRate`;
        const res = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 15000
        });
        await this._logToCarrier('CalculateRate', requestBody, res.data, res.status, Date.now() - startTime);

        if (res.data?.HasErrors) {
            throw new Error(`Aramex RateCalculator error: ${this._extractAramexErrors(res.data)}`);
        }

        const amount = Number(res.data?.TotalAmount?.Value ?? 0);
        const resCurrency = res.data?.TotalAmount?.CurrencyCode || currency;
        return [
            {
                serviceName: productType === 'EPX' ? 'Aramex Value Express (EPX)' : (isDomestic ? 'Aramex Domestic Express (OND)' : 'Aramex Priority Parcel Express (PPX)'),
                serviceCode: productType,
                carrierCode: 'ARAMEX',
                totalPrice: Number(amount.toFixed(3)),
                currency: resCurrency,
                deliveryDate: new Date(Date.now() + (isDomestic ? 1 : 3) * 24 * 60 * 60 * 1000).toISOString(),
                optionalServices: []
            }
        ];
    }

    async rate(payload) {
        return this.getRates(payload);
    }

    /**
     * Create shipment & retrieve official AWB label via Aramex Shipping API V2
     */
    async createShipment(payload = {}, serviceCode) {
        if (!this.hasOfficialCredentials()) {
            if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_CARRIER_BOOKING !== 'true') {
                throw new Error('Live Aramex API booking credentials (including ARAMEX_ACCOUNT_PIN) are not configured in production.');
            }
            const trackingNumber = `ARM${Math.floor(1000000000 + Math.random() * 9000000000)}`;
            return {
                success: true,
                trackingNumber,
                trackingId: trackingNumber,
                carrierShipmentId: trackingNumber,
                carrier: 'ARAMEX',
                labelUrl: `https://api.target-kw.com/labels/${trackingNumber}.pdf`,
                bookingReference: `REF-${Date.now()}`,
                timestamp: new Date().toISOString()
            };
        }

        const sender = payload.sender || payload.origin || {};
        const receiver = payload.receiver || payload.destination || {};
        const shipper = this._toAramexParty(sender, this.accountNumber);
        const consignee = this._toAramexParty(receiver);
        const isDomestic = shipper.PartyAddress.CountryCode === consignee.PartyAddress.CountryCode;
        const { weight, pieces, description, declaredValue } = this._extractWeightAndPieces(payload);

        const resolvedService = String(serviceCode || payload.serviceCode || '').trim().toUpperCase();
        const productGroup = isDomestic ? 'DOM' : 'EXP';
        const productType = isDomestic
            ? 'OND'
            : (['PPX', 'EPX', 'PDX', 'PLX', 'GDX'].includes(resolvedService) ? resolvedService : 'PPX');

        const nowMs = Date.now();
        const dueMs = nowMs + 3 * 24 * 60 * 60 * 1000;
        const currency = payload.currency || 'KWD';

        const requestBody = {
            ClientInfo: this._buildClientInfo(),
            Shipments: [
                {
                    Reference1: payload.trackingNumber || payload.reference || `TRG-${nowMs}`,
                    Shipper: shipper,
                    Consignee: consignee,
                    ShippingDateTime: `/Date(${nowMs})/`,
                    DueDate: `/Date(${dueMs})/`,
                    Comments: payload.specialInstructions || payload.instructions || '',
                    PickupLocation: 'Reception',
                    Details: {
                        ActualWeight: { Unit: 'KG', Value: weight },
                        ChargeableWeight: { Unit: 'KG', Value: weight },
                        ProductGroup: productGroup,
                        ProductType: productType,
                        PaymentType: 'P',
                        NumberOfPieces: pieces,
                        DescriptionOfGoods: description,
                        GoodsOriginCountry: shipper.PartyAddress.CountryCode,
                        CustomsValueAmount: {
                            CurrencyCode: currency,
                            Value: declaredValue > 0 ? declaredValue : 10
                        }
                    }
                }
            ],
            Transaction: {
                Reference1: payload.trackingNumber || `TX-${nowMs}`
            },
            LabelInfo: {
                ReportID: 9201,
                ReportType: 'RPT'
            }
        };

        const startTime = Date.now();
        const url = `${this.baseUrl}/Shipping/Service_1_0.svc/json/CreateShipments`;
        const res = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 20000
        });
        const created = Array.isArray(res.data?.Shipments) ? res.data.Shipments[0] : null;
        await this._logToCarrier('CreateShipments', requestBody, res.data, res.status, Date.now() - startTime, created?.ID || null);

        if (res.data?.HasErrors || created?.HasErrors || !created?.ID) {
            throw new Error(`Aramex CreateShipments error: ${this._extractAramexErrors(res.data)}`);
        }

        const awb = String(created.ID).trim();
        let labelUrl = null;
        if (created.ShipmentLabel?.LabelFileContents) {
            const rawB64 = String(created.ShipmentLabel.LabelFileContents).trim();
            labelUrl = rawB64.startsWith('data:') ? rawB64 : `data:application/pdf;base64,${rawB64}`;
        } else if (created.ShipmentLabel?.LabelURL) {
            labelUrl = created.ShipmentLabel.LabelURL;
        }

        if (!labelUrl) {
            try {
                const docs = await this.getShipmentDocuments(awb, { productGroup });
                labelUrl = docs.labelUrl || null;
            } catch (labelErr) {
                logger.warn(`[AramexAdapter] PrintLabel fallback note for ${awb}: ${labelErr.message}`);
            }
        }

        return {
            success: true,
            trackingNumber: awb,
            trackingId: awb,
            carrierShipmentId: awb,
            carrier: 'ARAMEX',
            carrierCode: 'ARAMEX',
            serviceCode: productType,
            labelUrl,
            awbUrl: labelUrl,
            invoiceUrl: null,
            documents: labelUrl ? [{ type: 'label', format: 'pdf', url: labelUrl }] : [],
            rawResponse: res.data,
            timestamp: new Date().toISOString()
        };
    }

    async book(payload) {
        return this.createShipment(payload);
    }

    /**
     * Retrieve official Aramex AWB PDF via Shipping/Service_1_0.svc/json/PrintLabel
     */
    async getShipmentDocuments(awb, options = {}) {
        if (!awb) throw new Error('Tracking number is required to retrieve Aramex documents');
        if (!this.hasOfficialCredentials()) {
            throw new Error('Aramex API credentials (including ARAMEX_ACCOUNT_PIN) are not configured.');
        }

        const cleanAwb = String(awb).replace(/^(?:TRK|ARM|ARAMEX)-/i, '').trim();
        const requestBody = {
            ClientInfo: this._buildClientInfo(),
            ShipmentNumber: cleanAwb,
            ProductGroup: options.productGroup || 'EXP',
            OriginEntity: this.accountEntity || 'KWI',
            LabelInfo: {
                ReportID: 9201,
                ReportType: 'RPT'
            }
        };

        const startTime = Date.now();
        const url = `${this.baseUrl}/Shipping/Service_1_0.svc/json/PrintLabel`;
        const res = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 15000
        });
        await this._logToCarrier('PrintLabel', requestBody, res.data, res.status, Date.now() - startTime, cleanAwb);

        if (res.data?.HasErrors) {
            throw new Error(`Aramex PrintLabel error: ${this._extractAramexErrors(res.data)}`);
        }

        let labelUrl = null;
        if (res.data?.ShipmentLabel?.LabelFileContents) {
            const rawB64 = String(res.data.ShipmentLabel.LabelFileContents).trim();
            labelUrl = rawB64.startsWith('data:') ? rawB64 : `data:application/pdf;base64,${rawB64}`;
        } else if (res.data?.ShipmentLabel?.LabelURL) {
            labelUrl = res.data.ShipmentLabel.LabelURL;
        }

        return {
            labelUrl,
            awbUrl: labelUrl,
            invoiceUrl: null,
            documents: labelUrl ? [{ type: 'label', format: 'pdf', url: labelUrl }] : []
        };
    }

    async getLabel(ids = []) {
        const idList = Array.isArray(ids) ? ids : [ids];
        const awb = idList[0];
        if (!awb) throw new Error('Tracking number is required for getLabel');
        const docs = await this.getShipmentDocuments(awb);
        return docs.labelUrl || null;
    }

    /**
     * Track a shipment (Official API if credentials exist, else Universal Tracking Scraper)
     * @param {string} trackingNumber
     */
    async getTracking(trackingNumber) {
        if (this.hasOfficialCredentials()) {
            try {
                logger.info(`[AramexAdapter] Querying official Aramex Tracking API for ${trackingNumber}`);
                const officialResult = await this._fetchOfficialAramexTracking(trackingNumber);
                if (officialResult && officialResult.events && officialResult.events.length > 0) {
                    return officialResult;
                }
            } catch (err) {
                logger.warn(`[AramexAdapter] Official API failed, falling back to universal tracker: ${err.message}`);
            }
        }

        return universalTracking.getTracking('ARAMEX', trackingNumber);
    }

    async _fetchOfficialAramexTracking(awb) {
        const cleanAwb = String(awb || '').replace(/^TRK-/i, '').trim();
        const url = `${this.baseUrl}/Tracking/Service_1_0.svc/json/TrackShipments`;
        const payload = {
            ClientInfo: this._buildClientInfo(),
            GetLastTrackingUpdateOnly: false,
            Shipments: [cleanAwb]
        };

        const res = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 10000
        });

        if (res.data?.HasErrors) {
            const errMsgs = (res.data.Notifications || []).map(n => n.Message).join(', ');
            throw new Error(`Aramex Tracking API error: ${errMsgs || 'Unknown error'}`);
        }

        const trackingResults = res.data?.TrackingResults;
        if (!trackingResults || !Array.isArray(trackingResults) || trackingResults.length === 0) {
            return null;
        }

        const rawEvents = trackingResults[0]?.Value || [];
        if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
            return null;
        }

        const events = rawEvents.map(evt => {
            const rawDate = evt.UpdateDateTime;
            let parsedDate = new Date();
            if (typeof rawDate === 'string' && rawDate.includes('/Date(')) {
                const match = rawDate.match(/\/Date\((\d+)([+-]\d+)?\)\//);
                if (match) parsedDate = new Date(parseInt(match[1], 10));
            } else if (rawDate) {
                parsedDate = new Date(rawDate);
            }

            const desc = evt.UpdateDescription || evt.Comments || 'Shipment update';
            const location = evt.UpdateLocation || 'Aramex Facility';
            const statusCode = this._mapAramexStatusCode(evt.UpdateCode, desc);

            return {
                timestamp: parsedDate.toISOString(),
                location,
                description: desc,
                statusCode
            };
        });

        return {
            status: events[events.length - 1]?.statusCode || 'in_transit',
            events
        };
    }

    _mapAramexStatusCode(code, desc = '') {
        const text = String(desc || '').toLowerCase();
        if (isNegativeOrExceptionPhrase(text)) return 'exception';
        if (text.includes('out for delivery') || text.includes('delivery champion') || text.includes('doorstep') || code === 'SH014' || code === 'SH041') return 'out_for_delivery';
        if (text.includes('delivered to') || text.includes('shipment delivered') || text === 'delivered' || (text.includes('delivered') && !text.includes('delivery champion')) || code === 'SH005' || code === 'SH006') return 'delivered';
        if (text.includes('collected') || text.includes('picked up') || code === 'SH001' || code === 'SH003') return 'picked_up';
        if (text.includes('arrived at') || text.includes('departed') || text.includes('in transit') || code === 'SH012' || code === 'SH016') return 'in_transit';
        return 'in_transit';
    }

    async track(trackingNumber) {
        return this.getTracking(trackingNumber);
    }
}

module.exports = AramexAdapter;
