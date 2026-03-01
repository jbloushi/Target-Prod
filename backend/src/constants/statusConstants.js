/**
 * Unified Shipment Status Constants
 * Single source of truth for the entire backend.
 */

const SHIPMENT_STATUSES = [
    'draft', 'pending', 'booked', 'picked_up',
    'in_transit', 'out_for_delivery', 'delivered', 'exception'
];

const STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Review',
    booked: 'Booked',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    exception: 'Exception',
};

// Maps raw DHL Unified Tracking API statusCode → platform status
const DHL_STATUS_MAP = {
    'pre-transit': 'booked',
    'transit': 'in_transit',
    'delivered': 'delivered',
    'failure': 'exception',
    'unknown': null, // no promotion
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
    if (DHL_STATUS_MAP[s] != null) return DHL_STATUS_MAP[s];
    return 'in_transit'; // safe fallback for unknown carrier codes
}

/**
 * Returns the index of a status in the pipeline.
 * Used for "forward-only" promotion logic.
 */
function getStatusIndex(status) {
    const idx = SHIPMENT_STATUSES.indexOf(normalizeStatus(status));
    return idx === -1 ? 0 : idx;
}

/**
 * Check if statusB is ahead of statusA in the pipeline.
 */
function isStatusAhead(statusA, statusB) {
    // Exception is a lateral move, not "ahead"
    if (normalizeStatus(statusB) === 'exception') return true;
    return getStatusIndex(statusB) > getStatusIndex(statusA);
}

module.exports = {
    SHIPMENT_STATUSES,
    STATUS_LABELS,
    DHL_STATUS_MAP,
    LEGACY_STATUS_MAP,
    normalizeStatus,
    getStatusIndex,
    isStatusAhead,
};
