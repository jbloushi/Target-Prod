import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { getGoogleMapsApiKey } from '../utils/env';

const libraries = ['places'];

const mapContainerStyle = {
  width: '100%',
  height: '350px',
  borderRadius: '12px',
};

const defaultCenter = { lat: 29.3759, lng: 47.9774 }; // Kuwait City / GCC regional default

export const LocationPicker = ({ initialLocation, fallbackLocation, onLocationChange }) => {
  const apiKey = getGoogleMapsApiKey();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [map, setMap] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Determine initial center
  const getValidCoords = (loc) => {
    if (!loc) return null;
    if (Array.isArray(loc.coordinates) && loc.coordinates[0] != null && loc.coordinates[1] != null) {
      const lng = Number(loc.coordinates[0]);
      const lat = Number(loc.coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        return { lat, lng };
      }
    }
    if (loc.latitude != null && loc.longitude != null) {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        return { lat, lng };
      }
    }
    return null;
  };

  const startLocation = useMemo(() => {
    return getValidCoords(initialLocation) || getValidCoords(fallbackLocation) || defaultCenter;
  }, [initialLocation, fallbackLocation]);

  const [markerPosition, setMarkerPosition] = useState(startLocation);

  const onMapClick = useCallback((e) => {
    const newPos = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    setMarkerPosition(newPos);
    onLocationChange(newPos);
    setLocationError(null);
  }, [onLocationChange]);

  const onMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
  }, []);

  // Get current location from browser
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setGettingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setMarkerPosition(newPos);
        onLocationChange(newPos);
        setGettingLocation(false);

        if (map) {
          map.panTo(newPos);
          map.setZoom(15);
        }
      },
      (error) => {
        let errorMsg = 'Unable to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied. Please enable location permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location unavailable';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out';
            break;
          default:
            errorMsg = 'Unknown location error';
        }
        setLocationError(errorMsg);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [map, onLocationChange]);

  // Update marker if initialLocation changes externally
  useEffect(() => {
    const coords = getValidCoords(initialLocation);
    if (coords && (coords.lat !== markerPosition.lat || coords.lng !== markerPosition.lng)) {
      setMarkerPosition(coords);
      if (map) {
        map.panTo(coords);
        map.setZoom(14);
      }
    }
  }, [initialLocation, map]);

  const markerRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: markerPosition,
        map: map,
        draggable: true,
        animation: window.google.maps.Animation.DROP,
      });

      markerRef.current.addListener('dragend', (e) => {
        const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setMarkerPosition(newPos);
        onLocationChange(newPos);
        setLocationError(null);
      });
    } else {
      markerRef.current.setPosition(markerPosition);
    }
  }, [map, markerPosition, onLocationChange]);

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
    };
  }, []);

  if (!apiKey || loadError) {
    return (
      <div className="card bg-base-100 border border-base-200 p-6 text-center space-y-4">
        <div className="space-y-1">
          <h4 className="font-black text-sm text-base-content">Interactive Map Preview Offline</h4>
          <p className="text-xs text-base-content/60">
            Map interface is unavailable. Specify GPS coordinates manually or use device location.
          </p>
        </div>

        {locationError && (
          <div className="alert alert-warning text-xs py-2 px-3">
            <span className="material-symbols-outlined text-base">warning</span>
            <span>{locationError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 text-left">
            <label className="text-xs font-bold text-base-content/70 uppercase">Latitude</label>
            <input
              type="number"
              step="any"
              value={markerPosition.lat || ''}
              onChange={(e) => {
                const newPos = { ...markerPosition, lat: parseFloat(e.target.value) || 0 };
                setMarkerPosition(newPos);
                onLocationChange(newPos);
              }}
              className="input input-bordered w-full text-xs font-mono focus:input-primary"
            />
          </div>
          <div className="space-y-1 text-left">
            <label className="text-xs font-bold text-base-content/70 uppercase">Longitude</label>
            <input
              type="number"
              step="any"
              value={markerPosition.lng || ''}
              onChange={(e) => {
                const newPos = { ...markerPosition, lng: parseFloat(e.target.value) || 0 };
                setMarkerPosition(newPos);
                onLocationChange(newPos);
              }}
              className="input input-bordered w-full text-xs font-mono focus:input-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={gettingLocation}
            className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
          >
            {gettingLocation ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className="material-symbols-outlined text-base">my_location</span>
            )}
            <span>{gettingLocation ? 'Detecting Location...' : 'Use My Location'}</span>
          </button>

          {markerPosition.lat !== 0 && markerPosition.lng !== 0 && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${markerPosition.lat},${markerPosition.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1.5"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              <span>Open External Map</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-base-200 rounded-xl overflow-hidden bg-base-100">
      <div className="p-3 bg-base-200/50 border-b border-base-200 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-base-content/70 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-primary">touch_app</span>
          <span>Click map or drag the pin marker to set coordinates</span>
        </span>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={gettingLocation}
          className="btn btn-primary btn-xs font-bold gap-1 shadow-sm"
        >
          {gettingLocation ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <span className="material-symbols-outlined text-xs">my_location</span>
          )}
          <span>{gettingLocation ? 'Locating...' : 'Use My GPS'}</span>
        </button>
      </div>

      {locationError && (
        <div className="alert alert-error text-xs py-2 px-3 rounded-none">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{locationError}</span>
        </div>
      )}

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={markerPosition.lat === 0 ? startLocation : markerPosition}
        zoom={startLocation.lat === 0 ? 2 : 12}
        onClick={onMapClick}
        onLoad={onMapLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        }}
      />
    </div>
  );
};

export default LocationPicker;
