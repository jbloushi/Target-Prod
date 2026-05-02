# Dead Code Report — Target Logistics Production Readiness

**Date:** 2026-05-02  
**Scope:** Unused files, ghost code, duplicates, vibe-coding inconsistencies, debug artifacts  
**Auditor:** Automated dead code review  
**Status:** Pre-deployment

---

## Executive Summary

Repository hygiene is generally good — no `.bak`/`.old`/`.copy` backup files, no orphaned migration scripts, and no committed secrets. The main concerns are a completely unimplemented adapter that should be treated as dead code until built, a development mock masquerading as a real integration, debug logging artifacts left in production controllers, and duplicate normalization logic that will diverge over time. Vibe-coding inconsistencies are limited to async pattern mixing in a small set of files.

---

## Findings

---

### [HIGH] `FedexAdapter.js` is entirely dead code — all methods throw "Not Implemented"

- **File:** `backend/src/adapters/FedexAdapter.js:70,79,85`
- **Problem:** The entire FedEx adapter class exists in the codebase with three methods:
  - `getRates()` → `throw new Error("FedEx getRates: Not Implemented")`
  - `createShipment()` → `throw new Error("FedEx createShipment: Not Implemented")`
  - `getTracking()` → `throw new Error("FedEx getTracking: Not Implemented")`
  None of these methods have any implementation. The file is structural scaffolding, not working code.
- **Why it matters:** If FedEx is registered in `CarrierFactory` and assigned to any user or organization, every shipment operation for that carrier will throw a 500 error. This is indistinguishable from a real system failure in production. The presence of this file implies FedEx is a supported carrier to anyone reading the codebase, which is misleading.
- **Suggested fix:** Either (a) remove `FedexAdapter.js` and its CarrierFactory registration entirely, or (b) keep the file but add a guard in CarrierFactory that prevents FedEx from being assigned until the adapter is implemented. Add a prominent `// NOT_FOR_PRODUCTION` comment at the top of the file if keeping it for future reference.
- **Safe to auto-fix:** No — requires confirming FedEx is not assigned to any users in the database before removing.

---

### [MEDIUM] `AramexAdapter.js` is a development mock — should not be in the production adapter directory

- **File:** `backend/src/adapters/AramexAdapter.js:17,55`
- **Problem:** The Aramex adapter contains:
  - `console.log()` debug statements
  - Simulated delays (`setTimeout`, artificial latency)
  - Hardcoded stub responses that simulate success regardless of input
  These are unmistakable characteristics of a development placeholder, not a real carrier integration.
- **Why it matters:** If this adapter is registered in CarrierFactory and a user is assigned the Aramex carrier, they will receive fake success responses and fabricated tracking data. This silent fake-success failure is more dangerous than a thrown error because it is invisible in monitoring.
- **Suggested fix:** Move `AramexAdapter.js` to `backend/__tests__/fixtures/` or `backend/src/adapters/__mocks__/` where mock implementations belong. Remove it from the production adapter directory and CarrierFactory until the real Aramex integration is built.
- **Safe to auto-fix:** No — requires confirming no users are assigned to Aramex carrier before removing.

---

### [MEDIUM] `QUOTE DEBUG` console.log block is dead debug code left in production controller

- **File:** `backend/src/controllers/api.controller.js:325-334`
- **Problem:** A `console.log('QUOTE DEBUG', { userId, orgInfo, carrierConfig, agentPolicy })` block was added during development and never removed. It executes on every external API quote request in production.
- **Why it matters:** Beyond the security implication (see security report), this is dead instrumentation code — it serves no production purpose and adds noise to every quote call. Its presence in a production controller alongside real logic indicates it was added during debugging and forgotten.
- **Suggested fix:** Delete the entire `console.log('QUOTE DEBUG', ...)` block. If the logged context is needed for future debugging, convert it to `logger.debug(...)` so it only activates when `LOG_LEVEL=debug`.
- **Safe to auto-fix:** Yes — the block is pure side-effect logging with no control flow dependency.

---

### [MEDIUM] Duplicate address normalization logic — two implementations for the same data

- **Files:**
  - `backend/src/adapters/LogesTechsAdapter.js` → `_toAddressPayload()` (private method)
  - `backend/src/services/address.service.js` → `normalizeForDhl()`, `normalizeContactForDhl()`
- **Problem:** Two separate address normalization implementations exist for structurally similar shipment address data. Each normalizes the same domain object (origin/destination address) into a carrier-specific format, but they live in different files and are not aware of each other.
- **Why it matters:** When address requirements change (new field, format correction, country-code normalization), the change must be made in two places. A bug fixed in one will silently persist in the other. This type of divergence is a common source of carrier-specific address rejection errors that are hard to debug.
- **Suggested fix:** Extract a shared `AddressFormatter` utility in `backend/src/utils/addressFormatter.js` with carrier-specific formatters as named exports (`formatForLogesTechs(address)`, `formatForDhl(address)`). Both the adapter and the service import from this shared utility.
- **Safe to auto-fix:** No — consolidation requires verifying both implementations produce identical output for the same input before switching.

---

### [MEDIUM] Commented-out fallback line — ghost of removed debug code

- **File:** `backend/src/services/address.service.js:100-102`
- **Problem:** A commented-out line near line 100-102 with a `// DEBUG: Return error details` comment indicates a debugging block was partially removed. The comment remains, creating ambiguity about whether the commented code was intentionally disabled or accidentally left.
- **Why it matters:** Commented-out code is dead weight that misleads future readers. The `// DEBUG` comment specifically implies the line was only removed from active execution, not deleted, which suggests it may be uncommented again — potentially re-introducing debug behavior into production.
- **Suggested fix:** Delete the commented-out line and its `// DEBUG:` comment entirely. If the behavior needs to return, it should be added through a proper code path with a log level guard, not a commented block.
- **Safe to auto-fix:** Yes — removing commented code has no functional impact.

---

### [LOW] Async pattern inconsistency in middleware and services (vibe-coding artifact)

- **Files:** `backend/src/middleware/idempotency.middleware.js`, `backend/src/services/WebhookDispatcher.js`
- **Problem:** These two files use `.then()/.catch()` promise chains, inconsistent with the `async/await` + `try/catch` pattern used throughout all other controllers, services, and adapters. This inconsistency is a hallmark of code written in different sessions without a style enforcer.
- **Why it matters:** The async inconsistency in `idempotency.middleware.js` directly caused the unawaited DB write bug (see audit report). Mixed patterns make control flow harder to reason about and make code review less effective.
- **Suggested fix:** Add ESLint rule `@typescript-eslint/no-floating-promises` (or `no-floating-promises` for JS) to catch unawaited async calls. Refactor the two files to use `async/await` with `try/catch` to match the rest of the codebase.
- **Safe to auto-fix:** No — requires careful refactoring with test coverage to confirm behavior is preserved.

---

### [LOW] `[DEBUG]` log calls in route files — noise in production log stream

- **File:** `backend/src/routes/shipment.routes.js:22,47-48,53`
- **Problem:** Route files contain `logger.info('[DEBUG] ...')` calls that fire at the `info` level on every matched request. These were clearly added during development for tracing and not cleaned up.
- **Why it matters:** At `LOG_LEVEL=info` (production default), these lines output on every request and pollute the structured log stream. Log storage costs scale with volume; signal-to-noise ratio for real warnings is reduced.
- **Suggested fix:** Change `logger.info('[DEBUG]...')` to `logger.debug(...)`. This requires a one-character change per call and has no functional impact — `debug` messages are suppressed at `LOG_LEVEL=info`.
- **Safe to auto-fix:** Yes — changing log level from `info` to `debug` is a safe, targeted change.

---

### [LOW] Naming convention inconsistency in adapter directory

- **File:** `backend/src/adapters/`
- **Problem:** The four adapter files use three different naming conventions:
  - `DgrAdapter.js` — abbreviated internal name
  - `LogesTechsAdapter.js` — full provider name
  - `FedexAdapter.js` — brand name (consumer-facing)
  - `AramexAdapter.js` — brand name
  There is no consistent rule: is the file named by abbreviation, full provider name, or brand?
- **Why it matters:** Low-severity — this is a readability and onboarding issue. A new developer adding a carrier adapter won't know which convention to follow.
- **Suggested fix:** Establish a convention: use the official brand name consistently (`DhlAdapter.js`, `LogesTechsAdapter.js`, `AramexAdapter.js`, `FedexAdapter.js`, `UpsAdapter.js`). Rename `DgrAdapter.js` to `DhlAdapter.js` in a single rename commit (DGR appears to refer to DHL's internal system name).
- **Safe to auto-fix:** No — renaming `DgrAdapter.js` requires updating all import references throughout the codebase.

---

## Repository Hygiene Summary

| Check | Status |
|---|---|
| Backup files (`.bak`, `.old`, `.copy`) | None found — clean |
| Debug scripts in production paths | None found |
| Committed `.env` files | Not committed — gitignore enforced |
| Orphaned migration files | None detected |
| `TODO`/`FIXME` comments | 4 found (FedexAdapter ×3, LogesTechsAdapter ×1) |
| `console.log` in production code | 4 locations (api.controller, AramexAdapter ×2, DgrAdapter ×2) |
| Commented-out code blocks | 1 location (address.service.js) |
| Unused imports | Not systematically checked — run `eslint --rule no-unused-vars` |
| Ghost/unreferenced files | FedexAdapter (functionally dead), AramexAdapter (mock) |
| Duplicate logic | Address normalization in 2 locations |

---

## Quick Wins (Safe to auto-fix immediately)

These changes carry no risk and can be made in a single cleanup commit:

1. Delete `console.log('QUOTE DEBUG', ...)` block — `api.controller.js:325-334`
2. Remove `console.log()` statements from `AramexAdapter.js:17,55`
3. Replace `console.error()` with `logger.error()` in `DgrAdapter.js:644,716`
4. Change `logger.info('[DEBUG]...')` → `logger.debug(...)` in `shipment.routes.js:22,47-48,53`
5. Delete commented-out debug line in `address.service.js:100-102`
6. Change `RATE_LIMIT_ENABLED=false` → `RATE_LIMIT_ENABLED=true` in `.env.example`
