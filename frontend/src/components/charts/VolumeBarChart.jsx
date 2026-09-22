import React, { useState } from 'react';
import { TK } from '../../tokens/kineticHorizon';

/**
 * VolumeBarChart - Zero-Dependency SVG Bar Chart
 * Features:
 * - Dynamic Y-axis scale with subtle horizontal grid lines
 * - Peak bar visual accentuation
 * - Interactive hover tooltips displaying package volume
 * - Weekly / Monthly timeframe switching
 */
const VolumeBarChart = ({
  data = [
    { label: 'Mon', count: 28 },
    { label: 'Tue', count: 42 },
    { label: 'Wed', count: 35 },
    { label: 'Thu', count: 68 },
    { label: 'Fri', count: 54 },
    { label: 'Sat', count: 22 },
    { label: 'Sun', count: 45 },
  ],
  height = 200,
  unit = 'pkgs'
}) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const counts = data.map(d => d.count || 0);
  const maxVal = Math.max(...counts, 10);
  const topCeil = Math.ceil(maxVal * 1.15 / 10) * 10; // Rounded top ceiling
  const peakVal = Math.max(...counts);

  // Dimensions
  const svgWidth = 560;
  const svgHeight = 170;
  const padLeft = 36;
  const padRight = 16;
  const padBottom = 26;
  const padTop = 16;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const barSlotW = chartW / data.length;
  const barW = Math.min(32, barSlotW * 0.55);

  const gridSteps = [0, 0.33, 0.66, 1];

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
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill={TK.text3}
                fontFamily="inherit"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const val = d.count || 0;
          const barH = (val / topCeil) * chartH;
          const x = padLeft + i * barSlotW + (barSlotW - barW) / 2;
          const y = padTop + chartH - barH;
          const isHovered = hoveredIdx === i;
          const isPeak = val === peakVal && val > 0;

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible touch target hit area */}
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
                fill={isHovered ? TK.primaryDark : (isPeak ? TK.primary : 'rgba(0, 80, 212, 0.18)')}
                style={{
                  transition: 'fill 0.15s ease, transform 0.15s ease',
                  transformOrigin: `${x + barW / 2}px ${padTop + chartH}px`,
                  transform: isHovered ? 'scaleY(1.02)' : 'none',
                }}
              />

              {/* X-Axis Label */}
              <text
                x={x + barW / 2}
                y={svgHeight - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight={isHovered || isPeak ? '700' : '600'}
                fill={isHovered || isPeak ? TK.primary : TK.text2}
                fontFamily="inherit"
              >
                {d.label}
              </text>

              {/* Hover Floating Tooltip */}
              {isHovered && (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={x + barW / 2 - 38}
                    y={Math.max(2, y - 26)}
                    width={76}
                    height={22}
                    rx={6}
                    fill={TK.text1}
                    filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))"
                  />
                  <text
                    x={x + barW / 2}
                    y={Math.max(2, y - 26) + 14}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#ffffff"
                    fontFamily="inherit"
                  >
                    {val} {unit}
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

export default VolumeBarChart;
