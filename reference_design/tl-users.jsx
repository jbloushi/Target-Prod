// ═══════════════════════════════════════════════
// Target Logistics — Users Page v2
// Full Create/Edit User modal
// ═══════════════════════════════════════════════

const USERS_DATA = [
  { id:1, name:'Mohammed Al-Ali',  email:'admin@target.kw',   role:'admin',   org:'Target Logistics', status:'active',   lastSeen:'Just now',   avatar:'MA', shipments:342, phone:'+965 9999 0001' },
  { id:2, name:'Fatima Al-Rashid', email:'fatima@target.kw',  role:'staff',   org:'Target Logistics', status:'active',   lastSeen:'2 min ago',  avatar:'FA', shipments:218, phone:'+965 9999 0002' },
  { id:3, name:'Khalid Al-Sabah',  email:'khalid@target.kw',  role:'manager', org:'Target Logistics', status:'active',   lastSeen:'1 hr ago',   avatar:'KA', shipments:97,  phone:'+965 9999 0003' },
  { id:4, name:'Noor Al-Hamad',    email:'noor@target.kw',    role:'staff',   org:'Target Logistics', status:'active',   lastSeen:'Yesterday',  avatar:'NH', shipments:145, phone:'+965 9999 0004' },
  { id:5, name:'Ahmad Hassan',     email:'ahmad@alfardan.kw', role:'client',  org:'Al-Fardan Trading',status:'active',   lastSeen:'3 days ago', avatar:'AH', shipments:56,  phone:'+971 50 123 4567' },
  { id:6, name:'Sara Al-Mutairi',  email:'sara@gulf.kw',      role:'client',  org:'Gulf Exports Ltd', status:'active',   lastSeen:'1 week ago', avatar:'SM', shipments:34,  phone:'+966 55 987 6543' },
  { id:7, name:'Rashid Al-Zain',   email:'rashid@alzain.kw',  role:'client',  org:'Al-Zain Corp',     status:'suspended',lastSeen:'2 weeks ago',avatar:'RZ', shipments:12,  phone:'+965 9999 0007' },
  { id:8, name:'Layla Yusuf',      email:'layla@target.kw',   role:'staff',   org:'Target Logistics', status:'inactive', lastSeen:'1 month ago',avatar:'LY', shipments:0,   phone:'+965 9999 0008' },
];

const ROLE_CFG = {
  admin:   { label:'Admin',   color:'#7c3aed', bg:'#ede9fe' },
  manager: { label:'Manager', color:TK.primary, bg:TK.primaryBg },
  staff:   { label:'Staff',   color:TK.info,    bg:TK.infoBg    },
  client:  { label:'Client',  color:TK.success, bg:TK.successBg },
};

const USER_STATUS_CFG = {
  active:    { label:'Active',    color:TK.success, bg:TK.successBg },
  inactive:  { label:'Inactive',  color:TK.text3,   bg:'#f0f2f4'    },
  suspended: { label:'Suspended', color:TK.error,   bg:TK.errorBg   },
};

const ORGS_LIST = ['Target Logistics','Al-Fardan Trading','Gulf Exports Ltd','Al-Zain Corp','Personal','Noor Logistics','Khalij Freight Co.'];

// ── User Modal ────────────────────────────────
const UserModal = ({ user: existingUser, onClose, onSave }) => {
  const isEdit = !!existingUser;
  const [form, setForm] = React.useState({
    name:     existingUser?.name     || '',
    email:    existingUser?.email    || '',
    phone:    existingUser?.phone    || '',
    role:     existingUser?.role     || 'client',
    org:      existingUser?.org      || 'Target Logistics',
    status:   existingUser?.status   || 'active',
    password: '',
    confirmPw:'',
    notes:    existingUser?.notes    || '',
    sendWelcome: true,
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved]   = React.useState(false);
  const [errors, setErrors] = React.useState({});
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showPw, setShowPw] = React.useState(false);
  const w = useWindowWidth();
  const isMobile = w < 640;

  const validate = () => {
    const e = {};
    if (!form.name)  e.name  = 'Name is required';
    if (!form.email) e.email = 'Email is required';
    if (!isEdit && !form.password) e.password = 'Password is required';
    if (!isEdit && form.password && form.password !== form.confirmPw) e.confirmPw = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false); setSaved(true);
      setTimeout(() => onSave(form), 1400);
    }, 700);
  };

  const FInput = ({ label, placeholder, value, onChange, type='text', icon, error, required, suffix }) => {
    const [f, setF] = React.useState(false);
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>
          {label}{required && <span style={{ color:TK.error, marginLeft:3 }}>*</span>}
        </label>
        <div style={{
          display:'flex', alignItems:'center', gap:9, padding:'10px 13px',
          borderRadius:11, border:`1.5px solid ${error ? TK.error : f ? TK.primary : TK.border}`,
          background:'#fff', boxShadow: f ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none', transition:'all 0.15s',
        }}>
          {icon && <span className="material-symbols-outlined" style={{ fontSize:17, color: error ? TK.error : f ? TK.primary : TK.text3, flexShrink:0 }}>{icon}</span>}
          <input type={type} placeholder={placeholder} value={value} onChange={onChange}
            onFocus={() => setF(true)} onBlur={() => setF(false)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:TK.text1, width:'100%' }} />
          {suffix}
        </div>
        {error && <span style={{ fontSize:11, color:TK.error, fontWeight:600 }}>{error}</span>}
      </div>
    );
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(26,31,35,0.5)', backdropFilter:'blur(4px)' }} />
      <div style={{
        position:'fixed', zIndex:501,
        top: isMobile ? 0 : '50%', left: isMobile ? 0 : '50%',
        right: isMobile ? 0 : 'unset', bottom: isMobile ? 0 : 'unset',
        transform: isMobile ? 'none' : 'translate(-50%,-50%)',
        width: isMobile ? '100%' : Math.min(580, window.innerWidth - 40),
        height: isMobile ? '100%' : Math.min(680, window.innerHeight - 60),
        background:'#fff', borderRadius: isMobile ? 0 : 22,
        boxShadow:'0 32px 80px rgba(0,0,0,0.22)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        animation:'tlSlideIn 0.22s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:`1px solid ${TK.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:TK.primaryBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:21, color:TK.primary, fontVariationSettings:"'FILL' 1" }}>{isEdit ? 'manage_accounts' : 'person_add'}</span>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:TK.text1 }}>{isEdit ? 'Edit User' : 'Create New User'}</div>
              <div style={{ fontSize:12, color:TK.text3, marginTop:1 }}>{isEdit ? `Editing ${existingUser.name}` : 'Fill in all required fields'}</div>
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
            <div style={{ fontWeight:800, fontSize:20, color:TK.text1 }}>User {isEdit ? 'Updated' : 'Created'}!</div>
            <div style={{ fontSize:13.5, color:TK.text2, textAlign:'center' }}>
              {form.name} has been {isEdit ? 'updated' : 'added'}.
              {!isEdit && form.sendWelcome && ' A welcome email has been sent.'}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, overflowY:'auto', padding:'22px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Personal */}
            <div style={{ fontWeight:700, fontSize:11, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em' }}>Personal Information</div>
            <FInput label="Full Name" placeholder="e.g. Mohammed Al-Ali" value={form.name} onChange={e => upd('name', e.target.value)} icon="person" required error={errors.name} />
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 140px' }}>
                <FInput label="Email Address" type="email" placeholder="user@company.com" value={form.email} onChange={e => upd('email', e.target.value)} icon="mail" required error={errors.email} />
              </div>
              <div style={{ flex:'1 1 140px' }}>
                <FInput label="Phone" placeholder="+965 XXXX XXXX" value={form.phone} onChange={e => upd('phone', e.target.value)} icon="phone" />
              </div>
            </div>

            {/* Role & Org */}
            <div style={{ fontWeight:700, fontSize:11, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em', marginTop:6 }}>Role & Access</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>Role <span style={{ color:TK.error }}>*</span></label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {['client','staff','manager','admin'].map(r => {
                  const rc = ROLE_CFG[r];
                  return (
                    <button key={r} onClick={() => upd('role', r)} style={{
                      padding:'10px 8px', borderRadius:11,
                      border:`1.5px solid ${form.role === r ? rc.color : TK.border}`,
                      background: form.role === r ? rc.bg : '#fff',
                      color: form.role === r ? rc.color : TK.text2,
                      fontWeight:600, fontSize:12.5, cursor:'pointer', transition:'all 0.15s',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize:18, fontVariationSettings: form.role === r ? "'FILL' 1" : "'FILL' 0" }}>
                        {r === 'admin' ? 'admin_panel_settings' : r === 'manager' ? 'manage_accounts' : r === 'staff' ? 'badge' : 'person'}
                      </span>
                      {rc.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ flex:'1 1 140px', display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>Organization</label>
                <div style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 13px', borderRadius:11, border:`1.5px solid ${TK.border}`, background:'#fff' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:17, color:TK.text3, flexShrink:0 }}>corporate_fare</span>
                  <select value={form.org} onChange={e => upd('org', e.target.value)}
                    style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:TK.text1, width:'100%', cursor:'pointer', appearance:'none' }}>
                    {ORGS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:TK.text3 }}>expand_more</span>
                </div>
              </div>
              <div style={{ flex:'1 1 140px', display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontWeight:600, fontSize:12, color:TK.text2 }}>Status</label>
                <div style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 13px', borderRadius:11, border:`1.5px solid ${TK.border}`, background:'#fff' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:17, color:TK.text3, flexShrink:0 }}>toggle_on</span>
                  <select value={form.status} onChange={e => upd('status', e.target.value)}
                    style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:TK.text1, width:'100%', cursor:'pointer', appearance:'none' }}>
                    {['active','inactive','suspended'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:TK.text3 }}>expand_more</span>
                </div>
              </div>
            </div>

            {/* Password */}
            {!isEdit && (
              <>
                <div style={{ fontWeight:700, fontSize:11, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.1em', marginTop:6 }}>Password</div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  <div style={{ flex:'1 1 140px' }}>
                    <FInput label="Password" type={showPw ? 'text' : 'password'} placeholder="Min. 8 characters" value={form.password}
                      onChange={e => upd('password', e.target.value)} icon="lock" required error={errors.password}
                      suffix={
                        <button type="button" onClick={() => setShowPw(p => !p)} style={{ border:'none', background:'none', cursor:'pointer', color:TK.text3, padding:0, display:'flex', flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:17 }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      }
                    />
                  </div>
                  <div style={{ flex:'1 1 140px' }}>
                    <FInput label="Confirm Password" type={showPw ? 'text' : 'password'} placeholder="Repeat password" value={form.confirmPw}
                      onChange={e => upd('confirmPw', e.target.value)} icon="lock_reset" error={errors.confirmPw} />
                  </div>
                </div>
              </>
            )}

            {/* Welcome email */}
            {!isEdit && (
              <div
                onClick={() => upd('sendWelcome', !form.sendWelcome)}
                style={{
                  padding:'12px 14px', borderRadius:12, cursor:'pointer',
                  border:`1.5px solid ${form.sendWelcome ? TK.primary : TK.border}`,
                  background: form.sendWelcome ? TK.primaryBg : '#fafbfc',
                  display:'flex', alignItems:'center', gap:12, transition:'all 0.15s',
                }}
              >
                <div style={{ width:20, height:20, borderRadius:5, flexShrink:0, border:`2px solid ${form.sendWelcome ? TK.primary : TK.text3}`, background: form.sendWelcome ? TK.primary : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                  {form.sendWelcome && <span className="material-symbols-outlined" style={{ fontSize:13, color:'#fff', fontVariationSettings:"'FILL' 1" }}>check</span>}
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:TK.text1 }}>Send welcome email</div>
                  <div style={{ fontSize:11.5, color:TK.text3, marginTop:2 }}>User receives login credentials and onboarding instructions</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!saved && (
          <div style={{ padding:'16px 24px', borderTop:`1px solid ${TK.border}`, display:'flex', justifyContent:'space-between', gap:10, background:'#fafbfc', flexShrink:0 }}>
            <TLButton variant="secondary" onClick={onClose}>Cancel</TLButton>
            <TLButton
              onClick={handleSave}
              disabled={saving}
              style={{ minWidth:150, justifyContent:'center' }}
            >
              {saving ? (
                <><span style={{ width:15, height:15, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'tlspin 0.8s linear infinite', display:'inline-block', flexShrink:0 }} /> Saving…</>
              ) : isEdit ? 'Save Changes' : 'Create User'}
            </TLButton>
          </div>
        )}
      </div>
    </>
  );
};

// ── Users Page ────────────────────────────────
const UsersPage = () => {
  const [users, setUsers]           = React.useState(USERS_DATA);
  const [search, setSearch]         = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('all');
  const [showModal, setShowModal]   = React.useState(false);
  const [editUser, setEditUser]     = React.useState(null);
  const w = useWindowWidth();
  const isMobile = w < 640;

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.org.toLowerCase().includes(q);
    const matchRole   = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleSave = (form) => {
    if (editUser) {
      setUsers(us => us.map(u => u.id === editUser.id ? { ...u, ...form } : u));
    } else {
      const initials = form.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      setUsers(us => [...us, { id:Date.now(), ...form, avatar:initials, shipments:0, lastSeen:'Just now' }]);
    }
    setShowModal(false); setEditUser(null);
  };

  return (
    <div style={{ maxWidth:1400, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize: isMobile ? 18 : 22, color:TK.text1, letterSpacing:'-0.03em', margin:0 }}>Users</h1>
          <p style={{ fontSize:13.5, color:TK.text2, margin:'5px 0 0' }}>Manage team members, roles and access permissions</p>
        </div>
        <TLButton icon="person_add" onClick={() => { setEditUser(null); setShowModal(true); }}>Create User</TLButton>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Total Users', value:users.length,                                              color:TK.primary, icon:'people'                },
          { label:'Active Now',  value:users.filter(u => u.lastSeen === 'Just now' || u.lastSeen.includes('min')).length, color:TK.success, icon:'circle' },
          { label:'Staff',       value:users.filter(u => ['staff','admin','manager'].includes(u.role)).length, color:TK.info, icon:'badge'   },
          { label:'Clients',     value:users.filter(u => u.role === 'client').length,             color:TK.purple, icon:'person'                },
        ].map((s, i) => (
          <div key={i} style={{ background:'#fff', borderRadius:14, border:`1px solid ${TK.border}`, padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:`${s.color}18`, display:'flex', alignItems:'center', justifyContent:'center', color:s.color, flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:19, fontVariationSettings:"'FILL' 1" }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:22, color:TK.text1, letterSpacing:'-0.04em' }}>{s.value}</div>
              <div style={{ fontSize:11, color:TK.text2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', marginTop:2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:18, border:`1px solid ${TK.border}`, overflow:'hidden' }}>
        <div style={{ padding:'13px 18px', display:'flex', gap:10, alignItems:'center', borderBottom:`1px solid ${TK.border}`, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:180, display:'flex', alignItems:'center', gap:9, border:`1px solid ${TK.border}`, borderRadius:10, padding:'8px 13px', background:'#fafbfc' }}>
            <span className="material-symbols-outlined" style={{ fontSize:17, color:TK.text3, flexShrink:0 }}>search</span>
            <input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:TK.text1, width:'100%' }} />
          </div>
          <div style={{ display:'flex', gap:3, background:'#f5f7fa', borderRadius:10, padding:3 }}>
            {['all','admin','manager','staff','client'].map(r => (
              <button key={r} onClick={() => setRoleFilter(r)} style={{
                padding:'5px 11px', borderRadius:8, border:'none', cursor:'pointer',
                background: roleFilter === r ? '#fff' : 'transparent',
                color: roleFilter === r ? TK.primary : TK.text3,
                fontWeight: roleFilter === r ? 700 : 500, fontSize:12, textTransform:'capitalize',
                boxShadow: roleFilter === r ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition:'all 0.15s',
              }}>{r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}</button>
            ))}
          </div>
          <div style={{ marginLeft:'auto', fontSize:12.5, color:TK.text3 }}>{filtered.length} users</div>
        </div>

        {isMobile ? (
          <div>
            {filtered.map((u, i) => {
              const role = ROLE_CFG[u.role];
              return (
                <div key={u.id} style={{ padding:'14px 16px', borderBottom: i < filtered.length-1 ? `1px solid ${TK.border}` : 'none', display:'flex', gap:12, alignItems:'center' }}
                  onClick={() => { setEditUser(u); setShowModal(true); }}>
                  <div style={{ width:40, height:40, borderRadius:11, background:role.bg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color:role.color, flexShrink:0 }}>{u.avatar}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13.5, color:TK.text1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.name}</div>
                    <div style={{ fontSize:11.5, color:TK.text3, marginTop:2 }}>{u.email}</div>
                  </div>
                  <span style={{ padding:'3px 8px', borderRadius:99, fontSize:10.5, fontWeight:700, background:role.bg, color:role.color, flexShrink:0 }}>{role.label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              <thead>
                <tr style={{ background:'#fafbfc', borderBottom:`1px solid ${TK.border}` }}>
                  {['User','Organization','Role','Shipments','Last Active','Status',''].map(col => (
                    <th key={col} style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, fontSize:10.5, color:TK.text3, textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const role = ROLE_CFG[u.role];
                  const st   = USER_STATUS_CFG[u.status];
                  return (
                    <tr key={u.id}
                      style={{ borderBottom: i < filtered.length-1 ? `1px solid ${TK.border}` : 'none', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setEditUser(u); setShowModal(true); }}
                    >
                      <td style={{ padding:'13px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                          <div style={{ width:36, height:36, borderRadius:10, background:role.bg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color:role.color, flexShrink:0 }}>{u.avatar}</div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13, color:TK.text1 }}>{u.name}</div>
                            <div style={{ fontSize:11, color:TK.text3, marginTop:1 }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'13px 16px', fontSize:12.5, color:TK.text2 }}>{u.org}</td>
                      <td style={{ padding:'13px 16px' }}>
                        <span style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:700, background:role.bg, color:role.color }}>{role.label}</span>
                      </td>
                      <td style={{ padding:'13px 16px', fontWeight:600, fontSize:13, color:TK.text1 }}>{u.shipments}</td>
                      <td style={{ padding:'13px 16px', fontSize:12.5, color:TK.text3 }}>{u.lastSeen}</td>
                      <td style={{ padding:'13px 16px' }}>
                        <span style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:700, background:st.bg, color:st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding:'13px 12px' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditUser(u); setShowModal(true); }}
                          style={{ width:30, height:30, borderRadius:8, border:`1px solid ${TK.border}`, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:TK.text3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:17 }}>edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <UserModal
          user={editUser}
          onClose={() => { setShowModal(false); setEditUser(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

Object.assign(window, { UsersPage });
