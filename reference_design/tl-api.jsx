// ═══════════════════════════════════════════════
// Target Logistics — API Client
// Central HTTP layer + auth + RBAC + hooks
// Backend: Express on http://localhost:8899
// ═══════════════════════════════════════════════

// ── Config (override via window.TL_CONFIG before this loads, or via Tweaks) ──
const TL_DEFAULT_CONFIG = {
  apiBase:     'http://localhost:8899',
  mockMode:    true,                       // ← flip to false once backend is reachable
  pollMs:      30000,                      // tracking poll interval
  fallbackOnError: true,                   // if a real call fails, return mock shape (dev convenience)
};
window.TL_CONFIG = Object.assign({}, TL_DEFAULT_CONFIG, window.TL_CONFIG || {});

// Persist config edits across reloads
try {
  const persisted = JSON.parse(localStorage.getItem('tl_config') || '{}');
  Object.assign(window.TL_CONFIG, persisted);
} catch (e) {}

const TL_setConfig = (patch) => {
  Object.assign(window.TL_CONFIG, patch);
  try { localStorage.setItem('tl_config', JSON.stringify(window.TL_CONFIG)); } catch(e){}
  window.dispatchEvent(new CustomEvent('tl-config-change', { detail: window.TL_CONFIG }));
};

// ── Token / session ────────────────────────────
const TL_TOKEN_KEY = 'tl_token';
const TL_USER_KEY  = 'tl_user';

const TL_auth = {
  getToken: () => { try { return localStorage.getItem(TL_TOKEN_KEY); } catch(e) { return null; } },
  setToken: (t) => { try { t ? localStorage.setItem(TL_TOKEN_KEY, t) : localStorage.removeItem(TL_TOKEN_KEY); } catch(e){} },
  getUser:  () => { try { return JSON.parse(localStorage.getItem(TL_USER_KEY) || 'null'); } catch(e) { return null; } },
  setUser:  (u) => { try { u ? localStorage.setItem(TL_USER_KEY, JSON.stringify(u)) : localStorage.removeItem(TL_USER_KEY); } catch(e){} },
  clear: () => { TL_auth.setToken(null); TL_auth.setUser(null); },
};

// ── Low-level fetch wrapper ────────────────────
class TLApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function apiFetch(path, opts = {}) {
  const { method = 'GET', body, headers = {}, auth = true, raw = false, query, signal } = opts;

  const cfg = window.TL_CONFIG;
  let url = (cfg.apiBase || '').replace(/\/$/, '') + path;
  if (query && typeof query === 'object') {
    const qp = Object.entries(query)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qp) url += (url.includes('?') ? '&' : '?') + qp;
  }

  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  if (auth) {
    const t = TL_auth.getToken();
    if (t) finalHeaders.Authorization = `Bearer ${t}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    throw new TLApiError(`Network error contacting ${url}`, 0, { cause: e.message });
  }

  if (raw) return res;

  let json = null;
  try { json = await res.json(); } catch(e) {}

  if (!res.ok || (json && json.success === false)) {
    const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
    if (res.status === 401) {
      // Token expired / invalid — clear session
      TL_auth.clear();
      window.dispatchEvent(new CustomEvent('tl-unauthorized'));
    }
    throw new TLApiError(msg, res.status, json && json.details);
  }

  // Backend envelope: { success, data, pagination?, token? } — return data when present, else whole json
  if (json && Object.prototype.hasOwnProperty.call(json, 'data')) {
    return json.pagination ? { data: json.data, pagination: json.pagination } : json.data;
  }
  return json;
}

// ── Mock fallback dispatcher ───────────────────
// Pages register mock builders by key; we fall back to them when mockMode is on
// or when fallbackOnError is on and the call fails.
const TL_MOCKS = {};
const tlRegisterMock = (key, fn) => { TL_MOCKS[key] = fn; };

async function withMock(key, args, realCall) {
  const cfg = window.TL_CONFIG;
  if (cfg.mockMode && TL_MOCKS[key]) {
    // Simulate latency for realism
    await new Promise(r => setTimeout(r, 250 + Math.random() * 200));
    return TL_MOCKS[key](args);
  }
  try {
    return await realCall();
  } catch (e) {
    if (cfg.fallbackOnError && TL_MOCKS[key]) {
      console.warn(`[TL_API] ${key} failed (${e.message}) — falling back to mock data`);
      return TL_MOCKS[key](args);
    }
    throw e;
  }
}

// ═══════════════════════════════════════════════
// Endpoint helpers
// ═══════════════════════════════════════════════

const TL_API = {
  // ── Auth ─────────────────────────────────────
  auth: {
    login: ({ email, password }) => withMock('auth.login', { email, password }, async () => {
      // Backend: POST /api/auth/login → { success, token, data: { user } }
      const cfg = window.TL_CONFIG;
      const url = (cfg.apiBase || '').replace(/\/$/, '') + '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new TLApiError(json.error || `Login failed (${res.status})`, res.status);
      }
      const token = json.token;
      const user  = json.data?.user || json.user;
      if (token) TL_auth.setToken(token);
      if (user)  TL_auth.setUser(user);
      return { token, user };
    }),

    me:        () => apiFetch('/api/users/me'),
    signup:    (body) => apiFetch('/api/auth/signup', { method:'POST', body, auth:false }),
    requestOtp:(body) => apiFetch('/api/auth/request-otp', { method:'POST', body, auth:false }),
    apiKey:    (body) => apiFetch('/api/auth/api-key', { method:'POST', body }),
    logout:    () => { TL_auth.clear(); window.dispatchEvent(new CustomEvent('tl-logout')); },
  },

  // ── Shipments ────────────────────────────────
  shipments: {
    list:   (q = {}) => withMock('shipments.list', q,
              () => apiFetch('/api/shipments', { query: q })),
    stats:  (q = {}) => withMock('shipments.stats', q,
              () => apiFetch('/api/shipments/stats', { query: q })),
    get:    (tn) => withMock('shipments.get', tn,
              () => apiFetch(`/api/shipments/${encodeURIComponent(tn)}`)),
    create: (body) => apiFetch('/api/shipments', { method:'POST', body }),
    update: (tn, body) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}`, { method:'PATCH', body }),
    cancel: (tn) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}`, { method:'DELETE' }),
    quote:  (body) => withMock('shipments.quote', body,
              () => apiFetch('/api/shipments/quote', { method:'POST', body })),
    history:(tn) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/history`),
    eta:    (tn) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/eta`),
    label:  (tn) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/label`),
    bookingOptions: (tn, q) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/booking-options`, { query: q }),
    book:   (tn, body) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/book`, { method:'POST', body }),
    pickup: (tn, body) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/pickup`, { method:'POST', body }),
    setStatus:   (tn, body) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/status`,   { method:'PATCH', body }),
    setLocation: (tn, body) => apiFetch(`/api/shipments/${encodeURIComponent(tn)}/location`, { method:'PATCH', body }),
  },

  // ── Public tracking (no auth) ────────────────
  publicTracking: {
    get: (tn) => withMock('public.track', tn, async () => {
      const cfg = window.TL_CONFIG;
      const url = (cfg.apiBase || '').replace(/\/$/, '') + `/api/public/shipments/${encodeURIComponent(tn)}`;
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new TLApiError(json.error || `Tracking lookup failed (${res.status})`, res.status);
      }
      return json.data || json;
    }),
  },

  // ── Users ────────────────────────────────────
  users: {
    list:    (q = {}) => withMock('users.list', q,
                () => apiFetch('/api/users', { query: q })),
    me:      () => apiFetch('/api/users/me'),
    create:  (body) => apiFetch('/api/users', { method:'POST', body }),
    update:  (id, body) => apiFetch(`/api/users/${id}`, { method:'PATCH', body }),
    remove:  (id) => apiFetch(`/api/users/${id}`, { method:'DELETE' }),
    setPassword: (id, body) => apiFetch(`/api/users/${id}/password`, { method:'PATCH', body }),
    profile: (body) => apiFetch('/api/users/profile', { method:'PATCH', body }),
    assignableClients: () => apiFetch('/api/users/assignable-clients'),
  },

  // ── Organizations ────────────────────────────
  orgs: {
    list:   (q = {}) => withMock('orgs.list', q,
              () => apiFetch('/api/organizations', { query: q })),
    get:    (id) => apiFetch(`/api/organizations/${id}`),
    create: (body) => apiFetch('/api/organizations', { method:'POST', body }),
    update: (id, body) => apiFetch(`/api/organizations/${id}`, { method:'PATCH', body }),
    addMember:    (id, body) => apiFetch(`/api/organizations/${id}/members`, { method:'POST', body }),
    removeMember: (id, userId) => apiFetch(`/api/organizations/${id}/members/${userId}`, { method:'DELETE' }),
  },

  // ── Finance ──────────────────────────────────
  finance: {
    balance: () => withMock('finance.balance', null,
                () => apiFetch('/api/finance/balance')),
    ledger:  (q = {}) => withMock('finance.ledger', q,
                () => apiFetch('/api/finance/ledger', { query: q })),
    orgOverview: (orgId) => apiFetch(`/api/finance/organizations/${orgId}/overview`),
    orgInvoices: (orgId, q={}) => apiFetch(`/api/finance/organizations/${orgId}/invoices`, { query: q }),
    orgPayments: (orgId, q={}) => apiFetch(`/api/finance/organizations/${orgId}/payments`, { query: q }),
    createInvoice: (orgId, body) => apiFetch(`/api/finance/organizations/${orgId}/invoices`, { method:'POST', body }),
    createPayment: (orgId, body) => apiFetch(`/api/finance/organizations/${orgId}/payments`, { method:'POST', body }),
    setInvoiceStatus: (invoiceId, body) => apiFetch(`/api/finance/invoices/${invoiceId}/status`, { method:'PATCH', body }),
    reverseAllocation: (id) => apiFetch(`/api/finance/allocations/${id}/reverse`, { method:'POST' }),
  },

  // ── Pickups ──────────────────────────────────
  pickups: {
    list:   (q = {}) => apiFetch('/api/pickups', { query: q }),
    get:    (id) => apiFetch(`/api/pickups/${id}`),
    create: (body) => apiFetch('/api/pickups', { method:'POST', body }),
    update: (id, body) => apiFetch(`/api/pickups/${id}`, { method:'PATCH', body }),
    remove: (id) => apiFetch(`/api/pickups/${id}`, { method:'DELETE' }),
    approve:(id) => apiFetch(`/api/pickups/${id}/approve`, { method:'POST' }),
    reject: (id, body) => apiFetch(`/api/pickups/${id}/reject`, { method:'POST', body }),
  },

  // ── Geocode ──────────────────────────────────
  geocode: {
    autocomplete: (q) => withMock('geocode.autocomplete', q,
                    () => apiFetch('/api/geocode/autocomplete', { query: q })),
    details:      (placeId, sessionToken) => withMock('geocode.details', { placeId, sessionToken },
                    () => apiFetch(`/api/geocode/details/${placeId}`, { query: { sessionToken } })),
    validate:     (body) => withMock('geocode.validate', body,
                    () => apiFetch('/api/geocode/validate', { method:'POST', body })),
    normalize:    (body) => apiFetch('/api/geocode/normalize', { method:'POST', body }),
  },

  // raw escape hatch
  raw: apiFetch,
};

// ═══════════════════════════════════════════════
// RBAC — capability map mirrors backend rbac.policy.js
// ═══════════════════════════════════════════════
const TL_PLATFORM_ROLES = ['admin', 'accounting', 'manager', 'staff', 'driver'];
const TL_ORG_ROLES      = ['org_manager', 'org_agent', 'client'];

const TL_CAPS = {
  // Platform-wide
  viewAllShipments:    ['admin','accounting','manager','staff'],
  viewAllOrgs:         ['admin','accounting','manager','staff'],
  manageUsers:         ['admin','manager'],
  manageOrgs:          ['admin','manager'],
  manageFinance:       ['admin','accounting','manager'],
  manageSettings:      ['admin'],
  bookShipments:       ['admin','manager','staff'],
  approvePickups:      ['admin','manager','staff'],
  // Org-scoped
  createShipment:      ['admin','manager','staff','org_manager','org_agent','client'],
  viewOwnShipments:    ['org_manager','org_agent','client'],
  viewApiDocs:         ['admin','manager','org_manager','client'],
};

const TL_can = (user, capability) => {
  if (!user || !user.role) return false;
  const allowed = TL_CAPS[capability];
  return Array.isArray(allowed) && allowed.includes(user.role);
};
const TL_isPlatform = (user) => !!user && TL_PLATFORM_ROLES.includes(user.role);
const TL_isOrgRole  = (user) => !!user && TL_ORG_ROLES.includes(user.role);

// ═══════════════════════════════════════════════
// React hooks
// ═══════════════════════════════════════════════
const useApi = (fn, deps = [], { skip = false } = {}) => {
  const [state, setState] = React.useState({ data: null, loading: !skip, error: null, pagination: null });
  const [reloadTick, setReloadTick] = React.useState(0);

  React.useEffect(() => {
    if (skip) return;
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((res) => {
        if (cancelled) return;
        if (res && Object.prototype.hasOwnProperty.call(res, 'data') && Object.prototype.hasOwnProperty.call(res, 'pagination')) {
          setState({ data: res.data, pagination: res.pagination, loading: false, error: null });
        } else {
          setState({ data: res, pagination: null, loading: false, error: null });
        }
      })
      .catch((e) => { if (!cancelled) setState({ data: null, loading: false, error: e, pagination: null }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [...deps, reloadTick, skip]);

  const reload = React.useCallback(() => setReloadTick(t => t + 1), []);
  return { ...state, reload };
};

// Polling hook — useful for tracking
const useApiPoll = (fn, intervalMs, deps = []) => {
  const [state, setState] = React.useState({ data: null, loading: true, error: null });
  React.useEffect(() => {
    let cancelled = false;
    let timer;
    const run = async () => {
      try { const res = await fn(); if (!cancelled) setState({ data: res, loading: false, error: null }); }
      catch (e) { if (!cancelled) setState(s => ({ ...s, loading: false, error: e })); }
    };
    run();
    if (intervalMs > 0) timer = setInterval(run, intervalMs);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line
  }, deps);
  return state;
};

// Currency helpers
const TL_fmtKD = (v) => {
  if (v === null || v === undefined || isNaN(Number(v))) return '—';
  return Number(v).toFixed(3) + ' KD';
};
const TL_fmtMoney = (v, currency='KWD') => {
  if (v === null || v === undefined || isNaN(Number(v))) return '—';
  const decimals = currency === 'KWD' ? 3 : 2;
  return Number(v).toFixed(decimals) + ' ' + currency;
};

// Expose globals
Object.assign(window, {
  TL_API, TL_auth, TL_setConfig, TLApiError,
  TL_can, TL_isPlatform, TL_isOrgRole, TL_CAPS,
  TL_PLATFORM_ROLES, TL_ORG_ROLES,
  tlRegisterMock,
  useApi, useApiPoll,
  TL_fmtKD, TL_fmtMoney,
  apiFetch,
});
