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
    const time = event?.timestamp ? new Date(event.timestamp) : null;
    // Bucket to the minute — DHL re-emits the same checkpoint with sub-minute jitter
    const minuteBucket = time && !Number.isNaN(time.getTime())
        ? Math.floor(time.getTime() / 60000)
        : '';
    const status = event?.status || '';
    const description = (event?.description || '').trim().toLowerCase();
    const location = event?.location?.formattedAddress || event?.location?.address || event?.location || '';
    return `${status}|${description}|${minuteBucket}|${location}`;
};

const normalizeText = (value = '') => String(value)
    .toLowerCase()
    .trim()
    .replace(/[.,|()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ');

const canonicalStatusFromDescription = (status, description) => {
    const text = normalizeText(`${status || ''} ${description || ''}`);
    if (text.includes('shipment draft created') || text.includes('draft created')) return 'created';
    if (text.includes('shipment picked up')) return 'pickup';
    if (text.includes('arrived at dhl sort facility') || text.startsWith('arrived at')) return 'arrived_facility';
    if (text.includes('processed at')) return 'processed';
    if (text.includes('shipment has departed from a dhl facility') || text.includes('has departed from a dhl facility')) return 'departed_facility';
    if (text.includes('customs clearance status updated')) return 'customs_update';
    if (text.includes('shipment is on hold') || text.endsWith(' on hold')) return 'hold';
    return normalizeText(status || description || 'updated').replace(/\s+/g, '_');
};

const normalizeLocationLabel = (location) => {
    const text = normalizeText(location).toUpperCase();
    if (!text) return 'UNKNOWN';
    if (text.includes('KUWAIT')) return 'KUWAIT-KW';
    if (text.includes('ABU DHABI')) return 'ABU DHABI-AE';
    if (text.includes('DUBAI')) return 'DUBAI-AE';
    if (text.includes('CINCINNATI') || text.includes('OHIO')) return 'CINCINNATI-US';
    if (text.includes('ERLANGER') || text.includes('KENTUCKY')) return 'ERLANGER-US';
    return text.replace(/UNITED ARAB EMIRATES/g, 'AE').replace(/\s+/g, ' ').trim();
};

const buildDisplayHistory = (events = [], options = {}) => {
    const providedOriginLocation = normalizeLocationLabel(options?.originLocation || '');
    const movementStatuses = new Set(['created', 'pickup', 'arrived_facility', 'processed', 'departed_facility']);
    const lowSignalStatuses = new Set(['customs_update', 'hold']);
    const originReplayStatuses = new Set(['pickup', 'arrived_facility', 'processed', 'customs_update', 'hold']);
    const prepared = (Array.isArray(events) ? events : []).map((event) => {
        const timestamp = event?.timestamp ? new Date(event.timestamp) : null;
        if (!timestamp || Number.isNaN(timestamp.getTime())) return null;
        const location = event?.location?.formattedAddress || event?.location?.address || event?.location?.city || event?.location || '';
        const canonicalStatus = canonicalStatusFromDescription(event?.status, event?.description);
        const dayBucket = timestamp.toISOString().slice(0, 10);
        return {
            ...event,
            timestamp: timestamp.toISOString(),
            canonicalStatus,
            normalizedLocation: normalizeLocationLabel(location),
            dayBucket
        };
    }).filter(Boolean).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const byKey = new Map();
    prepared.forEach((event) => {
        const key = `${event.canonicalStatus}|${event.normalizedLocation}|${event.dayBucket}`;
        const prior = byKey.get(key);
        if (!prior) {
            byKey.set(key, { ...event, collapsedCount: 1 });
        } else {
            prior.collapsedCount += 1;
        }
    });

    const displayEvents = Array.from(byKey.values())
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .filter((event) => movementStatuses.has(event.canonicalStatus) || lowSignalStatuses.has(event.canonicalStatus))
        .map(({ dayBucket, ...event }) => event);

    const inferredOriginLocation = displayEvents.find((entry) => entry.canonicalStatus === 'pickup')?.normalizedLocation
        || displayEvents.find((entry) => entry.canonicalStatus === 'departed_facility')?.normalizedLocation
        || null;
    const originLocation = providedOriginLocation !== 'UNKNOWN' ? providedOriginLocation : inferredOriginLocation;
    const departedAtOrigin = originLocation
        ? displayEvents.find((entry) => entry.canonicalStatus === 'departed_facility' && entry.normalizedLocation === originLocation)
        : null;
    const movedBeyondOrigin = originLocation
        ? displayEvents.find((entry) => (
            entry.normalizedLocation !== originLocation
            && entry.canonicalStatus !== 'created'
            && movementStatuses.has(entry.canonicalStatus)
        ))
        : null;
    const leftOriginAt = [departedAtOrigin, movedBeyondOrigin]
        .filter(Boolean)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
    const seenLowSignalLocations = new Set();
    let hasOriginPickup = false;

    return displayEvents.filter((event) => {
        if (originLocation && event.normalizedLocation === originLocation) {
            if (event.canonicalStatus === 'pickup') {
                if (hasOriginPickup) return false;
                hasOriginPickup = true;
            }

            if (
                leftOriginAt
                && originReplayStatuses.has(event.canonicalStatus)
                && new Date(event.timestamp) > new Date(leftOriginAt.timestamp)
            ) {
                return false;
            }
        }

        if (lowSignalStatuses.has(event.canonicalStatus)) {
            if (seenLowSignalLocations.has(event.normalizedLocation)) return false;
            seenLowSignalLocations.add(event.normalizedLocation);
        }

        return true;
    });
};

/**
 * Normalizes and compacts history events across all carriers.
 * Keeps milestone diversity while collapsing repetitive jitter/noise updates.
 */
const compactHistory = (history = []) => {
    if (!Array.isArray(history) || history.length === 0) return [];

    const prepared = history
        .filter(Boolean)
        .map((event) => {
            const timestamp = event?.timestamp ? new Date(event.timestamp) : null;
            const locationRaw = event?.location?.formattedAddress
                || event?.location?.address
                || event?.location?.city
                || event?.location
                || '';
            const statusRaw = typeof event?.status === 'object'
                ? (event?.status?.status || event?.status?.code || '')
                : (event?.status || '');

            return {
                ...event,
                status: String(statusRaw).trim().toLowerCase(),
                description: String(event?.description || '').trim(),
                source: String(event?.source || 'platform').trim().toLowerCase(),
                __timestamp: (timestamp && !Number.isNaN(timestamp.getTime())) ? timestamp : new Date(0),
                __minuteBucket: (timestamp && !Number.isNaN(timestamp.getTime()))
                    ? Math.floor(timestamp.getTime() / 60000)
                    : '',
                // Carrier feeds can replay same checkpoint many times over short windows.
                // Use a wider bucket to collapse noisy repeats while preserving movement transitions.
                __carrierWindowBucket: (timestamp && !Number.isNaN(timestamp.getTime()))
                    ? Math.floor(timestamp.getTime() / (6 * 60 * 60 * 1000))
                    : '',
                __location: String(locationRaw).trim().toLowerCase()
            };
        })
        .sort((a, b) => a.__timestamp.getTime() - b.__timestamp.getTime());

    const byKey = new Map();
    for (const event of prepared) {
        const timeBucket = event.source === 'carrier' ? event.__carrierWindowBucket : event.__minuteBucket;
        const dedupeKey = [
            event.source,
            event.status,
            event.description.toLowerCase(),
            timeBucket,
            event.__location
        ].join('|');

        const prior = byKey.get(dedupeKey);
        if (!prior || event.__timestamp > prior.__timestamp) {
            byKey.set(dedupeKey, event);
        }
    }

    return Array.from(byKey.values())
        .sort((a, b) => a.__timestamp.getTime() - b.__timestamp.getTime())
        .map(({ __timestamp, __minuteBucket, __carrierWindowBucket, __location, ...event }) => event);
};

/**
 * Fetches latest tracking from carrier and returns updated history/status.
 * Note: Persistence (Prisma update) must be handled by the caller.
 */
const syncCarrierTrackingHistory = async (shipment) => {
    const originalHistory = Array.isArray(shipment.history) ? shipment.history : [];
    const compactedOriginalHistory = compactHistory(originalHistory);
    const trackingNumber = shipment?.carrierShipmentId || shipment?.dhlTrackingNumber;
    if (!trackingNumber) {
        if (compactedOriginalHistory.length !== originalHistory.length) {
            return {
                history: compactedOriginalHistory,
                status: shipment.status
            };
        }
        return null;
    }

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
        if (events.length === 0) {
            if (compactedOriginalHistory.length !== originalHistory.length) {
                return {
                    history: compactedOriginalHistory,
                    status: shipment.status
                };
            }
            return null;
        }

        const currentHistory = compactedOriginalHistory;
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

        const compactedHistory = compactHistory(newHistory);
        if (hasUpdates || compactedHistory.length !== currentHistory.length) {
            compactedHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return {
                history: compactedHistory,
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

    const normalizeCodes = (value) => {
        if (!Array.isArray(value)) return [];
        return value
            .map(code => String(code || '').toUpperCase().trim())
            .filter(Boolean)
            .sort();
    };

    const originalOptionalCodes = normalizeCodes(
        original.origin?.optionalServiceCodes
            || (original.pricingSnapshot?.optionalServices || []).map(service => service.serviceCode)
    );
    const updateOptionalCodes = normalizeCodes(updates.optionalServiceCodes);
    if (updates.optionalServiceCodes !== undefined
        && JSON.stringify(updateOptionalCodes) !== JSON.stringify(originalOptionalCodes)) {
        return true;
    }

    const originalInsuredValue = Number(original.origin?.insuredValue ?? original.insuredValue ?? 0);
    const updateInsuredValue = Number(updates.insuredValue ?? originalInsuredValue);
    if (updates.insuredValue !== undefined && Math.abs(updateInsuredValue - originalInsuredValue) > 0.0001) {
        return true;
    }

    if (updates.dangerousGoods) {
        const originalDg = original.dangerousGoods || original.origin?.dangerousGoods || {};
        if (JSON.stringify(updates.dangerousGoods || {}) !== JSON.stringify(originalDg || {})) return true;
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
    buildDisplayHistory,
    canonicalStatusFromDescription,
    normalizeLocationLabel,
    compactHistory,
    syncCarrierTrackingHistory,
    calculateEstimatedDelivery,
    hasCriticalChanges,
    isManualShipment,
    getAllowedStatusUpdates,
    canUpdateShipmentStatus
};
