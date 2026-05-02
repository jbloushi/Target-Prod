const CarrierFactory = require('./CarrierFactory');

const DEFAULT_CARRIER = 'DGR';
const DEFAULT_SERVICE = null;

const SERVICE_LABELS = {
    DGR: {
        P: 'DHL Express Worldwide',
        Y: 'DHL Express 12:00',
        H: 'DHL Economy Select'
    },
    DHL: {
        P: 'DHL Express Worldwide',
        Y: 'DHL Express 12:00',
        H: 'DHL Economy Select'
    },
    ARAMEX: {
        P: 'Aramex Priority'
    },
    OTE: {
        STD: 'OTE Standard'
    },
    LOGESTECHS: {
        STD: 'OTE Standard'
    },
    FEDEX: {
        P: 'FedEx Priority'
    },
    MANUAL: {
        MANUAL: 'Manual Shipment'
    }
};

const getAvailableCarrierCodes = () => CarrierFactory
    .getAvailableCarriers()
    .map((carrier) => carrier.code.toUpperCase());

const normalizeCarrier = (carrierCode) => {
    const normalized = String(carrierCode || DEFAULT_CARRIER).toUpperCase();
    if (normalized === 'LOGESTECHS') return 'OTE';
    return normalized;
};

const normalizeService = (serviceCode) => {
    if (serviceCode == null || serviceCode === '') return null;
    return String(serviceCode).toUpperCase();
};

const getServiceName = (carrierCode, serviceCode) => {
    const carrier = normalizeCarrier(carrierCode);

    if (carrier === 'MANUAL') {
        return 'Manual Shipment';
    }

    if (!serviceCode) {
        return 'Any Available Service';
    }

    const service = normalizeService(serviceCode);
    return SERVICE_LABELS[carrier]?.[service] || service;
};

const normalizeShippingAccess = (value = {}) => {
    const carrierCode = normalizeCarrier(value.carrierCode || value.preferredCarrier);
    const isManual = value.mode === 'manual' || carrierCode === 'MANUAL';

    if (isManual) {
        return {
            mode: 'manual',
            carrierCode: 'MANUAL',
            serviceCode: null,
            serviceName: 'Manual Shipment'
        };
    }

    const serviceCode = normalizeService(value.serviceCode || value.defaultServiceCode);
    return {
        mode: 'carrier',
        carrierCode,
        serviceCode,
        serviceName: value.serviceName || getServiceName(carrierCode, serviceCode)
    };
};

const getAssignedShippingAccess = (user) => {
    const policy = user?.agentPolicy || {};

    if (policy.shippingAccess) {
        return normalizeShippingAccess(policy.shippingAccess);
    }

    const allowedCarriers = Array.isArray(policy.allowedCarriers) ? policy.allowedCarriers : [];
    if (allowedCarriers.length === 1) {
        return normalizeShippingAccess({
            carrierCode: allowedCarriers[0],
            serviceCode: policy.serviceCode || policy.defaultServiceCode || null
        });
    }

    return normalizeShippingAccess({
        carrierCode: user?.carrierConfig?.preferredCarrier || DEFAULT_CARRIER,
        serviceCode: user?.carrierConfig?.serviceCode || null
    });
};

const assertRequestedAccessAllowed = (assignedAccess, requested = {}) => {
    const requestedCarrier = requested.carrierCode ? normalizeCarrier(requested.carrierCode) : null;
    const requestedService = requested.serviceCode ? normalizeService(requested.serviceCode) : null;

    if (requestedCarrier && requestedCarrier !== assignedAccess.carrierCode) {
        const err = new Error(`This account is assigned to ${assignedAccess.serviceName}. Requested carrier ${requestedCarrier} is not allowed.`);
        err.statusCode = 403;
        throw err;
    }

    if (assignedAccess.mode === 'manual') {
        if (requestedService) {
            const err = new Error('Manual Shipment does not allow a carrier service code.');
            err.statusCode = 403;
            throw err;
        }
        return;
    }

    if (assignedAccess.serviceCode && requestedService && requestedService !== assignedAccess.serviceCode) {
        const err = new Error(`This account is assigned to ${assignedAccess.serviceName}. Requested service ${requestedService} is not allowed.`);
        err.statusCode = 403;
        throw err;
    }
};

const shouldEnforceAssignedAccess = (actor, targetUser) => {
    const role = actor?.role;
    if (!role) return true;

    if (['admin', 'manager', 'accounting', 'staff'].includes(role)) {
        return Boolean(targetUser && targetUser.id !== actor.id);
    }

    return true;
};

const getServiceOptions = (carrierCode) => {
    const carrier = normalizeCarrier(carrierCode);

    if (carrier === 'MANUAL') {
        return [{
            serviceCode: null,
            serviceName: 'Manual Shipment'
        }];
    }

    return Object.entries(SERVICE_LABELS[carrier] || {})
        .map(([serviceCode, serviceName]) => ({
            serviceCode,
            serviceName
        }));
};

module.exports = {
    DEFAULT_CARRIER,
    DEFAULT_SERVICE,
    SERVICE_LABELS,
    getAvailableCarrierCodes,
    normalizeCarrier,
    normalizeService,
    normalizeShippingAccess,
    getAssignedShippingAccess,
    assertRequestedAccessAllowed,
    shouldEnforceAssignedAccess,
    getServiceOptions,
    getServiceName
};
