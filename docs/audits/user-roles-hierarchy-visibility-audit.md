# User Roles, Hierarchy, and Visibility Audit

Reviewed: 2026-05-03

Phase 1 update implemented: shipment access now has shared backend helpers for list/stat scoping and shipment detail/subresource checks. `staff` and `driver` are no longer treated as platform-wide visibility roles. `org_manager` has company-wide shipment visibility, while `org_agent` and `client` are scoped to shipments they created or shipments created on their behalf through `createdOnBehalfOfUserId`. `UserAccessScope` supports selected client-user access and selected company/all-users access for scoped internal users. Managers/accounting can manage those scopes from the admin user modal, and creation on behalf is enforced through `canCreateOnBehalf`. Finance organization endpoints now require organization access in addition to finance capabilities.

## 1. Executive Summary

Target-Prod already has the beginning of a multi-tenant logistics platform: a single `User` table, a company boundary currently named `Organization` in code, shipment ownership, company-scoped finance ledgers, API keys, and a coarse capability map shared between backend and frontend.

The current model is not yet strong enough for the future Target-KW control tower direction. It can support today's basic internal users and client companies, but it does not yet model client sub-roles, manager company-wide visibility, regular-client own/on-behalf visibility, branch/department/user-level visibility, account-manager portfolios, partner users, invoice access, COD access, Phenix reconciliation access, or finance/report sensitivity layers.

The biggest risks are:

- Some authenticated shipment detail and subresource endpoints fetch by tracking number without a shared shipment access check.
- `GET /api/shipments/stats` accepts `organizationId` from query and does not scope non-platform users.
- Finance organization endpoints are capability-gated, but not consistently organization-access-gated; future client finance roles would be unsafe without another layer.
- `driver` is treated as a platform role in RBAC, giving broad shipment visibility in list/scoping helpers.
- Frontend route access is role-string based and sometimes broader than sidebar visibility; backend must remain the source of truth.
- There is no formal per-company membership table, no permission table, no client company role hierarchy, and only limited audit logging.

Current code can be evolved, but Phase 1 should stabilize authorization and ownership checks before adding invoices, COD, payroll, Phenix Bridge, or client finance/reporting roles.

## 2. Current Model Found

### User model

Source: `backend/prisma/schema.prisma`

The platform uses one `User` table for both internal Target users and external/client users.

Important fields:

- `id`
- `organizationId`
- `role`
- `password`
- `carrierConfig`
- `agentPolicy`
- `addresses`
- `balance`
- `creditLimit`
- `apiKeyHash`
- `active`

There is no separate internal-user table, client-user table, partner-user table, membership table, branch, department, team, assigned account manager, or per-user visibility scope.

### Role model

Source: `backend/prisma/schema.prisma`, `backend/src/middleware/rbac.policy.js`, `frontend/src/utils/capabilities.jsx`

Current enum roles:

- `staff`
- `admin`
- `driver`
- `accounting`
- `manager`
- `org_manager`
- `org_agent`
- `client`

Roles are global per user, not scoped per organization. A user cannot have different roles across different companies.

### Company/organization model

Source: `backend/prisma/schema.prisma`, `backend/src/controllers/organization.controller.js`

`Organization` currently represents client companies. Product language should move toward `Company`, while a deliberate schema rename can be planned separately. A company owns:

- members
- shipments
- payments
- ledger entries
- allocations
- webhooks
- pickup requests

This is a useful starting tenant boundary, but it is shallow. There is no parent platform tenant, branch/location hierarchy, department, multiple memberships, partner company type enforcement, company-user role assignment, or company admin invitation model.

Important future client layering requirement:

- A client company manager can view all shipments created by users inside that company.
- A regular client user can only view shipments they created or shipments created on their behalf.
- A client company manager should be able to run workflows for, filter by, and report on other users inside their company.
- This requires a visibility distinction between company scope and own-user scope. The current `org_manager`, `org_agent`, and `client` roles do not enforce this distinction consistently.

### Auth/session model

Source: `backend/src/controllers/auth.controller.js`

JWT payload contains only:

- `id`

On each protected request, the backend loads the current user from the database and attaches the full user to `req.user`. This means role and organization changes take effect on the next request, which is good.

The API key middleware parses `{userId}.{secret}`, looks up an active user, validates the HMAC hash, and attaches:

- `id`
- `role`
- `organizationId`
- `active`

`active=false` users are blocked for both JWT and API key auth. There is no token revocation/version field, password-changed-at check, refresh-token model, or session store.

### Backend guards

Sources:

- `backend/src/controllers/auth.controller.js`
- `backend/src/middleware/authorize.middleware.js`
- `backend/src/middleware/rbac.policy.js`

The backend has:

- `protect()`
- `restrictTo(...roles)`
- `authorize(...capabilities)`
- `scopeToOrg(req, query)`
- `canAccessShipment(req, shipment)`

However, `scopeToOrg` and `canAccessShipment` are not used consistently across all shipment controllers.

### Frontend guards

Sources:

- `frontend/src/routes/index.jsx`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/utils/capabilities.jsx`
- `frontend/src/components/layout/Sidebar.jsx`

Frontend route guards use `allowedRoles` arrays. Sidebar visibility uses role arrays. Component-level UI often uses `isStaff` or `can(capability)`.

This improves UX, but it is not sufficient as a security boundary. Some frontend routes allow broad roles even when sidebar entries are hidden.

## 3. Current Role/Permission Inventory

### Backend role constants

Source: `backend/prisma/schema.prisma`

| Role | Current Meaning |
| --- | --- |
| `admin` | Full platform role |
| `staff` | Platform operations |
| `manager` | Platform operations/finance visibility |
| `accounting` | Platform finance and shipment visibility |
| `driver` | Driver operations, currently also treated as platform-level visibility |
| `org_manager` | Current organization-scoped client manager; should evolve into company manager with company-wide shipment visibility |
| `org_agent` | Current organization-scoped client user; should evolve into regular client user with own/on-behalf shipment visibility |
| `client` | Legacy organization-scoped client role |

### Backend capabilities

Source: `backend/src/middleware/rbac.policy.js`

| Capability | Notes |
| --- | --- |
| `MANAGE_USERS` | Admin user mutation, also reused for shipment delete route |
| `MANAGE_ORGS` | Organization create/update/member management |
| `MANAGE_PRICING` | Pricing/surcharge configuration |
| `MANAGE_CARRIERS` | Carrier management |
| `VIEW_COST_DATA` | Internal cost visibility |
| `VIEW_FINANCE` | Finance visibility |
| `MANAGE_PAYMENTS` | Payment posting and allocation |
| `REVERSE_PAYMENTS` | Allocation reversal |
| `VIEW_ALL_SHIPMENTS` | Broad shipment/org list access |
| `APPROVE_SHIPMENTS` | Pickup approval/rejection |
| `BOOK_CARRIERS` | Carrier booking |
| `VIEW_DOCUMENTS` | Label/AWB/invoice document visibility |
| `CREATE_SHIPMENTS` | Shipment creation |
| `VIEW_OWN_SHIPMENTS` | Client/org own visibility |
| `GENERATE_API_KEY` | API key generation |
| `DRIVER_OPS` | Driver workflows |

### Role capability concerns

- `staff` currently has `VIEW_FINANCE`.
- `manager` currently has `VIEW_FINANCE`.
- `driver` has `VIEW_ALL_SHIPMENTS` and is in `PLATFORM_ROLES`.
- `org_manager`, `org_agent`, and `client` are not differentiated; they all have the same capabilities even though company managers should see all company shipments and regular clients should see only own/on-behalf shipments.
- No capability exists for invoices, COD, reports, exports, Phenix Bridge, partner settlement, audit logs, payroll, client user management, branch-scoped shipment views, or portfolio/account-manager views.

## 4. Endpoint Access Matrix

| Area | Endpoint/Page | Current Access | Expected Access | Risk |
| --- | --- | --- | --- | --- |
| Auth | `POST /api/auth/signup` | Public, creates `org_agent` and optional organization | Public/self-onboarding or invite-only depending business policy | Medium: public org creation may create unwanted tenant data |
| Auth | `POST /api/auth/login` | Public | Public | Low |
| Auth | `POST /api/auth/api-key` | Auth + `GENERATE_API_KEY` | Client/company admins and approved API users only | Medium: all org agents can generate API keys |
| Users | `GET /api/users` | `VIEW_ALL_SHIPMENTS` | Platform admin/staff only, later client admins see own org users | Medium |
| Users | `POST/PATCH/DELETE /api/users` | `MANAGE_USERS` | Platform admin/super admin only | Low currently, but no audit log |
| Users | `POST /api/users/:id/reset-password` | `admin` or `accounting` via `restrictTo` | Admin/security role only, possibly not accounting | Medium |
| Organizations | `GET /api/organizations` | `VIEW_ALL_SHIPMENTS` | Internal platform roles only | Medium: broad capability name, driver risk if route allowed by frontend/API |
| Organizations | `POST/PATCH /api/organizations` | `MANAGE_ORGS` | Platform admin/super admin | Low |
| Shipments list | `GET /api/shipments` | Auth; platform roles can see all, org roles scoped | Internal all/portfolio; company managers see all company shipments; regular clients see own/on-behalf shipments | Medium: driver treated as platform; company manager and regular client scopes are not separated |
| Shipment stats | `GET /api/shipments/stats?organizationId=` | Auth only; trusts query | Same scoping as shipment list | High |
| Shipment detail | `GET /api/shipments/:trackingNumber` | Auth only; no access check found | Require shipment access | Critical |
| Shipment update | `PATCH /api/shipments/:trackingNumber` | Owner or admin/staff/manager/accounting | Require shipment access + field permissions | Medium |
| Shipment delete | `DELETE /api/shipments/:trackingNumber` | Route `MANAGE_USERS`, controller owner/admin/staff/manager/accounting | Separate `shipment:delete` permission | Medium |
| Location update | `PATCH /api/shipments/:trackingNumber/location` | Auth; no ownership check found | Staff/driver assigned shipment or permitted ops role | High |
| History/ETA/distance | `GET /api/shipments/:trackingNumber/history/eta/distance` | Auth; no ownership check found | Require shipment access or public-safe projection | High |
| Checkpoints | `POST/PATCH/DELETE /api/shipments/:trackingNumber/checkpoints` | Auth; no ownership/capability check found | Internal ops only or permitted client ops for own shipment | High |
| Public settings | `PATCH /api/shipments/:trackingNumber/public-settings` | Auth; no ownership check found | Internal ops or shipment owner/org admin | High |
| Label HTML | `GET /api/shipments/:trackingNumber/label` | Auth; no ownership check found | Document permission + shipment access | High |
| Secure document | `GET /api/shipments/:trackingNumber/documents/:filename` | Staff or same organization | Require shipment access + document access | Medium |
| Public tracking | `GET /api/public/shipments/:trackingNumber` | Public | Public-safe projection only | Medium: exposes city/address-ish route data; acceptable only by policy |
| Public location | `PATCH /api/public/shipments/:trackingNumber/location` | Public if flag enabled | One-time token or signed link preferred | Medium |
| Finance own | `GET /api/finance/balance` | Any authenticated org user | Own org finance summary if allowed | Medium: future limited users may need no finance |
| Finance ledger | `GET /api/finance/ledger?orgId=` | Org roles forced to own; platform roles may query any | Internal finance/admin; future client accountant own org | Medium |
| Finance org overview | `GET /api/finance/organizations/:orgId/overview` | `VIEW_FINANCE`; only `none` admin-special-cased | Finance access + org access | High for future scoped finance roles |
| Payments | `GET/POST /api/finance/organizations/:orgId/payments` | `VIEW_FINANCE` / `MANAGE_PAYMENTS` | Finance access + org access | High for future scoped finance roles |
| Allocation | `POST /api/finance/organizations/:orgId/allocations` | `MANAGE_PAYMENTS` | Finance access + org/payment/shipment same-org validation | High |
| FIFO allocation | `POST /api/finance/organizations/:orgId/allocations/fifo` | `MANAGE_PAYMENTS` | Finance access + org access | High |
| Shipment accounting | `GET /api/finance/shipments/:shipmentId/accounting` | `VIEW_FINANCE` only | Shipment finance access + org access + margin redaction | High |
| Reverse allocation | `POST /api/finance/allocations/:allocationId/reverse` | `REVERSE_PAYMENTS` only | Allocation org access + finance permission | High |
| Pickup list | `GET /api/pickups` | Auth; org roles scoped | Good start; driver assignment scoping needed | Medium |
| Pickup approve/reject | `POST /api/pickups/:id/approve|reject` | `APPROVE_SHIPMENTS` | Internal ops only, not broad finance | Medium |
| Client API shipments | `POST /api/v1/shipments` | API key, assigned access enforced | Good baseline | Low |
| Client API tracking/update | `/api/v1/tracking`, `/api/v1/shipments/:number` | API key, user-owned only | Company-scoped or user-scoped depending API key policy | Medium: same org multi-user API not supported |
| Legacy client API | `/api/client/shipments/:id` | API key, user-owned only | Company-scoped or key-scoped by policy | Medium |
| Chatwoot preview/test | `/api/integrations/chatwoot/...` | `VIEW_ALL_SHIPMENTS`; no shipment access after lookup | Internal support/ops with shipment access | Medium |
| Chatwoot webhook | `/api/integrations/chatwoot/webhook` | Public, optional signature | Signed webhook only in production | Medium |
| Invoices | No model/endpoints found | N/A | Invoice create/view/send/export permissions | Gap |
| COD | No model/endpoints found | N/A | COD view/update/remit permissions | Gap |
| Partner settlements | No model/endpoints found | N/A | Partner settlement visibility | Gap |
| Phenix Bridge | No model/endpoints found | N/A | Import/export/reconcile permissions and logs | Gap |

## 5. UI Access Matrix

| Page/Component | Current Visibility | Expected Visibility | Risk |
| --- | --- | --- | --- |
| `frontend/src/routes/index.jsx` dashboard | Admin/staff/client/manager/accounting/org roles | All authenticated except maybe driver-specific route | Low |
| Shipment list | Admin/staff/client/manager/accounting/org roles | Scoped by backend ownership/company/portfolio | Medium |
| Shipment detail | Admin/staff/client/manager/accounting/org roles | Require backend shipment access; role-specific field visibility | High |
| Shipment edit | Admin/staff/client/org roles | Client own editable fields only; internal ops broader | Medium |
| Finance route | Admin/staff/client/manager/accounting/org roles | Internal finance/admin now; future client accountant/company admin only | Medium |
| Finance sidebar item | Admin/accounting/manager/staff only | Should match route/backend permissions | Medium mismatch |
| Finance reports | Loaded inside finance page, computes profitability client-side | Internal margin reports only for `VIEW_COST_DATA`/profit permission | High |
| ExportButton | Generic export; no audit logging | Export permission and access logging for finance/report data | Medium |
| Admin users | Admin only | Platform admin; future client admin own org users | Low |
| Admin organizations | Admin/staff/manager | Internal users only; account managers may see assigned portfolio | Medium |
| API Docs | Broad authenticated roles | Users with API access or docs allowed | Low |
| Driver pickup page | Driver/admin/staff | Driver assigned workload, internal ops | Medium |
| Warehouse scan | Admin/staff/manager | Internal ops only | Low |
| Public tracking | Public | Public-safe shipment data only | Medium |
| WhatsApp log card in shipment detail | Visible as part of detail page | Internal support/ops; future client audit may need redacted view | Medium |

## 6. Data Ownership Matrix

| Data Object | Owner | Viewable By | Editable By | Notes |
| --- | --- | --- | --- | --- |
| Shipment | `Shipment.userId`, `Shipment.organizationId` | Platform roles; org roles by org/list; detail endpoint currently not consistently scoped | Owner/internal roles depending endpoint | Needs shared shipment access helper everywhere |
| Invoice | Not implemented | N/A | N/A | Add `Invoice.organizationId`, invoice lines, send logs |
| Payment | `Payment.organizationId` | `VIEW_FINANCE` users; no org-access helper on org endpoints | `MANAGE_PAYMENTS` | Future client accountants need own-org only |
| COD record | Not implemented | N/A | N/A | Should be separate from revenue ledger |
| Partner settlement | Not implemented | N/A | N/A | Needed for OTE/carrier reconciliation |
| Client balance | `Organization.balance`, ledger | Finance users | Ledger service only | Avoid direct balance edits |
| Fund allocation | `PaymentAllocation.organizationId` | Finance users | `MANAGE_PAYMENTS` / `REVERSE_PAYMENTS` | Allocation endpoints need payment/shipment/org consistency checks |
| Report | Mostly client-side derived today | Depends on loaded data | Export button available wherever rendered | Need backend report APIs and export logs |
| User | `User.id`, optional `organizationId` | Admin/staff list; own profile | Admin; own profile | No client company admin user-management model |
| Organization | `Organization.id` | Platform users with broad capability | `MANAGE_ORGS` | No branch/department hierarchy |
| Phenix reference | Not implemented | N/A | N/A | Future bridge needs references on invoices/payments/exports/imports |
| Notification log | `ShipmentNotificationLog.shipmentId` | Included in shipment detail | Chatwoot/webhook/service | Needs visibility rules and audit model |
| Audit log | `SystemAuditLog` exists | No clear UI/API found | Not broadly used | Needs coverage and immutable policy |

## 7. Risk Findings

### CRITICAL

1. Authenticated shipment detail endpoint lacks shipment ownership/org access enforcement.
   - Source: `backend/src/controllers/shipment-crud.controller.js`, `getShipmentByTrackingNumber`.
   - Impact: A logged-in user may retrieve another organization's shipment detail if they know or guess a tracking number.

### HIGH

1. Shipment stats endpoint trusts `organizationId` query and does not scope non-platform users.
   - Source: `backend/src/controllers/shipment-crud.controller.js`, `getShipmentStats`.
   - Impact: Client users can potentially see aggregate counts/monthly volume for other organizations.

2. Several shipment subresource endpoints lack shared access checks.
   - Sources: `shipment-tracking.controller.js`, `shipment-checkpoint.controller.js`, `shipment-public.controller.js`, `shipment-ops.controller.js`.
   - Impact: Authenticated users may read or mutate route/history/location/checkpoint/public-setting data across tenants.

3. Finance organization endpoints are permission-gated but not organization-access-gated.
   - Source: `backend/src/controllers/finance.controller.js`.
   - Impact: Safe only while `VIEW_FINANCE` is internal-only. Future client accountants would be able to query arbitrary `orgId` unless fixed first.

4. Payment allocation endpoints do not visibly validate that payment, shipment, and route `orgId` all match.
   - Sources: `finance.controller.js`, `financeLedger.service.js`.
   - Impact: Mistakes or malicious requests could allocate funds across boundaries if a finance user passes mismatched IDs.

5. Profitability report is calculated client-side and includes cost/margin concepts.
   - Source: `frontend/src/components/FinanceReports.jsx`.
   - Impact: Must never be available to client users unless explicitly permitted; future data loading changes could expose margin.

### MEDIUM

1. `driver` is a platform role.
   - Source: `backend/src/middleware/rbac.policy.js`.
   - Impact: `scopeToOrg` and shipment list logic treat drivers as all-organization viewers. Drivers should be assignment-scoped.

2. `org_manager`, `org_agent`, and `client` are effectively identical.
   - Source: `rbac.policy.js`, `capabilities.jsx`.
   - Impact: Cannot support company manager visibility across company users, regular-client own/on-behalf visibility, company admin, client accountant, report viewer, operations user, or limited user.

3. Frontend route visibility and sidebar visibility disagree for finance.
   - Sources: `frontend/src/routes/index.jsx`, `frontend/src/components/layout/Sidebar.jsx`.
   - Impact: Direct URL access reaches FinancePage for client/org roles, relying on backend and component logic.

4. Public tracking exposes route details and public location update is controlled only by a boolean flag.
   - Source: `shipment-public.controller.js`.
   - Impact: OK for basic tracking if intentional, but future private shipment or high-value client scenarios need signed links/tokenized updates.

5. Password reset is allowed to `accounting`.
   - Source: `backend/src/routes/user.routes.js`.
   - Impact: Accounting can reset arbitrary user passwords without full user management.

6. System audit table exists but sensitive actions are not consistently logged through it.
   - Sources: `schema.prisma`; controllers mostly log to logger only.
   - Impact: Weak compliance trail for finance/user/security actions.

### LOW

1. JWT contains only user ID, which is good for freshness but lacks token versioning.
2. Public signup is constrained to `org_agent`, but still allows public organization creation.
3. Role/capability definitions are duplicated between backend and frontend and must stay in sync manually.

## 8. Recommended Future Model

### User types

Add a clear user category separate from role:

- `PLATFORM`
- `CLIENT`
- `PARTNER`

This avoids overloading role names to determine tenancy.

### Platform roles

- `SUPER_ADMIN`
- `ADMIN`
- `OPERATIONS_MANAGER`
- `OPERATIONS_STAFF`
- `FINANCE_MANAGER`
- `ACCOUNTANT`
- `SUPPORT`
- `SALES_ACCOUNT_MANAGER`
- `AUDITOR`

### Client company roles

- `CLIENT_OWNER`
- `CLIENT_ADMIN`
- `CLIENT_MANAGER`
- `CLIENT_ACCOUNTANT`
- `CLIENT_OPERATIONS`
- `CLIENT_REPORT_VIEWER`
- `CLIENT_LIMITED_USER`

### Partner roles

- `PARTNER_ADMIN`
- `PARTNER_OPERATOR`
- `PARTNER_FINANCE`

Add partner roles only when partner portal or settlement access is real.

### Permission categories

Use role-to-permission mapping. Recommended categories:

- Shipment: `shipment:create`, `shipment:view:any`, `shipment:view:organization`, `shipment:view:own`, `shipment:update`, `shipment:cancel`, `shipment:book`, `shipment:scan_pickup`, `shipment:scan_warehouse`.
- Finance: `finance:view`, `finance:view_margin`, `finance:view_client_balance`, `finance:view_partner_settlement`, `finance:allocate_funds`, `finance:reverse_funds`.
- Invoice: `invoice:create`, `invoice:view`, `invoice:send`, `invoice:mark_paid`, `invoice:export`.
- COD: `cod:view`, `cod:update`, `cod:settle`, `cod:remit`.
- Reports: `reports:view`, `reports:export`, `reports:view_profit`, `reports:view_company`, `reports:view_own`.
- Users: `users:invite`, `users:update`, `users:disable`, `users:view`.
- Integrations: `phenix:export`, `phenix:import`, `phenix:reconcile`, `chatwoot:view_logs`, `chatwoot:send_test`.
- Settings/audit: `settings:update`, `audit:view`.

### Organization scoping

Every sensitive read/write should resolve an access scope from server-side membership, not from request query alone:

- Platform super/admin: all organizations.
- Platform finance: all finance unless future scoped.
- Account manager: assigned organizations only.
- Client owner/admin/manager: all permitted shipment data inside own company, including shipments created by other company users.
- Client accountant: own organization finance/invoice/COD/report data, no internal cost/margin.
- Client operations: company shipments if granted, otherwise own/on-behalf shipments only, no finance.
- Limited/regular client user: created/assigned/on-behalf shipments only.
- Driver: assigned pickups/shipments only.
- Partner: assigned carrier/settlement records only.

### Shipment ownership rules

Shipment access should check, in order:

1. Platform permission for all shipments.
2. Assigned account-manager portfolio.
3. Company membership and `shipment:view:company`.
4. Direct `userId` ownership, explicit on-behalf assignment, and `shipment:view:own`.
5. Assigned staff/driver relationship.
6. Public tracking projection only.

### Finance visibility rules

Separate finance into layers:

- Client billing view: invoices, statements, payments, COD remittance, client charge.
- Internal finance view: balances, payments, allocations, credit holds, COD ledger.
- Internal margin view: carrier cost, markup, margin, partner settlement, reconciliation.
- Public tracking: no finance.

## 9. Migration Plan

### Phase 1 - Stabilize Security

- Centralize shipment access checks and use them on every shipment detail/subresource endpoint.
- Scope shipment stats by user access.
- Require organization access on all finance organization endpoints.
- Validate payment, shipment, allocation, and organization consistency in finance writes.
- Remove `driver` from platform-wide visibility and scope drivers to assigned work.
- Protect report exports and internal profitability data.
- Add tests for cross-org denial on shipment detail, stats, finance, allocation, and documents.

### Phase 2 - Formalize Roles

- Introduce role constants in one shared backend source.
- Map current roles to planned platform/client roles.
- Separate internal platform roles from client roles.
- Add client company roles: owner/admin/manager/accountant/operations/report viewer/limited.
- Split current client roles into company-wide manager/admin visibility and regular client own/on-behalf visibility.
- Update frontend route guards to use capabilities, not raw role arrays.

### Phase 3 - Permission System

- Add role-permission mapping.
- Add per-company membership via `OrganizationUser`.
- Add `UserScope` for branch/department/own-created/assigned filters.
- Add user permission overrides only for exceptions.
- Add account-manager portfolio assignment.

### Phase 4 - Finance/Accounting Layer

- Add invoice model, invoice lines, invoice send logs.
- Add COD ledger model and permissions.
- Add partner settlement model and permissions.
- Add Phenix Bridge export/import/reconciliation permissions and reference fields.
- Add report APIs that return role-filtered data instead of client-side calculations over broad objects.

### Phase 5 - Audit & Compliance

- Use `SystemAuditLog` or a stronger immutable audit table for sensitive actions.
- Log finance/payment/allocation/reversal/COD/invoice/Phenix actions.
- Log report exports.
- Log user role and permission changes.
- Log credit hold overrides.
- Add audit viewer with strict `audit:view` permission.

## 10. Suggested Database Changes

Prefer extending the current schema rather than replacing it.

Suggested future tables:

```txt
OrganizationUser
Role
Permission
RolePermission
UserPermissionOverride
UserScope
ShipmentVisibilityAssignment
AccountManagerPortfolio
AuditLog
ReportAccessLog
FinanceAccessPolicy
Invoice
InvoiceLine
InvoiceSendLog
CodRecord
CodSettlement
PartnerSettlement
PhenixSyncBatch
PhenixSyncRecord
```

Suggested additions to existing tables:

- `User.userType`
- `User.tokenVersion` or `passwordChangedAt`
- `Organization.type` as enum, not free string
- Plan a deliberate product/schema terminology migration from `Organization` to `Company` if the business wants code to match product language.
- `Shipment.branchId`, `departmentId`, `createdByUserId` if branch/department visibility becomes real
- `Shipment.createdOnBehalfOfUserId` or `ShipmentVisibilityAssignment` for shipments created by staff/managers on behalf of regular client users
- `Payment.phenixReference`
- `OrganizationLedger.visibilityClass` or separate internal/client ledger projections

## 11. Suggested Backend Architecture

Centralize all access checks. Avoid scattered inline role checks.

Recommended helpers/middleware:

```txt
requireAuth()
requireRole()
requirePermission()
requireOrganizationAccess()
requireShipmentAccess()
requireInvoiceAccess()
requireFinanceAccess()
requireReportAccess()
requireAssignedDriverShipment()
requireClientCompanyScope()
```

Recommended service layer:

```txt
AccessControlService.resolveActor(req.user)
AccessControlService.canViewOrganization(actor, organizationId)
AccessControlService.canViewShipment(actor, shipment)
AccessControlService.canMutateShipment(actor, shipment, action)
AccessControlService.canViewFinance(actor, organizationId, financeView)
AccessControlService.canExportReport(actor, reportType, scope)
```

Every endpoint that accepts `shipmentId`, `trackingNumber`, `organizationId`, `paymentId`, `allocationId`, future `invoiceId`, future `codId`, or report filters should call this layer.

## 12. Suggested Frontend Architecture

Frontend should improve UX only. Backend remains authoritative.

Recommended pieces:

```txt
AuthProvider
PermissionProvider
Can
useCan()
RouteGuard
FinanceGuard
ClientScopedPage
InternalOnlyPage
ReportGuard
```

Recommended changes:

- Replace raw role arrays in routes with permission/capability checks.
- Keep route visibility, sidebar visibility, and component action visibility from the same capability source.
- Add forbidden states rather than redirecting silently.
- Treat finance/profit/COD/Phenix/report export as separate UI permissions.
- Remove internal margin/cost fields from client-facing data shapes, not just from visual rendering.

## 13. Files That Should Be Patched First

1. `backend/src/middleware/rbac.policy.js`
2. `backend/src/middleware/authorize.middleware.js`
3. `backend/src/controllers/shipment-crud.controller.js`
4. `backend/src/controllers/shipment-tracking.controller.js`
5. `backend/src/controllers/shipment-checkpoint.controller.js`
6. `backend/src/controllers/shipment-ops.controller.js`
7. `backend/src/controllers/shipment-public.controller.js`
8. `backend/src/controllers/finance.controller.js`
9. `backend/src/services/financeLedger.service.js`
10. `backend/src/routes/finance.routes.js`
11. `frontend/src/routes/index.jsx`
12. `frontend/src/utils/capabilities.jsx`
13. `frontend/src/pages/FinancePage.jsx`
14. `frontend/src/components/FinanceReports.jsx`

## 14. Suggested Next Codex Prompt for Phase 1

```txt
Use Superpowers systematic debugging and test-driven development.

Implement Phase 1 security stabilization from docs/audits/user-roles-hierarchy-visibility-audit.md.

Scope:
- Add centralized backend shipment and organization access helpers.
- Apply shipment access checks to shipment detail, stats, history, ETA, distance, location update, checkpoints, public settings, label, booking options, booking, pickup scan, warehouse scan, and documents.
- Require organization access on finance organization endpoints.
- Validate payment/shipment/allocation organization consistency before finance writes.
- Remove driver from platform-wide visibility and scope driver access to assigned shipments/pickups.
- Add focused backend tests for cross-organization denial and allowed internal access.
- Do not redesign the full role system yet.

Deliver:
- Minimal safe patch set.
- Tests proving the IDOR fixes.
- Update docs/PLATFORM_FEATURES.md only if behavior changes.
```

## Assumptions

- Phenix remains side-by-side for now.
- Target-Prod should become the logistics operations and finance source of truth before replacing Phenix.
- Client companies are currently named `Organization` in code, but the desired product term is `Company`.
- Company managers need company-wide shipment visibility across all users in their company.
- Regular client users need own/on-behalf shipment visibility only.
- Client users must not see internal cost, margin, partner settlement, Phenix internal references, or internal audit details unless explicitly granted later.
- No large implementation changes were made as part of this audit.
