/**
 * Unified Shipment Status Constants
 * Single source of truth for the entire backend.
 */

const SHIPMENT_STATUSES = [
    'draft', 'pending', 'pending_approval', 'booked', 'ready_for_pickup', 'picked_up',
    'received_at_hub', 'verified',
    'in_transit', 'out_for_delivery', 'delivered', 
    'rto_in_transit', 'returned',
    'exception', 'cancelled'
];

const INTERNAL_SHIPMENT_STATUSES = [
    'draft',
    'pending',
    'pending_approval',
    'booked',
    'ready_for_pickup',
    'picked_up',
    'received_at_hub',
    'verified',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'rto_in_transit',
    'returned',
    'exception',
    'cancelled'
];

const STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Review',
    pending_approval: 'Pending Approval',
    booked: 'Booked',
    ready_for_pickup: 'Ready for Pickup',
    picked_up: 'Picked Up',
    received_at_hub: 'Received at Hub',
    verified: 'Hub Verified',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    rto_in_transit: 'RTO In Transit',
    returned: 'Returned to Shipper',
    exception: 'Exception',
    cancelled: 'Cancelled',
};

// Maps raw DHL Unified Tracking API statusCode → platform status
const DHL_STATUS_MAP = {
    'pre-transit': 'booked',
    'transit': 'in_transit',
    'delivered': 'delivered',
    'failure': 'exception',
    'unknown': null, // no promotion
};

// Maps LogesTechs/OTE status codes → platform status
const OTE_STATUS_MAP = {
    'created': 'booked',
    'pending_customer_care_approval': 'booked',
    'approved_by_customer_care_and_waiting_for_dispatcher': 'ready_for_pickup',
    'assigned_to_driver_and_pending_approval': 'ready_for_pickup',
    'accepted_by_driver_and_pending_pickup': 'ready_for_pickup',
    'arrived': 'picked_up',
    'brought': 'picked_up',
    'picked': 'picked_up',
    'in_transit': 'in_transit',
    'transferred_out': 'in_transit',
    'out_for_delivery': 'out_for_delivery',
    'delivered_to_recipient': 'delivered',
    'completed': 'delivered',
    'cancelled': 'cancelled',
    'returned_by_recipient': 'exception',
    'postponed_delivery': 'exception',
    'damaged': 'exception',
    'delayed': 'exception',
};

// Maps legacy/retired internal statuses → new canonical statuses
const LEGACY_STATUS_MAP = {
    'updated': 'pending',
    'created': 'booked',
    'ready_for_pickup': 'booked',
    'pickup_scheduled': 'booked',
};

/**
 * Normalize any raw status string to a canonical pipeline status.
 * Handles: current statuses, legacy statuses, DHL codes, and freeform strings.
 */
function normalizeStatus(raw) {
    if (!raw) return 'draft';
    const s = String(raw).toLowerCase().replace(/\s+/g, '_');
    if (SHIPMENT_STATUSES.includes(s)) return s;
    if (LEGACY_STATUS_MAP[s]) return LEGACY_STATUS_MAP[s];
    if (OTE_STATUS_MAP[s]) return OTE_STATUS_MAP[s];
    if (DHL_STATUS_MAP[s] != null) return DHL_STATUS_MAP[s];

    if (s.includes('held_for_pickup') || s.includes('held for pickup')) return 'exception';

    // Semantic matching for carrier descriptions and freeform statuses (Aramex, FedEx, DHL, OTE, etc.)
    if (s.includes('exception') || s.includes('hold') || s.includes('held') || s.includes('delay') || s.includes('undeliver') || s.includes('failed') || s.includes('incomplete') || s.includes('damage') || s.includes('clearance_delay')) return 'exception';
    if (s.includes('out_for_delivery') || s.includes('for_delivery') || s.includes('with_courier') || s.includes('with_driver') || s === 'od') return 'out_for_delivery';
    if (s.includes('delivered') || s.includes('consignee') || s === 'dlv' || s.includes('pod') || s === 'delivered_to_recipient') return 'delivered';
    if (s.includes('rto') || s.includes('returned')) return 'returned';
    // Informational carrier updates must not replace the shipment milestone.
    if (isInformationalCarrierText(s)) return null;
    if (s.includes('received_at_hub') || s.includes('arrived') || s === 'af' || s.includes('sorting_hub') || s.includes('facility')) return 'received_at_hub';
    if (s.includes('picked') || s.includes('collected') || s === 'pu') return 'picked_up';
    if (s.includes('transit') || s.includes('flight') || s.includes('depart') || s === 'sh' || s.includes('custom')) return 'in_transit';
    if (s.includes('cancel')) return 'cancelled';
    if (s.includes('book') || s.includes('creat')) return 'booked';

    return 'in_transit'; // safe fallback for unknown carrier codes
}

const isInformationalCarrierText = (value = '') => {
    const text = String(value).toLowerCase().replace(/_/g, ' ');
    return text.includes('payment received')
        || text.includes('payment is received')
        || text.includes('charges paid')
        || text.includes('customs update')
        || text.includes('delivery instructions');
};

const getCarrierEventClassification = (event = {}) => {
    const rawStatus = event.statusCode || event.status || null;
    const rawDescription = event.description || '';
    const raw = `${rawStatus || ''} ${rawDescription}`.trim();
    const descriptionStatus = normalizeStatus(rawDescription);
    const normalized = descriptionStatus === 'delivered'
        || descriptionStatus === 'returned'
        ? descriptionStatus
        : normalizeStatus(raw);
    const text = raw.toLowerCase();
    const flags = [];

    if (isInformationalCarrierText(text)) flags.push(text.includes('payment') || text.includes('charges') ? 'payment_confirmed' : 'carrier_information');
    if (text.includes('hold') || text.includes('held') || text.includes('clearance delay') || text.includes('payment required')) flags.push('operational_hold');
    if (text.includes('held for pickup')) flags.push('pickup_ready');

    return {
        rawStatus,
        rawDescription,
        normalizedStatus: normalized,
        flags: [...new Set(flags)]
    };
};

const selectEffectiveCarrierStatus = (events = [], fallbackStatus = null) => {
    const sorted = [...events].filter(Boolean).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    let effective = null;
    const flags = new Set();
    let latestMeaningfulEvent = null;

    for (const event of sorted) {
        const classification = getCarrierEventClassification(event);
        classification.flags.forEach((flag) => flags.add(flag));
        if (classification.normalizedStatus) {
            effective = classification.normalizedStatus;
            latestMeaningfulEvent = { ...event, ...classification };
        }
    }

    return {
        normalizedStatus: effective || (fallbackStatus ? normalizeStatus(fallbackStatus) : null),
        latestMeaningfulEvent,
        flags: [...flags]
    };
};

const PIPELINE_STATUSES = [
    'draft', 'pending', 'booked', 'ready_for_pickup', 'picked_up',
    'received_at_hub', 'verified',
    'in_transit', 'out_for_delivery', 'delivered'
];

/**
 * Returns the index of a status in the pipeline.
 * Used for "forward-only" promotion logic.
 */
function getStatusIndex(status) {
    const idx = PIPELINE_STATUSES.indexOf(normalizeStatus(status));
    return idx === -1 ? 0 : idx;
}

/**
 * Check if statusB is ahead of statusA in the pipeline.
 */
function isStatusAhead(statusA, statusB) {
    const normA = normalizeStatus(statusA);
    const normB = normalizeStatus(statusB);
    if (normA === normB) return false;
    if (normB === 'delivered') return true;
    if (normA === 'delivered') return false;
    
    // If currently in exception, any subsequent active movement clears the exception
    if (normA === 'exception') {
        return ['picked_up', 'received_at_hub', 'verified', 'in_transit', 'out_for_delivery', 'delivered'].includes(normB);
    }
    // Exception is an operational flag, not a forward milestone ahead of movement
    if (normB === 'exception') return false;

    return getStatusIndex(normB) > getStatusIndex(normA);
}

module.exports = {
    SHIPMENT_STATUSES,
    INTERNAL_SHIPMENT_STATUSES,
    STATUS_LABELS,
    DHL_STATUS_MAP,
    OTE_STATUS_MAP,
    LEGACY_STATUS_MAP,
    normalizeStatus,
    isInformationalCarrierText,
    getCarrierEventClassification,
    selectEffectiveCarrierStatus,
    getStatusIndex,
    isStatusAhead,
};
