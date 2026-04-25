# Platform Features

This is the maintained feature catalog for Target Logistics. Future developers should update this file whenever platform behavior changes.

Last reviewed: 2026-04-14

## Product Summary

Target Logistics is a shipment operations platform that supports internal platform users, client users, API clients, carrier-backed shipments, Manual Shipments, pickup operations, public tracking, and finance/accounting workflows.

## Core Invariants

- There are only two shipment types: `package` (`Standard Package`) and `documents` (`Document Express`).
- A client user has exactly one shipping access assignment: one carrier/service pair or Manual Shipment.
- Client API callers should not send carrier or service fields. The backend derives access from the API key owner.
- Manual Shipments use `carrierCode: MANUAL`, have no carrier service code, and are not booked with a 3PL carrier.
- Manual Shipments do not show or use the Manage Approval / carrier booking action.
- Manual Shipment price, cost, currency, and estimated delivery can be edited inside shipment editing by authorized platform roles.
- Manual status changes are allowed only for `admin`, `manager`, and `accounting` roles.
- Automated status movement still occurs through carrier booking, carrier tracking sync, pickup scans, and warehouse scans where those flows apply.
- Public tracking is customer-facing, light by default, and branded as Target Logistics.

## Roles And Access

| Role | Scope | Main Capabilities |
| --- | --- | --- |
| `admin` | Platform | Full user/org/pricing/carrier/finance/shipment access. Can manually update shipment status. |
| `manager` | Platform | Operational shipment visibility, booking, documents, finance visibility. Can manually update shipment status. |
| `accounting` | Platform | Finance/payment workflows, shipment visibility, booking/documents. Can manually update shipment status. |
| `staff` | Platform | Shipment operations, booking, documents, pickup and warehouse workflows. Cannot manually change status through the generic status editor. |
| `driver` | Platform operations | Driver pickup operations and shipment visibility needed for assigned work. |
| `org_manager` | Organization | Create and view organization shipments, generate API key. |
| `org_agent` | Organization | Create and view organization shipments, generate API key. |
| `client` | Organization | Legacy/client-facing equivalent of org agent. |

Sources of truth:

- Backend RBAC: `backend/src/middleware/rbac.policy.js`
- Frontend RBAC: `frontend/src/utils/capabilities.jsx`
- Status update helper: `backend/src/controllers/shipment.helpers.js`

## Shipping Access Policy

Client users are assigned one of these options during user creation or user editing:

- Manual Shipment.
- DGR/DHL with one service code such as `P`, `Y`, or `H`.
- Another carrier/service option if enabled by the platform.

The assignment is stored in `user.agentPolicy.shippingAccess` and mirrored into `user.carrierConfig` for compatibility.

Backend enforcement lives in `backend/src/services/shippingAccess.service.js`.

## Shipment Creation

The platform supports shipment creation from:

- The authenticated web app shipment wizard.
- Client API endpoint `POST /api/v1/shipments`.
- Pickup approval workflows that create or connect shipments.

Shipment creation normalizes addresses, parcels, items, shipment type, currency, incoterm, and assigned carrier access.

For platform-created shipments, platform roles can create shipments on behalf of selected users. For client users and API clients, carrier/service selection is enforced from the assigned access policy.

## Manual Shipments

Manual Shipment is used when Target Logistics needs to create and manage a shipment inside the platform without registering it with a 3PL carrier.

Manual Shipment behavior:

- Carrier code is `MANUAL`.
- Service code is `null`.
- Tracking numbers are generated with the manual tracking number path.
- Carrier booking is skipped.
- Carrier labels/invoices are not expected from a 3PL adapter.
- Manual cost, sale price, currency, and estimated delivery can be maintained in shipment editing.
- Public tracking still works.
- Status can be updated through the platform by `admin`, `manager`, and `accounting`.

## Carrier-Backed Shipments

Carrier-backed shipments use adapter services behind `CarrierFactory`.

Current carrier list:

| Carrier | Status | Notes |
| --- | --- | --- |
| `MANUAL` | Active | Internal/manual shipments. |
| `DGR` | Active | DHL/DGR adapter path. |
| `DHL` | Compatibility | Backward-compatible alias handled by DGR adapter paths. |
| `LOGESTECHS` | Active | Shipment (v2) + fulfillment (v5) adapter integration with credentialed header auth. |
| `ARAMEX` | Adapter present | Basic adapter option exists. Confirm before production rollout. |
| `FEDEX` | Inactive | Listed but not active for normal use. |
| `UPS` | Inactive | Not implemented. |

Carrier-backed behavior includes rate lookup, booking, document generation where supported, and tracking sync.

## Shipment Status Lifecycle

Canonical statuses:

| Status | Label |
| --- | --- |
| `draft` | Draft |
| `pending` | Pending Review |
| `booked` | Booked |
| `ready_for_pickup` | Ready for Pickup |
| `picked_up` | Picked Up |
| `in_transit` | In Transit |
| `out_for_delivery` | Out for Delivery |
| `delivered` | Delivered |
| `exception` | Exception |
| `cancelled` | Cancelled |

Status sources:

- Creation sets initial shipment state.
- Carrier booking can set booked/confirmed state.
- Carrier tracking sync can promote status forward based on carrier events.
- Driver pickup scan sets `picked_up` where allowed.
- Warehouse scan sets `in_transit` where allowed.
- Manual status editor is limited to `admin`, `manager`, and `accounting`.

Backend status source of truth: `backend/src/constants/statusConstants.js`.
Frontend display source of truth: `frontend/src/constants/statusConfig.jsx`.

## Shipment Editing

Editable shipment fields include route/address data, parcels, items, incoterm, currency, dangerous goods, customer/reference fields, public location setting, and status where authorized.

Carrier-backed shipments re-rate when critical shipment details change. Manual Shipments do not call carrier rating and can accept manually maintained commercial values.

Manual-only commercial fields:

- `price`
- `costPrice`
- `currency`
- `estimatedDelivery`

## Pickup And Warehouse Operations

Pickup workflows support:

- Client pickup request creation.
- Platform review and approval/rejection.
- Driver pickup scans.
- Auto-handling of pickup request scan paths where applicable.

Warehouse workflows support scanning a picked up or ready shipment into the warehouse network and promoting it to `in_transit`.

## Public Tracking

Public tracking is exposed without authentication for customer tracking pages.

Public tracking supports:

- Tracking code search.
- Customer-facing status headline and progress steps.
- Shipment details, timeline, and event log.
- Optional public destination/location update route.
- Light branded Target Logistics presentation by default.

Routes include:

- Frontend: `/track` and `/track/:trackingNumber`
- Backend: `/api/public/shipments/:trackingNumber`

## Client API

Client API capabilities:

- Create shipments using assigned carrier/service or Manual Shipment.
- Get assigned-service quotes.
- Update editable shipment details before the shipment is too far along.
- Track owned shipments.
- Manage address book records.
- Create and view pickup requests.

Client API keys are attached to users and validated by API key middleware. See [../CLIENT_API_GUIDE.md](../CLIENT_API_GUIDE.md).

## Finance And Accounting

Finance features include:

- Organization balances and credit limits.
- Shipment pricing snapshots.
- Carrier rate, markup, total price, and remaining balance fields.
- Organization ledger entries.
- Payment posting.
- Manual allocation and FIFO allocation.
- Allocation reversal.
- Finance visibility and mutation capabilities controlled by RBAC.

Finance routes are under `/api/finance`.

## Production Verification

The release gate is automated through `npm run verify` from the repository root.

It covers:

- Frontend ESLint checks.
- Backend Jest tests for shipment access policy, API key auth, client API carrier/service enforcement, manual shipment editing, automatic carrier status promotion, finance payment posting, and manual payment allocation.
- Frontend Vitest tests for status rendering rules, client/platform capabilities, and CSV export behavior.
- Vite production build.
- npm audit checks for root, backend, and frontend packages.

Database releases use committed Prisma migrations. Run `npm run db:migrate:deploy` in staging and production before starting the backend whenever `backend/prisma/migrations` changes. The root `npm run deploy:prepare` command runs backend Prisma generation, applies migrations, and builds the frontend.

## Organizations And Users

Organization features:

- Multi-tenant client organizations.
- Organization-level markup and allowed carrier policy.
- Organization members.
- Address storage.
- Payments, ledger entries, allocations, and pickup requests.

User features:

- JWT login.
- API key generation.
- Role assignment.
- Organization assignment.
- Shipping access assignment.
- Markup override and credit limit fields.
- Active/inactive status.

## Documents And Labels

Shipment documents may include labels, AWBs, invoices, and hosted PDFs depending on carrier and booking flow.

Runtime document files live under `backend/uploads/documents`. Generated files should not be committed. The `.gitkeep` file keeps the directory present.

## Location And Address Features

Location/address features include:

- Address book APIs.
- Sender/receiver normalization.
- Public receiver/location update route.
- Geocode routes.
- Nearby shipment lookup.
- Current location and checkpoint JSON on shipments.

## UI Feature Areas

Primary frontend pages include:

- Dashboard.
- Shipment list.
- Shipment wizard.
- Shipment details and editing.
- Public tracking landing and tracking detail.
- Driver pickup page.
- Warehouse scan page.
- Finance page.
- Settings and API key management.
- Admin users page.
- Admin organizations page.
- Address book.
- Static legal/contact/about pages.

## Known Boundaries

- The legacy document-model path has been removed from the maintained backend. Prisma is the active database path.
- FedEx and UPS should not be presented as production-ready carrier options without implementation review.
- Webhook persistence and dispatcher code exists, but developer-facing webhook management docs should be written only when the management API and operational contract are finalized.
- Deleted historical audit docs should stay deleted unless they are rewritten as maintained current documentation.
