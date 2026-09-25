import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { STATUS_CONFIG } from '../../tokens/kineticHorizon';

/**
 * Standardized DaisyUI Status Badge with live pulsing beacon for active movement
 */
export const StatusBadge = ({ status = 'draft', size = 'sm', className = '' }) => {
    const { t } = useLanguage();
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.in_transit || {
        label: status,
        color: '#0050d4',
        bg: '#ebf0fc',
        border: '#c7d7fe'
    };

    const isActiveMovement = ['in_transit', 'out_for_delivery', 'picked_up'].includes(status);
    const isException = ['exception', 'failed', 'cancelled'].includes(status);

    const sizeClasses = {
        xs: 'text-[9.5px] px-2 py-0.5',
        sm: 'text-[10.5px] px-2.5 py-0.5',
        md: 'text-xs px-3 py-1',
    }[size] || 'text-[10.5px] px-2.5 py-0.5';

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-bold select-none border transition-all ${sizeClasses} ${className}`}
            style={{
                backgroundColor: cfg.bg,
                color: cfg.color,
                borderColor: cfg.border,
            }}
        >
            {isActiveMovement ? (
                <span className="relative flex h-2 w-2">
                    <span 
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ backgroundColor: cfg.color }}
                    />
                    <span 
                        className="relative inline-flex rounded-full h-2 w-2"
                        style={{ backgroundColor: cfg.color }}
                    />
                </span>
            ) : (
                <span 
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: cfg.color }}
                />
            )}
            <span className="capitalize">{t(`status_${status}`, cfg.label)}</span>
        </span>
    );
};

export default StatusBadge;
