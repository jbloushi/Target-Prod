# Role Hierarchy and Access Model

Reviewed: 2026-05-04

This is the working role/access guide for Target Logistics. Use it when discussing who can see, create, approve, book, edit, finance, export, or administer data.

## Agreed Direction

Decisions captured on 2026-05-04:

- `accounting` keeps broad administrative powers for now, including user, organization, pricing, and carrier administration.
- `manager` should not see financial margin or carrier cost data.
- Client company users should be able to see balance and invoices, but not payments, allocations, cost/margin, or internal ledger controls.
- `org_manager` should be able to manage users inside their own organization.
- Shipment location and checkpoint mutation should be operations-only.

## How To Use This Doc

- Treat this file as the product/engineering baseline for role behavior.
- Treat backend code as the security source of truth.
- Treat frontend route/sidebar guards as UX hints only.
- Update this doc whenever role behavior, shipment visibility, finance visibility, user-management behavior, or API-key behavior changes.
- Keep historical findings in `docs/audits/`; keep current operating rules here.

Related docs:

- `docs/PLATFORM_FEATURES.md` is the maintained feature catalog.
- `docs/modules/shipments.md` explains shipment lifecycle and carrier booking.
- `docs/modules/accounting-finance.md` explains ledger, payments, allocations, and invoices.
- `docs/audits/user-roles-hierarchy-visibility-audit.md` is a historical audit. Some findings there have already been fixed, so do not use it as the current source of truth without checking code.

Primary code sources:

- Backend capabilities: `backend/src/middleware/rbac.policy.js`
- Backend object scoping: `backend/src/middleware/authorize.middleware.js`
- Frontend capability mirror: `frontend/src/utils/capabilities.jsx`
- Frontend route guards: `frontend/src/routes/index.jsx`
- Sidebar visibility: `frontend/src/components/layout/Sidebar.jsx`

## Current Role Layers

| Layer | Roles | Scope |
| --- | --- | --- |
| Platform-wide control | `admin`, `accounting`, `manager` | Can see platform-wide shipment/organization data. |
| Assignment-scoped internal ops | `staff`, `driver` | Must be assigned directly or through access scopes. Not platform-wide. |
| Client company | `org_manager`, `org_agent`, `client` | Organization-scoped. `client` is legacy-equivalent to `org_agent`. |

Important distinction:

- `org_manager` has company-wide shipment visibility for its organization.
- `org_agent` and `client` see shipments they own or shipments created on their behalf.
- `staff` and `driver` are not global viewers. They need assignment or `UserAccessScope`.

## Role Capability Matrix

| Capability | admin | accounting | manager | staff | driver | org_manager | org_agent | client |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Manage users | Yes | Yes | Yes | No | No | No | No | No |
| Manage organizations | Yes | Yes | Yes | No | No | No | No | No |
| Manage pricing/carriers | Yes | Yes | Yes | No | No | No | No | No |
| View cost/margin data | Yes | Yes | No | No | No | No | No | No |
| View finance | Yes | Yes | Yes | No | No | Balance/invoices only | Balance/invoices only | Balance/invoices only |
| Post/allocate payments | Yes | Yes | No | No | No | No | No | No |
| Reverse payment allocation | Yes | Yes | No | No | No | No | No | No |
| View all platform shipments | Yes | Yes | Yes | No | No | No | No | No |
| Approve pickups/shipments | Yes | Yes | Yes | Yes | No | No | No | No |
| Book carriers | Yes | Yes | Yes | Yes | No | No | No | No |
| View documents | Yes | Yes | Yes | Yes | No | No | No | No |
| Create shipments | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes |
| Generate API key | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes |
| Driver operations | No | No | No | No | Yes | No | No | No |

Notes:

- `accounting` currently has broad admin-like powers, including user/org/pricing/carrier management. This is approved for now.
- `manager` currently has user/org/pricing/carrier management and finance visibility but cannot post/reverse payments. Manager cost/margin visibility should be removed.
- `staff` can approve and book, but cannot view finance/cost data and cannot manually change status through the generic status editor.
- `driver` is limited to driver operations and assigned shipment visibility.

## Shipment Visibility

| Role | Shipment list/stat visibility | Shipment detail visibility |
| --- | --- | --- |
| `admin` | All platform shipments; can filter by organization. | Any shipment. |
| `accounting` | All platform shipments; can filter by organization. | Any shipment. |
| `manager` | All platform shipments; can filter by organization. | Any shipment. |
| `staff` | Assigned staff shipments plus configured `UserAccessScope` clients/companies. | Same as list scope. |
| `driver` | Assigned driver shipments plus configured `UserAccessScope` clients/companies. | Same as list scope. |
| `org_manager` | All shipments in own organization. | Any shipment in own organization. |
| `org_agent` | Own shipments and shipments created on their behalf. | Own/on-behalf shipments only. |
| `client` | Own shipments and shipments created on their behalf. | Own/on-behalf shipments only. |

Shipment scoping is implemented through:

- `scopeShipmentWhere(req, query)` for list/stat style queries.
- `canAccessShipment(req, shipment)` for detail and subresource checks.
- `canCreateShipmentForUser(req, targetUser)` for creating on behalf.

## Shipment Actions

| Action | Current allowed roles |
| --- | --- |
| Create own shipment | `admin`, `accounting`, `manager`, `staff`, `org_manager`, `org_agent`, `client` |
| Create on behalf | Platform roles, company manager for own org users, scoped staff/driver if `canCreateOnBehalf` scope allows. |
| Quote shipment | Authenticated users, with assigned carrier/service enforcement for client roles. |
| Book with carrier | Roles with `BOOK_CARRIERS`: `admin`, `accounting`, `manager`, `staff`. Also requires shipment access. |
| Manual status update | `admin`, `manager`, `accounting`. |
| Pickup scan | `driver`, `staff`, `admin`, plus shipment access. |
| Warehouse scan | `admin`, `staff`, plus shipment access. |
| Delete shipment | Route requires `MANAGE_USERS`; controller allows admin/staff/manager/accounting or accessible owner, and only draft/ready shipments. This should become a dedicated shipment-delete capability. |
| View cost data | `admin`, `accounting`. Cost fields are redacted for others. |
| View carrier documents | `admin`, `accounting`, `manager`, `staff`. Document fields are redacted for others. |

## Finance Visibility

| Area | Current access |
| --- | --- |
| Own balance | Authenticated users linked to an organization. |
| Ledger | Organization roles are forced to own organization; platform roles can query selected organization. |
| Organization overview | `VIEW_FINANCE` plus organization access. |
| Payments | `VIEW_FINANCE` for listing; `MANAGE_PAYMENTS` for posting/allocation. |
| Invoices | `VIEW_FINANCE` for listing; `MANAGE_PAYMENTS` for create/status update. |
| Allocation reversal | `REVERSE_PAYMENTS` plus organization access. |
| Shipment accounting | `VIEW_FINANCE` plus organization access. |

Current finance-sensitive roles:

- `admin`
- `accounting`
- `manager`

Agreed direction:

- `manager` keeps finance visibility but loses cost/margin visibility.
- `accounting` keeps broad admin-like powers for now.
- Client company users get balance and invoice visibility, but not payment posting, allocations, reversals, internal ledger controls, or cost/margin views.

## User Management and Access Scopes

User management currently supports:

- Creating/editing users.
- Assigning shipping access: one network/service pair or Manual Shipment.
- OTE fixed fee and OTE billing currency.
- Optional service markup.
- Staff/driver scoped access to selected client users or selected companies.

`UserAccessScope` supports:

| Scope type | Meaning |
| --- | --- |
| `CLIENT_USER` | Scoped internal user can view/create for one specific client user if allowed. |
| `COMPANY_ALL_USERS` | Scoped internal user can view/create for all users in one organization if allowed. |

Current scoped roles:

- `staff`
- `driver`

## Frontend Page Visibility

Frontend routes currently allow broader access than some sidebar items. Backend must remain the final authority.

| Page | Route guard roles | Sidebar visibility |
| --- | --- | --- |
| Dashboard | `admin`, `staff`, `client`, `manager`, `accounting`, `org_manager`, `org_agent` | Everyone with no item-specific role restriction. |
| Shipments | `admin`, `staff`, `client`, `manager`, `accounting`, `org_manager`, `org_agent` | Everyone with no item-specific role restriction. |
| Create shipment | `admin`, `staff`, `client`, `manager`, `accounting`, `org_manager`, `org_agent` | Usually reached through shipment flows. |
| Shipment detail | `admin`, `staff`, `client`, `manager`, `accounting`, `org_manager`, `org_agent` | Not sidebar-driven. |
| Shipment edit | `admin`, `staff`, `client`, `org_manager`, `org_agent` | Not sidebar-driven. |
| Admin users | `admin` | `admin` only. |
| Organizations | `admin`, `staff`, `manager` | `admin`, `staff`, `manager`. |
| Finance | `admin`, `staff`, `client`, `manager`, `accounting`, `org_manager`, `org_agent` | Sidebar shows only `admin`, `accounting`, `manager`, `staff`. Backend finance APIs still enforce capabilities. |
| Driver pickup | `driver`, `admin`, `staff` | Standalone route. |
| Warehouse scan | `admin`, `staff`, `manager` | `admin`, `staff`, `manager`. |
| API docs | `admin`, `staff`, `client`, `manager`, `accounting`, `org_manager`, `org_agent` | Everyone with no item-specific role restriction. |
| Settings | `admin`, `staff`, `client`, `driver`, `manager`, `accounting`, `org_manager`, `org_agent` | Everyone with no item-specific role restriction. |

Mismatch to discuss:

- Finance route allows client/org roles, but sidebar hides finance from them. This is acceptable only if the Finance page gracefully shows self-service balance/ledger and backend denies privileged finance endpoints.
- `staff` can open Finance from sidebar, but backend does not grant `VIEW_FINANCE`; the page must not assume privileged finance access.

## Current Risk Review

| Risk | Severity | Notes |
| --- | --- | --- |
| `accounting` has broad admin-like management capabilities. | Accepted | Approved for now; revisit before production hardening if needed. |
| `manager` has user/org/pricing/carrier management and finance/cost visibility. | Medium | Remove cost/margin visibility while keeping operational/finance summary access. |
| Shipment delete uses `MANAGE_USERS` instead of a shipment-specific capability. | Medium | Add `DELETE_SHIPMENTS` or `MANAGE_SHIPMENTS`. |
| Checkpoint add/update/delete only requires shipment access. | Medium | Agreed target: ops-only capability. |
| Location update only requires shipment access plus status permission if status changes. | Medium | Agreed target: ops-only capability for authenticated mutation; public/signed location update can remain separate. |
| Pickup requests for platform roles are broad. | Medium | Staff/driver assignment scoping for pickup lists should be reviewed. |
| Frontend role guards and backend capabilities are not fully aligned. | Medium | Prefer capability-driven frontend checks over role arrays. |
| Public location update exists when enabled on shipment. | Medium | Consider signed token or one-time link for production. |

## Recommended Target Model

Suggested production-clean role model:

| Proposed role | Purpose |
| --- | --- |
| `admin` | Platform superuser. |
| `manager` | Platform operations manager; broad shipment visibility, approval, booking, finance summary, reporting, but no cost/margin visibility. |
| `accounting` | Finance/admin user; payments, invoices, ledgers, allocations, finance reports, and currently broad admin-like configuration access. |
| `staff` | Operations user; assigned/scoped shipments, pickup approvals, booking, docs, warehouse flow. |
| `driver` | Assigned pickup/delivery work only. |
| `org_manager` | Client company manager; company-wide shipments, API key, address book, maybe company finance summary if enabled. |
| `org_agent` | Client company user; own/on-behalf shipments. |
| `client` | Legacy alias; migrate to `org_agent` over time. |
| Future: `org_accounting` | Client-side finance/billing viewer for own organization. |

Suggested new capabilities:

- `MANAGE_SHIPMENTS`
- `DELETE_SHIPMENTS`
- `MANAGE_SHIPMENT_CHECKPOINTS`
- `UPDATE_SHIPMENT_LOCATION`
- `VIEW_INVOICES`
- `MANAGE_INVOICES`
- `MANAGE_ORG_USERS`
- `VIEW_REPORTS`
- `EXPORT_DATA`
- `MANAGE_CLIENT_USERS`
- `VIEW_AUDIT_LOGS`

## Discussion Checklist

Use this checklist when deciding the next role iteration:

- Should `staff` see any finance page, or only shipment billing labels?
- Should `org_agent` be allowed to generate API keys, or only `org_manager`?
- Should shipment deletion be admin-only or allowed for clients while draft?
- Should `client` be kept as a legacy role or migrated out?

## Immediate Recommendations

1. Keep backend guards as the security boundary.
2. Convert frontend route guards from role arrays to capability checks where possible.
3. Split `MANAGE_USERS` away from shipment deletion.
4. Remove `VIEW_COST_DATA` from `manager`.
5. Add explicit ops capabilities for checkpoints/location updates.
6. Add balance/invoice-only finance visibility for client company users.
7. Add own-organization user management for `org_manager`.
