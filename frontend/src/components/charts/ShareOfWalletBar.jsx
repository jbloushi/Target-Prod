import React from 'react';
import { TK } from '../../tokens/kineticHorizon';

/**
 * ShareOfWalletBar - Horizontal spending / volume distribution breakdown
 */
export const ShareOfWalletBar = ({
  items = [],
  currency = 'KD'
}) => {
  if (!items || items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>pie_chart</span>
        <span>No shipping volume or spend recorded for this period</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* Multi-segment stacked bar */}
      <div style={{
        width: '100%',
        height: 10,
        borderRadius: 99,
        background: '#e9edf2',
        overflow: 'hidden',
        display: 'flex',
      }}>
        {items.map((it, i) => (
          <div
            key={i}
            title={`${it.name}: ${it.percent}% (${currency} ${it.amount?.toLocaleString()})`}
            style={{
              width: `${it.percent}%`,
              height: '100%',
              background: it.color || TK.primary,
              transition: 'width 0.6s ease',
            }}
          />
        ))}
      </div>

      {/* Item list breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: it.color || TK.primary }} />
              <span style={{ fontWeight: 600, color: TK.text1 }}>{it.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: TK.text2, fontWeight: 500 }}>
                {currency} {it.amount?.toLocaleString()}
              </span>
              <span style={{ fontWeight: 700, color: TK.text1, width: 34, textAlign: 'right' }}>
                {it.percent}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShareOfWalletBar;
