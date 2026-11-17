# Live Life-Cycle UI Test Report

| Field | Value |
|---|---|
| Environment | https://target-kw.com |
| Date / time (UTC) | |
| Tester(s) | |
| Build / commit / deploy id | |
| Browser / device | |
| Checklist version | scripts/live-cycle/UI_CHECKLIST.md @ |
| Test data marker | `LIVE-<date>` |
| Overall verdict | PASS / PASS WITH ISSUES / FAIL |

## 1. Executive summary
- Scope covered (sections run / skipped and why):
- Headline findings (top 3):
- Go / No-go recommendation:

Counts: Pass ___ · Fail ___ · Blocked ___ · Skipped ___ · Bugs: Critical ___ High ___ Medium ___ Low ___

## 2. Summary table — role × step
Legend: ✅ pass · ❌ fail (bug id) · ⛔ blocked · ➖ not applicable (correctly forbidden = ✅ with "denied") · ⬜ not run.

| Step | Admin | Staff | Accounting | Client carrier | Client INTERNAL | Client manual | Credit/org | Driver | Warehouse | Public |
|---|---|---|---|---|---|---|---|---|---|---|
| Login / nav correct | | | | | | | | | | ➖ |
| Dashboard loads | | | | | | | | ➖ | | ➖ |
| Create via wizard (6 steps) | | | | | | | | ➖ | ➖ | ➖ |
| Price / quote shown (cost hidden for clients) | | | | | | | | ➖ | ➖ | ➖ |
| Credit check (allow / block) | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | | ➖ | ➖ | ➖ |
| Submit / book | | | ➖ | | | | | ➖ | ➖ | ➖ |
| Label print | | | | | | | | ➖ | ➖ | ➖ |
| Edit shipment | | | ⛔ route | | | | | ➖ | ➖ | ➖ |
| pending → booked | | | | | | | | ➖ | ➖ | ➖ |
| booked → ready_for_pickup | | | | | | | | ➖ | ➖ | ➖ |
| → picked_up | | | ➖ | ➖ | ➖ | ➖ | ➖ | | ➖ | ➖ |
| → received_at_hub | | | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | | ➖ |
| → verified | | | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | | ➖ |
| → in_transit | | | | ➖ | ➖ | ➖ | ➖ | | | ➖ |
| → out_for_delivery | | | | ➖ | ➖ | ➖ | ➖ | | ➖ | ➖ |
| → delivered + POD | | | | ➖ | ➖ | ➖ | ➖ | | ➖ | ➖ |
| exception | | | | ➖ | ➖ | ➖ | ➖ | | ➖ | ➖ |
| cancelled | | | | | | | | ➖ | ➖ | ➖ |
| rto / returned | | | | | | | | | | return portal |
| Invoice / ledger effect | | | | | | | | ➖ | ➖ | ➖ |
| COD collect / remit / settle | | | | | | | | | ➖ | ➖ |
| API key generate (Settings) | | | | | | | | ➖ (403) | ➖ | ➖ |
| /api-docs loads + ApiKeyPanel | | | | | | | | | | |
| Public tracking reflects status | | | | | | | | | | |
| Forbidden pages blocked | ➖ | | | | | | | | | |
| Forbidden API calls 403/401 | ➖ | | | | | | | | | |

Per-section detail: attach filled `UI_CHECKLIST.md` (all Result/Notes completed).

## 3. Bugs found
Severity: **Critical** (data loss/money wrong/security leak/blocks life cycle) · **High** (core flow broken, workaround exists) · **Medium** (wrong behavior, non-core) · **Low** (cosmetic/copy).

| ID | Sev | Role | Checklist item | Title | Steps to reproduce | Expected | Actual | Evidence (screenshot/HAR/log/tracking #) | Suspected area | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| B-001 | | | | | | | | | | open |
| B-002 | | | | | | | | | | |

### 3.1 Known code-gap hypotheses to confirm or refute
Record outcome for each (Confirmed → raise bug B-xxx; Refuted → note).

| # | Hypothesis (from code reading) | Checklist ref | Outcome | Bug id |
|---|---|---|---|---|
| H1 | `staff` cannot change status via `PATCH /status` (allowed set only admin/manager/accounting) though UI exposes staff ops | 3.4.3 | | |
| H2 | `received_at_hub`, `verified`, `pending_approval`, `rto_in_transit`, `returned` not in PATCH allowed set — even admin gets 403; only scan endpoint produces hub statuses | 2.4.6, 2.4.12 | | |
| H3 | `POST /:tn/deliver` has no role gate (any user with shipment access, incl. client) | 5.4.2 | | |
| H4 | `manager` allowed on `/warehouse/scan`, `/driver/pickup` routes but backend pickup/scan allow only admin/staff(/driver) | 9.1 | | |
| H5 | `accounting` can open `/fleet/dispatch` but lacks MANAGE_FLEET → data 403 | 4.9 | | |
| H6 | `client` can open `/finance` route but ledger API needs VIEW_FINANCE | 5.1.3 | | |
| H7 | `staff` has MANAGE_USERS (delete shipment) though `/admin/users` route excludes staff | 3.6.2 | | |
| H8 | `/api-docs` "ApiKeyPanel" is only a link to `/settings`; key generation lives in Settings → API & Webhooks | 2.7.2 | | |
| H9 | `/support` excludes `client` while `org_agent` allowed (same label "Company Client") | 5.1.2 | | |
| H10 | `/shipment/:tn/edit` excludes manager & accounting | 4.8 | | |

## 4. API vs UI parity
Create the same logical shipment via the API (client API key; `POST /api/v1/shipments` (Idempotency-Key required), `POST /api/v1/quotes`, `GET /api/v1/tracking/:n`, `GET /api/v1/shipments/:n/label`, `PUT /api/v1/shipments/:n`, `/api/client/shipments/:n`; header `x-api-key: <userId>.<secret>`) and via the wizard. Compare.

| Aspect | UI result | API result | Match? | Notes / bug id |
|---|---|---|---|---|
| Quote price (same params) | | | | |
| Quote carriers/services offered | | | | |
| Currency / markup applied | | | | |
| Created status (UI: pending/booked/pending_approval; API v1: draft for manual, ready_for_pickup for credit accts without autoBook, or booked) | | | | |
| Tracking number format | | | | |
| carrierCode stored (portal INTERNAL→`MAN`; API v1 stores `INTERNAL`) | | | | |
| Required-field validation messages | | | | |
| Credit-limit block (message + status code) | | | | |
| Manual pricing flag (`requiresManualPricing`) | | | | |
| Idempotency (repeat same key → same shipment) | n/a | | | |
| Label content | | | | |
| Edit/update allowed states (`PUT` vs edit page) | | | | |
| Tracking events/timeline | | | | |
| Appears in `/shipments` list with correct org/user | | | | |
| Invoice / ledger entry | | | | |
| Org isolation (other org's tracking number) | | | | |
| Auth failure (bad/revoked key vs expired session) | | | | |

## 5. Permission matrix observed
✔ allowed · ✖ denied (correct) · ✔! allowed but should be denied · ✖! denied but should be allowed.

| Action | Admin | Staff | Acct | Client | Org mgr | Driver | Public |
|---|---|---|---|---|---|---|---|
| Create shipment | | | | | | | |
| Book carrier | | | | | | | |
| PATCH status | | | | | | | |
| Pickup scan | | | | | | | |
| Warehouse scan | | | | | | | |
| Deliver + POD | | | | | | | |
| Dispatch run | | | | | | | |
| View ledger / finance | | | | | | | |
| Confirm COD / manual journal | | | | | | | |
| Generate API key | | | | | | | |
| Delete shipment | | | | | | | |

## 6. Data created / cleanup
| Tracking # | Created by | Final status | Cleaned up? |
|---|---|---|---|
| | | | |

## 7. Sign-off
- Tester: ______  Date: ______
- Reviewer: ______  Date: ______
