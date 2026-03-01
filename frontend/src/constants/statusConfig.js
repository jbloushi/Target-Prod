/**
 * Unified Shipment Status Config — Frontend
 * Single source of truth for all status rendering across the app.
 * Mirrors backend/src/constants/statusConstants.js
 */

export const STATUS_ORDER = [
    'draft', 'pending', 'booked', 'picked_up',
    'in_transit', 'out_for_delivery', 'delivered'
];

export const STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Review',
    booked: 'Booked',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    exception: 'Exception',
};

// For public-facing progress bar (hide internal draft/pending stages)
export const PUBLIC_PROGRESS_STEPS = [
    'booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'
];

export const PUBLIC_PROGRESS_LABELS = {
    booked: 'Booked',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
};

export const STATUS_HEADLINE = {
    draft: 'Shipment is being prepared',
    pending: 'Shipment is pending review',
    booked: 'Shipment has been booked',
    picked_up: 'Shipment has been picked up',
    in_transit: 'Shipment is on the way',
    out_for_delivery: 'Shipment is out for delivery',
    delivered: 'Shipment successfully delivered',
    exception: 'Action required: Shipment exception',
};

// Legacy status mapping — keeps old data rendering correctly
const LEGACY_STATUS_MAP = {
    updated: 'pending',
    created: 'booked',
    ready_for_pickup: 'booked',
    pickup_scheduled: 'booked',
};

export function normalizeStatus(raw) {
    if (!raw) return 'draft';
    const s = String(raw).toLowerCase().replace(/\s+/g, '_');
    if (STATUS_ORDER.includes(s)) return s;
    if (s === 'exception') return 'exception';
    if (LEGACY_STATUS_MAP[s]) return LEGACY_STATUS_MAP[s];
    return 'in_transit'; // safe fallback for unknown carrier codes
}

export function getStepIndex(status) {
    const idx = STATUS_ORDER.indexOf(normalizeStatus(status));
    return idx === -1 ? 0 : idx;
}

export function getPublicStepIndex(status) {
    const idx = PUBLIC_PROGRESS_STEPS.indexOf(normalizeStatus(status));
    return idx === -1 ? 0 : idx;
}
