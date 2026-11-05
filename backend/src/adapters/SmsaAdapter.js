const axios = require('axios');
const CarrierAdapter = require('./CarrierAdapter');
const {
    smsaApiKey,
    smsaApiUrl,
    smsaTestApiKey,
    smsaTestApiUrl
} = require('../config/config');

const badRequest = (message) => {
    const err = new Error(`Validation Failed: ${message}`);
    err.statusCode = 400;
    return err;
};

const len = (v) => String(v ?? '').trim().length;

/**
 * SMSA Express e-commerce API adapter (carrier code: SMSA).
 * Environment: 'sandbox' | 'production' (default 'sandbox').
 * Sandbox URL: https://ecomapis-sandbox.azurewebsites.net
 * Production URL: https://ecomapis.smsaexpress.com
 * Auth: `apikey` header on every request.
 */
class SmsaAdapter extends CarrierAdapter {
    constructor(configOverrides = {}) {
        const isTest = configOverrides.isTest === true ||
                       configOverrides.environment === 'test' ||
                       configOverrides.environment === 'sandbox' ||
                       (!configOverrides.environment && process.env.NODE_ENV !== 'production');

        const pick = (key, fallback) => Object.prototype.hasOwnProperty.call(configOverrides, key)
            ? configOverrides[key]
            : fallback;

        const defaultSandboxUrl = smsaTestApiUrl || 'https://ecomapis-sandbox.azurewebsites.net';
        const defaultProdUrl = smsaApiUrl || 'https://ecomapis.smsaexpress.com';

        let baseUrl = pick('baseUrl', isTest ? defaultSandboxUrl : defaultProdUrl);
        if (configOverrides.environment === 'production' && !configOverrides.baseUrl) {
            baseUrl = defaultProdUrl;
        } else if ((configOverrides.environment === 'sandbox' || configOverrides.environment === 'test') && !configOverrides.baseUrl) {
            baseUrl = defaultSandboxUrl;
        }

        const apiKey = pick('apiKey', pick('apikey', isTest ? (smsaTestApiKey || smsaApiKey) : smsaApiKey));

        super({ baseUrl, apiKey, isTest, environment: isTest ? 'sandbox' : 'production' });

        this.code = 'SMSA';
        this.name = 'SMSA Express';
        this.client = axios.create({ baseURL: baseUrl, timeout: 30000, proxy: false });
    }

    _headers() {
        if (!this.config.apiKey) throw badRequest('Missing SMSA API key (SMSA_API_KEY)');
        return { apikey: this.config.apiKey, 'Content-Type': 'application/json' };
    }

    _sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        try {
            const clone = JSON.parse(JSON.stringify(payload));
            const redact = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                for (const key of Object.keys(obj)) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey.includes('apikey') || lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('token')) {
                        obj[key] = '[REDACTED]';
                    } else if (lowerKey.includes('waybilllabel') || lowerKey.includes('labelbase64')) {
                        obj[key] = '[BASE64_REMOVED]';
                    } else if (typeof obj[key] === 'object') {
                        redact(obj[key]);
                    }
                }
            };
            redact(clone);
            return clone;
        } catch (_) {
            return '[UNSERIALIZABLE]';
        }
    }

    async _logToCarrier(operation, requestPayload, responsePayload, statusCode, durationMs) {
        if (process.env.NODE_ENV === 'test' && !this.config.enableCarrierLog) {
            return;
        }
        try {
            const { prisma } = require('../config/database');
            if (prisma?.carrierLog?.create) {
                await prisma.carrierLog.create({
                    data: {
                        carrierCode: this.code,
                        requestType: operation,
                        requestPayload: this._sanitizePayload(requestPayload) || {},
                        responsePayload: this._sanitizePayload(responsePayload) || {},
                        statusCode: statusCode || 200,
                        durationMs: durationMs || 0
                    }
                }).catch(() => {});
            }
        } catch (_) {}
    }

    _normalizeError(error, operation) {
        if (error?.isProviderError || (error?.statusCode === 400 && !error.response)) return error;
        const status = error?.response?.status || error?.statusCode || 500;
        const body = error?.response?.data;
        let message = '';
        if (body?.title && body?.detail && body.title !== body.detail) {
            message = `${body.title} - ${body.detail}`;
        } else {
            message = body?.detail || body?.title || body?.message || error?.message || 'Unknown error';
        }
        if (body?.errors && typeof body.errors === 'object') {
            const details = Object.entries(body.errors)
                .map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join('; ');
            if (details) message = `${message} - ${details}`;
        }
        const wrapped = new Error(`SMSA ${operation} failed: ${message}`);
        wrapped.statusCode = status;
        wrapped.provider = this.code;
        wrapped.isProviderError = true;
        wrapped.details = body;
        wrapped.errors = body?.errors;
        wrapped.title = body?.title;
        wrapped.detail = body?.detail;
        wrapped.type = body?.type;
        wrapped.traceId = body?.traceId;
        return wrapped;
    }

    async _request(operation, method, url, data) {
        const startTime = Date.now();
        try {
            const headers = this._headers();
            const res = await this.client.request({ method, url, data, headers });
            await this._logToCarrier(operation, data, res.data, res.status, Date.now() - startTime);
            return res.data;
        } catch (error) {
            const status = error?.response?.status || error?.statusCode || 500;
            await this._logToCarrier(operation, data, error?.response?.data || { message: error.message }, status, Date.now() - startTime);
            throw this._normalizeError(error, operation);
        }
    }

    _pickAddress(addr) {
        if (!addr || typeof addr !== 'object') return null;
        const lines = Array.isArray(addr.streetLines) ? addr.streetLines : [];
        const out = {
            ContactName: addr.ContactName || addr.contactName || addr.name || addr.fullName || addr.company,
            ContactPhoneNumber: addr.ContactPhoneNumber || addr.contactPhoneNumber || addr.phone || addr.phoneNumber,
            AddressLine1: addr.AddressLine1 || addr.addressLine1 || addr.street || addr.street1 || addr.line1 || lines[0] || addr.address,
            AddressLine2: addr.AddressLine2 || addr.addressLine2 || addr.street2 || addr.line2 || lines[1],
            City: addr.City || addr.city,
            Country: String(addr.Country || addr.country || addr.countryCode || '').toUpperCase(),
            District: addr.District || addr.district,
            PostalCode: addr.PostalCode || addr.postalCode || addr.zip,
            Coordinates: addr.Coordinates || addr.coordinates
        };
        if (addr.ShortCode || addr.shortCode) out.ShortCode = addr.ShortCode || addr.shortCode;
        if (addr.ConsigneeID || addr.consigneeId) out.ConsigneeID = addr.ConsigneeID || addr.consigneeId;
        Object.keys(out).forEach((k) => (out[k] === undefined || out[k] === null || out[k] === '') && delete out[k]);
        return out;
    }

    _validateAddress(label, a, errors, { consignee = false } = {}) {
        if (!a) {
            errors.push(`${label} is required`);
            return;
        }
        if (!a.ContactName) {
            errors.push(`${label}.ContactName is required`);
        } else if (len(a.ContactName) < 5 || len(a.ContactName) > 150) {
            errors.push(`${label}.ContactName length must be 5-150`);
        }

        if (!a.ContactPhoneNumber) {
            errors.push(`${label}.ContactPhoneNumber is required`);
        }

        if (!a.AddressLine1) {
            errors.push(`${label}.AddressLine1 is required`);
        } else if (len(a.AddressLine1) < 10 || len(a.AddressLine1) > 100) {
            errors.push(`${label}.AddressLine1 length must be 10-100`);
        }

        if (a.AddressLine2 && len(a.AddressLine2) > 100) {
            errors.push(`${label}.AddressLine2 length must be at most 100`);
        }

        if (!a.City) {
            errors.push(`${label}.City is required`);
        } else if (len(a.City) < 3 || len(a.City) > 50) {
            errors.push(`${label}.City length must be 3-50`);
        }

        if (!a.Country) {
            errors.push(`${label}.Country is required`);
        }

        if (!consignee && a.ShortCode) {
            delete a.ShortCode;
        }
    }

    _buildB2cPayload(shipment = {}, serviceCode) {
        const s = (shipment && typeof shipment === 'object') ? shipment : {};
        const parcels = s.packages || s.parcels || [];
        const parcelCount = Number.isFinite(Number(s.Parcels))
            ? Number(s.Parcels)
            : (Number.isFinite(Number(s.parcelCount))
                ? Number(s.parcelCount)
                : (Array.isArray(parcels) && parcels.length ? parcels.length : 1));

        let weight = s.Weight !== undefined ? s.Weight : s.weight;
        if (weight != null) {
            weight = Number(weight);
        } else if (Array.isArray(parcels) && parcels.length) {
            weight = parcels.reduce((sum, p) => sum + Number(p.weight || 0), 0);
        } else {
            weight = 0;
        }

        const rawShipDate = s.ShipDate !== undefined
            ? s.ShipDate
            : (s.shipDate !== undefined
                ? s.shipDate
                : (s.pickupDate || new Date().toISOString().slice(0, 19)));

        const rawCurrency = s.ShipmentCurrency !== undefined
            ? s.ShipmentCurrency
            : (s.currency !== undefined
                ? s.currency
                : (s.shipmentCurrency !== undefined ? s.shipmentCurrency : 'SAR'));

        const payload = {
            ConsigneeAddress: this._pickAddress(s.ConsigneeAddress || s.receiver || s.destination || s.consignee),
            ShipperAddress: this._pickAddress(s.ShipperAddress || s.sender || s.origin || s.shipper),
            OrderNumber: s.OrderNumber || s.orderNumber || s.reference || s.referenceNumber,
            CODAmount: s.CODAmount !== undefined
                ? Number(s.CODAmount)
                : Number(s.codAmount ?? 0),
            DeclaredValue: s.DeclaredValue !== undefined
                ? Number(s.DeclaredValue)
                : Number(s.declaredValue ?? s.customsValue ?? 0),
            ContentDescription: s.ContentDescription || s.contentDescription || s.description || s.content,
            Parcels: parcelCount,
            ShipDate: rawShipDate,
            ShipmentCurrency: rawCurrency,
            Weight: weight,
            WeightUnit: String(s.WeightUnit || s.weightUnit || 'KG').toUpperCase(),
            WaybillType: String(s.WaybillType || s.waybillType || 'PDF').toUpperCase()
        };

        const svc = serviceCode || s.ServiceCode || s.serviceCode;
        if (svc) payload.ServiceCode = svc;
        if (s.SMSARetailID != null || s.smsaRetailId != null) payload.SMSARetailID = String(s.SMSARetailID ?? s.smsaRetailId);
        if (s.DutyPaid != null || s.dutyPaid != null) payload.DutyPaid = Boolean(s.DutyPaid ?? s.dutyPaid);
        if (s.VatPaid != null || s.vatPaid != null) payload.VatPaid = Boolean(s.VatPaid ?? s.vatPaid);
        return payload;
    }

    async validate(shipment = {}, serviceCode) {
        const errors = [];
        const p = this._buildB2cPayload(shipment, serviceCode);

        if (!p.OrderNumber) {
            errors.push('OrderNumber is required');
        } else if (len(p.OrderNumber) > 50) {
            errors.push('OrderNumber max length is 50');
        }

        if (p.Weight === undefined || p.Weight === null || isNaN(p.Weight) || Number(p.Weight) < 0.001) {
            errors.push('Weight must be at least 0.001');
        }

        if (!p.WeightUnit || !['KG', 'LB'].includes(p.WeightUnit)) {
            errors.push('WeightUnit must be KG or LB');
        }

        if (p.DeclaredValue === undefined || p.DeclaredValue === null || isNaN(p.DeclaredValue) || Number(p.DeclaredValue) < 0.1) {
            errors.push('DeclaredValue must be at least 0.1');
        }

        if (p.Parcels === undefined || p.Parcels === null || !Number.isInteger(Number(p.Parcels)) || Number(p.Parcels) < 1) {
            errors.push('Parcels must be an integer >= 1');
        }

        if (!p.ContentDescription || !String(p.ContentDescription).trim()) {
            errors.push('ContentDescription is required');
        }

        if (p.CODAmount === undefined || p.CODAmount === null || isNaN(p.CODAmount) || Number(p.CODAmount) < 0) {
            errors.push('CODAmount must be >= 0');
        }

        if (!p.ShipmentCurrency || !String(p.ShipmentCurrency).trim()) {
            errors.push('ShipmentCurrency is required');
        }

        if (!p.ShipDate || isNaN(new Date(p.ShipDate).getTime())) {
            errors.push('ShipDate is required and must be a valid date');
        }

        if (!['PDF', 'ZPL'].includes(p.WaybillType)) {
            errors.push('WaybillType must be PDF or ZPL');
        }

        this._validateAddress('ConsigneeAddress', p.ConsigneeAddress, errors, { consignee: true });
        this._validateAddress('ShipperAddress', p.ShipperAddress, errors);

        return errors;
    }

    async getRates(shipmentData = {}) {
        const countryCode = shipmentData?.receiver?.countryCode ||
                            shipmentData?.receiver?.country ||
                            shipmentData?.destination?.countryCode ||
                            shipmentData?.destination?.country ||
                            shipmentData?.consignee?.countryCode ||
                            shipmentData?.consignee?.country ||
                            shipmentData?.ConsigneeAddress?.Country;
        const weight = shipmentData?.weight != null
            ? Number(shipmentData.weight)
            : (Array.isArray(shipmentData?.packages)
                ? shipmentData.packages.reduce((s, p) => s + Number(p.weight || 0), 0)
                : 1);
        const rateCardId = shipmentData?.rateCardId;

        if (rateCardId && countryCode) {
            try {
                const RateCardService = require('../services/RateCardService');
                const rateCardResult = RateCardService.calculateRate({
                    rateCardId,
                    carrierCode: this.code,
                    countryCode,
                    weight,
                    packages: shipmentData?.packages || shipmentData?.parcels
                });
                if (rateCardResult) {
                    return [{
                        serviceName: rateCardResult.rateCardName ? `SMSA Express (${rateCardResult.rateCardName})` : 'SMSA Express',
                        serviceCode: shipmentData?.serviceCode || 'DLV',
                        carrierCode: this.code,
                        carrier: this.code,
                        totalPrice: rateCardResult.totalPrice,
                        currency: rateCardResult.currency || 'SAR',
                        deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                        optionalServices: [],
                        rateCardResult
                    }];
                }
            } catch (_) {}
        }

        return [{
            serviceName: 'SMSA Express',
            serviceCode: shipmentData?.serviceCode || 'DLV',
            carrierCode: this.code,
            carrier: this.code,
            totalPrice: 0,
            currency: shipmentData?.currency || 'SAR',
            deliveryDate: null,
            optionalServices: []
        }];
    }

    // Standard CarrierAdapter: createShipment
    async createShipment(normalizedShipment = {}, serviceCode) {
        const errors = await this.validate(normalizedShipment, serviceCode);
        if (errors.length) throw badRequest(errors.join('; '));
        const payload = this._buildB2cPayload(normalizedShipment, serviceCode);
        const raw = await this.createB2CShipment(payload);
        const awb = raw?.awbNumber || raw?.awb || raw?.sawb || null;

        const isZpl = String(payload.WaybillType).toUpperCase() === 'ZPL' ||
                      String(raw?.waybillType).toUpperCase() === 'ZPL' ||
                      String(raw?.waybillLabel || '').startsWith('^XA');
        const mime = isZpl ? 'application/x-zpl' : 'application/pdf';

        let labelUrl = null;
        let labelDataUri = null;
        if (raw?.waybillLabel) {
            if (raw.waybillLabel.startsWith('http://') || raw.waybillLabel.startsWith('https://')) {
                labelUrl = raw.waybillLabel;
                labelDataUri = raw.waybillLabel;
            } else if (raw.waybillLabel.startsWith('data:')) {
                labelUrl = raw.waybillLabel;
                labelDataUri = raw.waybillLabel;
            } else {
                labelDataUri = `data:${mime};base64,${raw.waybillLabel}`;
                labelUrl = labelDataUri;
            }
        } else if (raw?.labelUrl) {
            labelUrl = raw.labelUrl;
            labelDataUri = raw.labelUrl;
        }

        return {
            carrierCode: this.code,
            carrierShipmentId: awb,
            trackingNumber: awb,
            barcode: awb,
            serviceCode: serviceCode || payload.ServiceCode || 'DLV',
            labelUrl,
            labelBase64: raw?.waybillLabel || null,
            awbUrl: labelUrl,
            invoiceUrl: raw?.invoiceUrl || null,
            documents: labelDataUri ? [
                {
                    type: 'label',
                    format: isZpl ? 'zpl' : 'pdf',
                    data: labelDataUri,
                    url: labelUrl
                }
            ] : [],
            rawResponse: raw
        };
    }

    // Standard CarrierAdapter: cancelShipment
    async cancelShipment(trackingNumber) {
        this._requireValue(trackingNumber, 'trackingNumber');
        const data = await this.cancelC2BShipment(trackingNumber);
        return {
            success: data?.success !== false,
            message: data?.message || 'Cancellation processed successfully',
            rawResponse: data
        };
    }

    // Standard CarrierAdapter: getTracking
    async getTracking(trackingNumber) {
        this._requireValue(trackingNumber, 'trackingNumber');
        const cleanAwb = String(trackingNumber).replace(/^SMSA-?/i, '').trim();
        let data = null;
        try {
            data = await this.queryB2CShipment(cleanAwb);
        } catch (queryErr) {
            data = await this.trackSingle(cleanAwb).catch(() => null);
            if (!data && queryErr) throw queryErr;
        }
        const history = Array.isArray(data?.history) ? data.history : (Array.isArray(data?.events) ? data.events : []);

        const events = history.filter(h => h && typeof h === 'object').map((h) => {
            const code = h.checkpointCode || h.statusCode || h.status || '';
            const desc = h.checkpointDescription || h.description || h.statusDescription || '';
            const ts = h.timestamp || h.Date || new Date().toISOString();
            return {
                statusCode: code,
                status: code,
                description: desc,
                timestamp: ts,
                localTimestamp: h.localTimestamp || ts,
                timezoneOffset: h.timezoneOffset || '+03:00',
                location: h.location || h.city || ''
            };
        });

        return {
            status: data?.statusCode || data?.status || 'UNKNOWN',
            description: data?.statusDescription || data?.description || data?.status || 'No status description',
            carrierCode: this.code,
            trackingNumber: cleanAwb,
            estimatedDelivery: data?.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : (data?.estimatedDelivery || null),
            carrierWeight: data?.carrierWeight ?? data?.weight ?? undefined,
            carrierPieces: data?.carrierPieces ?? data?.parcels ?? data?.pieces ?? undefined,
            events
        };
    }

    // 1. Create B2C Shipment: POST /api/shipment/b2c/new
    async createB2CShipment(payload = {}) {
        return this._request('createB2CShipment', 'post', '/api/shipment/b2c/new', payload);
    }

    // 2. Query B2C Shipment: GET /api/shipment/b2c/query/{awb}
    async queryB2CShipment(awb) {
        this._requireValue(awb, 'awb');
        return this._request('queryB2CShipment', 'get', `/api/shipment/b2c/query/${encodeURIComponent(awb)}`);
    }
    async queryB2c(awb) { return this.queryB2CShipment(awb); }

    // 3. Create C2B Shipment (Reverse Pickup): POST /api/c2b/new
    async createC2BShipment(payload = {}) {
        const p = (payload && typeof payload === 'object') ? payload : {};
        const errors = [];
        if (!p.OrderNumber) errors.push('OrderNumber is required');
        if (!p.PickupAddress) errors.push('PickupAddress is required');
        if (!p.ReturnToAddress) errors.push('ReturnToAddress is required');
        const n = Number(p.Parcels);
        if (!(Number.isInteger(n) && n >= 1 && n <= 6)) errors.push('Parcels count is between 1 to 6 parcels per shipment');
        if (errors.length) throw badRequest(errors.join('; '));
        return this._request('createC2BShipment', 'post', '/api/c2b/new', p);
    }
    async createC2b(payload) { return this.createC2BShipment(payload); }

    // 4. Query C2B Shipment: GET /api/c2b/query/{awb}
    async queryC2BShipment(awb) {
        this._requireValue(awb, 'awb');
        return this._request('queryC2BShipment', 'get', `/api/c2b/query/${encodeURIComponent(awb)}`);
    }
    async queryC2b(awb) { return this.queryC2BShipment(awb); }

    // 5. Cancel C2B Shipment: POST /api/c2b/cancel/{awb}
    async cancelC2BShipment(awb) {
        this._requireValue(awb, 'awb');
        return this._request('cancelC2BShipment', 'post', `/api/c2b/cancel/${encodeURIComponent(awb)}`);
    }
    async cancelReversePickup(awb) { return this.cancelC2BShipment(awb); }

    // 6. Currencies Lookup: GET /api/lookup/currency
    async getCurrencies() {
        return this._request('getCurrencies', 'get', '/api/lookup/currency');
    }
    async getCurrencyLookup() { return this.getCurrencies(); }

    // 7. Offices Lookup: GET /api/lookup/smsaoffices
    async getOffices() {
        return this._request('getOffices', 'get', '/api/lookup/smsaoffices');
    }

    // 8. Cities Lookup: GET /api/lookup/cities/{countryCode}
    async getCities(countryCode) {
        this._requireValue(countryCode, 'countryCode');
        return this._request('getCities', 'get', `/api/lookup/cities/${encodeURIComponent(countryCode)}`);
    }

    // 9. Send Invoice: POST /api/invoice
    async sendInvoice(invoicePayload = {}) {
        const inv = (invoicePayload && typeof invoicePayload === 'object') ? invoicePayload : {};
        const errors = [];
        if (!inv.AWB) errors.push('AWB is required');
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(inv.InvoiceDate || ''))) {
            errors.push('InvoiceDate must be dd/mm/yyyy');
        }
        if (!Array.isArray(inv.Items) || !inv.Items.length) {
            errors.push('Items are required');
        }
        (inv.Items || []).forEach((it, i) => {
            if (!(Number.isInteger(it?.sequence) && it?.sequence >= 1 && it?.sequence <= 100)) {
                errors.push(`Items[${i}].sequence must be 1-100`);
            }
            if (!(Number.isInteger(it?.Quantity) && it?.Quantity >= 1 && it?.Quantity <= 1000)) {
                errors.push(`Items[${i}].Quantity must be 1-1000`);
            }
            if (!it?.ItemHSCode) {
                errors.push(`Items[${i}].ItemHSCode is required`);
            }
        });
        if (errors.length) throw badRequest(errors.join('; '));
        return this._request('sendInvoice', 'post', '/api/invoice', inv);
    }

    // 10. Track Bulk: POST /api/track/bulk
    async trackBulk(awbList = []) {
        if (!Array.isArray(awbList) || !awbList.length || awbList.some((a) => typeof a !== 'string' || !a.trim())) {
            throw badRequest('awbList must be a non-empty array of strings');
        }
        return this._request('trackBulk', 'post', '/api/track/bulk', awbList);
    }

    // 11. Track Single: GET /api/track/single/{awb}
    async trackSingle(awb) {
        this._requireValue(awb, 'awb');
        return this._request('trackSingle', 'get', `/api/track/single/${encodeURIComponent(awb)}`);
    }

    // 12. Track by Reference: GET /api/track/reference/{ref}
    async trackByReference(ref) {
        this._requireValue(ref, 'reference');
        return this._request('trackByReference', 'get', `/api/track/reference/${encodeURIComponent(ref)}`);
    }

    // 13. Status Lookup: GET /api/track/statuslookup
    async getStatusLookup() {
        return this._request('getStatusLookup', 'get', '/api/track/statuslookup');
    }

    // 14. Validate Short Address: POST /api/lookup/shortaddress (or equivalent short address method)
    async validateShortAddress(shortAddress, options = {}) {
        const isPost = (typeof shortAddress === 'object' && shortAddress !== null) ||
                       options === 'post' || options?.method === 'post' || options?.usePost;
        const code = (typeof shortAddress === 'object' && shortAddress !== null)
            ? (shortAddress.shortAddress || shortAddress.shortCode || shortAddress.code)
            : shortAddress;

        if (!/^[A-Za-z]{4}\d{4}$/.test(String(code || ''))) {
            throw badRequest('shortAddress must be 4 letters followed by 4 digits');
        }
        const cleanCode = String(code).toUpperCase();

        if (isPost) {
            return this._request('validateShortAddress', 'post', '/api/lookup/shortaddress', { shortAddress: cleanCode });
        }
        return this._request('validateShortAddress', 'get', `/api/lookup/address/${encodeURIComponent(cleanCode)}`);
    }

    // 15. Push ID Details: POST /api/shipment/id
    async pushIdDetails(idPayload = {}, extraDetails) {
        const payload = (typeof idPayload === 'string' && typeof extraDetails === 'object')
            ? { AWB: idPayload, ...extraDetails }
            : { ...idPayload };

        const errors = [];
        if (!payload.AWB) errors.push('AWB is required');
        if (!['NationalId', 'Iqama', 'Passport', 'CR'].includes(payload.IDType)) {
            errors.push('IDType must be NationalId, Iqama, Passport or CR');
        }
        if (!payload.IDNumber) errors.push('IDNumber is required');
        if (errors.length) throw badRequest(errors.join('; '));

        return this._request('pushIdDetails', 'post', '/api/shipment/id', payload);
    }

    _requireValue(value, name) {
        if (value == null || !String(value).trim()) throw badRequest(`${name} is required`);
    }
}

module.exports = SmsaAdapter;
