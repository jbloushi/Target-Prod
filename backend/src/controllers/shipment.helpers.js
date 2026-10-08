/**
 * Shipment Controller — Shared Helpers
 *
 * Utility functions shared across all shipment sub-controllers.
 */
const CarrierFactory = require('../services/CarrierFactory');
const SlaTrackerService = require('../services/slaTracker.service');
const logger = require('../utils/logger');
const { normalizeStatus, isStatusAhead } = require('../constants/statusConstants');
const { getCarrierEventClassification } = require('../constants/statusConstants');

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

        const carrierPricing = targetUser?.carrierConfig?.pricingByCarrier?.[assignedCarrier]
            || targetUser?.agentPolicy?.carrierPricing?.[assignedCarrier];
        if (carrierPricing?.rateCardId || carrierPricing?.pricingModel === 'RATE_CARD') {
            try {
                const RateCardService = require('../services/RateCardService');
                const card = RateCardService.getRateCard(carrierPricing.rateCardId);
                if (card?.pricingMode === 'SELLING_PRICE' || card?.isSellingPrice) {
                    return {
                        effectiveAllowed: [assignedCarrier],
                        markup: { type: 'FLAT', flatValue: 0, percentageValue: 0 },
                        policySource: 'contract_rate_card'
                    };
                }
            } catch (_) {}
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

    const carrierPricing = targetUser?.carrierConfig?.pricingByCarrier?.[normalizedCarrier]
        || targetUser?.agentPolicy?.carrierPricing?.[normalizedCarrier];
    if (carrierPricing?.rateCardId || carrierPricing?.pricingModel === 'RATE_CARD') {
        try {
            const RateCardService = require('../services/RateCardService');
            const card = RateCardService.getRateCard(carrierPricing.rateCardId);
            if (card?.pricingMode === 'SELLING_PRICE' || card?.isSellingPrice) {
                markup = { type: 'FLAT', flatValue: 0, percentageValue: 0 };
                policySource = 'contract_rate_card';
            }
        } catch (_) {}
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

const resolveCarrierTrackingNumber = (shipment = {}) => {
    const barcode = shipment?.dhlTrackingNumber;
    const carrierShipmentId = shipment?.carrierShipmentId;
    const trackingNumber = shipment?.trackingNumber;

    return barcode || carrierShipmentId || trackingNumber || null;
};

const normalizeText = (value = '') => String(value)
    .toLowerCase()
    .trim()
    .replace(/[.,|()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ');

const canonicalStatusFromDescription = (status, description) => {
    const text = normalizeText(`${status || ''} ${description || ''}`);
    if (text.includes('shipment draft created') || text.includes('draft created')) return 'created';
    if (text.includes('shipment picked up') || text.includes('picked up') || text.includes('collected')) return 'pickup';
    if (text.includes('arrived at dhl sort facility') || text.startsWith('arrived at') || text.includes('arrived facility') || text.includes('arrived at operations') || text.includes('sorting hub')) return 'arrived_facility';
    if (text.includes('processed at') || text.includes('transferred to operations')) return 'processed';
    if (text.includes('shipment has departed') || text.includes('departed from') || text.includes('departed facility') || text.includes('departed operations')) return 'departed_facility';
    if (text.includes('customs clearance status updated') || text.includes('customs')) return 'customs_update';
    if (text.includes('delivery champion') || text.includes('out for delivery') || text.includes('doorstep') || text.includes('with courier') || text.includes('with driver')) return 'out_for_delivery';
    if (text.includes('delivered to') || text.includes('shipment delivered') || text.includes('delivered') || text.includes('consignee') || text.includes('proof of delivery') || text === 'dlv') return 'delivered';
    if (text.includes('shipment is on hold') || text.endsWith(' on hold') || text.includes('delivery instructions') || text.includes('exception') || text.includes('delayed')) return 'hold';
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
    const lifecycleStatuses = new Set([
        'draft',
        'pending',
        'booked',
        'ready_for_pickup',
        'updated',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'exception',
        'failed',
        'returned',
        'cancelled'
    ]);
    const originReplayStatuses = new Set(['pickup', 'arrived_facility', 'processed', 'departed_facility', 'customs_update', 'hold']);
    const hasRealCarrierEvents = (Array.isArray(events) ? events : []).some(e => {
        const desc = (e?.description || '').toLowerCase();
        return !desc.includes('manifested under') && !desc.includes('operations gateway') && !desc.includes('synchronized from phenix') && !desc.includes('phenix erp');
    });

    const prepared = (Array.isArray(events) ? events : [])
        .filter((event) => {
            if (!event) return false;
            if (event.source === 'phenix_erp') return false;
            const desc = (event.description || '').toLowerCase();
            const loc = (typeof event.location === 'string' ? event.location : (event.location?.formattedAddress || event.location?.city || '')).toLowerCase();
            if (desc.includes('synchronized from phenix') || desc.includes('phenix erp')) return false;
            if (desc.includes('manifested under') || loc.includes('operations gateway')) return false;
            return true;
        })
        .map((event) => {
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

    // Detect batch replay artifacts: when carrier dumps an entire sequence with identical timestamps
    // across different locations, mark those timestamps as synthetic batch dumps.
    const timestampLocationCount = new Map();
    prepared.forEach((e) => {
        if (!e.timestamp) return;
        const set = timestampLocationCount.get(e.timestamp) || new Set();
        set.add(e.normalizedLocation);
        timestampLocationCount.set(e.timestamp, set);
    });
    const isSyntheticBatchTimestamp = (ts) => {
        const locations = timestampLocationCount.get(ts);
        return locations && locations.size > 1;
    };

    const replayStableStatuses = new Set(['pickup', 'arrived_facility', 'processed', 'departed_facility']);
    const byKey = new Map();
    prepared.forEach((event) => {
        const isBatch = isSyntheticBatchTimestamp(event.timestamp);
        let key = replayStableStatuses.has(event.canonicalStatus)
            ? `${event.canonicalStatus}|${event.normalizedLocation}|${event.dayBucket}`
            : `${event.canonicalStatus}|${event.normalizedLocation}|${event.dayBucket}|${normalizeText(event.description || '')}`;

        // If this event comes from a synthetic batch replay, find any prior entry with the same status and location
        let priorKey = null;
        if (isBatch && replayStableStatuses.has(event.canonicalStatus)) {
            for (const [k, v] of byKey.entries()) {
                if (v.canonicalStatus === event.canonicalStatus && v.normalizedLocation === event.normalizedLocation) {
                    priorKey = k;
                    break;
                }
            }
        }

        const prior = priorKey ? byKey.get(priorKey) : byKey.get(key);
        if (!prior) {
            byKey.set(key, { ...event, collapsedCount: 1 });
        } else {
            prior.collapsedCount += 1;
            // Prefer the earliest scan timestamp for collapsed checkpoints
            if (new Date(event.timestamp) < new Date(prior.timestamp)) {
                prior.timestamp = event.timestamp;
            }
        }
    });

    const displayEvents = Array.from(byKey.values())
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .filter((event) => (
            movementStatuses.has(event.canonicalStatus)
            || lowSignalStatuses.has(event.canonicalStatus)
            || lifecycleStatuses.has(event.canonicalStatus)
        ))
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
                movedBeyondOrigin
                && originReplayStatuses.has(event.canonicalStatus)
                && new Date(event.timestamp) >= new Date(movedBeyondOrigin.timestamp)
            ) {
                return false;
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
            const lowSignalKey = `${event.normalizedLocation}|${event.timestamp?.slice(0, 10) || ''}`;
            if (seenLowSignalLocations.has(lowSignalKey)) return false;
            seenLowSignalLocations.add(lowSignalKey);
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

    const filtered = history.filter(e => {
        if (!e) return false;
        const desc = (e?.description || '').toLowerCase();
        const loc = (typeof e?.location === 'string' ? e.location : (e?.location?.formattedAddress || e?.location?.city || '')).toLowerCase();
        if (desc.includes('manifested under') || loc.includes('operations gateway') || desc.includes('synchronized from phenix') || desc.includes('phenix erp')) return false;
        return true;
    });

    const prepared = filtered
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
                // Use minute bucket for deduplicating instant replay noise without dropping distinct events
                __minuteBucket: (timestamp && !Number.isNaN(timestamp.getTime()))
                    ? Math.floor(timestamp.getTime() / 60000)
                    : '',
                __location: String(locationRaw).trim().toLowerCase()
            };
        })
        .sort((a, b) => a.__timestamp.getTime() - b.__timestamp.getTime());

    const byKey = new Map();
    for (const event of prepared) {
        const timeBucket = event.__minuteBucket;
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
        .map(({ __timestamp, __minuteBucket, __location, ...event }) => event);
};

/**
 * Fetches latest tracking from carrier and returns updated history/status.
 * Note: Persistence (Prisma update) must be handled by the caller.
 */
const syncCarrierTrackingHistory = async (shipment) => {
    const originalHistory = Array.isArray(shipment.history) ? shipment.history : [];
    const compactedOriginalHistory = compactHistory(originalHistory);
    const trackingNumber = resolveCarrierTrackingNumber(shipment);
    if (!trackingNumber) {
        if (compactedOriginalHistory.length !== originalHistory.length) {
            return {
                history: compactedOriginalHistory,
                status: shipment.status
            };
        }
        return null;
    }

    const carrierCode = (shipment?.carrierCode || shipment?.carrier || 'DGR').toUpperCase();
    const isTest = shipment?.pricingSnapshot?.isTest === true || shipment?.pricingSnapshot?.environment === 'test';
    const environment = isTest ? 'test' : (shipment?.pricingSnapshot?.environment || 'production');
    let carrier;
    try {
        carrier = CarrierFactory.getAdapter(carrierCode, { isTest, environment });
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
        const latestKnownCarrierTimestamp = currentHistory
            .filter((entry) => String(entry.source || '').toLowerCase() === 'carrier' && entry.timestamp)
            .reduce((latest, entry) => Math.max(latest, new Date(entry.timestamp).getTime()), 0);
        if (process.env.GEMINI_CLASSIFICATION_ENABLED === 'true') {
            const { classifyNewEvent } = require('../services/geminiClassification.service');
            const ambiguousNewEvents = events.filter((event) => {
                const eventTime = new Date(event.timestamp || 0).getTime();
                const classification = getCarrierEventClassification(event);
                return eventTime > latestKnownCarrierTimestamp && !classification.normalizedStatus;
            });
            await Promise.all(ambiguousNewEvents.map((event) => classifyNewEvent({
                provider: carrierCode,
                trackingNumber,
                rawStatus: event.statusCode || event.status || null,
                description: event.description || '',
                timestamp: event.timestamp || null
            })));
        }
        const existingByKey = new Map(
            currentHistory.map((entry) => [buildHistoryKey(entry), entry])
        );
        const existingKeys = new Set(existingByKey.keys());

        const fallbackContact = shipment.origin?.contactPerson || 'Carrier';
        const fallbackPhone = shipment.origin?.phone || '0000000';

        let hasUpdates = false;
        let highestCarrierStatus = null;
        const newHistory = [...currentHistory];
        let currentStatus = shipment.status;

        const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

        sortedEvents.forEach((event) => {
            const rawStatus = event.statusCode || event.status || event.description || tracking?.status || 'transit';
            let normalizedStatus = normalizeStatus(rawStatus);
            if (normalizedStatus === 'in_transit' && event.description) {
                const descNorm = normalizeStatus(event.description);
                if (descNorm && descNorm !== 'in_transit') {
                    normalizedStatus = descNorm;
                }
            }

            const historyEntry = {
                status: normalizedStatus,
                description: event.description || 'Carrier update',
                source: 'carrier',
                timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
                localTimestamp: event.localTimestamp || null,
                timezoneOffset: event.timezoneOffset || null,
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
                existingByKey.set(key, historyEntry);
                hasUpdates = true;
            } else {
                const existingEntry = existingByKey.get(key);
                if (existingEntry) {
                    if (event.localTimestamp && !existingEntry.localTimestamp) {
                        existingEntry.localTimestamp = event.localTimestamp;
                        existingEntry.timezoneOffset = event.timezoneOffset || existingEntry.timezoneOffset || null;
                        hasUpdates = true;
                    }
                    if (existingEntry.status !== normalizedStatus && isStatusAhead(existingEntry.status, normalizedStatus)) {
                        existingEntry.status = normalizedStatus;
                        hasUpdates = true;
                    }
                }
            }

            if (normalizedStatus !== 'exception') {
                if (!highestCarrierStatus || isStatusAhead(highestCarrierStatus, normalizedStatus)) {
                    highestCarrierStatus = normalizedStatus;
                }
            }
        });

        // Check if any event in newHistory or sortedEvents reports delivered
        const anyDelivered = newHistory.some((e) => normalizeStatus(e.status || e.description) === 'delivered');

        // Most recent chronological event
        const latestEvent = sortedEvents[sortedEvents.length - 1];
        const latestRaw = latestEvent ? (latestEvent.statusCode || latestEvent.status || latestEvent.description) : null;
        const latestRawNorm = latestRaw ? normalizeStatus(latestRaw) : null;
        let latestCarrierStatus = (latestRawNorm === 'exception')
            ? 'exception'
            : normalizeStatus(latestRaw || tracking?.status || highestCarrierStatus);

        // If carrier tracking top-level reported exception, but the latest chronological scan is active movement or delivery, active movement takes precedence!
        if (latestCarrierStatus === 'exception' && latestRawNorm && ['picked_up', 'received_at_hub', 'verified', 'in_transit', 'out_for_delivery', 'delivered'].includes(latestRawNorm)) {
            logger.info(`Overriding carrier-level exception flag with active chronological movement (${latestRawNorm}) for ${shipment.trackingNumber}`);
            latestCarrierStatus = latestRawNorm;
        }

        if (anyDelivered || latestCarrierStatus === 'delivered' || highestCarrierStatus === 'delivered') {
            if (currentStatus !== 'delivered') {
                logger.info(`Detected delivered status for ${shipment.trackingNumber}: ${currentStatus} -> delivered`);
                currentStatus = 'delivered';
                hasUpdates = true;
            }
        } else if (latestCarrierStatus && latestCarrierStatus !== 'delivered' && currentStatus === 'delivered') {
            logger.info(`Correcting premature delivered status for ${shipment.trackingNumber}: ${currentStatus} -> ${latestCarrierStatus}`);
            currentStatus = latestCarrierStatus;
            hasUpdates = true;
        } else if (latestCarrierStatus === 'exception') {
            if (latestRawNorm && latestRawNorm !== 'exception' && ['picked_up', 'received_at_hub', 'verified', 'in_transit', 'out_for_delivery', 'delivered'].includes(latestRawNorm)) {
                logger.info(`Ignoring stale exception for ${shipment.trackingNumber} due to subsequent movement (${latestRawNorm})`);
                currentStatus = latestRawNorm;
                hasUpdates = true;
            } else if (currentStatus !== 'exception') {
                logger.info(`Active exception flagged for ${shipment.trackingNumber}: ${currentStatus} -> exception`);
                currentStatus = 'exception';
                hasUpdates = true;
            }
        } else if (currentStatus === 'exception' && latestCarrierStatus && latestCarrierStatus !== 'exception') {
            logger.info(`Prior exception cleared by subsequent movement for ${shipment.trackingNumber}: exception -> ${latestCarrierStatus}`);
            currentStatus = latestCarrierStatus;
            hasUpdates = true;
        } else if (highestCarrierStatus && isStatusAhead(currentStatus, highestCarrierStatus)) {
            logger.info(`Detected status promotion for ${shipment.trackingNumber}: ${currentStatus} -> ${highestCarrierStatus}`);
            currentStatus = highestCarrierStatus;
            hasUpdates = true;
        } else if (latestCarrierStatus && currentStatus !== latestCarrierStatus && latestCarrierStatus === 'out_for_delivery') {
            logger.info(`Updating status to out_for_delivery for ${shipment.trackingNumber}: ${currentStatus} -> ${latestCarrierStatus}`);
            currentStatus = latestCarrierStatus;
            hasUpdates = true;
        }

        const compactedHistory = compactHistory(newHistory);
        const resolvedEstDelivery = tracking?.estimatedDelivery || (!shipment.estimatedDelivery ? calculateEstimatedDelivery(shipment) : undefined);
        const hasEstDeliveryUpdate = Boolean(resolvedEstDelivery && (!shipment.estimatedDelivery || (tracking?.estimatedDelivery && new Date(shipment.estimatedDelivery).getTime() !== new Date(resolvedEstDelivery).getTime())));

        if (hasUpdates || compactedHistory.length !== currentHistory.length || hasEstDeliveryUpdate) {
            compactedHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return {
                history: compactedHistory,
                status: currentStatus,
                estimatedDelivery: resolvedEstDelivery || undefined,
                actualWeight: tracking?.carrierWeight > 0 ? tracking.carrierWeight : undefined,
                totalPieces: tracking?.carrierPieces > 0 ? tracking.carrierPieces : undefined
            };
        }
        
        return null;
    } catch (error) {
        if (error?.code === 'TRACKING_PENDING') {
            logger.info(`Carrier tracking pending at provider for ${shipment.trackingNumber}: ${error.message}`);
            return null;
        }
        logger.warn(`Failed to sync carrier tracking for ${shipment.trackingNumber}: ${error.message}`);
        return null;
    }
};

const calculateEstimatedDelivery = (shipment = null) => {
    if (shipment) {
        const slaEst = SlaTrackerService.calculateEstimatedDelivery(shipment);
        if (slaEst) return slaEst;
    }
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

const isInternalShipment = (shipment) => {
    return String(shipment?.carrierCode || '').toUpperCase() === 'INTERNAL'
        || shipment?.internallyManaged === true;
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

/**
 * Evaluates whether a shipment has an active exception or a resolved exception based on its history.
 * @param {Object} shipment - The shipment model object with .status and .history
 * @returns {string|null} - The target status ('exception', 'in_transit', 'delivered', etc.) if a change is needed, or null
 */
function evaluateRealtimeExceptionStatus(shipment) {
    if (!shipment) return null;
    const currentStatus = normalizeStatus(shipment.status);
    if (currentStatus === 'delivered' || currentStatus === 'cancelled' || currentStatus === 'draft') return null;

    const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
    if (rawHistory.length === 0) return null;

    // 1. Any delivered milestone conclusively resolves any past exception
    const hasDelivered = rawHistory.some((e) => {
        const s = normalizeStatus(e.status || e.description || e.statusCode);
        return s === 'delivered';
    });
    if (hasDelivered) {
        return currentStatus !== 'delivered' ? 'delivered' : null;
    }

    // 2. Chronologically sort events (most recent first)
    const sortedDesc = [...rawHistory]
        .filter(e => e && e.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (sortedDesc.length === 0) return null;

    const latestScan = sortedDesc[0];
    const latestRaw = latestScan?.statusCode || latestScan?.status || latestScan?.description || '';
    const latestStatus = normalizeStatus(latestRaw);

    // If the latest chronological scan is an exception (hold, delay, customs hold, failed, etc.)
    if (latestStatus === 'exception') {
        return currentStatus !== 'exception' ? 'exception' : null;
    }

    // If currently in exception, but the latest chronological scan is active pipeline movement
    if (currentStatus === 'exception' && ['picked_up', 'received_at_hub', 'verified', 'in_transit', 'out_for_delivery', 'delivered'].includes(latestStatus)) {
        return latestStatus;
    }

    return null;
}

/**
 * Evaluates whether a shipment currently marked with status 'exception' has already
 * resolved the exception via subsequent active movement scans or a delivery scan.
 * @param {Object} shipment - The shipment model object with .status and .history
 * @returns {string|null} - The resolved status (e.g. 'in_transit', 'delivered') or null if still in active exception
 */
function getResolvedExceptionStatus(shipment) {
    if (!shipment) return null;
    const currentStatus = normalizeStatus(shipment.status);
    if (currentStatus !== 'exception') return null;

    const target = evaluateRealtimeExceptionStatus(shipment);
    return (target && target !== 'exception') ? target : null;
}

/**
 * Automatically heals a single shipment in the database if its exception is resolved
 * @param {Object} shipment
 * @param {Object} [prismaClient]
 * @returns {Promise<string|null>}
 */
async function autoHealResolvedShipment(shipment, prismaClient) {
    const resolvedStatus = getResolvedExceptionStatus(shipment);
    if (!resolvedStatus) return null;

    try {
        let client = prismaClient;
        if (!client) {
            try {
                const db = require('../config/database');
                client = db.prisma;
            } catch (_) {}
        }

        if (client && typeof client.shipment?.update === 'function') {
            await client.shipment.update({
                where: { id: shipment.id },
                data: { status: resolvedStatus }
            });
            logger.info(`[autoHeal] Auto-cleared resolved exception for ${shipment.trackingNumber}: exception -> ${resolvedStatus}`);
        }
        shipment.status = resolvedStatus;
        return resolvedStatus;
    } catch (err) {
        logger.warn(`[autoHeal] Error auto-healing shipment ${shipment.trackingNumber}: ${err.message}`);
        return null;
    }
}

/**
 * Bulk synchronizes and heals all exceptions in the database:
 * 1. Heals resolved exceptions that have subsequent movement/delivery
 * 2. Flags active shipments whose latest carrier scan is an exception/hold
 * @param {Object} [prismaClient]
 * @returns {Promise<number>} Number of shipments updated
 */
async function autoSyncAllExceptions(prismaClient) {
    let client = prismaClient;
    if (!client) {
        try {
            const db = require('../config/database');
            client = db.prisma;
        } catch (_) {}
    }

    if (!client || typeof client.shipment?.findMany !== 'function') return 0;

    try {
        const candidates = await client.shipment.findMany({
            where: {
                status: {
                    in: [
                        'exception', 'failed', 'cancelled', 'returned',
                        'booked', 'ready_for_pickup', 'picked_up',
                        'received_at_hub', 'verified', 'in_transit', 'out_for_delivery'
                    ]
                }
            },
            select: { id: true, trackingNumber: true, status: true, history: true }
        });

        if (candidates.length === 0) return 0;

        let syncedCount = 0;
        for (const s of candidates) {
            const nextStatus = evaluateRealtimeExceptionStatus(s);
            if (nextStatus && nextStatus !== s.status) {
                await client.shipment.update({
                    where: { id: s.id },
                    data: { status: nextStatus }
                });
                syncedCount++;
                logger.info(`[autoSyncExceptions] Synced status for ${s.trackingNumber}: ${s.status} -> ${nextStatus}`);
            }
        }

        if (syncedCount > 0) {
            logger.info(`[autoSyncExceptions] Successfully synced ${syncedCount} exception/movement statuses in database`);
        }
        return syncedCount;
    } catch (err) {
        logger.warn(`[autoSyncExceptions] Bulk auto-sync encountered error: ${err.message}`);
        return 0;
    }
}

const autoHealAllResolvedExceptions = autoSyncAllExceptions;

module.exports = {
    DEFAULT_MARKUP,
    hasMarkupShape,
    resolveEffectiveCarrierPolicy,
    buildHistoryKey,
    buildDisplayHistory,
    canonicalStatusFromDescription,
    normalizeLocationLabel,
    resolveCarrierTrackingNumber,
    compactHistory,
    syncCarrierTrackingHistory,
    calculateEstimatedDelivery,
    hasCriticalChanges,
    isInternalShipment,
    getAllowedStatusUpdates,
    canUpdateShipmentStatus,
    evaluateRealtimeExceptionStatus,
    getResolvedExceptionStatus,
    autoHealResolvedShipment,
    autoHealAllResolvedExceptions,
    autoSyncAllExceptions
};
