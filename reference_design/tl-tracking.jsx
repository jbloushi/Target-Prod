// ═══════════════════════════════════════════════
// Target Logistics — Public Shipment Tracking
// No login required — accessible to anyone
// ═══════════════════════════════════════════════

const TRACKING_DB = {
  'TLG-20250429-001': {
    trackingNumber: 'TLG-20250429-001',
    status: 'in_transit',
    service: 'Express Air',
    weight: '2.5 kg',
    origin: 'Kuwait City, KW',
    destination: 'Dubai, AE',
    sender: 'Mohammed Al-Ali',
    receiver: 'Ahmed Hassan',
    created: '29 Apr 2025, 08:14',
    eta: '01 May 2025',
    events: [
      { time:'30 Apr 2025, 06:11', location:'Dubai International Airport, AE', status:'In Transit', desc:'Shipment arrived at destination country', done:true,  active:true  },
      { time:'29 Apr 2025, 22:40', location:'Kuwait Airways Hub, KW',          status:'Departed',   desc:'Shipment departed origin facility',    done:true,  active:false },
      { time:'29 Apr 2025, 14:32', location:'Target Logistics Hub, Kuwait City',status:'Processed', desc:'Shipment cleared export customs',      done:true,  active:false },
      { time:'29 Apr 2025, 10:15', location:'Target Logistics Hub, Kuwait City',status:'Picked Up', desc:'Courier picked up the shipment',       done:true,  active:false },
      { time:'29 Apr 2025, 08:14', location:'Kuwait City, KW',                 status:'Created',   desc:'Shipment created and confirmed',        done:true,  active:false },
    ],
  },
  'TLG-20250429-004': {
    trackingNumber: 'TLG-20250429-004',
    status: 'out_for_delivery',
    service: 'Express Air',
    weight: '1.2 kg',
    origin: 'Salmiya, KW',
    destination: 'Frankfurt, DE',
    sender: 'Khalid Al-Sabah',
    receiver: 'Klaus Weber',
    created: '27 Apr 2025, 09:00',
    eta: '30 Apr 2025',
    events: [
      { time:'30 Apr 2025, 07:30', location:'Frankfurt, DE',                    status:'Out for Delivery', desc:'Shipment is out for final delivery', done:true,  active:true  },
      { time:'29 Apr 2025, 18:00', location:'Frankfurt Airport Hub, DE',        status:'Arrived',          desc:'Arrived at delivery hub',           done:true,  active:false },
      { time:'28 Apr 2025, 11:20', location:'Frankfurt Airport, DE',            status:'In Transit',       desc:'Cleared customs in Germany',        done:true,  active:false },
      { time:'28 Apr 2025, 03:44', location:'Dubai Transit Hub, AE',            status:'In Transit',       desc:'In transit via Dubai hub',           done:true,  active:false },
      { time:'27 Apr 2025, 16:05', location:'Kuwait International Airport, KW', status:'Departed',         desc:'Shipment departed Kuwait',           done:true,  active:false },
      { time:'27 Apr 2025, 09:00', location:'Kuwait City, KW',                  status:'Created',          desc:'Shipment created and confirmed',     done:true,  active:false },
    ],
  },
  'TLG-20250429-002': {
    trackingNumber: 'TLG-20250429-002',
    status: 'delivered',
    service: 'Standard',
    weight: '3.8 kg',
    origin: 'Kuwait City, KW',
    destination: 'Riyadh, SA',
    sender: 'Fatima Al-Rashid',
    receiver: 'Sara Al-Mutairi',
    created: '28 Apr 2025, 11:00',
    eta: 'Delivered',
    events: [
      { time:'30 Apr 2025, 14:22', location:'Riyadh, SA',                       status:'Delivered',  desc:'Package delivered and signed for',   done:true, active:true  },
      { time:'30 Apr 2025, 09:10', location:'Riyadh Distribution Hub, SA',      status:'Out for Delivery', desc:'Out for final delivery',        done:true, active:false },
      { time:'29 Apr 2025, 20:00', location:'Riyadh, SA',                       status:'Arrived',    desc:'Arrived at destination city',        done:true, active:false },
      { time:'29 Apr 2025, 06:30', location:'Al Batha Border, SA/KW',           status:'Cleared',    desc:'Customs clearance complete',         done:true, active:false },
      { time:'28 Apr 2025, 11:00', location:'Kuwait City, KW',                  status:'Created',    desc:'Shipment created',                   done:true, active:false },
    ],
  },
};

const STATUS_ICONS = {
  in_transit:       'flight',
  out_for_delivery: 'local_shipping',
  delivered:        'check_circle',
  pending:          'pending',
  exception:        'warning',
  created:          'add_circle',
  draft:            'edit_note',
  picked_up:        'inventory',
};

const STATUS_DISPLAY = {
  in_transit:       { label:'In Transit',       color:TK.primary,  bg:TK.primaryBg },
  out_for_delivery: { label:'Out for Delivery', color:'#059669',   bg:'#d1fae5'    },
  delivered:        { label:'Delivered',        color:TK.success,  bg:TK.successBg },
  pending:          { label:'Pending',          color:'#b45309',   bg:'#fef3c7'    },
  exception:        { label:'Exception',        color:TK.error,    bg:TK.errorBg   },
};

// ── Progress bar ──────────────────────────────
const TrackingProgress = ({ status }) => {
  const steps = [
    { key:'created',   label:'Order\nCreated',   icon:'add_circle'    },
    { key:'picked_up', label:'Picked\nUp',        icon:'inventory'     },
    { key:'in_transit',label:'In\nTransit',       icon:'flight'        },
    { key:'arrived',   label:'Arrived',           icon:'flight_land'   },
    { key:'delivered', label:'Delivered',         icon:'check_circle'  },
  ];
  const idx = status === 'delivered' ? 4 : status === 'out_for_delivery' ? 3 : status === 'in_transit' ? 2 : status === 'picked_up' ? 1 : 0;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, padding:'8px 0' }}>
      {steps.map((s, i) => {
        const done    = i <= idx;
        const current = i === idx;
        const isLast  = i === steps.length - 1;
        return (
          <React.Fragment key={s.key}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, flex:'0 0 auto' }}>
              <div style={{
                width: current ? 40 : 34, height: current ? 40 : 34,
                borderRadius:'50%',
                border:`2.5px solid ${done ? (current ? TK.primary : TK.success) : TK.border}`,
                background: done ? (current ? TK.primary : TK.success) : '#fff',
                display:'flex', alignItems:'center', justifyContent:'center',
                color: done ? '#fff' : TK.text3,
                transition:'all 0.3s',
                boxShadow: current ? `0 0 0 5px ${TK.primary}22` : 'none',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: current ? 22 : 18, fontVariationSettings: done ? "'FILL' 1" : "'FILL' 0" }}>{s.icon}</span>
              </div>
              <span style={{
                fontSize:10, fontWeight: current ? 700 : 500,
                color: current ? TK.primary : done ? TK.success : TK.text3,
                textAlign:'center', whiteSpace:'pre-line', lineHeight:1.3,
              }}>{s.label}</span>
            </div>
            {!isLast && (
              <div style={{
                flex:1, height:3, margin:'0 4px', marginBottom:22,
                background: i < idx ? TK.success : TK.border,
                borderRadius:99, transition:'background 0.3s',
                overflow:'hidden', position:'relative',
              }}>
                {i === idx - 1 && (
                  <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg, ${TK.success}, ${TK.primary})`, borderRadius:99 }} />
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── Tracking Page ─────────────────────────────
const TrackingPage = ({ onGoBack, initialTracking }) => {
  const [query, setQuery]       = React.useState(initialTracking || '');
  const [inputVal, setInputVal] = React.useState(initialTracking || '');
  const [result, setResult]     = React.useState(initialTracking ? TRACKING_DB[initialTracking.toUpperCase()] || null : null);
  const [loading, setLoading]   = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [focused, setFocused]   = React.useState(false);
  const w = useWindowWidth();
  const isMobile = w < 640;

  const pollRef = React.useRef(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const fetchOnce = async (q) => {
    try {
      const r = await window.TL_API.publicTracking.get(q);
      const data = r && (r.data || r);
      if (data && data.trackingNumber) { setResult(data); setQuery(q); setNotFound(false); }
      else { setNotFound(true); setResult(null); stopPoll(); }
    } catch (e) {
      // fallback to local TRACKING_DB so dev still works offline
      const found = TRACKING_DB[q];
      if (found) { setResult(found); setQuery(q); setNotFound(false); }
      else { setNotFound(true); stopPoll(); }
    }
  };

  const search = (val) => {
    const q = (val || inputVal).trim().toUpperCase();
    if (!q) return;
    stopPoll();
    setLoading(true); setNotFound(false); setResult(null);
    fetchOnce(q).finally(() => {
      setLoading(false);
      // Live polling — only for in-flight statuses
      const pollMs = (window.TL_CONFIG && window.TL_CONFIG.pollMs) || 30000;
      pollRef.current = setInterval(() => fetchOnce(q), pollMs);
    });
  };

  React.useEffect(() => () => stopPoll(), []);
  React.useEffect(() => {
    if (result && (result.status === 'delivered' || result.status === 'cancelled')) stopPoll();
  }, [result]);

  const sd = result ? (STATUS_DISPLAY[result.status] || STATUS_DISPLAY.in_transit) : null;

  return (
    <div style={{ minHeight:'100vh', background:'#f3f7fb', display:'flex', flexDirection:'column', fontFamily:'Manrope, sans-serif' }}>
      {/* Header */}
      <header style={{
        background:'#fff', borderBottom:`1px solid ${TK.border}`,
        padding: isMobile ? '14px 16px' : '16px 40px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:50,
        backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#0EA5E9,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize:19, color:'#fff', fontVariationSettings:"'FILL' 1" }}>local_shipping</span>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:TK.text1, letterSpacing:'-0.02em' }}>Target Logistics</div>
            <div style={{ fontWeight:600, fontSize:9.5, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em' }}>Shipment Tracking</div>
          </div>
        </div>
        {onGoBack && (
          <button onClick={onGoBack} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, border:`1px solid ${TK.border}`, background:'transparent', fontSize:13, fontWeight:600, color:TK.text2, cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize:17 }}>arrow_back</span>
            {!isMobile && 'Back to Login'}
          </button>
        )}
      </header>

      {/* Hero search area */}
      <div style={{
        background:'linear-gradient(135deg, #0050d4 0%, #0369a1 100%)',
        padding: isMobile ? '36px 20px 48px' : '56px 40px 72px',
        textAlign:'center',
      }}>
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:7, padding:'5px 14px', borderRadius:99,
            background:'rgba(255,255,255,0.15)', marginBottom:18,
          }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'tlPulse 2s infinite' }} />
            <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.9)' }}>Live tracking active</span>
          </div>
          <h1 style={{ fontWeight:800, fontSize: isMobile ? 26 : 34, color:'#fff', letterSpacing:'-0.035em', margin:'0 0 10px', lineHeight:1.15 }}>
            Track Your Shipment
          </h1>
          <p style={{ fontSize: isMobile ? 13.5 : 15, color:'rgba(255,255,255,0.75)', margin:'0 0 28px', lineHeight:1.65 }}>
            Enter your tracking number to get real-time updates on your shipment's location and status.
          </p>

          {/* Search box */}
          <div style={{
            display:'flex', gap:0, background:'#fff', borderRadius:14,
            boxShadow:'0 8px 32px rgba(0,0,0,0.16)', overflow:'hidden',
          }}>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:9, padding: isMobile ? '12px 14px' : '14px 18px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:20, color: focused ? TK.primary : TK.text3, flexShrink:0, transition:'color 0.15s' }}>search</span>
              <input
                placeholder="e.g. TLG-20250429-001"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={e => e.key === 'Enter' && search()}
                style={{
                  border:'none', outline:'none', background:'transparent',
                  fontSize: isMobile ? 14 : 15, color:TK.text1, width:'100%',
                  fontFamily:'Manrope, sans-serif',
                }}
              />
              {inputVal && (
                <button onClick={() => { setInputVal(''); setResult(null); setNotFound(false); }} style={{ border:'none', background:'none', cursor:'pointer', color:TK.text3, padding:0, display:'flex', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18 }}>close</span>
                </button>
              )}
            </div>
            <button
              onClick={() => search()}
              style={{
                padding: isMobile ? '12px 18px' : '14px 28px',
                background: TK.primary, color:'#fff', border:'none',
                fontWeight:800, fontSize: isMobile ? 13 : 14,
                cursor:'pointer', display:'flex', alignItems:'center', gap:7,
                transition:'background 0.15s', flexShrink:0,
                fontFamily:'Manrope, sans-serif',
              }}
              onMouseEnter={e => e.currentTarget.style.background = TK.primaryDim}
              onMouseLeave={e => e.currentTarget.style.background = TK.primary}
            >
              {loading
                ? <span style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'tlspin 0.8s linear infinite', display:'inline-block' }} />
                : <>Track <span className="material-symbols-outlined" style={{ fontSize:18 }}>arrow_forward</span></>
              }
            </button>
          </div>

          {/* Sample numbers */}
          <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:14, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>Try:</span>
            {['TLG-20250429-001','TLG-20250429-004','TLG-20250429-002'].map(n => (
              <button key={n} onClick={() => { setInputVal(n); search(n); }} style={{
                background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
                borderRadius:99, padding:'3px 11px', fontSize:11.5, color:'rgba(255,255,255,0.85)',
                cursor:'pointer', fontFamily:'monospace', fontWeight:600, transition:'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              >{n}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex:1, padding: isMobile ? '20px 16px' : '32px 40px', maxWidth:900, margin:'0 auto', width:'100%' }}>
        {/* Not found */}
        {notFound && (
          <div style={{ textAlign:'center', padding:'48px 20px', background:'#fff', borderRadius:20, border:`1px solid ${TK.border}`, animation:'pageIn 0.2s ease' }}>
            <span className="material-symbols-outlined" style={{ fontSize:52, color:TK.text3, display:'block', marginBottom:14, opacity:0.5 }}>search_off</span>
            <div style={{ fontWeight:800, fontSize:18, color:TK.text1, marginBottom:8 }}>Tracking number not found</div>
            <div style={{ fontSize:14, color:TK.text2 }}>
              Please check the number and try again. Contact{' '}
              <a href="mailto:support@target.kw" style={{ color:TK.primary, fontWeight:700, textDecoration:'none' }}>support@target.kw</a>
              {' '}for help.
            </div>
          </div>
        )}

        {/* Result */}
        {result && sd && (
          <div style={{ animation:'pageIn 0.22s ease', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Status header */}
            <div style={{ background:'#fff', borderRadius:20, border:`1px solid ${TK.border}`, padding: isMobile ? '20px 18px' : '26px 30px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:14, marginBottom:24 }}>
                <div>
                  <div style={{ fontSize:12, color:TK.text3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:6 }}>Tracking Number</div>
                  <div style={{ fontWeight:800, fontSize: isMobile ? 18 : 22, color:TK.text1, letterSpacing:'-0.02em', fontFamily:'monospace' }}>{result.trackingNumber}</div>
                  <div style={{ fontSize:12.5, color:TK.text2, marginTop:4 }}>{result.service} · {result.weight}</div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:12, background:sd.bg, color:sd.color, fontWeight:800, fontSize:14 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:20, fontVariationSettings:"'FILL' 1" }}>{STATUS_ICONS[result.status] || 'local_shipping'}</span>
                    {sd.label}
                  </span>
                  {result.eta && result.eta !== 'Delivered' && (
                    <div style={{ fontSize:12.5, color:TK.text2, marginTop:8, fontWeight:600 }}>
                      Estimated delivery: <strong style={{ color:TK.text1 }}>{result.eta}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div style={{ overflowX:'auto', paddingBottom:4 }}>
                <div style={{ minWidth:380 }}>
                  <TrackingProgress status={result.status} />
                </div>
              </div>
            </div>

            {/* Route & details */}
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:14 }}>
              <div style={{ background:'#fff', borderRadius:18, border:`1px solid ${TK.border}`, padding:'20px 22px' }}>
                <div style={{ fontWeight:700, fontSize:13.5, color:TK.text1, marginBottom:16 }}>Route Details</div>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { icon:'flight_takeoff', label:'Origin',      value:result.origin,      color:TK.primary },
                    { icon:'flight_land',    label:'Destination', value:result.destination, color:TK.success },
                  ].map((r, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:`${r.color}18`, display:'flex', alignItems:'center', justifyContent:'center', color:r.color, flexShrink:0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:20, fontVariationSettings:"'FILL' 1" }}>{r.icon}</span>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:TK.text3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em' }}>{r.label}</div>
                        <div style={{ fontWeight:700, fontSize:13.5, color:TK.text1, marginTop:2 }}>{r.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background:'#fff', borderRadius:18, border:`1px solid ${TK.border}`, padding:'20px 22px' }}>
                <div style={{ fontWeight:700, fontSize:13.5, color:TK.text1, marginBottom:16 }}>Shipment Info</div>
                {[
                  ['Service',  result.service],
                  ['Weight',   result.weight],
                  ['Created',  result.created],
                  ['ETA',      result.eta],
                ].map(([k, v], i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', paddingBottom: i < 3 ? 10 : 0, marginBottom: i < 3 ? 10 : 0, borderBottom: i < 3 ? `1px solid ${TK.border}` : 'none' }}>
                    <span style={{ fontSize:12.5, color:TK.text3 }}>{k}</span>
                    <span style={{ fontSize:12.5, fontWeight:600, color:TK.text1 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div style={{ background:'#fff', borderRadius:18, border:`1px solid ${TK.border}`, padding:'22px 24px' }}>
              <div style={{ fontWeight:700, fontSize:14, color:TK.text1, marginBottom:20 }}>Tracking History</div>
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {result.events.map((ev, i) => {
                  const isLast = i === result.events.length - 1;
                  return (
                    <div key={i} style={{ display:'flex', gap:16, position:'relative', paddingBottom: isLast ? 0 : 22 }}>
                      {/* Line */}
                      {!isLast && <div style={{ position:'absolute', left:15, top:32, bottom:0, width:2, background: i === 0 ? `linear-gradient(${TK.primary},${TK.border})` : TK.border, borderRadius:99 }} />}
                      {/* Dot */}
                      <div style={{
                        width:30, height:30, borderRadius:'50%', flexShrink:0,
                        border:`2.5px solid ${ev.active ? TK.primary : ev.done ? TK.success : TK.border}`,
                        background: ev.active ? TK.primary : ev.done ? TK.successBg : '#fff',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color: ev.active ? '#fff' : ev.done ? TK.success : TK.text3,
                        boxShadow: ev.active ? `0 0 0 5px ${TK.primary}20` : 'none',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize:15, fontVariationSettings:"'FILL' 1" }}>
                          {ev.active ? 'location_on' : ev.done ? 'check' : 'radio_button_unchecked'}
                        </span>
                      </div>
                      <div style={{ flex:1, paddingTop:4 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:4, marginBottom:4 }}>
                          <span style={{ fontWeight:700, fontSize:13.5, color: ev.active ? TK.primary : TK.text1 }}>{ev.status}</span>
                          <span style={{ fontSize:11.5, color:TK.text3 }}>{ev.time}</span>
                        </div>
                        <div style={{ fontSize:13, color:TK.text2, marginBottom:3 }}>{ev.desc}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:TK.text3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:13 }}>location_on</span>
                          {ev.location}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Help CTA */}
            <div style={{ background:TK.primaryBg, borderRadius:16, border:`1px solid ${TK.primary}22`, padding:'18px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span className="material-symbols-outlined" style={{ fontSize:24, color:TK.primary, fontVariationSettings:"'FILL' 1" }}>support_agent</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13.5, color:TK.primary }}>Need help with your shipment?</div>
                  <div style={{ fontSize:12, color:TK.text2, marginTop:2 }}>Our team is available 24/7 to assist you</div>
                </div>
              </div>
              <a href="mailto:support@target.kw" style={{
                display:'flex', alignItems:'center', gap:7, padding:'9px 18px',
                borderRadius:10, background:TK.primary, color:'#fff',
                fontWeight:700, fontSize:13, textDecoration:'none',
                boxShadow:'0 2px 8px rgba(0,80,212,0.22)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize:17 }}>mail</span>
                Contact Support
              </a>
            </div>
          </div>
        )}

        {/* Empty state (no search yet) */}
        {!result && !notFound && !loading && (
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap:14, marginTop:8 }}>
            {[
              { icon:'location_on',   label:'Real-Time Location', desc:'See exactly where your shipment is at any moment, updated live.' },
              { icon:'schedule',      label:'Delivery Timeline',   desc:'Full event history from pickup to final delivery with timestamps.' },
              { icon:'support_agent', label:'24/7 Support',        desc:'Our team is always available to help with any tracking inquiries.' },
            ].map((f, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:16, border:`1px solid ${TK.border}`, padding:'22px', textAlign:'center' }}>
                <div style={{ width:52, height:52, borderRadius:14, background:TK.primaryBg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', color:TK.primary }}>
                  <span className="material-symbols-outlined" style={{ fontSize:26, fontVariationSettings:"'FILL' 1" }}>{f.icon}</span>
                </div>
                <div style={{ fontWeight:700, fontSize:14, color:TK.text1, marginBottom:8 }}>{f.label}</div>
                <div style={{ fontSize:13, color:TK.text2, lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ borderTop:`1px solid ${TK.border}`, padding: isMobile ? '16px' : '20px 40px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, background:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:26, height:26, borderRadius:7, background:'linear-gradient(135deg,#0EA5E9,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize:15, color:'#fff', fontVariationSettings:"'FILL' 1" }}>local_shipping</span>
          </div>
          <span style={{ fontWeight:700, fontSize:13, color:TK.text1 }}>Target Logistics Global</span>
        </div>
        <div style={{ fontSize:12, color:TK.text3 }}>© 2025 Target Logistics. All rights reserved.</div>
        {onGoBack && (
          <a onClick={onGoBack} href="#" style={{ fontSize:12.5, color:TK.primary, fontWeight:700, textDecoration:'none' }}>Staff Login →</a>
        )}
      </footer>
    </div>
  );
};

Object.assign(window, { TrackingPage });
