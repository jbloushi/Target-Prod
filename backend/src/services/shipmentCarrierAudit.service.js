const { normalizeStatus } = require('../constants/statusConstants');
const { normalizeCarrierCode } = require('./CarrierFactory');

const TERMINAL_STATUSES = Object.freeze(['delivered', 'completed', 'cancelled', 'canceled', 'returned']);
const AUDITABLE_CARRIERS = Object.freeze(['DGR', 'FEDEX', 'ARAMEX', 'OTE']);
const PHONE_PREFIX_COUNTRIES = Object.freeze([
    ['971', 'AE'], ['973', 'BH'], ['965', 'KW'], ['968', 'OM'], ['974', 'QA'], ['966', 'SA']
]);

function normalizeCountryCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

function normalizeAwb(value) {
    return String(value || '').trim().replace(/^(TRK|DGR|FED|ARM)-/i, '');
}

function countryFromPhone(value) {
    const digits = String(value || '').replace(/\D/g, '').replace(/^00/, '');
    return PHONE_PREFIX_COUNTRIES.find(([prefix]) => digits.startsWith(prefix))?.[1] || null;
}

function buildAuditWhere({ now = new Date(), days = 60, carrierCode } = {}) {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const normalizedCarrier = carrierCode ? normalizeCarrierCode(carrierCode) : null;
    const carriers = normalizedCarrier
        ? (normalizedCarrier === 'ARAMEX' ? ['ARAMEX', 'ARM'] : normalizedCarrier === 'DGR' ? ['DGR', 'DHL'] : normalizedCarrier === 'FEDEX' ? ['FEDEX', 'FDX'] : normalizedCarrier === 'OTE' ? ['OTE', 'LOGESTECHS'] : [normalizedCarrier])
        : [...AUDITABLE_CARRIERS, 'ARM', 'DHL', 'FDX', 'LOGESTECHS'];
    return {
        carrierCode: { in: carriers },
        OR: [
            { createdAt: { gte: cutoff } },
            { status: { notIn: TERMINAL_STATUSES } }
        ]
    };
}

function timestampValue(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEvent(event = {}) {
    const rawLocation = event.location?.formattedAddress || event.location?.city || event.location || '';
    const rawStatus = event.statusCode || event.status || event.description || '';
    return {
        status: normalizeStatus(rawStatus),
        description: String(event.description || '').trim().toLowerCase(),
        location: String(rawLocation || '').trim().toLowerCase(),
        timestamp: timestampValue(event.timestamp)
    };
}

function eventKey(event) {
    const normalized = normalizeEvent(event);
    return [normalized.status, normalized.description, normalized.location, normalized.timestamp].join('|');
}

function valuesDiffer(left, right) {
    if (left == null || right == null) return false;
    return String(left) !== String(right);
}

function normalizeText(value) {
    return value == null ? null : String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '').replace(/^00/, '');
    return digits || null;
}

function normalizeAddress(value) {
    const joined = Array.isArray(value) ? value.join(' ') : value;
    return normalizeText(joined)?.replace(/[^a-z0-9\u0600-\u06ff]+/g, '') || null;
}

function auditShipmentRecord(shipment, { carrierRecord, liveTracking } = {}) {
    const carrierCode = normalizeCarrierCode(shipment.carrierCode || shipment.carrier);
    const awb = normalizeAwb(shipment.dhlTrackingNumber || shipment.carrierShipmentId || shipment.trackingNumber);
    const platformCountry = normalizeCountryCode(shipment.destination?.countryCode);
    const phenixCountry = normalizeCountryCode(shipment.documents?.destCountryCode);
    const phoneCountry = countryFromPhone(shipment.destination?.phone || shipment.customer?.phone);
    const carrierCountry = normalizeCountryCode(carrierRecord?.destinationCountryCode || liveTracking?.destinationCountryCode);
    const platformStatus = normalizeStatus(shipment.status);
    const carrierStatus = liveTracking?.status || carrierRecord?.status;
    const normalizedCarrierStatus = carrierStatus ? normalizeStatus(carrierStatus) : null;
    const platformEvents = (Array.isArray(shipment.history) ? shipment.history : []).filter((event) => String(event?.source || '').toLowerCase() === 'carrier');
    const carrierEvents = Array.isArray(liveTracking?.events)
        ? liveTracking.events
        : (Array.isArray(carrierRecord?.events) ? carrierRecord.events : []);
    const platformKeys = new Set(platformEvents.map(eventKey));
    const carrierKeys = new Set(carrierEvents.map(eventKey));
    const missingCarrierEvents = [...carrierKeys].filter((key) => !platformKeys.has(key));
    const platformOnlyCarrierEvents = [...platformKeys].filter((key) => !carrierKeys.has(key));
    const platformWeight = shipment.pricingSnapshot?.carrierWeight;
    const carrierWeight = liveTracking?.carrierWeight ?? carrierRecord?.carrierWeight;
    const platformPieces = shipment.pricingSnapshot?.carrierPieces;
    const carrierPieces = liveTracking?.carrierPieces ?? carrierRecord?.carrierPieces;
    const platformEta = timestampValue(shipment.estimatedDelivery);
    const carrierEta = timestampValue(liveTracking?.estimatedDelivery || carrierRecord?.estimatedDelivery);
    const detailComparisons = {
        service_code: [normalizeText(shipment.serviceCode), normalizeText(carrierRecord?.serviceCode)],
        recipient_name: [normalizeText(shipment.destination?.contactPerson || shipment.customer?.name), normalizeText(carrierRecord?.recipientName || carrierRecord?.receiverName)],
        recipient_phone: [normalizePhone(shipment.destination?.phone || shipment.customer?.phone), normalizePhone(carrierRecord?.recipientPhone || carrierRecord?.receiverPhone)],
        destination_city: [normalizeText(shipment.destination?.city), normalizeText(carrierRecord?.destinationCity)],
        destination_postal_code: [normalizeText(shipment.destination?.postalCode), normalizeText(carrierRecord?.destinationPostalCode)],
        destination_address: [normalizeAddress(shipment.destination?.streetLines || shipment.destination?.address), normalizeAddress(carrierRecord?.destinationAddress || carrierRecord?.streetLines)],
        origin_country: [normalizeCountryCode(shipment.origin?.countryCode), normalizeCountryCode(carrierRecord?.originCountryCode)],
        origin_city: [normalizeText(shipment.origin?.city), normalizeText(carrierRecord?.originCity)],
        shipper_reference: [normalizeText(shipment.reference || shipment.documents?.reference), normalizeText(carrierRecord?.reference)]
    };
    const signals = [platformCountry, phenixCountry, phoneCountry].filter(Boolean);

    const discrepancies = [];
    if (carrierCountry && platformCountry !== carrierCountry) discrepancies.push('destination_country');
    if (normalizedCarrierStatus && platformStatus !== normalizedCarrierStatus) discrepancies.push('status');
    if (carrierEvents.length && missingCarrierEvents.length) discrepancies.push('missing_tracking_events');
    if (carrierEvents.length && platformOnlyCarrierEvents.length) discrepancies.push('platform_only_tracking_events');
    if (valuesDiffer(platformWeight, carrierWeight)) discrepancies.push('carrier_weight');
    if (valuesDiffer(platformPieces, carrierPieces)) discrepancies.push('carrier_pieces');
    if (platformEta && carrierEta && platformEta !== carrierEta) discrepancies.push('estimated_delivery');
    Object.entries(detailComparisons).forEach(([field, [platformValue, carrierValue]]) => {
        if (valuesDiffer(platformValue, carrierValue)) discrepancies.push(field);
    });
    if (new Set(signals).size > 1) discrepancies.push('internal_destination_signals');

    return {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrierCode,
        awb,
        status: shipment.status,
        createdAt: shipment.createdAt,
        platformCountry,
        phenixCountry,
        phoneCountry,
        carrierCountry,
        platformStatus,
        carrierStatus: normalizedCarrierStatus,
        platformEventCount: platformEvents.length,
        carrierEventCount: carrierEvents.length,
        missingCarrierEventCount: missingCarrierEvents.length,
        platformOnlyCarrierEventCount: platformOnlyCarrierEvents.length,
        platformWeight: platformWeight ?? null,
        carrierWeight: carrierWeight ?? null,
        platformPieces: platformPieces ?? null,
        carrierPieces: carrierPieces ?? null,
        platformEta,
        carrierEta,
        detailComparisons,
        discrepancies,
        hasDiscrepancy: discrepancies.length > 0,
        liveTrackingAvailable: Boolean(liveTracking)
    };
}

module.exports = {
    AUDITABLE_CARRIERS,
    TERMINAL_STATUSES,
    auditShipmentRecord,
    buildAuditWhere,
    countryFromPhone,
    eventKey,
    normalizeAwb,
    normalizeCountryCode,
    normalizeEvent
};
