import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const getBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (['delivered', 'completed', 'paid', 'success', 'matched_exact'].includes(s)) return 'badge-success';
    if (['in_transit', 'out_for_delivery', 'shipped', 'picked_up'].includes(s)) return 'badge-primary';
    if (['ready_for_pickup', 'created', 'active', 'scheduled'].includes(s)) return 'badge-info';
    if (['pending', 'updated', 'draft', 'processing'].includes(s)) return 'badge-warning';
    if (['exception', 'cancelled', 'failed', 'overdue', 'inactive', 'surcharge_discrepancy'].includes(s)) return 'badge-error';
    return 'badge-ghost';
};

const StatusPill = ({ status, $status, style, className = '' }) => {
    const { t } = useLanguage();
    const effectiveStatus = status || $status || '';
    const s = String(effectiveStatus).toLowerCase();
    const badgeClass = getBadgeClass(s);
    const key = `status_${s}`;
    const defaultLabel = s.replace(/_/g, ' ');
    const localizedLabel = t(key, defaultLabel);

    return (
        <span style={style} className={`badge badge-sm font-bold uppercase text-[10px] tracking-wider py-1.5 px-2.5 ${badgeClass} ${className}`}>
            {localizedLabel}
        </span>
    );
};

export default StatusPill;
