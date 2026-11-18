import React, { useState, useRef, useEffect } from 'react';
import { TK } from '../../../tokens/kineticHorizon';

/**
 * TradeLaneBarChartV2 - Responsive SVG Bar Chart for Trade Lane Corridors
 * Automatically stretches to fill 100% of container width on any device using ResizeObserver.
 * Properly resolves corridor codes (`d.code`, `d.name`, `d.nameAr`) so each bar displays its distinct lane.
 */
export const TradeLaneBarChartV2 = ({
    data = [],
    height,
    unit = 'pkgs',
    onSelect = null,
    isRTL = false,
    emptyMessage = 'No trade lane volume recorded'
}) => {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(600);
    const [hoveredIdx, setHoveredIdx] = useState(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateWidth = () => {
            const width = el.getBoundingClientRect().width;
            if (width > 0) setContainerWidth(Math.floor(width));
        };

        updateWidth();

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentRect.width > 0) {
                        setContainerWidth(Math.floor(entry.contentRect.width));
                    }
                }
            });
            observer.observe(el);
            return () => observer.disconnect();
        } else {
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }
    }, []);

    if (!Array.isArray(data) || data.length === 0) {
        return (
            <div
                ref={containerRef}
                className="w-full flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500 space-y-2 select-none"
                style={{ height: height || 200 }}
            >
                <span className="material-symbols-outlined text-3xl" aria-hidden="true">
                    connecting_airports
                </span>
                <span className="text-xs font-semibold">{emptyMessage}</span>
            </div>
        );
    }

    const items = data.slice(0, 7);
    const volumes = items.map(d => Number(d.volume) || 0);
    const maxVal = Math.max(...volumes, 10);
    const topCeil = Math.ceil((maxVal * 1.18) / 10) * 10;
    const peakVal = Math.max(...volumes);

    const isMobile = containerWidth < 460;
    const chartHeight = height || (isMobile ? 185 : 220);

    const padLeft = isRTL ? 14 : (isMobile ? 32 : 42);
    const padRight = isRTL ? (isMobile ? 32 : 42) : 14;
    const padBottom = isMobile ? 26 : 30;
    const padTop = 26;

    const chartW = Math.max(100, containerWidth - padLeft - padRight);
    const chartH = Math.max(80, chartHeight - padTop - padBottom);

    const barSlotW = chartW / items.length;
    const barW = Math.min(isMobile ? 28 : 50, Math.max(14, Math.floor(barSlotW * 0.56)));

    const gridSteps = [0, 0.33, 0.66, 1];

    return (
        <div
            ref={containerRef}
            className="w-full relative select-none overflow-hidden"
            role="region"
            aria-label="Trade Lane Corridors Chart"
        >
            <svg
                width={containerWidth}
                height={chartHeight}
                viewBox={`0 0 ${containerWidth} ${chartHeight}`}
                className="w-full h-auto block"
            >
                {/* Horizontal Grid Lines & Y-Labels */}
                {gridSteps.map((ratio, i) => {
                    const y = padTop + chartH * (1 - ratio);
                    const val = Math.round(topCeil * ratio);
                    return (
                        <g key={i}>
                            <line
                                x1={padLeft}
                                y1={y}
                                x2={containerWidth - padRight}
                                y2={y}
                                stroke="currentColor"
                                className="text-slate-200 dark:text-slate-800"
                                strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                                strokeWidth={1}
                            />
                            <text
                                x={isRTL ? containerWidth - padRight + 8 : padLeft - 8}
                                y={y + 3.5}
                                textAnchor={isRTL ? 'start' : 'end'}
                                fontSize={isMobile ? '9.5' : '10.5'}
                                fontWeight="700"
                                className="fill-slate-400 dark:fill-slate-500"
                                fontFamily="inherit"
                            >
                                {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                            </text>
                        </g>
                    );
                })}

                {/* Bars */}
                {items.map((d, i) => {
                    const val = Number(d.volume) || 0;
                    const barH = (val / topCeil) * chartH;

                    const slotIndex = isRTL ? (items.length - 1 - i) : i;
                    const slotX = padLeft + slotIndex * barSlotW;
                    const x = slotX + (barSlotW - barW) / 2;
                    const y = padTop + chartH - barH;

                    const isHovered = hoveredIdx === i;
                    const isPeak = val === peakVal && val > 0;

                    // Resolve distinct corridor code & full localized label from backend stats payload
                    const rawCode =
                        d.code ||
                        d.corridor ||
                        d.label ||
                        (d.id ? d.id.toUpperCase().replace('-', ' → ') : null) ||
                        `${d.origin || 'KW'} → ${d.destination || 'SA'}`;

                    const arDestination =
                        d.nameAr && d.nameAr.includes('⇄')
                            ? d.nameAr.split('⇄')[1]?.trim()
                            : d.nameAr;

                    const axisLabel = isRTL
                        ? arDestination || rawCode.replace('⇄', '←')
                        : isMobile
                        ? rawCode.replace(/\s*⇄\s*/g, '→').replace(/\s*→\s*/g, '→')
                        : rawCode.replace('⇄', '→');

                    const fullLabel = isRTL
                        ? d.nameAr || d.name || axisLabel
                        : (d.name || axisLabel).replace('⇄', '→');

                    const tooltipW = 148;
                    const tooltipX = Math.max(
                        6,
                        Math.min(containerWidth - tooltipW - 6, x + barW / 2 - tooltipW / 2)
                    );
                    const tooltipY = Math.max(2, y - 38);

                    const barFill = isHovered
                        ? TK.primaryDark
                        : isPeak
                        ? TK.primary
                        : '#3b82f6';
                    const barOpacity = isHovered || isPeak ? 1 : val > 0 ? 0.55 : 0.25;

                    return (
                        <g
                            key={d.id || d.code || i}
                            tabIndex={0}
                            role="button"
                            aria-label={`${fullLabel}: ${val} ${unit}${d.onTime ? `, ${d.onTime} SLA` : ''}`}
                            onClick={() => onSelect?.(d)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect?.(d);
                                }
                            }}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            onFocus={() => setHoveredIdx(i)}
                            onBlur={() => setHoveredIdx(null)}
                            className="cursor-pointer focus:outline-none"
                        >
                            {/* Hit Target */}
                            <rect
                                x={slotX}
                                y={padTop}
                                width={barSlotW}
                                height={chartH}
                                fill="transparent"
                            />

                            {/* Bar Rectangle */}
                            <rect
                                x={x}
                                y={val > 0 ? y : padTop + chartH - 3}
                                width={barW}
                                height={Math.max(barH, 3)}
                                rx={5}
                                ry={5}
                                fill={barFill}
                                fillOpacity={barOpacity}
                                className="transition-all duration-150"
                            />

                            {/* Direct Value Label Above Bar */}
                            {val > 0 && !isHovered && (
                                <text
                                    x={x + barW / 2}
                                    y={Math.max(14, y - 6)}
                                    textAnchor="middle"
                                    fontSize={isMobile ? '9.5' : '10.5'}
                                    fontWeight="800"
                                    className={
                                        isPeak
                                            ? 'fill-primary dark:fill-sky-400'
                                            : 'fill-slate-600 dark:fill-slate-300'
                                    }
                                    fontFamily="inherit"
                                >
                                    {val}
                                </text>
                            )}

                            {/* Distinct X-Axis Corridor Label */}
                            <text
                                x={x + barW / 2}
                                y={chartHeight - (isMobile ? 7 : 9)}
                                textAnchor="middle"
                                fontSize={isMobile ? '9.5' : '10.5'}
                                fontWeight={isHovered || isPeak ? '800' : '600'}
                                className={
                                    isHovered || isPeak
                                        ? 'fill-primary dark:fill-sky-400'
                                        : 'fill-slate-600 dark:fill-slate-400'
                                }
                                fontFamily="inherit"
                            >
                                {axisLabel}
                            </text>

                            {/* Rich Interactive Floating Tooltip */}
                            {isHovered && (
                                <g style={{ pointerEvents: 'none' }}>
                                    <rect
                                        x={tooltipX}
                                        y={tooltipY}
                                        width={tooltipW}
                                        height={34}
                                        rx={6}
                                        fill="#0f172a"
                                        stroke="#334155"
                                        strokeWidth={1}
                                    />
                                    <text
                                        x={tooltipX + tooltipW / 2}
                                        y={tooltipY + 13.5}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fontWeight="700"
                                        fill="#94a3b8"
                                        fontFamily="inherit"
                                    >
                                        {fullLabel}
                                    </text>
                                    <text
                                        x={tooltipX + tooltipW / 2}
                                        y={tooltipY + 26.5}
                                        textAnchor="middle"
                                        fontSize="10.5"
                                        fontWeight="800"
                                        fill="#ffffff"
                                        fontFamily="inherit"
                                    >
                                        {val} {unit} {d.onTime ? `• ${d.onTime} SLA` : ''}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default TradeLaneBarChartV2;
