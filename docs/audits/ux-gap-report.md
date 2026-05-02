# UX Gap Report

> **What this document is:** A catalogue of every place in the UI where a user encounters a placeholder, stub, unbuilt feature, incomplete data, or broken interaction. Not design opinions — only gaps where the user cannot complete an expected task or sees something misleading.
>
> Based on source code as of 2026-05-02.

---

## Severity Key

| Level | Meaning |
|---|---|
| 🔴 **Critical** | Active crash, data loss risk, or misleading status |
| 🟠 **High** | User expects to do something and cannot; feature appears available but is broken |
| 🟡 **Medium** | Feature is correctly gated as "coming soon" but blocks a workflow |
| 🟢 **Low** | Polish gap, cosmetic, or minor missing detail |

---

## 1. Active Crashes and Broken Interactions

### 🔴 `ShipmentDetails_FIX.jsx` — Orphaned in-progress file

**File:** `frontend/src/pages/ShipmentDetails_FIX.jsx`

A 47-line file that was the start of a rewrite of `ShipmentDetailsPage.jsx`. It ends mid-comment: *"I will rewrite the whole file to ensure it's correct."* It is never imported or routed to, but it exists alongside the production page file. This should be deleted — its presence in the repo creates confusion about which file is canonical.

**Impact:** Developer confusion, not a user-visible crash. Risk: a future developer edits the wrong file.

---

### 🔴 WhatsApp Delivery Status — UI Shows SUBMITTED but Cannot Confirm Delivery

**File:** `frontend/src/pages/ShipmentDetailsPage.jsx:514`

```javascript
if (status === 'sent' || status === 'submitted') return 'SUBMITTED';
```

The notification log card in shipment details displays `SUBMITTED` for any WhatsApp message accepted by Chatwoot. This is correct at Chatwoot level but misleading at the business level: **SUBMITTED only means Chatwoot accepted the API call.** It does not mean:

- Meta accepted the message from Chatwoot
- The message was delivered to the recipient's device
- The message was read

There is no `delivered`, `read`, or `failed` status in the log because the Meta webhook callback handler (`POST /api/integrations/chatwoot/webhook/meta-status`) does not exist. Users see SUBMITTED and assume the customer received the message.

**Impact:** Operations team may not follow up with customers who never received a notification.

---

## 2. "Coming Soon" Routes — Entire Pages Missing

These routes exist in `frontend/src/routes/index.jsx` but render `InConstructionPage` with no functional content. Users who navigate to them see a placeholder.

| Route | Title shown | Who would use it |
|---|---|---|
| `/analytics` | Analytics | All staff — shipment volume, revenue trends |
| `/calendar` | Calendar | Ops — pickup scheduling, delivery timelines |
| `/warehouse` | Warehouse Management | Warehouse staff — inventory, storage |
| `/fleets` | Fleet Management | Ops — vehicle tracking, maintenance |
| `/drivers` | Driver Management | Ops — driver profiles, assignments |
| `/messages` | Messages | All — internal/external communication |
| `/notifications` | Notifications | All — system alerts, updates |
| `/forgot-password` | Password Reset | All users — self-service password recovery |

**File:** `frontend/src/routes/index.jsx:155–188`

### 🟠 Password Reset (`/forgot-password`)

This is the most impactful gap. Users who forget their password cannot recover their account without contacting an admin. The auth flow shows a "Forgot password?" link that leads to the InConstructionPage. There is no self-service password reset flow.

### 🟡 Analytics

The finance page has a revenue summary and ledger table, but there is no aggregated analytics view — no charts, no trend lines, no volume-by-carrier breakdown, no export. All reporting must be done from raw table data.

### 🟡 Messages / Notifications

The `/notifications` page shows "System alerts and updates" as coming soon. Users currently have no in-app notification center for tracking updates, finance events, or system alerts.

---

## 3. WhatsApp / Chatwoot Gaps

### 🟠 No Per-Organization Notification Toggle

`CHATWOOT_ENABLED` is a global environment variable. There is no UI to enable or disable WhatsApp notifications per organization. If one org's contacts opt out or cause spam complaints, the only option is to disable Chatwoot for all orgs.

### 🟠 No Opt-Out / Unsubscribe Handling

When a WhatsApp user replies STOP or opts out via Meta's built-in mechanism, the system has no handler. The next notification to that number will attempt to send normally. There is no log of opted-out numbers and no UI to manage them.

### 🟠 WhatsApp Templates Pending Meta Approval

All five operational templates (`target_shipment_created`, `target_documents_needed`, `target_customs_hold`, `target_delivery_attempt`, `target_out_for_delivery`) are PENDING Meta review. Until approved:

- Messages can only be sent as plain text
- Plain text messages are only deliverable within Meta's 24-hour customer service window (the recipient must have messaged the business number first)
- There is no UI to check template approval status — staff must log into Meta Business Manager manually

### 🟡 No Arabic Language Templates

All five WhatsApp templates are English (`en_US`). For Gulf region customers communicating in Arabic, notifications arrive in English. There is no mechanism to detect recipient language preference or send bilingual messages.

### 🟡 No Manual Resend Button in UI

The admin test API (`POST /api/integrations/chatwoot/test-message`) supports `force: true` to bypass deduplication and resend a notification. But there is no button in the shipment details UI to trigger a resend. Staff must use API tools directly.

---

## 4. Carrier Gaps Visible to Users

### 🟠 DHLX (DHL Account 2) — Not Yet Usable

`DHLX` appears in the codebase as an upcoming carrier, but `DhlxAdapter.js` does not exist yet. If `DHLX` were to appear in any dropdown or carrier selector, booking would fail at the factory level. Currently gated by `active: false` in CarrierFactory — confirm this gate holds across all carrier selection UI paths.

### 🟠 Aramex — Appears Active, Returns Fake Data

`AramexAdapter.js` has `active: true` in `CarrierFactory.getAvailableCarriers()`, but the adapter contains `console.log()` statements, artificial `setTimeout` delays, and **hardcoded fake responses**. Any org assigned Aramex access would receive invented tracking data and fake booking confirmations. No real API calls are made.

**Risk:** If any organization has `ARAMEX` in their `allowedCarriers` list, they are silently getting mock data in production.

### 🟡 FedEx — Disabled But Adapter Exists

`FedexAdapter.js` is `active: false`. All four methods throw `"Not Implemented"`. This is correctly gated and low-risk, but if the `active` flag is accidentally flipped, every FedEx booking attempt will throw an unhandled error.

---

## 5. Finance and Accounting Gaps

### 🟠 No Invoice Model

There is no `Invoice` table, no invoice generation flow, and no invoice UI. Billing to clients must be handled entirely outside the platform (external accounting software, manual PDF). The finance page shows ledger entries and payment allocations but has no concept of formal invoices.

### 🟠 No COD (Cash on Delivery) Support

There are no COD fields on shipment records, no cash collection tracking, and no remittance workflow. Carriers that support COD (OTE supports cash collection) have no corresponding financial tracking in the platform. COD amounts are invisible to finance.

### 🟠 No Carrier Cost Tracking

The ledger records what the customer was charged, but not what the carrier charged the company. There is no way to compute per-shipment margin within the platform. Profitability analysis is impossible without external data.

### 🟡 Finance Revenue Snapshot — No Pagination

The revenue summary in `FinancePage` / `FinanceReports` uses in-memory grouping of all ledger entries. For organizations with thousands of shipments, this will return the entire unpaginated ledger for aggregation. Performance degrades linearly with org size; there is no pagination or server-side aggregation.

### 🟡 No Finance Hold UI Indicator for Booking Users

When a booking is blocked by `financeHold` (org exceeded credit limit), the booking attempt returns an error. There is no proactive UI indicator in the shipment list or booking flow warning the user that their org is on finance hold before they attempt to book.

---

## 6. RBAC / Role and Capability Gaps

### 🟠 `APPROVE_SHIPMENTS` Capability — Defined, Not Used

`APPROVE_SHIPMENTS` is declared in `frontend/src/utils/capabilities.jsx:18` and assigned to most roles. It is checked in `ApiDocsPage.jsx` as documentation, but there is **no actual shipment approval workflow** in the UI or backend. Shipments do not go through an approval state. The capability is a dead stub.

### 🟠 `DRIVER_OPS` Capability — Defined, Only Used for Driver/Warehouse Pages

`DRIVER_OPS` is assigned to the `driver` role and controls access to `WarehouseScanPage` and `DriverPickupPage`. These pages exist but the Driver Management module (`/drivers`) is an InConstructionPage. Drivers can use operational scan pages but cannot be managed, assigned, or viewed from the main admin interface.

### 🟡 Role Display Names — No Role Management UI

User roles (admin, agent, manager, operations, driver, customer, api_user, warehouse) are defined in the capability system and backend. But there is no UI to create custom roles or edit role-capability mappings. Role assignment is done on the user edit form only, with a fixed role dropdown. Orgs that need a custom role (e.g., "finance-only agent") have no path to configure one.

---

## 7. Settings and Configuration Gaps

### 🟡 No Admin Toggle for QUOTE_DEBUG

The backend has a `QUOTE_DEBUG` environment variable that leaks internal pricing data (markup percentages, cost breakdowns) into the rate quote API response. The audit report flagged this as a security issue. There is currently no admin UI to toggle debug mode — it requires a server restart with a changed env var.

### 🟡 API Key Management — Partial

`GENERATE_API_KEY` capability exists and `SettingsPage.jsx` has API key management. However, the API key flow needs verification: confirm that key regeneration, revocation, and scoped permissions work end-to-end and are clearly surfaced in the UI.

### 🟡 No Notification Preferences Per User

Users cannot configure which notifications they receive, via which channel, or at what frequency. All notifications are system-wide. A receiver who does not use WhatsApp has no way to indicate that.

---

## 8. Webhook Infrastructure Gap

### 🟡 WebhookDispatcher — Built, Not Wired, No UI

`WebhookDispatcher.js` is fully implemented with HMAC-SHA256 signing. `WebhookSubscription` and `WebhookEvent` tables exist in the schema. But:

- `WebhookDispatcher.dispatch()` has **zero call sites** — no event ever triggers it
- There is no admin UI to create, list, or delete webhook subscriptions
- There is no UI to view the `WebhookEvent` log (delivery history, retries, failures)
- Organizations that need HTTP callbacks for their own systems (e.g., their WMS) cannot configure them

---

## 9. Orphaned / Incomplete Frontend Artifacts

| File | Issue |
|---|---|
| `frontend/src/pages/ShipmentDetails_FIX.jsx` | Abandoned rewrite attempt — 47 lines, never routed, ends mid-comment. Should be deleted. |

---

## Summary Table

| # | Gap | Severity | Owner |
|---|---|---|---|
| 1 | ShipmentDetails_FIX.jsx orphaned file | 🔴 | Frontend |
| 2 | WhatsApp SUBMITTED ≠ DELIVERED — misleading status | 🔴 | Backend + Frontend |
| 3 | No self-service password reset | 🟠 | Backend + Frontend |
| 4 | No per-org WhatsApp notification toggle | 🟠 | Backend + Frontend |
| 5 | No WhatsApp opt-out / STOP handling | 🟠 | Backend |
| 6 | WhatsApp templates PENDING — no status UI | 🟠 | Frontend |
| 7 | DHLX adapter not yet built | 🟠 | Backend |
| 8 | Aramex is a mock — active in factory | 🟠 | Backend |
| 9 | No invoice model or UI | 🟠 | Backend + Frontend |
| 10 | No COD support | 🟠 | Backend + Frontend |
| 11 | No carrier cost / margin tracking | 🟠 | Backend + Frontend |
| 12 | APPROVE_SHIPMENTS capability is a dead stub | 🟠 | Backend + Frontend |
| 13 | DRIVER_OPS: scan pages exist but driver management is InConstruction | 🟠 | Frontend |
| 14 | Analytics page — InConstructionPage | 🟡 | Frontend |
| 15 | Calendar page — InConstructionPage | 🟡 | Frontend |
| 16 | Warehouse Management — InConstructionPage | 🟡 | Frontend |
| 17 | Fleet Management — InConstructionPage | 🟡 | Frontend |
| 18 | Driver Management — InConstructionPage | 🟡 | Frontend |
| 19 | Messages — InConstructionPage | 🟡 | Frontend |
| 20 | Notifications center — InConstructionPage | 🟡 | Frontend |
| 21 | No Arabic WhatsApp templates | 🟡 | Backend |
| 22 | No manual resend button in shipment details | 🟡 | Frontend |
| 23 | Finance revenue snapshot — no pagination | 🟡 | Backend + Frontend |
| 24 | No finance hold pre-warning in booking UI | 🟡 | Frontend |
| 25 | No role management UI | 🟡 | Frontend |
| 26 | No QUOTE_DEBUG admin toggle | 🟡 | Backend + Frontend |
| 27 | No notification preferences per user | 🟡 | Backend + Frontend |
| 28 | WebhookDispatcher built but never wired + no UI | 🟡 | Backend + Frontend |
| 29 | FedEx placeholder — disabled but throws if activated | 🟢 | Backend |
