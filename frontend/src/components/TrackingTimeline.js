import React from 'react';
import {
    Box, Card, Typography, Divider, Chip
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import HomeIcon from '@mui/icons-material/Home';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

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

const TrackingTimeline = ({ history = [], currentStatus }) => {
    // Sort history newest first
    const sortedHistory = [...history].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    const groupedEvents = groupEventsByDate(sortedHistory);
    const dateKeys = Object.keys(groupedEvents);

    if (!history || history.length === 0) {
        return (
            <Box sx={{
                p: 4,
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.1)',
                textAlign: 'center'
            }}>
                <Typography sx={{ color: 'rgba(232, 234, 240, 0.5)', fontSize: '14px' }}>
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
                                color: isLatestDate ? '#00d9b8' : 'rgba(232, 234, 240, 0.4)',
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
                            <Box sx={{ flex: 1, height: '1px', background: 'linear-gradient(to right, rgba(255,255,255,0.1), transparent)' }} />
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
                                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)',
                                    zIndex: 0
                                }}
                            />

                            {events.map((event, eventIndex) => {
                                const statusStr = typeof event.status === 'object' ? (event.status?.status || event.status?.name || 'Update') : event.status;
                                const config = getStatusConfig(statusStr);
                                const IconComponent = config.icon;
                                const { time } = formatDate(event.timestamp);
                                const isFirst = dateIndex === 0 && eventIndex === 0;
                                const source = event.source === 'carrier' ? 'Global Network' : 'Logistics Center';

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
                                                        color: 'rgba(232, 234, 240, 0.9)',
                                                        fontSize: '14px'
                                                    }}
                                                >
                                                    {event.description || statusStr || config.label}
                                                </Typography>

                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                                                    {(event.location?.address || event.location?.formattedAddress || event.location) && (
                                                        <Typography variant="caption" sx={{ color: 'rgba(232, 234, 240, 0.4)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            {event.location.formattedAddress || event.location.address || event.location}
                                                        </Typography>
                                                    )}
                                                    <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)' }} />
                                                    <Typography variant="caption" sx={{ color: isFirst ? '#00d9b8' : 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                                                        {source}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: isFirst ? '#fff' : 'rgba(232, 234, 240, 0.3)',
                                                    whiteSpace: 'nowrap',
                                                    ml: 2,
                                                    fontWeight: isFirst ? 700 : 500
                                                }}
                                            >
                                                {time}
                                            </Typography>
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
