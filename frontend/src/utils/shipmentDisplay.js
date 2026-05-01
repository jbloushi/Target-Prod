export const normalizeCarrierDisplayText = (value = '') => (
  String(value || '').replace(/\bDHL\b/gi, 'DGR')
);

export const getEventDisplayMessage = (event, fallback = 'Tracking update') => (
  normalizeCarrierDisplayText(event?.description || event?.status || fallback)
);
