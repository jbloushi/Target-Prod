// ═══════════════════════════════════════════════
// Target Logistics — Dashboard Page v2
// ═══════════════════════════════════════════════

const DASH_SHIPMENTS = [
  { id:1, trackingNumber:'TLG-20250429-001', org:'Al-Fardan Trading',  origin:'Kuwait City', dest:'Dubai',     status:'in_transit',       customer:'Ahmed Hassan',    service:'Express Air',      eta:'~2 Days' },
  { id:2, trackingNumber:'TLG-20250429-002', org:'Gulf Exports Ltd',   origin:'Kuwait City', dest:'Riyadh',    status:'delivered',        customer:'Sara Al-Mutairi', service:'Standard',         eta:'Delivered' },
  { id:3, trackingNumber:'TLG-20250429-003', org:'Al-Fardan Trading',  origin:'Ahmadi',      dest:'London',    status:'pending',          customer:'James Wilson',    service:'Document Express', eta:'~5 Days' },
  { id:4, trackingNumber:'TLG-20250429-004', org:'Personal',           origin:'Salmiya',     dest:'Frankfurt', status:'out_for_delivery',  customer:'Klaus Weber',     service:'Express Air',      eta:'Today' },
  { id:5, trackingNumber:'TLG-20250429-005', org:'Gulf Exports Ltd',   origin:'Kuwait City', dest:'Singapore', status:'in_transit',        customer:'Li Wei',          service:'Standard',         eta:'~4 Days' },
  { id:6, trackingNumber:'TLG-20250429-006', org:'Al-Zain Corp',       origin:'Hawalli',     dest:'New York',  status:'draft',            customer:'John Smith',      service:'Express Air',      eta:'—' },
];

const CHART_BARS = [
  { day:'Mon', val:45 }, { day:'Tue', val:62 }, { day:'Wed', val:53 },
  { day:'Thu', val:78 }, { day:'Fri', val:91 }, { day:'Sat', val:38 }, { day:'Sun', val:29 },
];

const PERF_ITEMS = [
  { label:'Carrier Response Rate',     display:'99.4%', pct:99.4, color:TK.success  },
  { label:'Air Freight Punctuality',   display:'96.2%', pct:96.2, color:TK.primary  },
  { label:'Customs Clearance Avg.',    display:'1.4h',  pct:72,   color:'#e68a00'   },
  { label:'Client Satisfaction (NPS)', display:'NPS 88',pct:88,   color:TK.purple   },
];

// ── KPI Card ─────────────────────────────────────
const KPICard = ({ label, value, icon, color, trend, trendUp, description, onClick }) => {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        background: '#fff',
        border: `1.5px solid ${hov && onClick ? color : hov ? TK.border : TK.border}`,
        borderRadius: 18, padding: '20px 22px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hov ? `0 16px 40px -10px ${color}28` : '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', gap: 14, userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color,
          flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 21, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        {trend && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: 99,
            fontSize: 11, fontWeight: 700,
            color: trendUp === null ? TK.text3 : trendUp ? TK.success : TK.error,
            background: trendUp === null ? '#f0f2f4' : trendUp ? TK.successBg : TK.errorBg,
          }}>
            {trendUp !== null && (
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                {trendUp ? 'trending_up' : 'trending_down'}
              </span>
            )}
            {trend}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 30, color: TK.text1, letterSpacing: '-0.05em', lineHeight: 1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div style={{ fontWeight: 600, fontSize: 11, color: TK.text2, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </div>
      </div>
      {description && (
        <div style={{ fontSize: 11.5, color: TK.text3, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
    </div>
  );
};

// ── Bar Chart ─────────────────────────────────────
const BarChart = () => {
  const [hov, setHov] = React.useState(null);
  const maxVal = Math.max(...CHART_BARS.map(d => d.val));
  const barW = 38, gap = 18, chartH = 160;
  const totalW = CHART_BARS.length * (barW + gap) - gap;

  return (
    <svg width="100%" viewBox={`-8 0 ${totalW + 16} ${chartH + 30}`} style={{ overflow: 'visible', display: 'block' }}>
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={0} y1={chartH - f * chartH} x2={totalW} y2={chartH - f * chartH}
          stroke={TK.border} strokeWidth="1" strokeDasharray="4 4" />
      ))}
      {CHART_BARS.map((d, i) => {
        const x    = i * (barW + gap);
        const barH = Math.max(4, (d.val / maxVal) * chartH);
        const y    = chartH - barH;
        const isH  = hov === i;
        const isPk = i === 4;

        return (
          <g key={i}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov(null)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={x} y={0} width={barW} height={chartH} rx={8} fill={`${TK.border}50`} />
            <rect x={x} y={y} width={barW} height={barH} rx={8}
              fill={isPk ? TK.primary : isH ? `${TK.primary}cc` : '#bed0f5'}
              style={{ transition: 'fill 0.15s' }}
            />
            {isH && (
              <g>
                <rect x={x - 6} y={y - 32} width={barW + 12} height={24} rx={7} fill={TK.text1} />
                <text x={x + barW / 2} y={y - 16} textAnchor="middle" fill="#fff" fontSize="11" fontFamily="Manrope, sans-serif" fontWeight="700">
                  {d.val} pkgs
                </text>
              </g>
            )}
            <text x={x + barW / 2} y={chartH + 19} textAnchor="middle"
              fill={isPk || isH ? TK.primary : TK.text3}
              fontSize="11" fontFamily="Manrope, sans-serif" fontWeight={isPk ? '700' : '500'}>
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Mini sparkline ───────────────────────────────
const Sparkline = ({ data, color }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const w = 60, h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min + 0.01)) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// ── Dashboard Row ─────────────────────────────────
const DashRow = ({ s }) => {
  const [hov, setHov] = React.useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ borderBottom: `1px solid ${TK.border}`, cursor: 'pointer', background: hov ? '#fafbfc' : 'transparent', transition: 'background 0.1s' }}
    >
      <td style={{ padding: '12px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, color: hov ? TK.primary : TK.text1, transition: 'color 0.15s' }}>{s.trackingNumber}</div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.service}</div>
      </td>
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: TK.text1 }}>{s.origin}</span>
          <span style={{ color: TK.primary, fontSize: 14 }}>→</span>
          <span style={{ fontWeight: 600, color: TK.text1 }}>{s.dest}</span>
        </div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.org}</div>
      </td>
      <td style={{ padding: '12px 20px', fontSize: 13, color: TK.text1 }}>{s.customer}</td>
      <td style={{ padding: '12px 20px', fontSize: 13, color: TK.text2, fontWeight: 600 }}>{s.eta}</td>
      <td style={{ padding: '12px 20px' }}><StatusPill status={s.status} /></td>
    </tr>
  );
};

// ── Activity item ─────────────────────────────────
const ActivityItem = ({ icon, color, text, time, last }) => (
  <div style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: last ? 0 : 16 }}>
    {!last && <div style={{ position: 'absolute', left: 15, top: 30, bottom: 0, width: 1, background: TK.border }} />}
    <div style={{
      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
      background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: TK.text1, lineHeight: 1.5 }}>{text}</div>
      <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{time}</div>
    </div>
  </div>
);

// ── Dashboard Page ────────────────────────────────
const DashboardPage = ({ user, onNavigate }) => {
  const w = useWindowWidth();
  const isMobile = w < 640;
  const isTablet = w >= 640 && w < 1024;
  const [chartTab, setChartTab] = React.useState('Weekly');

  const KPIs = [
    { label:'Total Shipments', value:1247,  icon:'local_shipping',  color:TK.primary,  trend:'+12.5%', trendUp:true,  description:'All-time lifecycle' },
    { label:'Pending Action',  value:38,    icon:'pending_actions', color:'#d97706',   trend:'Stable', trendUp:null,  description:'Awaiting approval' },
    { label:'In Transit',      value:284,   icon:'public',          color:TK.info,     trend:'+4.2%',  trendUp:true,  description:'Cross-border movement', onClick: () => onNavigate('shipments') },
    { label:'Exceptions',      value:14,    icon:'warning',         color:TK.error,    trend:'-2.4%',  trendUp:true,  description:'Requires intervention' },
    { label:'Delivered',       value:891,   icon:'check_circle',    color:TK.success,  trend:'99.2%',  trendUp:null,  description:'Successfully completed' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const kpiCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)';
  const midCols = isMobile || isTablet ? '1fr' : '1fr 320px';
  const botCols = isMobile || isTablet ? '1fr' : '1fr 280px';

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>
            {greeting}, {user?.name?.split(' ')[0] || 'Operator'} 👋
          </h1>
          <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0', lineHeight: 1.5 }}>
            Managed by <strong style={{ color: TK.primary }}>Target Logistics Global</strong> — Operations Suite
          </p>
        </div>
        {!isMobile && (
          <div style={{ display: 'flex', gap: 10 }}>
            <TLButton variant="secondary" icon="support_agent">Support</TLButton>
            <TLButton icon="add">New Shipment</TLButton>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: 12, marginBottom: 16 }}>
        {KPIs.map((k, i) => (
          <KPICard key={i} {...k} />
        ))}
      </div>

      {/* Middle row: Chart + Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: midCols, gap: 14, marginBottom: 14 }}>
        {/* Chart card */}
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, padding: isMobile ? '18px 16px' : '22px 26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Weekly Shipment Volume</div>
              <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Cargo processed across all routes</div>
            </div>
            <div style={{ display: 'flex', gap: 3, background: '#f5f7fa', borderRadius: 10, padding: 3 }}>
              {['Weekly', 'Monthly'].map(t => (
                <button key={t} onClick={() => setChartTab(t)} style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: chartTab === t ? '#fff' : 'transparent',
                  color: chartTab === t ? TK.primary : TK.text3,
                  fontWeight: 700, fontSize: 11.5,
                  boxShadow: chartTab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}>{t}</button>
              ))}
            </div>
          </div>
          <BarChart />
        </div>

        {/* Performance card */}
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, padding: '22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Dispatch Performance</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Key velocity indicators</div>
          </div>

          {PERF_ITEMS.map((item, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 12.5, color: TK.text2 }}>{item.label}</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: item.color }}>{item.display}</span>
              </div>
              <div style={{ height: 6, background: '#f0f2f4', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 99,
                  transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 'auto', padding: '13px 15px', borderRadius: 13,
            background: TK.primaryBg, border: `1px solid ${TK.primary}20`,
            display: 'flex', alignItems: 'center', gap: 11,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary, fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>trending_up</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 10.5, color: TK.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Volume Forecast</div>
              <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 2 }}>+15% expected next week</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Recent Shipments + Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: botCols, gap: 14 }}>
        {/* Recent Shipments */}
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${TK.border}`, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Recent Shipments</div>
              <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Live operations snapshot</div>
            </div>
            <TLButton variant="secondary" small onClick={() => onNavigate('shipments')}>View All →</TLButton>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#fafbfc', borderBottom: `1px solid ${TK.border}` }}>
                  {['Tracking', 'Route', 'Customer', 'ETA', 'Status'].map(col => (
                    <th key={col} style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DASH_SHIPMENTS.map(s => <DashRow key={s.id} s={s} />)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Feed */}
        {!isMobile && (
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, padding: '22px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>Live Activity</div>
              <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 3 }}>Real-time events</div>
            </div>
            {[
              { icon:'check_circle', color:TK.success, text:'TLG-001 arrived Dubai hub', time:'2 min ago' },
              { icon:'warning',      color:TK.error,   text:'TLG-007 customs hold in Mumbai', time:'14 min ago' },
              { icon:'local_shipping',color:TK.primary,text:'TLG-004 out for delivery in Frankfurt', time:'31 min ago' },
              { icon:'add_circle',   color:TK.info,    text:'New shipment created by Mohammed', time:'1h ago' },
              { icon:'mail',         color:TK.purple,  text:'Client notification sent to Klaus', time:'2h ago' },
            ].map((a, i, arr) => (
              <ActivityItem key={i} {...a} last={i === arr.length - 1} />
            ))}
            <button style={{
              marginTop: 18, width: '100%', padding: '9px', borderRadius: 10,
              border: `1px solid ${TK.border}`, background: '#fafbfc',
              fontSize: 12.5, fontWeight: 600, color: TK.text2, cursor: 'pointer',
              transition: 'all 0.12s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f2f5'; e.currentTarget.style.color = TK.text1; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fafbfc'; e.currentTarget.style.color = TK.text2; }}
            >
              View full log →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { DashboardPage, KPICard });
