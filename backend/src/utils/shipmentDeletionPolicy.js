const DELETABLE_SHIPMENT_STATUSES = ['draft', 'pending', 'ready_for_pickup', 'updated', 'cancelled'];

const STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Review',
    booked: 'Booked',
    updated: 'Updated',
    created: 'Booked',
    ready_for_pickup: 'Ready for Pickup',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    exception: 'Exception',
    cancelled: 'Cancelled',
    returned: 'Returned',
    failed: 'Failed'
};

const formatStatusLabel = (status) => {
    if (!status) return 'this status';
    return STATUS_LABELS[status] || String(status)
        .split('_')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const getDeleteAlternativeAction = (status) => {
    if (['pending', 'updated', 'booked', 'created', 'ready_for_pickup'].includes(status)) {
        return 'cancel';
    }

    if (['picked_up', 'in_transit', 'out_for_delivery', 'exception'].includes(status)) {
        return 'void or cancel';
    }

    if (['delivered', 'returned', 'cancelled', 'failed'].includes(status)) {
        return 'archive';
    }

    return 'cancel, void, or archive';
};

/**
 * Checks if a shipment has already been registered / booked with an external carrier
 */
const hasCarrierBooking = (shipment) => {
    if (!shipment) return false;
    return Boolean(
        shipment.dhlTrackingNumber ||
        shipment.carrierShipmentId ||
        shipment.dhlConfirmed === true ||
        (shipment.awbUrl && shipment.status !== 'draft' && shipment.status !== 'pending')
    );
};

/**
 * Validates if a shipment can be deleted.
 * Superadmin / Admin only, and only if not created with carrier.
 */
const canDeleteShipment = (shipment, userRole = null) => {
    if (!shipment) return false;
    if (userRole && userRole !== 'admin') return false;
    if (hasCarrierBooking(shipment)) return false;
    return DELETABLE_SHIPMENT_STATUSES.includes(shipment.status);
};

const buildShipmentDeleteBlockedMessage = (status, hasCarrier = false) => {
    const statusLabel = formatStatusLabel(status);
    const nextAction = getDeleteAlternativeAction(status);

    if (hasCarrier) {
        return {
            short: `Shipment is already booked with carrier; cancel or void with carrier instead.`,
            medium: `This shipment has already been registered with the carrier. Deleting it directly is blocked to prevent orphaned carrier dispatches. Use ${nextAction} instead.`,
            detailed: `This shipment already has an active carrier booking or waybill. To maintain compliance and audit integrity with the carrier, it cannot be deleted directly. Please void or cancel the shipment with the carrier.`,
            tooltip: `Cannot delete: shipment is already booked with carrier. Cancel or void instead.`
        };
    }

    return {
        short: `Shipment is already ${statusLabel}; use ${nextAction} instead.`,
        medium: `This shipment is already ${statusLabel}, so it can no longer be deleted. Use ${nextAction} if you need to stop processing or clean up the record.`,
        detailed: `This shipment is currently ${statusLabel}, which means it has moved beyond the pre-dispatch stage. Deletion is only available before carrier dispatch. To keep the operational audit trail intact, use ${nextAction} when that action is available for this shipment.`,
        tooltip: `Delete is only available before carrier dispatch. Current status: ${statusLabel}.`
    };
};

module.exports = {
    DELETABLE_SHIPMENT_STATUSES,
    hasCarrierBooking,
    canDeleteShipment,
    buildShipmentDeleteBlockedMessage,
    formatStatusLabel
};
