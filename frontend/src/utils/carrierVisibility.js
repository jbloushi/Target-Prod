export const INTERNAL_CARRIER_ROLES = [
  'admin',
  'manager',
  'staff',
  'warehouse',
  'accounting',
  'driver',
];

export const MASKED_CARRIER_LABEL = 'Target Logistics';

export function canViewCarrier(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return INTERNAL_CARRIER_ROLES.includes(normalized);
}

const THIRD_PARTY_CARRIER_REGEX = new RegExp(
  [
    'Target\\s+GCC\\s*\\(\\s*OTE\\s*\\)',
    '\\bDHL\\s+Express\\b',
    '\\bAramex\\s+Express\\b',
    '\\bSMSA\\s+Express\\b',
    '\\bFedEx\\s+Express\\b',
    '\\bPosta\\s+Plus\\b',
    '\\bIW\\s+Express\\b',
    '\\bLogesTechs\\b',
    '\\bAramex\\b',
    '\\bFedEx\\b',
    '\\bSMSA\\b',
    '\\bDHL\\b',
    '\\bDGR2\\b',
    '\\bDGR\\b',
    '\\bARM\\b',
    '\\bFDX\\b',
    '\\bOTE\\b',
  ].join('|'),
  'gi'
);

export function sanitizeCarrierTextForRole(text, role) {
  if (text == null || typeof text !== 'string' || text === '') {
    return text;
  }
  if (canViewCarrier(role)) {
    return text;
  }

  return text
    .replace(THIRD_PARTY_CARRIER_REGEX, MASKED_CARRIER_LABEL)
    .replace(/Target Logistics\s*\(\s*Target Logistics\s*\)/gi, MASKED_CARRIER_LABEL)
    .replace(/Target Logistics(?:\s+Target Logistics)+/gi, MASKED_CARRIER_LABEL)
    .replace(/\s{2,}/g, ' ')
    .trim();
}
