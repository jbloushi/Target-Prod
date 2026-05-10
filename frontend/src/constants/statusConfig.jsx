/**
 * Unified Shipment Status Config — Frontend
 * Single source of truth for all status rendering across the app.
 * Mirrors backend/src/constants/statusConstants.js
 */

export const STATUS_ORDER = [
    'draft', 'pending', 'booked', 'ready_for_pickup', 'picked_up',
    'in_transit', 'out_for_delivery', 'delivered', 'cancelled'
];

export const STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Review',
    booked: 'Booked',
    ready_for_pickup: 'Ready for Pickup',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    exception: 'Exception',
    cancelled: 'Cancelled',
};

export const INTERNAL_SHIPMENT_STATUSES = [
    'draft',
    'pending',
    'booked',
    'ready_for_pickup',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
    'cancelled',
];

// For public-facing progress bar (hide internal draft/pending stages)
export const PUBLIC_PROGRESS_STEPS = [
    'booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'
];

export const PUBLIC_PROGRESS_LABELS = {
    booked: 'Shipment booked',
    picked_up: 'Picked up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
};

export const STATUS_HEADLINE = {
    draft: 'Shipment is being prepared',
    pending: 'Preparing shipment',
    booked: 'Shipment booked',
    ready_for_pickup: 'Ready for pickup',
    picked_up: 'Picked up',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    exception: 'We are checking this shipment',
    cancelled: 'Shipment cancelled',
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
