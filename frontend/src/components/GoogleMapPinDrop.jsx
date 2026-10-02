import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { getGoogleMapsApiKey } from '../utils/env';
import { TK } from '../tokens/kineticHorizon';
import MapFallbackCard from './MapFallbackCard';
import { countries } from '../utils/countries';

const libraries = ['places'];

const mapContainerStyle = {
  width: '100%',
  height: '240px',
  borderRadius: '12px'
};

const defaultCenter = {
  lat: 29.3759,
  lng: 47.9774 // Kuwait City
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }]
    }
  ]
};

export const GoogleMapPinDrop = ({
  latitude,
  longitude,
  onLocationChange,
  addressLabel = '',
  height = '240px'
}) => {
  const apiKey = getGoogleMapsApiKey();
  const [showMap, setShowMap] = useState(true);
  const [position, setPosition] = useState({
    lat: Number(latitude) || defaultCenter.lat,
    lng: Number(longitude) || defaultCenter.lng
  });
  const [authFailed, setAuthFailed] = useState(() => Boolean(window.__googleMapsAuthFailed));
  const mapRef = useRef(null);

  useEffect(() => {
    const orig = window.gm_authFailure;
    window.gm_authFailure = () => {
      window.__googleMapsAuthFailed = true;
      setAuthFailed(true);
      if (typeof orig === 'function') orig();
    };
    if (window.__googleMapsAuthFailed) {
      setAuthFailed(true);
    }
  }, []);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries
  });

  useEffect(() => {
    if (latitude && longitude && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
      const newPos = { lat: Number(latitude), lng: Number(longitude) };
      setPosition(newPos);
      if (mapRef.current) {
        mapRef.current.panTo(newPos);
        if (typeof mapRef.current.setZoom === 'function') {
          mapRef.current.setZoom(15);
        }
      }
    }
  }, [latitude, longitude]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const reverseGeocode = useCallback(async (lat, lng) => {
    // 1. Try Google Maps Geocoder if loaded and active
    if (window.google?.maps?.Geocoder && !authFailed && !window.__googleMapsAuthFailed) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const response = await geocoder.geocode({ location: { lat, lng } });
        if (response.results && response.results.length > 0) {
          const place = response.results[0];
          let city = '';
          let countryCode = '';
          let postalCode = '';
          let state = '';
          let area = '';

          place.address_components.forEach(comp => {
            const types = comp.types || [];
            if (types.includes('locality')) city = comp.long_name;
            if (types.includes('country')) countryCode = comp.short_name;
            if (types.includes('postal_code')) postalCode = comp.long_name;
            if (types.includes('administrative_area_level_1')) state = comp.long_name;
            if (types.includes('sublocality') || types.includes('neighborhood')) area = comp.long_name;
          });

          const countryObj = countries.find(c => c.code === countryCode);

          if (onLocationChange) {
            onLocationChange({
              latitude: lat,
              longitude: lng,
              formattedAddress: place.formatted_address,
              city: city || (countryCode === 'KW' ? 'Kuwait City' : ''),
              country: countryObj?.name || '',
              countryCode: countryCode || 'KW',
              postalCode: postalCode || '',
              state: state || '',
              area: area || ''
            });
          }
          return;
        }
      } catch (err) {
        console.debug('Google Geocoder error, falling back to Nominatim:', err.message);
      }
    }

    // 2. High-reliability reverse geocode via Nominatim
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const countryCode = (addr.country_code || 'KW').toUpperCase();
        const countryObj = countries.find(c => c.code === countryCode);
        const city = addr.city || addr.town || addr.municipality || addr.state || (countryCode === 'KW' ? 'Kuwait City' : '');
        const street = addr.road || addr.pedestrian || addr.suburb || '';

        if (onLocationChange) {
          onLocationChange({
            latitude: lat,
            longitude: lng,
            formattedAddress: data.display_name,
            addr1: street,
            city,
            country: countryObj?.name || addr.country || '',
            countryCode,
            postalCode: addr.postcode || '',
            state: addr.state || '',
            area: addr.suburb || addr.neighbourhood || ''
          });
        }
        return;
      }
    } catch (e) {
      console.debug('Reverse geocode error:', e.message);
    }

    if (onLocationChange) {
      onLocationChange({ latitude: lat, longitude: lng });
    }
  }, [authFailed, onLocationChange]);

  const handleMapClick = (e) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPosition({ lat, lng });
    reverseGeocode(lat, lng);
  };

  const handleMarkerDragEnd = (e) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPosition({ lat, lng });
    reverseGeocode(lat, lng);
  };

  const handleNudge = (dLat, dLng) => {
    const newLat = Number((position.lat + dLat).toFixed(5));
    const newLng = Number((position.lng + dLng).toFixed(5));
    setPosition({ lat: newLat, lng: newLng });
    reverseGeocode(newLat, newLng);
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setPosition({ lat, lng });
          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
          }
          reverseGeocode(lat, lng);
        },
        (err) => {
          console.debug('Geolocation error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  return (
    <div style={{ flex: '1 1 100%', marginTop: 6 }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: `1px solid ${TK.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#D40511' }}>location_on</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: TK.text2 }}>
            Google Maps Pin: {position.lat ? `${position.lat.toFixed(4)}° N, ${position.lng.toFixed(4)}° E` : 'Kuwait City'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {showMap && (
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              style={{
                border: 'none', background: 'transparent', color: TK.primary, fontWeight: 700, fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>my_location</span>
              Current GPS
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowMap(m => !m)}
            style={{
              border: 'none', background: 'transparent', color: TK.primary, fontWeight: 700, fontSize: 12,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{showMap ? 'expand_less' : 'map'}</span>
            {showMap ? 'Hide Map' : 'Show Map'}
          </button>
        </div>
      </div>

      {/* Map Display */}
      {showMap && (
        <div style={{
          marginTop: 8, height, borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${TK.border}`, position: 'relative'
        }}>
          {isLoaded && apiKey && !loadError && !authFailed && !window.__googleMapsAuthFailed ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={position}
              zoom={15}
              onClick={handleMapClick}
              onLoad={onMapLoad}
              options={mapOptions}
            >
              <Marker
                position={position}
                draggable={true}
                onDragEnd={handleMarkerDragEnd}
                animation={window.google?.maps?.Animation?.DROP}
                title="Drag pin to adjust delivery location"
              />
            </GoogleMap>
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: height || '240px', background: '#e8eef3' }}>
              {/* Live Google Maps Embed with Pin */}
              <iframe
                title="Google Maps Location with Pin"
                width="100%"
                height="100%"
                style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
                loading="lazy"
                src={`https://maps.google.com/maps?q=${position.lat},${position.lng}&z=15&output=embed`}
              />

              {/* Pin Coordinates & Nudge Repositioning Controls */}
              <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 10,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', background: 'rgba(255, 255, 255, 0.96)',
                borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                fontSize: '11px', fontWeight: 'bold', color: '#1a1f23',
                border: '1px solid #e2e8f0'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#D40511' }}>location_on</span>
                <span>{position.lat ? `${position.lat.toFixed(4)}° N, ${position.lng.toFixed(4)}° E` : 'Pin Dropped'}</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, borderLeft: '1px solid #cbd5e1', paddingLeft: 8, marginLeft: 2 }}>
                  <button
                    type="button"
                    title="Nudge North"
                    onClick={() => handleNudge(0.001, 0)}
                    style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', fontSize: 10 }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    title="Nudge South"
                    onClick={() => handleNudge(-0.001, 0)}
                    style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', fontSize: 10 }}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    title="Nudge West"
                    onClick={() => handleNudge(0, -0.001)}
                    style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', fontSize: 10 }}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    title="Nudge East"
                    onClick={() => handleNudge(0, 0.001)}
                    style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', fontSize: 10 }}
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Direct Open in Google Maps */}
              <div style={{
                position: 'absolute', bottom: 10, right: 10, zIndex: 10,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', background: 'rgba(255, 255, 255, 0.92)',
                borderRadius: 8, fontSize: '10.5px', fontWeight: 'bold',
                boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
              }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#0050d4', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>
                  <span>Google Maps</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleMapPinDrop;
