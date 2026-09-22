// ═══════════════════════════════════════════════
// Target Logistics — Organizations Page v2
// Full Create/Edit Organization modal
// ═══════════════════════════════════════════════

const ORGS_DATA = [
  { id:1, name:'Al-Fardan Trading',  type:'Business',  country:'Kuwait',  contacts:3, shipments:342, balance:'KD 80.00',  status:'active',    since:'Jan 2024', logo:'AF' },
  { id:2, name:'Gulf Exports Ltd',   type:'Business',  country:'Kuwait',  contacts:5, shipments:218, balance:'KD 144.20', status:'active',    since:'Mar 2023', logo:'GE' },
  { id:3, name:'Al-Zain Corp',       type:'Business',  country:'Kuwait',  contacts:2, shipments:97,  balance:'KD 12.50',  status:'suspended', since:'Sep 2023', logo:'AZ' },
  { id:4, name:'Personal',           type:'Individual',country:'Kuwait',  contacts:1, shipments:56,  balance:'KD 22.00',  status:'active',    since:'Jun 2024', logo:'P'  },
  { id:5, name:'Noor Logistics',     type:'Business',  country:'Bahrain', contacts:4, shipments:189, balance:'KD 67.00',  status:'active',    since:'Nov 2022', logo:'NL' },
  { id:6, name:'Khalij Freight Co.', type:'Business',  country:'UAE',     contacts:6, shipments:431, balance:'KD 230.00', status:'active',    since:'Feb 2022', logo:'KF' },
];

const ORG_STATUS = {
  active:    { label:'Active',    color:TK.success, bg:TK.successBg },
  suspended: { label:'Suspended', color:TK.error,   bg:TK.errorBg   },
  pending:   { label:'Pending',   color:'#b45309',  bg:'#fef3c7'    },
};

const COUNTRIES_LIST = [
  'Kuwait','United Arab Emirates','Saudi Arabia','Qatar','Bahrain','Oman',
  'United Kingdom','Germany','France','United States','Canada','Australia',
  'Japan','Singapore','India','Egypt','Turkey',
];

// ── OModal Input helper ───────────────────────
const OInput = ({ label, placeholder, value, onChange, type='text', icon, required }) => {
  const [f, setF] = React.useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>
        {label}{required && <span style={{ color:TK.error, marginLeft:3 }}>*</span>}
      </label>
      <div style={{
        display:'flex', alignItems:'center', gap:9, padding:'10px 13px',
        borderRadius:11, border:`1.5px solid ${f ? TK.primary : TK.border}`,
        background:'#fff', boxShadow: f ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none',
        transition:'all 0.15s',
      }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize:17, color: f ? TK.primary : TK.text3, flexShrink:0, transition:'color 0.15s' }}>{icon}</span>}
        <input
          type={type} placeholder={placeholder} value={value}
          onChange={onChange} onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:TK.text1, width:'100%' }}
        />
      </div>
    </div>
  );
};

const OSelect = ({ label, value, onChange, options, icon }) => {
  const [f, setF] = React.useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>{label}</label>
      <div style={{
        display:'flex', alignItems:'center', gap:9, padding:'10px 13px',
        borderRadius:11, border:`1.5px solid ${f ? TK.primary : TK.border}`,
        background:'#fff', boxShadow: f ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none', transition:'all 0.15s',
      }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize:17, color: f ? TK.primary : TK.text3, flexShrink:0 }}>{icon}</span>}
        <select value={value} onChange={onChange} onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color: value ? TK.text1 : TK.text3, width:'100%', cursor:'pointer', appearance:'none' }}>
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="material-symbols-outlined" style={{ fontSize:16, color:TK.text3, flexShrink:0 }}>expand_more</span>
      </div>
    </div>
  );
};

// ── Create/Edit Org Modal ─────────────────────
const OrgModal = ({ org, onClose, onSave }) => {
  const isEdit = !!org;
  const [form, setForm] = React.useState({
    name:        org?.name       || '',
    type:        org?.type       || 'Business',
    country:     org?.country    || 'Kuwait',
    phone:       org?.phone      || '',
    email:       org?.email      || '',
    website:     org?.website    || '',
    address:     org?.address    || '',
    city:        org?.city       || '',
    taxId:       org?.taxId      || '',
    creditLimit: org?.creditLimit|| '',
    notes:       org?.notes      || '',
    status:      org?.status     || 'active',
  });
  const [saving, setSaving] = React.useState(false);
  const [saved,  setSaved]  = React.useState(false);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false); setSaved(true);
      setTimeout(() => { onSave(form); }, 1200);
    }, 700);
  };

  const w = useWindowWidth();
  const isMobile = w < 640;

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(26,31,35,0.5)', backdropFilter:'blur(4px)' }} />
      <div style={{
        position:'fixed', zIndex:501,
        top: isMobile ? 0 : '50%', left: isMobile ? 0 : '50%',
        right: isMobile ? 0 : 'unset', bottom: isMobile ? 0 : 'unset',
        transform: isMobile ? 'none' : 'translate(-50%,-50%)',
        width: isMobile ? '100%' : Math.min(620, window.innerWidth - 40),
        height: isMobile ? '100%' : Math.min(700, window.innerHeight - 60),
        background:'#fff',
        borderRadius: isMobile ? 0 : 22,
        boxShadow:'0 32px 80px rgba(0,0,0,0.22)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        animation:'tlSlideIn 0.22s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:`1px solid ${TK.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:TK.primaryBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:21, color:TK.primary, fontVariationSettings:"'FILL' 1" }}>corporate_fare</span>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:TK.text1 }}>{isEdit ? 'Edit Organization' : 'New Organization'}</div>
              <div style={{ fontSize:12, color:TK.text3, marginTop:1 }}>Fill in the details below</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:34, height:34, borderRadius:9, border:`1px solid ${TK.border}`, background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:TK.text2 }}>
            <span className="material-symbols-outlined" style={{ fontSize:20 }}>close</span>
          </button>
        </div>

        {/* Body */}
        {saved ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:40 }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:TK.successBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:40, color:TK.success, fontVariationSettings:"'FILL' 1" }}>check_circle</span>
            </div>
            <div style={{ fontWeight:800, fontSize:20, color:TK.text1 }}>Organization {isEdit ? 'Updated' : 'Created'}!</div>
            <div style={{ fontSize:13.5, color:TK.text2 }}>{form.name} has been {isEdit ? 'updated' : 'added'} to the system.</div>
          </div>
        ) : (
          <div style={{ flex:1, overflowY:'auto', padding:'22px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Section: Basic Info */}
            <div style={{ fontWeight:700, fontSize:11, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em' }}>Basic Information</div>
            <OInput label="Organization Name" placeholder="e.g. Al-Fardan Trading" value={form.name} onChange={e => upd('name', e.target.value)} icon="business" required />
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 140px' }}>
                <OSelect label="Type" value={form.type} onChange={e => upd('type', e.target.value)} options={['Business','Individual','Government','Non-profit']} icon="category" />
              </div>
              <div style={{ flex:'1 1 140px' }}>
                <OSelect label="Country" value={form.country} onChange={e => upd('country', e.target.value)} options={COUNTRIES_LIST} icon="public" />
              </div>
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 140px' }}>
                <OInput label="City" placeholder="e.g. Kuwait City" value={form.city} onChange={e => upd('city', e.target.value)} icon="location_city" />
              </div>
              <div style={{ flex:'1 1 140px' }}>
                <OInput label="Tax / CR Number" placeholder="e.g. KW-12345" value={form.taxId} onChange={e => upd('taxId', e.target.value)} icon="receipt_long" />
              </div>
            </div>

            {/* Section: Contact */}
            <div style={{ fontWeight:700, fontSize:11, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em', marginTop:6 }}>Contact Details</div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 140px' }}>
                <OInput label="Phone" placeholder="+965 XXXX XXXX" value={form.phone} onChange={e => upd('phone', e.target.value)} icon="phone" />
              </div>
              <div style={{ flex:'1 1 140px' }}>
                <OInput label="Email" type="email" placeholder="info@org.com" value={form.email} onChange={e => upd('email', e.target.value)} icon="mail" />
              </div>
            </div>
            <OInput label="Website" placeholder="https://example.com" value={form.website} onChange={e => upd('website', e.target.value)} icon="language" />
            <OInput label="Address" placeholder="Street, building, area" value={form.address} onChange={e => upd('address', e.target.value)} icon="home" />

            {/* Section: Account */}
            <div style={{ fontWeight:700, fontSize:11, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em', marginTop:6 }}>Account Settings</div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 140px' }}>
                <OInput label="Credit Limit (KD)" placeholder="0.000" type="number" value={form.creditLimit} onChange={e => upd('creditLimit', e.target.value)} icon="account_balance_wallet" />
              </div>
              <div style={{ flex:'1 1 140px' }}>
                <OSelect label="Status" value={form.status} onChange={e => upd('status', e.target.value)} options={['active','suspended','pending']} icon="toggle_on" />
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>Internal Notes</label>
              <textarea
                placeholder="Add any internal notes about this organization…"
                value={form.notes}
                onChange={e => upd('notes', e.target.value)}
                rows={3}
                style={{
                  padding:'10px 13px', borderRadius:11, border:`1.5px solid ${TK.border}`,
                  fontSize:13, color:TK.text1, resize:'vertical', outline:'none',
                  fontFamily:'Manrope, sans-serif', transition:'border 0.15s',
                }}
                onFocus={e => e.target.style.border = `1.5px solid ${TK.primary}`}
                onBlur={e => e.target.style.border = `1.5px solid ${TK.border}`}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        {!saved && (
          <div style={{ padding:'16px 24px', borderTop:`1px solid ${TK.border}`, display:'flex', justifyContent:'space-between', gap:10, background:'#fafbfc', flexShrink:0 }}>
            <TLButton variant="secondary" onClick={onClose}>Cancel</TLButton>
            <TLButton
              icon={saving ? undefined : 'check'}
              onClick={handleSave}
              disabled={!form.name || saving}
              style={{ minWidth:140, justifyContent:'center' }}
            >
              {saving ? (
                <>
                  <span style={{ width:15, height:15, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'tlspin 0.8s linear infinite', display:'inline-block', flexShrink:0 }} />
                  Saving…
                </>
              ) : (isEdit ? 'Save Changes' : 'Create Organization')}
            </TLButton>
          </div>
        )}
      </div>
    </>
  );
};

// ── Organizations Page ────────────────────────
const OrganizationsPage = () => {
  const [orgs, setOrgs]           = React.useState(ORGS_DATA);
  const [search, setSearch]       = React.useState('');
  const [typeFilter, setTypeFilter]   = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selected, setSelected]   = React.useState(null);
  const [showModal, setShowModal] = React.useState(false);
  const [editOrg, setEditOrg]     = React.useState(null);
  const w = useWindowWidth();
  const isMobile = w < 640;

  const filtered = orgs.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.name.toLowerCase().includes(q) || o.country.toLowerCase().includes(q);
    const matchType   = typeFilter   === 'all' || o.type.toLowerCase() === typeFilter;
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const handleSave = (form) => {
    if (editOrg) {
      setOrgs(os => os.map(o => o.id === editOrg.id ? { ...o, ...form } : o));
    } else {
      const initials = form.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      setOrgs(os => [...os, { id: Date.now(), ...form, contacts:0, shipments:0, balance:'KD 0.000', logo:initials, since:'Apr 2025' }]);
    }
    setShowModal(false); setEditOrg(null);
    setSelected(null);
  };

  const OrgCard = ({ org }) => {
    const st = ORG_STATUS[org.status] || ORG_STATUS.active;
    const isSelected = selected?.id === org.id;
    return (
      <div
        onClick={() => setSelected(isSelected ? null : org)}
        style={{
          background:'#fff', borderRadius:16,
          border:`1.5px solid ${isSelected ? TK.primary : TK.border}`,
          padding:'16px 18px', cursor:'pointer', transition:'all 0.18s',
          boxShadow: isSelected ? `0 4px 20px rgba(0,80,212,0.12)` : '0 1px 4px rgba(0,0,0,0.04)',
          transform: isSelected ? 'translateY(-2px)' : 'none',
        }}
      >
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
          <div style={{
            width:44, height:44, borderRadius:12, flexShrink:0,
            background: isSelected ? TK.primaryBg : '#f5f7fa',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:800, fontSize:13, color: isSelected ? TK.primary : TK.text2,
          }}>{org.logo}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color: isSelected ? TK.primary : TK.text1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{org.name}</div>
            <div style={{ fontSize:12, color:TK.text3, marginTop:2 }}>{org.type} · {org.country}</div>
          </div>
          <span style={{ padding:'3px 9px', borderRadius:99, fontSize:10.5, fontWeight:700, background:st.bg, color:st.color, flexShrink:0 }}>{st.label}</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[
            { label:'Shipments', value:org.shipments.toLocaleString() },
            { label:'Contacts',  value:org.contacts },
            { label:'Balance',   value:org.balance  },
          ].map((s, i) => (
            <div key={i} style={{ background:'#f8fafb', borderRadius:9, padding:'8px 10px' }}>
              <div style={{ fontWeight:800, fontSize:14, color:TK.text1 }}>{s.value}</div>
              <div style={{ fontSize:10.5, color:TK.text3, fontWeight:600, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, fontSize:11, color:TK.text3, display:'flex', alignItems:'center', gap:5 }}>
          <span className="material-symbols-outlined" style={{ fontSize:13 }}>calendar_today</span>
          Member since {org.since}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth:1400, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize: isMobile ? 18 : 22, color:TK.text1, letterSpacing:'-0.03em', margin:0 }}>Organizations</h1>
          <p style={{ fontSize:13.5, color:TK.text2, margin:'5px 0 0' }}>Manage client organizations, accounts and credit balances</p>
        </div>
        <TLButton icon="add" onClick={() => { setEditOrg(null); setShowModal(true); }}>New Organization</TLButton>
      </div>

      {/* Toolbar */}
      <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${TK.border}`, padding:'12px 16px', marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1, minWidth:180, display:'flex', alignItems:'center', gap:9, border:`1px solid ${TK.border}`, borderRadius:10, padding:'8px 13px', background:'#fafbfc' }}>
          <span className="material-symbols-outlined" style={{ fontSize:17, color:TK.text3, flexShrink:0 }}>search</span>
          <input placeholder="Search organizations…" value={search} onChange={e => setSearch(e.target.value)} style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:TK.text1, width:'100%' }} />
        </div>
        {[
          { options:[{v:'all',l:'All Types'},{v:'business',l:'Business'},{v:'individual',l:'Individual'}], state:typeFilter, set:setTypeFilter },
          { options:[{v:'all',l:'All Status'},{v:'active',l:'Active'},{v:'suspended',l:'Suspended'}], state:statusFilter, set:setStatusFilter },
        ].map((f, i) => (
          <select key={i} value={f.state} onChange={e => f.set(e.target.value)} style={{ padding:'9px 13px', borderRadius:10, border:`1px solid ${TK.border}`, background:'#fafbfc', fontSize:13, color:TK.text2, cursor:'pointer', outline:'none' }}>
            {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ))}
        <div style={{ marginLeft:'auto', fontSize:12.5, color:TK.text3 }}>{filtered.length} organizations</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selected && !isMobile ? '1fr 340px' : '1fr', gap:14 }}>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
          {filtered.map(org => <OrgCard key={org.id} org={org} />)}
          {filtered.length === 0 && (
            <div style={{ gridColumn:'1/-1', padding:'48px 20px', textAlign:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:44, color:TK.text3, display:'block', marginBottom:12, opacity:0.5 }}>search_off</span>
              <div style={{ fontWeight:700, fontSize:16, color:TK.text1 }}>No organizations found</div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background:'#fff', borderRadius:18, border:`1px solid ${TK.border}`, padding:'22px', display:'flex', flexDirection:'column', gap:16, height:'fit-content', position:'sticky', top:80 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ width:50, height:50, borderRadius:13, background:TK.primaryBg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:TK.primary }}>{selected.logo}</div>
                <div>
                  <div style={{ fontWeight:800, fontSize:15, color:TK.text1 }}>{selected.name}</div>
                  <div style={{ fontSize:12, color:TK.text3, marginTop:2 }}>{selected.type} · {selected.country}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ border:'none', background:'none', cursor:'pointer', color:TK.text3, padding:2 }}>
                <span className="material-symbols-outlined" style={{ fontSize:20 }}>close</span>
              </button>
            </div>
            {[
              { label:'Total Shipments', value:selected.shipments.toLocaleString(), icon:'local_shipping', color:TK.primary },
              { label:'Balance',         value:selected.balance, icon:'account_balance_wallet', color:TK.success },
              { label:'Contacts',        value:selected.contacts, icon:'people', color:TK.info },
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#f8fafb', borderRadius:12 }}>
                <span className="material-symbols-outlined" style={{ fontSize:20, color:s.color, fontVariationSettings:"'FILL' 1" }}>{s.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:TK.text3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em' }}>{s.label}</div>
                  <div style={{ fontWeight:800, fontSize:16, color:TK.text1, marginTop:2 }}>{s.value}</div>
                </div>
              </div>
            ))}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <TLButton icon="edit" style={{ width:'100%', justifyContent:'center' }} onClick={() => { setEditOrg(selected); setShowModal(true); }}>Edit Organization</TLButton>
              <TLButton variant="secondary" icon="local_shipping" style={{ width:'100%', justifyContent:'center' }}>View Shipments</TLButton>
              {selected.status === 'active'
                ? <TLButton variant="ghost" icon="block" style={{ width:'100%', justifyContent:'center', color:TK.error }}>Suspend</TLButton>
                : <TLButton variant="ghost" icon="check_circle" style={{ width:'100%', justifyContent:'center', color:TK.success }}>Reactivate</TLButton>
              }
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <OrgModal
          org={editOrg}
          onClose={() => { setShowModal(false); setEditOrg(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

Object.assign(window, { OrganizationsPage });
