import React, { useState } from 'react';
import { TK } from '../../tokens/kineticHorizon';

/**
 * TradeLaneBarChart - Zero-Dependency SVG Bar Chart for Trade Lane Corridors
 * Matches the visual design of VolumeBarChart (Consignment Volume Distribution).
 */
export const TradeLaneBarChart = ({
  data = [],
  height = 160,
  unit = 'pkgs',
  onSelect = null,
  isRTL = false,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div 
        style={{ height }} 
        className="flex flex-col items-center justify-center text-base-content/40 space-y-1 select-none"
      >
        <span className="material-symbols-outlined text-2xl">bar_chart</span>
        <span className="text-xs font-semibold">{isRTL ? 'لا توجد بيانات مسارات' : 'No trade lane volume'}</span>
      </div>
    );
  }

  const items = data.slice(0, 6);
  const volumes = items.map(d => Number(d.volume) || 0);
  const maxVal = Math.max(...volumes, 10);
  const topCeil = Math.ceil((maxVal * 1.15) / 10) * 10;
  const peakVal = Math.max(...volumes);

  // SVG Coordinate Space
  const svgWidth = 480;
  const svgHeight = 155;
  const padLeft = 32;
  const padRight = 12;
  const padBottom = 26;
  const padTop = 22;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const barSlotW = chartW / items.length;
  const barW = Math.min(34, Math.max(16, barSlotW * 0.58));

  const gridSteps = [0, 0.5, 1];

  return (
    <div style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: '100%', height: height, display: 'block', overflow: 'visible' }}
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
                x2={svgWidth - padRight}
                y2={y}
                stroke="#e9edf2"
                strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                strokeWidth={1}
              />
              <text
                x={padLeft - 6}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9.5"
                fontWeight="700"
                fill={TK.text3}
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
          const x = padLeft + i * barSlotW + (barSlotW - barW) / 2;
          const y = padTop + chartH - barH;
          const isHovered = hoveredIdx === i;
          const isPeak = val === peakVal && val > 0;
          const destCode = (d.id?.split('-')[1] || d.id || '').toUpperCase();
          const label = `${d.flag2 || ''} ${destCode}`;

          return (
            <g
              key={d.id || i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelect && onSelect(destCode)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              {/* Invisible touch/click hit area */}
              <rect
                x={padLeft + i * barSlotW}
                y={padTop}
                width={barSlotW}
                height={chartH}
                fill="transparent"
              />

              {/* Bar Fill */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 3)}
                rx={5}
                ry={5}
                fill={isHovered ? TK.primaryDark : (isPeak ? TK.primary : 'rgba(0, 80, 212, 0.22)')}
                style={{
                  transition: 'fill 0.15s ease, transform 0.15s ease',
                  transformOrigin: `${x + barW / 2}px ${padTop + chartH}px`,
                  transform: isHovered ? 'scaleY(1.02)' : 'none',
                }}
              />

              {/* Peak indicator dot on top */}
              {isPeak && !isHovered && (
                <circle
                  cx={x + barW / 2}
                  cy={y - 5}
                  r={2.5}
                  fill={TK.primary}
                />
              )}

              {/* X-Axis Label */}
              <text
                x={x + barW / 2}
                y={svgHeight - 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight={isHovered || isPeak ? '800' : '700'}
                fill={isHovered || isPeak ? TK.primary : TK.text2}
                fontFamily="inherit"
              >
                {label}
              </text>

              {/* Hover Floating Tooltip */}
              {isHovered && (
                <g style={{ pointerEvents: 'none' }} className="animate-in fade-in zoom-in-95 duration-150">
                  <rect
                    x={Math.max(4, Math.min(svgWidth - 114, x + barW / 2 - 55))}
                    y={Math.max(2, y - 28)}
                    width={110}
                    height={24}
                    rx={6}
                    fill={TK.text1}
                    filter="drop-shadow(0 4px 6px rgba(0,0,0,0.18))"
                  />
                  <text
                    x={Math.max(4, Math.min(svgWidth - 114, x + barW / 2 - 55)) + 55}
                    y={Math.max(2, y - 28) + 15}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#ffffff"
                    fontFamily="inherit"
                  >
                    {val.toLocaleString()} {unit} • {d.onTime || '100%'}
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

export default TradeLaneBarChart;
