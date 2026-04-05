import React from 'react';
import styled from 'styled-components';

const Pill = styled.span`
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: 'Manrope', sans-serif;
    background: ${props => props.$bg};
    color: ${props => props.$color};
    border: none;
`;

const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();

    // Green - Finalized / Positive
    if (['delivered', 'completed', 'paid', 'success'].includes(s))
        return { bg: 'rgba(46, 125, 50, 0.1)', color: '#2e7d32' };

    // Blue - In Motion
    if (['in_transit', 'out_for_delivery', 'shipped', 'picked_up'].includes(s))
        return { bg: 'rgba(0, 80, 212, 0.08)', color: '#0050d4' };

    // Teal - Ready/Operational
    if (['ready_for_pickup', 'created', 'active', 'scheduled'].includes(s))
        return { bg: 'rgba(0, 101, 115, 0.08)', color: '#006573' };

    // Orange - Pending Action
    if (['pending', 'updated', 'draft', 'processing'].includes(s))
        return { bg: 'rgba(230, 138, 0, 0.08)', color: '#b36b00' };

    // Red - Blocked / Failed
    if (['exception', 'cancelled', 'failed', 'overdue', 'inactive'].includes(s))
        return { bg: 'rgba(179, 27, 37, 0.08)', color: '#b31b25' };

    return { bg: 'rgba(87, 92, 96, 0.08)', color: '#575c60' };
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
        <Pill $bg={colors.bg} $color={colors.color} style={style}>
            {label.replace(/_/g, ' ')}
        </Pill>
    );
};

export default StatusPill;
