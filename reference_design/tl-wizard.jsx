// ═══════════════════════════════════════════════
// Target Logistics — Shipment Creation Wizard v3
// 6 steps: Sender · Receiver · Package · Service & Carrier · Logistics · Review
// Address autocomplete via geocode API, carrier selection, live quote
// ═══════════════════════════════════════════════

const WIZARD_STEPS = [
  { id: 1, label: 'Sender',    icon: 'flight_takeoff'  },
  { id: 2, label: 'Receiver',  icon: 'flight_land'     },
  { id: 3, label: 'Package',   icon: 'inventory_2'     },
  { id: 4, label: 'Service',   icon: 'local_shipping'  },
  { id: 5, label: 'Logistics', icon: 'event_note'      },
  { id: 6, label: 'Review',    icon: 'fact_check'      },
];

const COUNTRIES = [
  'Kuwait','United Arab Emirates','Saudi Arabia','Qatar','Bahrain','Oman',
  'United Kingdom','Germany','France','United States','Canada','Australia',
  'Japan','Singapore','India','China','Egypt','Turkey','South Africa','Brazil',
];

const SERVICES = [
  { id:'express_air', label:'Express Air', icon:'flight', eta:'1–3 business days', desc:'Priority door-to-door air freight. Fastest available option.', price:'From KD 18.00', badge:'Fastest', badgeColor:TK.primary },
  { id:'standard', label:'Standard Shipping', icon:'local_shipping', eta:'5–10 business days', desc:'Reliable ground or sea freight for non-urgent cargo.', price:'From KD 6.50', badge:'Best Value', badgeColor:TK.success },
  { id:'document_express', label:'Document Express', icon:'description', eta:'2–4 business days', desc:'Secure, tracked delivery for documents and envelopes only.', price:'From KD 4.00', badge:'Docs Only', badgeColor:TK.purple },
  { id:'economy', label:'Economy Freight', icon:'warehouse', eta:'8–14 business days', desc:'Cost-effective bulk freight. Ideal for heavy or large shipments.', price:'From KD 3.20', badge:'Bulk', badgeColor:'#b45309' },
];

// Advisory carrier options per service tier (visual comparison; real award happens via bookingOptions/book after creation)
const CARRIERS_BY_SERVICE = {
  express_air:       [ { id:'kwa', name:'Kuwait Airways Cargo', eta:'1–2 days', rating:4.8, priceDelta:0 }, { id:'dhl', name:'DHL Express',         eta:'2–3 days', rating:4.6, priceDelta:2.50 }, { id:'fdx', name:'FedEx International', eta:'2–3 days', rating:4.5, priceDelta:3.10 } ],
  standard:          [ { id:'aramex', name:'Aramex Standard',    eta:'6–9 days', rating:4.3, priceDelta:0 }, { id:'ups', name:'UPS Ground',          eta:'7–10 days',rating:4.2, priceDelta:1.20 } ],
  document_express:  [ { id:'dhl-doc', name:'DHL Document Express', eta:'2–3 days', rating:4.7, priceDelta:0 }, { id:'ups-doc', name:'UPS Docs',  eta:'3–4 days', rating:4.4, priceDelta:0.80 } ],
  economy:           [ { id:'sea', name:'Gulf Sea Freight',      eta:'10–14 days',rating:4.0, priceDelta:0 }, { id:'rail', name:'Overland Freight', eta:'8–12 days', rating:4.1, priceDelta:1.50 } ],
};

// ── Wizard Input ─────────────────────────────────
const WInput = ({ label, placeholder, value, onChange, type = 'text', icon, required, half, onBlur, trailing }) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: half ? '1 1 calc(50% - 6px)' : '1 1 100%', minWidth: half ? 140 : 'unset' }}>
      <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2 }}>
        {label}{required && <span style={{ color: TK.error, marginLeft: 3 }}>*</span>}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 13px', borderRadius: 11,
        border: `1.5px solid ${focused ? TK.primary : TK.border}`,
        background: '#fff',
        boxShadow: focused ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none',
        transition: 'all 0.15s',
      }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize: 17, color: focused ? TK.primary : TK.text3, transition: 'color 0.15s', flexShrink: 0 }}>{icon}</span>}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={(e) => { setFocused(false); onBlur && onBlur(e); }}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: TK.text1, width: '100%', minHeight: 20 }}
        />
        {trailing}
      </div>
    </div>
  );
};

// ── Wizard Select ────────────────────────────────
const WSelect = ({ label, value, onChange, options, icon, half }) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: half ? '1 1 calc(50% - 6px)' : '1 1 100%', minWidth: half ? 140 : 'unset' }}>
      <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2 }}>{label}</label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 13px', borderRadius: 11,
        border: `1.5px solid ${focused ? TK.primary : TK.border}`,
        background: '#fff',
        boxShadow: focused ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none',
        transition: 'all 0.15s',
      }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize: 17, color: focused ? TK.primary : TK.text3, transition: 'color 0.15s', flexShrink: 0 }}>{icon}</span>}
        <select
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: value ? TK.text1 : TK.text3, width: '100%', cursor: 'pointer', appearance: 'none', minHeight: 20 }}
        >
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.text3, flexShrink: 0 }}>expand_more</span>
      </div>
    </div>
  );
};

// ── Address autocomplete field ───────────────────
const AddressAutocomplete = ({ value, onChange, onPick, placeholder }) => {
  const [focused, setFocused] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const sessionRef = React.useRef(Math.random().toString(36).slice(2));

  React.useEffect(() => {
    if (!value || value.trim().length < 2) { setResults([]); setOpen(false); return; }
    let active = true;
    setLoading(true);
    const id = setTimeout(() => {
      TL_API.geocode.autocomplete({ query: value, sessionToken: sessionRef.current })
        .then(r => { if (!active) return; const list = (r && (r.data || r)) || []; setResults(list); setOpen(list.length > 0); setLoading(false); })
        .catch(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(id); };
  }, [value]);

  const pick = (item) => {
    setOpen(false);
    TL_API.geocode.details(item.placeId, sessionRef.current)
      .then(r => onPick((r && (r.data || r)) || item, item))
      .catch(() => onPick(item, item));
  };

  return (
    <div style={{ position: 'relative', flex: '1 1 100%' }}>
      <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2, display: 'block', marginBottom: 6 }}>
        Address Search<span style={{ color: TK.error, marginLeft: 3 }}>*</span>
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 13px', borderRadius: 11,
        border: `1.5px solid ${focused ? TK.primary : TK.border}`,
        background: '#fff',
        boxShadow: focused ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none',
        transition: 'all 0.15s',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 17, color: focused ? TK.primary : TK.text3, flexShrink: 0 }}>search</span>
        <input
          value={value}
          placeholder={placeholder || 'Start typing an address or city…'}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { setFocused(true); if (results.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: TK.text1, width: '100%' }}
        />
        {loading && <span style={{ width: 14, height: 14, border: '2px solid rgba(0,80,212,0.25)', borderTopColor: TK.primary, borderRadius: '50%', animation: 'tlspin 0.8s linear infinite', flexShrink: 0 }} />}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: `1px solid ${TK.border}`, borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          {results.map((r, i) => (
            <button
              key={r.placeId || i}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < results.length - 1 ? `1px solid ${TK.border}` : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f7fa'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.text3, flexShrink: 0 }}>location_on</span>
              <span style={{ fontSize: 13, color: TK.text1 }}>{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Step 1 & 2: Address form ─────────────────────
const AddressStep = ({ title, subtitle, icon, data, setData }) => {
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const [manual, setManual] = React.useState(!!data.addr1);
  const [verifying, setVerifying] = React.useState(false);

  const runValidate = () => {
    if (!data.addr1 || !data.city || !data.country) return;
    setVerifying(true);
    TL_API.geocode.validate({ addr1: data.addr1, addr2: data.addr2, city: data.city, state: data.state, zip: data.zip, country: data.country })
      .then(r => { const res = (r && (r.data || r)) || {}; upd('verified', res.valid !== false); setVerifying(false); })
      .catch(() => { upd('verified', undefined); setVerifying(false); });
  };

  const handlePick = (details) => {
    setData(d => ({
      ...d,
      addr1: details.addr1 || d.addr1,
      city: details.city || d.city,
      state: details.state || d.state,
      zip: details.zip || d.zip,
      country: details.country || d.country,
      lat: details.lat, lng: details.lng,
      verified: true,
    }));
    setManual(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: TK.text1 }}>{title}</div>
          <div style={{ fontSize: 13, color: TK.text2, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <WInput label="Full Name" placeholder="e.g. Mohammed Al-Ali" value={data.name} onChange={e => upd('name', e.target.value)} icon="person" required />
        <WInput label="Company / Organization" placeholder="Optional" value={data.company} onChange={e => upd('company', e.target.value)} icon="business" />
        <WInput label="Phone Number" placeholder="+965 XXXX XXXX" value={data.phone} onChange={e => upd('phone', e.target.value)} icon="phone" required half />
        <WInput label="Email" placeholder="email@example.com" value={data.email} onChange={e => upd('email', e.target.value)} type="email" icon="mail" half />

        {!manual ? (
          <AddressAutocomplete
            value={data.addr1}
            onChange={v => upd('addr1', v)}
            onPick={handlePick}
            placeholder="Street, building, area…"
          />
        ) : (
          <>
            <WInput label="Address Line 1" placeholder="Street, building, floor" value={data.addr1} onChange={e => upd('addr1', e.target.value)} onBlur={runValidate} icon="home" required />
            <WInput label="Address Line 2" placeholder="Apt, suite (optional)" value={data.addr2} onChange={e => upd('addr2', e.target.value)} icon="add_location" />
            <WInput label="City" placeholder="e.g. Kuwait City" value={data.city} onChange={e => upd('city', e.target.value)} onBlur={runValidate} icon="location_city" required half />
            <WInput label="State / Province" placeholder="Optional" value={data.state} onChange={e => upd('state', e.target.value)} icon="map" half />
            <WInput label="Postal Code" placeholder="e.g. 13001" value={data.zip} onChange={e => upd('zip', e.target.value)} icon="pin" half />
            <WSelect label="Country" value={data.country} onChange={e => { upd('country', e.target.value); runValidate(); }} options={COUNTRIES} icon="public" half />
          </>
        )}

        <div style={{ flex: '1 1 100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={() => setManual(m => !m)} style={{ border: 'none', background: 'none', color: TK.primary, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            {manual ? '← Back to address search' : 'Enter address manually'}
          </button>
          {manual && data.addr1 && data.city && data.country && (
            verifying ? (
              <span style={{ fontSize: 11.5, color: TK.text3, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(0,80,212,0.25)', borderTopColor: TK.primary, borderRadius: '50%', animation: 'tlspin 0.8s linear infinite' }} />
                Verifying…
              </span>
            ) : data.verified === true ? (
              <span style={{ fontSize: 11.5, color: TK.success, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>verified</span> Address verified
              </span>
            ) : data.verified === false ? (
              <span style={{ fontSize: 11.5, color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span> Couldn't verify — please double-check
              </span>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
};

// ── Step 3: Package ──────────────────────────────
const PackageStep = ({ data, setData }) => {
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary, fontVariationSettings: "'FILL' 1" }}>inventory_2</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: TK.text1 }}>Package Details</div>
          <div style={{ fontSize: 13, color: TK.text2, marginTop: 2 }}>Describe the contents and physical dimensions</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <WInput label="Content Description" placeholder="e.g. Electronic components, clothing" value={data.description} onChange={e => upd('description', e.target.value)} icon="subject" required />
        <WInput label="Quantity (pieces)" placeholder="1" value={data.qty} onChange={e => upd('qty', e.target.value)} type="number" icon="pin" half />
        <WInput label="Declared Value (KD)" placeholder="0.000" value={data.value} onChange={e => upd('value', e.target.value)} type="number" icon="payments" half />
        <WInput label="Weight (kg)" placeholder="0.0" value={data.weight} onChange={e => upd('weight', e.target.value)} type="number" icon="scale" half />

        <div style={{ flex: '1 1 100%' }}>
          <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2, display: 'block', marginBottom: 8 }}>
            Dimensions (cm) — L × W × H
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Length','Width','Height'].map(dim => (
              <WInput key={dim} label={dim} placeholder="0" value={data[dim.toLowerCase()]} onChange={e => upd(dim.toLowerCase(), e.target.value)} type="number" half />
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2 }}>Package Type</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Box','Envelope','Pallet','Tube','Bag'].map(t => (
              <button
                key={t}
                onClick={() => upd('pkgType', t)}
                style={{
                  padding: '10px 16px', borderRadius: 10, minHeight: 44,
                  border: `1.5px solid ${data.pkgType === t ? TK.primary : TK.border}`,
                  background: data.pkgType === t ? TK.primaryBg : '#fff',
                  color: data.pkgType === t ? TK.primary : TK.text2,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >{t}</button>
            ))}
          </div>
        </div>

        <div style={{
          flex: '1 1 100%', padding: '14px 16px', borderRadius: 13,
          border: `1.5px solid ${data.insurance ? TK.primary : TK.border}`,
          background: data.insurance ? TK.primaryBg : '#fafbfc',
          display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
          onClick={() => upd('insurance', !data.insurance)}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${data.insurance ? TK.primary : TK.text3}`,
            background: data.insurance ? TK.primary : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
            {data.insurance && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff', fontVariationSettings: "'FILL' 1" }}>check</span>}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>Add Shipment Insurance</div>
            <div style={{ fontSize: 12, color: TK.text2, marginTop: 2 }}>Protect against loss or damage. Coverage up to declared value. ~1% of declared value.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Step 4: Service & Carrier ────────────────────
const ServiceStep = ({ data, setData, quote }) => {
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const carriers = CARRIERS_BY_SERVICE[data.service] || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary, fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: TK.text1 }}>Service & Carrier</div>
          <div style={{ fontSize: 13, color: TK.text2, marginTop: 2 }}>Choose a shipping tier, then compare carriers and pricing</div>
        </div>
      </div>

      {/* Service tiers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {SERVICES.map(s => {
          const isSelected = data.service === s.id;
          return (
            <div
              key={s.id}
              onClick={() => { upd('service', s.id); upd('carrierId', null); }}
              style={{
                padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
                border: `2px solid ${isSelected ? TK.primary : TK.border}`,
                background: isSelected ? TK.primaryBg : '#fff',
                display: 'flex', alignItems: 'center', gap: 14,
                transition: 'all 0.18s',
                boxShadow: isSelected ? `0 4px 16px rgba(0,80,212,0.12)` : '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: isSelected ? `${TK.primary}1a` : '#f5f7fa',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isSelected ? TK.primary : TK.text3,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0" }}>{s.icon}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: isSelected ? TK.primary : TK.text1 }}>{s.label}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: `${s.badgeColor}18`, color: s.badgeColor }}>{s.badge}</span>
                </div>
                <div style={{ fontSize: 12, color: TK.text2, marginTop: 3 }}>{s.desc}</div>
                <div style={{ fontSize: 12, color: TK.text3, marginTop: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 3 }}>schedule</span>
                  {s.eta}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: isSelected ? TK.primary : TK.text1 }}>{s.price}</div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', margin: '8px 0 0 auto',
                  border: `2px solid ${isSelected ? TK.primary : TK.border}`,
                  background: isSelected ? TK.primary : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff', fontVariationSettings: "'FILL' 1" }}>check</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Carrier comparison */}
      {carriers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: TK.text1, marginBottom: 10 }}>Compare Carriers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {carriers.map(c => {
              const base = quote && quote.total ? parseFloat(String(quote.total).replace(/[^0-9.]/g,'')) : 21.66;
              const est = (base + (c.priceDelta || 0)).toFixed(3);
              const isSel = data.carrierId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => upd('carrierId', c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 12, cursor: 'pointer', minHeight: 44,
                    border: `1.5px solid ${isSel ? TK.success : TK.border}`,
                    background: isSel ? TK.successBg : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isSel ? TK.success : TK.border}`,
                    background: isSel ? TK.success : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSel && <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#fff', fontVariationSettings: "'FILL' 1" }}>check</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 1 }}>{c.eta} · ★ {c.rating}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: isSel ? TK.success : TK.text1, flexShrink: 0 }}>KD {est}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Step 5: Logistics (Pickup + Customs merged) ──
const LogisticsStep = ({ service, setService, customs, setCustoms }) => {
  const updS = (k, v) => setService(d => ({ ...d, [k]: v }));
  const updC = (k, v) => setCustoms(d => ({ ...d, [k]: v }));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary, fontVariationSettings: "'FILL' 1" }}>event_note</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: TK.text1 }}>Pickup & Customs</div>
          <div style={{ fontSize: 13, color: TK.text2, marginTop: 2 }}>Schedule pickup and declare customs details for international shipping</div>
        </div>
      </div>

      {/* Pickup */}
      <div style={{ padding: '18px', background: '#f8fafb', borderRadius: 14, border: `1px solid ${TK.border}`, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: TK.text1, marginBottom: 14 }}>Pickup Scheduling</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <WSelect label="Pickup Type" value={service.pickupType} onChange={e => updS('pickupType', e.target.value)} options={['Schedule Pickup','Drop Off at Branch']} icon="schedule_send" half />
          <WInput label="Preferred Date" type="date" value={service.pickupDate} onChange={e => updS('pickupDate', e.target.value)} icon="calendar_today" half />
          <WSelect label="Time Window" value={service.pickupTime} onChange={e => updS('pickupTime', e.target.value)} options={['9:00 AM – 12:00 PM','12:00 PM – 3:00 PM','3:00 PM – 6:00 PM']} icon="schedule" half />
          <WInput label="Special Instructions" placeholder="e.g. ring doorbell, call ahead…" value={service.instructions} onChange={e => updS('instructions', e.target.value)} icon="sticky_note_2" half />
        </div>
      </div>

      {/* Customs */}
      <div style={{ padding: '18px', background: '#fff', borderRadius: 14, border: `1px solid ${TK.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: TK.text1, marginBottom: 14 }}>Customs & Declaration</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <WSelect label="Shipment Type" value={customs.shipmentType} onChange={e => updC('shipmentType', e.target.value)} options={['Commercial','Personal / Gift','Sample','Repair / Return','Other']} icon="category" half />
          <WSelect label="Incoterms" value={customs.incoterms} onChange={e => updC('incoterms', e.target.value)} options={['DAP – Delivered at Place','DDP – Duty Paid','EXW – Ex Works','FOB – Free on Board','CIF – Cost, Insurance & Freight']} icon="handshake" half />
          <WInput label="HS / Tariff Code" placeholder="e.g. 8471.30" value={customs.hsCode} onChange={e => updC('hsCode', e.target.value)} icon="barcode_reader" half />
          <WInput label="Country of Origin" placeholder="e.g. Kuwait" value={customs.origin} onChange={e => updC('origin', e.target.value)} icon="flag" half />
          <WInput label="Commercial Invoice Number" placeholder="INV-2025-XXXX" value={customs.invoiceNum} onChange={e => updC('invoiceNum', e.target.value)} icon="receipt_long" half />
          <WInput label="Invoice Value (KD)" placeholder="0.000" value={customs.invoiceVal} onChange={e => updC('invoiceVal', e.target.value)} type="number" icon="payments" half />
          <WInput label="Additional Notes" placeholder="Special instructions for customs…" value={customs.notes} onChange={e => updC('notes', e.target.value)} icon="notes" />

          <div style={{ flex: '1 1 100%', padding: '14px 16px', borderRadius: 13, background: TK.infoBg, border: `1px solid ${TK.info}30`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.info, flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>info</span>
            <div style={{ fontSize: 12.5, color: TK.info, lineHeight: 1.6 }}>
              <strong>Customs Compliance:</strong> All declarations must be accurate. False or incomplete customs documentation may cause delays, fines, or seizure.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Step 6: Review ───────────────────────────────
const ReviewStep = ({ sender, receiver, pkg, service, customs, quote, confirmed, setConfirmed }) => {
  const svc = SERVICES.find(s => s.id === service.service) || SERVICES[0];
  const carrier = (CARRIERS_BY_SERVICE[service.service] || []).find(c => c.id === service.carrierId);

  const SectionCard = ({ title, icon, color, rows }) => (
    <div style={{ background: '#fafbfc', borderRadius: 13, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${TK.border}`, display: 'flex', alignItems: 'center', gap: 9 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{title}</span>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.filter(r => r[1]).map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 12, color: TK.text3, fontWeight: 600 }}>{k}</span>
            <span style={{ fontSize: 12.5, color: TK.text1, fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.success, fontVariationSettings: "'FILL' 1" }}>fact_check</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: TK.text1 }}>Review & Confirm</div>
          <div style={{ fontSize: 13, color: TK.text2, marginTop: 2 }}>Verify all details before creating the shipment</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
        <SectionCard title="Sender" icon="flight_takeoff" color={TK.primary} rows={[
          ['Name', sender.name], ['Phone', sender.phone], ['Address', sender.addr1], ['City', sender.city], ['Country', sender.country],
          ['Verified', sender.verified === true ? 'Yes' : sender.verified === false ? 'Unverified' : null],
        ]} />
        <SectionCard title="Receiver" icon="flight_land" color={TK.info} rows={[
          ['Name', receiver.name], ['Phone', receiver.phone], ['Address', receiver.addr1], ['City', receiver.city], ['Country', receiver.country],
          ['Verified', receiver.verified === true ? 'Yes' : receiver.verified === false ? 'Unverified' : null],
        ]} />
        <SectionCard title="Package" icon="inventory_2" color={TK.purple} rows={[
          ['Description', pkg.description], ['Weight', pkg.weight ? `${pkg.weight} kg` : null],
          ['Dimensions', pkg.length ? `${pkg.length}×${pkg.width}×${pkg.height} cm` : null],
          ['Declared Value', pkg.value ? `KD ${pkg.value}` : null],
          ['Insurance', pkg.insurance ? 'Included' : 'Not included'],
        ]} />
        <SectionCard title="Service & Carrier" icon="local_shipping" color={svc.badgeColor} rows={[
          ['Service', svc.label], ['Carrier', carrier ? carrier.name : 'Not selected'], ['ETA', carrier ? carrier.eta : svc.eta],
          ['Pickup', service.pickupType], ['Pickup Date', service.pickupDate],
        ]} />
      </div>

      {/* Cost summary — live quote */}
      <div style={{ padding: '16px 18px', background: '#fff', borderRadius: 14, border: `1.5px solid ${TK.border}`, marginBottom: 14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>Cost Estimate</div>
          {quote && quote.loading && <span style={{ fontSize:11, color:TK.text3 }}>Refreshing…</span>}
          {quote && quote.error && <span style={{ fontSize:11, color:TK.error }}>Quote error — using estimate</span>}
        </div>
        {(quote && quote.lines ? quote.lines : [
          { label:'Base shipping rate', amount:'KD 18.00' },
          { label:'Carrier adjustment', amount: carrier && carrier.priceDelta ? `KD ${carrier.priceDelta.toFixed(2)}` : '—' },
          { label:'Insurance', amount: pkg.insurance ? 'KD 0.50' : '—' },
          { label:'Customs handling', amount:'KD 1.50' },
        ]).map((row, i, arr) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottom: i < arr.length - 1 ? `1px solid ${TK.border}` : 'none' }}>
            <span style={{ fontSize: 13, color: TK.text2 }}>{row.label}</span>
            <span style={{ fontSize: 13, color: TK.text1, fontWeight: 600 }}>{row.amount}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop:4 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: TK.text1 }}>Total Estimate</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: TK.primary }}>
            {quote && quote.total ? quote.total : `KD ${pkg.insurance ? '22.16' : '21.66'}`}
          </span>
        </div>
      </div>

      {/* Confirmation */}
      <div
        style={{
          padding: '14px 16px', borderRadius: 13,
          border: `1.5px solid ${confirmed ? TK.success : TK.border}`,
          background: confirmed ? TK.successBg : '#fafbfc',
          display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'all 0.15s',
        }}
        onClick={() => setConfirmed(c => !c)}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${confirmed ? TK.success : TK.text3}`,
          background: confirmed ? TK.success : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          {confirmed && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff', fontVariationSettings: "'FILL' 1" }}>check</span>}
        </div>
        <span style={{ fontSize: 13, color: TK.text2, lineHeight: 1.5 }}>
          I confirm that all information provided is accurate and I agree to Target Logistics{' '}
          <a href="#" style={{ color: TK.primary, fontWeight: 700, textDecoration: 'none' }}>Terms of Service</a> and{' '}
          <a href="#" style={{ color: TK.primary, fontWeight: 700, textDecoration: 'none' }}>Customs Policy</a>.
        </span>
      </div>
    </div>
  );
};

// ── Progress Bar ─────────────────────────────────
const WizardProgress = ({ step, setStep, isMobile }) => (
  <div style={{ marginBottom: isMobile ? 20 : 28 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {WIZARD_STEPS.map((s, i) => {
        const isDone    = step > s.id;
        const isCurrent = step === s.id;
        const isLast    = i === WIZARD_STEPS.length - 1;
        return (
          <React.Fragment key={s.id}>
            <div
              onClick={() => isDone && setStep(s.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: isDone ? 'pointer' : 'default' }}
            >
              <div style={{
                width: isMobile ? 30 : 36, height: isMobile ? 30 : 36,
                borderRadius: '50%',
                border: `2px solid ${isDone ? TK.success : isCurrent ? TK.primary : TK.border}`,
                background: isDone ? TK.success : isCurrent ? TK.primary : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isDone || isCurrent ? '#fff' : TK.text3,
                transition: 'all 0.3s',
                flexShrink: 0,
              }}>
                {isDone
                  ? <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 16 : 18, fontVariationSettings: "'FILL' 1" }}>check</span>
                  : <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 16 : 18, fontVariationSettings: isCurrent ? "'FILL' 1" : "'FILL' 0" }}>{s.icon}</span>
                }
              </div>
              {!isMobile && (
                <span style={{ fontSize: 10.5, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? TK.primary : isDone ? TK.success : TK.text3, whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              )}
            </div>
            {!isLast && (
              <div style={{
                flex: 1, height: 2, margin: isMobile ? '0 4px' : '0 6px',
                marginBottom: isMobile ? 0 : 22,
                background: isDone ? TK.success : TK.border,
                transition: 'background 0.3s',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

// ── Main Wizard ──────────────────────────────────
const ShipmentWizard = ({ onClose, onComplete, editing }) => {
  const [step, setStep] = React.useState(1);
  const [success, setSuccess] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState(null);
  const [createdTn, setCreatedTn] = React.useState(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [quote, setQuote] = React.useState(null);
  const w = useWindowWidth();
  const isMobile = w < 640;

  const blank = (country='') => ({ name:'', company:'', phone:'', email:'', addr1:'', addr2:'', city:'', state:'', zip:'', country, verified: undefined });
  const [sender,   setSender]   = React.useState(() => editing?.sender   || blank('Kuwait'));
  const [receiver, setReceiver] = React.useState(() => editing?.receiver || blank(''));
  const [pkg,      setPkg]      = React.useState(() => editing?.package  || { description:'', qty:'1', value:'', weight:'', length:'', width:'', height:'', pkgType:'Box', insurance: false });
  const [service,  setService]  = React.useState(() => editing?.service  || { service:'express_air', carrierId:null, pickupType:'Schedule Pickup', pickupDate:'', pickupTime:'', instructions:'' });
  const [customs,  setCustoms]  = React.useState(() => editing?.customs  || { shipmentType:'', incoterms:'', hsCode:'', origin:'Kuwait', invoiceNum:'', invoiceVal:'', notes:'' });

  const canProceed = () => {
    if (step === 1) return sender.name && sender.phone && sender.country && sender.addr1;
    if (step === 2) return receiver.name && receiver.phone && receiver.country && receiver.addr1;
    if (step === 3) return pkg.description && pkg.weight;
    if (step === 4) return service.service;
    return true;
  };

  const buildPayload = () => ({
    sender, receiver,
    package: {
      description: pkg.description,
      quantity: Number(pkg.qty) || 1,
      declaredValue: Number(pkg.value) || 0,
      weightKg: Number(pkg.weight) || 0,
      dimensions: { lengthCm: Number(pkg.length)||0, widthCm: Number(pkg.width)||0, heightCm: Number(pkg.height)||0 },
      type: pkg.pkgType,
      insurance: !!pkg.insurance,
    },
    service: {
      code: service.service,
      carrierId: service.carrierId || null,
      pickupType: service.pickupType,
      pickupDate: service.pickupDate || null,
      pickupTime: service.pickupTime || null,
      instructions: service.instructions || '',
    },
    customs,
  });

  // Live quote: refresh on Service step and Review step
  React.useEffect(() => {
    if (step !== 4 && step !== 6) return;
    if (!window.TL_API) return;
    let cancelled = false;
    setQuote(q => ({ ...(q||{}), loading: true, error: null }));
    window.TL_API.shipments.quote(buildPayload())
      .then(r => {
        if (cancelled) return;
        const d = r && (r.data || r);
        setQuote({ loading: false, error: null, lines: d?.lines || null, total: d?.total || null, currency: d?.currency || 'KD' });
      })
      .catch(err => {
        if (cancelled) return;
        setQuote({ loading: false, error: err.message || 'quote failed', lines: null, total: null });
      });
    return () => { cancelled = true; };
  }, [step, service.service, service.carrierId, pkg.weight, pkg.value, pkg.insurance, pkg.length, pkg.width, pkg.height, sender.country, receiver.country]);

  const handleConfirm = async () => {
    if (!confirmed) { setSubmitError('Please confirm the declaration.'); return; }
    setSubmitting(true); setSubmitError(null);
    try {
      const payload = buildPayload();
      const call = editing
        ? window.TL_API.shipments.update(editing.trackingNumber, payload)
        : window.TL_API.shipments.create(payload);
      const r = await call;
      const d = r && (r.data || r);
      const tn = d?.trackingNumber || editing?.trackingNumber || ('TLG-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*900)+100));
      // Best-effort: award the chosen carrier if backend supports booking post-create
      if (!editing && service.carrierId && window.TL_API.shipments.book) {
        window.TL_API.shipments.book(tn, { carrierId: service.carrierId }).catch(() => {});
      }
      setCreatedTn(tn);
      setSuccess(true);
      setTimeout(() => { onComplete && onComplete(d); }, 1800);
    } catch (err) {
      setSubmitError(err.message || 'Failed to save shipment');
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 40px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
          background: TK.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'tlSlideIn 0.4s ease',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 42, color: TK.success, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, color: TK.text1, marginBottom: 8 }}>{editing ? 'Shipment Updated!' : 'Shipment Created!'}</div>
        <div style={{ fontSize: 14, color: TK.text2, marginBottom: 20 }}>
          Tracking number: <strong style={{ color: TK.primary }}>{createdTn}</strong>
        </div>
        <div style={{ fontSize: 13, color: TK.text3 }}>Redirecting to shipments…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '16px 16px 0' : '24px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: isMobile ? 16 : 18, color: TK.text1 }}>{editing ? 'Edit Shipment' : 'New Shipment'}</div>
            <div style={{ fontSize: 12, color: TK.text3, marginTop: 2 }}>{editing ? `Editing ${editing.trackingNumber}` : `Step ${step} of ${WIZARD_STEPS.length}`}</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${TK.border}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TK.text2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <WizardProgress step={step} setStep={setStep} isMobile={isMobile} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 16px' : '0 28px' }}>
        <div style={{ animation: 'pageIn 0.2s ease' }}>
          {step === 1 && <AddressStep title="Sender Details" subtitle="Who is sending this shipment?" icon="flight_takeoff" data={sender} setData={setSender} />}
          {step === 2 && <AddressStep title="Receiver Details" subtitle="Who is receiving this shipment?" icon="flight_land" data={receiver} setData={setReceiver} />}
          {step === 3 && <PackageStep data={pkg} setData={setPkg} />}
          {step === 4 && <ServiceStep data={service} setData={setService} quote={quote} />}
          {step === 5 && <LogisticsStep service={service} setService={setService} customs={customs} setCustoms={setCustoms} />}
          {step === 6 && <ReviewStep sender={sender} receiver={receiver} pkg={pkg} service={service} customs={customs} quote={quote} confirmed={confirmed} setConfirmed={setConfirmed} />}
          {step === 6 && submitError && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:10, background:TK.errorBg, color:TK.error, fontSize:12.5, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18 }}>error</span>
              {submitError}
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div style={{
        padding: isMobile ? '14px 16px' : '18px 28px',
        borderTop: `1px solid ${TK.border}`,
        display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 10,
        background: '#fafbfc', flexShrink: 0,
      }}>
        <button
          onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '11px 18px', borderRadius: 10, border: `1px solid ${TK.border}`,
            background: '#fff', color: TK.text2, order: isMobile ? 2 : 0,
            fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', minHeight: 44,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f0f2f5'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
          {step < 6 && (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '11px 22px', borderRadius: 10, border: 'none', minHeight: 44,
                background: canProceed() ? TK.primary : '#c5d3ef',
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: canProceed() ? 'pointer' : 'not-allowed',
                boxShadow: canProceed() ? '0 2px 8px rgba(0,80,212,0.22)' : 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (canProceed()) e.currentTarget.style.background = TK.primaryDim; }}
              onMouseLeave={e => { if (canProceed()) e.currentTarget.style.background = TK.primary; }}
            >
              Continue
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
            </button>
          )}
          {step === 6 && (
            <button
              onClick={handleConfirm}
              disabled={submitting || !confirmed}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '11px 24px', borderRadius: 10, border: 'none', minHeight: 44,
                background: submitting || !confirmed ? '#9bcab4' : TK.success,
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: submitting || !confirmed ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(10,110,79,0.22)',
                transition: 'all 0.15s',
              }}
            >
              {submitting
                ? <><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'tlspin 0.8s linear infinite', display:'inline-block' }} /> Saving…</>
                : <><span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>check_circle</span> {editing ? 'Save Changes' : 'Create Shipment'}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ShipmentWizard });
