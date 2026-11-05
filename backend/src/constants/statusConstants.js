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

// Exact DHL 2-Letter Checkpoint Code Map (highest priority checkpoint mapping)
const DHL_CHECKPOINT_MAP = {
    'ok': 'delivered',
    'df': 'in_transit',
    'pu': 'picked_up',
    'af': 'received_at_hub',
    'pl': 'in_transit',
    'wc': 'out_for_delivery',
    'cc': 'in_transit',
    'ba': 'exception',   // Bad Address
    'nh': 'exception',   // Not at Home
    'oh': 'exception',   // On Hold
    'fd': 'exception',   // Failed Delivery
    'rt': 'returned',    // Returned to Shipper
};

// Exact Aramex Checkpoint Codes
const ARAMEX_CHECKPOINT_MAP = {
    'sh005': 'delivered',
    'sh006': 'delivered',
    'sh014': 'out_for_delivery',
    'sh041': 'out_for_delivery',
    'sh001': 'picked_up',
    'sh003': 'picked_up',
    'sh004': 'in_transit',
    'sh012': 'in_transit',
    'sh016': 'in_transit',
    'sh008': 'exception',
    'sh011': 'exception',
    'sh018': 'exception',
    'sh021': 'exception',
    'sh023': 'exception',
    'sh024': 'exception',
};

// Exact FedEx Checkpoint Codes
const FEDEX_CHECKPOINT_MAP = {
    'dl': 'delivered',
    'od': 'out_for_delivery',
    'pu': 'picked_up',
    'oc': 'picked_up',
    'ar': 'received_at_hub',
    'dp': 'in_transit',
    'it': 'in_transit',
    'ix': 'in_transit',
    'de': 'exception',
    'se': 'exception',
    'ca': 'cancelled',
};

// Maps SMSA checkpoint and status codes → platform status
const SMSA_CHECKPOINT_MAP = {
    // Booked / Created
    'data received': 'booked',
    'data_rcvd': 'booked',
    'datarcvd': 'booked',
    'shipment created': 'booked',
    'created': 'booked',
    'b2c_created': 'booked',
    'c2b_created': 'booked',
    'order created': 'booked',
    'manifest generated': 'booked',
    // Pickup
    'pickup scheduled': 'ready_for_pickup',
    'pickupscheduled': 'ready_for_pickup',
    'picked up': 'picked_up',
    'picked': 'picked_up',
    'collected': 'picked_up',
    'pu': 'picked_up',
    // Received at hub
    'arrived at facility': 'received_at_hub',
    'arr_fac': 'received_at_hub',
    'arrived at hub': 'received_at_hub',
    'received at facility': 'received_at_hub',
    'in sorting facility': 'received_at_hub',
    // In transit
    'in transit': 'in_transit',
    'in_transit': 'in_transit',
    'intransit': 'in_transit',
    'departed facility': 'in_transit',
    'transferred': 'in_transit',
    'customs clearance': 'in_transit',
    // Out for delivery
    'out for delivery': 'out_for_delivery',
    'out_for_delivery': 'out_for_delivery',
    'out_for_dlv': 'out_for_delivery',
    'outfordelivery': 'out_for_delivery',
    'with courier': 'out_for_delivery',
    'with driver': 'out_for_delivery',
    // Delivered
    'delivered': 'delivered',
    'dlv': 'delivered',
    'pod': 'delivered',
    'delivered to consignee': 'delivered',
    'shipment delivered': 'delivered',
    // Exception
    'exception': 'exception',
    'failed_attempt': 'exception',
    'delivery failed': 'exception',
    'failed delivery': 'exception',
    'undelivered': 'exception',
    'not delivered': 'exception',
    'on hold': 'exception',
    'held': 'exception',
    'held at customs': 'exception',
    'premises closed': 'exception',
    'consignee premises closed': 'exception',
    'bad address': 'exception',
    'incorrect address': 'exception',
    'consignee unavailable': 'exception',
    'refused': 'exception',
    'damage': 'exception',
    // Cancelled
    'cancelled': 'cancelled',
    'canceled': 'cancelled',
    'void': 'cancelled',
    // Returned
    'returned': 'returned',
    'return to origin': 'returned',
    'return to shipper': 'returned',
    'rto': 'returned',
    'rto_in_transit': 'rto_in_transit'
};

const SMSA_STATUS_MAP = SMSA_CHECKPOINT_MAP;

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
    'failed_delivery': 'exception',
    'customer_cancelled': 'cancelled',
    'consignee_rescheduled': 'exception',
    'address_not_found': 'exception',
    'refused_delivery': 'exception',
    'undelivered': 'exception',
};

// Maps legacy/retired internal statuses → new canonical statuses
const LEGACY_STATUS_MAP = {
    'updated': 'pending',
    'created': 'booked',
    'ready_for_pickup': 'booked',
    'pickup_scheduled': 'booked',
};

const EXCEPTION_KEYWORDS = [
    'undeliver', 'not delivered', 'unsuccessful', 'failed', 'premises closed', 'consignee premises closed',
    'on hold', 'held', 'delay', 'incomplete', 'damage', 'clearance delay',
    'contacted consignee', 'consignee unavailable', 'consignee not available', 'not available',
    'consignee refused', 'refused', 'rejected', 'customer rejected',
    'bad address', 'address incorrect', 'incorrect address', 'incorrect delivery address',
    'updated delivery address required',
    'not at home', 'customer not home', 'consignee not home',
    'delivery attempt failed', 'delivery attempt could not', 'could not deliver', 'unable to deliver',
    'delivery postponed', 'postponed', 'aborted', 'delivery aborted', 'shipment lost',
    'rescheduled', 'reschedule', 'rescheduling',
    'action required', 'emergency',
    'delivery exception', 'exception', 'failure',
    'unreachable', 'not reachable', 'unable to access', 'premises locked',
    'closed for holiday', 'customs hold', 'awaiting consignee', 'missed delivery',
    'not signed', 'unable to sign', 'unable to obtain signature', 'no signature',
    'delivery attempted', 'attempted delivery', 'notice left', 'consignee moved',
    'consignee has moved', 'moved from the address', 'further consignee information',
    'could not be completed',
    'payment pending', 'requested hold', 'hold requested', 'hold at location',
    'later delivery', 'customs delay'
];

/**
 * Checks if a string contains any negative or exception phrases
 * @param {string} text
 * @returns {boolean}
 */
function isNegativeOrExceptionPhrase(text) {
    if (!text) return false;
    const clean = String(text).toLowerCase().trim().replace(/[.,|()[\]{}]+/g, ' ').replace(/\s+/g, ' ');
    return EXCEPTION_KEYWORDS.some(kw => clean.includes(kw));
}

/**
 * Checks if status is terminal (cannot be regressed by out-of-order scans)
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalStatus(status) {
    const norm = normalizeStatus(status);
    return ['delivered', 'cancelled', 'returned'].includes(norm);
}

/**
 * Normalize any raw status string to a canonical pipeline status.
 * Handles: current statuses, legacy statuses, DHL/OTE/Aramex/FedEx checkpoint codes, and freeform strings.
 */
function normalizeStatus(raw) {
    if (!raw) return 'draft';
    const s = String(raw).toLowerCase().trim().replace(/\s+/g, '_');
    if (SHIPMENT_STATUSES.includes(s)) return s;
    if (LEGACY_STATUS_MAP[s]) return LEGACY_STATUS_MAP[s];
    if (DHL_CHECKPOINT_MAP[s]) return DHL_CHECKPOINT_MAP[s];
    if (OTE_STATUS_MAP[s]) return OTE_STATUS_MAP[s];
    if (ARAMEX_CHECKPOINT_MAP[s]) return ARAMEX_CHECKPOINT_MAP[s];
    if (FEDEX_CHECKPOINT_MAP[s]) return FEDEX_CHECKPOINT_MAP[s];
    if (DHL_STATUS_MAP[s] != null) return DHL_STATUS_MAP[s];

    const clean = s.replace(/_/g, ' ');

    // 1. NEGATIVE & EXCEPTION PHRASES (MUST BE EVALUATED BEFORE POSITIVE MILESTONES)
    if (EXCEPTION_KEYWORDS.some(kw => clean.includes(kw))) {
        return 'exception';
    }

    // 2. RETURN / RTO PHRASES
    if (clean.includes('returned') || clean.includes('return to origin') || clean.includes('return to shipper') || /\brto\b/i.test(clean)) {
        return 'returned';
    }

    // 3. CANCEL PHRASES
    if (clean.includes('cancel')) {
        return 'cancelled';
    }

    // 4. POSITIVE MILESTONES (STRICT WORD MATCHING)
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
    if (clean.includes('in transit') || clean.includes('transit') || clean.includes('flight') || clean.includes('transferred') || s === 'sh' || /\bcustoms?\b/i.test(clean)) {
        return 'in_transit';
    }
    if (clean.includes('book') || clean.includes('creat')) {
        return 'booked';
    }

    return 'in_transit'; // safe fallback for unknown carrier codes
}

/**
 * Carrier-aware status normalizer with checkpoint code priority
 */
function normalizeCarrierStatus(statusText, carrierCode, checkpointCode) {
    const carrier = String(carrierCode || '').toUpperCase();
    const rawCheckpoint = checkpointCode ? String(checkpointCode).toLowerCase().trim() : '';
    const rawText = statusText ? String(statusText).toLowerCase().trim() : '';
    const combined = `${rawText} ${rawCheckpoint}`.trim();

    // Strict exception precedence: negative phrases like undelivered, not delivered, failed, held, returned
    // evaluate to exception or returned and NEVER to delivered.
    if (isNegativeOrExceptionPhrase(combined)) {
        return 'exception';
    }
    if (combined.includes('returned') || combined.includes('return to origin') || combined.includes('return to shipper') || /\brto\b/i.test(combined)) {
        return 'returned';
    }
    if (combined.includes('cancel')) {
        return 'cancelled';
    }

    if (rawCheckpoint) {
        if (carrier === 'DGR' || carrier === 'DHL') {
            if (DHL_CHECKPOINT_MAP[rawCheckpoint]) return DHL_CHECKPOINT_MAP[rawCheckpoint];
        } else if (carrier === 'ARAMEX') {
            if (ARAMEX_CHECKPOINT_MAP[rawCheckpoint]) return ARAMEX_CHECKPOINT_MAP[rawCheckpoint];
        } else if (carrier === 'FEDEX') {
            if (FEDEX_CHECKPOINT_MAP[rawCheckpoint]) return FEDEX_CHECKPOINT_MAP[rawCheckpoint];
        } else if (carrier === 'SMSA' || carrier === 'SMSAEXPRESS') {
            if (SMSA_CHECKPOINT_MAP[rawCheckpoint]) return SMSA_CHECKPOINT_MAP[rawCheckpoint];
            const cleanCp = rawCheckpoint.replace(/_/g, ' ');
            if (SMSA_CHECKPOINT_MAP[cleanCp]) return SMSA_CHECKPOINT_MAP[cleanCp];
        } else if (carrier === 'OTE' || carrier === 'LOGESTECHS') {
            if (OTE_STATUS_MAP[rawCheckpoint]) return OTE_STATUS_MAP[rawCheckpoint];
        }
    }
    return normalizeStatus(statusText || checkpointCode);
}

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
    // Terminal state invariant: terminal states cannot be superseded by active movement
    if (['delivered', 'cancelled', 'returned'].includes(normA)) return false;
    if (normB === 'delivered') return true;
    
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
    DHL_CHECKPOINT_MAP,
    ARAMEX_CHECKPOINT_MAP,
    FEDEX_CHECKPOINT_MAP,
    OTE_STATUS_MAP,
    SMSA_CHECKPOINT_MAP,
    SMSA_STATUS_MAP,
    LEGACY_STATUS_MAP,
    normalizeStatus,
    normalizeCarrierStatus,
    isNegativeOrExceptionPhrase,
    isTerminalStatus,
    getStatusIndex,
    isStatusAhead,
};
