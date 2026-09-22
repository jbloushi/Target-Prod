import { STATUS_LABELS } from '../constants/statusConfig';

export const DELETABLE_SHIPMENT_STATUSES = ['draft', 'pending', 'ready_for_pickup', 'updated', 'cancelled'];

/**
 * Checks if a shipment has already been registered / booked with an external carrier
 */
export const hasCarrierBooking = (shipment) => {
  if (!shipment) return false;
  return Boolean(
    shipment.dhlTrackingNumber ||
    shipment.carrierShipmentId ||
    shipment.dhlConfirmed === true ||
    (shipment.awbUrl && shipment.status !== 'draft' && shipment.status !== 'pending')
  );
};

export const canDeleteShipmentStatus = (status, shipment = null, userRole = null) => {
  if (userRole && userRole !== 'admin') return false;
  if (shipment && hasCarrierBooking(shipment)) return false;
  return DELETABLE_SHIPMENT_STATUSES.includes(status);
};

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

export const buildShipmentDeleteBlockedMessage = (status, hasCarrier = false) => {
  const statusLabel = formatShipmentStatus(status);
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

export const getShipmentDeleteErrorMessage = (error, status, variant = 'short') => {
  const backendMessage = error?.response?.data?.message;
  if (backendMessage && typeof backendMessage === 'object') {
    return backendMessage[variant] || backendMessage.short || error.message;
  }

  if (error?.response?.data?.code === 'SHIPMENT_DELETE_NOT_ALLOWED') {
    return buildShipmentDeleteBlockedMessage(
      error.response.data.status || status,
      Boolean(error.response.data.hasCarrierBooking)
    )[variant];
  }

  return error?.response?.data?.error || error?.message || 'Unable to delete this shipment. Please try again or contact operations.';
};
