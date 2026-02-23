# ShipmentWizardV2 Audit: Carrier-Specific Layout Readiness (DGR DHL First)

## Scope
This audit reviews whether `ShipmentWizardV2` can support different field layouts and wizard behavior per carrier, with initial focus on **DGR DHL**.

## Current-state findings

### 1) Carrier selection is present but not fully applied
- `ShipmentWizardV2` tracks `selectedCarrier` state and fetches available carriers.
- However, shipment submission currently hardcodes `carrierCode: 'DGR'` in payload, so selected carrier is not honored end-to-end.
- The handler `handleCarrierChange` exists, but `ShipmentSetup` currently receives `onCarrierChange={setSelectedCarrier}` instead of the handler that resets service code.

### 2) Wizard layout is static, not carrier-configurable
- All users go through the same step sequence (`Setup`, `Content`, `Billing`, `Review`, `Success`).
- `ShipmentContent` always renders `DangerousGoodsPanel` and DGR-centric packaging options.
- Validation logic in `validateStep` includes DGR-specific mandatory checks regardless of carrier profile.

### 3) Carrier backend is single-active adapter model
- `CarrierFactory` lists DGR as active and FEDEX/UPS as inactive placeholders.
- This is good for phased rollout but there is no shared metadata contract describing per-carrier UI fields, required fields, or step variants.

### 4) Documentation consistency gap for AI governance
- `README.md` links to `docs/AI_AGENT_RULES.md`, but this file was missing at audit time.
- This creates ambiguity for AI-assisted development workflows.

---

## DHL-first implications (what should be true)
For DGR DHL as first carrier, the wizard should:
1. Load a **carrier profile** that defines required/optional fields by step.
2. Gate DG fields by DHL service and DG type (HE/HV/HK/HC and content IDs).
3. Validate according to carrier profile, not hardcoded rules.
4. Submit with selected carrier and service compatibility checks.

---

## Recommended target architecture (no code changes yet)

## A) Carrier UI Profile (frontend)
Create a typed config object per carrier, for example:
- `steps`: ordered array of step descriptors.
- `fields`: per-step field schema with visibility/required rules.
- `defaults`: per-carrier defaults (incoterm, label, packaging).
- `validators`: list of validator keys to run per step.

Example modules:
- `frontend/src/carriers/dgr/profile.ts`
- `frontend/src/carriers/index.ts`

## B) Carrier Capability Contract (backend)
Expose API metadata so frontend can stay data-driven:
- `GET /shipments/carriers` already exists conceptually.
- Extend payload to include capabilities (DG supported, required refs, available services, customs rules).

## C) Wizard Renderer
Refactor wizard to render from carrier profile:
- `StepRenderer` receives active carrier profile.
- Components (`ShipmentSetup`, `ShipmentContent`, `ShipmentBilling`) become field-group components with feature flags.

## D) Validation Engine
Replace step hardcoded `if (step===...)` + DGR-specific checks with:
- Profile-driven validator registry.
- Common validators (`required`, `email`, `countryCode`).
- Carrier validators (`dhl.dg.contentIdRequired`, `dhl.receiverReferenceRequired`).

## E) DHL integration hardening
- Use selected carrier in payload (remove hardcoded `DGR`).
- Add service-level constraints (e.g., DG service codes + matching content IDs).
- Add request-time sanity checks mapped to DHL error guidance.

---

## DHL API mapping priorities
Use the official MyDHL docs to define exact profile rules for:
1. Product/rating service availability by lane.
2. Shipment creation DG blocks and value-added services.
3. Reference data for DG content IDs and customs/export declarations.
4. Error mapping for actionable UI feedback.

---

## Proposed implementation phases

### Phase 1 (safe foundation)
- Add carrier profile abstraction (DGR only initially).
- Wire `selectedCarrier` end-to-end in submit payload.
- Move DGR-specific validations into DGR profile validators.

### Phase 2 (DHL UX quality)
- Conditional field visibility for DG types.
- Service-aware required fields and inline helper text.
- Improved Review step to show DHL-compliance checklist.

### Phase 3 (multi-carrier readiness)
- Introduce second carrier profile scaffold.
- Shared validation + UI renderer pattern.
- Regression tests for profile switching.

---

## Acceptance criteria for DGR DHL rollout
- Changing carrier updates required fields and visible groups without code branching in main wizard.
- Step validation passes/fails based on carrier profile.
- Submit payload uses selected carrier code and service-appropriate DG structure.
- Existing DGR booking flow remains functional.
- Tests cover profile loading, validator behavior, and payload mapping.

---

## Discussion checkpoints before implementation
1. Confirm if carrier selection should be available to all users or only staff.
2. Confirm MVP scope: DGR DHL only, or generic profile engine now.
3. Confirm whether to source carrier capabilities from backend API, static frontend config, or hybrid.
4. Confirm required DG scenarios for launch (UN3481/UN1845/UN1266/ID8000 etc.).
5. Confirm desired strictness level for pre-submit validation vs provider-side validation.
