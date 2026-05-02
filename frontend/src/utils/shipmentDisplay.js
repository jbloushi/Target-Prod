export const normalizeCarrierDisplayText = (value = '') => (
  String(value || '').replace(/\bDHL\b/gi, 'DGR')
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
