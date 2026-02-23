# Final MVP + Gap/Audit Report — SaaS 3PL Logistics (2026-02-18)

## 1) Executive summary
You want a **multi-tenant SaaS 3PL platform** where pricing and carrier policy are centrally governed, while organizations and agents operate within strict constraints:

- Account-level pricing control (markup) per organization and per org agent.
- Ability to assign specific carriers per org agent.
- Clear separation of platform roles vs organization roles.
- No hardcoded shipment quote/service behavior.

Current codebase is a strong base, but still operating on a legacy 4-role model and lacks first-class policy primitives for your target operating model.

---

## 2) Current-state audit (what exists now)

### 2.1 Role and tenancy baseline
- User role enum currently supports: `client`, `staff`, `admin`, `driver` only.
- Missing first-class roles for `accounting`, `manager`, `org_manager`, `org_agent`.
- `client` is currently overloaded as organization-side user type.

### 2.2 Markup model baseline
- User has legacy markup fields (`user.markup`) and carrier config.
- Organization has centralized markup config (`organization.markup`) and financial limits.
- There is no explicit **per-agent carrier entitlement + markup override policy model** yet.

### 2.3 Shipment/quote pipeline
- Frontend quote requests go through centralized API service (`/api/shipments/quote`).
- Backend quote flow uses carrier adapter + pricing service.
- DGR adapter now uses provider `/rates` response parsing (not static rate table in adapter).

### 2.4 Gaps in FE/BE contract and policy system
- No shared capability claims contract between frontend and backend.
- Authorization still mostly literal role checks (`restrictTo`) + per-controller conditionals.
- Limited centralization of organization-scoped query enforcement.

---

## 3) Gap report against target SaaS 3PL model

## Gap A — Missing role taxonomy for target business model (Critical)
**Needed:** Platform (`admin`, `accounting`, `manager`, `staff`, `driver`) + Organization (`org_manager`, `org_agent`).

## Gap B — No explicit per-org-agent carrier assignment policy object (Critical)
You asked for assigning specific carrier per org agent with markup, but there is no dedicated schema for:
- allowed carriers per agent
- preferred/default carrier per agent
- carrier-specific markup overrides per agent

## Gap C — Markup precedence rules are not formalized (Critical)
Required deterministic stack:
1. Platform global defaults
2. Organization defaults
3. Org agent overrides
4. Carrier-specific override (org or agent level)
5. Transaction-time guardrails (min margin / max markup)

## Gap D — Capability-based auth missing (High)
UI and API both still role-literal driven; hard to evolve safely and audit.

## Gap E — Driver/staff assignment scoping not fully modeled (High)
Assigned-only visibility and actions need explicit assignment fields and policy checks.

## Gap F — Incomplete policy auditability (Medium)
No unified policy decision log (`who`, `action`, `resource`, `scope`, `allow/deny`, `reason`).

---

## 4) Final MVP definition (implementation-ready)

## MVP Goal
Deliver a production-safe, multi-tenant SaaS 3PL core where **carrier eligibility and pricing are policy-driven per organization and per org agent**, with strict access controls and auditable behavior.

## MVP Scope

### 4.1 Data model changes (must-have)
1. **Role expansion** in user schema:
   - `admin`, `accounting`, `manager`, `staff`, `driver`, `org_manager`, `org_agent`

2. **Organization policy object** (new fields under org):
   - `allowedCarriers: string[]`
   - `defaultCarrier: string`
   - `markupPolicy`:
     - `default` (percentage/flat/combined)
     - `byCarrier: { [carrierCode]: MarkupConfig }`

3. **Org agent policy object** (new fields under user for org-side users):
   - `agentPolicy.allowedCarriers: string[]` (subset of org allowed carriers)
   - `agentPolicy.defaultCarrier: string`
   - `agentPolicy.markupOverride` (optional)
   - `agentPolicy.markupByCarrier` (optional per carrier override)

4. **Shipment pricing traceability**
   - Save resolved policy source in `pricingSnapshot`:
     - `pricingSnapshot.policySource: 'org_default' | 'org_carrier' | 'agent_default' | 'agent_carrier'`

### 4.2 Pricing + carrier resolution engine (must-have)
Implement a deterministic resolver:

`resolveCarrierAndMarkup(user, organization, selectedCarrier, quote)`

Rules:
1. Verify carrier is in org allowed list.
2. If user is org_agent, verify carrier in agent allowed list.
3. Resolve markup precedence:
   - agent carrier override > agent default override > org carrier override > org default.
4. Enforce guardrails (`minMargin`, `maxMarkupPercent`, optional).
5. Persist resolved details in shipment pricing snapshot.

### 4.3 API behavior (must-have)
- `GET /shipments/carriers` should return **effective allowed carriers for current actor**.
- `POST /shipments/quote` should reject disallowed carrier selections (403).
- `POST /shipments` should use server-resolved pricing only (ignore client price input).
- Admin endpoints:
  - manage org carrier/markup policy
  - manage org agent carrier/markup overrides

### 4.4 Frontend behavior (must-have)
- Shipment wizard carrier dropdown shows only effective allowed carriers.
- If agent has one carrier, preselect and lock it.
- Quote and review screens display pricing source badge:
  - “Org Default”, “Org Carrier Rule”, “Agent Override”, “Agent Carrier Override”.

### 4.5 Security and auth (must-have)
- Public signup may create only lowest-privilege org user (`org_agent`) via invite/tokenized onboarding.
- Internal roles assignable by admin only.
- Add capability claims in auth payload and consume in FE guards.

### 4.6 Auditing (must-have)
Log policy-sensitive actions:
- carrier policy changes
- markup policy changes
- quote denied due to carrier restriction
- manual overrides

---

## 5) MVP acceptance criteria

1. **Per-org carrier policy enforced** on quote + booking.
2. **Per-agent carrier subset enforced** on quote + booking.
3. **Per-agent markup override works** and wins by precedence when configured.
4. **No client-provided final price accepted** as source of truth.
5. **Cross-organization access prevented** at API query level.
6. **Audit logs present** for policy changes and policy denials.
7. **UI reflects effective policy** (available carriers + pricing source).

---

## 6) Recommended rollout (2–3 sprints)

### Sprint 1 (Foundation)
- Role expansion + migration.
- Org policy schema (allowed carriers + markup by carrier).
- Central policy resolver service.
- Harden signup restrictions.

### Sprint 2 (Agent policies)
- Agent-level carrier and markup override schema.
- Quote/booking enforcement integration.
- Admin UI for org/agent policy management.

### Sprint 3 (UX + audit + hardening)
- FE capability-based guards.
- Pricing source visibility in shipment flows.
- Audit logging and policy decision telemetry.
- Integration tests per role + tenancy + pricing precedence.

---

## 7) Concrete FE/BE gaps to close now

1. Replace role literals in FE with capability checks.
2. Introduce `effectivePolicy` response contract for shipment setup/quote screens.
3. Add backend validation that selected carrier is within actor-effective set.
4. Add explicit precedence resolver tests:
   - org default vs org carrier
   - org vs agent override
   - agent default vs agent carrier override

---

## 8) Final MVP statement
The final MVP for your SaaS 3PL should be:

> **A multi-tenant, policy-driven logistics core where each organization can have governed carrier and markup policy, each org agent can have optional constrained carrier and markup overrides, all quotes/bookings are server-authoritative, and platform governance remains admin-controlled with auditable policy decisions.**

This gives you controllable profitability (markup), operational guardrails (carrier assignment), and enterprise-grade tenancy/security for scale.
