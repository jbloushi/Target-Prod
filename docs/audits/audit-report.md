# Audit Report — Target Logistics Production Readiness

**Date:** 2026-05-02  
**Scope:** Full codebase audit of `backend/` and `frontend/` for production deployment  
**Auditor:** Automated production-readiness review  
**Status:** Pre-deployment

---

## Executive Summary

Target Logistics is a well-structured multi-tenant SaaS platform for shipment operations. The core architecture is sound — proper layering (routes → controllers → services → adapters → ORM), RBAC enforcement, financial precision with Decimal.js, and environment-validated config. However, several HIGH-severity issues must be resolved before the platform handles production traffic: a broken carrier adapter that will crash operations for assigned users, fire-and-forget async patterns creating silent data loss, and insufficient test coverage on the most critical paths.

---

## Architecture Overview

| Layer | Technology | Notes |
|---|---|---|
| API Server | Express 4.18 + Node 20/22 | Single process, PM2 managed |
| Database | MySQL 8.0 via Prisma 6.19 ORM | Multi-tenant, org-scoped |
| Auth | JWT + bcryptjs + HMAC-SHA256 API keys | Roles: staff, admin, driver, accounting, manager, org_manager, org_agent, client |
| Carriers | DHL (active), LogesTechs/DGR (active), Aramex (mock stub), FedEx/UPS (not implemented) | Adapter pattern |
| Frontend | React 18 + Vite 8 + Tailwind + MUI | SPA, served via Nginx |
| Deployment | VPS + aaPanel + PM2 + Nginx OR Docker + GitHub Actions CI | |
| Observability | Winston logger, optional Sentry DSN | Rate limiting, Helmet, CORS |

**Data flow:** `HTTP request → Nginx → Express middleware stack (CORS → Helmet → rate-limit → auth → RBAC) → Controller → Service/Adapter → Prisma → MySQL`

---

## Findings

---

### [HIGH] FedEx adapter is live in CarrierFactory but entirely unimplemented

- **File:** `backend/src/adapters/FedexAdapter.js:70,79,85`
- **Problem:** All three methods — `getRates()`, `createShipment()`, `getTracking()` — throw `"Not Implemented"` errors. If any user is assigned the FedEx carrier in the database, every shipment operation (quote, book, track) will throw a 500 error.
- **Why it matters:** Silent data corruption risk — a booking attempt will fail mid-flow after upstream state may already have changed. Users assigned FedEx have no fallback.
- **Suggested fix:** Either (a) remove FedEx from the CarrierFactory registration until the adapter is implemented, OR (b) implement all three methods. Adding a guard in the factory that rejects FedEx assignment at the user/org level is a safe short-term mitigation.
- **Safe to auto-fix:** No — requires confirming whether FedEx is assigned to any live users before removing.

---

### [HIGH] WebhookDispatcher uses fire-and-forget with no retry — deliveries silently lost

- **File:** `backend/src/services/WebhookDispatcher.js:49-51`
- **Problem:** Webhook HTTP delivery is wrapped in `.catch(err => logger.error(...))` without `await` and without any retry or dead-letter mechanism. If the subscriber endpoint is temporarily unavailable, the delivery is permanently lost with only a log line.
- **Why it matters:** Customers relying on webhooks for shipment status integration will miss events during any downstream downtime. There is no way to replay them.
- **Suggested fix:** Implement exponential backoff retry (3–5 attempts) with a `WebhookDeliveryLog` table. On final failure, mark the subscription as `suspended` so the org is alerted. Bull/BullMQ or a simple Prisma-backed queue is sufficient.
- **Safe to auto-fix:** No — requires schema migration and queue infrastructure decision.

---

### [HIGH] Idempotency lock DB update is unawaited — race condition window

- **File:** `backend/src/middleware/idempotency.middleware.js:57-64`
- **Problem:** The Prisma update that marks an idempotency key as "used" is not awaited. The response is sent while the lock write is still in-flight. A second concurrent request with the same key can pass the idempotency check before the first request's lock is committed.
- **Why it matters:** For financial operations (payment allocations, ledger entries), this can result in duplicate transactions processed under the same idempotency key — the exact failure mode the middleware is designed to prevent.
- **Suggested fix:** Add `await` to the lock update before sending the response, or ensure the lock is written before the handler runs (pre-lock pattern).
- **Safe to auto-fix:** Yes — adding `await` is a single-line change, but should be verified with a concurrent load test.

---

### [MEDIUM] Rate limiting is disabled by default — easy to deploy without it

- **File:** `backend/.env.example`, `backend/src/server.js:86`
- **Problem:** `RATE_LIMIT_ENABLED=false` is the shipped default in `.env.example`. If an operator copies the example file without changing this value, the production server has no rate limiting on auth, public tracking, or the external API.
- **Why it matters:** Auth brute force, credential stuffing, and API abuse have no server-side mitigation. The external client API (30 req/min limit) would be entirely unprotected.
- **Suggested fix:** Change the default in `.env.example` to `RATE_LIMIT_ENABLED=true`. Add a startup warning log if `NODE_ENV=production` and rate limiting is disabled.
- **Safe to auto-fix:** Yes — `.env.example` change only; no logic change.

---

### [MEDIUM] Aramex adapter is a development mock — production registration status unknown

- **File:** `backend/src/adapters/AramexAdapter.js:17,55`
- **Problem:** The Aramex adapter contains artificial `setTimeout` delays and simulated stub responses — characteristics of a development placeholder, not a real integration. It is unclear whether it is registered in CarrierFactory and whether any users are assigned to the Aramex carrier.
- **Why it matters:** If registered and assigned, users would receive fake tracking data and simulated responses instead of real carrier data — a silent data integrity failure invisible to operators.
- **Suggested fix:** Audit CarrierFactory registration and check the database for users with `carrier = 'aramex'`. If no users are assigned, gate the factory registration behind a feature flag or remove it until the real integration is ready.
- **Safe to auto-fix:** No — requires database check before any code change.

---

### [MEDIUM] LogesTechs response normalization is acknowledged as brittle (TODO)

- **File:** `backend/src/adapters/LogesTechsAdapter.js:241`
- **Problem:** A TODO comment explicitly states: `"Provider response schema is not fully documented; keep this mapper conservative."` The normalization logic is written defensively but without a contract to validate against.
- **Why it matters:** Any undocumented schema change from the LogesTechs provider will silently produce malformed shipment data — incorrect statuses, missing tracking events, broken pricing.
- **Suggested fix:** Add response schema validation (Joi or Zod) at the adapter boundary. Log a structured warning with the raw payload when the response doesn't match expected shape. Contact LogesTechs to obtain full API documentation.
- **Safe to auto-fix:** No — requires schema definition work.

---

### [MEDIUM] Test coverage ~40% — critical paths untested

- **File:** `backend/__tests__/` (12 files), `frontend/src/**/*.test.*` (3 files)
- **Problem:** No tests exist for: WebhookDispatcher retry/error paths, idempotency middleware race conditions, FedEx/Aramex adapter behavior, async error propagation across the service layer, or finance ledger edge cases (concurrent payment allocation, credit limit enforcement).
- **Why it matters:** The most risk-prone code (async, financial, external integrations) is the least tested. Regressions in these areas will not be caught by CI.
- **Suggested fix:** Prioritize tests for: (1) idempotency middleware with concurrent requests, (2) finance ledger FIFO allocation, (3) adapter error handling, (4) auth middleware edge cases. Target 80% coverage on `services/` and `middleware/`.
- **Safe to auto-fix:** No — requires test authoring.

---

### [MEDIUM] Duplicate address normalization logic — divergence risk

- **Files:** `backend/src/adapters/LogesTechsAdapter.js` (`_toAddressPayload()`), `backend/src/services/address.service.js` (`normalizeForDhl()`, `normalizeContactForDhl()`)
- **Problem:** Two separate address normalization implementations exist for similar data structures. They may diverge over time as one is updated without the other.
- **Why it matters:** Address format bugs (truncation, field mapping errors) cause carrier API rejections. Having two implementations doubles the surface area for these bugs.
- **Suggested fix:** Extract a shared `AddressNormalizer` utility in `backend/src/utils/` with carrier-specific formatters, used by both adapters.
- **Safe to auto-fix:** No — refactor requires verifying both implementations produce identical output before consolidating.

---

### [LOW] Mixed async patterns in middleware and services

- **Files:** `backend/src/middleware/idempotency.middleware.js`, `backend/src/services/WebhookDispatcher.js`
- **Problem:** These files mix `.then()/.catch()` promise chains with `async/await` patterns used everywhere else in the codebase. The idempotency middleware's unawaited call is a direct consequence of this inconsistency.
- **Why it matters:** Mixed patterns make control flow harder to reason about and make it easy to accidentally omit `await`, as happened in the idempotency bug above.
- **Suggested fix:** Standardize all service/middleware code on `async/await` with `try/catch`. ESLint rule `no-floating-promises` can catch unawaited calls.
- **Safe to auto-fix:** No — requires careful refactoring with test coverage.

---

### [LOW] Docker CI only validates build — no integration test

- **File:** `.github/workflows/docker-ci.yml`
- **Problem:** The Docker CI workflow builds the image and runs a health check (`GET /health`), but does not spin up a database or run any integration tests against a real environment.
- **Why it matters:** A broken migration or misconfigured Prisma schema would pass CI and only fail on the first production deployment.
- **Suggested fix:** Add a `docker-compose.test.yml` with a MySQL service and run `npm test` inside the container after health check passes. GitHub Actions supports service containers natively.
- **Safe to auto-fix:** No — requires CI workflow authoring.

---

### [MEDIUM] Chatwoot/WhatsApp notifications: Meta delivery status unconfirmed

- **File:** `backend/src/services/chatwootNotificationService.js`
- **Problem:** The Chatwoot WhatsApp notification integration is fully built and wired at four trigger points. However, the log status `submitted` only means Chatwoot accepted the API call — it does not confirm Meta/WhatsApp delivered the message to the recipient device. The UI displays `SUBMITTED` to operators, which can be misread as confirmed delivery.
- **Why it matters:** Operations staff may assume a customer received an out-for-delivery or exception notification when it was never delivered. No `delivered`, `read`, or `failed` status is captured.
- **Suggested fix:** Implement a Meta webhook handler at `POST /api/integrations/chatwoot/webhook/meta-status`. Store the `wamid` from Chatwoot's send response. Update `ShipmentNotificationLog.status` to `sent → delivered / read / failed` as Meta callbacks arrive.
- **Safe to auto-fix:** No — requires new route, handler, and schema migration for `wamid` field.

---

### [MEDIUM] Chatwoot/WhatsApp: Five templates PENDING Meta approval — plain-text only window

- **File:** `backend/src/services/chatwootNotificationService.js`, `CHATWOOT_TEMPLATE_CONFIG` env var
- **Problem:** All five WhatsApp message templates (`target_shipment_created`, `target_documents_needed`, `target_customs_hold`, `target_delivery_attempt`, `target_out_for_delivery`) have been submitted to Meta but are PENDING review. Until approved, the system falls back to plain-text messages only. Plain-text WhatsApp messages can only be sent within Meta's 24-hour customer service window (the recipient must have messaged the business number first). Shipment created and proactive status notifications sent outside this window will not be delivered.
- **Why it matters:** Most proactive operational notifications (shipment created, customs hold, delivery attempt) are sent to customers who have not messaged the business inbox — they are outside the 24-hour window. These messages will silently fail or not be delivered until templates are approved.
- **Suggested fix:** Monitor Meta Business Manager for template approval status. Once approved, set `CHATWOOT_TEMPLATE_CONFIG` with the five template definitions. No code change required — the service already supports templates. Consider setting `CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK=false` after templates are approved to prevent unintended plain-text sends outside the window.
- **Safe to auto-fix:** No — requires Meta approval and env var update.

---

## Deployment Risks Summary

| Risk | Impact | Likelihood |
|---|---|---|
| FedEx users getting 500 errors | HIGH | Medium (depends on DB state) |
| Webhook events permanently lost | HIGH | High (any transient downstream outage) |
| Rate limiting not enabled in prod | HIGH | Medium (operator config error) |
| Duplicate financial transactions via idempotency race | HIGH | Low (requires concurrent identical requests) |
| WhatsApp notifications sent but not confirmed delivered | MEDIUM | High (until Meta webhook handler built) |
| WhatsApp proactive notifications fail outside 24-hour window | MEDIUM | High (until templates approved) |
| Aramex mock data served to real users | MEDIUM | Low (depends on assignment) |
| LogesTechs schema change breaking normalization | MEDIUM | Low-Medium (undocumented API) |
| Migration failure not caught by CI | MEDIUM | Low |

---

## Recommended Pre-Launch Checklist

- [ ] Confirm FedEx is not assigned to any live users OR remove from CarrierFactory
- [ ] Confirm Aramex is not assigned to any live users OR gate behind feature flag
- [ ] Add `await` to idempotency lock write
- [ ] Set `RATE_LIMIT_ENABLED=true` as default in `.env.example`
- [ ] Implement basic webhook retry (3 attempts, exponential backoff)
- [ ] Run `npm audit` in both workspaces and address HIGH severity advisories
- [ ] Verify `CORS_ORIGIN` is set to production domain (not wildcard)
- [ ] Verify `NODE_ENV=production` in deployment environment
- [ ] Run all migrations with `npm run db:migrate:deploy` before starting server
- [ ] Confirm Sentry DSN is configured for production error tracking
- [ ] Monitor Meta Business Manager for WhatsApp template approval (5 templates pending)
- [ ] Once templates approved: update `CHATWOOT_TEMPLATE_CONFIG` env var with all 5 template definitions
- [ ] Implement Meta webhook status endpoint (`POST /api/integrations/chatwoot/webhook/meta-status`) to capture delivered/read/failed
