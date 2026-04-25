# Shipment Editing Audit Report

**Date:** 2026-04-25  
**Scope:** Shipment edit workflows (wizard edit route, details drawer edits, backend patch/update behavior, and contract alignment)

---

## 1) Executive Summary

Shipment editing is currently implemented through **two separate UI paths**:
1. Full-page wizard on `/shipment/:trackingNumber/edit`.
2. In-page section drawer edit inside Shipment Details.

The audit found high-risk contract and behavior mismatches between frontend and backend that likely explain “editing issues,” including:
- Wizard edit mode does not load existing shipment state before submit.
- Wizard submit payload uses `sender`/`receiver` + many billing fields that backend patch endpoint does not accept.
- Backend patch accepts only a narrow field set, silently dropping several UI-sent edit fields.
- Re-rating triggers rely on field shapes (`origin/destination`, parcel `dimensions`) that do not match current frontend payload shape (`sender/receiver`, `length/width/height`).

**Overall risk posture:** **High** (data loss/ignored updates, inconsistent pricing behavior, user confusion, and operational rework).

---

## 2) Current-State Architecture (Edit Path)

### Frontend edit entry points
- Route exposes full wizard edit path `/shipment/:trackingNumber/edit` mapped to `ShipmentWizardV2`.  
- Details page also supports section-level edit drawer and saves through `updateShipmentDetails`.

### Backend edit endpoint
- Edit API is `PATCH /api/shipments/:trackingNumber`.
- Controller filters updates by an allowlist and persists only accepted fields.

### Important model context
- Shipment canonical address blobs are stored as `origin` and `destination` JSON in DB (not `sender`/`receiver`).

---

## 3) Gap Analysis (Observed vs Expected)

## Gap 1 — Wizard edit mode does not hydrate existing shipment

**Observed**
- `ShipmentWizardV2` derives `isEditMode` from URL param, but has no shipment-fetch/hydration path to prefill state with existing shipment data.

**Expected**
- Edit mode should fetch shipment by tracking number, normalize fields, and pre-populate all wizard steps before save.

**Impact**
- Users entering edit route may submit defaults/partial state, risking overwrites and missing required business context.

**Severity**: Critical

---

## Gap 2 — Wizard edit payload contract mismatch with backend allowlist

**Observed**
- Wizard submit uses `sender`, `receiver`, and many billing-related keys (`exportReason`, `shipperAccount`, `labelSettings`, `optionalServiceCodes`, etc.).
- Backend patch allowlist accepts mainly `origin`, `destination`, `items`, `parcels`, `incoterm`, `currency`, `dangerousGoods`, `serviceCode`, `status`, `allowPublicLocationUpdate`.

**Expected**
- A versioned edit contract where frontend payload fields map 1:1 to fields backend accepts and persists.

**Impact**
- Silent no-op updates (UI says edited, backend ignores fields), inconsistent user trust, and follow-up support load.

**Severity**: Critical

---

## Gap 3 — Billing/storage shape drift between create and update

**Observed**
- Create flow writes many operational billing fields into `origin` JSON (`shipperAccount`, `payerOfVat`, `labelSettings`, `dangerousGoods`, etc.).
- Update flow does not map most of those fields back into `origin`/`destination` persisted structures.

**Expected**
- A canonical schema contract for billing/label/customs fields with consistent create/update mapping.

**Impact**
- “Editable” billing fields may not persist across lifecycle; data appears to revert or partially save.

**Severity**: High

---

## Gap 4 — Re-rating detection is structurally misaligned with frontend parcel/address shape

**Observed**
- Critical-change detector checks parcel `dimensions` object and `origin/destination` changes.
- Frontend often sends parcels with `length/width/height` and wizard sends `sender/receiver`.

**Expected**
- Critical-change detection should evaluate normalized canonical shipment objects, not UI-shape-specific payloads.

**Impact**
- Price recalculation may fail to trigger when it should, creating financial and operational inconsistencies.

**Severity**: High

---

## Gap 5 — Authorization/status transition mismatch across UI and API

**Observed**
- UI allows client edit actions in `draft/pending/updated` statuses.
- Backend status permission helper allows status updates only for `admin/manager/accounting` in `updateShipment` logic.

**Expected**
- Shared policy matrix for role × status × action enforced consistently in UI and API.

**Impact**
- Users can access edit controls but fail on save (403/permission mismatch), causing repeated retries and escalations.

**Severity**: High

---

## Gap 6 — Validation asymmetry and silent acceptance

**Observed**
- Route-level validation for patch is minimal (mostly `status`) and controller quietly filters unknown keys.

**Expected**
- Structured schema validation with explicit feedback on rejected/unknown edit fields.

**Impact**
- Hidden failures and difficult troubleshooting; errors are not surfaced as actionable client messages.

**Severity**: Medium

---

## Gap 7 — Missing edit-flow automated tests

**Observed**
- No focused tests found for shipment edit contract, patch behavior, or wizard edit hydration path.

**Expected**
- Contract tests + integration tests for create→edit→readback and pricing re-rate triggers.

**Impact**
- Regressions likely and difficult to detect before release.

**Severity**: High

---

## 4) Risk Register

| Risk | Likelihood | Impact | Priority |
|---|---:|---:|---:|
| Non-persisting edits due to field mismatch | High | High | P0 |
| Incorrect re-rating after edits | Medium-High | High | P0 |
| Role/status edit permission failures | High | Medium-High | P1 |
| User distrust due to silent no-op saves | High | Medium | P1 |
| Regression recurrence (no tests) | High | Medium-High | P1 |

---

## 5) Recommended Remediation Plan

### Phase 0 (Immediate stabilization, 1–2 days)
1. **Disable or gate wizard edit route** unless hydration is implemented; direct users to details drawer edit path as temporary single source of truth.
2. **Add API warning response** listing ignored keys when patch receives unsupported fields.
3. **Instrument edit telemetry**: payload keys sent, keys accepted, validation failures, permission denials.

### Phase 1 (Contract alignment, 3–5 days)
1. Define `ShipmentEditDTO v1` (canonical fields, ownership, mutability by status/role).
2. Implement bidirectional mapper in frontend and backend:
   - UI model ↔ API DTO
   - DTO ↔ persistence model (`origin/destination` + normalized billing blocks)
3. Enforce strict validation and explicit 400 errors for unknown/illegal fields.

### Phase 2 (Behavior correctness, 3–4 days)
1. Add edit hydration in wizard with normalization from shipment data.
2. Normalize critical-change logic to canonical shape (not UI structure).
3. Make role/status policy centrally defined and shared between UI hints and API enforcement.

### Phase 3 (Quality hardening, ongoing)
1. Add automated tests:
   - Contract tests for patch allowlist and rejection behavior.
   - Integration tests: create → edit sender/receiver/content/billing → readback assertions.
   - Pricing tests for re-rate triggers on dimensional/address/service edits.
2. Add operational dashboards for edit success rate, rejection reasons, and rerating events.

---

## 6) Suggested Acceptance Criteria (for fix completion)

1. Editing a shipment from either UI path updates the same canonical fields consistently.
2. Unknown fields in patch payload produce explicit validation errors (no silent drops).
3. Editing dimensions/address/service reliably triggers or skips rerating according to policy.
4. Client/staff role behavior is consistent between visible edit controls and backend permission checks.
5. Regression suite covers at least:
   - Address edits
   - Parcel weight/dimension edits
   - Billing field edits
   - Status transition edits
   - Optional services persistence

---

## 7) Implementation Notes (Planning Focus)

- Prefer **single edit surface** long-term (either modern wizard or details drawer) unless both are maintained against a shared contract library.
- Keep backward compatibility temporarily by accepting both `sender/receiver` and `origin/destination` on backend mapper, then deprecate legacy shape with telemetry.
- Return field-level save summaries in API responses (e.g., `appliedFields`, `rejectedFields`, `warnings`) to remove ambiguity.

---

## 8) Priority Backlog (Proposed)

1. **P0:** Implement and enforce canonical edit DTO with explicit validation errors.
2. **P0:** Fix wizard edit hydration + payload mapping.
3. **P0:** Normalize rerating trigger logic for current parcel/address schemas.
4. **P1:** Align role/status policy matrix and UI gating.
5. **P1:** Add end-to-end and contract tests for edit lifecycle.
6. **P2:** Consolidate to one edit UX surface and deprecate duplicate path.


---

## 9) Detailed Implementation Blueprint (Phase-by-Phase Delivery)

This section turns the audit into an execution plan with delivery gates so we can fix current issues safely (including DGR + insurance values not showing/editable in the drawer).

### Phase A — Contract Freeze + Field Inventory (2–3 days)

**Goal:** Remove ambiguity by defining exactly which fields exist, where they are stored, and which UI surfaces can edit them.

1. Create a **single field inventory sheet** (API DTO ↔ DB path ↔ UI component).
2. Mark each field with:
   - `viewable` by role
   - `editable` by role/status
   - `surface` (wizard, details drawer, both)
   - `storagePath` (`origin`, `destination`, `pricingSnapshot`, top-level scalar)
3. Explicitly include DGR and insurance set:
   - `dangerousGoods.contains`
   - `dangerousGoods.unNumber`
   - `dangerousGoods.class`
   - `dangerousGoods.packingGroup`
   - `insuredValue`
   - `optionalServiceCodes` including `II`
   - optional service derived totals (if persisted)

**Exit criteria:** approved `ShipmentEditDTO v1` document and role/status policy matrix.

---

### Phase B — Backend Mapper + Strict Validation (3–5 days)

**Goal:** Make backend authoritative and explicit; no silent field drops.

1. Add mapper function in backend edit controller:
   - Accept both legacy (`sender/receiver`) and canonical (`origin/destination`) for transition period.
   - Normalize into one internal object.
2. Enforce schema validation for `PATCH /shipments/:trackingNumber`:
   - Reject unknown keys with 400 and `rejectedFields`.
   - Return `appliedFields`, `rejectedFields`, `warnings` in response.
3. Persist billing/customs/DGR/insurance consistently:
   - Ensure fields currently stored in `origin` during create are also updated through patch.
4. Fix re-rating trigger normalization:
   - Compare canonical dimensions regardless of input shape (`dimensions` vs `length/width/height`).

**Exit criteria:** API contract tests green; no silent no-op updates.

---

### Phase C — UI Data Hydration and Edit Surface Parity (3–5 days)

**Goal:** Ensure all values appear in drawer/wizard and are actually editable.

1. Wizard edit hydration:
   - On `/shipment/:trackingNumber/edit`, fetch shipment, normalize to form model, prefill all steps.
2. Drawer hydration parity:
   - Map DB fields back into drawer form state for billing/DGR/insurance.
3. Add missing editable controls where absent:
   - DGR fields and insurance (`insuredValue`, service `II`) visible when relevant.
4. UI save payload builder uses **same DTO mapper** for both wizard and drawer.

**Exit criteria:** same shipment edited in wizard or drawer yields identical persisted result.

---

### Phase D — DGR + Insurance Dedicated Fix Pack (2–4 days)

**Goal:** Resolve the specific problem: values do not appear and are not editable.

1. Build a DGR/insurance read/write matrix:
   - Source of truth for each value (current location in shipment JSON).
   - Display condition (carrier == DGR, optional service II selected, etc.).
2. Ensure initial form values are read from persisted shipment:
   - `dangerousGoods` from persisted JSON (not defaults)
   - `insuredValue` from persisted snapshot/origin field
   - selected optional service codes from snapshot or canonical field
3. Save flow:
   - Persist back to canonical DTO and DB storage path.
   - Re-rate only when required by changed inputs.
4. Regression tests for DGR/insurance:
   - create with DGR+II → open drawer → values shown
   - modify insured value + DG class → save → reopen shows updated values
   - verify pricing snapshot updates when expected

**Exit criteria:** DGR/insurance can be viewed, edited, saved, and re-opened reliably.

---

### Phase E — Permission and Status Consistency (2–3 days)

**Goal:** Prevent UI/API mismatch on who can edit what.

1. Implement shared policy config (role × status × field-group).
2. UI hides/locks fields using same policy constants the API enforces.
3. API returns clear 403 reason codes for blocked edits.

**Exit criteria:** zero “button visible but save forbidden” cases in UAT matrix.

---

### Phase F — End-to-End Hardening + Production Rollout (3–5 days)

**Goal:** Ship safely with observability and rollback.

1. Add integration/e2e scenarios:
   - create→edit→readback for sender/receiver/content/billing
   - DGR + insurance lifecycle
   - status transition permissions
2. Introduce feature flag for new edit contract.
3. Deploy progressive rollout:
   - Internal users → one pilot org → all orgs.
4. Metrics and alarms:
   - edit success rate
   - validation reject rate by field
   - rerating success/failure
   - 403 mismatch events

**Exit criteria:** stable metrics for 7 days, then remove transition compatibility code.

---

## 10) UAT Checklist for “100% Working” Confidence

Use this checklist before full rollout:

1. **Hydration**
   - Open existing shipment in wizard and drawer; all saved values appear.
2. **DGR visibility/editability**
   - DGR fields appear only when applicable and persist after save/reload.
3. **Insurance visibility/editability**
   - `II` selection + `insuredValue` appear, save, and persist after reopen.
4. **Contract strictness**
   - Invalid/unknown fields show explicit API errors (not silent ignore).
5. **Pricing correctness**
   - Re-rate triggered only on critical edits; totals consistent with saved snapshot.
6. **Permissions**
   - Every role/status pair behaves exactly as policy matrix defines.
7. **Dual-surface parity**
   - Drawer edit and wizard edit produce identical backend payload + persisted state.

---

## 11) Practical Sprint Breakdown

### Sprint 1
- Phase A + Phase B
- Deliverables: DTO spec, backend mapper, strict validation, contract tests.

### Sprint 2
- Phase C + Phase D
- Deliverables: wizard/drawer hydration parity, DGR+insurance complete fix pack, UI tests.

### Sprint 3
- Phase E + Phase F
- Deliverables: policy consistency, e2e suite, staged rollout and monitoring.

