import React from 'react';
import { TK } from '../../tokens/kineticHorizon';

/**
 * VelocityProgressBar - Key Velocity & Dispatch Indicator
 */
export const VelocityProgressBar = ({
  label,
  value,
  displayValue,
  target,
  targetLabel = 'Target',
  color = TK.primary,
  icon = 'speed'
}) => {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: color }}>
            {icon}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: TK.text1 }}>
            {label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: TK.text1 }}>
            {displayValue || `${value}%`}
          </span>
          {target && (
            <span style={{ fontSize: 10.5, color: TK.text3, fontWeight: 500 }}>
              ({targetLabel}: {target})
            </span>
          )}
        </div>
      </div>

      <div style={{
        width: '100%',
        height: 7,
        borderRadius: 99,
        background: '#e9edf2',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 99,
          background: color,
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
        }} />
      </div>
    </div>
  );
};

export default VelocityProgressBar;
