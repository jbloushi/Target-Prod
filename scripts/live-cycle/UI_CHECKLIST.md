# Live Shipment Life-Cycle — Manual UI Checklist

Target: https://target-kw.com (web portal). Derived from code (no prod access when written):
`frontend/src/routes/index.jsx`, `frontend/src/utils/roleLabels.js`, `frontend/src/constants/statusConfig.jsx`,
`backend/src/middleware/rbac.policy.js`, `routes/{shipment,fleet,pickup,finance,auth,api}.routes.js`,
`controllers/shipment-{ops,tracking,booking,crud,public}.controller.js`, `services/ShipmentLifecycleService.js`.

How to use: tick `[x]` when the *expected* result is observed; otherwise leave `[ ]` and write the actual outcome in **Result/Notes** (and file a bug in REPORT_TEMPLATE.md). Use a unique test marker (e.g. reference `LIVE-<date>-<role>`) on every shipment and **cancel or clearly mark test data afterwards**. Do not trigger real carrier bookings/charges unless the step says so (use `isTest`/INTERNAL where possible).

> [!IMPORTANT]
> Items tagged **⚠ CODE-GAP** are places where code reading shows UI route gate and backend gate disagree, or a documented transition is not actually permitted. Verify them deliberately; either outcome is a finding.

## 0. Reference

### 0.1 Roles (role key → UI label)
| Key | Label | Used as |
|---|---|---|
| `admin` | Superadmin | Admin |
| `manager` | Target Owner | (optional; same as admin minus MANAGE_PAYMENTS/REVERSE_PAYMENTS/SYSTEM_SETTINGS) |
| `staff` | Target Ops Staff | Staff / dispatcher / warehouse scanner |
| `accounting` | Target Accounting | Accounting / finance |
| `driver` | Courier Driver | Driver |
| `org_manager` | Company Manager | Credit/org client (company-wide visibility, manages org users) |
| `org_agent` / `client` | Company Client | Client users (carrier-backed, INTERNAL, manual-mode) |
| *(none)* | public | No login |

### 0.2 Test accounts (fill in before starting)
| Persona | Role key | Email | Org | Notes |
|---|---|---|---|---|
| Admin | admin | | | |
| Staff/Dispatcher | staff | | | |
| Warehouse scanner | staff (or admin) | | | scan endpoint accepts only `admin`,`staff` |
| Accounting | accounting | | | |
| Client – carrier-backed | client/org_agent | | | allowedCarriers includes DGR/etc. |
| Client – domestic INTERNAL | client/org_agent | | | carrier INTERNAL (stored `MAN`) |
| Client – manual-mode | client/org_agent | | | quote returns `requiresManualPricing` |
| Client – credit/org | org_manager (+ org_agent) | | | org `creditLimit` > 0 |
| Driver | driver | | | |

### 0.3 Statuses (`statusConfig.jsx` / backend `SHIPMENT_STATUSES`)
`draft → pending → (pending_approval) → booked → ready_for_pickup → picked_up → received_at_hub → verified → in_transit → out_for_delivery → delivered`; side states `exception`, `cancelled`, `rto_in_transit`, `returned`. Public progress bar shows only: booked, picked_up, in_transit, out_for_delivery, delivered.

### 0.4 Who can do each transition (from code)
| Transition / action | Endpoint | Backend gate | Notes |
|---|---|---|---|
| create (draft/pending) | `POST /api/shipments` | `CREATE_SHIPMENTS` (admin, manager, staff, accounting, client, org_*) | driver ✗ |
| book (→ booked / pending_approval) | `POST /api/shipments/:tn/book` | `BOOK_CARRIERS` (admin, manager, staff, accounting) | clients book via create/auto-book flow |
| approve pickup request | `POST /api/pickup/:id/approve|reject` | `APPROVE_SHIPMENTS` | |
| → picked_up (or pending_approval if awaiting carrier booking) | `POST /api/shipments/:tn/pickup` | role ∈ {driver, staff, admin} **only**; from pending/draft/booked/ready_for_pickup/pending_approval; idempotent if already picked_up/in_transit | manager/accounting ✗ (400→403) |
| → received_at_hub / verified / in_transit | `POST /api/shipments/:tn/warehouse/scan` body `action: receive|verify|(other→in_transit)` | role ∈ {admin, staff} **only**; from picked_up/booked/ready_for_pickup/pending_approval/received_at_hub/verified/in_transit | weight/dim discrepancy flagged if Δ>0.05 kg |
| any manual status | `PATCH /api/shipments/:tn/status` | allowed set only for **admin, manager, accounting**: draft, pending, booked, ready_for_pickup, picked_up, in_transit, out_for_delivery, delivered, exception, cancelled | ⚠ CODE-GAP: **staff gets []** (403); received_at_hub, verified, pending_approval, rto_in_transit, returned are valid statuses but not in allowed set (403 even for admin) |
| manual shipments | same | status must be in `MANUAL_SHIPMENT_STATUSES` else 400 | |
| deliver + POD | `POST /api/shipments/:tn/deliver` | any user passing `canAccessShipment` (no role gate!) | ⚠ CODE-GAP: clients with access could mark delivered; test it |
| driver stop complete / exception | `POST /api/fleet/driver/complete-stop`, `/record-exception` | `DRIVER_OPS` or `MANAGE_FLEET` | |
| location update | `PATCH /:tn/location(/manual)` | `UPDATE_SHIPMENT_LOCATION` | status change inside also needs allowed-set |
| checkpoints | `POST/PATCH/DELETE /:tn/checkpoints` | `MANAGE_SHIPMENT_CHECKPOINTS` | |
| cancel (via status) | `PATCH …/status` `cancelled` | admin/manager/accounting | |
| delete shipment | `DELETE /:tn` | `MANAGE_USERS` | |
| dispatch runs | `GET /api/fleet/dispatch-deck`, `POST /runs` | `MANAGE_FLEET` (admin, manager, staff) | accounting has only `VIEW_FLEET` |
| settle run COD | `POST /api/fleet/runs/:id/settle-cod` | MANAGE_FLEET or MANAGE_PAYMENTS or VIEW_FINANCE | |
| ledger | `GET /api/finance/ledger` | `VIEW_FINANCE` | client ✗ |
| invoice view | `GET /api/finance/invoices/:id` | `VIEW_FINANCE` or `VIEW_INVOICES` | clients have VIEW_INVOICES |
| COD remit/confirm/settle merchant | `/api/finance/cod/*` | `MANAGE_PAYMENTS` (admin, accounting) | request-remittance: any authed (driver) |
| API key | `POST /api/auth/api-key` | `GENERATE_API_KEY` (all except driver) | |

### 0.5 Frontend route gates (`routes/index.jsx`)
| Route | Allowed roles |
|---|---|
| `/login`, `/signup`, `/track`, `/track/:tn`, `/track/:tn/location`, `/location/:token`, `/pay/:tn`, `/checkout/:tn`, `/returns(/:tn)`, `/api-docs`, `/privacy`, `/terms`, `/about`, `/contact` | public |
| `/dashboard`, `/dashboard-v2`, `/shipments`, `/create`, `/create-shipment`, `/tracking`, `/shipment/:tn`, `/address-book` | admin, staff, client, manager, accounting, org_manager, org_agent (`/finance` same list) |
| `/shipment/:tn/edit` | admin, staff, client, org_manager, org_agent (**not** manager/accounting) |
| `/warehouse/scan` | admin, staff, manager |
| `/driver/pickup`, `/driver/runs` | driver, admin, staff, manager |
| `/fleet/dispatch` | admin, manager, staff, accounting |
| `/admin/users` | admin, manager, accounting, org_manager |
| `/admin/organizations`, `/admin/rate-cards`, `/admin/phenix-audit`, `/admin/whatsapp-logs` | admin, manager, accounting, staff |
| `/support`, `/support/:id` | admin, staff, manager, accounting, org_manager, org_agent (**not** client) |
| `/settings` | all authenticated incl. driver |
| Settings superadmin tabs (`fleet, ratecards, phenix, whatsapp, notifications, routing`) | `admin` only (others bounced to `?tab=profile`) |
| Placeholders (InConstruction): `/analytics /calendar /warehouse /fleets /drivers /notifications /forgot-password` | any |

> Unauthorized role on a ProtectedRoute: record where it redirects (login vs dashboard vs 403 page) in Notes.

---

## 1. Common preflight (every role, run once per persona)
- [ ] **1.1 Login** at `/login` with persona credentials. Expected: lands on role-appropriate home (driver → `/driver/runs` or `/driver/pickup`; others `/dashboard`). Header shows role label from 0.1. Result/Notes: ____
- [ ] **1.2 Wrong password** shows error, no token stored. Result/Notes: ____
- [ ] **1.3 Nav menu** shows only items for the role (compare 0.5; Header items: Dashboard, Shipments, Support, New Shipment, Fleet Dispatch, Driver Runs, Warehouse Scan, Driver Pickup, Address Book, Organizations, Users, WhatsApp Logs, Phenix Audit, API Docs, Finance). Result/Notes: ____
- [ ] **1.4 Logout** then browser Back → protected page not visible. Result/Notes: ____
- [ ] **1.5 Language toggle EN/AR** switches RTL/LTR without layout break on current page. Result/Notes: ____

---

## 2. Admin (`admin`)
### 2.1 Access
- [ ] 2.1.1 Login (1.1); dashboard loads KPIs without error toast. Result/Notes: ____
- [ ] 2.1.2 All routes load: `/shipments /create /fleet/dispatch /warehouse/scan /driver/runs /driver/pickup /admin/users /admin/organizations /admin/rate-cards /admin/whatsapp-logs /admin/phenix-audit /finance /support /settings /address-book /api-docs`. Result/Notes: ____
- [ ] 2.1.2b (read-only) WhatsApp logs page opens; do **not** send anything. Result/Notes: ____
- [ ] 2.1.3 Settings shows superadmin tabs: Fleet & Paywall, Rate Cards, Phenix ERP Sync, Meta WhatsApp, Event Triggers, Carrier Gateways. Result/Notes: ____
### 2.2 Create / price / book (on behalf of a client)
- [ ] 2.2.1 `/create` wizard: steps 1 Sender → 2 Receiver → 3 Package → 4 Carrier → 5 Customs → 6 Review. Client selector present (admin can create for another user: `userId`). Required-field validation blocks Next. Result/Notes: ____
- [ ] 2.2.2 Step 4 shows quotes (`POST /shipments/quote`) incl. cost data (VIEW_COST_DATA) and markup. Result/Notes: ____
- [ ] 2.2.3 Step 6 policy checkbox required; Submit creates shipment, tracking number shown, status `pending`/`booked`. Result/Notes: ____
- [ ] 2.2.4 Book carrier from ShipmentDetails (`/shipment/:tn` → booking options → `POST /:tn/book`). Expected `booked`, carrier AWB present. (Use test/INTERNAL carrier.) Result/Notes: ____
### 2.3 Label / edit / documents
- [ ] 2.3.1 Print label (`GET /:tn/label`) opens printable HTML/PDF with tracking barcode, sender/receiver. Result/Notes: ____
- [ ] 2.3.2 Invoice doc (`GET /:tn/invoice`) renders. Result/Notes: ____
- [ ] 2.3.3 Edit via `/shipment/:tn/edit`; change receiver phone, save; details page and history reflect change. Result/Notes: ____
- [ ] 2.3.4 Edit after pickup: expected restricted/blocked per rules (record behavior). Result/Notes: ____
### 2.4 Status progression (admin may PATCH status)
Use a fresh INTERNAL/manual shipment. For each, ShipmentDetails status control or `PATCH /:tn/status`; check History tab entry (`source: platform`) and public `/track/:tn` update.
- [ ] 2.4.1 pending → booked. Result/Notes: ____
- [ ] 2.4.2 booked → ready_for_pickup. Result/Notes: ____
- [ ] 2.4.3 ready_for_pickup → picked_up (also try via `/driver/pickup` scan). Result/Notes: ____
- [ ] 2.4.4 picked_up → received_at_hub via `/warehouse/scan` (action receive). Result/Notes: ____
- [ ] 2.4.5 received_at_hub → verified via scan (action verify) with weight entered. Result/Notes: ____
- [ ] 2.4.6 **⚠ CODE-GAP** PATCH status `received_at_hub` / `verified` directly as admin → code says 403 (not in allowed set). Record. Result/Notes: ____
- [ ] 2.4.7 verified → in_transit (scan any other action, or PATCH). Result/Notes: ____
- [ ] 2.4.8 in_transit → out_for_delivery. Result/Notes: ____
- [ ] 2.4.9 out_for_delivery → delivered with POD (see 2.5). Result/Notes: ____
- [ ] 2.4.10 exception: set `exception` with description; shipment flagged on `/shipments` triage; then resume to in_transit. Result/Notes: ____
- [ ] 2.4.11 cancelled: on a separate pending shipment; shows Cancelled everywhere; cannot be edited/picked up. Result/Notes: ____
- [ ] 2.4.12 **⚠ CODE-GAP** `rto_in_transit` / `returned` via UI/PATCH → expect 403 or not offered. Record. Result/Notes: ____
- [ ] 2.4.13 Invalid status string (API) → 400 with list of valid statuses. Result/Notes: ____
- [ ] 2.4.14 Manual shipment: statuses outside `MANUAL_SHIPMENT_STATUSES` → 400. Result/Notes: ____
### 2.5 POD
- [ ] 2.5.1 Deliver with recipient name, relationship, signature, photo, notes (`POST /:tn/deliver`). Expected status delivered, POD in documents (`documents.pod`), history source `driver_pod`. Result/Notes: ____
- [ ] 2.5.2 POD visible on ShipmentDetails. Result/Notes: ____
- [ ] 2.5.3 COD shipment: `codCollected>0` sets `codStatus=COLLECTED`. Result/Notes: ____
### 2.6 Finance effect
- [ ] 2.6.1 `/finance` ledger shows an entry for the test shipment's charge; org balance moved by price. Result/Notes: ____
- [ ] 2.6.2 Invoice generated/openable (`/api/finance/invoices/:id`). Result/Notes: ____
- [ ] 2.6.3 Cancelled shipment reverses/credits ledger (CREDIT entry) or none charged. Result/Notes: ____
### 2.7 Settings / API
- [ ] 2.7.1 Settings → "API & Webhooks" tab → Generate/Regenerate API key. Key shown once; copy works; old key invalid after regenerate. Result/Notes: ____
- [ ] 2.7.2 `/api-docs` loads (no login needed), **ApiKeyPanel** ("Your Client API Key" card with "Manage API Keys" button → `/settings`) renders; code samples visible. Result/Notes: ____
- [ ] 2.7.3 Use new key (header `x-api-key: <userId>.<secret>`): `POST /api/v1/shipments` with required `Idempotency-Key` (missing → 400) creates shipment; `POST /api/shipments` with x-api-key only must be 401 (JWT portal router); appears in UI (see parity table). Result/Notes: ____
### 2.8 Negative
- [ ] 2.8.1 None of the role gates blocks admin; `/nonexistent` → NotFound page. Result/Notes: ____

---

## 3. Staff / Dispatcher (`staff` — "Target Ops Staff")
### 3.1 Access
- [ ] 3.1.1 Login; nav shows Shipments, Support, New Shipment, Fleet Dispatch, Driver Runs, Warehouse Scan, Driver Pickup, Organizations, WhatsApp Logs, Phenix Audit, API Docs, Finance. Result/Notes: ____
- [ ] 3.1.2 `/admin/users` → expected **blocked** by route (staff not in list) although backend caps include MANAGE_USERS. Result/Notes: ____
- [ ] 3.1.3 Settings: no superadmin tabs; `/settings?tab=fleet` bounces to profile. Result/Notes: ____
### 3.2 Create / book
- [ ] 3.2.1 Create shipment via wizard for a client (client selector). Result/Notes: ____
- [ ] 3.2.2 Book carrier (`BOOK_CARRIERS`) from details. Result/Notes: ____
- [ ] 3.2.3 Approve/reject a pending pickup request (`APPROVE_SHIPMENTS`). Result/Notes: ____
- [ ] 3.2.4 Label print + edit works (`/shipment/:tn/edit` allowed). Result/Notes: ____
### 3.3 Dispatch (`/fleet/dispatch`)
- [ ] 3.3.1 Dispatch deck loads unassigned shipments & drivers/vehicles. Result/Notes: ____
- [ ] 3.3.2 Create run: select driver + vehicle + shipments → run created, shipments get assigned driver. Result/Notes: ____
- [ ] 3.3.3 Add vehicle / edit vehicle. Result/Notes: ____
- [ ] 3.3.4 Settle run COD after driver completes. Result/Notes: ____
### 3.4 Transitions
- [ ] 3.4.1 Pickup via `/driver/pickup` scan (allowed: staff) → picked_up. Result/Notes: ____
- [ ] 3.4.2 `/warehouse/scan`: receive → received_at_hub; verify → verified. Result/Notes: ____
- [ ] 3.4.3 **⚠ CODE-GAP** Change status manually from ShipmentDetails (e.g. → out_for_delivery) as staff. Backend `getAllowedStatusUpdates` returns `[]` for staff → expect 403 "Permission denied to update shipment status". Record whether UI hides the control or shows a failing one. Result/Notes: ____
- [ ] 3.4.4 Add checkpoint / manual location (UPDATE_SHIPMENT_LOCATION, MANAGE_SHIPMENT_CHECKPOINTS). Result/Notes: ____
### 3.5 POD / finance
- [ ] 3.5.1 Record POD for a delivered shipment (`/deliver`) or via driver run. Result/Notes: ____
- [ ] 3.5.2 `/finance` visible (VIEW_FINANCE) — ledger readable; payment actions (MANAGE_PAYMENTS: remit/confirm COD, GL, AP) must be **forbidden**. Result/Notes: ____
### 3.6 Negative
- [ ] 3.6.1 `/admin/users` blocked; `/settings?tab=whatsapp` bounced. Result/Notes: ____
- [ ] 3.6.2 Delete shipment (`DELETE /:tn`) → 403 (needs MANAGE_USERS — note staff has it; record!). Result/Notes: ____

---

## 4. Accounting / Finance (`accounting` — "Target Accounting")
- [ ] 4.1 Login; nav: Dashboard, Shipments, Support, Organizations, Users, WhatsApp Logs, Phenix Audit, API Docs, Finance. Result/Notes: ____
- [ ] 4.2 `/finance` full access: ledger, invoices, GL accounts, journal entries, trial balance, balance sheet, income statement, AP vendors/bills, treasury, periods. Result/Notes: ____
- [ ] 4.3 Org ledger overview: creditLimit, balance, available credit match Admin view for same org. Result/Notes: ____
- [ ] 4.4 Open invoice for test shipment; amounts equal quote/price from client run. Result/Notes: ____
- [ ] 4.5 COD: driver summary (`/cod/driver-summary`), confirm remittance, settle merchant COD (MANAGE_PAYMENTS). Idempotent on double-click. Result/Notes: ____
- [ ] 4.6 Manual journal entry then reverse (`REVERSE_PAYMENTS`) — use clearly labeled test amount. Result/Notes: ____
- [ ] 4.7 Status: PATCH allowed set applies (accounting can set statuses). Try `delivered`→ recorded. Result/Notes: ____
- [ ] 4.8 Create shipment allowed (CREATE_SHIPMENTS); `/shipment/:tn/edit` → **blocked by route** (accounting not in edit list). Result/Notes: ____
- [ ] 4.9 **Negative:** `/fleet/dispatch` page opens (route allows) but dispatch-deck data → 403 (accounting lacks MANAGE_FLEET). Record whether page shows graceful message. Result/Notes: ____
- [ ] 4.10 **Negative:** `/warehouse/scan` blocked by route; `/driver/runs`,`/driver/pickup` blocked. Result/Notes: ____
- [ ] 4.11 Settings: no superadmin tabs. API key generation works (GENERATE_API_KEY). Result/Notes: ____
- [ ] 4.12 `/api-docs` loads with ApiKeyPanel. Result/Notes: ____
- [ ] 4.13 Pickup & warehouse scan via API as accounting → 403 (role list). Result/Notes: ____

---

## 5. Client user — carrier-backed (`client`/`org_agent`)
### 5.1 Access & negatives
- [ ] 5.1.1 Login; nav: Dashboard, Shipments, New Shipment, Address Book, API Docs, Finance(route open), no Fleet/Warehouse/Driver/Admin. Result/Notes: ____
- [ ] 5.1.2 **Forbidden:** `/fleet/dispatch`, `/warehouse/scan`, `/driver/runs`, `/driver/pickup`, `/admin/users`, `/admin/organizations`, `/admin/rate-cards`, `/admin/whatsapp-logs`, `/admin/phenix-audit`, `/support` (client only), `/settings?tab=fleet` → each blocked/redirected. Result/Notes: ____
- [ ] 5.1.3 **⚠ CODE-GAP** `/finance` route open to client but `GET /api/finance/ledger` needs VIEW_FINANCE. Record what the page shows (own invoices only? error?). Result/Notes: ____
### 5.2 Create via wizard
- [ ] 5.2.1 Step 1 sender from Address Book preset; Step 2 receiver (international or domestic with carrier). Result/Notes: ____
- [ ] 5.2.2 Step 3 package weight/dimensions; templates save/load (`/package-templates`). Result/Notes: ____
- [ ] 5.2.3 Step 4 shows only allowed carriers (org `allowedCarriers`); price includes org markup; **no cost data** visible (VIEW_COST_DATA). Result/Notes: ____
- [ ] 5.2.4 Step 5 customs fields for international (HS code, value, description) validate. Result/Notes: ____
- [ ] 5.2.5 Step 6 review → policy checkbox → Submit. Expected shipment created; client cannot choose another `userId`. Result/Notes: ____
- [ ] 5.2.6 Auto-book/book result: status `booked` (or `pending`/`pending_approval` awaiting staff). Carrier AWB shown if booked. Result/Notes: ____
### 5.3 Label / edit
- [ ] 5.3.1 Print label from details (own shipment). Result/Notes: ____
- [ ] 5.3.2 Edit own shipment before pickup (`/shipment/:tn/edit`). After booking, restrictions per rules recorded. Result/Notes: ____
- [ ] 5.3.3 Other client's tracking number `/shipment/:tn` → not found/403 (data isolation). Result/Notes: ____
### 5.4 Status & POD
- [ ] 5.4.1 Client cannot change status via UI; `PATCH /:tn/status` → 403. Result/Notes: ____
- [ ] 5.4.2 **⚠ CODE-GAP** `POST /:tn/deliver` as owner client → expect denial; code has no role gate. Record. Result/Notes: ____
- [ ] 5.4.3 After staff/driver progress shipment, client sees status timeline + POD on details & `/track/:tn`. Result/Notes: ____
### 5.5 Finance
- [ ] 5.5.1 Invoice for shipment viewable by client (VIEW_INVOICES) and amount = quote. Result/Notes: ____
### 5.6 API key
- [ ] 5.6.1 Settings → API & Webhooks → generate key. `/api-docs` ApiKeyPanel link → `/settings`. Result/Notes: ____
- [ ] 5.6.2 `POST /api/v1/quotes` and `POST /api/v1/shipments` (Idempotency-Key) with key succeed (also `GET /api/v1/tracking/:n`, `/api/client/shipments/:n`, `/api/client/pickups`); same shipment shows in UI list. Result/Notes: ____

---

## 6. Client user — domestic INTERNAL
- [ ] 6.1 Wizard Step 4: INTERNAL carrier offered for domestic (Kuwait→Kuwait) route; price from internal rate card (or `requiresManualPricing`). Result/Notes: ____
- [ ] 6.2 Submit: shipment carrierCode stored as `MAN`; listing filter "INTERNAL" shows it (INTERNAL/MAN/MANUAL equivalence; portal stores `MAN`, API v1 create stores `INTERNAL` — note in parity). Result/Notes: ____
- [ ] 6.3 Status after create: `pending` (awaits ops). No carrier AWB; internal label generated. Result/Notes: ____
- [ ] 6.4 Staff dispatches (3.3), driver picks up (§10), warehouse receives/verifies (§11), out_for_delivery, delivered with POD (§10). Client sees each step on `/shipment/:tn` and `/track/:tn`. Result/Notes: ____
- [ ] 6.5 Label print has internal tracking barcode scannable at `/driver/pickup` & `/warehouse/scan`. Result/Notes: ____
- [ ] 6.6 COD option: if COD set, amount collected at POD → `codStatus COLLECTED`; merchant COD settlement appears in finance (§4.5). Result/Notes: ____
- [ ] 6.7 Negatives as §5.1.2. Result/Notes: ____

---

## 7. Manual-mode client
(Client whose quotes return `requiresManualPricing` / carrier `MANUAL`; booking options show "Manual Shipment".)
- [ ] 7.1 Wizard Step 4 shows "pricing to be confirmed" (no fixed price) and allows submit. Result/Notes: ____
- [ ] 7.2 Shipment created `pending`; no auto-book; `GET /:tn/booking-options` → MANUAL carrier. Result/Notes: ____
- [ ] 7.3 Staff/admin sets price (Admin/Staff view: pricing snapshot edit) then books as MANUAL → `booked`. Result/Notes: ____
- [ ] 7.4 Status updates limited to `MANUAL_SHIPMENT_STATUSES`; others → 400. Result/Notes: ____
- [ ] 7.5 Client sees manual price only after set; invoice reflects final price. Result/Notes: ____
- [ ] 7.6 Public tracking for manual shipment shows internal events (no carrier link). Result/Notes: ____
- [ ] 7.7 API: `POST /api/v1/shipments` for a MANUAL account returns 201, status `draft`, price "0", carrier MANUAL (it does not return `requiresManualPricing`; that flag appears only on carrier-rate quotes). Record actual. Result/Notes: ____

---

## 8. Credit / org client (`org_manager` + `org_agent` of org with `creditLimit`)
- [ ] 8.1 org_manager login; nav includes Support, Users (`/admin/users` scoped to own org), no Organizations/Fleet/Warehouse. Result/Notes: ____
- [ ] 8.2 org_manager sees **all org shipments**; org_agent sees only own. Result/Notes: ____
- [ ] 8.3 `/admin/users`: can add/edit org users (MANAGE_ORG_USERS) but only within own org; cannot see other orgs. Result/Notes: ____
- [ ] 8.4 `/finance`: available credit = creditLimit − outstanding balance + unapplied cash. Matches Admin/Accounting view. Result/Notes: ____
- [ ] 8.5 Create shipment priced **below** available credit → booking succeeds; ledger/balance increases by price; available credit decreases accordingly. Result/Notes: ____
- [ ] 8.6 Create shipment priced **above** available credit (use a low-limit test org or large parcel) → blocked: "Insufficient available credit to finalize booking" with availableCredit/requiredAmount details (API 400; UI shows message). Shipment remains draft/pending. Result/Notes: ____
- [ ] 8.7 Accounting records payment/credit → available credit increases; retry 8.6 succeeds. Result/Notes: ____
- [ ] 8.8 Cancel booked shipment → balance restored (CREDIT ledger entry). Result/Notes: ____
- [ ] 8.9 Non-credit client (no limit, paymentMethod ≠ CREDIT) → paid via public checkout `/pay/:tn` (Ottu) instead. Result/Notes: ____
- [ ] 8.10 org_agent cannot open `/admin/users` (route excludes org_agent). Result/Notes: ____
- [ ] 8.11 API key generation by org_manager and org_agent; API `autoBook:true` enforces same credit check as 8.6. Result/Notes: ____

---

## 9. Warehouse scanner (staff/admin on `/warehouse/scan`)
- [ ] 9.1 Page loads for admin/staff (route also allows manager — manager scan API → 403 ⚠ CODE-GAP; test). Result/Notes: ____
- [ ] 9.2 Scan/enter tracking of `picked_up` shipment, action Receive → `received_at_hub`; history shows actor. Result/Notes: ____
- [ ] 9.3 Scan `received_at_hub`, action Verify with weight within 0.05 kg → `verified`, no discrepancy. Result/Notes: ____
- [ ] 9.4 Verify with weight differing >0.05 kg → discrepancy flagged, weightDifference returned, parcel weight updated; accounting adjustment visible (finance). Result/Notes: ____
- [ ] 9.5 Scan shipment in `delivered`/`cancelled` → rejected 400 "Must be in inbound/intake status". Result/Notes: ____
- [ ] 9.6 Scan unknown tracking → 404 message. Result/Notes: ____
- [ ] 9.7 After verify, forward step (any other action) → `in_transit`. Result/Notes: ____
- [ ] 9.8 **Negative:** client/driver/accounting open `/warehouse/scan` → blocked. Result/Notes: ____

---

## 10. Driver (`driver` — "Courier Driver")
- [ ] 10.1 Login lands on driver UI. Nav: Driver Runs, Driver Pickup, Settings only. Result/Notes: ____
- [ ] 10.2 `/driver/runs` shows active run & stops (`GET /api/fleet/driver/active-run`). Result/Notes: ____
- [ ] 10.3 `/driver/pickup`: scan unassigned shipment in ready_for_pickup/booked/pending → auto-assigned to driver; status `picked_up` (or `pending_approval` if awaiting carrier booking). Result/Notes: ____
- [ ] 10.4 Re-scan same → "already picked up" 200, no duplicate event. Result/Notes: ____
- [ ] 10.5 Scan shipment already assigned to another driver → 403. Result/Notes: ____
- [ ] 10.6 Complete delivery stop (`complete-stop`) with POD: recipient name, signature, photo, GPS, COD collected → `delivered`. Result/Notes: ____
- [ ] 10.7 Record exception (`record-exception`: recipient absent, wrong address) → `exception`; next attempt → resume. Result/Notes: ____
- [ ] 10.8 COD: driver COD summary, request remittance / initiate handover (idempotent). Staff/accounting confirm (§4.5). Result/Notes: ____
- [ ] 10.9 Live location link: `/location/:token` or `/track/:tn/location` updates (requires receiver OTP when applicable). Result/Notes: ____
- [ ] 10.10 Settings accessible; API-key generate must be **unavailable/403** (driver lacks GENERATE_API_KEY). Result/Notes: ____
- [ ] 10.11 **Forbidden:** `/dashboard`, `/shipments`, `/create`, `/finance`, `/fleet/dispatch`, `/warehouse/scan`, `/admin/*`, `/address-book`, `/support` → blocked. Result/Notes: ____
- [ ] 10.12 Driver cannot PATCH status (403) nor create shipments (403). Result/Notes: ____

---

## 11. Public (no login)
### 11.1 Tracking
- [ ] 11.1.1 `/track` landing; enter valid tracking → `/track/:tn` shows progress bar (booked, picked_up, in_transit, out_for_delivery, delivered), headline from STATUS_HEADLINE, events. Result/Notes: ____
- [ ] 11.1.2 Invalid tracking → friendly not-found. Result/Notes: ____
- [ ] 11.1.3 Public view hides sensitive data (cost, full phone/address per settings, internal notes, draft/pending states). Result/Notes: ____
- [ ] 11.1.4 Status changes from §2–§10 appear within expected latency. Result/Notes: ____
- [ ] 11.1.5 Exception and cancelled shipments render sensible message. Result/Notes: ____
- [ ] 11.1.6 `/track/:tn/location` and `/location/:token` with/without OTP behave (403 without valid OTP when required). Result/Notes: ____
### 11.2 Payment
- [ ] 11.2.1 `/pay/:tn` (`/checkout/:tn`) opens hosted checkout for unpaid shipment (**do not complete a real payment** unless test gateway). Result/Notes: ____
### 11.3 Return portal
- [ ] 11.3.1 `/returns` & `/returns/:tn`: eligibility check (`GET /api/shipments/public/:tn/return-eligibility`) — delivered & within window → eligible; others → message. Result/Notes: ____
- [ ] 11.3.2 Create return (`POST …/create-return`) → new return shipment (carrier `MANUAL` fallback) visible to staff. Result/Notes: ____
- [ ] 11.3.3 Return of non-delivered/ineligible shipment is refused. Result/Notes: ____
### 11.4 Docs & static
- [ ] 11.4.1 `/api-docs` loads without login; ApiKeyPanel renders; "Manage API Keys" → `/settings` → redirects to `/login` when logged out. Result/Notes: ____
- [ ] 11.4.2 `/privacy /terms /about /contact /signup` load. `/forgot-password` shows "coming soon". Result/Notes: ____
### 11.5 Forbidden when logged out (each → redirect to `/login`)
- [ ] 11.5.1 `/dashboard /shipments /create /shipment/:tn /finance /settings /warehouse/scan /driver/pickup /driver/runs /fleet/dispatch /admin/users /support /address-book`. Result/Notes: ____
- [ ] 11.5.2 API: `GET /api/shipments`, `PATCH /api/shipments/:tn/status` without token → 401; with only `x-api-key` → 401 on `/api/shipments/*` but 200 on `/api/v1/*`. Result/Notes: ____

---

## 12. Cross-role end-to-end scenarios (run after individual sections)
- [ ] **E2E-A INTERNAL domestic:** INTERNAL client creates → staff books/dispatches run → driver pickup → warehouse receive+verify → in_transit → out_for_delivery → driver POD delivered → accounting sees invoice/ledger → public track shows all steps. Result/Notes: ____
- [ ] **E2E-B Carrier-backed:** client creates & books (test carrier) → label printed → staff warehouse scan → carrier tracking sync (`/cron/sync-carriers` admin only) updates status → delivered → finance. Result/Notes: ____
- [ ] **E2E-C Credit limit:** org client exhausts credit → blocked → accounting payment → unblocked. Result/Notes: ____
- [ ] **E2E-D Exception/RTO:** driver exception → staff retry → cancelled/returned path; return portal creates reverse shipment. Result/Notes: ____
- [ ] **E2E-E API-created shipment** appears with identical fields/price in UI and label (see REPORT_TEMPLATE parity table). Result/Notes: ____
- [ ] **E2E-F Permission matrix:** for each role hit one forbidden page and one forbidden API call; none leaks data. Result/Notes: ____

## 13. Teardown
- [ ] 13.1 Cancel/mark all test shipments (prefix `LIVE-`), reverse test ledger entries, revoke/regenerate test API keys, log out all sessions. Result/Notes: ____
