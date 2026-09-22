// ═══════════════════════════════════════════════
// Target Logistics — API Documentation
// Stripe-style two-column layout
// ═══════════════════════════════════════════════

const API_SECTIONS = [
  {
    id: 'intro',
    label: 'Introduction',
    icon: 'info',
    endpoints: [],
  },
  {
    id: 'auth',
    label: 'Authentication',
    icon: 'lock',
    endpoints: [],
  },
  {
    id: 'shipments',
    label: 'Shipments',
    icon: 'local_shipping',
    endpoints: [
      { method:'GET',    path:'/v1/shipments',          title:'List shipments'   },
      { method:'POST',   path:'/v1/shipments',          title:'Create shipment'  },
      { method:'GET',    path:'/v1/shipments/{id}',     title:'Get shipment'     },
      { method:'PUT',    path:'/v1/shipments/{id}',     title:'Update shipment'  },
      { method:'DELETE', path:'/v1/shipments/{id}',     title:'Cancel shipment'  },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking',
    icon: 'location_on',
    endpoints: [
      { method:'GET', path:'/v1/tracking/{id}',        title:'Track shipment'   },
      { method:'GET', path:'/v1/tracking/{id}/events', title:'Tracking events'  },
    ],
  },
  {
    id: 'labels',
    label: 'Labels & AWB',
    icon: 'print',
    endpoints: [
      { method:'POST', path:'/v1/labels',              title:'Generate label'   },
      { method:'GET',  path:'/v1/labels/{id}/pdf',     title:'Download PDF'     },
    ],
  },
  {
    id: 'orgs',
    label: 'Organizations',
    icon: 'corporate_fare',
    endpoints: [
      { method:'GET',  path:'/v1/organizations',       title:'List orgs'        },
      { method:'POST', path:'/v1/organizations',       title:'Create org'       },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: 'webhook',
    endpoints: [
      { method:'POST', path:'/v1/webhooks',            title:'Register webhook' },
      { method:'GET',  path:'/v1/webhooks',            title:'List webhooks'    },
    ],
  },
];

const METHOD_COLOR = {
  GET:    { color:'#059669', bg:'#d1fae5' },
  POST:   { color:TK.primary, bg:TK.primaryBg },
  PUT:    { color:'#b45309', bg:'#fef3c7' },
  DELETE: { color:TK.error, bg:TK.errorBg },
  PATCH:  { color:TK.purple, bg:TK.purpleBg },
};

const CODE_SAMPLES = {
  intro: {
    title: 'Base URL',
    lang: 'bash',
    code: `https://api.targetlogistics.kw/v1

# All requests must be made over HTTPS.
# HTTP requests will be redirected to HTTPS.`,
  },
  auth: {
    title: 'Authentication',
    lang: 'bash',
    code: `curl https://api.targetlogistics.kw/v1/shipments \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
  },
  'shipments-list': {
    title: 'List Shipments',
    lang: 'bash',
    code: `curl https://api.targetlogistics.kw/v1/shipments \\
  -H "Authorization: Bearer sk_live_••••••••"

# Response
{
  "data": [
    {
      "id": "TLG-20250429-001",
      "status": "in_transit",
      "origin": "Kuwait City, KW",
      "destination": "Dubai, AE",
      "created_at": "2025-04-29T08:14:22Z",
      "eta": "2025-05-01T18:00:00Z"
    }
  ],
  "meta": {
    "total": 1247,
    "page": 1,
    "per_page": 20
  }
}`,
  },
  'shipments-create': {
    title: 'Create Shipment',
    lang: 'bash',
    code: `curl -X POST https://api.targetlogistics.kw/v1/shipments \\
  -H "Authorization: Bearer sk_live_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sender": {
      "name": "Mohammed Al-Ali",
      "phone": "+965 9999 0000",
      "address": "Block 5, St. 12",
      "city": "Kuwait City",
      "country": "KW"
    },
    "receiver": {
      "name": "Ahmed Hassan",
      "phone": "+971 50 123 4567",
      "city": "Dubai",
      "country": "AE"
    },
    "package": {
      "weight_kg": 2.5,
      "dimensions_cm": [30, 20, 15],
      "declared_value_kd": 45.000
    },
    "service": "express_air"
  }'`,
  },
  'tracking-get': {
    title: 'Track Shipment',
    lang: 'bash',
    code: `curl https://api.targetlogistics.kw/v1/tracking/TLG-20250429-001 \\
  -H "Authorization: Bearer sk_live_••••••••"

# Response
{
  "tracking_number": "TLG-20250429-001",
  "status": "in_transit",
  "current_location": "Dubai International Airport",
  "estimated_delivery": "2025-05-01T18:00:00Z",
  "events": [
    {
      "timestamp": "2025-04-29T14:22:00Z",
      "status": "picked_up",
      "location": "Kuwait City Hub"
    },
    {
      "timestamp": "2025-04-30T06:11:00Z",
      "status": "in_transit",
      "location": "Dubai Airport"
    }
  ]
}`,
  },
};

// ── Method badge ─────────────────────────────────
const MethodBadge = ({ method, small }) => {
  const cfg = METHOD_COLOR[method] || METHOD_COLOR.GET;
  return (
    <span style={{
      padding: small ? '2px 6px' : '3px 9px',
      borderRadius: 6, fontSize: small ? 9.5 : 11,
      fontWeight: 800, letterSpacing: '0.04em',
      color: cfg.color, background: cfg.bg,
      flexShrink: 0, fontFamily: 'monospace',
    }}>{method}</span>
  );
};

// ── Code block ───────────────────────────────────
const CodeBlock = ({ code, title }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: '#0f1117', border: '1px solid #2a2d36' }}>
      <div style={{ padding: '10px 16px', background: '#161920', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2d36' }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8892a4', fontFamily: 'monospace' }}>{title}</span>
        <button onClick={copy} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7,
          border: '1px solid #2a2d36', background: 'transparent', cursor: 'pointer',
          fontSize: 11.5, color: copied ? '#22c55e' : '#8892a4',
          transition: 'color 0.15s',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{copied ? 'check' : 'content_copy'}</span>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '18px 20px', overflowX: 'auto',
        fontSize: 12.5, lineHeight: 1.75, color: '#e2e8f0',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      }}>{code}</pre>
    </div>
  );
};

// ── Endpoint row ─────────────────────────────────
const EndpointRow = ({ ep, active, onClick }) => (
  <button onClick={onClick} style={{
    width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none',
    background: active ? TK.primaryBg : 'transparent',
    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
    textAlign: 'left', transition: 'background 0.12s',
  }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f7fa'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <MethodBadge method={ep.method} small />
    <span style={{ fontSize: 12, color: active ? TK.primary : TK.text2, fontFamily: 'monospace', fontWeight: active ? 700 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {ep.path}
    </span>
  </button>
);

// ── Content panels ───────────────────────────────
const IntroContent = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: TK.text1, marginBottom: 10 }}>Target Logistics API</h2>
      <p style={{ fontSize: 14, color: TK.text2, lineHeight: 1.8, marginBottom: 16 }}>
        The Target Logistics API lets you programmatically create and manage shipments, generate labels, track packages in real time, and integrate our platform directly into your own systems.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { icon:'bolt',      label:'REST API',       desc:'HTTP/JSON, simple to integrate' },
          { icon:'lock',      label:'Secure',         desc:'TLS 1.3 + API key auth' },
          { icon:'history',   label:'Versioned',      desc:'Stable v1 with changelog' },
          { icon:'webhook',   label:'Webhooks',       desc:'Real-time event delivery' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '16px', background: '#fafbfc', borderRadius: 12, border: `1px solid ${TK.border}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary, fontVariationSettings: "'FILL' 1", display: 'block', marginBottom: 8 }}>{f.icon}</span>
            <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 12, color: TK.text3 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
    <CodeBlock code={CODE_SAMPLES.intro.code} title={CODE_SAMPLES.intro.title} />
    <div style={{ padding: '14px 18px', background: TK.primaryBg, borderRadius: 12, border: `1px solid ${TK.primary}22`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.primary, flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>info</span>
      <div style={{ fontSize: 13, color: TK.primary, lineHeight: 1.6 }}>
        <strong>API Version:</strong> This documentation covers <strong>v1</strong>. Your API key and sandbox environment are available in <strong>Settings → API Keys</strong>.
      </div>
    </div>
  </div>
);

const AuthContent = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: TK.text1, marginBottom: 10 }}>Authentication</h2>
      <p style={{ fontSize: 14, color: TK.text2, lineHeight: 1.8 }}>
        The API uses API keys to authenticate requests. Pass your key in the <code style={{ background: '#f0f2f4', padding: '1px 6px', borderRadius: 5, fontSize: 13, fontFamily: 'monospace' }}>Authorization</code> header as a Bearer token.
      </p>
    </div>
    <div style={{ background: '#fafbfc', borderRadius: 14, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${TK.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>Your Test API Key</div>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <code style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, color: TK.text1, background: '#f0f2f4', padding: '8px 12px', borderRadius: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          sk_test_••••••••••••••••••••••••••••••
        </code>
        <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, border: `1px solid ${TK.border}`, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: TK.text2, whiteSpace: 'nowrap' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
          Reveal
        </button>
      </div>
    </div>
    <CodeBlock code={CODE_SAMPLES.auth.code} title="Example Request" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[
        { key:'sk_live_…', label:'Live key', desc:'Use in production. Charges real amounts.' },
        { key:'sk_test_…', label:'Test key', desc:'Use in development. No real charges.' },
      ].map((k, i) => (
        <div key={i} style={{ padding: '14px 16px', background: '#fafbfc', borderRadius: 12, border: `1px solid ${TK.border}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 12, color: TK.primary, background: TK.primaryBg, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>{k.key}</code>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{k.label}</div>
            <div style={{ fontSize: 12.5, color: TK.text3, marginTop: 2 }}>{k.desc}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const EndpointContent = ({ section, ep }) => {
  const sampleKey = ep ? `${section}-${ep.title.toLowerCase().replace(/ /g,'-')}` : section;
  const sample = CODE_SAMPLES[sampleKey] || CODE_SAMPLES[`${section}-list`] || CODE_SAMPLES['shipments-list'];
  const params = ep?.method === 'GET' ? [
    { name:'page',     type:'integer', desc:'Page number (default: 1)' },
    { name:'per_page', type:'integer', desc:'Items per page (default: 20, max: 100)' },
    { name:'status',   type:'string',  desc:'Filter by status (e.g. in_transit)' },
    { name:'org_id',   type:'string',  desc:'Filter by organization ID' },
  ] : ep?.method === 'POST' ? [
    { name:'sender',   type:'object',  desc:'Sender address object (required)' },
    { name:'receiver', type:'object',  desc:'Receiver address object (required)' },
    { name:'package',  type:'object',  desc:'Package details (required)' },
    { name:'service',  type:'string',  desc:'Service type: express_air | standard | document_express' },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {ep && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <MethodBadge method={ep.method} />
            <code style={{ fontFamily: 'monospace', fontSize: 15, color: TK.text1, fontWeight: 600 }}>{ep.path}</code>
          </div>
          <h2 style={{ fontWeight: 800, fontSize: 22, color: TK.text1, marginBottom: 10, margin: '0 0 10px' }}>{ep.title}</h2>
          <p style={{ fontSize: 14, color: TK.text2, lineHeight: 1.8 }}>
            {ep.method === 'GET' && !ep.path.includes('{id}')
              ? `Returns a paginated list of ${section}. Results are sorted by creation date, newest first.`
              : ep.method === 'POST'
              ? `Creates a new ${section.slice(0,-1)} object. Required fields must be provided.`
              : ep.method === 'DELETE'
              ? `Cancels and removes the ${section.slice(0,-1)}. This action cannot be undone.`
              : `Updates the specified ${section.slice(0,-1)} with the provided parameters.`
            }
          </p>
        </div>
      )}

      {params.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: TK.text1, marginBottom: 12 }}>
            {ep.method === 'GET' ? 'Query Parameters' : 'Request Body'}
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
            {params.map((p, i) => (
              <div key={i} style={{ padding: '12px 16px', borderBottom: i < params.length - 1 ? `1px solid ${TK.border}` : 'none', background: '#fafbfc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <code style={{ fontFamily: 'monospace', fontSize: 13, color: TK.text1, fontWeight: 700 }}>{p.name}</code>
                  <span style={{ fontSize: 11, color: TK.text3, background: '#f0f2f4', padding: '1px 6px', borderRadius: 5 }}>{p.type}</span>
                </div>
                <div style={{ fontSize: 12.5, color: TK.text3 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CodeBlock code={sample.code} title={sample.title} />

      {/* Response codes */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: TK.text1, marginBottom: 12 }}>Response Codes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { code:'200', label:'OK', desc:'Request succeeded', color:TK.success },
            { code:'201', label:'Created', desc:'Resource created successfully', color:TK.success },
            { code:'400', label:'Bad Request', desc:'Invalid parameters or missing required fields', color:'#b45309' },
            { code:'401', label:'Unauthorized', desc:'Invalid or missing API key', color:TK.error },
            { code:'404', label:'Not Found', desc:'Resource does not exist', color:TK.text3 },
            { code:'429', label:'Rate Limited', desc:'Too many requests — max 100/min', color:TK.error },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#fafbfc', borderRadius: 10, border: `1px solid ${TK.border}` }}>
              <code style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: r.color, minWidth: 36 }}>{r.code}</code>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: TK.text1 }}>{r.label}</span>
                <span style={{ fontSize: 12.5, color: TK.text3, marginLeft: 8 }}>{r.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── API Docs Page ────────────────────────────────
const ApiDocsPage = () => {
  const [activeSection, setActiveSection] = React.useState('intro');
  const [activeEp, setActiveEp]           = React.useState(null);
  const [expandedSections, setExpandedSections] = React.useState({ shipments: true, tracking: true });
  const w = useWindowWidth();
  const isMobile = w < 768;
  const [showSidebar, setShowSidebar] = React.useState(false);

  const toggleSection = (id) => setExpandedSections(p => ({ ...p, [id]: !p[id] }));

  const SidebarContent = () => (
    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ padding: '0 16px 12px', fontWeight: 700, fontSize: 10, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        API Reference
      </div>
      {API_SECTIONS.map(sec => (
        <div key={sec.id}>
          <button
            onClick={() => { setActiveSection(sec.id); setActiveEp(null); if (isMobile) setShowSidebar(false); if (sec.endpoints.length > 0) toggleSection(sec.id); }}
            style={{
              width: '100%', padding: '9px 16px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
              background: activeSection === sec.id && !activeEp ? TK.primaryBg : 'transparent',
              color: activeSection === sec.id && !activeEp ? TK.primary : TK.text2,
              fontWeight: activeSection === sec.id && !activeEp ? 700 : 500,
              fontSize: 13, borderRadius: 10, transition: 'all 0.12s',
            }}
            onMouseEnter={e => { if (activeSection !== sec.id || activeEp) e.currentTarget.style.background = '#f5f7fa'; }}
            onMouseLeave={e => { if (activeSection !== sec.id || activeEp) e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17, flexShrink: 0, fontVariationSettings: activeSection === sec.id ? "'FILL' 1" : "'FILL' 0" }}>{sec.icon}</span>
            <span style={{ flex: 1 }}>{sec.label}</span>
            {sec.endpoints.length > 0 && (
              <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: expandedSections[sec.id] ? 'rotate(90deg)' : 'rotate(0deg)' }}>chevron_right</span>
            )}
          </button>
          {sec.endpoints.length > 0 && expandedSections[sec.id] && (
            <div style={{ paddingLeft: 16, paddingRight: 8, marginBottom: 4 }}>
              {sec.endpoints.map(ep => (
                <EndpointRow
                  key={ep.path + ep.method}
                  ep={ep}
                  active={activeSection === sec.id && activeEp?.path === ep.path && activeEp?.method === ep.method}
                  onClick={() => { setActiveSection(sec.id); setActiveEp(ep); if (isMobile) setShowSidebar(false); }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    if (activeSection === 'intro') return <IntroContent />;
    if (activeSection === 'auth')  return <AuthContent />;
    if (activeEp) return <EndpointContent section={activeSection} ep={activeEp} />;
    const sec = API_SECTIONS.find(s => s.id === activeSection);
    if (sec?.endpoints.length > 0) return <EndpointContent section={activeSection} ep={sec.endpoints[0]} />;
    return <IntroContent />;
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>API Documentation</h1>
          <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0' }}>
            Integrate Target Logistics into your systems with our REST API
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isMobile && (
            <TLButton variant="secondary" icon="menu" onClick={() => setShowSidebar(true)}>Sections</TLButton>
          )}
          <TLButton variant="secondary" icon="key">Get API Key</TLButton>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden', minHeight: 600 }}>
        {/* Sidebar — desktop */}
        {!isMobile && (
          <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${TK.border}`, overflowY: 'auto' }}>
            <SidebarContent />
          </div>
        )}

        {/* Mobile sidebar drawer */}
        {isMobile && showSidebar && (
          <>
            <div onClick={() => setShowSidebar(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,31,35,0.4)' }} />
            <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 260, background: '#fff', zIndex: 301, overflowY: 'auto', boxShadow: '4px 0 24px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '16px', borderBottom: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: TK.text1 }}>Sections</span>
                <button onClick={() => setShowSidebar(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: TK.text2, padding: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>
              <SidebarContent />
            </div>
          </>
        )}

        {/* Main content */}
        <div style={{ flex: 1, padding: isMobile ? '20px 16px' : '32px 40px', overflowY: 'auto', minWidth: 0 }}>
          <div style={{ maxWidth: 700 }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ApiDocsPage });
