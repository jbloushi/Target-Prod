import React from 'react';
import { Box, Paper, Typography, alpha, useTheme } from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import WarningIcon from '@mui/icons-material/Warning';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DepartureBoardIcon from '@mui/icons-material/DepartureBoard';

const KPIItem = ({ label, count, icon, color, active, onClick }) => {
    const theme = useTheme();
    const isActive = active;

    return (
        <Paper
            elevation={0}
            onClick={onClick}
            sx={{
                p: 2,
                minWidth: 140,
                cursor: 'pointer',
                borderRadius: 3,
                border: '1px solid',
                borderColor: isActive ? `${color}.main` : 'divider',
                bgcolor: isActive ? alpha(theme.palette[color].main, 0.08) : 'background.paper',
                transition: 'all 0.2s ease',
                '&:hover': {
                    borderColor: `${color}.main`,
                    transform: 'translateY(-2px)'
                }
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Box
                    sx={{
                        p: 0.8,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette[color].main, 0.1),
                        color: `${color}.main`
                    }}
                >
                    {icon}
                </Box>
                <Typography variant="h4" fontWeight="bold" color="text.primary">
                    {count}
                </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {label}
            </Typography>
        </Paper>
    );
};

const ShipmentsKPIStrip = ({ shipments, currentFilter, onFilterChange }) => {
    // Calculate Stats
    const stats = {
        total: shipments.length,
        pending_group: shipments.filter(s => ['draft', 'pending', 'updated', 'ready_for_pickup'].includes(s.status)).length,
        picked_up: shipments.filter(s => s.status === 'picked_up').length,
        in_transit: shipments.filter(s => ['in_transit', 'out_for_delivery', 'created'].includes(s.status)).length,
        delivered: shipments.filter(s => s.status === 'delivered').length,
        exception: shipments.filter(s => ['exception', 'cancelled', 'returned', 'failed_delivery'].includes(s.status)).length
    };

    const kpiData = [
        { key: 'all', label: 'All Shipments', count: stats.total, icon: <AssignmentIcon fontSize="small" />, color: 'primary' },
        { key: 'pending_group', label: 'Pending / Ready', count: stats.pending_group, icon: <PendingIcon fontSize="small" />, color: 'warning' },
        { key: 'picked_up', label: 'Picked Up', count: stats.picked_up, icon: <LocalShippingIcon fontSize="small" />, color: 'info' },
        { key: 'in_transit', label: 'In Transit', count: stats.in_transit, icon: <DepartureBoardIcon fontSize="small" />, color: 'secondary' },
        { key: 'delivered', label: 'Delivered', count: stats.delivered, icon: <CheckCircleIcon fontSize="small" />, color: 'success' },
        { key: 'exception', label: 'Exceptions', count: stats.exception, icon: <WarningIcon fontSize="small" />, color: 'error' },
    ];

    return (
        <Box
            sx={{
                display: 'flex',
                gap: 2,
                mb: 4,
                overflowX: 'auto',
                pb: 1,
                '::-webkit-scrollbar': { height: 6 },
                '::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'divider' }
            }}
        >
            {kpiData.map(({ key, ...kpi }) => (
                <KPIItem
                    key={key}
                    {...kpi}
                    active={currentFilter === key}
                    onClick={() => onFilterChange(key)}
                />
            ))}
        </Box>
    );
};

export default ShipmentsKPIStrip;
