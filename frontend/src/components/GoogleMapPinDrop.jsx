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
  const mapRef = useRef(null);

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
    if (!window.google?.maps?.Geocoder) return;
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
      } else if (onLocationChange) {
        onLocationChange({ latitude: lat, longitude: lng });
      }
    } catch (err) {
      console.debug('Reverse geocode error:', err.message);
      if (onLocationChange) {
        onLocationChange({ latitude: lat, longitude: lng });
      }
    }
  }, [onLocationChange]);

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
        }
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
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.primary }}>pin_drop</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: TK.text2 }}>
            Map Pin Coordinates: {position.lat ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : 'Auto-detected'}
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
            {showMap ? 'Hide Map' : 'Adjust Pin on Map'}
          </button>
        </div>
      </div>

      {/* Map Dropdown */}
      {showMap && (
        <div style={{
          marginTop: 8, height, borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${TK.border}`, position: 'relative'
        }}>
          {isLoaded && apiKey && !loadError ? (
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
            <MapFallbackCard
              address={addressLabel || 'Kuwait City, Kuwait'}
              coordinates={position}
              title="Pin Location Preview"
              height="100%"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleMapPinDrop;
