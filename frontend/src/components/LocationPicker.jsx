import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Box, CircularProgress, Typography, Button, Alert, TextField, Stack } from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getGoogleMapsApiKey } from '../utils/env';

const libraries = ['places'];

const mapContainerStyle = {
    width: '100%',
    height: '350px',
    borderRadius: '8px'
};

const defaultCenter = { lat: 29.3759, lng: 47.9774 }; // Kuwait City / GCC regional default

const LocationPicker = ({ initialLocation, fallbackLocation, onLocationChange }) => {
    const apiKey = getGoogleMapsApiKey();

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
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
            lng: e.latLng.lng()
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
                    lng: position.coords.longitude
                };
                setMarkerPosition(newPos);
                onLocationChange(newPos);
                setGettingLocation(false);

                // Pan map to new location
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
    React.useEffect(() => {
        const coords = getValidCoords(initialLocation);
        if (coords && (coords.lat !== markerPosition.lat || coords.lng !== markerPosition.lng)) {
            setMarkerPosition(coords);
            if (map) {
                map.panTo(coords);
                map.setZoom(14);
            }
        }
    }, [initialLocation, initialLocation?.coordinates, initialLocation?.latitude, initialLocation?.longitude, map, markerPosition.lat, markerPosition.lng]);



    // We need a ref to keep track of the marker instance
    const markerRef = React.useRef(null);

    React.useEffect(() => {
        if (!map) return;

        // Create marker if not exists
        if (!markerRef.current) {
            markerRef.current = new window.google.maps.Marker({
                position: markerPosition,
                map: map,
                draggable: true,
                animation: window.google.maps.Animation.DROP,
            });

            markerRef.current.addListener('dragend', (e) => {
                const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                // Update state but don't trigger re-render of this effect loop if possible
                // We use setMarkerPosition, which triggers render.
                setMarkerPosition(newPos);
                onLocationChange(newPos);
                setLocationError(null);
            });
        } else {
            // Update position
            markerRef.current.setPosition(markerPosition);
        }

        // Cleanup function not strictly needed for singleton marker unless component unmounts
        return () => {
            if (markerRef.current) {
                // We don't remove it here because we want to reuse it.
                // But if the component unmounts, we should.
                // The cleanup runs on every dependency change.
                // So if we include markerPosition in dependency, it runs every time.
                // We should ONLY update position in a separate effect or manage carefully.
            }
        };
    }, [map, markerPosition, onLocationChange]);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (markerRef.current) {
                markerRef.current.setMap(null);
                markerRef.current = null;
            }
        };
    }, []);

    if (!apiKey || loadError) {
        return (
            <Box sx={{ mt: 2, p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', textAlign: 'center' }}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Interactive Map Preview Offline
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                    The map interface is currently unavailable. You can specify coordinates manually or use your device location.
                </Typography>

                {locationError && (
                    <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>{locationError}</Alert>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                    <TextField
                        label="Latitude"
                        size="small"
                        type="number"
                        inputProps={{ step: 'any' }}
                        value={markerPosition.lat || ''}
                        onChange={(e) => {
                            const newPos = { ...markerPosition, lat: parseFloat(e.target.value) || 0 };
                            setMarkerPosition(newPos);
                            onLocationChange(newPos);
                        }}
                        fullWidth
                    />
                    <TextField
                        label="Longitude"
                        size="small"
                        type="number"
                        inputProps={{ step: 'any' }}
                        value={markerPosition.lng || ''}
                        onChange={(e) => {
                            const newPos = { ...markerPosition, lng: parseFloat(e.target.value) || 0 };
                            setMarkerPosition(newPos);
                            onLocationChange(newPos);
                        }}
                        fullWidth
                    />
                </Stack>

                <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
                    <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={gettingLocation ? <CircularProgress size={16} color="inherit" /> : <MyLocationIcon />}
                        onClick={handleUseCurrentLocation}
                        disabled={gettingLocation}
                        sx={{ textTransform: 'none' }}
                    >
                        {gettingLocation ? 'Detecting Location...' : 'Use My Location'}
                    </Button>

                    {markerPosition.lat !== 0 && markerPosition.lng !== 0 && (
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<OpenInNewIcon />}
                            href={`https://www.google.com/maps/search/?api=1&query=${markerPosition.lat},${markerPosition.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ textTransform: 'none' }}
                        >
                            Open External Map
                        </Button>
                    )}
                </Stack>
            </Box>
        );
    }

    return (
        <Box sx={{ mt: 2, border: '1px solid #ccc', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 1, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption">
                    Click on map or drag the marker to set location
                </Typography>
                <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={gettingLocation ? <CircularProgress size={16} color="inherit" /> : <MyLocationIcon />}
                    onClick={handleUseCurrentLocation}
                    disabled={gettingLocation}
                    sx={{ textTransform: 'none' }}
                >
                    {gettingLocation ? 'Getting...' : 'Use My Location'}
                </Button>
            </Box>

            {locationError && (
                <Alert severity="error" sx={{ py: 0.5 }}>{locationError}</Alert>
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
                    gestureHandling: 'greedy'
                }}
            >
                {/* Marker is managed via useEffect below to ensure visibility */}
            </GoogleMap>
        </Box>
    );
};



export default LocationPicker;
