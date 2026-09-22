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
    INTERNAL: {
        STD: 'Internal Standard'
    },
    FEDEX: {
        P: 'FedEx Priority'
    },
    MANUAL: {
        label: 'Manual Carrier',
        services: [{ code: null, name: 'Manual Shipment' }]
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

    if (carrier === 'INTERNAL') {
        return SERVICE_LABELS.INTERNAL[normalizeService(serviceCode) || 'STD'];
    }

    if (!serviceCode) {
        return 'Any Available Service';
    }

    const service = normalizeService(serviceCode);
    return SERVICE_LABELS[carrier]?.[service] || service;
};

const normalizeShippingAccess = (value = {}) => {
    if (value.mode === 'manual' || String(value.carrierCode || value.preferredCarrier || '').toUpperCase() === 'MANUAL') {
        return {
            mode: 'manual',
            carrierCode: 'MANUAL',
            serviceCode: null,
            serviceName: value.serviceName || 'Manual Shipment'
        };
    }

    const carrierCode = normalizeCarrier(value.carrierCode || value.preferredCarrier);

    if (carrierCode === 'INTERNAL') {
        const serviceCode = normalizeService(value.serviceCode || value.defaultServiceCode) || 'STD';
        return {
            mode: 'internal',
            carrierCode: 'INTERNAL',
            serviceCode,
            serviceName: value.serviceName || getServiceName('INTERNAL', serviceCode)
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

    const allowedCarriers = Array.isArray(policy.allowedCarriers) && policy.allowedCarriers.length > 0
        ? policy.allowedCarriers
        : (user?.organization?.allowedCarriers?.allowed || []);

    if (allowedCarriers.length === 1) {
        return normalizeShippingAccess({
            carrierCode: allowedCarriers[0],
            serviceCode: policy.serviceCode || policy.defaultServiceCode || user?.organization?.allowedCarriers?.defaultServiceCode || null
        });
    }

    return normalizeShippingAccess({
        carrierCode: user?.carrierConfig?.preferredCarrier || user?.organization?.allowedCarriers?.defaultCarrier || DEFAULT_CARRIER,
        serviceCode: user?.carrierConfig?.serviceCode || user?.organization?.allowedCarriers?.defaultServiceCode || null
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

    if (assignedAccess.mode === 'manual' || assignedAccess.carrierCode === 'MANUAL') {
        if (requestedService) {
            const err = new Error('Manual shipments does not allow a carrier service code.');
            err.statusCode = 403;
            throw err;
        }
        return;
    }

    if (assignedAccess.mode === 'internal') {
        if (requestedService) {
            const err = new Error('Internal shipments do not allow a carrier service code.');
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
        return [{ serviceCode: null, serviceName: 'Manual Shipment' }];
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
