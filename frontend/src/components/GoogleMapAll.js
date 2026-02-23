import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Box, Typography, Alert, CircularProgress, Chip } from '@mui/material';

const libraries = ['places'];

const containerStyle = {
    width: '100%',
    height: '100%'
};

const defaultCenter = {
    lat: 29.3759,
    lng: 47.9774 // Kuwait as default
};

// Status color mapping
const statusColors = {
    pending: '#9e9e9e',
    in_transit: '#1976d2',
    out_for_delivery: '#ff9800',
    delivered: '#4caf50',
    exception: '#f44336'
};

const GoogleMapAll = ({ shipments }) => {
    const [selectedShipment, setSelectedShipment] = useState(null);
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
    });

    // Extract coordinates from shipments
    const markers = useMemo(() => {
        if (!shipments || !Array.isArray(shipments)) return [];

        return shipments.map(shipment => {
            if (!shipment?.currentLocation) return null;

            const location = shipment.currentLocation;
            let coords = null;

            // Handle array format: [lng, lat]
            if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
                coords = { lat: location.coordinates[1], lng: location.coordinates[0] };
            }
            // Handle separate lat/lng fields
            else if (location.latitude && location.longitude) {
                coords = { lat: location.latitude, lng: location.longitude };
            }

            if (!coords || coords.lat === 0 || coords.lng === 0) return null;

            return {
                ...shipment,
                position: coords,
                color: statusColors[shipment.status] || '#1976d2'
            };
        }).filter(Boolean);
    }, [shipments]);

    const onLoad = useCallback((map) => {
        if (markers.length > 0) {
            const bounds = new window.google.maps.LatLngBounds();
            markers.forEach(marker => {
                bounds.extend(marker.position);
            });
            map.fitBounds(bounds);
        }
    }, [markers]);

    if (!apiKey) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%" p={2}>
                <Alert severity="error">
                    Google Maps API key not configured. Set REACT_APP_GOOGLE_MAPS_API_KEY in your .env file.
                </Alert>
            </Box>
        );
    }

    if (loadError) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%" p={2}>
                <Alert severity="error">Error loading Google Maps. Check your API key.</Alert>
            </Box>
        );
    }

    if (!isLoaded) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%', height: '100%' }}>
            <GoogleMap
                mapContainerStyle={containerStyle}
                center={markers.length > 0 ? markers[0].position : defaultCenter}
                zoom={markers.length > 0 ? 6 : 4}
                onLoad={onLoad}
                options={{
                    streetViewControl: false,
                    mapTypeControl: false,
                }}
            >
                {markers.map((marker, index) => (
                    <Marker
                        key={marker.trackingNumber || index}
                        position={marker.position}
                        onClick={() => setSelectedShipment(marker)}
                        icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 10,
                            fillColor: marker.color,
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                        }}
                    />
                ))}

                {selectedShipment && (
                    <InfoWindow
                        position={selectedShipment.position}
                        onCloseClick={() => setSelectedShipment(null)}
                    >
                        <Box sx={{ p: 1, minWidth: 200 }}>
                            <Typography variant="subtitle2" fontWeight="bold">
                                {selectedShipment.trackingNumber}
                            </Typography>
                            <Chip
                                label={(selectedShipment.status || 'unknown').replace(/_/g, ' ')}
                                size="small"
                                sx={{
                                    mt: 0.5,
                                    bgcolor: selectedShipment.color,
                                    color: 'white',
                                    textTransform: 'capitalize'
                                }}
                            />
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                {selectedShipment.currentLocation?.address || 'No address'}
                            </Typography>
                        </Box>
                    </InfoWindow>
                )}
            </GoogleMap>
        </Box>
    );
};

export default GoogleMapAll;
