import React from 'react';
import { Box, Typography } from '@mui/material';

const STATUS_COLORS = {
    created:           '#6366f1',
    draft:             '#6366f1',
    shipment_draft_created: '#6366f1',
    pickup_scheduled:  '#3b82f6',
    ready_for_pickup:  '#3b82f6',
    picked_up:         '#0ea5e9',
    booked:            '#0ea5e9',
    in_transit:        '#f59e0b',
    out_for_delivery:  '#f97316',
    delivered:         '#22c55e',
    cancelled:         '#94a3b8',
    failed:            '#ef4444',
    exception:         '#ef4444',
    on_hold:           '#f59e0b',
    pending:           '#94a3b8',
    updated:           '#94a3b8',
    default:           '#94a3b8'
};

const getColor = (status) => {
    if (!status) return STATUS_COLORS.default;
    const key = String(status).toLowerCase().replace(/\s+/g, '_');
    return STATUS_COLORS[key] || STATUS_COLORS.default;
};

const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return {
        date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
};

const toText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const formatLocation = (location) => {
    if (!location) return '';
    if (typeof location === 'string') return location;
    if (typeof location === 'object') {
        return toText(location.formattedAddress || location.address || location.city || location.cityName);
    }
    return '';
};

const groupByDate = (events) => {
    const groups = {};
    events.forEach(event => {
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
                border: '1px dashed var(--border-color, #d9dee4)'
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
                                whiteSpace: 'nowrap'
                            }}>
                                {dateKey}
                            </Typography>
                            <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--border-color, #e2e8f0)' }} />
                        </Box>

                        {/* Events */}
                        <Box sx={{ position: 'relative', pl: '28px' }}>
                            {/* Vertical line */}
                            {events.length > 1 && (
                                <Box sx={{
                                    position: 'absolute', left: 8, top: 8, bottom: 0,
                                    width: '2px',
                                    bgcolor: 'var(--border-color, #e2e8f0)'
                                }} />
                            )}

                            {events.map((event, i) => {
                                const statusStr = typeof event.status === 'object'
                                    ? (event.status?.status || event.status?.name || 'update')
                                    : (event.status || 'update');
                                const color = getColor(statusStr);
                                const { time } = formatDate(event.timestamp);
                                const isLatest = dateIndex === 0 && i === 0;
                                const source = event.source === 'carrier' ? 'Carrier' : 'Platform';
                                const locationText = formatLocation(event.location);

                                return (
                                    <Box key={i} sx={{
                                        position: 'relative',
                                        pb: i < events.length - 1 ? 3 : 0,
                                        display: 'flex',
                                        gap: 0
                                    }}>
                                        {/* Dot */}
                                        <Box sx={{
                                            position: 'absolute',
                                            left: -20,
                                            top: 3,
                                            width: isLatest ? 14 : 10,
                                            height: isLatest ? 14 : 10,
                                            borderRadius: '50%',
                                            bgcolor: color,
                                            border: `2px solid white`,
                                            boxShadow: isLatest ? `0 0 0 3px ${color}33` : `0 0 0 2px ${color}22`,
                                            zIndex: 1,
                                            transition: 'all 0.2s'
                                        }} />

                                        {/* Content */}
                                        <Box sx={{ flex: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <Typography sx={{
                                                    fontSize: '13px',
                                                    fontWeight: isLatest ? 700 : 500,
                                                    color: isLatest ? 'var(--text-primary, #1a1f2e)' : 'var(--text-primary, #2a2f32)',
                                                    lineHeight: 1.4
                                                }}>
                                                    {event.description || statusStr}
                                                </Typography>
                                                <Typography sx={{
                                                    fontSize: '12px',
                                                    fontWeight: isLatest ? 700 : 400,
                                                    color: isLatest ? color : 'var(--text-secondary)',
                                                    whiteSpace: 'nowrap',
                                                    ml: 2
                                                }}>
                                                    {time}
                                                </Typography>
                                            </Box>

                                            <Box sx={{ display: 'flex', gap: 1, mt: 0.4, alignItems: 'center' }}>
                                                {locationText && (
                                                    <>
                                                        <Typography sx={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                            {locationText}
                                                        </Typography>
                                                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'var(--border-color)' }} />
                                                    </>
                                                )}
                                                <Typography sx={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: isLatest ? color : 'var(--text-secondary)'
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
