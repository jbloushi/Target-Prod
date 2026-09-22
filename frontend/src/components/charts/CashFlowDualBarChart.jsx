import React, { useState } from 'react';
import { TK } from '../../tokens/kineticHorizon';

/**
 * CashFlowDualBarChart - Interactive 6-Month Dual Bar Chart (Credits vs Debits)
 * Zero external charting dependencies.
 * Features:
 * - Side-by-side Credits (Revenue #0050d4) vs Debits (Carrier Costs #dc2626)
 * - Net margin calculation and interactive hover tooltips
 * - Grid lines, legend, and formatted currency values
 */
const CashFlowDualBarChart = ({
  data = [
    { month: 'Nov', credits: 14200, debits: 9800 },
    { month: 'Dec', credits: 18500, debits: 11900 },
    { month: 'Jan', credits: 16100, debits: 10400 },
    { month: 'Feb', credits: 21300, debits: 13800 },
    { month: 'Mar', credits: 19800, debits: 12100 },
    { month: 'Apr', credits: 24600, debits: 15200 },
  ],
  currency = 'KD',
  height = 220,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const allVals = data.flatMap(d => [d.credits || 0, d.debits || 0]);
  const maxVal = Math.max(...allVals, 1000);
  const topCeil = Math.ceil(maxVal * 1.15 / 5000) * 5000;

  const svgWidth = 600;
  const svgHeight = 200;
  const padLeft = 52;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 28;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const groupSlotW = chartW / data.length;
  const barW = Math.min(18, (groupSlotW - 16) / 2);
  const barGap = 4;

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const fmtCurrency = (num) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  return (
    <div style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
      {/* Chart Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginBottom: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: TK.primary }} />
          <span style={{ fontWeight: 600, color: TK.text2 }}>Credits (Inflow)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: TK.error }} />
          <span style={{ fontWeight: 600, color: TK.text2 }}>Debits (Carrier Costs)</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: '100%', height: height, display: 'block', overflow: 'visible' }}
      >
        {/* Horizontal Grid Lines */}
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
                {fmtCurrency(val)}
              </text>
            </g>
          );
        })}

        {/* Dual Bars */}
        {data.map((d, i) => {
          const creditH = (d.credits / topCeil) * chartH;
          const debitH = (d.debits / topCeil) * chartH;
          const groupCenterX = padLeft + i * groupSlotW + groupSlotW / 2;
          const creditX = groupCenterX - barW - barGap / 2;
          const debitX = groupCenterX + barGap / 2;
          const creditY = padTop + chartH - creditH;
          const debitY = padTop + chartH - debitH;
          const isHovered = hoveredIdx === i;
          const net = (d.credits || 0) - (d.debits || 0);

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Hit area */}
              <rect
                x={padLeft + i * groupSlotW}
                y={padTop}
                width={groupSlotW}
                height={chartH}
                fill="transparent"
              />

              {/* Credit Bar */}
              <rect
                x={creditX}
                y={creditY}
                width={barW}
                height={Math.max(creditH, 2)}
                rx={4}
                ry={4}
                fill={TK.primary}
                opacity={isHovered ? 1 : 0.88}
                style={{ transition: 'opacity 0.15s ease' }}
              />

              {/* Debit Bar */}
              <rect
                x={debitX}
                y={debitY}
                width={barW}
                height={Math.max(debitH, 2)}
                rx={4}
                ry={4}
                fill={TK.error}
                opacity={isHovered ? 1 : 0.82}
                style={{ transition: 'opacity 0.15s ease' }}
              />

              {/* Month Label */}
              <text
                x={groupCenterX}
                y={svgHeight - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight={isHovered ? '700' : '600'}
                fill={isHovered ? TK.primary : TK.text2}
                fontFamily="inherit"
              >
                {d.month}
              </text>

              {/* Hover Net Margin Tooltip */}
              {isHovered && (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={groupCenterX - 56}
                    y={Math.max(2, Math.min(creditY, debitY) - 38)}
                    width={112}
                    height={32}
                    rx={7}
                    fill={TK.text1}
                    filter="drop-shadow(0 4px 8px rgba(0,0,0,0.18))"
                  />
                  <text
                    x={groupCenterX}
                    y={Math.max(2, Math.min(creditY, debitY) - 38) + 14}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="500"
                    fill="#9ca3af"
                    fontFamily="inherit"
                  >
                    Net Margin:
                  </text>
                  <text
                    x={groupCenterX}
                    y={Math.max(2, Math.min(creditY, debitY) - 38) + 26}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="800"
                    fill={net >= 0 ? '#34d399' : '#f87171'}
                    fontFamily="inherit"
                  >
                    +{currency} {net.toLocaleString()}
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

export default CashFlowDualBarChart;
