import React from 'react';
import { TK } from '../../tokens/kineticHorizon';

/**
 * ShareOfWalletBar - Horizontal spending / volume distribution breakdown
 */
export const ShareOfWalletBar = ({
  items = [
    { name: 'Al-Fardan Trading', amount: 8420, percent: 38, color: TK.primary },
    { name: 'Gulf Exports Ltd', amount: 5310, percent: 24, color: '#0284c7' },
    { name: 'Khalij Freight Co.', amount: 3980, percent: 18, color: '#7c3aed' },
    { name: 'Noor Logistics', amount: 2650, percent: 12, color: '#059669' },
    { name: 'Others', amount: 1770, percent: 8, color: '#9ca3af' },
  ],
  currency = 'KD'
}) => {
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
