// ═══════════════════════════════════════════════
// Target Logistics — Shipments Page v2
// ═══════════════════════════════════════════════

const ALL_SHIPMENTS = [
  { id:1,  trackingNumber:'TLG-20250429-001', org:'Al-Fardan Trading',  createdBy:'Mohammed Al-Ali',   origin:'Kuwait City, KW', dest:'Dubai, AE',      status:'in_transit',       customer:'Ahmed Hassan',    phone:'+971 50 123 4567', created:'29 Apr 2025', eta:'~2 Days',  service:'Express Air' },
  { id:2,  trackingNumber:'TLG-20250429-002', org:'Gulf Exports Ltd',   createdBy:'Fatima Al-Rashid',  origin:'Kuwait City, KW', dest:'Riyadh, SA',     status:'delivered',        customer:'Sara Al-Mutairi', phone:'+966 55 987 6543', created:'28 Apr 2025', eta:'Delivered',service:'Standard' },
  { id:3,  trackingNumber:'TLG-20250429-003', org:'Al-Fardan Trading',  createdBy:'Mohammed Al-Ali',   origin:'Ahmadi, KW',      dest:'London, GB',     status:'pending',          customer:'James Wilson',    phone:'+44 20 7946 0958', created:'28 Apr 2025', eta:'~5 Days',  service:'Document Express' },
  { id:4,  trackingNumber:'TLG-20250429-004', org:'Personal',           createdBy:'Khalid Al-Sabah',   origin:'Salmiya, KW',     dest:'Frankfurt, DE',  status:'out_for_delivery', customer:'Klaus Weber',     phone:'+49 69 1234 5678', created:'27 Apr 2025', eta:'Today',    service:'Express Air' },
  { id:5,  trackingNumber:'TLG-20250429-005', org:'Gulf Exports Ltd',   createdBy:'Noor Al-Hamad',     origin:'Kuwait City, KW', dest:'Singapore, SG',  status:'in_transit',       customer:'Li Wei',          phone:'+65 9123 4567',    created:'27 Apr 2025', eta:'~4 Days',  service:'Standard' },
  { id:6,  trackingNumber:'TLG-20250429-006', org:'Al-Zain Corp',       createdBy:'Staff User',        origin:'Hawalli, KW',     dest:'New York, US',   status:'draft',            customer:'John Smith',      phone:'+1 212 555 0189',  created:'26 Apr 2025', eta:'—',        service:'Express Air' },
  { id:7,  trackingNumber:'TLG-20250429-007', org:'Al-Zain Corp',       createdBy:'Staff User',        origin:'Kuwait City, KW', dest:'Mumbai, IN',     status:'exception',        customer:'Raj Patel',       phone:'+91 98765 43210',  created:'26 Apr 2025', eta:'Hold',     service:'Standard' },
  { id:8,  trackingNumber:'TLG-20250429-008', org:'Personal',           createdBy:'Fatima Al-Rashid',  origin:'Fahaheel, KW',    dest:'Paris, FR',      status:'ready_for_pickup', customer:'Marie Dubois',    phone:'+33 1 23 45 67 89',created:'25 Apr 2025', eta:'~3 Days',  service:'Document Express' },
  { id:9,  trackingNumber:'TLG-20250428-009', org:'Al-Fardan Trading',  createdBy:'Mohammed Al-Ali',   origin:'Kuwait City, KW', dest:'Tokyo, JP',      status:'in_transit',       customer:'Tanaka Hiroshi',  phone:'+81 3 1234 5678',  created:'24 Apr 2025', eta:'~3 Days',  service:'Express Air' },
  { id:10, trackingNumber:'TLG-20250428-010', org:'Gulf Exports Ltd',   createdBy:'Noor Al-Hamad',     origin:'Kuwait City, KW', dest:'Toronto, CA',    status:'picked_up',        customer:'Emily Chen',      phone:'+1 416 555 0147',  created:'23 Apr 2025', eta:'~6 Days',  service:'Standard' },
  { id:11, trackingNumber:'TLG-20250428-011', org:'Al-Zain Corp',       createdBy:'Khalid Al-Sabah',   origin:'Rumaithiya, KW',  dest:'Sydney, AU',     status:'in_transit',       customer:'Liam Walker',     phone:'+61 2 9876 5432',  created:'23 Apr 2025', eta:'~7 Days',  service:'Express Air' },
  { id:12, trackingNumber:'TLG-20250427-012', org:'Personal',           createdBy:'Staff User',        origin:'Kuwait City, KW', dest:'Cairo, EG',      status:'delivered',        customer:'Omar Farouk',     phone:'+20 2 1234 5678',  created:'22 Apr 2025', eta:'Delivered',service:'Standard' },
];

// Counts differ by role:
// client → only their own shipments; staff/admin/manager → all shipments
const getFilterTabs = (user) => {
  const isClient = user?.role === 'client';
  return [
    { key:'all',       label:'All',         count: isClient ? 56   : 1247, color:TK.primary  },
    { key:'drafts',    label:'Drafts',       count: isClient ? 2    : 23,   color:'#b45309'   },
    { key:'pending',   label:'Pending',      count: isClient ? 4    : 38,   color:'#d97706'   },
    { key:'active',    label:'In Transit',   count: isClient ? 18   : 284,  color:TK.info     },
    { key:'delivered', label:'Delivered',    count: isClient ? 32   : 891,  color:TK.success  },
  ];
};

const STATUS_MAP = {
  all:       () => true,
  drafts:    s => s.status === 'draft',
  pending:   s => ['pending','updated','ready_for_pickup'].includes(s.status),
  active:    s => ['created','picked_up','in_transit','out_for_delivery'].includes(s.status),
  delivered: s => ['delivered','completed'].includes(s.status),
};

// ── Action menu ─────────────────────────────────
const ActionMenu = ({ onClose, shipment, onView, onEdit, onDelete }) => {
  const actions = [
    { icon:'visibility',    label:'View Details',   handler: onView   && (() => onView(shipment)) },
    { icon:'description',   label:'View Label',     handler: () => window.open(`#label/${encodeURIComponent(shipment?.trackingNumber || '')}`, '_blank') },
    { icon:'local_shipping',label:'AWB / Label',    handler: () => window.open(`#awb/${encodeURIComponent(shipment?.trackingNumber || '')}`, '_blank') },
    { icon:'receipt',       label:'Invoice',        handler: () => window.open(`#invoice/${encodeURIComponent(shipment?.trackingNumber || '')}`, '_blank') },
    { icon:'edit',          label:'Approve / Edit', divider: true, handler: onEdit && (() => onEdit(shipment)) },
    { icon:'delete',        label:'Delete',         divider: true, danger: true, handler: onDelete && (() => onDelete(shipment)) },
  ];

  React.useEffect(() => {
    const h = (e) => { if (!e.target.closest('[data-action-menu]')) onClose(); };
    setTimeout(() => document.addEventListener('click', h), 0);
    return () => document.removeEventListener('click', h);
  }, []);

  return (
    <div
      data-action-menu
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 300,
        background: '#fff', border: `1px solid ${TK.border}`, borderRadius: 13,
        boxShadow: '0 12px 36px rgba(0,0,0,0.12)', minWidth: 172, overflow: 'hidden',
      }}
    >
      {actions.map((a, i) => (
        <React.Fragment key={i}>
          {a.divider && <div style={{ height: 1, background: TK.border }} />}
          <button
            style={{
              width: '100%', padding: '9px 15px', border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: a.danger ? TK.error : TK.text1,
              cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = a.danger ? TK.errorBg : '#f5f7fa'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => { onClose(); a.handler && a.handler(); }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: a.danger ? TK.error : TK.text3 }}>{a.icon}</span>
            {a.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Desktop Table Row ────────────────────────────
const SRow = ({ s, isLast, onView, onEdit, onDelete }) => {
  const [hov, setHov] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onView && onView(s)}
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${TK.border}`,
        background: hov ? '#fafbfc' : 'transparent',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
    >
      <td style={{ padding: '13px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, color: hov ? TK.primary : TK.text1, transition: 'color 0.12s' }}>
          {s.trackingNumber}
        </div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.service}</div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: TK.primary }}>{s.org}</div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.createdBy}</div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, color: TK.text1 }}>{s.origin.split(',')[0]}</span>
          <span style={{ color: TK.primary }}>→</span>
          <span style={{ fontWeight: 600, color: TK.text1 }}>{s.dest.split(',')[0]}</span>
        </div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>
          {s.origin.split(', ')[1]} → {s.dest.split(', ')[1]}
        </div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ fontSize: 12.5, color: TK.text1 }}>{s.customer}</div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.phone}</div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <StatusPill status={s.status} />
      </td>
      <td style={{ padding: '13px 16px', fontSize: 12.5, color: TK.text2 }}>{s.created}</td>
      <td style={{ padding: '13px 16px' }}>
        <span style={{
          fontSize: 12.5, fontWeight: 700,
          color: s.eta === 'Today' ? TK.success : s.eta === 'Hold' ? TK.error : s.eta === 'Delivered' ? TK.success : TK.text2,
        }}>{s.eta}</span>
      </td>
      <td style={{ padding: '13px 12px', textAlign: 'right', position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{
            width: 30, height: 30, borderRadius: 8,
            border: `1px solid ${menuOpen ? TK.primary : TK.border}`,
            background: menuOpen ? TK.primaryBg : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: menuOpen ? TK.primary : TK.text3, transition: 'all 0.15s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_horiz</span>
        </button>
        {menuOpen && <ActionMenu shipment={s} onClose={() => setMenuOpen(false)} onView={onView} onEdit={onEdit} onDelete={onDelete} />}
      </td>
    </tr>
  );
};

// ── Mobile Card ──────────────────────────────────
const SMobileCard = ({ s, onView, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <div
      onClick={() => onView && onView(s)}
      style={{
        background: '#fff', borderRadius: 14, border: `1px solid ${TK.border}`,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', cursor:'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: TK.primary }}>{s.trackingNumber}</div>
          <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.service}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill status={s.status} />
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              style={{
                width: 28, height: 28, borderRadius: 7,
                border: `1px solid ${TK.border}`, background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: TK.text3,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>more_horiz</span>
            </button>
            {menuOpen && <ActionMenu shipment={s} onClose={() => setMenuOpen(false)} onView={onView} onEdit={onEdit} onDelete={onDelete} />}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.text3 }}>flight_takeoff</span>
        <span style={{ fontWeight: 600, color: TK.text1 }}>{s.origin.split(',')[0]}</span>
        <span style={{ color: TK.primary, fontWeight: 700 }}>→</span>
        <span style={{ fontWeight: 600, color: TK.text1 }}>{s.dest.split(',')[0]}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${TK.border}` }}>
        <div style={{ display: 'flex', align: 'center', gap: 6 }}>
          <div>
            <div style={{ fontSize: 10.5, color: TK.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer</div>
            <div style={{ fontSize: 12.5, color: TK.text1, fontWeight: 600, marginTop: 1 }}>{s.customer}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: TK.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETA</div>
          <div style={{
            fontSize: 12.5, fontWeight: 700, marginTop: 1,
            color: s.eta === 'Today' ? TK.success : s.eta === 'Hold' ? TK.error : s.eta === 'Delivered' ? TK.success : TK.text2,
          }}>{s.eta}</div>
        </div>
      </div>
    </div>
  );
};

// ── Pagination Button ────────────────────────────
const PagBtn = ({ onClick, disabled, active, label, icon }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 32, height: 32, borderRadius: 9,
      border: `1.5px solid ${active ? TK.primary : TK.border}`,
      background: active ? TK.primary : 'transparent',
      color: active ? '#fff' : disabled ? TK.text3 : TK.text2,
      fontWeight: 700, fontSize: 12.5,
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: disabled ? 0.35 : 1, transition: 'all 0.12s',
    }}
  >
    {icon
      ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      : label
    }
  </button>
);

// ── Adapter: backend shipment shape → table row shape ─────
const toRowShape = (s) => ({
  id:             s.id || s.trackingNumber,
  trackingNumber: s.trackingNumber,
  org:            s.organizationName || s.org || '—',
  createdBy:      s.createdByName    || s.createdBy || '—',
  origin:         s.origin || '—',
  dest:           s.destination || s.dest || '—',
  status:         s.status || 'draft',
  customer:      s.receiverName || s.customer || '—',
  phone:         s.receiverPhone || s.phone || '—',
  created:       s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—',
  eta:           s.eta || s.estimatedDelivery || '—',
  service:       s.service || '—',
});

// Map filter-tab keys to backend statusIn lists
const FILTER_STATUSES = {
  all:       null,
  drafts:    'draft',
  pending:   'pending,updated,ready_for_pickup',
  active:    'created,picked_up,in_transit,out_for_delivery',
  delivered: 'delivered,completed',
};

// ── Shipments Page ────────────────────────────────
const ShipmentsPage = ({ user, onNew, onView, onEdit, onDelete, refreshKey }) => {
  const [activeFilter, setActiveFilter] = React.useState('all');
  const [search, setSearch]             = React.useState('');
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [page, setPage]                 = React.useState(1);
  const w = useWindowWidth();
  const isMobile = w < 640;
  const isTablet = w >= 640 && w < 900;
  const PER_PAGE = isMobile ? 6 : 8;

  const FILTER_TABS = getFilterTabs(user);

  // Debounced query so we don't hammer the API on every keystroke
  const [debouncedQ, setDebouncedQ] = React.useState('');
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  // Live fetch from backend (or mocks)
  const apiQuery = {
    page, limit: PER_PAGE,
    q: debouncedQ || undefined,
    statusIn: FILTER_STATUSES[activeFilter] || undefined,
    organizationId: user?.role === 'client' ? (user.organizationId || undefined) : undefined,
    sortBy: 'createdAt', sortOrder: 'desc',
  };
  const { data, pagination, loading, error } = useApi(
    () => TL_API.shipments.list(apiQuery),
    [page, debouncedQ, activeFilter, user?.id, refreshKey]
  );

  const rawList = Array.isArray(data) ? data : (data?.data || []);
  const filtered = rawList.map(toRowShape);
  const totalPages = pagination ? pagination.pages : Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered;
  const totalCount = pagination ? pagination.total : filtered.length;

  const changeFilter = (key) => { setActiveFilter(key); setPage(1); };
  const changeSearch = (v)   => { setSearch(v); setPage(1); };

  const filterCols = isMobile
    ? 'repeat(3, 1fr)'
    : 'repeat(5, 1fr)';

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>Shipments</h1>
          <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0' }}>
            Manage consignment lifecycle, track deliveries, and handle exceptions.
          </p>
        </div>
        <TLButton icon="add" onClick={onNew}>New Shipment</TLButton>
      </div>

      {/* Filter tabs — stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: filterCols, gap: isMobile ? 8 : 12, marginBottom: 16 }}>
        {FILTER_TABS.map(tab => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => changeFilter(tab.key)}
              style={{
                padding: isMobile ? '10px 10px' : '14px 16px',
                borderRadius: 14, textAlign: 'left',
                border: `1.5px solid ${isActive ? tab.color : TK.border}`,
                background: isActive ? `${tab.color}0d` : '#fff',
                cursor: 'pointer', transition: 'all 0.18s',
                boxShadow: isActive ? `0 4px 16px ${tab.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: isMobile ? 18 : 22, color: isActive ? tab.color : TK.text1, letterSpacing: '-0.04em' }}>
                {tab.count.toLocaleString()}
              </div>
              <div style={{ fontWeight: 600, fontSize: isMobile ? 9.5 : 10.5, color: isActive ? tab.color : TK.text3, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>
                {tab.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Table container */}
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: isMobile ? '12px 14px' : '13px 18px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${TK.border}`, flexWrap: 'wrap' }}>
          <div style={{
            flex: 1, minWidth: 180,
            display: 'flex', alignItems: 'center', gap: 9,
            border: `1.5px solid ${searchFocused ? TK.primary : TK.border}`,
            borderRadius: 10, padding: '8px 13px',
            background: searchFocused ? '#fff' : '#fafbfc',
            boxShadow: searchFocused ? '0 0 0 3px rgba(0,80,212,0.08)' : 'none',
            transition: 'all 0.15s',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: searchFocused ? TK.primary : TK.text3, flexShrink: 0 }}>search</span>
            <input
              placeholder="Search tracking, customer, destination..."
              value={search}
              onChange={e => changeSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: TK.text1, width: '100%' }}
            />
            {search && (
              <button onClick={() => changeSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: TK.text3, padding: 0, display: 'flex', flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            )}
          </div>

          {[{ icon:'filter_list', label:'Filters' }, { icon:'download', label:'Export' }].map(btn => (
            <button key={btn.label} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 13px', borderRadius: 10, border: `1px solid ${TK.border}`, background: '#fafbfc',
              fontSize: 12.5, color: TK.text2, cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f2f5'; e.currentTarget.style.color = TK.text1; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fafbfc'; e.currentTarget.style.color = TK.text2; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{btn.icon}</span>
              {!isMobile && btn.label}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: TK.text3, whiteSpace: 'nowrap' }}>
            {loading ? 'Loading…' : `${totalCount} result${totalCount !== 1 ? 's' : ''}`}
          </div>
        </div>

        {error && (
          <div style={{ padding:'12px 18px', background:TK.errorBg, color:TK.error, fontSize:12.5, fontWeight:600, borderBottom:`1px solid ${TK.border}` }}>
            {error.message || 'Failed to load shipments'}
          </div>
        )}

        {/* Mobile card list */}
        {isMobile ? (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paginated.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, color: TK.text3, display: 'block', marginBottom: 12, opacity: 0.5 }}>search_off</span>
                <div style={{ fontWeight: 700, fontSize: 16, color: TK.text1, marginBottom: 6 }}>No shipments found</div>
                <div style={{ fontSize: 13.5, color: TK.text3 }}>Try adjusting your search or filter.</div>
              </div>
            ) : paginated.map(s => <SMobileCard key={s.id} s={s} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}
          </div>
        ) : (
          /* Desktop table */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ background: '#fafbfc', borderBottom: `1px solid ${TK.border}` }}>
                  {[
                    ['Tracking Info', '17%'], ['Organization', '13%'], ['Route',     '18%'],
                    ['Customer',      '14%'], ['Status',        '11%'], ['Created',   '10%'],
                    ['ETA',           '8%'],  ['',              '50px'],
                  ].map(([col, w], i) => (
                    <th key={i} style={{
                      padding: '10px 16px', textAlign: 'left', width: w,
                      fontWeight: 700, fontSize: 10.5,
                      color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      {col && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          {col}
                          <span className="material-symbols-outlined" style={{ fontSize: 12, opacity: 0.35 }}>unfold_more</span>
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '60px 20px', textAlign: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 44, color: TK.text3, display: 'block', marginBottom: 12, opacity: 0.5 }}>search_off</span>
                      <div style={{ fontWeight: 700, fontSize: 16, color: TK.text1, marginBottom: 6 }}>No shipments found</div>
                      <div style={{ fontSize: 13.5, color: TK.text3 }}>Try adjusting your search or filter selection.</div>
                    </td>
                  </tr>
                ) : paginated.map((s, i) => (
                  <SRow key={s.id} s={s} isLast={i === paginated.length - 1} onView={onView} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${TK.border}`, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: TK.text3 }}>
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, totalCount)} of {totalCount}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} icon="chevron_left" />
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <PagBtn key={p} onClick={() => setPage(p)} active={p === page} label={p} />
              ))}
              <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} icon="chevron_right" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { ShipmentsPage });
