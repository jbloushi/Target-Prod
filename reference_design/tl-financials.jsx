// ═══════════════════════════════════════════════
// Target Logistics — Financials & Accounting v2
// Full accounting module: balance, allocations,
// transactions, invoices, cost centres
// ═══════════════════════════════════════════════

const FIN_TRANSACTIONS = [
  { id:'TXN-001', date:'30 Apr 2025', type:'debit',  desc:'Express Air — TLG-20250429-001',  ref:'TLG-20250429-001', amount:18.50, balance:229.50, org:'Al-Fardan Trading',  status:'posted'  },
  { id:'TXN-002', date:'29 Apr 2025', type:'debit',  desc:'Standard — TLG-20250429-002',     ref:'TLG-20250429-002', amount:6.20,  balance:248.00, org:'Gulf Exports Ltd',  status:'posted'  },
  { id:'TXN-003', date:'29 Apr 2025', type:'credit', desc:'Wallet top-up via bank transfer',  ref:'BNK-KW-0042',      amount:100.00,balance:254.20, org:'—',                 status:'posted'  },
  { id:'TXN-004', date:'28 Apr 2025', type:'debit',  desc:'Document Express — TLG-20250429-003', ref:'TLG-20250429-003', amount:4.00, balance:154.20, org:'Al-Fardan Trading', status:'posted' },
  { id:'TXN-005', date:'28 Apr 2025', type:'debit',  desc:'Customs clearance fee',            ref:'CST-20250428',     amount:2.50,  balance:158.20, org:'Al-Fardan Trading', status:'posted'  },
  { id:'TXN-006', date:'27 Apr 2025', type:'credit', desc:'Refund — cancelled shipment',      ref:'TLG-20250427-R01', amount:12.00, balance:160.70, org:'Al-Zain Corp',      status:'posted'  },
  { id:'TXN-007', date:'27 Apr 2025', type:'debit',  desc:'Express Air — TLG-20250429-004',  ref:'TLG-20250429-004', amount:22.00, balance:148.70, org:'Personal',          status:'posted'  },
  { id:'TXN-008', date:'26 Apr 2025', type:'debit',  desc:'Standard — TLG-20250429-005',     ref:'TLG-20250429-005', amount:6.50,  balance:170.70, org:'Gulf Exports Ltd',  status:'pending' },
  { id:'TXN-009', date:'26 Apr 2025', type:'credit', desc:'Client payment — Gulf Exports',   ref:'INV-2025-0089',    amount:250.00,balance:177.20, org:'Gulf Exports Ltd',  status:'posted'  },
  { id:'TXN-010', date:'25 Apr 2025', type:'debit',  desc:'Fuel surcharge adjustment',        ref:'ADJ-20250425',     amount:3.20,  balance:0,      org:'System',            status:'posted'  },
];

const FIN_INVOICES = [
  { id:'INV-2025-0093', date:'30 Apr 2025', org:'Al-Fardan Trading', amount:42.50, status:'unpaid',  due:'07 May 2025', items:3 },
  { id:'INV-2025-0092', date:'28 Apr 2025', org:'Gulf Exports Ltd',  amount:18.20, status:'paid',    due:'05 May 2025', items:2 },
  { id:'INV-2025-0091', date:'27 Apr 2025', org:'Al-Zain Corp',      amount:67.00, status:'overdue', due:'04 May 2025', items:5 },
  { id:'INV-2025-0090', date:'25 Apr 2025', org:'Personal',          amount:22.00, status:'paid',    due:'02 May 2025', items:1 },
  { id:'INV-2025-0089', date:'22 Apr 2025', org:'Gulf Exports Ltd',  amount:250.00,status:'paid',    due:'29 Apr 2025', items:12},
];

const ALLOCATIONS = [
  { shipment:'TLG-20250429-001', org:'Al-Fardan Trading', service:'Express Air',      allocated:18.50, used:18.50, remaining:0,     status:'settled' },
  { shipment:'TLG-20250429-003', org:'Al-Fardan Trading', service:'Document Express', allocated:8.00,  used:4.00,  remaining:4.00,  status:'active'  },
  { shipment:'TLG-20250429-005', org:'Gulf Exports Ltd',  service:'Standard',         allocated:10.00, used:6.50,  remaining:3.50,  status:'active'  },
  { shipment:'TLG-20250429-006', org:'Al-Zain Corp',      service:'Express Air',      allocated:25.00, used:0,     remaining:25.00, status:'reserved'},
  { shipment:'TLG-20250428-009', org:'Al-Fardan Trading', service:'Express Air',      allocated:22.00, used:18.00, remaining:4.00,  status:'active'  },
];

const INV_STATUS = {
  paid:    { label:'Paid',    color:TK.success, bg:TK.successBg },
  unpaid:  { label:'Unpaid',  color:'#b45309',  bg:'#fef3c7'    },
  overdue: { label:'Overdue', color:TK.error,   bg:TK.errorBg   },
};

const TXN_MONTH_TOTALS = [
  { month:'Nov', credit:320, debit:280 },
  { month:'Dec', credit:410, debit:370 },
  { month:'Jan', credit:290, debit:310 },
  { month:'Feb', credit:480, debit:390 },
  { month:'Mar', credit:350, debit:320 },
  { month:'Apr', credit:512, debit:62  },
];

// ── Mini bar chart for financials ────────────────
const FinBarChart = () => {
  const [hov, setHov] = React.useState(null);
  const max = Math.max(...TXN_MONTH_TOTALS.map(d => Math.max(d.credit, d.debit)));
  const barW = 22, gap = 6, grpGap = 20, chartH = 100;
  const grpW = barW * 2 + gap;
  const totalW = TXN_MONTH_TOTALS.length * (grpW + grpGap) - grpGap;

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${chartH + 26}`} style={{ overflow: 'visible', display: 'block' }}>
      {TXN_MONTH_TOTALS.map((d, i) => {
        const gx = i * (grpW + grpGap);
        const ch = (d.credit / max) * chartH;
        const dh = (d.debit  / max) * chartH;
        return (
          <g key={i}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov(null)}
          >
            {/* Credit bar */}
            <rect x={gx} y={chartH - ch} width={barW} height={ch} rx={5}
              fill={hov === i ? TK.success : `${TK.success}88`} style={{ transition: 'fill 0.15s' }} />
            {/* Debit bar */}
            <rect x={gx + barW + gap} y={chartH - dh} width={barW} height={dh} rx={5}
              fill={hov === i ? TK.error : `${TK.error}88`} style={{ transition: 'fill 0.15s' }} />
            {/* Month label */}
            <text x={gx + grpW / 2} y={chartH + 18} textAnchor="middle"
              fill={TK.text3} fontSize="10" fontFamily="Manrope, sans-serif" fontWeight="600">
              {d.month}
            </text>
            {/* Tooltip */}
            {hov === i && (
              <g>
                <rect x={gx - 4} y={chartH - Math.max(ch, dh) - 36} width={grpW + 8} height={30} rx={7} fill={TK.text1} />
                <text x={gx + grpW / 2} y={chartH - Math.max(ch, dh) - 20} textAnchor="middle" fill="#fff" fontSize="9.5" fontFamily="Manrope, sans-serif">
                  +{d.credit} / -{d.debit}
                </text>
                <text x={gx + grpW / 2} y={chartH - Math.max(ch, dh) - 9} textAnchor="middle" fill={TK.text3} fontSize="8.5" fontFamily="Manrope, sans-serif">KD</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ── Financials Page ──────────────────────────────
const FinancialsPage = ({ user }) => {
  const [tab, setTab]         = React.useState('overview');
  const [txnFilter, setTxnFilter] = React.useState('all');
  const [searchTxn, setSearchTxn] = React.useState('');
  const w = useWindowWidth();
  const isMobile = w < 640;

  const TABS = [
    { id:'overview',     label:'Overview',     icon:'dashboard'         },
    { id:'transactions', label:'Transactions', icon:'receipt_long'      },
    { id:'allocations',  label:'Allocations',  icon:'account_tree'      },
    { id:'invoices',     label:'Invoices',     icon:'description'       },
  ];

  const filteredTxn = FIN_TRANSACTIONS.filter(t => {
    const matchType = txnFilter === 'all' || t.type === txnFilter;
    const q = searchTxn.toLowerCase();
    const matchSearch = !q || t.desc.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q) || t.org.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>Financials</h1>
          <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0' }}>Accounting, wallet balance, allocations and invoices</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <TLButton variant="secondary" icon="download">Export</TLButton>
          <TLButton icon="add">Top Up Wallet</TLButton>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, background: '#f5f7fa', borderRadius: 12, padding: 4, marginBottom: 20, overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: tab === t.id ? '#fff' : 'transparent',
            color: tab === t.id ? TK.primary : TK.text3,
            fontWeight: tab === t.id ? 700 : 500, fontSize: 13,
            boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, fontVariationSettings: tab === t.id ? "'FILL' 1" : "'FILL' 0" }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Balance cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label:'Available Balance', value:'KD 229.50', icon:'account_balance_wallet', color:TK.primary,  sub:'Usable for shipments',      trend:'+KD 100 this week' },
              { label:'Reserved / Held',   value:'KD 25.00',  icon:'lock',                  color:'#b45309',    sub:'Awaiting confirmation',     trend:'1 active reservation' },
              { label:'Total Credits',     value:'KD 362.00', icon:'arrow_downward',         color:TK.success,   sub:'All-time received',         trend:'+KD 100 this month' },
              { label:'Total Debits',      value:'KD 62.90',  icon:'arrow_upward',           color:TK.error,     sub:'This month spending',       trend:'8 transactions' },
            ].map((c, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`,
                padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${c.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>{c.icon}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TK.text3, background: '#f5f7fa', padding: '3px 8px', borderRadius: 99 }}>{c.trend}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: 24, color: c.color, letterSpacing: '-0.04em' }}>{c.value}</div>
                <div style={{ fontWeight: 600, fontSize: 11, color: TK.text2, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 5 }}>{c.label}</div>
                <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 3 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart + recent txn */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 14 }}>
            {/* Monthly chart */}
            <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, padding: '22px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Monthly Cash Flow</div>
                  <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Credits vs. debits over the last 6 months</div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {[{ label:'Credits', color: TK.success }, { label:'Debits', color: TK.error }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 11.5, color: TK.text2, fontWeight: 600 }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <FinBarChart />
            </div>

            {/* Quick stats */}
            <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, padding: '22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Spending by Org</div>
              {[
                { org:'Al-Fardan Trading', amount:'KD 24.50', pct:40, color:TK.primary },
                { org:'Gulf Exports Ltd',  amount:'KD 12.70', pct:20, color:TK.info    },
                { org:'Al-Zain Corp',      amount:'KD 15.00', pct:24, color:TK.purple  },
                { org:'Personal',          amount:'KD 22.00', pct:35, color:'#b45309'  },
              ].map((o, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, color: TK.text2, fontWeight: 600 }}>{o.org}</span>
                    <span style={{ fontSize: 12.5, color: o.color, fontWeight: 700 }}>{o.amount}</span>
                  </div>
                  <div style={{ height: 5, background: '#f0f2f4', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${o.pct}%`, background: o.color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}

              {/* Top-up CTA */}
              <div style={{ marginTop: 'auto', padding: '14px 16px', borderRadius: 13, background: TK.primaryBg, border: `1px solid ${TK.primary}20` }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: TK.primary, marginBottom: 6 }}>Low balance alert threshold</div>
                <div style={{ fontSize: 12.5, color: TK.text2, marginBottom: 10 }}>Alert when balance drops below KD 50</div>
                <button style={{
                  width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                  background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                }}>Set Up Alert</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === 'transactions' && (
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${TK.border}`, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: '#f5f7fa', borderRadius: 10, padding: 3 }}>
              {['all','credit','debit'].map(f => (
                <button key={f} onClick={() => setTxnFilter(f)} style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: txnFilter === f ? '#fff' : 'transparent',
                  color: txnFilter === f ? (f === 'credit' ? TK.success : f === 'debit' ? TK.error : TK.primary) : TK.text3,
                  fontWeight: 700, fontSize: 12, textTransform: 'capitalize',
                  boxShadow: txnFilter === f ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}>{f === 'all' ? 'All' : f === 'credit' ? 'Credits' : 'Debits'}</button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 9, border: `1px solid ${TK.border}`, borderRadius: 10, padding: '8px 13px', background: '#fafbfc' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: TK.text3, flexShrink: 0 }}>search</span>
              <input placeholder="Search transactions…" value={searchTxn} onChange={e => setSearchTxn(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: TK.text1, width: '100%' }} />
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12.5, color: TK.text3 }}>{filteredTxn.length} records</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#fafbfc', borderBottom: `1px solid ${TK.border}` }}>
                  {['Date','Description','Reference','Organization','Amount','Balance','Status'].map(col => (
                    <th key={col} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTxn.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: i < filteredTxn.length - 1 ? `1px solid ${TK.border}` : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: TK.text2, whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 12.5, color: TK.text1, fontWeight: 600 }}>{t.desc}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: TK.primary, fontWeight: 600, whiteSpace: 'nowrap' }}>{t.ref}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: TK.text2 }}>{t.org}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: t.type === 'credit' ? TK.success : TK.error,
                      }}>
                        {t.type === 'credit' ? '+' : '–'} KD {t.amount.toFixed(3)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: TK.text2, whiteSpace: 'nowrap' }}>KD {t.balance.toFixed(3)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                        background: t.status === 'posted' ? TK.successBg : '#fef3c7',
                        color: t.status === 'posted' ? TK.success : '#b45309',
                      }}>{t.status === 'posted' ? 'Posted' : 'Pending'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ALLOCATIONS TAB ── */}
      {tab === 'allocations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label:'Total Allocated', value:'KD 83.50', icon:'account_tree', color:TK.primary },
              { label:'In Use',          value:'KD 47.00', icon:'sync',         color:TK.info    },
              { label:'Remaining',       value:'KD 36.50', icon:'savings',      color:TK.success },
            ].map((c, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, border: `1px solid ${TK.border}`, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color, flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>{c.icon}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: c.color, letterSpacing: '-0.03em' }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: TK.text2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Allocations table */}
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Shipment Allocations</div>
                <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Funds reserved or assigned to individual shipments</div>
              </div>
              <TLButton variant="secondary" small icon="add">Allocate Funds</TLButton>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr style={{ background: '#fafbfc', borderBottom: `1px solid ${TK.border}` }}>
                    {['Shipment','Organization','Service','Allocated','Used','Remaining','Status'].map(col => (
                      <th key={col} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALLOCATIONS.map((a, i) => {
                    const pct = a.allocated > 0 ? (a.used / a.allocated) * 100 : 0;
                    const stCfg = { settled: { color:TK.success, bg:TK.successBg, label:'Settled' }, active:{ color:TK.primary, bg:TK.primaryBg, label:'Active' }, reserved:{ color:'#b45309', bg:'#fef3c7', label:'Reserved' } };
                    const st = stCfg[a.status] || stCfg.active;
                    return (
                      <tr key={i} style={{ borderBottom: i < ALLOCATIONS.length - 1 ? `1px solid ${TK.border}` : 'none' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12.5, color: TK.primary }}>{a.shipment}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12.5, color: TK.text2 }}>{a.org}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12.5, color: TK.text2 }}>{a.service}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 12.5, color: TK.text1 }}>KD {a.allocated.toFixed(3)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: TK.text1, marginBottom: 4 }}>KD {a.used.toFixed(3)}</div>
                          <div style={{ height: 4, width: 80, background: '#f0f2f4', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: TK.primary, borderRadius: 99 }} />
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 12.5, color: a.remaining > 0 ? TK.success : TK.text3 }}>KD {a.remaining.toFixed(3)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── INVOICES TAB ── */}
      {tab === 'invoices' && (
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Invoices</div>
              <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Billing history and outstanding amounts</div>
            </div>
            <TLButton icon="add" small>Generate Invoice</TLButton>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#fafbfc', borderBottom: `1px solid ${TK.border}` }}>
                  {['Invoice #','Date','Organization','Items','Amount','Due Date','Status',''].map(col => (
                    <th key={col} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIN_INVOICES.map((inv, i) => {
                  const st = INV_STATUS[inv.status];
                  return (
                    <tr key={inv.id} style={{ borderBottom: i < FIN_INVOICES.length - 1 ? `1px solid ${TK.border}` : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '13px 16px', fontWeight: 700, fontSize: 12.5, color: TK.primary }}>{inv.id}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12.5, color: TK.text2 }}>{inv.date}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12.5, color: TK.text1, fontWeight: 600 }}>{inv.org}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12.5, color: TK.text2 }}>{inv.items} items</td>
                      <td style={{ padding: '13px 16px', fontWeight: 700, fontSize: 13, color: TK.text1 }}>KD {inv.amount.toFixed(3)}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12.5, color: inv.status === 'overdue' ? TK.error : TK.text2 }}>{inv.due}</td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '13px 12px' }}>
                        <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: `1px solid ${TK.border}`, background: 'transparent', fontSize: 12, color: TK.text2, cursor: 'pointer' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
                          PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { FinancialsPage });
