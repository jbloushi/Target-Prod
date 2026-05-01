import React from 'react';
import { Box, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';

// Mirrors StatusPill.jsx color logic for consistency across the app
const STATUS_COLORS = {
    // Pending action (amber)
    draft:                  '#b36b00',
    pending:                '#b36b00',
    updated:                '#b36b00',
    on_hold:                '#b36b00',
    // Operational / teal
    created:                '#006573',
    shipment_draft_created: '#006573',
    pickup_scheduled:       '#006573',
    ready_for_pickup:       '#006573',
    // In motion (brand blue)
    booked:                 '#0050d4',
    picked_up:              '#0050d4',
    in_transit:             '#0050d4',
    out_for_delivery:       '#0050d4',
    // Terminal — success
    delivered:              '#2e7d32',
    // Terminal — blocked/failed (brand red)
    exception:              '#b31b25',
    failed:                 '#b31b25',
    cancelled:              '#b31b25',
    default:                '#575c60',
};

const STATUS_ICONS = {
    delivered:        CheckCircleIcon,
    in_transit:       LocalShippingIcon,
    out_for_delivery: LocalShippingIcon,
    exception:        WarningAmberIcon,
    failed:           WarningAmberIcon,
    booked:           Inventory2Icon,
    picked_up:        BookmarkAddedIcon,
    ready_for_pickup: BookmarkAddedIcon,
    pickup_scheduled: BookmarkAddedIcon,
    on_hold:          PauseCircleIcon,
    cancelled:        CancelIcon,
};

const STATUS_LABELS = {
    delivered:        'Delivered',
    in_transit:       'In Transit',
    out_for_delivery: 'Out for Delivery',
    exception:        'Exception',
    failed:           'Failed',
    booked:           'Booked',
    picked_up:        'Picked Up',
    ready_for_pickup: 'Ready for Pickup',
    pickup_scheduled: 'Pickup Scheduled',
    on_hold:          'On Hold',
    cancelled:        'Cancelled',
    pending:          'Pending',
    draft:            'Draft',
    created:          'Created',
    updated:          'Updated',
};

const getColor = (status) => {
    if (!status) return STATUS_COLORS.default;
    const key = String(status).toLowerCase().replace(/\s+/g, '_');
    return STATUS_COLORS[key] || STATUS_COLORS.default;
};

const getIcon = (status) => {
    if (!status) return RadioButtonCheckedIcon;
    const key = String(status).toLowerCase().replace(/\s+/g, '_');
    return STATUS_ICONS[key] || RadioButtonCheckedIcon;
};

const getStatusLabel = (status) => {
    if (!status) return '';
    const key = String(status).toLowerCase().replace(/\s+/g, '_');
    return STATUS_LABELS[key] || String(status).replace(/_/g, ' ');
};

const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return {
        date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
};

const toText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const formatLocation = (location) => {
    if (!location) return '';
    const raw = typeof location === 'string'
        ? location
        : toText(location.formattedAddress || location.address || location.city || location.cityName);
    return raw && raw.toLowerCase() !== 'unknown' ? raw : '';
};

const groupByDate = (events) => {
    const groups = {};
    events.forEach((event) => {
        const { date } = formatDate(event.timestamp);
        if (!groups[date]) groups[date] = [];
        groups[date].push(event);
    });
    return groups;
};

const TrackingTimeline = ({ history = [], currentStatus }) => {
    const sorted = [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const grouped = groupByDate(sorted);
    const dateKeys = Object.keys(grouped);

    if (history.length === 0) {
        return (
            <Box sx={{
                p: 4, borderRadius: '12px', textAlign: 'center',
                background: 'var(--bg-secondary, #f4f6f8)',
                border: '1px dashed var(--border-color, #d9dee4)',
            }}>
                <Typography sx={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    No tracking events yet. Updates will appear here once the shipment is processed.
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: '4px 8px' }}>
            {dateKeys.map((dateKey, dateIndex) => {
                const events = grouped[dateKey];
                const isToday = dateIndex === 0;

                return (
                    <Box key={dateKey} sx={{ mb: 3 }}>
                        {/* Date header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                            <Typography sx={{
                                fontSize: '11px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: isToday ? 'var(--accent-primary, #0050d4)' : 'var(--text-secondary)',
                                whiteSpace: 'nowrap',
                            }}>
                                {dateKey}
                            </Typography>
                            <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--border-color, #e2e8f0)' }} />
                        </Box>

                        {/* Events */}
                        <Box sx={{ position: 'relative', pl: '32px' }}>
                            {/* Vertical connector line */}
                            {events.length > 1 && (
                                <Box sx={{
                                    position: 'absolute', left: 8, top: 10, bottom: 0,
                                    width: '2px',
                                    bgcolor: 'var(--border-color, #e2e8f0)',
                                }} />
                            )}

                            {events.map((event, i) => {
                                const statusStr = typeof event.status === 'object'
                                    ? (event.status?.status || event.status?.name || 'update')
                                    : (event.status || 'update');

                                const color = getColor(statusStr);
                                const IconComponent = getIcon(statusStr);
                                const statusLabel = getStatusLabel(statusStr);
                                const { time } = formatDate(event.timestamp);
                                const isLatest = dateIndex === 0 && i === 0;
                                const source = event.source === 'carrier' ? 'Carrier' : 'Platform';
                                const locationText = formatLocation(event.location);
                                const dotSize = isLatest ? 20 : 14;

                                return (
                                    <Box key={i} sx={{
                                        position: 'relative',
                                        pb: i < events.length - 1 ? 3 : 0,
                                        display: 'flex',
                                        gap: 0,
                                    }}>
                                        {/* Icon dot */}
                                        <Box sx={{
                                            position: 'absolute',
                                            left: -(dotSize / 2) - 8,
                                            top: 2,
                                            width: dotSize,
                                            height: dotSize,
                                            borderRadius: '50%',
                                            bgcolor: color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: isLatest ? `0 0 0 5px ${color}25` : `0 0 0 2px ${color}18`,
                                            zIndex: 1,
                                            transition: 'all 0.2s',
                                        }}>
                                            <IconComponent sx={{
                                                color: 'white',
                                                fontSize: isLatest ? '11px' : '8px',
                                            }} />
                                        </Box>

                                        {/* Content */}
                                        <Box sx={{
                                            flex: 1,
                                            borderLeft: isLatest ? `3px solid ${color}` : '3px solid transparent',
                                            pl: isLatest ? 1.5 : 0,
                                            borderRadius: isLatest ? '0 6px 6px 0' : 0,
                                            transition: 'border-color 0.2s',
                                        }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Typography sx={{
                                                        fontSize: '13px',
                                                        fontWeight: isLatest ? 700 : 500,
                                                        color: 'var(--text-primary, #2a2f32)',
                                                        lineHeight: 1.4,
                                                    }}>
                                                        {event.description || statusStr}
                                                    </Typography>
                                                    {isLatest && statusLabel && (
                                                        <Box sx={{
                                                            fontSize: '10px',
                                                            fontWeight: 700,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.07em',
                                                            color: color,
                                                            bgcolor: `${color}15`,
                                                            px: 0.9,
                                                            py: 0.3,
                                                            borderRadius: '4px',
                                                            lineHeight: 1.5,
                                                        }}>
                                                            {statusLabel}
                                                        </Box>
                                                    )}
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                                                    {isLatest && (
                                                        <Box sx={{
                                                            fontSize: '9px',
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.1em',
                                                            color: '#ffffff',
                                                            bgcolor: color,
                                                            px: 0.75,
                                                            py: 0.3,
                                                            borderRadius: '4px',
                                                        }}>
                                                            LATEST
                                                        </Box>
                                                    )}
                                                    <Typography sx={{
                                                        fontSize: '12px',
                                                        fontWeight: isLatest ? 700 : 400,
                                                        color: isLatest ? color : 'var(--text-secondary)',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {time}
                                                    </Typography>
                                                </Box>
                                            </Box>

                                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                                {locationText && (
                                                    <>
                                                        <Typography sx={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                            📍 {locationText}
                                                        </Typography>
                                                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'var(--border-color)' }} />
                                                    </>
                                                )}
                                                <Typography sx={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: isLatest ? color : 'var(--text-secondary)',
                                                }}>
                                                    {source}
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
