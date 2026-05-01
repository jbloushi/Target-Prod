const COUNTRY_NAME_TO_CODE = {
  KUWAIT: 'KW',
  'UNITED ARAB EMIRATES': 'AE',
  UAE: 'AE',
  'U.A.E': 'AE',
  USA: 'US',
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  BAHRAIN: 'BH',
  QATAR: 'QA',
  OMAN: 'OM',
  'SAUDI ARABIA': 'SA',
  KSA: 'SA'
};

const normalizeText = (value = '') => String(value).trim().replace(/\s+/g, ' ');

const countryCodeToFlag = (countryCode) => {
  const code = normalizeText(countryCode).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((char) => char.charCodeAt(0) + 127397));
};

const locationToText = (location) => {
  if (!location) return '';
  if (typeof location === 'string' || typeof location === 'number') return String(location);
  if (Array.isArray(location)) return location.map(locationToText).filter(Boolean).join(', ');
  if (typeof location !== 'object') return '';

  return normalizeText(
    location.formattedAddress
    || location.address
    || location.city
    || location.countryCode
    || ''
  );
};

const inferCountryCode = (location) => {
  if (!location) return '';
  if (typeof location === 'object' && !Array.isArray(location)) {
    const explicit = location.countryCode || location.country || location.address?.countryCode;
    if (explicit && /^[a-z]{2}$/i.test(String(explicit).trim())) {
      return String(explicit).trim().toUpperCase();
    }
    const explicitCountryName = normalizeText(explicit).toUpperCase();
    if (explicitCountryName) {
      for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
        if (explicitCountryName.includes(name)) return code;
      }
    }
  }

  const text = locationToText(location).toUpperCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (text.includes(name)) return code;
  }

  if (text.includes('CINCINNATI') || text.includes('ERLANGER') || text.includes('OHIO') || text.includes('KENTUCKY')) {
    return 'US';
  }

  const codeMatch = text.match(/(?:^|[^A-Z])([A-Z]{2})(?:$|[^A-Z])/);
  if (codeMatch && countryCodeToFlag(codeMatch[1])) return codeMatch[1];

  return '';
};

export const formatLocationWithFlag = (location) => {
  const text = locationToText(location);
  if (!text) return '';

  const flag = countryCodeToFlag(inferCountryCode(location));
  if (!flag || text.includes(flag)) return text;
  return `${flag} ${text}`;
};

export const getCountryFlag = (location) => countryCodeToFlag(inferCountryCode(location));
