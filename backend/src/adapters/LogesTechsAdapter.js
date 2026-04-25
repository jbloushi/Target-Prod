const axios = require('axios');
const CarrierAdapter = require('./CarrierAdapter');
const logger = require('../utils/logger');
const {
    logesTechsShipmentBaseUrl,
    logesTechsFulfillmentBaseUrl,
    logesTechsCompanyId,
    logesTechsUsername,
    logesTechsPassword,
    logesTechsEmail
} = require('../config/config');

class LogesTechsAdapter extends CarrierAdapter {
    constructor(configOverrides = {}) {
        const shipmentBaseUrl = configOverrides.shipmentBaseUrl || logesTechsShipmentBaseUrl;
        const fulfillmentBaseUrl = configOverrides.fulfillmentBaseUrl || logesTechsFulfillmentBaseUrl;
        const companyId = configOverrides.companyId || logesTechsCompanyId;
        const username = configOverrides.username || logesTechsUsername;
        const password = configOverrides.password || logesTechsPassword;
        const email = configOverrides.email || logesTechsEmail;

        super({
            shipmentBaseUrl,
            fulfillmentBaseUrl,
            companyId,
            username,
            password,
            email
        });

        this.code = 'OTE';
        this.name = 'OTE';
        this.shipmentClient = axios.create({ baseURL: shipmentBaseUrl, timeout: 30000 });
        this.fulfillmentClient = axios.create({ baseURL: fulfillmentBaseUrl, timeout: 30000 });
    }

    _assertCredentials(required = ['companyId', 'username', 'password']) {
        const missing = required.filter((field) => !this.config[field]);
        if (missing.length > 0) {
            const err = new Error(`Validation Failed: Missing LogesTechs credentials: ${missing.join(', ')}`);
            err.statusCode = 400;
            throw err;
        }
    }

    _shipmentHeaders() {
        this._assertCredentials(['companyId', 'username', 'password']);
        return {
            'company-id': this.config.companyId,
            username: this.config.username,
            password: this.config.password,
            'content-type': 'application/json'
        };
    }

    _fulfillmentHeaders() {
        return this._shipmentHeaders();
    }

    _safeString(value) {
        if (value == null) return undefined;
        return String(value).trim();
    }

    _safeText(value) {
        if (typeof value === 'string' || typeof value === 'number') {
            return this._safeString(value);
        }
        return undefined;
    }

    _firstNonEmpty(...values) {
        for (const value of values) {
            const normalized = this._safeString(value);
            if (normalized) return normalized;
        }
        return undefined;
    }

    _toAddressPayload(address = {}, role = 'address') {
        const streetLines = Array.isArray(address.streetLines)
            ? address.streetLines.filter(Boolean).map((line) => this._safeString(line))
            : [];

        const mapped = {
            addressLine1: this._firstNonEmpty(
                address.addressLine1,
                address.street,
                address.street1,
                address.line1,
                streetLines[0],
                address.formattedAddress,
                address.address,
                '.'
            ),
            addressLine2: this._firstNonEmpty(address.addressLine2, address.street2, address.line2, streetLines[1]),
            cityId: this._firstNonEmpty(address.cityId, address.city?.id),
            regionId: this._firstNonEmpty(address.regionId, address.stateId, address.region?.id),
            villageId: this._firstNonEmpty(address.villageId, address.districtId, address.village?.id),
            cityName: this._firstNonEmpty(this._safeText(address.cityName), this._safeText(address.city)),
            regionName: this._firstNonEmpty(this._safeText(address.regionName), this._safeText(address.state), this._safeText(address.province)),
            villageName: this._firstNonEmpty(this._safeText(address.villageName), this._safeText(address.district)),
            nationalAddress: this._firstNonEmpty(address.nationalAddress)
        };

        return mapped;
    }

    _toPackagePayload(shipment = {}) {
        const parcel = Array.isArray(shipment.parcels) ? shipment.parcels[0] || {} : {};
        const dimensions = parcel.dimensions || {};
        const weightValue = parcel.weight?.value ?? parcel.weight ?? shipment.chargeableWeight ?? 0;

        return {
            piecesCount: Number(parcel.quantity || shipment.totalBoxes || 1),
            weight: Number(weightValue || 0),
            length: Number(dimensions.length || parcel.length || 0),
            width: Number(dimensions.width || parcel.width || 0),
            height: Number(dimensions.height || parcel.height || 0),
            description: this._firstNonEmpty(parcel.description, shipment.description, shipment.commodity)
        };
    }

    _normalizeShipmentResponse(raw = {}) {
        // TODO(LogesTechs): Provider response schema is not fully documented; keep this mapper conservative.
        const shipmentId = raw.id || raw.shipmentId || raw.packageId || raw.data?.id || raw.data?.shipmentId || null;
        const barcode = raw.barcode || raw.awb || raw.trackingNumber || raw.data?.barcode || null;
        return {
            carrierCode: this.code,
            carrierShipmentId: shipmentId,
            trackingNumber: barcode || shipmentId,
            barcode,
            rawResponse: raw
        };
    }

    _sanitizeForLogs(value) {
        const redact = (input) => {
            if (Array.isArray(input)) return input.map(redact);
            if (!input || typeof input !== 'object') return input;

            return Object.fromEntries(
                Object.entries(input).map(([key, val]) => {
                    const lower = key.toLowerCase();
                    if (lower.includes('password') || lower.includes('authorization')) {
                        return [key, '[REDACTED]'];
                    }
                    return [key, redact(val)];
                })
            );
        };

        return redact(value);
    }

    _extractProviderMessage(payload) {
        if (!payload) return null;
        if (typeof payload === 'string') return payload;
        if (typeof payload?.message === 'string') return payload.message;
        if (typeof payload?.detail === 'string') return payload.detail;
        if (typeof payload?.error === 'string') return payload.error;

        const list = payload?.errors || payload?.messages || payload?.details;
        if (Array.isArray(list) && list.length > 0) {
            const first = list[0];
            if (typeof first === 'string') return first;
            return first?.message || first?.detail || first?.error || null;
        }

        return null;
    }

    async _enrichAddressWithVillageLookup(address = {}) {
        if (address.cityId && address.regionId && address.villageId) {
            return address;
        }

        const search = this._firstNonEmpty(
            address.villageName,
            address.cityName,
            address.regionName,
            address.addressLine1
        );

        if (!search || search === '.') {
            return address;
        }

        try {
            const response = await this.shipmentClient.get('/addresses/villages', {
                headers: this._shipmentHeaders(),
                params: { search }
            });

            const rows = Array.isArray(response?.data)
                ? response.data
                : (response?.data?.items || response?.data?.data || []);

            const first = Array.isArray(rows) ? rows[0] : null;
            if (!first) return address;

            return {
                ...address,
                villageId: address.villageId || first.villageId || first.id || first?.village?.id,
                cityId: address.cityId || first.cityId || first?.city?.id,
                regionId: address.regionId || first.regionId || first?.region?.id
            };
        } catch (error) {
            logger.warn('LogesTechs address enrichment failed', {
                message: error?.message,
                statusCode: error?.response?.status
            });
            return address;
        }
    }

    _normalizeProviderError(error, operation) {
        if (error?.statusCode && String(error.message || '').includes('Validation Failed')) {
            return error;
        }
        const statusCode = error?.response?.status || error?.statusCode || 500;
        const upstreamBody = error?.response?.data;
        const upstreamMessage = this._extractProviderMessage(upstreamBody) || error?.message || 'Unknown provider error';
        const isCredentialError = /البريد الالكتروني او كلمة المرور غير صحيحة|incorrect email or password|invalid credentials/i
            .test(String(upstreamMessage || ''));
        const normalizedMessage = isCredentialError
            ? 'OTE authentication failed. Verify LOGESTECHS_EMAIL, LOGESTECHS_PASSWORD, LOGESTECHS_USERNAME, and LOGESTECHS_COMPANY_ID.'
            : upstreamMessage;

        logger.error(`LogesTechs ${operation} failed`, {
            statusCode,
            upstreamMessage: normalizedMessage,
            response: this._sanitizeForLogs(upstreamBody)
        });

        const wrapped = new Error(`Carrier booking failed: LogesTechs ${operation} failed - ${normalizedMessage}`);
        wrapped.statusCode = statusCode;
        wrapped.isProviderError = true;
        wrapped.provider = this.code;
        wrapped.details = this._sanitizeForLogs(upstreamBody);
        return wrapped;
    }

    async validate(shipment = {}) {
        const errors = [];

        if (!this.config.companyId) errors.push('company-id is required');
        if (!this.config.username) errors.push('username is required');
        if (!this.config.password) errors.push('password is required');
        if (!this.config.email) errors.push('email is required');

        return errors;
    }

    async getRates() {
        return [];
    }

    async createShipment(normalizedShipment = {}) {
        try {
            this._assertCredentials(['companyId', 'username', 'password', 'email']);
            const validationErrors = await this.validate(normalizedShipment);
            if (validationErrors.length > 0) {
                const err = new Error(`Validation Failed: ${validationErrors.join('; ')}`);
                err.statusCode = 400;
                throw err;
            }

            const destinationAddress = await this._enrichAddressWithVillageLookup(
                this._toAddressPayload(normalizedShipment.receiver || normalizedShipment.destination || {}, 'destinationAddress')
            );
            const originAddress = await this._enrichAddressWithVillageLookup(
                this._toAddressPayload(normalizedShipment.sender || normalizedShipment.origin || {}, 'originAddress')
            );

            const payload = {
                email: this.config.email,
                password: this.config.password,
                pkgUnitType: 'METRIC',
                pkg: this._toPackagePayload(normalizedShipment),
                destinationAddress,
                originAddress
            };

            const response = await this.shipmentClient.post('/ship/request/by-email', payload, {
                headers: this._shipmentHeaders()
            });

            return this._normalizeShipmentResponse(response.data);
        } catch (error) {
            throw this._normalizeProviderError(error, 'createShipment');
        }
    }

    async getVillages(search = '') {
        try {
            this._assertCredentials();
            const response = await this.shipmentClient.get('/addresses/villages', {
                headers: this._shipmentHeaders(),
                params: { search: this._safeString(search) || '' }
            });
            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'getVillages');
        }
    }

    async getLabel(ids = []) {
        try {
            this._assertCredentials();
            if (!Array.isArray(ids) || ids.length === 0) {
                const err = new Error('Validation Failed: ids array required for label PDF');
                err.statusCode = 400;
                throw err;
            }

            const response = await this.shipmentClient.post(
                `/guests/${this.config.companyId}/packages/pdf`,
                { ids },
                { headers: this._shipmentHeaders() }
            );

            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'getLabel');
        }
    }

    async cancelShipment(shipmentId, email = null) {
        try {
            this._assertCredentials(['companyId', 'password']);
            if (!shipmentId) {
                const err = new Error('Validation Failed: shipmentId required for cancellation');
                err.statusCode = 400;
                throw err;
            }

            const body = {
                email: email || this.config.email,
                password: this.config.password
            };

            if (!body.email) {
                const err = new Error('Validation Failed: email required for cancellation');
                err.statusCode = 400;
                throw err;
            }

            const response = await this.shipmentClient.put(
                `/guests/${this.config.companyId}/packages/${shipmentId}/cancel`,
                body,
                { headers: this._shipmentHeaders() }
            );

            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'cancelShipment');
        }
    }

    async getStatus({ barcode, id } = {}) {
        try {
            this._assertCredentials();
            if (!barcode && !id) {
                const err = new Error('Validation Failed: Either barcode or id required for status lookup');
                err.statusCode = 400;
                throw err;
            }

            const response = await this.shipmentClient.get('/guests/packages/status', {
                headers: this._shipmentHeaders(),
                params: barcode ? { barcode } : { id }
            });

            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'getStatus');
        }
    }

    async getTracking(trackingNumber) {
        const data = await this.getStatus({ barcode: trackingNumber });
        return {
            carrierCode: this.code,
            trackingNumber,
            status: data?.status || data?.currentStatus || 'UNKNOWN',
            description: data?.description || data?.message || 'No status description',
            events: Array.isArray(data?.events) ? data.events : []
        };
    }

    async addOrUpdateProducts(products = []) {
        try {
            this._assertCredentials();
            const response = await this.fulfillmentClient.post('/public/fulfillment/product/bulk', products, {
                headers: this._fulfillmentHeaders()
            });
            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'addOrUpdateProducts');
        }
    }

    async getProducts({ page = 1, pageSize = 10 } = {}) {
        try {
            this._assertCredentials();
            const response = await this.fulfillmentClient.get('/public/fulfillment/product', {
                headers: this._fulfillmentHeaders(),
                params: { page, pageSize }
            });
            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'getProducts');
        }
    }

    async getProductCategories({ page = 1, pageSize = 10, search = '' } = {}) {
        try {
            this._assertCredentials();
            const response = await this.fulfillmentClient.get('/public/fulfillment/product/category', {
                headers: this._fulfillmentHeaders(),
                params: { page, pageSize, search }
            });
            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'getProductCategories');
        }
    }

    async addFulfillmentOrder(orderPayload = {}) {
        try {
            this._assertCredentials();
            const response = await this.fulfillmentClient.post('/public/fulfillment/order', orderPayload, {
                headers: this._fulfillmentHeaders()
            });
            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'addFulfillmentOrder');
        }
    }

    async getFulfillmentOrders({ page = 1, pageSize = 10 } = {}) {
        try {
            this._assertCredentials();
            const response = await this.fulfillmentClient.get('/public/fulfillment/order', {
                headers: this._fulfillmentHeaders(),
                params: { page, pageSize }
            });
            return response.data;
        } catch (error) {
            throw this._normalizeProviderError(error, 'getFulfillmentOrders');
        }
    }
}

module.exports = LogesTechsAdapter;
