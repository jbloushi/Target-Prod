import { STATUS_LABELS } from '../constants/statusConfig';

export const DELETABLE_SHIPMENT_STATUSES = ['draft', 'ready_for_pickup'];

export const canDeleteShipmentStatus = (status) => DELETABLE_SHIPMENT_STATUSES.includes(status);

export const formatShipmentStatus = (status) => {
  if (!status) return 'this status';
  return STATUS_LABELS[status] || String(status)
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const getDeleteAlternativeAction = (status) => {
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

export const buildShipmentDeleteBlockedMessage = (status) => {
  const statusLabel = formatShipmentStatus(status);
  const nextAction = getDeleteAlternativeAction(status);

  return {
    short: `Shipment is already ${statusLabel}; use ${nextAction} instead.`,
    medium: `This shipment is already ${statusLabel}, so it can no longer be deleted. Use ${nextAction} if you need to stop processing or clean up the record.`,
    detailed: `This shipment is currently ${statusLabel}, which means it has moved beyond the early pre-processing stage. Deletion is only available while a shipment is Draft or Ready for Pickup. To keep the operational audit trail intact, use ${nextAction} when that action is available for this shipment.`,
    tooltip: `Delete is only available for Draft or Ready for Pickup shipments. Current status: ${statusLabel}.`
  };
};

export const getShipmentDeleteErrorMessage = (error, status, variant = 'short') => {
  const backendMessage = error?.response?.data?.message;
  if (backendMessage && typeof backendMessage === 'object') {
    return backendMessage[variant] || backendMessage.short || error.message;
  }

  if (error?.response?.data?.code === 'SHIPMENT_DELETE_NOT_ALLOWED') {
    return buildShipmentDeleteBlockedMessage(error.response.data.status || status)[variant];
  }

  return error?.message || 'Unable to delete this shipment. Please try again or contact operations.';
};
