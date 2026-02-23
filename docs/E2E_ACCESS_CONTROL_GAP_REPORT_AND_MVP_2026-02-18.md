# 3P Logistics — End-to-End Access Control Audit & Gap Report (2026-02-18)

## 1) Scope & Objective
This audit evaluates the current RBAC and tenancy implementation across backend + frontend against the required 3PL role structure:

- **Platform roles**: Admin, Accounting, Manager, Staff, Driver
- **Organization roles**: Org Manager, Org Agent

It also defines a **final MVP** that can be implemented with controlled risk.

---

## 2) What exists today (code reality)

### 2.1 Implemented role model
Current persisted role enum in `User` is:
- `client`
- `staff`
- `admin`
- `driver`

No first-class `accounting`, `manager`, `org_manager`, or `org_agent` roles exist today. `client` appears to represent all organization-side users.  
Refs: `backend/src/models/user.model.js`.

### 2.2 Authorization pattern
Authorization is currently string-based via `restrictTo(...roles)` middleware and ad-hoc `if (req.user.role === 'client')` filters in controllers.  
Refs: `backend/src/controllers/auth.controller.js`, `backend/src/controllers/shipment.controller.js`, `backend/src/controllers/finance.controller.js`, `backend/src/controllers/pickup.controller.js`.

### 2.3 Route-level controls (backend)
- Organization routes allow `admin` and `staff` broadly, with create/update/member-management mostly `admin` only.  
  Ref: `backend/src/routes/organization.routes.js`.
- Finance management endpoints are currently available to `staff` and `admin`; there is no accounting-only split.  
  Ref: `backend/src/routes/finance.routes.js`.
- User listing/management and client lookup are split between `staff` and `admin`; no manager/accounting distinction.  
  Refs: `backend/src/routes/user.routes.js`, `backend/src/routes/auth.routes.js`.

### 2.4 Frontend role usage
Frontend guards use only `admin/staff/client/driver` in routes and UI checks.  
Ref: `frontend/src/routes/index.js`, `frontend/src/context/AuthContext.js`, `frontend/src/components/layout/Sidebar.js`.

### 2.5 Signup and privilege exposure
Public signup currently allows submitting role from the request body, and UI allows selecting `staff`, enabling a high-risk privilege escalation vector if not additionally blocked.  
Refs: `backend/src/controllers/auth.controller.js`, `frontend/src/pages/SignupPage.js`.

---

## 3) Gap report against target role structure

## Gap A — Missing required roles (Critical)
**Required but not implemented:** `accounting`, `manager`, `org_manager`, `org_agent`.  
**Impact:** Cannot enforce distinct responsibilities outlined in the target architecture; over-privileged `staff`/`admin` usage persists.

## Gap B — Platform vs organization role boundary not explicit (Critical)
Current model conflates org-side users under `client` and platform-side users under `staff/admin`.  
**Impact:** No robust boundary between internal operations and client-company users.

## Gap C — Incomplete tenancy enforcement (Critical)
Many controllers rely on role checks only; there is no centralized policy ensuring org scoping on every read/write path. For example, shipment listing only auto-restricts `client` and lets non-client roles access broad data by default.  
Ref: `backend/src/controllers/shipment.controller.js`.  
**Impact:** Future role additions can leak data without strict organization predicates.

## Gap D — Accounting and manager capabilities are not separated (High)
Finance, org visibility, and operational controls are bundled under `staff/admin` in route guards.  
Refs: `backend/src/routes/finance.routes.js`, `backend/src/routes/organization.routes.js`, `backend/src/routes/user.routes.js`.

## Gap E — Driver assignment model is incomplete for “assigned shipments only” (High)
Shipment schema has no explicit `assignedDriver`/assignment lifecycle fields; driver access model is therefore difficult to constrain reliably to assignment scope.  
Ref: `backend/src/models/shipment.model.js`.

## Gap F — API key/system-secret governance not aligned with role granularity (High)
API key generation endpoint is authenticated but not constrained to admin-only platform policy.  
Ref: `backend/src/routes/auth.routes.js`.  
**Impact:** Sensitive credential operations may be exposed beyond intended super-admin boundaries.

## Gap G — Public registration can create elevated internal role (Critical)
`signup` accepts `role` directly and frontend allows selecting `staff`.  
Refs: `backend/src/controllers/auth.controller.js`, `frontend/src/pages/SignupPage.js`.  
**Impact:** Unauthorized user can self-provision internal access.

## Gap H — Frontend navigation/guarding has no support for target role taxonomy (Medium)
Route and sidebar controls are tied to the legacy 4-role model, so even backend role expansion would remain inconsistent without UI policy updates.  
Refs: `frontend/src/routes/index.js`, `frontend/src/components/layout/Sidebar.js`.

## Gap I — Policy implementation is distributed and brittle (Medium)
Permissions are encoded as repeated literals across routes/controllers/UI.  
**Impact:** Hard to audit, easy to drift, and difficult to prove compliance.

---

## 4) Recommended target architecture

### 4.1 Role model (MVP-safe)
Use explicit roles:
- Platform: `admin`, `accounting`, `manager`, `staff`, `driver`
- Organization: `org_manager`, `org_agent`

### 4.2 Policy model
Adopt a policy layer with:
- **Action** (e.g., `shipment.read`, `shipment.update_status`, `finance.post_payment`)
- **Scope** (`all`, `organization`, `self`, `assigned_shipments`)
- **Conditions** (e.g., `shipment.organization == user.organization`)

### 4.3 Tenancy as first-class invariant
Every data query should pass through a scope builder:
- Platform roles: all orgs or as policy allows
- Org roles: only own org
- Org agent: self-created/assigned shipments unless org policy explicitly broadens
- Driver: assigned shipments only

### 4.4 Sensitive operations separation
- API keys, carrier integrations, pricing rules: **Admin only**
- Finance controls and ledgers: **Accounting + Admin**
- Operational staffing and assignment: **Manager + Admin**

---

## 5) Final MVP proposal (implementation-ready)

## MVP Goal
Deliver **secure, auditable RBAC + tenancy** matching your stated role structure, without breaking core shipment lifecycle.

## MVP Scope (must-have)
1. **Role schema migration**
   - Extend role enum and backfill existing users:
     - `client` -> `org_agent` (default)
     - selected power users -> `org_manager`
     - current `staff` split into `manager`/`staff`/`accounting` by admin migration script

2. **Signup hardening**
   - Public signup can only create `org_agent` (or invite-based org role).
   - Internal roles only assignable by Admin.

3. **Central policy engine**
   - Introduce `authorize(action)` middleware + scope resolver.
   - Remove scattered role literals from controllers progressively.

4. **Assignment model for drivers/staff**
   - Add shipment fields: `assignedDriver`, `assignedStaff`, assignment timestamps/status.
   - Enforce driver queries to assigned shipments only.

5. **Finance/operations split**
   - Rewire finance routes to `accounting/admin`.
   - Rewire org and staffing workflows to `manager/admin` where applicable.

6. **Carrier + markup admin lock**
   - Ensure carrier integration config and pricing rule mutation endpoints are admin-only.
   - Org users can choose from allowed carriers only (no pricing rule edits).

7. **Frontend alignment**
   - Replace `isStaff` booleans with capability-based checks from backend claims.
   - Update route guards/sidebar per capability.

8. **Audit trail**
   - Log actor/action/resource/outcome for permission-sensitive actions.

## MVP Acceptance Criteria
- No public flow can create platform roles.
- Each role can only perform actions defined in your matrix.
- Org users cannot access other organizations’ data at API level.
- Driver cannot access non-assigned shipments.
- Accounting can perform financial operations but cannot manage API keys/carrier config.
- Manager can manage operational assignments but cannot modify pricing rules.
- Admin retains full access.

---

## 6) Suggested rollout plan

### Phase 0 (1–2 days): Risk stop
- Disable elevated role selection in signup.
- Force backend signup role to lowest-privilege org role.
- Restrict API key generation to admin immediately.

### Phase 1 (3–5 days): Schema + policy foundation
- Add new roles + migration script.
- Implement policy middleware (`authorize`, `scopeQuery`).
- Integrate in shipments, organizations, finance.

### Phase 2 (3–5 days): Assignment + UI alignment
- Add assignment fields and enforcement.
- Update frontend route/menu/capability checks.

### Phase 3 (2–3 days): Validation + audit evidence
- RBAC integration tests per role.
- Negative tests for cross-org access and privilege escalation.
- Produce compliance matrix report.

---

## 7) Priority ranking
- **P0:** Gap A, B, C, G
- **P1:** Gap D, E, F
- **P2:** Gap H, I

---

## 8) Summary for decision
Current system is functional for a 4-role model, but it is **not yet aligned** with your target 7-role platform/client architecture. The fastest safe path is to deliver the MVP above in phased hardening, starting with signup role lockdown and central policy enforcement.
