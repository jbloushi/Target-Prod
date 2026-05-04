const DELETABLE_SHIPMENT_STATUSES = ['draft', 'ready_for_pickup'];

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

const buildShipmentDeleteBlockedMessage = (status) => {
    const statusLabel = formatStatusLabel(status);
    const nextAction = getDeleteAlternativeAction(status);

    return {
        short: `Shipment is already ${statusLabel}; use ${nextAction} instead.`,
        medium: `This shipment is already ${statusLabel}, so it can no longer be deleted. Use ${nextAction} if you need to stop processing or clean up the record.`,
        detailed: `This shipment is currently ${statusLabel}, which means it has moved beyond the early pre-processing stage. Deletion is only available while a shipment is Draft or Ready for Pickup. To keep the operational audit trail intact, use ${nextAction} when that action is available for this shipment.`,
        tooltip: `Delete is only available for Draft or Ready for Pickup shipments. Current status: ${statusLabel}.`
    };
};

module.exports = {
    DELETABLE_SHIPMENT_STATUSES,
    buildShipmentDeleteBlockedMessage,
    formatStatusLabel
};
