import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Standardized Bilingual Trade Route Component with dynamic direction arrow and country tags
 */
export const TradeRouteDisplay = ({ origin, destination, size = 'sm', className = '' }) => {
    const { lang } = useLanguage();
    const isRTL = lang === 'ar';

    const originCity = typeof origin === 'string' ? origin : origin?.city || 'Kuwait';
    const originCountry = typeof origin === 'object' ? origin?.countryCode || origin?.country || 'KW' : 'KW';

    const destCity = typeof destination === 'string' ? destination : destination?.city || 'Riyadh';
    const destCountry = typeof destination === 'object' ? destination?.countryCode || destination?.country || 'SA' : 'SA';

    return (
        <div className={`flex flex-col ${className}`}>
            <div className="flex items-center gap-1.5 font-bold text-base-content text-xs sm:text-sm">
                <span>{originCity}</span>
                <span className="text-primary font-black px-0.5">{isRTL ? '←' : '→'}</span>
                <span>{destCity}</span>
            </div>
            <div className="text-[10px] text-base-content/50 font-medium">
                <span>{originCountry}</span>
                <span className="mx-1">{isRTL ? '←' : '→'}</span>
                <span>{destCountry}</span>
            </div>
        </div>
    );
};

export default TradeRouteDisplay;
