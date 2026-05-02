import React from 'react';
import { getCountryCode, getLocationText } from '../utils/locationDisplay';

const flagStyle = {
  width: 18,
  height: 13,
  borderRadius: 2,
  boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
  flexShrink: 0
};

const FLAG_SVGS = {
  AE: (
    <svg viewBox="0 0 36 24" aria-hidden="true" focusable="false" style={flagStyle}>
      <rect width="36" height="8" x="0" y="0" fill="#00732f" />
      <rect width="36" height="8" x="0" y="8" fill="#fff" />
      <rect width="36" height="8" x="0" y="16" fill="#000" />
      <rect width="9" height="24" x="0" y="0" fill="#f00" />
    </svg>
  ),
  KW: (
    <svg viewBox="0 0 36 24" aria-hidden="true" focusable="false" style={flagStyle}>
      <rect width="36" height="8" x="0" y="0" fill="#007a3d" />
      <rect width="36" height="8" x="0" y="8" fill="#fff" />
      <rect width="36" height="8" x="0" y="16" fill="#ce1126" />
      <polygon points="0,0 11,8 11,16 0,24" fill="#000" />
    </svg>
  ),
  US: (
    <svg viewBox="0 0 36 24" aria-hidden="true" focusable="false" style={flagStyle}>
      <rect width="36" height="24" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((stripe) => (
        <rect key={stripe} width="36" height="1.85" x="0" y={stripe * 1.85} fill="#b22234" />
      ))}
      <rect width="14.4" height="12.9" x="0" y="0" fill="#3c3b6e" />
    </svg>
  )
};

const LocationLabel = ({ location, style = {}, className = '' }) => {
  const text = getLocationText(location);
  const countryCode = getCountryCode(location);
  const flag = FLAG_SVGS[countryCode];

  if (!text) return null;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        ...style
      }}
    >
      {flag}
      <span>{text}</span>
    </span>
  );
};

export default LocationLabel;
