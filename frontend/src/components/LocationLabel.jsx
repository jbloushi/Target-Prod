import React from 'react';
import { getCountryCode, getFlagImageUrl, getLocationText } from '../utils/locationDisplay';

const flagStyle = {
  width: 18,
  height: 13,
  objectFit: 'cover',
  borderRadius: 2,
  boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
  flexShrink: 0
};

const LocationLabel = ({ location, style = {}, className = '' }) => {
  const text = getLocationText(location);
  const flagUrl = getFlagImageUrl(location);
  const countryCode = getCountryCode(location);

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
      {flagUrl && (
        <img
          src={flagUrl}
          alt={countryCode ? `${countryCode} flag` : ''}
          width="18"
          height="13"
          loading="lazy"
          style={flagStyle}
        />
      )}
      <span>{text}</span>
    </span>
  );
};

export default LocationLabel;
