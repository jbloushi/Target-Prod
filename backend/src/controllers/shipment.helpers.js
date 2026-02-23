/**
 * Shipment Controller — Shared Helpers
 *
 * Utility functions shared across all shipment sub-controllers.
 */
const CarrierFactory = require('../services/CarrierFactory');
const logger = require('../utils/logger');

const DEFAULT_MARKUP = { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };

const hasMarkupShape = (markup) => Boolean(markup && typeof markup === 'object' && markup.type);

const resolveEffectiveCarrierPolicy = ({ targetUser, carrierCode, availableCarrierCodes }) => {
    const normalizedCarrier = (carrierCode || '').toUpperCase();
    const org = targetUser?.organization;

    const orgAllowed = Array.isArray(org?.allowedCarriers) && org.allowedCarriers.length > 0
        ? org.allowedCarriers.map((c) => String(c).toUpperCase())
        : availableCarrierCodes;

    const userAllowed = Array.isArray(targetUser?.agentPolicy?.allowedCarriers) && targetUser.agentPolicy.allowedCarriers.length > 0
        ? targetUser.agentPolicy.allowedCarriers.map((c) => String(c).toUpperCase())
        : orgAllowed;

    const effectiveAllowed = orgAllowed.filter((code) => userAllowed.includes(code));

    if (normalizedCarrier && !effectiveAllowed.includes(normalizedCarrier)) {
        const deniedError = new Error(`Carrier ${normalizedCarrier} is not allowed for this account`);
        deniedError.statusCode = 403;
        throw deniedError;
    }

    // 1. Start with System Default
    let markup = DEFAULT_MARKUP;
    let policySource = 'platform_default';

    // 2. Organization Default (WEAKEST Override)
    if (hasMarkupShape(org?.markup)) {
        markup = org.markup;
        policySource = 'org_default';
    }

    // 3. Organization Carrier Specific
    const orgCarrierMarkup = org?.markup?.byCarrier?.[normalizedCarrier];
    if (hasMarkupShape(orgCarrierMarkup)) {
        markup = orgCarrierMarkup;
        policySource = 'org_carrier';
    }

    // 4. User/Client Specific (STRONGEST Override - as per requirement)
    // "We only and always use the user based markup"
    if (hasMarkupShape(targetUser?.markup)) {
        markup = targetUser.markup;
        policySource = 'user_default';
    }

    const agentMarkup = targetUser?.agentPolicy?.markupOverride;
    if (hasMarkupShape(agentMarkup)) {
        markup = agentMarkup;
        policySource = 'agent_default';
    }

    return { effectiveAllowed, markup, policySource };
};

const buildHistoryKey = (event) => {
    const time = event?.timestamp ? new Date(event.timestamp).toISOString() : '';
    const status = event?.status || '';
    const location = event?.location?.formattedAddress || event?.location?.address || event?.location || '';
    return `${status}|${time}|${location}`;
};

const syncCarrierTrackingHistory = async (shipment) => {
    const trackingNumber = shipment?.carrierShipmentId || shipment?.dhlTrackingNumber;
    if (!trackingNumber) return;

    const carrierCode = (shipment?.carrier || shipment?.carrierCode || 'DGR').toUpperCase();
    let carrier;
    try {
        carrier = CarrierFactory.getAdapter(carrierCode);
    } catch (error) {
        logger.warn(`Carrier adapter not available for ${carrierCode}: ${error.message}`);
        return;
    }

    try {
        const tracking = await carrier.getTracking(trackingNumber);
        const events = tracking?.events || [];
        if (events.length === 0) return;

        const existingKeys = new Set(
            shipment.history.map((entry) => buildHistoryKey(entry))
        );

        const fallbackContact = shipment.origin?.contactPerson || 'Carrier';
        const fallbackPhone = shipment.origin?.phone || '0000000';

        let hasUpdates = false;
        events.forEach((event) => {
            const historyEntry = {
                status: event.statusCode || tracking.status || 'in_transit',
                description: event.description || 'Carrier update',
                timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
                location: {
                    formattedAddress: event.location || 'Unknown',
                    city: event.location || undefined,
                    contactPerson: fallbackContact,
                    phone: fallbackPhone
                }
            };
            const key = buildHistoryKey(historyEntry);
            if (!existingKeys.has(key)) {
                shipment.history.push(historyEntry);
                existingKeys.add(key);
                hasUpdates = true;
            }
        });

        if (hasUpdates) {
            shipment.history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            await shipment.save();
        }
    } catch (error) {
        logger.warn(`Failed to sync carrier tracking for ${shipment.trackingNumber}: ${error.message}`);
    }
};

const calculateEstimatedDelivery = () => {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return deliveryDate;
};

function calculateDistance(point1, point2) {
    if (!point1 || !point2 || !Array.isArray(point1) || !Array.isArray(point2) || point1.length < 2 || point2.length < 2) {
        return 0;
    }
    const R = 6371;
    const dLat = toRad(point2[1] - point1[1]);
    const dLon = toRad(point2[0] - point1[0]);
    const lat1 = toRad(point1[1]);
    const lat2 = toRad(point2[1]);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * Math.PI / 180;
}

const hasCriticalChanges = (original, updates) => {
    if (!updates) return false;

    // 1. Service Code
    if (updates.serviceCode && updates.serviceCode !== original.serviceCode) return true;

    // 2. Dangerous Goods (Simple toggle check)
    if (updates.dangerousGoods) {
        if (updates.dangerousGoods.contains !== original.dangerousGoods?.contains) return true;
    }

    // 3. Parcels (Dimensions/Weight)
    if (updates.parcels) {
        if (updates.parcels.length !== original.parcels.length) return true;
        for (let i = 0; i < updates.parcels.length; i++) {
            const up = updates.parcels[i];
            const op = original.parcels[i];
            if (Number(up.weight?.value || up.weight) !== Number(op.weight?.value || op.weight)) return true;
            // Check dims logic if needed, but weight is primary cost driver usually
            // simplistic check:
            if (JSON.stringify(up.dimensions) !== JSON.stringify(op.dimensions)) return true;
        }
    }

    // 4. Items (Quantity/Weight)
    if (updates.items) {
        if (updates.items.length !== original.items.length) return true;
        // Deep verification might be needed, but checking weight/quantity is usually enough
        const totalWeightOriginal = original.items.reduce((sum, i) => sum + (Number(i.weight || 0) * Number(i.quantity || 1)), 0);
        const totalWeightUpdate = updates.items.reduce((sum, i) => sum + (Number(i.weight || 0) * Number(i.quantity || 1)), 0);
        if (Math.abs(totalWeightOriginal - totalWeightUpdate) > 0.001) return true;
    }

    // 5. Origin/Destination (Country/City) - Primary Drivers
    if (updates.origin) {
        if ((updates.origin.countryCode || original.origin.countryCode) !== original.origin.countryCode) return true;
        if ((updates.origin.city || original.origin.city) !== original.origin.city) return true;
    }
    if (updates.destination) {
        if ((updates.destination.countryCode || original.destination.countryCode) !== original.destination.countryCode) return true;
        if ((updates.destination.city || original.destination.city) !== original.destination.city) return true;
    }

    return false;
};


module.exports = {
    DEFAULT_MARKUP,
    hasMarkupShape,
    resolveEffectiveCarrierPolicy,
    buildHistoryKey,
    syncCarrierTrackingHistory,
    calculateEstimatedDelivery,
    calculateDistance,
    toRad,
    hasCriticalChanges
};

