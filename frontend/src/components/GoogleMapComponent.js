import React, { useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer, Rectangle, InfoWindow, Polyline } from '@react-google-maps/api';
import { Box, Paper, Alert, CircularProgress, Typography } from '@mui/material';

// Libraries to load from Google Maps API
const libraries = ['places'];

const containerStyle = {
    width: '100%',
    height: '100%'
};

const defaultCenter = {
    lat: 29.3759, // Kuwait City default
    lng: 47.9774
};

const GoogleMapComponent = ({ shipment }) => {
    const [map, setMap] = useState(null);
    const [directionsResponse, setDirectionsResponse] = useState(null);
    // Store extracted start/end from directions for markers
    const [routeStartEnd, setRouteStartEnd] = useState({ start: null, end: null });
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries
    });

    const { origin, destination, currentLocation } = shipment || {};

    // Helper to extract coordinates from different formats
    const extractCoords = (location) => {
        if (!location) return null;
        // Handle array format: [lng, lat]
        if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
            const lat = location.coordinates[1];
            const lng = location.coordinates[0];
            if (lat !== 0 || lng !== 0) return { lat, lng };
        }
        // Handle separate lat/lng fields from addressSchema
        if (location.latitude && location.longitude) {
            return { lat: location.latitude, lng: location.longitude };
        }
        return null;
    };

    // Extract safe coordinates using helper
    const safeOrigin = useMemo(() => extractCoords(origin), [origin]);
    const safeDest = useMemo(() => extractCoords(destination), [destination]);
    const safeCurrent = useMemo(() => extractCoords(currentLocation), [currentLocation]);

    const onLoad = useCallback(function callback(mapInstance) {
        setMap(mapInstance);
    }, []);

    const onUnmount = useCallback(function callback() {
        setMap(null);
    }, []);

    // Fetch directions
    React.useEffect(() => {
        if (!isLoaded) return;

        // Determine start and end points (prefer coordinates, fallback to address strings)
        let requestOrigin = safeOrigin;
        if (!requestOrigin && origin) {
            requestOrigin = origin.formattedAddress || origin.address || origin.city || origin.description;
        }

        let requestDestination = safeDest;
        if (!requestDestination && destination) {
            requestDestination = destination.formattedAddress || destination.address || destination.city || destination.description;
        }

        console.log('[Map] Request Origin:', requestOrigin);
        console.log('[Map] Request Destination:', requestDestination);

        if (requestOrigin && requestDestination) {
            const directionsService = new window.google.maps.DirectionsService();

            const waypoints = shipment?.checkpoints?.map(cp => {
                const coords = extractCoords(cp?.location);
                if (coords) {
                    return { location: coords, stopover: true };
                } else if (cp?.location?.address) {
                    return { location: cp.location.address, stopover: true };
                }
                return null;
            }).filter(Boolean) || [];

            directionsService.route({
                origin: requestOrigin,
                destination: requestDestination,
                waypoints: waypoints,
                travelMode: window.google.maps.TravelMode.DRIVING,
            }, (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) {
                    setDirectionsResponse(result);
                    setHighlightBounds(null); // Clear highlight if route found

                    // Extract start and end coordinates from the route
                    const route = result.routes?.[0];
                    if (route?.legs?.length > 0) {
                        const firstLeg = route.legs[0];
                        const lastLeg = route.legs[route.legs.length - 1];
                        const extractedStart = {
                            lat: firstLeg.start_location.lat(),
                            lng: firstLeg.start_location.lng()
                        };
                        const extractedEnd = {
                            lat: lastLeg.end_location.lat(),
                            lng: lastLeg.end_location.lng()
                        };
                        console.log('[Map] Extracted route start:', extractedStart);
                        console.log('[Map] Extracted route end:', extractedEnd);
                        setRouteStartEnd({
                            start: extractedStart,
                            end: extractedEnd
                        });
                    }

                    // Fit map to route bounds
                    if (map && route?.bounds) {
                        map.fitBounds(route.bounds);
                    }
                } else {
                    console.error(`[Map] Directions error: ${status}`);
                    // Fallback to plotting countries if route fails
                    fallbackToCountry();
                }
            });
        } else {
            // Fallback if origin/dest are missing
            fallbackToCountry();
        }

        function fallbackToCountry() {
            if (!map) return;
            const country = origin?.country || destination?.country || 'Kuwait'; // Default fallback
            console.log('[Map] Fallback to country bounds:', country);

            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ address: country }, (results, status) => {
                if (status === 'OK' && results[0] && results[0].geometry.viewport) {
                    map.fitBounds(results[0].geometry.viewport);
                }
            });
        }

        // Global Route Fallback (Geodesic Polyline)
        if (!directionsResponse) {
            const startPoint = safeOrigin;
            const endPoint = safeDest;

            if (startPoint && endPoint) {
                // We have coordinates, just draw the line
                setGlobalRoutePath([startPoint, endPoint]);
                if (map) {
                    const bounds = new window.google.maps.LatLngBounds();
                    bounds.extend(startPoint);
                    bounds.extend(endPoint);
                    map.fitBounds(bounds);
                }
            } else if (origin && destination) {
                // Try geocoding whatever address info we have
                const originQuery = origin.country || origin.formattedAddress || origin.address;
                const destQuery = destination.country || destination.formattedAddress || destination.address;

                if (originQuery && destQuery) {
                    const geocoder = new window.google.maps.Geocoder();
                    Promise.all([
                        new Promise(resolve => geocoder.geocode({ address: originQuery }, (res, status) => resolve(status === 'OK' ? res[0] : null))),
                        new Promise(resolve => geocoder.geocode({ address: destQuery }, (res, status) => resolve(status === 'OK' ? res[0] : null)))
                    ]).then(([originRes, destRes]) => {
                        if (originRes && destRes && map) {
                            const bounds = new window.google.maps.LatLngBounds();
                            if (originRes.geometry.viewport) bounds.union(originRes.geometry.viewport);
                            if (destRes.geometry.viewport) bounds.union(destRes.geometry.viewport);
                            map.fitBounds(bounds);

                            setGlobalRoutePath([
                                { lat: originRes.geometry.location.lat(), lng: originRes.geometry.location.lng() },
                                { lat: destRes.geometry.location.lat(), lng: destRes.geometry.location.lng() }
                            ]);
                        }
                    });
                }
            }
        }
    }, [isLoaded, safeOrigin, safeDest, origin, destination, shipment, map]);

    const [highlightBounds, setHighlightBounds] = useState(null);
    const [globalRoutePath, setGlobalRoutePath] = useState(null);

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
                <Alert severity="error">Error loading Google Maps</Alert>
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

    // Use coordinates from directions response if original coords are missing
    const originMarkerPos = safeOrigin || routeStartEnd.start;
    const destMarkerPos = safeDest || routeStartEnd.end;
    const currentMarkerPos = safeCurrent;

    // Debug logging for marker positions
    console.log('[Map] Render - originMarkerPos:', originMarkerPos);
    console.log('[Map] Render - destMarkerPos:', destMarkerPos);
    console.log('[Map] Render - routeStartEnd:', routeStartEnd);
    console.log('[Map] Will render origin marker:', !!originMarkerPos);
    console.log('[Map] Will render dest marker:', !!destMarkerPos);

    // Determine map center
    const mapCenter = currentMarkerPos || originMarkerPos || destMarkerPos || defaultCenter;

    return (
        <Paper elevation={3} sx={{ height: '100%', borderRadius: 2, overflow: 'hidden' }}>
            <GoogleMap
                mapContainerStyle={containerStyle}
                center={mapCenter}
                zoom={6}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    streetViewControl: false,
                    mapTypeControl: false
                }}
            >
                {/* Route Line - Gray outline (rendered first, below) */}
                {directionsResponse && (
                    <DirectionsRenderer
                        directions={directionsResponse}
                        options={{
                            suppressMarkers: true,
                            polylineOptions: {
                                strokeColor: '#666666', // Gray outline
                                strokeWeight: 8,
                                strokeOpacity: 0.6,
                                zIndex: 1
                            }
                        }}
                    />
                )}

                {/* Route Line - Red main line (rendered on top) */}
                {directionsResponse && (
                    <DirectionsRenderer
                        directions={directionsResponse}
                        options={{
                            suppressMarkers: true,
                            polylineOptions: {
                                strokeColor: '#E53935', // Red
                                strokeWeight: 5,
                                strokeOpacity: 1,
                                zIndex: 2
                            }
                        }}
                    />
                )}

                {/* History/Progress Markers - Red with Numbers */}
                {shipment?.history?.map((event, index) => {
                    if (!event.location) return null;
                    const pos = extractCoords(event.location);
                    if (!pos) return null;

                    return (
                        <Marker
                            key={`history-${index}`}
                            position={pos}
                            label={{
                                text: String(index + 1),
                                color: '#FFFFFF',
                                fontWeight: 'bold',
                                fontSize: '12px'
                            }}
                            icon={{
                                path: window.google.maps.SymbolPath.CIRCLE,
                                scale: 14,
                                fillColor: '#EF4444',
                                fillOpacity: 1,
                                strokeColor: '#991B1B',
                                strokeWeight: 2,
                                labelOrigin: new window.google.maps.Point(0, 0)
                            }}
                            title={`Update ${index + 1}: ${event.status} - ${event.description || ''}\n${new Date(event.timestamp).toLocaleString()}`}
                            zIndex={10 + index}
                        />
                    );
                })}

                {/* Origin Marker - Green Pin */}
                {originMarkerPos && (
                    <Marker
                        position={originMarkerPos}
                        icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 12,
                            fillColor: '#22C55E',
                            fillOpacity: 1,
                            strokeColor: '#166534',
                            strokeWeight: 3,
                        }}
                        title={`Origin: ${origin?.formattedAddress || origin?.city || 'Start'}`}
                        zIndex={100}
                    />
                )}

                {/* Destination Marker - Red Pin */}
                {destMarkerPos && (
                    <Marker
                        position={destMarkerPos}
                        icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 12,
                            fillColor: '#EF4444',
                            fillOpacity: 1,
                            strokeColor: '#991B1B',
                            strokeWeight: 3,
                        }}
                        title={`Destination: ${destination?.formattedAddress || destination?.city || 'End'}`}
                        zIndex={100}
                    />
                )}

                {/* Current Location Marker - Blue animated pulsing */}
                {currentMarkerPos && (
                    <Marker
                        position={currentMarkerPos}
                        icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 10,
                            fillColor: '#3B82F6',
                            fillOpacity: 1,
                            strokeColor: '#1E40AF',
                            strokeWeight: 3,
                        }}
                        title={`Current: ${currentLocation?.formattedAddress || 'In Transit'}`}
                        zIndex={200}
                    />
                )}
                {/* Country Highlighting (Fallback) */}
                {highlightBounds && (
                    <Rectangle
                        bounds={highlightBounds}
                        options={{
                            fillColor: '#FFA500',
                            fillOpacity: 0.1,
                            strokeColor: '#FF8C00',
                            strokeWeight: 2,
                            clickable: false
                        }}
                    />
                )}

                {/* Global Geodesic Polyline */}
                {globalRoutePath && !directionsResponse && (
                    <Polyline
                        path={globalRoutePath}
                        options={{
                            geodesic: true,
                            strokeColor: '#E53935',
                            strokeOpacity: 0.8,
                            strokeWeight: 4,
                            icons: [{
                                icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                                offset: '100%'
                            }]
                        }}
                    />
                )}
            </GoogleMap>
        </Paper>
    );
};

export default React.memo(GoogleMapComponent);
