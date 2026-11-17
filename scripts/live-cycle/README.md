# Live API cycle (`api_cycle.sh`)

Runs the full external-API shipment lifecycle against the **real** Target API for each account type, plus negative checks. Run it on a server with network access. Requires `bash>=4`, `curl`, `jq`.

> **WARNING – real side effects.** It creates real shipments. Carrier/admin/credit profiles hit the live DGR (DHL) adapter (`isTest:true` is sent, set `IS_TEST=false` to book for real), write ledger entries / invoices / carrier payables for organization accounts, create pickup requests and saved addresses. There is **no API cancel**; the script prints the created tracking numbers so you can void them in the admin UI.

## Env vars

| Var | Meaning |
|---|---|
| `API_BASE` | default `https://api.target-kw.com/api` (routes used: `/v1/*`, `/client/*`, `/public/shipments/*` under it) |
| `ADMIN_KEY` | admin/staff API key (no assigned-access enforcement) |
| `CARRIER_KEY` | account assigned to DGR carrier |
| `DOMESTIC_KEY` | account assigned to INTERNAL / DOM |
| `MANUAL_KEY` | account in Manual mode |
| `CREDIT_KEY` | organization with credit limit (skipped if unset) |
| `IS_TEST` | `true` (default) sends `isTest:true` on carrier bookings |
| `SLEEP_BETWEEN` | seconds between calls (default `0.3`, API is rate limited) |

Keys are sent via `curl -K -` (not in process args) and only printed masked (`abcd…xyz`).

```bash
export ADMIN_KEY=... CARRIER_KEY=... DOMESTIC_KEY=... MANUAL_KEY=... CREDIT_KEY=...
./scripts/live-cycle/api_cycle.sh 2>&1 | tee cycle.log
```
Exit code `0` = no FAIL; `1` = at least one FAIL; `2` = setup problem. `WARN` lines do not fail the run.

## Steps per key
quote (`POST /v1/quotes`) → create (`POST /v1/shipments`, fresh `Idempotency-Key`) → replay same key (identical body/status) → `GET /v1/shipments/:n/label` → `PUT /v1/shipments/:n` (remarks + receiver name) → `GET /v1/tracking/:n` → `GET /client/shipments/:n` and `/tracking` → `GET /public/shipments/:n` (no key) → `POST`/`GET /client/pickups` → `POST`/`GET`/`PUT /v1/addresses`.

Negative: no key / bad key / malformed key → 401; create without `Idempotency-Key` → 400; unknown public tracking → 404; other account's shipment via `/v1/tracking`, `/client/shipments`, `PUT` → 404 (label 403/404, WARN if 200 because same organization/staff); carrier key requesting another carrier (OTE or SMSA) on quote and create → 403 (rejected before booking).

## Expected results

| Account | Quote | Create | Notes |
|---|---|---|---|
| ADMIN (intl KW→AE) | any carrier (cheapest) | 201, real carrier booking | admin may request any carrier |
| CARRIER | carrier DGR, serviceCode e.g. `P` | 201, DGR, label PDF | requesting other carrier → 403 |
| DOMESTIC (KW→KW) | `INTERNAL` / `DOM` | 201, `INTERNAL`, price per policy (default 2.500) | no carrier call |
| MANUAL | `MANUAL`, price 0, serviceCode null | 201, `MANUAL`, status `draft`, price `"0"` | no carrier call |
| CREDIT | carrier rate | 201, status `ready_for_pickup` (no `autoBook`), no carrier booking | enters approval/pickup lifecycle |

PUT may return 400 `Cannot update in current status` for non-editable states (reported as WARN). Label may be a redirect for carrier-hosted labels (PASS).

## Known side effects / cleanup
- Real DGR bookings (ADMIN, CARRIER) unless the adapter honours `isTest`; ledger/invoice/carrier-payable entries for org accounts.
- Pickup requests (`REQUESTED`), saved addresses labelled `api-cycle-<RUN_ID>`; no delete endpoints.
- End of run lists tracking numbers, current status and pickup ids; void shipments in the admin UI.
- Shipments carry `reference = <RUN_ID>` for searching.

## Caveats
- `CARRIER_KEY` must be a non-staff user for the other-carrier 403 check; the create-403 check only runs after the quote returned 403 (staff/admin keys bypass enforcement and would really book).
- The create-without-Idempotency-Key check uses the first available key (ADMIN, CARRIER, ...); a key lacking CREATE_SHIPMENTS gets 403 instead of 400.
- A replay hitting 409 (original still PROCESSING) is retried once after 1s.
