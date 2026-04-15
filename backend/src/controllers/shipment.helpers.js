/**
 * Shipment Controller — Shared Helpers
 *
 * Utility functions shared across all shipment sub-controllers.
 */
const CarrierFactory = require('../services/CarrierFactory');
const logger = require('../utils/logger');
const { normalizeStatus, isStatusAhead } = require('../constants/statusConstants');

const DEFAULT_MARKUP = { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };

const hasMarkupShape = (markup) => Boolean(markup && typeof markup === 'object' && markup.type);

/**
 * Resolves the effective carrier policy (allowed carriers and markup) 
 * for a specific user/organization context.
 */
const resolveEffectiveCarrierPolicy = ({ targetUser, carrierCode, availableCarrierCodes }) => {
    const normalizedCarrier = (carrierCode || '').toUpperCase();
    const org = targetUser?.organization;
    const assignedCarrier = targetUser?.agentPolicy?.shippingAccess?.carrierCode
        ? String(targetUser.agentPolicy.shippingAccess.carrierCode).toUpperCase()
        : null;

    if (assignedCarrier) {
        if (normalizedCarrier && normalizedCarrier !== assignedCarrier) {
            const deniedError = new Error(`Carrier ${normalizedCarrier} is not allowed for this account`);
            deniedError.statusCode = 403;
            throw deniedError;
        }

        return {
            effectiveAllowed: [assignedCarrier],
            markup: hasMarkupShape(targetUser?.agentPolicy?.markupOverride)
                ? targetUser.agentPolicy.markupOverride
                : (hasMarkupShape(org?.markup) ? org.markup : DEFAULT_MARKUP),
            policySource: hasMarkupShape(targetUser?.agentPolicy?.markupOverride)
                ? 'agent_default'
                : (hasMarkupShape(org?.markup) ? 'org_default' : 'platform_default')
        };
    }

    // 1. Resolve Allowed Carriers (Hierarchy: User Agent Policy -> Org Policy -> All)
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

    // 2. Resolve Markup (Hierarchy: Agent Policy -> User Default -> Org Carrier -> Org Default -> Platform Default)
    let markup = DEFAULT_MARKUP;
    let policySource = 'platform_default';

    if (hasMarkupShape(org?.markup)) {
        markup = org.markup;
        policySource = 'org_default';
    }

    const orgCarrierMarkup = org?.markup?.byCarrier?.[normalizedCarrier];
    if (hasMarkupShape(orgCarrierMarkup)) {
        markup = orgCarrierMarkup;
        policySource = 'org_carrier';
    }

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

/**
 * Creates a unique string key for a history event to prevent duplicates
 */
const buildHistoryKey = (event) => {
    const time = event?.timestamp ? new Date(event.timestamp).toISOString() : '';
    const status = event?.status || '';
    const location = event?.location?.formattedAddress || event?.location?.address || event?.location || '';
    return `${status}|${time}|${location}`;
};

/**
 * Fetches latest tracking from carrier and returns updated history/status.
 * Note: Persistence (Prisma update) must be handled by the caller.
 */
const syncCarrierTrackingHistory = async (shipment) => {
    const trackingNumber = shipment?.carrierShipmentId || shipment?.dhlTrackingNumber;
    if (!trackingNumber) return null;

    const carrierCode = (shipment?.carrier || shipment?.carrierCode || 'DGR').toUpperCase();
    let carrier;
    try {
        carrier = CarrierFactory.getAdapter(carrierCode);
    } catch (error) {
        logger.warn(`Carrier adapter not available for ${carrierCode}: ${error.message}`);
        return null;
    }

    try {
        const tracking = await carrier.getTracking(trackingNumber);
        const events = tracking?.events || [];
        if (events.length === 0) return null;

        const currentHistory = Array.isArray(shipment.history) ? shipment.history : [];
        const existingKeys = new Set(
            currentHistory.map((entry) => buildHistoryKey(entry))
        );

        const fallbackContact = shipment.origin?.contactPerson || 'Carrier';
        const fallbackPhone = shipment.origin?.phone || '0000000';

        let hasUpdates = false;
        let highestCarrierStatus = null;
        const newHistory = [...currentHistory];
        let currentStatus = shipment.status;

        events.forEach((event) => {
            const rawStatus = event.statusCode || tracking.status || 'transit';
            const normalizedStatus = normalizeStatus(rawStatus);

            const historyEntry = {
                status: normalizedStatus,
                description: event.description || 'Carrier update',
                source: 'carrier',
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
                newHistory.push(historyEntry);
                existingKeys.add(key);
                hasUpdates = true;
            }

            if (!highestCarrierStatus || isStatusAhead(highestCarrierStatus, normalizedStatus)) {
                highestCarrierStatus = normalizedStatus;
            }
        });

        if (highestCarrierStatus && isStatusAhead(currentStatus, highestCarrierStatus)) {
            logger.info(`Detected status promotion for ${shipment.trackingNumber}: ${currentStatus} -> ${highestCarrierStatus}`);
            currentStatus = highestCarrierStatus;
            hasUpdates = true;
        }

        if (hasUpdates) {
            newHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return {
                history: newHistory,
                status: currentStatus
            };
        }
        
        return null;
    } catch (error) {
        logger.warn(`Failed to sync carrier tracking for ${shipment.trackingNumber}: ${error.message}`);
        return null;
    }
};

const calculateEstimatedDelivery = () => {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return deliveryDate;
};

const hasCriticalChanges = (original, updates) => {
    if (!updates) return false;
    if (updates.serviceCode && updates.serviceCode !== original.serviceCode) return true;

    if (updates.dangerousGoods) {
        if (updates.dangerousGoods.contains !== original.dangerousGoods?.contains) return true;
    }

    if (updates.parcels) {
        if (updates.parcels.length !== original.parcels.length) return true;
        for (let i = 0; i < updates.parcels.length; i++) {
            const up = updates.parcels[i];
            const op = original.parcels[i];
            if (Number(up.weight) !== Number(op.weight)) return true;
            if (JSON.stringify(up.dimensions) !== JSON.stringify(op.dimensions)) return true;
        }
    }

    if (updates.items) {
        if (updates.items.length !== original.items.length) return true;
        const totalWeightOriginal = original.items.reduce((sum, i) => sum + (Number(i.weight || 0) * Number(i.quantity || 1)), 0);
        const totalWeightUpdate = updates.items.reduce((sum, i) => sum + (Number(i.weight || 0) * Number(i.quantity || 1)), 0);
        if (Math.abs(totalWeightOriginal - totalWeightUpdate) > 0.001) return true;
    }

    if (updates.origin) {
        if (updates.origin.countryCode && updates.origin.countryCode !== original.origin.countryCode) return true;
        if (updates.origin.city && updates.origin.city !== original.origin.city) return true;
    }
    if (updates.destination) {
        if (updates.destination.countryCode && updates.destination.countryCode !== original.destination.countryCode) return true;
        if (updates.destination.city && updates.destination.city !== original.destination.city) return true;
    }

    return false;
};

const isManualShipment = (shipment) => {
    return String(shipment?.carrierCode || '').toUpperCase() === 'MANUAL'
        || shipment?.manualShipment === true;
};

const getAllowedStatusUpdates = (user, shipment) => {
    if (!user || !shipment) return [];

    const role = user.role;
    const operationalStatuses = [
        'draft',
        'pending',
        'booked',
        'ready_for_pickup',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'exception',
        'cancelled'
    ];

    if (['admin', 'manager', 'accounting'].includes(role)) {
        return operationalStatuses;
    }

    return [];
};

const canUpdateShipmentStatus = (user, shipment, nextStatus) => {
    return getAllowedStatusUpdates(user, shipment).includes(nextStatus);
};

module.exports = {
    DEFAULT_MARKUP,
    hasMarkupShape,
    resolveEffectiveCarrierPolicy,
    buildHistoryKey,
    syncCarrierTrackingHistory,
    calculateEstimatedDelivery,
    hasCriticalChanges,
    isManualShipment,
    getAllowedStatusUpdates,
    canUpdateShipmentStatus
};

