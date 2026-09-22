// ═══════════════════════════════════════════════
// Target Logistics — Mock Data Registrations
// Used when TL_CONFIG.mockMode is true, or as a
// fallback when a real API call fails (dev convenience).
// ═══════════════════════════════════════════════

(() => {
  const MOCK_USERS = [
    { id:1, name:'Mohammed Al-Ali',  email:'admin@target.kw',   role:'admin',     organizationId:null, status:'active',   phone:'+965 9999 0001', shipments:342 },
    { id:2, name:'Fatima Al-Rashid', email:'staff@target.kw',   role:'staff',     organizationId:null, status:'active',   phone:'+965 9999 0002', shipments:218 },
    { id:3, name:'Khalid Al-Sabah',  email:'manager@target.kw', role:'manager',   organizationId:null, status:'active',   phone:'+965 9999 0003', shipments:97  },
    { id:4, name:'Noor Al-Hamad',    email:'noor@target.kw',    role:'staff',     organizationId:null, status:'active',   phone:'+965 9999 0004', shipments:145 },
    { id:5, name:'Ahmad Hassan',     email:'client@target.kw',  role:'client',    organizationId:1,    status:'active',   phone:'+971 50 123 4567', shipments:56 },
    { id:6, name:'Sara Al-Mutairi',  email:'sara@gulf.kw',      role:'org_agent', organizationId:2,    status:'active',   phone:'+966 55 987 6543', shipments:34 },
    { id:7, name:'Rashid Al-Zain',   email:'rashid@alzain.kw',  role:'org_manager',organizationId:3,   status:'suspended',phone:'+965 9999 0007', shipments:12 },
    { id:8, name:'Layla Yusuf',      email:'layla@target.kw',   role:'accounting',organizationId:null, status:'inactive', phone:'+965 9999 0008', shipments:0  },
  ];

  const MOCK_ORGS = [
    { id:1, name:'Al-Fardan Trading',  type:'Business',  country:'Kuwait',  contactsCount:3, shipmentsCount:342, balance:80.000,  status:'active',    createdAt:'2024-01-15' },
    { id:2, name:'Gulf Exports Ltd',   type:'Business',  country:'Kuwait',  contactsCount:5, shipmentsCount:218, balance:144.200, status:'active',    createdAt:'2023-03-08' },
    { id:3, name:'Al-Zain Corp',       type:'Business',  country:'Kuwait',  contactsCount:2, shipmentsCount:97,  balance:12.500,  status:'suspended', createdAt:'2023-09-22' },
    { id:4, name:'Personal',           type:'Individual',country:'Kuwait',  contactsCount:1, shipmentsCount:56,  balance:22.000,  status:'active',    createdAt:'2024-06-01' },
    { id:5, name:'Noor Logistics',     type:'Business',  country:'Bahrain', contactsCount:4, shipmentsCount:189, balance:67.000,  status:'active',    createdAt:'2022-11-04' },
    { id:6, name:'Khalij Freight Co.', type:'Business',  country:'UAE',     contactsCount:6, shipmentsCount:431, balance:230.000, status:'active',    createdAt:'2022-02-18' },
  ];

  const MOCK_SHIPMENTS = [
    { id:1,  trackingNumber:'TLG-20250429-001', organizationName:'Al-Fardan Trading', createdByName:'Mohammed Al-Ali',  origin:'Kuwait City, KW', destination:'Dubai, AE',     status:'in_transit',       receiverName:'Ahmed Hassan',    receiverPhone:'+971 50 123 4567', createdAt:'2025-04-29', eta:'~2 Days',  service:'Express Air',     paid:true  },
    { id:2,  trackingNumber:'TLG-20250429-002', organizationName:'Gulf Exports Ltd',  createdByName:'Fatima Al-Rashid', origin:'Kuwait City, KW', destination:'Riyadh, SA',    status:'delivered',        receiverName:'Sara Al-Mutairi', receiverPhone:'+966 55 987 6543', createdAt:'2025-04-28', eta:'Delivered',service:'Standard',        paid:true  },
    { id:3,  trackingNumber:'TLG-20250429-003', organizationName:'Al-Fardan Trading', createdByName:'Mohammed Al-Ali',  origin:'Ahmadi, KW',      destination:'London, GB',    status:'pending',          receiverName:'James Wilson',    receiverPhone:'+44 20 7946 0958', createdAt:'2025-04-28', eta:'~5 Days',  service:'Document Express',paid:false },
    { id:4,  trackingNumber:'TLG-20250429-004', organizationName:'Personal',          createdByName:'Khalid Al-Sabah',  origin:'Salmiya, KW',     destination:'Frankfurt, DE', status:'out_for_delivery', receiverName:'Klaus Weber',     receiverPhone:'+49 69 1234 5678', createdAt:'2025-04-27', eta:'Today',    service:'Express Air',     paid:true  },
    { id:5,  trackingNumber:'TLG-20250429-005', organizationName:'Gulf Exports Ltd',  createdByName:'Noor Al-Hamad',    origin:'Kuwait City, KW', destination:'Singapore, SG', status:'in_transit',       receiverName:'Li Wei',          receiverPhone:'+65 9123 4567',    createdAt:'2025-04-27', eta:'~4 Days',  service:'Standard',        paid:true  },
    { id:6,  trackingNumber:'TLG-20250429-006', organizationName:'Al-Zain Corp',      createdByName:'Staff User',       origin:'Hawalli, KW',     destination:'New York, US',  status:'draft',            receiverName:'John Smith',      receiverPhone:'+1 212 555 0189',  createdAt:'2025-04-26', eta:'—',        service:'Express Air',     paid:false },
    { id:7,  trackingNumber:'TLG-20250429-007', organizationName:'Al-Zain Corp',      createdByName:'Staff User',       origin:'Kuwait City, KW', destination:'Mumbai, IN',    status:'exception',        receiverName:'Raj Patel',       receiverPhone:'+91 98765 43210',  createdAt:'2025-04-26', eta:'Hold',     service:'Standard',        paid:true  },
    { id:8,  trackingNumber:'TLG-20250429-008', organizationName:'Personal',          createdByName:'Fatima Al-Rashid', origin:'Fahaheel, KW',    destination:'Paris, FR',     status:'ready_for_pickup', receiverName:'Marie Dubois',    receiverPhone:'+33 1 23 45 67 89',createdAt:'2025-04-25', eta:'~3 Days',  service:'Document Express',paid:true  },
    { id:9,  trackingNumber:'TLG-20250428-009', organizationName:'Al-Fardan Trading', createdByName:'Mohammed Al-Ali',  origin:'Kuwait City, KW', destination:'Tokyo, JP',     status:'in_transit',       receiverName:'Tanaka Hiroshi',  receiverPhone:'+81 3 1234 5678',  createdAt:'2025-04-24', eta:'~3 Days',  service:'Express Air',     paid:true  },
    { id:10, trackingNumber:'TLG-20250428-010', organizationName:'Gulf Exports Ltd',  createdByName:'Noor Al-Hamad',    origin:'Kuwait City, KW', destination:'Toronto, CA',   status:'picked_up',        receiverName:'Emily Chen',      receiverPhone:'+1 416 555 0147',  createdAt:'2025-04-23', eta:'~6 Days',  service:'Standard',        paid:true  },
    { id:11, trackingNumber:'TLG-20250428-011', organizationName:'Al-Zain Corp',      createdByName:'Khalid Al-Sabah',  origin:'Rumaithiya, KW',  destination:'Sydney, AU',    status:'in_transit',       receiverName:'Liam Walker',     receiverPhone:'+61 2 9876 5432',  createdAt:'2025-04-23', eta:'~7 Days',  service:'Express Air',     paid:true  },
    { id:12, trackingNumber:'TLG-20250427-012', organizationName:'Personal',          createdByName:'Staff User',       origin:'Kuwait City, KW', destination:'Cairo, EG',     status:'delivered',        receiverName:'Omar Farouk',     receiverPhone:'+20 2 1234 5678',  createdAt:'2025-04-22', eta:'Delivered',service:'Standard',        paid:true  },
  ];

  const MOCK_TRACKING = {
    'TLG-20250429-001': {
      trackingNumber: 'TLG-20250429-001', status: 'in_transit', service: 'Express Air',
      origin: 'Kuwait City, KW', destination: 'Dubai, AE',
      senderName: 'Mohammed Al-Ali', receiverName: 'Ahmed Hassan',
      createdAt: '2025-04-29T08:14', estimatedDelivery: '2025-05-01',
      weight: 2.5,
      displayHistory: [
        { time:'2025-04-30T06:11', location:'Dubai International Airport, AE', status:'in_transit', description:'Shipment arrived at destination country' },
        { time:'2025-04-29T22:40', location:'Kuwait Airways Hub, KW',          status:'in_transit', description:'Shipment departed origin facility' },
        { time:'2025-04-29T14:32', location:'Target Logistics Hub, Kuwait City', status:'in_transit', description:'Shipment cleared export customs' },
        { time:'2025-04-29T10:15', location:'Target Logistics Hub, Kuwait City', status:'picked_up', description:'Courier picked up the shipment' },
        { time:'2025-04-29T08:14', location:'Kuwait City, KW',                 status:'created',    description:'Shipment created and confirmed' },
      ],
    },
  };

  const MOCK_LEDGER = [
    { id:'TXN-001', createdAt:'2025-04-30', type:'debit',  description:'Express Air — TLG-20250429-001',  reference:'TLG-20250429-001', amount:18.500, balance:229.500, organizationName:'Al-Fardan Trading', status:'posted'  },
    { id:'TXN-002', createdAt:'2025-04-29', type:'debit',  description:'Standard — TLG-20250429-002',     reference:'TLG-20250429-002', amount:6.200,  balance:248.000, organizationName:'Gulf Exports Ltd',  status:'posted'  },
    { id:'TXN-003', createdAt:'2025-04-29', type:'credit', description:'Wallet top-up via bank transfer', reference:'BNK-KW-0042',      amount:100.000,balance:254.200, organizationName:null,                status:'posted'  },
    { id:'TXN-004', createdAt:'2025-04-28', type:'debit',  description:'Document Express — TLG-20250429-003', reference:'TLG-20250429-003', amount:4.000, balance:154.200, organizationName:'Al-Fardan Trading', status:'posted' },
    { id:'TXN-005', createdAt:'2025-04-28', type:'debit',  description:'Customs clearance fee',           reference:'CST-20250428',     amount:2.500,  balance:158.200, organizationName:'Al-Fardan Trading', status:'posted'  },
    { id:'TXN-006', createdAt:'2025-04-27', type:'credit', description:'Refund — cancelled shipment',     reference:'TLG-20250427-R01', amount:12.000, balance:160.700, organizationName:'Al-Zain Corp',      status:'posted'  },
    { id:'TXN-007', createdAt:'2025-04-27', type:'debit',  description:'Express Air — TLG-20250429-004',  reference:'TLG-20250429-004', amount:22.000, balance:148.700, organizationName:'Personal',          status:'posted'  },
    { id:'TXN-008', createdAt:'2025-04-26', type:'debit',  description:'Standard — TLG-20250429-005',     reference:'TLG-20250429-005', amount:6.500,  balance:170.700, organizationName:'Gulf Exports Ltd',  status:'pending' },
    { id:'TXN-009', createdAt:'2025-04-26', type:'credit', description:'Client payment — Gulf Exports',   reference:'INV-2025-0089',    amount:250.000,balance:177.200, organizationName:'Gulf Exports Ltd',  status:'posted'  },
    { id:'TXN-010', createdAt:'2025-04-25', type:'debit',  description:'Fuel surcharge adjustment',       reference:'ADJ-20250425',     amount:3.200,  balance:0,       organizationName:'System',            status:'posted'  },
  ];

  const paginate = (items, q = {}) => {
    const page  = Number(q.page  || 1);
    const limit = Number(q.limit || 50);
    const total = items.length;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } };
  };

  // ── Auth ──────────────────────────────────────
  tlRegisterMock('auth.login', async ({ email }) => {
    await new Promise(r => setTimeout(r, 350));
    const u = MOCK_USERS.find(x => x.email.toLowerCase() === (email || '').toLowerCase()) || MOCK_USERS[0];
    const token = 'mock.' + btoa(JSON.stringify({ id: u.id, role: u.role, exp: Date.now() + 7*864e5 }));
    TL_auth.setToken(token);
    TL_auth.setUser(u);
    return { token, user: u };
  });

  // ── Shipments ─────────────────────────────────
  tlRegisterMock('shipments.list', (q = {}) => {
    let out = MOCK_SHIPMENTS.slice();
    if (q.status)   out = out.filter(s => s.status === q.status);
    if (q.statusIn) {
      const arr = String(q.statusIn).split(',');
      out = out.filter(s => arr.includes(s.status));
    }
    if (q.organizationId) out = out.filter(s => String(s.organizationId || s.organizationName) === String(q.organizationId));
    if (q.q) {
      const needle = String(q.q).toLowerCase();
      out = out.filter(s =>
        s.trackingNumber.toLowerCase().includes(needle) ||
        s.receiverName.toLowerCase().includes(needle) ||
        s.destination.toLowerCase().includes(needle) ||
        (s.organizationName || '').toLowerCase().includes(needle)
      );
    }
    return paginate(out, q);
  });

  tlRegisterMock('shipments.stats', () => ({
    total:      1247,
    pending:    38,
    inTransit:  284,
    exceptions: 14,
    delivered:  891,
    drafts:     23,
    weeklyVolume: [
      { day:'Mon', value:45 }, { day:'Tue', value:62 }, { day:'Wed', value:53 },
      { day:'Thu', value:78 }, { day:'Fri', value:91 }, { day:'Sat', value:38 }, { day:'Sun', value:29 },
    ],
    performance: [
      { label:'Carrier Response Rate',     value:99.4, display:'99.4%'  },
      { label:'Air Freight Punctuality',   value:96.2, display:'96.2%'  },
      { label:'Customs Clearance Avg.',    value:72,   display:'1.4h'   },
      { label:'Client Satisfaction (NPS)', value:88,   display:'NPS 88' },
    ],
  }));

  tlRegisterMock('shipments.get', (tn) => {
    return MOCK_SHIPMENTS.find(s => s.trackingNumber === tn) || MOCK_SHIPMENTS[0];
  });

  tlRegisterMock('shipments.quote', (body) => {
    const base = body?.service === 'express_air' ? 18.000 : body?.service === 'document_express' ? 4.000 : 6.500;
    const weight = Number(body?.weight || 1);
    const total = base + Math.max(0, weight - 1) * 1.250;
    return { service: body?.service, baseFee: base, weight, total, currency: 'KWD' };
  });

  // ── Public tracking ───────────────────────────
  tlRegisterMock('public.track', (tn) => {
    if (MOCK_TRACKING[tn]) return MOCK_TRACKING[tn];
    const s = MOCK_SHIPMENTS.find(x => x.trackingNumber === tn);
    if (!s) {
      const e = new Error('Tracking number not found');
      e.status = 404;
      throw e;
    }
    return {
      trackingNumber: s.trackingNumber, status: s.status, service: s.service,
      origin: s.origin, destination: s.destination,
      senderName: s.createdByName, receiverName: s.receiverName,
      createdAt: s.createdAt, estimatedDelivery: s.eta,
      displayHistory: [
        { time: s.createdAt + 'T08:00', location: s.origin, status: 'created', description: 'Shipment created and confirmed' },
        ...(s.status !== 'draft' && s.status !== 'pending' ? [
          { time: s.createdAt + 'T14:00', location: s.origin, status: 'picked_up', description: 'Courier picked up the shipment' },
          { time: s.createdAt + 'T22:00', location: s.origin, status: 'in_transit', description: 'Departed origin facility' },
        ] : []),
        ...(s.status === 'delivered' ? [
          { time: s.createdAt + 'T18:00', location: s.destination, status: 'delivered', description: 'Package delivered and signed for' },
        ] : []),
      ].reverse(),
    };
  });

  // ── Users / Orgs ──────────────────────────────
  tlRegisterMock('users.list', (q = {}) => {
    let out = MOCK_USERS.slice();
    if (q.role) out = out.filter(u => u.role === q.role);
    if (q.q) {
      const needle = String(q.q).toLowerCase();
      out = out.filter(u => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));
    }
    return paginate(out, q);
  });

  tlRegisterMock('orgs.list', (q = {}) => {
    let out = MOCK_ORGS.slice();
    if (q.q) {
      const needle = String(q.q).toLowerCase();
      out = out.filter(o => o.name.toLowerCase().includes(needle));
    }
    return paginate(out, q);
  });

  // ── Finance ───────────────────────────────────
  tlRegisterMock('finance.balance', () => ({
    balance: 248.500, currency: 'KWD',
    monthCredit: 512.000, monthDebit: 62.000,
    pendingInvoices: 3, totalUnpaid: 127.700,
  }));

  tlRegisterMock('finance.ledger', (q = {}) => {
    let out = MOCK_LEDGER.slice();
    if (q.orgId && q.orgId !== 'all') {
      out = out.filter(t => (t.organizationName || '').toLowerCase().includes(String(q.orgId).toLowerCase()));
    }
    return paginate(out, q);
  });

  // ── Geocode (address autocomplete) ────────────
  const MOCK_PLACES = [
    { city:'Kuwait City', country:'Kuwait',               state:'',        zip:'13001'  },
    { city:'Dubai',        country:'United Arab Emirates', state:'Dubai',   zip:'00000'  },
    { city:'Riyadh',        country:'Saudi Arabia',         state:'',        zip:'11564'  },
    { city:'London',        country:'United Kingdom',       state:'',        zip:'EC1A'   },
    { city:'Frankfurt',     country:'Germany',              state:'Hesse',   zip:'60306'  },
    { city:'Singapore',     country:'Singapore',            state:'',        zip:'049315' },
    { city:'New York',      country:'United States',        state:'NY',      zip:'10001'  },
    { city:'Cairo',         country:'Egypt',                state:'',        zip:'11511'  },
  ];

  tlRegisterMock('geocode.autocomplete', (q = {}) => {
    const query = (q.query || '').trim();
    if (query.length < 2) return [];
    const needle = query.toLowerCase();
    const matches = MOCK_PLACES.filter(p => p.city.toLowerCase().includes(needle) || p.country.toLowerCase().includes(needle));
    const pool = matches.length ? matches : MOCK_PLACES.slice(0, 3);
    return pool.slice(0, 5).map((p, i) => ({
      placeId: `mock-${p.city.replace(/\s+/g,'')}-${i}`,
      description: `${query}, ${p.city}, ${p.country}`,
      city: p.city, state: p.state, country: p.country, zip: p.zip,
    }));
  });

  tlRegisterMock('geocode.details', (q = {}) => {
    const placeId = q.placeId || '';
    const found = MOCK_PLACES.find(p => placeId.includes(p.city.replace(/\s+/g,''))) || MOCK_PLACES[0];
    return { addr1: '', city: found.city, state: found.state, zip: found.zip, country: found.country, lat: 0, lng: 0 };
  });

  tlRegisterMock('geocode.validate', (body = {}) => ({ valid: true, normalized: body }));
})();
