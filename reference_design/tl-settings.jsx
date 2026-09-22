// ═══════════════════════════════════════════════
// Target Logistics — Settings Page
// ═══════════════════════════════════════════════

const SettingsPage = ({ user }) => {
  const [activeTab, setActiveTab] = React.useState('profile');
  const [saved, setSaved]         = React.useState(false);
  const [name, setName]           = React.useState(user?.name || '');
  const [email, setEmail]         = React.useState(user?.email || '');
  const [phone, setPhone]         = React.useState('+965 9999 0000');
  const [notifs, setNotifs]       = React.useState({ email_ship: true, email_del: true, sms_pickup: false, sms_exception: true, push_all: false });
  const [keys, setKeys]           = React.useState([
    { id:1, name:'Production Key', prefix:'sk_live_', masked:'••••••••••••••••', created:'Jan 2025', last:'2 min ago',  active:true  },
    { id:2, name:'Test Key',       prefix:'sk_test_', masked:'••••••••••••••••', created:'Jan 2025', last:'1 week ago', active:true  },
    { id:3, name:'Webhook Key',    prefix:'wh_live_', masked:'••••••••••••••••', created:'Mar 2025', last:'Never',      active:false },
  ]);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [showNewKey, setShowNewKey] = React.useState(false);
  const w = useWindowWidth();
  const isMobile = w < 640;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const TABS = [
    { id:'profile',       label:'Profile',        icon:'person'            },
    { id:'notifications', label:'Notifications',  icon:'notifications'     },
    { id:'security',      label:'Security',       icon:'lock'              },
    { id:'api',           label:'API Keys',       icon:'key'               },
    { id:'branding',      label:'Branding',       icon:'palette'           },
    { id:'billing',       label:'Billing',        icon:'credit_card'       },
  ];

  const Toggle = ({ value, onChange, label, desc }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid ${TK.border}` }}>
      <div style={{ flex: 1, paddingRight: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: TK.text1 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: TK.text3, marginTop: 3 }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? TK.primary : '#d1d5db',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );

  const SectionCard = ({ title, children, action }) => (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: TK.text1 }}>{title}</div>
        {action}
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0' }}>Manage your account, preferences and integrations</p>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Sidebar tabs */}
        {!isMobile && (
          <div style={{ width: 210, flexShrink: 0, background: '#fff', borderRadius: 16, border: `1px solid ${TK.border}`, padding: '10px', position: 'sticky', top: 80 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: activeTab === t.id ? TK.primaryBg : 'transparent',
                color: activeTab === t.id ? TK.primary : TK.text2,
                fontWeight: activeTab === t.id ? 700 : 500, fontSize: 13.5,
                transition: 'all 0.12s', textAlign: 'left',
              }}
                onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.background = '#f5f7fa'; }}
                onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19, flexShrink: 0, fontVariationSettings: activeTab === t.id ? "'FILL' 1" : "'FILL' 0" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Mobile tab bar */}
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: TK.surface, paddingBottom: 8, width: '100%' }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: activeTab === t.id ? TK.primary : '#fff',
                  color: activeTab === t.id ? '#fff' : TK.text2,
                  fontWeight: activeTab === t.id ? 700 : 500, fontSize: 12.5,
                  whiteSpace: 'nowrap', flexShrink: 0, border: `1px solid ${activeTab === t.id ? TK.primary : TK.border}`,
                  transition: 'all 0.15s',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (
            <>
              {saved && (
                <div style={{ padding: '11px 16px', borderRadius: 11, marginBottom: 16, background: TK.successBg, border: `1px solid ${TK.success}30`, display: 'flex', alignItems: 'center', gap: 9, animation: 'tlSlideIn 0.2s ease' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.success, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span style={{ fontSize: 13, color: TK.success, fontWeight: 600 }}>Profile saved successfully.</span>
                </div>
              )}
              <SectionCard title="Personal Information">
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: 20,
                      background: 'linear-gradient(135deg, #ebf0fc 0%, #dbeafe 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 26, color: TK.primary,
                    }}>{user?.name?.[0] || 'U'}</div>
                    <button style={{ position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: '50%', background: TK.primary, border: '2.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>photo_camera</span>
                    </button>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: TK.text1 }}>{user?.name}</div>
                    <div style={{ fontSize: 12.5, color: TK.text3, marginTop: 3 }}>{user?.role} · {user?.email}</div>
                    <button style={{ marginTop: 8, padding: '5px 12px', borderRadius: 8, border: `1px solid ${TK.border}`, background: 'transparent', fontSize: 12, fontWeight: 600, color: TK.text2, cursor: 'pointer' }}>Change photo</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  <TLInput label="Full Name" value={name} onChange={e => setName(e.target.value)} icon="person" placeholder="Your full name" />
                  <TLInput label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} icon="mail" placeholder="email@example.com" />
                  <TLInput label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} icon="phone" placeholder="+965 XXXX XXXX" />
                </div>
              </SectionCard>
              <SectionCard title="Account Details">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label:'Role', value: user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User' },
                    { label:'Account Status', value:'Active' },
                    { label:'Member Since', value:'January 2024' },
                    { label:'Last Login', value:'Just now' },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? `1px solid ${TK.border}` : 'none' }}>
                      <span style={{ fontSize: 13, color: TK.text2 }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: TK.text1 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <TLButton onClick={handleSave} icon="save">Save Changes</TLButton>
              </div>
            </>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeTab === 'notifications' && (
            <SectionCard title="Notification Preferences">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { key:'email_ship',   label:'Shipment Created',       desc:'Email when a new shipment is created' },
                  { key:'email_del',    label:'Delivery Confirmation',   desc:'Email when a shipment is delivered' },
                  { key:'sms_pickup',   label:'Pickup SMS Alert',        desc:'SMS when courier arrives for pickup' },
                  { key:'sms_exception',label:'Exception Alerts',        desc:'SMS on customs holds or delivery failures' },
                  { key:'push_all',     label:'Push Notifications',      desc:'Browser push for all shipment events' },
                ].map(n => (
                  <Toggle key={n.key} label={n.label} desc={n.desc} value={notifs[n.key]} onChange={v => setNotifs(p => ({ ...p, [n.key]: v }))} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <>
              <SectionCard title="Change Password">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                  <TLInput label="Current Password" type="password" placeholder="••••••••" icon="lock" />
                  <TLInput label="New Password" type="password" placeholder="••••••••" icon="lock_open" />
                  <TLInput label="Confirm New Password" type="password" placeholder="••••••••" icon="lock_reset" />
                  <TLButton icon="lock">Update Password</TLButton>
                </div>
              </SectionCard>
              <SectionCard title="Two-Factor Authentication">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: TK.text1, marginBottom: 4 }}>Authenticator App</div>
                    <div style={{ fontSize: 12.5, color: TK.text3 }}>Add an extra layer of security with a TOTP authenticator.</div>
                  </div>
                  <TLButton variant="secondary" icon="qr_code">Enable 2FA</TLButton>
                </div>
              </SectionCard>
              <SectionCard title="Active Sessions">
                {[
                  { device:'Chrome on macOS', ip:'91.108.4.1', time:'Current session', current:true },
                  { device:'Safari on iPhone', ip:'78.47.9.22', time:'2 hours ago', current:false },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i === 0 ? `1px solid ${TK.border}` : 'none', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.text3, fontVariationSettings: "'FILL' 1" }}>{s.device.includes('iPhone') ? 'smartphone' : 'computer'}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: TK.text1 }}>{s.device}</div>
                        <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 2 }}>{s.ip} · {s.time}</div>
                      </div>
                    </div>
                    {s.current
                      ? <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: TK.successBg, color: TK.success }}>Current</span>
                      : <button style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${TK.error}40`, background: TK.errorBg, color: TK.error, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Revoke</button>
                    }
                  </div>
                ))}
              </SectionCard>
            </>
          )}

          {/* ── API KEYS ── */}
          {activeTab === 'api' && (
            <>
              <SectionCard
                title="API Keys"
                action={<TLButton small icon="add" onClick={() => setShowNewKey(true)}>New Key</TLButton>}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {keys.map((k) => (
                    <div key={k.id} style={{ padding: '14px 16px', background: '#f8fafb', borderRadius: 13, border: `1px solid ${TK.border}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: k.active ? TK.primary : TK.text3, flexShrink: 0, fontVariationSettings: "'FILL' 1" }}>key</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{k.name}</div>
                        <code style={{ fontFamily: 'monospace', fontSize: 12, color: TK.text3 }}>{k.prefix}{k.masked}</code>
                        <div style={{ fontSize: 11, color: TK.text3, marginTop: 3 }}>Created {k.created} · Last used {k.last}</div>
                      </div>
                      <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: k.active ? TK.successBg : '#f0f2f4', color: k.active ? TK.success : TK.text3, flexShrink: 0 }}>
                        {k.active ? 'Active' : 'Inactive'}
                      </span>
                      <button style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${TK.errorBg}`, background: TK.errorBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.error }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {showNewKey && (
                <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${TK.primary}`, padding: '20px 22px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: TK.text1, marginBottom: 14 }}>Create New API Key</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <TLInput label="Key Name" placeholder="e.g. Production Key" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} icon="label" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <TLButton icon="add" onClick={() => { if (newKeyName) { setKeys(k => [...k, { id:Date.now(), name:newKeyName, prefix:'sk_live_', masked:'••••••••••••••••', created:'Now', last:'Never', active:true }]); setNewKeyName(''); setShowNewKey(false); } }}>Generate</TLButton>
                      <TLButton variant="secondary" onClick={() => setShowNewKey(false)}>Cancel</TLButton>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── BRANDING ── */}
          {activeTab === 'branding' && (
            <SectionCard title="Branding & White-label">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontWeight: 600, fontSize: 12.5, color: TK.text2 }}>Primary Colour</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {['#0050d4','#059669','#7c3aed','#d97706','#b31b25'].map(c => (
                      <button key={c} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: `3px solid ${c === '#0050d4' ? '#000' : 'transparent'}`, cursor: 'pointer', transition: 'transform 0.15s', flexShrink: 0 }} />
                    ))}
                    <input type="color" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${TK.border}`, cursor: 'pointer', padding: 2 }} defaultValue="#0050d4" />
                  </div>
                </div>
                <TLInput label="Company Name (shown on labels)" placeholder="Target Logistics" icon="business" />
                <TLInput label="Support Email (shown on docs)" placeholder="support@yourcompany.com" type="email" icon="mail" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontWeight: 600, fontSize: 12.5, color: TK.text2 }}>Logo</label>
                  <div style={{ padding: '24px', border: `2px dashed ${TK.border}`, borderRadius: 13, textAlign: 'center', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = TK.primary}
                    onMouseLeave={e => e.currentTarget.style.borderColor = TK.border}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: TK.text3, display: 'block', marginBottom: 8 }}>upload_file</span>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TK.text2, marginBottom: 4 }}>Drop logo here or click to upload</div>
                    <div style={{ fontSize: 11.5, color: TK.text3 }}>PNG, SVG, max 2MB</div>
                  </div>
                </div>
                <TLButton icon="save">Save Branding</TLButton>
              </div>
            </SectionCard>
          )}

          {/* ── BILLING ── */}
          {activeTab === 'billing' && (
            <>
              <SectionCard title="Current Plan">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 20, color: TK.text1 }}>Professional</span>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: TK.primaryBg, color: TK.primary }}>Current Plan</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: TK.text2, marginBottom: 4 }}>KD 49.00 / month · Renews 30 May 2025</div>
                    <div style={{ fontSize: 12.5, color: TK.text3 }}>Up to 500 shipments/month · 10 users · API access</div>
                  </div>
                  <TLButton variant="secondary" icon="upgrade">Upgrade Plan</TLButton>
                </div>
              </SectionCard>
              <SectionCard title="Payment Method">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 48, height: 32, borderRadius: 7, background: '#1a1f6e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 11, color: '#fff', letterSpacing: '0.04em' }}>VISA</span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: TK.text1 }}>Visa ending in 4242</div>
                      <div style={{ fontSize: 12, color: TK.text3, marginTop: 2 }}>Expires 12/2027</div>
                    </div>
                  </div>
                  <TLButton variant="secondary" icon="edit" small>Update</TLButton>
                </div>
              </SectionCard>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SettingsPage });
