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
        xs: 'text-[10.5px] px-2.5 py-0.5 font-bold',
        sm: 'text-xs px-3 py-1 font-extrabold',
        md: 'text-xs sm:text-sm px-3.5 py-1.5 font-black',
    }[size] || 'text-xs px-3 py-1 font-extrabold';

    const dotBg = cfg.dotColor || cfg.color;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full select-none border transition-all ${sizeClasses} ${className}`}
            style={{
                backgroundColor: cfg.bg,
                color: cfg.color,
                borderColor: cfg.border,
            }}
        >
            {isActiveMovement ? (
                <span className="relative flex h-2 w-2 shrink-0">
                    <span 
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ backgroundColor: dotBg }}
                    />
                    <span 
                        className="relative inline-flex rounded-full h-2 w-2"
                        style={{ backgroundColor: dotBg }}
                    />
                </span>
            ) : (
                <span 
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: dotBg }}
                />
            )}
            <span className="capitalize whitespace-nowrap">{t(`status_${status}`, cfg.label)}</span>
        </span>
    );
};

export default StatusBadge;
