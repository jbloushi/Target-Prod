# 3P Logistics Production Readiness Audit & Gap Analysis (2026-02-12)

## Executive Summary

Current system is **functionally close to production**, but key gaps block reliability and scalability:

1. **Performance bottlenecks in quote flow** (frequent API calls during form entry).
2. **Hardcoded carrier payload values** (account fallback values, auto-appended item text, static rates/services).
3. **Payload truncation rules** that cut invoice/package content before it reaches the carrier.
4. **Carrier optional services are mocked** in adapter fallback instead of fetched from DHL API, creating trust gaps.
5. **Missing production controls** (rate limiting, SLO monitoring, worker queue isolation, test coverage for real carrier behavior).

---

## Scope Covered

- Backend carrier adapter and payload builder paths.
- Shipment quote and booking workflow.
- Frontend wizard quote-refresh behavior.
- Existing test and architecture hints in repo.

---

## Findings & Gaps

## 1) Performance / Latency Gaps

### P1. Quote API is called too often while user types
- `ShipmentWizardV2` quote effect watched full sender/receiver/parcels/items objects; every edit can trigger quote call.
- This creates high backend load and perceived UI slowness.

**Mitigation implemented now**
- Added debounce (600ms).
- Added minimum input gating (sender/receiver city+country+postal and at least 1 parcel) before calling quote API.

**Next production step**
- Add backend response caching by deterministic request hash for short TTL (30-120s).
- Add request collapsing for identical in-flight quote payloads.

### P2. Adapter still uses static fallback rates
- `DgrAdapter.getRates()` currently returns temporary static rates and optional services.
- This can hide real carrier latency profile and service availability.

**Production gap**
- Implement real DHL rates endpoint integration with timeout, retry, and circuit breaker strategy.

---

## 2) Carrier Payload Correctness Gaps

### C1. Hardcoded text in commercial invoice item description
- For DG code `8000`, builder appended `Consumer commodity (ID8000)` directly to item descriptions.
- This was hardcoded and not user-controlled.

**Mitigation implemented now**
- Removed forced append for ID8000 so user-provided description remains authoritative.

### C2. Content being cut off before carrier API
- Item description was forcibly clamped to 75 chars.
- Package description was clamped to 70 chars.

This explains why long text such as:
`Contents: Perfume creed 100ml / 2package DANGEROUS GOODS AS PER ASSOCIATED DGD`
arrives truncated in API payload even if platform UI allows more.

**Mitigation implemented now**
- Raised description clamp thresholds to 250 chars for line item/package descriptions.

**Production recommendation**
- Replace magic numbers with carrier-specific schema limits loaded from config.
- Validate and warn in UI before submit when text exceeds the actual carrier max.

### C3. Hardcoded account fallback in shipment payload
- Builder uses fallback account number `'451012315'` if account is missing.

**Production gap**
- Remove hardcoded account fallback from runtime payload generation.
- Fail fast if account is missing in environment or customer profile.

---

## 3) Optional Services Gap

### O1. Optional services not sourced from live carrier capability/rate response
- Adapter injects static optional services (`II`, `WY`, `NN`) in fallback quotes.
- If upstream/selected service does not map, UI may show none or misleading choices.

**Root causes likely for “Optional services show nothing”**
1. No live DHL optional-service discovery implementation.
2. Quote selection logic picks one service (prefers `P`) and only uses that service’s optional list.
3. If quote payload invalid/incomplete during typing, quote response may not return expected service entries.

**Mitigation implemented now**
- Reduced noisy quote calls; this improves quote stability and optional-service display timing.

**Production recommendation**
- Build optional services from live DHL rate response by product code.
- Persist optional service catalog by country lane/product with TTL cache.
- Add API contract tests asserting optional service presence and structure.

---

## 4) Production Readiness Checklist (High Priority)

### Reliability
- [ ] Add global request timeout/retry policy for outbound carrier calls.
- [ ] Add queue-based asynchronous booking path with idempotency keys.
- [ ] Add dead-letter handling for failed carrier bookings.

### Observability
- [ ] Add distributed trace IDs from frontend → backend → carrier log.
- [ ] Add RED metrics (Rate, Errors, Duration) for `/quotes` and `/shipments/create`.
- [ ] Add p95/p99 dashboards + alerting thresholds.

### Security & Compliance
- [ ] Remove hardcoded operational defaults from payload logic.
- [ ] Add secrets validation on startup (fail boot on missing critical secrets).
- [ ] Add payload PII masking in logs and secure retention policy.

### Testing
- [ ] Add contract tests for payload max lengths per carrier field.
- [ ] Add integration tests against DHL sandbox for optional services and DG edge cases.
- [ ] Add performance smoke test for quote endpoint under concurrent editing simulation.

### Data & Domain Quality
- [ ] Replace hardcoded currency defaults with account/lane configuration.
- [ ] Store carrier capability matrix by route/product.
- [ ] Add server-side validation error taxonomy (user error vs carrier restriction vs transient provider issue).

---

## Hardcoded Carrier Payloads / Fallbacks Inventory

1. **DG item auto-description text for ID8000** (removed in this change).
2. **Item description truncation to 75 chars** (raised to 250 in this change).
3. **Package description truncation to 70 chars** (raised to 250 in this change).
4. **Default shipper account fallback `451012315`**.
5. **Default product code fallback `P`**.
6. **Fallback static rates and optional services in `DgrAdapter.getRates()`**.

---

## Recommended Delivery Plan

### Phase 1 (1-2 days)
- Ship current fixes (debounce + truncation + remove ID8000 append).
- Add telemetry around quote call count per session.

### Phase 2 (3-5 days)
- Implement live DHL rates optional-service extraction.
- Replace hardcoded account fallback with strict configuration policy.
- Add contract tests for payload field lengths and DG mapping.

### Phase 3 (1-2 weeks)
- Add queue/idempotent booking architecture.
- Add SLO dashboards and alerting.
- Run load tests and optimize DB indexes for shipment/quote paths.

