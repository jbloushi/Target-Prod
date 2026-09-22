import React, { useState, useMemo } from 'react';

/**
 * MapFallbackCard
 * Graceful fallback component when Google Maps or Mapbox cannot be loaded
 * (offline, quota exceeded, invalid credentials, or missing API keys).
 * Provides address info, GPS coordinate badges, copy-to-clipboard, and external map links.
 * STRICT: Does NOT display or leak any .env or technical configuration names to users.
 */
const MapFallbackCard = ({
    address,
    coordinates,
    title = 'Interactive Map Offline',
    destinationUrl,
    shipment,
    onRetry,
    height = '100%',
    className = ''
}) => {
    const [copied, setCopied] = useState(false);

    // Extract coordinate info safely
    const coords = useMemo(() => {
        if (coordinates) {
            if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates[0] != null && coordinates[1] != null) {
                const first = Number(coordinates[0]);
                const second = Number(coordinates[1]);
                if (Number.isFinite(first) && Number.isFinite(second)) {
                    // Determine if [lng, lat] (GeoJSON standard) or [lat, lng]
                    // If first element is > 35, it's likely longitude in GCC (Kuwait lng ~48, lat ~29)
                    if (Math.abs(first) > 35 && Math.abs(second) < 35) {
                        return { lat: second, lng: first };
                    }
                    return { lat: first, lng: second };
                }
            }
            if (typeof coordinates === 'object' && coordinates.lat != null && coordinates.lng != null) {
                const lat = Number(coordinates.lat);
                const lng = Number(coordinates.lng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    return { lat, lng };
                }
            }
        }

        if (shipment) {
            const loc = shipment.currentLocation || shipment.destination || shipment.origin;
            if (loc) {
                if (loc.coordinates && Array.isArray(loc.coordinates) && loc.coordinates.length === 2 && loc.coordinates[0] != null && loc.coordinates[1] != null) {
                    const lat = Number(loc.coordinates[1]);
                    const lng = Number(loc.coordinates[0]);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        return { lat, lng };
                    }
                }
                if (loc.latitude != null && loc.longitude != null) {
                    const lat = Number(loc.latitude);
                    const lng = Number(loc.longitude);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        return { lat, lng };
                    }
                }
            }
        }

        // Kuwait City / GCC regional default coordinates
        return { lat: 29.3759, lng: 47.9774 };
    }, [coordinates, shipment]);

    // Extract address information
    const addressDetails = useMemo(() => {
        if (address) return { general: address };

        if (shipment) {
            const originStr = shipment.origin?.formattedAddress || shipment.origin?.address || shipment.origin?.city;
            const destStr = shipment.destination?.formattedAddress || shipment.destination?.address || shipment.destination?.city;
            const currentStr = shipment.currentLocation?.formattedAddress || shipment.currentLocation?.address;
            return {
                origin: originStr,
                destination: destStr,
                current: currentStr,
                general: currentStr || destStr || originStr
            };
        }

        return { general: 'Kuwait Operations Hub' };
    }, [address, shipment]);

    const googleMapsUrl = useMemo(() => {
        if (destinationUrl) return destinationUrl;
        if (coords && coords.lat && coords.lng) {
            return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
        }
        if (addressDetails.general) {
            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressDetails.general)}`;
        }
        return 'https://www.google.com/maps?q=Kuwait';
    }, [destinationUrl, coords, addressDetails]);

    const handleCopyCoordinates = () => {
        if (!coords) return;
        const text = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
            }).catch(() => {
                // Fallback for older browsers
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
            });
        } else {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    return (
        <div 
            className={`w-full flex flex-col justify-center items-center p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center select-none ${className}`}
            style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}
            role="region"
            aria-label="Map alternative view"
        >
            {/* Map Placeholder Icon */}
            <div className="w-14 h-14 mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center text-primary shadow-sm">
                <span className="material-symbols-outlined text-3xl" aria-hidden="true">
                    location_on
                </span>
            </div>

            {/* Title & Description */}
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                {title}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-5 leading-relaxed">
                The interactive map view is currently offline. You can view GPS coordinates or open the destination directly in Google Maps.
            </p>

            {/* Address Summary (if shipment available) */}
            {shipment && (addressDetails.origin || addressDetails.destination) && (
                <div className="w-full max-w-md bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 mb-4 text-start text-xs space-y-2">
                    {addressDetails.origin && (
                        <div className="flex items-start gap-2">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider text-[10px] min-w-[45px] pt-0.5">
                                Origin:
                            </span>
                            <span className="text-slate-700 dark:text-slate-200 truncate">
                                {addressDetails.origin}
                            </span>
                        </div>
                    )}
                    {addressDetails.destination && (
                        <div className="flex items-start gap-2">
                            <span className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider text-[10px] min-w-[45px] pt-0.5">
                                Dest:
                            </span>
                            <span className="text-slate-700 dark:text-slate-200 truncate">
                                {addressDetails.destination}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* GPS Coordinates Badge */}
            {coords && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-full bg-slate-200/70 dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300">
                    <span className="material-symbols-outlined text-sm text-slate-500" aria-hidden="true">
                        pin_drop
                    </span>
                    <span>
                        {coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E
                    </span>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3">
                {coords && (
                    <button
                        type="button"
                        onClick={handleCopyCoordinates}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all shadow-sm active:scale-95"
                    >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                            {copied ? 'check' : 'content_copy'}
                        </span>
                        <span>{copied ? 'Coordinates Copied' : 'Copy Coordinates'}</span>
                    </button>
                )}

                <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold kinetic-gradient text-white shadow-md shadow-blue-500/20 hover:opacity-95 active:scale-95 transition-all"
                >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                        open_in_new
                    </span>
                    <span>Open in Google Maps</span>
                </a>

                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                            refresh
                        </span>
                        <span>Retry</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default MapFallbackCard;
