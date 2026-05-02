# Security Report — Target Logistics Production Readiness

**Date:** 2026-05-02  
**Scope:** Authentication, authorization, input handling, secrets management, transport security, information disclosure  
**Auditor:** Automated security review  
**Status:** Pre-deployment

---

## Executive Summary

The codebase demonstrates strong security fundamentals: Prisma ORM eliminates SQL injection, JWT + bcrypt + HMAC-SHA256 are used correctly, Helmet headers are applied, RBAC is consistently enforced, and production error messages are sanitized. However, three HIGH-severity issues require immediate attention before production deployment: CORS defaults to wildcard, debug logging leaks sensitive org/user data to stdout, and the JWT dev secret can slip into production if `NODE_ENV` is not set correctly.

---

## Authentication & Authorization

**Overall: Solid**

- JWT signed with `jsonwebtoken` v9, secret validated to 64+ chars in production mode
- Passwords hashed with `bcryptjs`
- API keys stored as HMAC-SHA256 hashes; comparison uses constant-time algorithm to prevent timing attacks
- `protect` middleware enforces active user status on every authenticated route
- RBAC capabilities are checked per-route via `authorize.middleware.js`; platform-level roles bypass org scoping correctly
- External client API protected by `validateApiKey` middleware on all `/api/v1` routes
- IDOR protection confirmed: shipment access checks `userId` or `organizationId` before returning records

---

## Findings

---

### [HIGH] CORS defaults to wildcard `*` when env var is missing

- **File:** `backend/src/server.js:44-76`
- **Problem:** `corsOrigin: process.env.CORS_ORIGIN || '*'` — if the environment variable is not set, CORS allows any origin. The code also reflects the incoming `Origin` header back to support credentials, which combined with wildcard effectively grants any site full credentialed API access.
- **Why it matters:** Any website can make authenticated requests to the API using a victim's session cookies or tokens. This is a classic CSRF amplification via CORS misconfiguration.
- **Suggested fix:** Remove the `|| '*'` fallback entirely. Add a startup assertion: if `NODE_ENV=production` and `CORS_ORIGIN` is not set, refuse to start. Acceptable values should be explicit domains: `https://app.yourdomain.com`.
- **Safe to auto-fix:** Yes for the assertion — removing the wildcard fallback is a safe, targeted change. Requires ensuring `CORS_ORIGIN` is set in all deployment environments first.

---

### [HIGH] `QUOTE DEBUG` console.log leaks sensitive user and org data to stdout

- **File:** `backend/src/controllers/api.controller.js:325-334`
- **Problem:** `console.log('QUOTE DEBUG', { userId, orgInfo, carrierConfig, agentPolicy })` is present in the production controller. This outputs user IDs, organization configuration, carrier credentials context, and agent policy details to the process stdout on every quote request.
- **Why it matters:** In production, stdout is typically captured by PM2, system logs, or centralized logging pipelines (Datadog, CloudWatch, etc.). This log line means sensitive multi-tenant data (org identifiers, carrier configs) is written to log storage with every quote API call — a data leakage and compliance risk (GDPR, PCI-DSS depending on carrier data).
- **Suggested fix:** Remove the entire `console.log('QUOTE DEBUG', ...)` block immediately. If the debug context is needed, gate it: `if (process.env.LOG_LEVEL === 'debug') logger.debug('quote context', { ... })` — and ensure `LOG_LEVEL` is never `debug` in production.
- **Safe to auto-fix:** Yes — delete the debug log block. No logic depends on it.

---

### [HIGH] Debug console.log statements in AramexAdapter committed to production codebase

- **File:** `backend/src/adapters/AramexAdapter.js:17,55`
- **Problem:** `console.log()` calls are present at lines 17 and 55, logging adapter state during simulated operations.
- **Why it matters:** If the Aramex adapter is activated (registered in CarrierFactory with live users), these statements pollute production logs and may expose internal adapter state or request data. Even if Aramex is not currently active, shipping debug instrumentation in production code is a security anti-pattern.
- **Suggested fix:** Remove all `console.log()` statements from adapter files. Use the Winston `logger` module exclusively, gated behind `logger.debug()` for verbose tracing.
- **Safe to auto-fix:** Yes — removing console statements from a mock adapter has no functional impact.

---

### [MEDIUM] DgrAdapter uses `console.error()` instead of logger — bypasses centralized monitoring

- **File:** `backend/src/adapters/DgrAdapter.js:644,716`
- **Problem:** `.catch(e => console.error('CarrierLog Save Failed:', e.message))` bypasses the Winston logger. These error events will not appear in structured log output, will not trigger any log-level filtering, and will not be captured by Sentry or other error monitoring integrations.
- **Why it matters:** Carrier log save failures are a sign of database problems or schema issues. If they go to `console.error` instead of the structured logger, on-call engineers will miss the signal.
- **Suggested fix:** Replace `console.error(...)` with `logger.error('CarrierLog save failed', { error: e.message })` using the project's Winston logger.
- **Safe to auto-fix:** Yes — mechanical replacement with no logic change.

---

### [MEDIUM] PDF uploads lack server-side content validation (magic bytes)

- **File:** `backend/src/utils/documentStorage.js:29`
- **Problem:** The upload handler accepts a base64-encoded payload and writes it to disk after stripping the `data:application/pdf;base64,` MIME prefix. No server-side validation confirms the decoded bytes are actually a valid PDF (magic bytes: `%PDF-`).
- **Why it matters:** An attacker could upload a disguised executable, HTML file, or SVG (potential stored XSS) by sending a non-PDF payload with the PDF MIME prefix. Since files are served back from `/uploads/documents/`, a stored HTML file could execute in a victim's browser.
- **Suggested fix:** After base64 decoding, check the first 4 bytes for the PDF magic signature (`0x25 0x50 0x44 0x46` = `%PDF`). Reject any file that fails this check with a 400 error. Consider also adding `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` to file serving responses.
- **Safe to auto-fix:** No — requires adding validation logic and confirming existing uploads are unaffected.

---

### [MEDIUM] JWT dev default secret can slip into production if NODE_ENV is not set

- **File:** `backend/src/config/config.js:36`
- **Problem:** `jwtSecret` defaults to `'dev-secret-key-change-in-production'`. The length validation (64+ chars) only runs in production mode. If `NODE_ENV` is missing or misspelled in the deployment environment, the server starts with the well-known dev secret — all JWTs become forgeable.
- **Why it matters:** An attacker who knows the default secret (it's in the public repo) can mint valid JWTs for any user ID, bypassing authentication entirely.
- **Suggested fix:** Add a startup assertion independent of `NODE_ENV`: if `JWT_SECRET === 'dev-secret-key-change-in-production'`, refuse to start and print a clear error. The check should not be conditional on environment.
- **Safe to auto-fix:** Yes — adding an unconditional guard is a safe, targeted change.

---

### [MEDIUM] Rate limiting is opt-in — can be deployed to production without it

- **File:** `backend/src/server.js:86`, `backend/.env.example`
- **Problem:** `RATE_LIMIT_ENABLED=false` is the default in `.env.example`. The rate limiter is entirely bypassed if this env var is absent or false.
- **Why it matters:** Without rate limiting: auth endpoints are open to brute force and credential stuffing; the public tracking endpoint can be scraped; the external API has no per-key throttle. The current tiered limits (100/15min global, 20/hr auth, 30/min API key) are well designed but only effective if enabled.
- **Suggested fix:** Flip the default to `RATE_LIMIT_ENABLED=true`. Add a `NODE_ENV=production` startup warning if rate limiting is disabled. This is a configuration change, not a code change.
- **Safe to auto-fix:** Yes — `.env.example` change only.

---

### [LOW] `[DEBUG]` log statements in production route files pollute log stream

- **File:** `backend/src/routes/shipment.routes.js:22,47-48,53`
- **Problem:** Route files contain `logger.info('[DEBUG] ...')` calls that fire on every request match. These are not gated behind a log level check.
- **Why it matters:** At `LOG_LEVEL=info` (the production default), these statements output on every request, polluting structured logs with noise that makes real warnings harder to find. Log ingestion costs scale with volume.
- **Suggested fix:** Change `logger.info('[DEBUG]...')` to `logger.debug(...)`. With `LOG_LEVEL=info` in production, debug messages are suppressed without code changes.
- **Safe to auto-fix:** Yes — changing log level from `info` to `debug` has no functional impact.

---

### [LOW] Google Maps API key is exposed in frontend bundle — needs GCP referrer restriction

- **File:** `frontend/.env.example` (key referenced as `VITE_GOOGLE_MAPS_API_KEY`)
- **Problem:** The Google Maps API key is embedded in the compiled frontend bundle and visible to anyone who inspects the JavaScript. This is expected for browser-based Maps usage, but the key must be restricted to the production domain in the GCP console.
- **Why it matters:** An unrestricted key can be used by any domain to make Maps API calls billed to this account. This is a billing/abuse risk, not a data risk.
- **Suggested fix:** In GCP Console → APIs & Services → Credentials, restrict the key to `HTTP referrers` matching only the production domain (`https://app.yourdomain.com/*`). Create a separate unrestricted key for local development.
- **Safe to auto-fix:** No — requires GCP Console configuration, not a code change.

---

### [LOW] No explicit Content-Security-Policy header configured

- **File:** `backend/src/server.js`
- **Problem:** Helmet is applied (good), but no explicit CSP is configured — Helmet's default CSP is minimal and may not match the application's actual resource origins (Google Maps, Mapbox, MUI fonts, CDN assets).
- **Why it matters:** Without a restrictive CSP, any injected script (e.g., via a future XSS or dependency compromise) can load external resources or exfiltrate data. The MUI + Google Maps + Mapbox stack requires a carefully crafted CSP that won't break functionality.
- **Suggested fix:** Define an explicit `contentSecurityPolicy` config in Helmet with `script-src`, `style-src`, `connect-src`, and `img-src` matching the actual front-end resource origins. Start in report-only mode (`Content-Security-Policy-Report-Only`) to collect violations before enforcing.
- **Safe to auto-fix:** No — requires testing that CSP does not break Maps, MUI, or Mapbox rendering.

---

## Security Posture Summary

| Category | Status | Risk |
|---|---|---|
| SQL Injection | Secure — Prisma ORM parameterized queries | None |
| XSS | Secure — React JSX, no dangerouslySetInnerHTML | None |
| Authentication | Secure — JWT + bcrypt + constant-time API key compare | None |
| Authorization / RBAC | Secure — enforced per-route, IDOR checks present | None |
| Input Validation | Secure — express-validator on all routes | None |
| CORS | **RISK** — wildcard default, no fallback guard | HIGH |
| Secrets Management | Secure — .env excluded from git, prod validation | None |
| JWT Secret | **RISK** — dev default can reach prod if NODE_ENV unset | MEDIUM |
| Rate Limiting | **RISK** — disabled by default | MEDIUM |
| Error Disclosure | Secure — stack traces suppressed in production | None |
| File Uploads | Partial — MIME prefix checked, magic bytes not validated | MEDIUM |
| Debug Logging | **RISK** — sensitive data in console.log on quote requests | HIGH |
| CSP | Missing explicit policy | LOW |
| Dependencies | Current versions — run `npm audit` before deploy | LOW |
