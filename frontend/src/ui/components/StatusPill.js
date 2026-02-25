import React from 'react';
import styled from 'styled-components';

const Pill = styled.span`
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: ${props => props.$bg};
    color: ${props => props.$color};
    border: 1px solid ${props => props.$border};
`;

const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();

    // Green - Finalized / Positive
    if (['delivered', 'completed', 'paid', 'success'].includes(s))
        return { bg: 'rgba(76, 175, 80, 0.15)', color: '#4caf50', border: 'rgba(76, 175, 80, 0.3)' };

    // Blue - In Motion
    if (['in_transit', 'out_for_delivery', 'shipped', 'picked_up'].includes(s))
        return { bg: 'rgba(33, 150, 243, 0.15)', color: '#2196f3', border: 'rgba(33, 150, 243, 0.3)' };

    // Teal/Emerald - Ready/Operational
    if (['ready_for_pickup', 'created', 'active', 'scheduled'].includes(s))
        return { bg: 'rgba(0, 217, 184, 0.15)', color: '#00d9b8', border: 'rgba(0, 217, 184, 0.3)' };

    // Orange - Pending Action / In Progress
    if (['pending', 'updated', 'draft', 'processing'].includes(s))
        return { bg: 'rgba(255, 167, 38, 0.15)', color: '#ffa726', border: 'rgba(255, 167, 38, 0.3)' };

    // Red - Blocked / Failed
    if (['exception', 'cancelled', 'failed', 'overdue', 'inactive'].includes(s))
        return { bg: 'rgba(239, 83, 80, 0.15)', color: '#ef5350', border: 'rgba(239, 83, 80, 0.3)' };

    return { bg: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: 'transparent' };
};

const STATUS_LABELS = {
    'ready_for_pickup': 'Pending Approval',
    'updated': 'Feedback Provided',
    'pending': 'Draft / Pending',
    'picked_up': 'In Transit'
};

const StatusPill = ({ status, style }) => {
    const s = (status || '').toLowerCase();
    const colors = getStatusColor(s);
    const label = STATUS_LABELS[s] || status || 'Unknown';

    return (
        <Pill $bg={colors.bg} $color={colors.color} $border={colors.border} style={style}>
            {label.replace(/_/g, ' ')}
        </Pill>
    );
};

export default StatusPill;
