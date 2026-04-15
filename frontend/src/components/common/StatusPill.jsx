import React from 'react';
import { Chip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

const StatusPill = ({ status, ...props }) => {
    const theme = useTheme();

    const getStatusColor = (status) => {
        const s = (status || '').toLowerCase();
        if (['delivered', 'completed', 'paid', 'active', 'success'].includes(s)) return 'success';
        if (['pending', 'updated', 'draft', 'processing'].includes(s)) return 'warning';
        if (['in_transit', 'shipped', 'out_for_delivery', 'created', 'picked_up', 'ready_for_pickup', 'scheduled'].includes(s)) return 'info';
        if (['exception', 'cancelled', 'failed', 'overdue', 'inactive'].includes(s)) return 'error';
        return 'default';
    };

    const colorKey = getStatusColor(status);
    const color = theme.palette[colorKey];

    return (
        <Chip
            label={(status || 'Unknown').replace(/_/g, ' ')}
            size="small"
            sx={{
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '0.7rem',
                letterSpacing: '0.05em',
                borderRadius: '6px',
                bgcolor: colorKey === 'default' ? alpha(theme.palette.text.primary, 0.1) : alpha(color.main, 0.15),
                color: colorKey === 'default' ? theme.palette.text.secondary : color.main,
                border: '1px solid',
                borderColor: colorKey === 'default' ? 'transparent' : alpha(color.main, 0.3),
                ...props.sx
            }}
            {...props}
        />
    );
};

export default StatusPill;
