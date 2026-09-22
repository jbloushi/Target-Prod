export const normalizeCarrierDisplayText = (value = '') => (
  String(value || '')
    .replace(/\bDHL\b/gi, 'DGR')
);

export const getCarrierDisplayName = (carrierCode, fallback = '', isTest = false) => {
  const code = String(carrierCode || fallback || '').toUpperCase();
  const testSuffix = isTest ? ' (Test Sandbox API)' : '';
  if (code === 'INTERNAL') return `Target Local Fleet${testSuffix}`;
  if (code === 'DGR' || code === 'DHL') return `Target International Air (DHL DGR)${testSuffix}`;
  if (code === 'OTE' || code === 'LOGESTECHS') return `Target GCC Express (OTE)${testSuffix}`;
  return `${carrierCode || fallback || ''}${testSuffix}`;
};

export const getStatusBadgeInfo = (status) => {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'draft':
      return { label: 'Draft', color: 'default', variant: 'outlined' };
    case 'pending':
      return { label: 'Pending Review', color: 'warning', variant: 'filled' };
    case 'booked':
    case 'pickup_requested':
      return { label: 'Pickup Scheduled', color: 'info', variant: 'outlined' };
    case 'ready_for_pickup':
      return { label: 'Ready for Pickup', color: 'info', variant: 'outlined' };
    case 'picked_up':
      return { label: 'Picked Up by Driver', color: 'info', variant: 'filled' };
    case 'received_at_hub':
      return { label: 'Received at Hub', color: 'primary', variant: 'filled' };
    case 'verified':
      return { label: 'Hub Verified & Weighed', color: 'success', variant: 'outlined' };
    case 'in_transit':
      return { label: 'In Transit', color: 'primary', variant: 'outlined' };
    case 'out_for_delivery':
      return { label: 'Out for Delivery', color: 'secondary', variant: 'filled' };
    case 'delivered':
      return { label: 'Delivered', color: 'success', variant: 'filled' };
    case 'rto_in_transit':
      return { label: 'Return in Transit', color: 'warning', variant: 'filled' };
    case 'returned':
      return { label: 'Returned to Shipper', color: 'error', variant: 'outlined' };
    case 'exception':
      return { label: 'Exception / Hold', color: 'error', variant: 'filled' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'default', variant: 'outlined' };
    default:
      return { label: String(status || '').replace(/_/g, ' '), color: 'default', variant: 'outlined' };
  }
};

export const requiresManualPricing = (shipmentOrRate = {}) => (
  shipmentOrRate?.requiresManualPricing === true
  || shipmentOrRate?.pricingSnapshot?.requiresManualPricing === true
);

const LOCATION_SUFFIX_PATTERNS = [
  /\s+KUWAIT[-\s](?:KUWAIT|KW)$/i,
  /\s+ABU DHABI[-\s](?:UNITED ARAB EMIRATES|AE)$/i,
  /\s+DUBAI[-\s](?:UNITED ARAB EMIRATES|AE)$/i,
  /\s+CINCINNATI(?: HUB)?[-\s](?:US|USA|UNITED STATES)$/i,
  /\s+ERLANGER[-\s](?:US|USA|UNITED STATES)$/i
];

const trimLocationSuffix = (value = '') => {
  let text = normalizeCarrierDisplayText(value).trim();

  LOCATION_SUFFIX_PATTERNS.forEach((pattern) => {
    text = text.replace(pattern, '');
  });

  return text
    .replace(/\s+at$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const getEventDisplayMessage = (event, fallback = 'Tracking update') => {
  const rawMessage = event?.description || event?.status || fallback;
  return trimLocationSuffix(rawMessage) || normalizeCarrierDisplayText(fallback);
};
