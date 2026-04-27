const axios = require('axios');
const CarrierAdapter = require('./CarrierAdapter');
const logger = require('../utils/logger');
const {
    logesTechsShipmentBaseUrl,
    logesTechsFulfillmentBaseUrl,
    logesTechsCompanyId,
    logesTechsUsername,
    logesTechsPassword,
    logesTechsEmail,
    logesTechsShipmentEmail,
    logesTechsShipmentPassword
} = require('../config/config');

class LogesTechsAdapter extends CarrierAdapter {
    constructor(configOverrides = {}) {
        const pick = (key, fallback) => Object.prototype.hasOwnProperty.call(configOverrides, key)
            ? configOverrides[key]
            : fallback;

        const shipmentBaseUrl = pick('shipmentBaseUrl', logesTechsShipmentBaseUrl);
        const fulfillmentBaseUrl = pick('fulfillmentBaseUrl', logesTechsFulfillmentBaseUrl);
        const companyId = pick('companyId', logesTechsCompanyId);
        const username = pick('username', logesTechsUsername);
        const password = pick('password', logesTechsPassword);
        const email = pick('email', logesTechsEmail);
        const shipmentEmail = pick('shipmentEmail', logesTechsShipmentEmail);
        const shipmentPassword = pick('shipmentPassword', logesTechsShipmentPassword);

        super({
            shipmentBaseUrl,
            fulfillmentBaseUrl,
            companyId,
            username,
            password,
            email,
            shipmentEmail,
            shipmentPassword
        });

        this.code = 'OTE';
        this.name = 'OTE';
        this.shipmentClient = axios.create({ baseURL: shipmentBaseUrl, timeout: 30000 });
        this.fulfillmentClient = axios.create({ baseURL: fulfillmentBaseUrl, timeout: 30000 });
    }

    _assertCredentials(required = ['companyId']) {
        const missing = required.filter((field) => !this.config[field]);
        if (missing.length > 0) {
            const err = new Error(`Validation Failed: Missing LogesTechs credentials: ${missing.join(', ')}`);
            err.statusCode = 400;
            throw err;
        }
    }

    _shipmentHeaders() {
        this._assertCredentials(['companyId']);
        return {
            'company-id': this.config.companyId,
            'content-type': 'application/json'
        };
    }

    _villageHeaders() {
        this._assertCredentials(['companyId']);
        return {
            'company-id': this.config.companyId,
            'content-type': 'application/json'
        };
    }

    _shipmentAuthEmail() {
        // Prefer explicit shipment override first, then account username.
        // Some OTE tenants authenticate `/ship/request/by-email` with username-style handles,
        // while `LOGESTECHS_EMAIL` may be unset or stale.
        return this._firstNonEmpty(this.config.shipmentEmail, this.config.username, this.config.email);
    }

    _shipmentAuthPassword() {
        return this._firstNonEmpty(this.config.shipmentPassword, this.config.password);
    }

    _fulfillmentHeaders() {
        this._assertCredentials(['companyId', 'username', 'password']);
        return {
            'company-id': this.config.companyId,
            username: this.config.username,
            password: this.config.password,
            'content-type': 'application/json'
        };
    }

    _safeString(value) {
        if (value == null) return undefined;
        const normalized = String(value).trim();
        if (!normalized) return undefined;
        if (['null', 'undefined', 'n/a', 'na'].includes(normalized.toLowerCase())) return undefined;
        return normalized;
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
        const sender = shipment.sender || shipment.origin || {};
        const receiver = shipment.receiver || shipment.destination || {};

        const quantity = Number(parcel.quantity || shipment.totalBoxes || 1);
        const pkg = {
            piecesCount: quantity,
            quantity,
            weight: Number(weightValue || 0),
            length: Number(dimensions.length || parcel.length || 0),
            width: Number(dimensions.width || parcel.width || 0),
            height: Number(dimensions.height || parcel.height || 0),
            description: this._firstNonEmpty(parcel.description, shipment.description, shipment.commodity),
            notes: this._firstNonEmpty(shipment.notes, shipment.specialInstructions),
            invoiceNumber: this._firstNonEmpty(shipment.invoiceNumber, shipment.reference, shipment.trackingNumber),
            senderName: this._firstNonEmpty(sender.contactPerson, sender.name, shipment.customer?.name),
            senderPhone: this._firstNonEmpty(sender.phone, sender.phoneNumber, sender.mobile),
            receiverName: this._firstNonEmpty(receiver.contactPerson, receiver.name, shipment.customer?.name),
            receiverPhone: this._firstNonEmpty(receiver.phone, receiver.phoneNumber, receiver.mobile),
            serviceType: this._firstNonEmpty(shipment.serviceType, shipment.serviceCode, 'STANDARD'),
            shipmentType: this._firstNonEmpty(shipment.shipmentType, 'REGULAR'),
            cod: String(Number(shipment.codAmount ?? shipment.cod ?? 0))
        };

        return Object.fromEntries(Object.entries(pkg).filter(([, value]) => value !== undefined && value !== null && value !== ''));
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

    _extractTrackingEvents(raw = {}) {
        if (Array.isArray(raw?.events) && raw.events.length > 0) {
            return raw.events.map((event = {}) => ({
                statusCode: event.statusCode || event.status || raw?.status || raw?.enStatus,
                description: event.description || event.message || event.enStatus || event.arabicName || event.arStatus || raw?.enStatus || raw?.status,
                timestamp: event.timestamp || event.date || event.deliveryDate || event.createdDate || raw?.lastStatusDate || raw?.createdDate,
                location: event.location || event.city || event.nextDestination || raw?.nextDestination || raw?.destinationCity || raw?.destinationVillage || null
            }));
        }

        const route = Array.isArray(raw?.deliveryRoute) ? raw.deliveryRoute : [];
        if (route.length > 0) {
            return route.map((event = {}) => ({
                statusCode: event.status || event.typeKey || event.name || raw?.status,
                description: event.arabicName || event.name || raw?.enStatus || raw?.status || 'Carrier update',
                timestamp: event.deliveryDate || event.timestamp || raw?.lastStatusDate || raw?.createdDate,
                location: event.location || event.city || raw?.nextDestination || raw?.destinationCity || raw?.destinationVillage || null
            }));
        }

        return [];
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

    _summarizeProviderBody(payload) {
        if (!payload) return null;
        if (typeof payload === 'string') return payload;

        const sanitized = this._sanitizeForLogs(payload);
        const serialized = JSON.stringify(sanitized);
        if (!serialized || serialized === '{}' || serialized === '[]') return null;
        return serialized.length > 300 ? `${serialized.slice(0, 300)}...` : serialized;
    }

    _extractProviderMessage(payload) {
        if (!payload) return null;
        if (typeof payload === 'string') return payload;
        if (typeof payload?.message === 'string') return payload.message;
        if (typeof payload?.detail === 'string') return payload.detail;
        if (typeof payload?.error === 'string') return payload.error;
        if (typeof payload?.title === 'string') return payload.title;
        if (typeof payload?.reason === 'string') return payload.reason;
        if (typeof payload?.description === 'string') return payload.description;
        if (typeof payload?.data?.message === 'string') return payload.data.message;

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
                headers: this._villageHeaders(),
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
        const extractedProviderMessage = this._extractProviderMessage(upstreamBody);
        const fallbackProviderMessage = error?.response?.statusText || error?.message;
        let upstreamMessage = extractedProviderMessage || fallbackProviderMessage;

        if (!upstreamMessage) {
            upstreamMessage = `Provider request failed with status ${statusCode}`;
        }

        if (/^unknown error$/i.test(String(upstreamMessage).trim())) {
            const bodySummary = this._summarizeProviderBody(upstreamBody);
            upstreamMessage = bodySummary
                ? `Unknown error (status ${statusCode}) - ${bodySummary}`
                : `Unknown error (status ${statusCode})`;
        }

        const isCredentialError = /البريد الالكتروني او كلمة المرور غير صحيحة|incorrect email or password|invalid credentials/i
            .test(String(upstreamMessage || ''));
        const normalizedMessage = isCredentialError
            ? 'OTE authentication failed. Verify required credentials LOGESTECHS_COMPANY_ID, LOGESTECHS_USERNAME, LOGESTECHS_PASSWORD. Optional shipment overrides: LOGESTECHS_SHIPMENT_EMAIL, LOGESTECHS_SHIPMENT_PASSWORD.'
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
        if (!this._shipmentAuthPassword()) errors.push('password is required');
        if (!this._shipmentAuthEmail()) errors.push('email or username is required');

        return errors;
    }

    async getRates() {
        return [];
    }

    async createShipment(normalizedShipment = {}) {
        try {
            this._assertCredentials(['companyId']);
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

            const shipmentEmail = this._shipmentAuthEmail();
            if (!shipmentEmail) {
                const err = new Error('Validation Failed: email or username is required for LogesTechs shipment create');
                err.statusCode = 400;
                throw err;
            }
            const shipmentPassword = this._shipmentAuthPassword();
            if (!shipmentPassword) {
                const err = new Error('Validation Failed: password is required for LogesTechs shipment create');
                err.statusCode = 400;
                throw err;
            }

            const packagePayload = this._toPackagePayload(normalizedShipment);
            const shipmentType = this._firstNonEmpty(normalizedShipment.shipmentType, packagePayload.shipmentType, 'REGULAR') || 'REGULAR';
            const serviceType = this._firstNonEmpty(normalizedShipment.serviceType, normalizedShipment.serviceCode, packagePayload.serviceType, 'STANDARD') || 'STANDARD';
            const payload = {
                email: shipmentEmail,
                password: shipmentPassword,
                pkgUnitType: 'METRIC',
                shipmentType,
                serviceType,
                model: {
                    shipmentType,
                    serviceType
                },
                pkg: {
                    ...packagePayload,
                    shipmentType: this._firstNonEmpty(packagePayload.shipmentType, shipmentType, 'REGULAR') || 'REGULAR',
                    serviceType: this._firstNonEmpty(packagePayload.serviceType, serviceType, 'STANDARD') || 'STANDARD'
                },
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
            this._assertCredentials(['companyId']);
            const response = await this.shipmentClient.get('/addresses/villages', {
                headers: this._villageHeaders(),
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
            this._assertCredentials(['companyId']);
            if (!shipmentId) {
                const err = new Error('Validation Failed: shipmentId required for cancellation');
                err.statusCode = 400;
                throw err;
            }

            const body = {
                email: email || this._shipmentAuthEmail(),
                password: this._shipmentAuthPassword()
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
        const events = this._extractTrackingEvents(data);

        return {
            carrierCode: this.code,
            trackingNumber,
            status: data?.status || data?.currentStatus || data?.enStatus || 'UNKNOWN',
            description: data?.description || data?.message || data?.enStatus || 'No status description',
            events
        };
    }

    _mapFulfillmentProductsInput(products = []) {
        const list = Array.isArray(products)
            ? products
            : (Array.isArray(products?.list) ? products.list : []);

        return {
            list: list.map((item = {}) => ({
                externalId: item.externalId ?? null,
                name: this._safeString(item.name) || '',
                sku: this._safeString(item.sku) || '',
                isExpiryBlock: Boolean(item.isExpiryBlock),
                barcode: this._safeString(item.barcode) || '',
                categoryId: item.categoryId ?? null,
                price: Number(item.price || 0),
                length: Number(item.length || 0),
                width: Number(item.width || 0),
                height: Number(item.height || 0),
                weight: Number(item.weight || 0),
                description: this._safeString(item.description) || '',
                imageUrl: this._safeString(item.imageUrl) || '',
                quantity: Number(item.quantity || 0)
            }))
        };
    }

    _mapFulfillmentOrderPayload(orderPayload = {}) {
        const receiverAddress = orderPayload.receiverAddress || {};
        return {
            receiverName: this._safeString(orderPayload.receiverName) || '',
            receiverPhone: this._safeString(orderPayload.receiverPhone) || '',
            receiverPhone2: this._safeString(orderPayload.receiverPhone2) || '',
            receiverAddress: {
                village: this._safeString(receiverAddress.village) || '',
                city: this._safeString(receiverAddress.city) || '',
                region: this._safeString(receiverAddress.region) || '',
                addressLine1: this._safeString(receiverAddress.addressLine1) || '',
                addressLine2: this._safeString(receiverAddress.addressLine2) || ''
            },
            notes: this._safeString(orderPayload.notes) || '',
            weight: Number(orderPayload.weight || 1),
            receiverBusinessName: this._safeString(orderPayload.receiverBusinessName) || '',
            shipmentType: this._safeString(orderPayload.shipmentType || 'REGULAR'),
            codCollectionMethod: this._safeString(orderPayload.codCollectionMethod || 'PREPAID'),
            cod: this._safeString(orderPayload.cod ?? '0'),
            cost: Number(orderPayload.cost || 0),
            items: Array.isArray(orderPayload.items)
                ? orderPayload.items.map((item = {}) => ({
                    externalId: item.externalId ?? null,
                    productId: item.productId ?? null,
                    sku: this._safeString(item.sku) || '',
                    price: Number(item.price || 0),
                    quantity: Number(item.quantity || 0)
                }))
                : [],
            invoiceNumber: this._safeString(orderPayload.invoiceNumber) || ''
        };
    }

    async addOrUpdateProducts(products = []) {
        try {
            this._assertCredentials();
            const payload = this._mapFulfillmentProductsInput(products);
            const response = await this.fulfillmentClient.post('/public/fulfillment/product/bulk', payload, {
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
            const payload = this._mapFulfillmentOrderPayload(orderPayload);
            const response = await this.fulfillmentClient.post('/public/fulfillment/order', payload, {
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
