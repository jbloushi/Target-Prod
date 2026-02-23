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
    'created': { icon: InventoryIcon, color: '#2196F3', label: 'Created' },
    'pickup_scheduled': { icon: AccessTimeIcon, color: '#FF9800', label: 'Pickup Scheduled' },
    'ready_for_pickup': { icon: InventoryIcon, color: '#FF9800', label: 'Ready for Pickup' },
    'picked_up': { icon: LocalShippingIcon, color: '#4CAF50', label: 'Picked Up' },
    'in_transit': { icon: FlightTakeoffIcon, color: '#9C27B0', label: 'In Transit' },
    'out_for_delivery': { icon: LocalShippingIcon, color: '#00BCD4', label: 'Out for Delivery' },
    'delivered': { icon: CheckCircleIcon, color: '#4CAF50', label: 'Delivered' },
    'exception': { icon: AccessTimeIcon, color: '#F44336', label: 'Exception' },
    'pending': { icon: AccessTimeIcon, color: '#757575', label: 'Pending' },
    'updated': { icon: AccessTimeIcon, color: '#FF9800', label: 'Updated (Review)' },
    'default': { icon: AccessTimeIcon, color: '#757575', label: 'Update' }
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
            <Card sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                    📦 Tracking History
                </Typography>
                <Typography color="text.secondary">
                    No tracking events yet. Check back soon for updates.
                </Typography>
            </Card>
        );
    }

    return (
        <Card sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                📦 Tracking History
                {currentStatus && (
                    <Chip
                        label={currentStatus}
                        size="small"
                        color={currentStatus === 'delivered' ? 'success' : 'primary'}
                        sx={{ ml: 1 }}
                    />
                )}
            </Typography>
            <Divider sx={{ mb: 3 }} />

            {dateKeys.map((dateKey, dateIndex) => {
                const events = groupedEvents[dateKey];
                const isLatestDate = dateIndex === 0;

                return (
                    <Box key={dateKey} sx={{ mb: 3 }}>
                        {/* Date Header */}
                        <Typography
                            variant="subtitle2"
                            fontWeight="bold"
                            sx={{
                                color: isLatestDate ? 'primary.main' : 'text.secondary',
                                mb: 2,
                                textTransform: 'uppercase',
                                letterSpacing: 1
                            }}
                        >
                            {dateKey}
                        </Typography>

                        {/* Events for this date */}
                        <Box sx={{ position: 'relative', pl: 4 }}>
                            {/* Vertical Timeline Line */}
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: 12,
                                    top: 0,
                                    bottom: 0,
                                    width: 2,
                                    bgcolor: 'divider',
                                    zIndex: 0
                                }}
                            />

                            {events.map((event, eventIndex) => {
                                const statusStr = typeof event.status === 'object' ? (event.status?.status || event.status?.name || 'Update') : event.status;
                                const config = getStatusConfig(statusStr);
                                const IconComponent = config.icon;
                                const { time } = formatDate(event.timestamp);
                                const isFirst = dateIndex === 0 && eventIndex === 0;

                                return (
                                    <Box
                                        key={eventIndex}
                                        sx={{
                                            position: 'relative',
                                            pb: 2,
                                            '&:last-child': { pb: 0 }
                                        }}
                                    >
                                        {/* Timeline Dot/Icon */}
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                left: -28,
                                                top: 0,
                                                width: 28,
                                                height: 28,
                                                borderRadius: '50%',
                                                bgcolor: isFirst ? config.color : 'background.paper',
                                                border: `2px solid ${config.color}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                zIndex: 1
                                            }}
                                        >
                                            <IconComponent
                                                sx={{
                                                    fontSize: 16,
                                                    color: isFirst ? 'white' : config.color
                                                }}
                                            />
                                        </Box>

                                        {/* Event Content */}
                                        <Box
                                            sx={{
                                                bgcolor: isFirst ? 'action.hover' : 'transparent',
                                                p: isFirst ? 2 : 1,
                                                borderRadius: 1,
                                                ml: 1
                                            }}
                                        >
                                            <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                                <Box>
                                                    <Typography
                                                        variant="body1"
                                                        fontWeight={isFirst ? 'bold' : 'medium'}
                                                        sx={{ color: isFirst ? config.color : 'text.primary' }}
                                                    >
                                                        {statusStr || config.label}
                                                    </Typography>
                                                    {event.description && (
                                                        <Typography variant="body2" color="text.secondary">
                                                            {event.description}
                                                        </Typography>
                                                    )}
                                                    {(event.location?.address || event.location?.formattedAddress) && (
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                            <HomeIcon sx={{ fontSize: 14 }} />
                                                            {event.location.address || event.location.formattedAddress}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    sx={{ whiteSpace: 'nowrap', ml: 2 }}
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
        </Card>
    );
};

export default TrackingTimeline;
