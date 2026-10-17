/**
 * Unified Shipment Status Config — Frontend
 * Single source of truth for all status rendering across the app.
 * Mirrors backend/src/constants/statusConstants.js
 */

export const STATUS_ORDER = [
    'draft', 'pending', 'pending_approval', 'booked', 'ready_for_pickup', 'picked_up',
    'received_at_hub', 'verified',
    'in_transit', 'out_for_delivery', 'delivered', 'cancelled'
];

export const STATUS_LABELS = {
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
    exception: 'Exception',
    cancelled: 'Cancelled',
};

export const INTERNAL_SHIPMENT_STATUSES = [
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
    received_at_hub: 'Arrived at hub',
    verified: 'Hub verified',
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

// Exact DHL 2-Letter Checkpoint Code Map
export const DHL_CHECKPOINT_MAP = {
    ok: 'delivered',
    df: 'in_transit',
    pu: 'picked_up',
    af: 'received_at_hub',
    pl: 'in_transit',
    wc: 'out_for_delivery',
    cc: 'in_transit',
    ba: 'exception',   // Bad Address
    nh: 'exception',   // Not at Home
    oh: 'exception',   // On Hold
    fd: 'exception',   // Failed Delivery
    rt: 'cancelled',   // Returned to Shipper
};

// Exact Aramex Checkpoint Codes
export const ARAMEX_CHECKPOINT_MAP = {
    sh005: 'delivered',
    sh006: 'delivered',
    sh014: 'out_for_delivery',
    sh041: 'out_for_delivery',
    sh001: 'picked_up',
    sh003: 'picked_up',
    sh004: 'in_transit',
    sh012: 'in_transit',
    sh016: 'in_transit',
    sh008: 'exception',
    sh011: 'exception',
    sh018: 'exception',
    sh021: 'exception',
    sh023: 'exception',
    sh024: 'exception',
};

// Exact FedEx Checkpoint Codes
export const FEDEX_CHECKPOINT_MAP = {
    dl: 'delivered',
    od: 'out_for_delivery',
    pu: 'picked_up',
    oc: 'picked_up',
    ar: 'received_at_hub',
    dp: 'in_transit',
    it: 'in_transit',
    ix: 'in_transit',
    de: 'exception',
    se: 'exception',
    ca: 'cancelled',
};

// Maps LogesTechs/OTE status codes → platform status
export const OTE_STATUS_MAP = {
    created: 'booked',
    pending_customer_care_approval: 'booked',
    approved_by_customer_care_and_waiting_for_dispatcher: 'ready_for_pickup',
    assigned_to_driver_and_pending_approval: 'ready_for_pickup',
    accepted_by_driver_and_pending_pickup: 'ready_for_pickup',
    arrived: 'picked_up',
    brought: 'picked_up',
    picked: 'picked_up',
    in_transit: 'in_transit',
    transferred_out: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered_to_recipient: 'delivered',
    completed: 'delivered',
    cancelled: 'cancelled',
    returned_by_recipient: 'exception',
    postponed_delivery: 'exception',
    damaged: 'exception',
    delayed: 'exception',
    failed_delivery: 'exception',
    customer_cancelled: 'cancelled',
    consignee_rescheduled: 'exception',
    address_not_found: 'exception',
    refused_delivery: 'exception',
    undelivered: 'exception',
};

const EXCEPTION_KEYWORDS = [
    'undeliver', 'not delivered', 'failed', 'premises closed', 'consignee premises closed',
    'on hold', 'held', 'delay', 'incomplete', 'damage', 'clearance delay',
    'contacted consignee', 'consignee unavailable', 'consignee not available', 'not available',
    'consignee refused', 'refused',
    'bad address', 'address incorrect', 'incorrect address', 'incorrect delivery address',
    'not at home', 'customer not home', 'consignee not home',
    'delivery attempt failed', 'rescheduled', 'reschedule', 'rescheduling',
    'action required', 'emergency',
    'delivery exception', 'exception', 'failure',
    'unreachable', 'not reachable', 'unable to access', 'premises locked',
    'closed for holiday', 'customs hold', 'awaiting consignee', 'missed delivery',
    'not signed', 'unable to sign', 'unable to obtain signature', 'no signature',
    'delivery attempted', 'attempted delivery', 'notice left', 'consignee moved',
    'consignee has moved', 'moved from the address', 'further consignee information',
    'delivery attempt could not', 'could not be completed',
    'payment pending', 'requested hold', 'hold requested', 'hold at location',
    'later delivery', 'customs delay'
];

export function isNegativeOrExceptionPhrase(text) {
    if (!text) return false;
    const clean = String(text).toLowerCase().trim().replace(/[.,|()[\]{}]+/g, ' ').replace(/\s+/g, ' ');
    return EXCEPTION_KEYWORDS.some(kw => clean.includes(kw));
}

export function isTerminalStatus(status) {
    const norm = normalizeStatus(status);
    return ['delivered', 'cancelled', 'returned'].includes(norm);
}

export function normalizeStatus(raw) {
    if (!raw) return 'draft';
    const s = String(raw).toLowerCase().trim().replace(/\s+/g, '_');
    if (STATUS_ORDER.includes(s)) return s;
    if (s === 'exception') return 'exception';
    if (LEGACY_STATUS_MAP[s]) return LEGACY_STATUS_MAP[s];
    if (DHL_CHECKPOINT_MAP[s]) return DHL_CHECKPOINT_MAP[s];
    if (OTE_STATUS_MAP[s]) return OTE_STATUS_MAP[s];
    if (ARAMEX_CHECKPOINT_MAP[s]) return ARAMEX_CHECKPOINT_MAP[s];
    if (FEDEX_CHECKPOINT_MAP[s]) return FEDEX_CHECKPOINT_MAP[s];

    const clean = s.replace(/_/g, ' ');

    // 1. NEGATIVE & EXCEPTION PHRASES (MUST BE EVALUATED BEFORE POSITIVE MILESTONES)
    if (EXCEPTION_KEYWORDS.some(kw => clean.includes(kw))) {
        return 'exception';
    }

    // 2. RETURN / RTO PHRASES
    if (clean.includes('returned') || clean.includes('return to origin') || clean.includes('return to shipper') || /\brto\b/i.test(clean)) {
        return 'cancelled';
    }

    // 3. POSITIVE MILESTONES (STRICT WORD MATCHING)
    if (clean.includes('out for delivery') || clean.includes('for delivery') || clean.includes('with courier') || clean.includes('with driver') || clean.includes('delivery champion') || s === 'od') {
        return 'out_for_delivery';
    }
    // Delivered must NOT match 'consignee' generically
    if (
        clean.includes('delivered to recipient') ||
        clean.includes('shipment delivered') ||
        clean.includes('delivered to') ||
        clean.includes('proof of delivery') ||
        /(?:^|\s)signed\s+(?:for\s+)?by\b/i.test(clean) ||
        /(?:^|\s)signature\s+(?:obtained|captured|on\s+file)\b/i.test(clean) ||
        /(?:^|\s)pod\s+(?:received|captured|uploaded|available|signed)\b/i.test(clean) ||
        s === 'dlv' ||
        s === 'pod' ||
        /\bdelivered\b/.test(clean)
    ) {
        return 'delivered';
    }
    if (clean.includes('depart')) {
        return 'in_transit';
    }
    if (clean.includes('received at hub') || clean.includes('arrived at facility') || clean.includes('arrived at operations') || clean.includes('sorting hub') || clean.includes('arrived') || clean.includes('facility') || s === 'af') {
        return 'received_at_hub';
    }
    if (clean.includes('picked up') || clean.includes('picked') || clean.includes('collected') || s === 'pu') {
        return 'picked_up';
    }
    if (clean.includes('in transit') || clean.includes('transit') || clean.includes('flight') || clean.includes('transferred') || s === 'sh' || clean.includes('custom')) {
        return 'in_transit';
    }
    if (clean.includes('cancel')) {
        return 'cancelled';
    }
    if (clean.includes('book') || clean.includes('creat')) {
        return 'booked';
    }

    return 'in_transit'; // safe fallback for unknown carrier codes
}

export function normalizeCarrierStatus(statusText, carrierCode, checkpointCode) {
    const carrier = String(carrierCode || '').toUpperCase();
    if (checkpointCode) {
        const c = String(checkpointCode).toLowerCase().trim();
        if (carrier === 'DGR' || carrier === 'DHL') {
            if (DHL_CHECKPOINT_MAP[c]) return DHL_CHECKPOINT_MAP[c];
        } else if (carrier === 'ARAMEX') {
            if (ARAMEX_CHECKPOINT_MAP[c]) return ARAMEX_CHECKPOINT_MAP[c];
        } else if (carrier === 'FEDEX') {
            if (FEDEX_CHECKPOINT_MAP[c]) return FEDEX_CHECKPOINT_MAP[c];
        } else if (carrier === 'OTE' || carrier === 'LOGESTECHS') {
            if (OTE_STATUS_MAP[c]) return OTE_STATUS_MAP[c];
        }
    }
    return normalizeStatus(statusText || checkpointCode);
}

export function getStepIndex(status) {
    const idx = STATUS_ORDER.indexOf(normalizeStatus(status));
    return idx === -1 ? 0 : idx;
}

export function getPublicStepIndex(status) {
    const norm = normalizeStatus(status);
    if (norm === 'received_at_hub' || norm === 'verified') return PUBLIC_PROGRESS_STEPS.indexOf('in_transit');
    const idx = PUBLIC_PROGRESS_STEPS.indexOf(norm);
    return idx === -1 ? 0 : idx;
}

export function isStatusAhead(statusA, statusB) {
    const normA = normalizeStatus(statusA);
    const normB = normalizeStatus(statusB);
    if (normA === normB) return false;
    // Terminal state invariant: terminal states cannot be superseded by active movement
    if (['delivered', 'cancelled', 'returned'].includes(normA)) return false;
    if (normB === 'delivered') return true;
    
    // If currently in exception, any subsequent active movement clears the exception
    if (normA === 'exception') {
        return ['picked_up', 'received_at_hub', 'verified', 'in_transit', 'out_for_delivery', 'delivered'].includes(normB);
    }
    // Exception is an operational flag, not a forward pipeline milestone ahead of movement
    if (normB === 'exception') return false;

    return getStepIndex(normB) > getStepIndex(normA);
}
