import React from 'react';
import {
    Box, Tooltip, Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';

/**
 * DGR-Style Tracking Timeline Component
 * 
 * Displays shipment history as a vertical timeline with:
 * - Date grouping
 * - Status icons
 * - Location and description
 * - Color-coded status indicators
 */

const statusConfig = {
    'created': { icon: InventoryIcon, color: '#00d9b8', label: 'Created' },
    'pickup_scheduled': { icon: AccessTimeIcon, color: '#00d9b8', label: 'Pickup Scheduled' },
    'ready_for_pickup': { icon: InventoryIcon, color: '#00d9b8', label: 'Ready for Pickup' },
    'picked_up': { icon: LocalShippingIcon, color: '#00d9b8', label: 'Picked Up' },
    'in_transit': { icon: FlightTakeoffIcon, color: '#00d9b8', label: 'In Transit' },
    'out_for_delivery': { icon: LocalShippingIcon, color: '#00d9b8', label: 'Out for Delivery' },
    'delivered': { icon: CheckCircleIcon, color: '#00d9b8', label: 'Delivered' },
    'exception': { icon: AccessTimeIcon, color: '#00d9b8', label: 'Exception' },
    'pending': { icon: AccessTimeIcon, color: '#00d9b8', label: 'Pending' },
    'updated': { icon: AccessTimeIcon, color: '#00d9b8', label: 'Updated (Review)' },
    'default': { icon: AccessTimeIcon, color: '#00d9b8', label: 'Update' }
};

const getStatusConfig = (status) => {
    const normalized = status?.toLowerCase()?.replace(/\s+/g, '_') || 'default';
    return statusConfig[normalized] || statusConfig.default;
};

const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return {
        date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
};

const toText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const formatAddressObject = (address) => {
    if (!address || typeof address !== 'object') return '';

    const street = Array.isArray(address.streetLines)
        ? address.streetLines.filter(Boolean).join(', ')
        : toText(address.streetLines || address.line1 || address.addressLine1);
    const city = toText(address.city);
    const postalCode = toText(address.postalCode);
    const countryCode = toText(address.countryCode);

    return [street, [city, postalCode].filter(Boolean).join(' '), countryCode]
        .filter(Boolean)
        .join(', ');
};

const formatLocation = (location) => {
    if (!location) return '';
    if (typeof location === 'string' || typeof location === 'number') return String(location);
    if (Array.isArray(location)) return location.map(toText).filter(Boolean).join(', ');
    if (typeof location !== 'object') return '';

    return (
        toText(location.formattedAddress)
        || toText(location.address)
        || formatAddressObject(location.addressObject)
        || formatAddressObject(location.address)
        || formatAddressObject(location)
    );
};

// Group events by date
const groupEventsByDate = (events) => {
    const groups = {};
    events?.forEach(event => {
        const { date } = formatDate(event.timestamp);
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(event);
    });
    return groups;
};

const normalizeText = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const timelineDedupKey = (event) => {
    const desc = normalizeText(event?.description);
    const loc = normalizeText(formatLocation(event?.location));
    return `${desc}|${loc}`;
};

const TrackingTimeline = ({ history = [], currentStatus }) => {
    // Collapse adjacent duplicate carrier checkpoints, then sort newest first
    const dedupedHistory = dedupeTrackingEvents(history, timelineDedupKey);
    const sortedHistory = [...dedupedHistory].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    const groupedEvents = groupEventsByDate(sortedHistory);
    const dateKeys = Object.keys(groupedEvents);

    if (!history || history.length === 0) {
        return (
            <Box sx={{
                p: 4,
                borderRadius: '16px',
                background: 'var(--surface-container-low, #ecf1f6)',
                border: '1px dashed var(--border-color, #d9dee4)',
                textAlign: 'center'
            }}>
                <Typography sx={{ color: 'var(--on-surface-variant, #575c60)', fontSize: '14px' }}>
                    No tracking events recorded yet. Check back soon for updates.
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 1 }}>
            {dateKeys.map((dateKey, dateIndex) => {
                const events = groupedEvents[dateKey];
                const isLatestDate = dateIndex === 0;

                return (
                    <Box key={dateKey} sx={{ mb: 4 }}>
                        {/* Date Header */}
                        <Typography
                            variant="subtitle2"
                            fontWeight="800"
                            sx={{
                                color: isLatestDate ? 'var(--accent-primary, #00bfa5)' : 'var(--on-surface-variant, #575c60)',
                                mb: 3,
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2
                            }}
                        >
                            {dateKey}
                            <Box sx={{ flex: 1, height: '1px', background: 'linear-gradient(to right, rgba(87, 92, 96, 0.18), transparent)' }} />
                        </Typography>

                        {/* Events for this date */}
                        <Box sx={{ position: 'relative', pl: 4 }}>
                            {/* Vertical Timeline Line */}
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: 12,
                                    top: 0,
                                    bottom: -20,
                                    width: 1,
                                    background: 'linear-gradient(to bottom, rgba(87, 92, 96, 0.2), transparent)',
                                    zIndex: 0
                                }}
                            />

                            {events.map((event, eventIndex) => {
                                const statusStr = typeof event.status === 'object' ? (event.status?.status || event.status?.name || 'Update') : event.status;
                                const config = getStatusConfig(statusStr);
                                const { time } = formatDate(event.timestamp);
                                const isFirst = dateIndex === 0 && eventIndex === 0;
                                const source = event.source === 'carrier' ? 'Global Network' : 'Logistics Center';
                                const locationText = formatLocation(event.location);

                                return (
                                    <Box
                                        key={eventIndex}
                                        sx={{
                                            position: 'relative',
                                            pb: 4,
                                            '&:last-child': { pb: 0 }
                                        }}
                                    >
                                        {/* Timeline Dot/Icon */}
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                left: -32,
                                                top: 0,
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                bgcolor: '#00d9b8',
                                                border: '2px solid rgba(0,217,184,0.3)',
                                                zIndex: 1,
                                                boxShadow: '0 0 10px rgba(0,217,184,0.2)',
                                                transition: 'all 0.3s ease'
                                            }}
                                        />

                                        {/* Event Content */}
                                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" sx={{ ml: 1 }}>
                                            <Box>
                                                <Typography
                                                    variant="body2"
                                                    fontWeight={isFirst ? 700 : 500}
                                                    sx={{
                                                        color: 'var(--on-surface, #2a2f32)',
                                                        fontSize: '14px'
                                                    }}
                                                >
                                                    {event.description || statusStr || config.label}
                                                </Typography>

                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                                                    {locationText && (
                                                        <Typography variant="caption" sx={{ color: 'var(--on-surface-variant, #575c60)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            {locationText}
                                                        </Typography>
                                                    )}
                                                    <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'rgba(87, 92, 96, 0.28)' }} />
                                                    <Typography variant="caption" sx={{ color: isFirst ? 'var(--accent-primary, #00bfa5)' : 'var(--on-surface-variant, #575c60)', fontWeight: 600 }}>
                                                        {source}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 2, whiteSpace: 'nowrap' }}>
                                                {event.occurrences > 1 && (
                                                    <Tooltip title={`Repeated ${event.occurrences} times — first at ${formatDate(event.firstTimestamp).time}`}>
                                                        <Box
                                                            component="span"
                                                            sx={{
                                                                fontSize: '10px',
                                                                fontWeight: 700,
                                                                px: 0.75,
                                                                py: '2px',
                                                                borderRadius: '999px',
                                                                bgcolor: 'rgba(0,191,165,0.12)',
                                                                color: 'var(--accent-primary, #00bfa5)',
                                                                lineHeight: 1.4,
                                                            }}
                                                        >
                                                            ×{event.occurrences}
                                                        </Box>
                                                    </Tooltip>
                                                )}
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: isFirst ? 'var(--on-surface, #2a2f32)' : 'var(--on-surface-variant, #575c60)',
                                                        fontWeight: isFirst ? 700 : 500
                                                    }}
                                                >
                                                    {time}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

export default TrackingTimeline;
