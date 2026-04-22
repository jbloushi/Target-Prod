# Security & Quality Audit Report — Target KW (3PL Platform)

**Date:** 2026-04-22  
**Auditor:** Mawthook / Claude Sonnet 4.6  
**Codebase:** https://github.com/jbloushi/Target-Prod  
**Scope:** Backend Node.js/Express API (auth, RBAC, carrier integrations, public API, secrets, data logic)

---

## Executive Summary

**Overall Risk Level: HIGH**

The platform has a solid structural foundation — Prisma ORM prevents raw SQL injection, helmet is enabled, error responses are sanitised in production, and API key comparison uses constant-time HMAC. However, several high-impact vulnerabilities exist that could expose cross-tenant shipment data, allow privilege escalation through profile updates, or leak carrier credentials to disk logs.

### Top 3 Critical Findings

| # | Finding | Impact |
|---|---|---|
| 1 | **CORS wildcard reflects any origin** — when `CORS_ORIGIN=*` (the default), the server echoes back the requesting origin, making credentialed cross-origin requests possible from any domain | Session hijacking, API key theft via CSRF |
| 2 | **IDOR on single shipment lookup** — `GET /api/shipments/:trackingNumber` has no org-scoping check; any authenticated user can retrieve any shipment if they know its tracking number | Cross-tenant data exposure |
| 3 | **`getShipmentStats` exposes cross-org data** — the `organizationId` query param is accepted from any authenticated user with no role gate, leaking org-level shipment volume | Business intelligence leakage |

---

## Findings Table

| # | File | Line(s) | Severity | Issue | Recommended Fix |
|---|---|---|---|---|---|
| F-01 | `src/server.js` | 59–61 | CRITICAL | CORS wildcard reflects origin — any site can make credentialed requests | Set `CORS_ORIGIN` to explicit allowlist; never default to `*` in production |
| F-02 | `src/controllers/shipment-crud.controller.js` | 124–170 | CRITICAL | IDOR — `getShipmentByTrackingNumber` missing org/ownership check | Call `canAccessShipment()` before returning data |
| F-03 | `src/controllers/shipment-crud.controller.js` | 18–96 | CRITICAL | `getShipmentStats` accepts any `organizationId` from any authenticated user | Gate behind `isPlatformRole` check; scope to own org for org users |
| F-04 | `src/controllers/shipment-ops.controller.js` | 65–81 | HIGH | XSS — `generateLabel` builds HTML by directly interpolating unescaped shipment fields | Escape all fields before interpolation; add CSP header |
| F-05 | `src/config/config.js` | 36 | HIGH | JWT default secret `'dev-secret-key-change-in-production'` used when env var absent and `NODE_ENV !== production` | Remove fallback entirely; throw on missing secret regardless of env |
| F-06 | `src/controllers/user.controller.js` | 188–215 | HIGH | `updateProfile` allows any user to overwrite their own `carrierConfig`, bypassing admin-assigned shipping policy | Remove `carrierConfig` from self-service update; admin-only field |
| F-07 | `src/controllers/api.controller.js` | 322–331 | HIGH | `console.log('QUOTE DEBUG', ...)` leaks userId, carrierConfig, agentPolicy to server logs in production | Remove entirely or guard with `if (process.env.NODE_ENV !== 'production')` |
| F-08 | `src/adapters/DgrAdapter.js` | 137–148 | HIGH | `appendDebugLog` writes full carrier API payloads (including DHL auth credentials in the payload) to an unbounded disk file | Remove disk log or replace with structured logger at debug level with rotation |
| F-09 | `src/middleware/rbac.policy.js` | 96–100, 124 | HIGH | `driver` role is in `PLATFORM_ROLES` giving drivers `VIEW_ALL_SHIPMENTS` with zero org scoping — drivers can enumerate every shipment | Move `driver` to `ORG_ROLES` or create a dedicated scoping tier |
| F-10 | `src/controllers/shipment-crud.controller.js` | 303–327 | HIGH | `deleteShipment` performs hard delete (`prisma.shipment.delete`) on records linked to financial ledger | Implement soft delete (`deletedAt` field); never hard-delete financial records |
| F-11 | `src/controllers/user.controller.js` | 303–316 | HIGH | `deleteUser` performs hard delete on users tied to shipments and finance ledger | Implement soft delete; deactivate (`active: false`) instead |
| F-12 | `src/controllers/api.controller.js` | 394–415 | MEDIUM | `updateAddress` spreads entire `req.body` into stored address — mass assignment | Whitelist accepted fields explicitly |
| F-13 | `src/controllers/api.controller.js` | 376–392 | MEDIUM | `addAddress` returns raw `req.body` back to client rather than the stored record | Return the actual stored address object |
| F-14 | `src/controllers/auth.controller.js` | 103–141 | MEDIUM | No account lockout or progressive delay after failed login attempts; rate limit (20/hr) is IP-based and easy to bypass with distributed IPs | Add per-email failed-attempt counter with exponential backoff or temporary lock |
| F-15 | `src/controllers/auth.controller.js` | 40–98 | MEDIUM | Password validation only checks `length >= 8`; no complexity requirement | Enforce at least one uppercase, one digit, one special character |
| F-16 | `src/controllers/shipment-public.controller.js` | 96–139 | MEDIUM | `updatePublicLocation` does not validate that coordinates are numeric or within valid lat/lng bounds | Add `isFloat` validation to both coordinate values |
| F-17 | `src/controllers/finance.controller.js` | 53–96 | MEDIUM | `getLedger` — platform users can pass `?orgId=<any>` to dump ledger for any organization with no audit trail | Log all cross-org ledger queries; validate `orgId` against allowed scope |
| F-18 | `src/controllers/auth.controller.js` | 226–237 | MEDIUM | `getAllUsers` returns all `org_agent` + `org_manager` users with no pagination or limit — unbounded data dump | Add pagination; restrict to caller's org context where appropriate |
| F-19 | `src/controllers/shipment-ops.controller.js` | 151–212 | MEDIUM | `processWarehouseScan` allows `staff` to overwrite parcel weight from request body with no validation of reasonableness | Validate weight is positive number within business bounds; log discrepancies |
| F-20 | `src/middleware/idempotency.middleware.js` | 13 | MEDIUM | `idempotency-key` header has no length validation — arbitrary long strings stored to DB | Enforce max key length (e.g., 128 chars) |
| F-21 | `src/controllers/user.controller.js` | 157–181 | MEDIUM | `getMe` returns full user record with `include: { organization: true }` — may expose `apiKeyHash`, `carrierConfig`, sensitive policy fields | Use explicit `select` to exclude `apiKeyHash`, `password`, internal policy details |
| F-22 | `src/controllers/auth.controller.js` | 146–148 | LOW | `requestOtp` is an unimplemented stub returning `200 OK` — misleads clients about authentication state | Either implement or return `501 Not Implemented`; document as disabled |
| F-23 | `src/adapters/AramexAdapter.js` | 16–87 | LOW | Aramex adapter is a mock — `book()` returns `https://example.com/mock-aramex-label.pdf`; any client assigned to Aramex gets fake labels | Block assignment of `ARAMEX` carrier in production or throw clearly |
| F-24 | `src/adapters/DgrAdapter.js` | 492–502 | LOW | `CarrierLog.requestPayload` stores full DHL booking payload — contains customer PII (addresses, phone, company) | Scrub PII from payloads before storage; keep only structural fields |
| F-25 | `src/controllers/auth.controller.js` | 60–70 | LOW | Self-signup creates organization with hardcoded 15% markup and no admin approval workflow | Flag new orgs as `pending` until admin activates; do not auto-configure pricing |
| F-26 | `src/config/config.js` | 45 | LOW | `dhlApiUrl` defaults to `https://express.api.dhl.com/mydhlapi/test` — test environment URL in production config fallback | Default to `null`; throw if not explicitly configured |
| F-27 | `src/controllers/shipment-ops.controller.js` | 65–81 | LOW | Label HTML response has no `Content-Security-Policy` header | Set `res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")` before `res.send` |
| F-28 | `src/adapters/AramexAdapter.js` | 17, 54 | LOW | `console.log` with full payload in mock adapter — will noise production logs | Remove or replace with `logger.debug` |
| F-29 | `src/server.js` | 213 | LOW | `console.log('Called app.listen')` in production startup | Replace with `logger.info` or remove |
| F-30 | `src/controllers/shipment-crud.controller.js` | 42–63 | LOW | Raw SQL `$queryRaw` for monthly stats does not scope by org for non-platform users — covered by outer stats endpoint but worth noting | Merge into a single scoped query |

---

## Detailed Findings

---

### F-01 — CRITICAL: CORS Wildcard Reflects Any Origin

**File:** [`src/server.js:59–61`](backend/src/server.js)

**Context:** The CORS configuration has a deliberate bypass: when `CORS_ORIGIN=*` (the out-of-box default in `config.js:38`), the server echoes back the requesting `Origin` header as the `Access-Control-Allow-Origin` value. Combined with `credentials: true`, this allows **any website** to make authenticated requests to the API — including requests that send cookies, Authorization headers, and API keys.

```js
// server.js:59
if (corsOrigin === '*') {
  return callback(null, origin);  // ← reflects ANY origin
}
```

**Impact:** A malicious website visited by a logged-in user can perform any API action on their behalf (CSRF-style attack). An attacker can read shipment data, create shipments, and access financial records from a cross-origin page.

**Fix:** Remove the wildcard reflection. Set `CORS_ORIGIN` to a comma-separated list of allowed frontend domains. The production validation in `config.js` does not check `CORS_ORIGIN`, so it can silently remain `*` in production.

---

### F-02 — CRITICAL: IDOR on Single Shipment Lookup

**File:** [`src/controllers/shipment-crud.controller.js:116–170`](backend/src/controllers/shipment-crud.controller.js)

**Context:** `getShipmentByTrackingNumber` fetches a shipment by tracking number using a global `findUnique`. The only access control applied is field-level filtering (hide cost data, hide documents) based on role — but no check that the requesting user belongs to the same organization as the shipment.

```js
// shipment-crud.controller.js:124
const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber },  // ← no org/user scope
    include: { user: {...}, organization: {...} }
});
// No canAccessShipment() call follows
```

The `canAccessShipment` function exists in [`authorize.middleware.js:93–107`](backend/src/middleware/authorize.middleware.js) but is never called here.

**Impact:** Any `org_agent` from Organization A who guesses or obtains a tracking number belonging to Organization B can view the full shipment including origin/destination addresses, customer details, items, and financial data.

**Fix:** Add immediately after the null-check:
```js
if (!canAccessShipment(req, shipment)) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
}
```

---

### F-03 — CRITICAL: `getShipmentStats` Missing Org Scoping

**File:** [`src/controllers/shipment-crud.controller.js:18–96`](backend/src/controllers/shipment-crud.controller.js)

**Context:** The stats endpoint accepts `?organizationId=X` from any authenticated user. There is no `isPlatformRole` guard — an `org_agent` can pass any `organizationId` and receive shipment volume data for that org.

```js
// shipment-crud.controller.js:19
const { organizationId } = req.query;
const where = {};
if (organizationId) {
    where.organizationId = organizationId === 'none' ? null : organizationId;
}
// ← no role check before applying this filter
```

**Impact:** Competitive intelligence leak — any registered user can enumerate shipment volumes across all client organizations.

**Fix:**
```js
if (organizationId) {
    if (!isPlatformRole(req.user.role)) {
        // Org users can only see their own org's stats
        if (req.user.organizationId !== organizationId) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
    }
    where.organizationId = organizationId === 'none' ? null : organizationId;
} else if (!isPlatformRole(req.user.role)) {
    where.organizationId = req.user.organizationId || undefined;
    if (!where.organizationId) where.userId = req.user.id;
}
```

---

### F-04 — HIGH: XSS in Label Generation

**File:** [`src/controllers/shipment-ops.controller.js:65–81`](backend/src/controllers/shipment-ops.controller.js)

**Context:** The label endpoint builds an HTML page by directly interpolating shipment fields without HTML-escaping:

```js
// shipment-ops.controller.js:69
`<strong>${shipment.origin.contactPerson}</strong><br>
 ${shipment.origin.company ? shipment.origin.company + '<br>' : ''}
 ${shipment.origin.formattedAddress || 'N/A'}`
```

Any of `contactPerson`, `company`, `formattedAddress`, `city`, `countryCode`, `phone` could contain `<script>alert(1)</script>` if a malicious user crafted the shipment.

**Impact:** When a staff member or org user views the label, arbitrary JavaScript executes in their browser session, enabling session token theft or account takeover.

**Fix:** HTML-escape all interpolated values. Add a minimal helper:
```js
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
```
Also add `res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")`.

---

### F-05 — HIGH: JWT Default Secret

**File:** [`src/config/config.js:36`](backend/src/config/config.js)

**Context:**
```js
jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
```

The production validation in `validateProductionEnv()` only runs when `NODE_ENV === 'production'`. If the server is started in any other environment (staging, QA, a misconfigured deployment) without `JWT_SECRET` set, the well-known fallback string becomes the signing secret.

**Fix:** Remove the fallback. Throw unconditionally:
```js
jwtSecret: (() => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
    return process.env.JWT_SECRET;
})(),
```

---

### F-06 — HIGH: `updateProfile` Allows Overwriting Carrier Policy

**File:** [`src/controllers/user.controller.js:188–215`](backend/src/controllers/user.controller.js)

**Context:** Any authenticated user can `PATCH /api/users/profile` with a `carrierConfig` payload:

```js
// user.controller.js:191
const { name, phone, addresses, carrierConfig } = req.body;
// ...
if (carrierConfig) updateData.carrierConfig = carrierConfig;
```

`carrierConfig` contains `preferredCarrier` and `serviceCode`, which are also stored in `agentPolicy.shippingAccess` (the admin-assigned value). An `org_agent` can overwrite their `carrierConfig` to point to a different carrier, potentially bypassing the access control enforced in `shippingAccess.service.js`.

**Fix:** Remove `carrierConfig` from the self-service profile update. It must only be settable by admin via `PATCH /api/users/:id`.

---

### F-07 — HIGH: Console Debug Log Leaks Sensitive Data in Production

**File:** [`src/controllers/api.controller.js:322–331`](backend/src/controllers/api.controller.js)

**Context:**
```js
console.log('QUOTE DEBUG', {
    requestedCarrierCode: carrierCode || null,
    requestedServiceCode: serviceCode || null,
    assignedAccess,
    finalCarrierCode: resolvedCarrierCode,
    finalServiceCode: resolvedServiceCode,
    userId: user?.id,
    carrierConfig: user?.carrierConfig,   // ← carrier credentials
    agentPolicy: user?.agentPolicy        // ← pricing policy
});
```

This runs on every quote request in production and emits carrier configuration and pricing policy to stdout — which is captured by PM2 and any log aggregation systems.

**Fix:** Remove entirely, or wrap in `if (process.env.NODE_ENV !== 'production')`.

---

### F-08 — HIGH: DGR Adapter Writes Credentials to Disk

**File:** [`src/adapters/DgrAdapter.js:137–148`](backend/src/adapters/DgrAdapter.js)

**Context:** `appendDebugLog` synchronously appends to `dgr_debug_error.log` on every carrier error. The logged data includes the full request payload passed to DHL, which contains the Basic Auth header indirectly (through the config that generated it). The log file is never rotated and grows unboundedly.

**Impact:** Log file could accumulate sensitive shipment PII (addresses, contact details) and is unprotected by application-level access controls. Anyone with VPS filesystem access can read it.

**Fix:** Replace with `logger.error(tag, data)` at debug level (not written to disk unless explicitly configured). If disk logging is needed, use the existing Winston rotation config.

---

### F-09 — HIGH: Driver Role Has Platform-Level Data Access

**File:** [`src/middleware/rbac.policy.js:96–100, 124`](backend/src/middleware/rbac.policy.js)

**Context:**
```js
// rbac.policy.js:96
driver: [
    CAPABILITIES.DRIVER_OPS,
    CAPABILITIES.VIEW_ALL_SHIPMENTS,  // ← grants platform visibility
    CAPABILITIES.VIEW_OWN_SHIPMENTS,
],

// rbac.policy.js:124
const PLATFORM_ROLES = Object.freeze(['admin', 'accounting', 'manager', 'staff', 'driver']);
```

Because `driver` is in `PLATFORM_ROLES`, the `scopeToOrg` function in `authorize.middleware.js:63` applies **no scoping** to drivers. A driver account can call `GET /api/shipments` and enumerate every shipment across all organizations.

**Fix:** Remove `driver` from `PLATFORM_ROLES`. Add `driver` to `ORG_ROLES` or create a separate `DRIVER_ROLES` tier. Remove `VIEW_ALL_SHIPMENTS` from driver capabilities and replace with a scoped `VIEW_ASSIGNED_SHIPMENTS` capability.

---

### F-10 & F-11 — HIGH: Hard Deletes on Auditable Records

**Files:** [`src/controllers/shipment-crud.controller.js:305–327`](backend/src/controllers/shipment-crud.controller.js), [`src/controllers/user.controller.js:303–316`](backend/src/controllers/user.controller.js)

**Context:** Both `deleteShipment` and `deleteUser` issue hard deletes via Prisma. In a financial logistics system, shipments and users are referenced in ledger entries, payment allocations, and audit history. Cascading deletes would destroy financial records; foreign key constraints may prevent deletion but with no user-facing explanation.

**Fix:**
- Add `deletedAt DateTime?` to the Prisma schema for both models
- Replace `prisma.shipment.delete` / `prisma.user.delete` with `prisma.model.update({ data: { deletedAt: new Date() } })`
- Add `where: { deletedAt: null }` to all list queries

---

### F-12 — MEDIUM: Mass Assignment in `updateAddress`

**File:** [`src/controllers/api.controller.js:394–415`](backend/src/controllers/api.controller.js)

```js
// api.controller.js:404
addresses[index] = { ...addresses[index], ...req.body };
```

No field whitelist — a client can inject arbitrary keys into the stored address JSON, including internal fields used by the carrier normalizer.

**Fix:** Whitelist accepted fields:
```js
const { label, company, contactPerson, phone, email, streetLines,
        city, postalCode, countryCode, state } = req.body;
addresses[index] = { ...addresses[index], label, company, contactPerson,
    phone, email, streetLines, city, postalCode, countryCode, state };
```

---

### F-13 — MEDIUM: No Account Lockout on Login

**File:** [`src/controllers/auth.controller.js:103–141`](backend/src/controllers/auth.controller.js)

The login endpoint has no per-email failed attempt tracking. The rate limiter (20 requests/hour per IP from `server.js:97–102`) is IP-based. An attacker using multiple IPs or a distributed botnet can perform unlimited credential stuffing.

**Fix:** Track failed attempts per email in Redis or a DB table. After 5 failures, impose a 15-minute lockout and log a security event.

---

### F-14 — MEDIUM: No Password Complexity

**File:** [`src/controllers/auth.controller.js:305–309`](backend/src/controllers/auth.controller.js), [`src/controllers/user.controller.js:117–119`](backend/src/controllers/user.controller.js)

Only `length >= 8` is enforced. Given this is a B2B platform handling real financial transactions, password policy should be stronger.

**Fix:** Add regex validation: at least one uppercase, one digit, one special character, 12+ characters minimum.

---

### F-15 — MEDIUM: `updatePublicLocation` Unvalidated Coordinate Types

**File:** [`src/controllers/shipment-public.controller.js:96–106`](backend/src/controllers/shipment-public.controller.js)

```js
if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) ...
```

Values are never checked to be numbers. `["<script>", "injection"]` passes this check and gets stored in the destination JSON field.

**Fix:** Validate both values are finite numbers within lat/lng range:
```js
const [lng, lat] = coordinates;
if (typeof lng !== 'number' || typeof lat !== 'number' ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, error: 'Invalid coordinates' });
}
```

---

### F-16 — MEDIUM: `getLedger` Unbounded Cross-Org Access

**File:** [`src/controllers/finance.controller.js:53–96`](backend/src/controllers/finance.controller.js)

Platform users passing `?orgId=X` can access any organization's ledger. While this is intentional for finance staff, there is no audit log of these cross-org accesses and no validation that `orgId` is a real organization ID.

**Fix:** Log all cross-org ledger queries with `logger.info('Cross-org ledger access', { requestingUser: req.user.id, targetOrg: orgId })`. Validate `orgId` exists in the database before querying.

---

### F-17 — MEDIUM: `getMe` Returns Internal Fields

**File:** [`src/controllers/user.controller.js:157–181`](backend/src/controllers/user.controller.js)

```js
const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { organization: true }
    // ← no select; returns ALL fields
});
```

Depending on Prisma schema, this may return `apiKeyHash`, `password` (bcrypt hash), `agentPolicy` with internal pricing data. Even if `password` is excluded by Prisma defaults, `apiKeyHash` exposure allows offline HMAC reversal attempts.

**Fix:** Use an explicit `select` block that excludes `password`, `apiKeyHash`, and internal-only policy fields.

---

### F-18 — LOW: `requestOtp` Stub Returns 200 OK

**File:** [`src/controllers/auth.controller.js:146–148`](backend/src/controllers/auth.controller.js)

```js
exports.requestOtp = async (req, res) => {
    res.status(200).json({ success: true, message: 'OTP sent via WABA (Mocked)' });
};
```

Any caller receives a success response regardless of whether a real OTP was sent. This could be used as a smoke screen or confuse clients relying on this flow.

**Fix:** Return `501 Not Implemented` or remove the endpoint until implemented.

---

### F-19 — LOW: Aramex Mock in Production Build

**File:** [`src/adapters/AramexAdapter.js`](backend/src/adapters/AramexAdapter.js)

The entire Aramex adapter is a mock that returns `https://example.com/mock-aramex-label.pdf` as the label URL. If any user is assigned `ARAMEX` as their carrier, they will receive fake bookings.

**Fix:** In `CarrierFactory`, block Aramex in production:
```js
if (code === 'ARAMEX' && process.env.NODE_ENV === 'production') {
    throw new Error('Aramex integration not yet available in production');
}
```

---

### F-20 — LOW: CarrierLog Stores PII

**File:** [`src/adapters/DgrAdapter.js:492–502`](backend/src/adapters/DgrAdapter.js)

```js
await prisma.carrierLog.create({
    data: {
        requestPayload: payload,  // ← full DHL payload with names, addresses, phone numbers
        responsePayload: sanitized,
        ...
    }
});
```

Full booking payloads (including shipper/receiver name, address, phone) are persisted. This creates a PII database requiring GDPR-compliant handling (retention limits, encryption at rest).

**Fix:** Scrub PII from `requestPayload` before storage — keep only structural fields (product code, weight, dimensions, country codes). Alternatively, encrypt the field using the existing `fieldEncryption.js`.

---

### F-21 — LOW: DHL Test URL as Default

**File:** [`src/config/config.js:45`](backend/src/config/config.js)

```js
dhlApiUrl: process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi/test',
```

If `DHL_API_URL` is not set, the platform makes live requests to the DHL test environment. This will not process real shipments but will consume DHL test quota and produce misleading results without error.

**Fix:** Default to `null` and throw in `DgrAdapter` constructor if `baseUrl` is not explicitly configured.

---

## Quick Wins (under 30 minutes each)

| Priority | Fix | File | Time |
|---|---|---|---|
| 1 | Remove CORS wildcard reflection — add env validation that `CORS_ORIGIN` is never `*` in production | `config.js`, `server.js` | 10 min |
| 2 | Add `canAccessShipment()` call to `getShipmentByTrackingNumber` | `shipment-crud.controller.js:135` | 5 min |
| 3 | Add `isPlatformRole` guard to `getShipmentStats` org filter | `shipment-crud.controller.js:23` | 5 min |
| 4 | Remove the `console.log('QUOTE DEBUG', ...)` in `api.controller.js:322` | `api.controller.js` | 2 min |
| 5 | Remove JWT default secret fallback | `config.js:36` | 5 min |
| 6 | Remove `carrierConfig` from `updateProfile` allowed fields | `user.controller.js:191` | 5 min |
| 7 | Add HTML escaping helper to `generateLabel` | `shipment-ops.controller.js:65` | 15 min |
| 8 | Remove `driver` from `PLATFORM_ROLES` | `rbac.policy.js:124` | 5 min |
| 9 | Add coordinate type validation in `updatePublicLocation` | `shipment-public.controller.js:104` | 5 min |
| 10 | Add `Content-Security-Policy` header to label endpoint | `shipment-ops.controller.js:81` | 2 min |

---

## Recommended Roadmap

### Sprint 1 — Week 1: Block the Critical Paths
1. **F-01** — Fix CORS: set strict allowlist, fail startup if `CORS_ORIGIN` is not explicitly configured
2. **F-02** — Fix IDOR: add `canAccessShipment` to `getShipmentByTrackingNumber`
3. **F-03** — Fix stats scoping: gate `organizationId` filter behind platform role check
4. **F-05** — Remove JWT fallback secret
5. **F-09** — Remove `driver` from `PLATFORM_ROLES`

### Sprint 2 — Week 2: Fix Data Mutation Vulnerabilities
6. **F-04** — Fix XSS in label HTML generation
7. **F-06** — Lock down `updateProfile` (remove carrierConfig)
8. **F-07** — Remove production debug log in quote controller
9. **F-10 / F-11** — Implement soft delete for shipments and users
10. **F-12** — Whitelist fields in `updateAddress`

### Sprint 3 — Week 3: Harden Auth & Logging
11. **F-13** — Implement login brute-force protection (per-email lockout)
12. **F-14** — Add password complexity requirements
13. **F-08** — Replace disk debug log with structured logger
14. **F-20** — Scrub PII from CarrierLog payloads
15. **F-21** — Add explicit `select` to `getMe` to exclude apiKeyHash

### Sprint 4 — Week 4: Low Severity & Hardening
16. **F-15** — Validate coordinate types in public location update
17. **F-16** — Add audit logging to cross-org finance queries
18. **F-17** — Paginate `getAllUsers`
19. **F-18** — Return `501` from OTP stub or remove
20. **F-19** — Block Aramex in production
21. **F-26** — Remove DHL test URL default
22. **F-27** — Add CSP to label endpoint

---

## Dependency Audit

**Result:** `npm audit` reports **0 known vulnerabilities** as of 2026-04-22.

All packages are current major versions:
- `express@4.18.2` — current stable
- `jsonwebtoken@9.0.3` — current stable
- `bcryptjs@3.0.3` — current stable
- `@prisma/client@6.19.3` — current stable
- `helmet@7.1.0` — current stable
- `express-rate-limit@8.2.1` — current stable

No dependency risk at this time. Recommend scheduling monthly `npm audit` in CI pipeline.

---

## Notes on Strengths

The following security controls are correctly implemented and should be preserved:

- **Prisma ORM** — eliminates raw SQL injection across all data access
- **Constant-time API key comparison** — `crypto.timingSafeEqual` in `security.js:53`
- **Helmet** — security headers enabled globally
- **Error response sanitisation** — stack traces blocked in production via `sendErrorProd`
- **Active user check in `protect`** — deactivated accounts are rejected on each request
- **Idempotency middleware** — per-user key namespacing prevents cross-tenant replay
- **Password hashing** — bcrypt with cost factor 12
- **AES-256-GCM field encryption** — `fieldEncryption.js` is well-implemented
- **Path traversal protection** in `serveDocument` — double-check with `path.resolve` + `startsWith`
- **Production env validation** — required vars checked on startup
