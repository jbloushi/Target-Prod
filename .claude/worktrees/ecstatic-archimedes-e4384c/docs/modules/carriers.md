# Carriers Module

> **Real implementation documentation.** Based on source code as of 2026-05-02.

---

## Two DHL Accounts: DGR (Account 1) and DHLX (Account 2)

The platform supports two separate DHL Express accounts:

| Code | Purpose | Adapter | Status |
|---|---|---|---|
| `DGR` | DHL Account 1 — original DGR account | `DgrAdapter.js` | Active |
| `DHLX` | DHL Account 2 — non-DGR shipments | To be added as `DhlxAdapter.js` | Pending implementation |

`DGR` keeps its name and code permanently. `DHLX` is a new second account with its own credentials and a new adapter class. See [new-carrier-api-checklist.md](../ai-playbooks/new-carrier-api-checklist.md) Step 0 for the implementation steps.

---

## Overview

The carrier integration layer uses a strict adapter pattern. All carrier-specific code lives in `backend/src/adapters/`. Every adapter inherits from `CarrierAdapter.js` (the base class) and implements the same four methods. The rest of the system only talks to the base interface — it never imports a specific adapter directly.

**Files:**
```
backend/src/adapters/
  CarrierAdapter.js          — Base class / interface contract
  DgrAdapter.js              — DHL Express Account 1 (DGR) — ACTIVE
  LogesTechsAdapter.js       — OTE/LogesTechs — ACTIVE
  AramexAdapter.js           — Aramex — MOCK ONLY, not production-ready
  FedexAdapter.js            — FedEx — PLACEHOLDER, all methods throw "Not Implemented"
  DhlxAdapter.js             — DHL Express Account 2 (DHLX) — PENDING (copy of DgrAdapter with DHLX_ env vars)

backend/src/services/
  CarrierFactory.js          — Instantiates the right adapter by carrier code
  ShipmentBookingService.js  — Orchestrates the full quote → book → document flow
  CarrierRateService.js      — Rate fetching with markup application
  CarrierDocumentService.js  — Downloads and stores label/AWB/invoice PDFs
  dgr-payload-builder.js     — Builds the DHL-specific API request payload (shared by both DHL adapters)
```

---

## CarrierAdapter Interface

Every adapter must implement:

```
getRates(normalizedShipment)   → Promise<RateResult[]>
createShipment(normalizedShipment, serviceCode)  → Promise<BookingResult>
getTracking(trackingNumber)    → Promise<TrackingResult>
cancelShipment(trackingNumber) → Promise<boolean>
validate(normalizedShipment)   → Promise<string[]>   // returns error messages
```

**Normalized shipment input** (shared shape across all adapters):
```javascript
{
  trackingNumber, status, carrierCode, serviceCode,
  sender / origin: {
    company, contactPerson, email, phone,
    streetLines, formattedAddress, city, countryCode, postalCode, state
  },
  receiver / destination: { ...same fields },
  parcels: [{ weight: { value }, dimensions: { length, width, height }, quantity, description }],
  items: [{ description, value, quantity, hsCode, countryOfOrigin }],
  currency, declaredValue, insuredValue,
  dangerousGoods: { contains, code, serviceCode, ... },
  shipmentType: 'package' | 'documents',
  optionalServiceCodes: string[],
  incoterm, packagingType, shipperAccount, payerOfVat, gstPaid
}
```

---

## CarrierFactory

**File:** `backend/src/services/CarrierFactory.js`

Maps carrier codes to adapter instances. Called everywhere a carrier is needed.

```javascript
CarrierFactory.getAdapter('DGR')         → new DgrAdapter(config)          // Account 1 — ACTIVE
CarrierFactory.getAdapter('DHL')         → new DgrAdapter(config)          // alias for DGR
CarrierFactory.getAdapter('DHLX')        → new DhlxAdapter(config)         // Account 2 — PENDING
CarrierFactory.getAdapter('OTE')         → new LogesTechsAdapter(config)
CarrierFactory.getAdapter('LOGESTECHS')  → new LogesTechsAdapter(config)   // alias
CarrierFactory.getAdapter('ARAMEX')      → new AramexAdapter(config)
CarrierFactory.getAdapter('FEDEX')       → new FedexAdapter(config)        // throws on use
CarrierFactory.getAdapter('UPS')         → throws "not yet implemented"
```

`getAvailableCarriers()` returns the carrier list shown to users:

| Code | Name | Active | Notes |
|---|---|---|---|
| `MANUAL` | Manual Shipment | Yes | |
| `DGR` | DHL Express (Account 1) | Yes | Existing account, code stays as DGR |
| `DHLX` | DHL Express (Account 2) | **Pending** | New account — adapter not yet built |
| `OTE` | OTE | Yes | |
| `ARAMEX` | Aramex | Yes — **but is a mock** | Do not assign to real users |
| `FEDEX` | FedEx | **No** — disabled | Placeholder only |
| `UPS` | UPS | **No** — not implemented | |

> **Important:** `ARAMEX` shows as active in the factory but the adapter is a development mock with simulated delays and fake responses. FedEx is explicitly `active: false` and all adapter methods throw. Neither should be assigned to real users.

---

## DHL Express — Account 1 (DGR)

**File:** `backend/src/adapters/DgrAdapter.js` (~34KB)  
**Carrier code:** `DGR` (also accepts `DHL` as alias)  
**Status:** Fully implemented, production-ready

### Environment Variables

```
DHL_API_KEY          — Required. API key for Basic Auth
DHL_API_SECRET       — Required. API secret for Basic Auth
DHL_ACCOUNT_NUMBER   — Optional. Shipper account (fallback)
DHL_API_URL          — Default: https://express.api.dhl.com/mydhlapi/test
                       Change to production URL before go-live
```

---

## DHL Express — Account 2 (DHLX) — Pending

**File:** `backend/src/adapters/DhlxAdapter.js` — **does not exist yet**  
**Carrier code:** `DHLX`  
**Status:** Pending implementation. See [new-carrier-api-checklist.md](../ai-playbooks/new-carrier-api-checklist.md) Step 0.

`DgrAdapter.js` already accepts a `config` object in its constructor. `DhlxAdapter.js` is simply `DgrAdapter` instantiated with `DHLX_*` env vars. No new logic is needed — only new credentials and a new factory registration.

### Environment Variables for Account 2

```
DHLX_API_KEY
DHLX_API_SECRET
DHLX_ACCOUNT_NUMBER
DHLX_API_URL          — Defaults to https://express.api.dhl.com/mydhlapi/ if not set
```

### Implementation Steps (one-time)

1. Create `backend/src/adapters/DhlxAdapter.js`:
   ```javascript
   const DgrAdapter = require('./DgrAdapter');
   class DhlxAdapter extends DgrAdapter {
       constructor(config = {}) {
           super({
               apiKey:         config.apiKey         || process.env.DHLX_API_KEY,
               apiSecret:      config.apiSecret       || process.env.DHLX_API_SECRET,
               accountNumber:  config.accountNumber   || process.env.DHLX_ACCOUNT_NUMBER,
               baseUrl:        config.baseUrl         || process.env.DHLX_API_URL,
               ...config
           });
       }
   }
   module.exports = DhlxAdapter;
   ```
2. Register in `CarrierFactory.js`: `case 'DHLX': return new DhlxAdapter(config);`
3. Add `{ code: 'DHLX', name: 'DHL Express (Account 2)', active: false }` to `getAvailableCarriers()` — set `active: true` only after credential testing
4. Add `DHLX_*` vars to `backend/.env.example`
5. Test with a sandbox quote before enabling for any org

### Authentication

HTTP Basic Auth: `Authorization: Basic Base64(${DHL_API_KEY}:${DHL_API_SECRET})`

### API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `{DHL_API_URL}/rates` | Get rate quotes |
| `POST` | `{DHL_API_URL}/shipments` | Create/book shipment |
| `GET` | `{DHL_API_URL}/shipments/{tracking}/tracking?trackingView=all-checkpoints` | Track |

### getRates()

1. Validates payload via `dgr-payload-builder.validateDgrInvoiceData()`
2. Submits to `/rates`
3. **Retry loop:** If response contains error `996` (pickup date unavailable) or "not available for the requested pickup date" → retry with +1 day, up to 7 attempts
4. Returns array of rate options with service codes, prices, delivery dates, and optional services (insurance, dangerous goods, etc.)

### createShipment()

1. Validates payload
2. **Retry loop:** Same date-error retry as rates (up to 7 days)
3. **Auto-strip VAS:** If error code `7008` (service not available for route) → remove that optional service, retry
4. **DG service strip:** If dangerous goods service restricted → removes DG value-added service, retries
5. On success: extracts label/AWB/invoice PDFs as `data:application/pdf;base64,...` strings
6. Logs all requests/responses to `CarrierLog` table (passwords/secrets redacted)
7. Also writes debug errors to `dgr_debug_error.log` file

**Document extraction:** Scans `response.documents[]` by `typeCode`:
- `typeCode === 'label'` → `labelUrl`
- `typeCode === 'waybillDoc'` → `awbUrl`
- `typeCode === 'invoice'` → `invoiceUrl`

### getTracking()

1. Calls `GET .../tracking?trackingView=all-checkpoints`
2. **Deduplication:** DHL replays the same checkpoint from multiple data sources. The adapter deduplicates by grouping events into 1-minute buckets by `statusCode + description + location`, keeping the earliest scan per bucket.
3. Returns normalized events array.

---

## OTE / LogesTechs Adapter

**File:** `backend/src/adapters/LogesTechsAdapter.js` (~30KB)  
**Carrier code:** `OTE` (also accepts `LOGESTECHS`)  
**Status:** Fully implemented, production-ready

### Environment Variables

```
LOGESTECHS_COMPANY_ID           — Required
LOGESTECHS_USERNAME             — Required
LOGESTECHS_PASSWORD             — Required
LOGESTECHS_EMAIL                — Optional (fallback for auth)
LOGESTECHS_SHIPMENT_EMAIL       — Optional override for shipment endpoint auth
LOGESTECHS_SHIPMENT_PASSWORD    — Optional override for shipment endpoint auth
LOGESTECHS_SHIPMENT_BASE_URL    — Default: https://apisv2.logestechs.com/api
LOGESTECHS_FULFILLMENT_BASE_URL — Default: https://apisv5.logestechs.com/api
```

### Authentication

Two separate auth contexts:
- **Shipment API (v2):** `company-id` header + `email`/`password` in request body. Uses `LOGESTECHS_SHIPMENT_EMAIL`/`SHIPMENT_PASSWORD` if set, otherwise falls back to `USERNAME`/`PASSWORD`.
- **Fulfillment API (v5):** `company-id`, `username`, `password` headers on each request.

### API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `{SHIPMENT_BASE}/addresses/villages` | Lookup village/city/region IDs |
| `POST` | `{SHIPMENT_BASE}/ship/request/by-email` | Create shipment |
| `POST` | `{SHIPMENT_BASE}/guests/{companyId}/packages/pdf` | Get label PDF (by ID array) |
| `PUT` | `{SHIPMENT_BASE}/guests/{companyId}/packages/{id}/cancel` | Cancel shipment |
| `GET` | `{SHIPMENT_BASE}/guests/packages/status` | Track by barcode or ID |
| `POST` | `{FULFILLMENT_BASE}/public/fulfillment/product/bulk` | Add/update products |
| `GET` | `{FULFILLMENT_BASE}/public/fulfillment/product` | List products |
| `POST` | `{FULFILLMENT_BASE}/public/fulfillment/order` | Create fulfillment order |

### getRates()

Returns `[]` — OTE does not expose a rate quote API. Pricing is pre-negotiated and set manually via platform markup rules.

### createShipment()

1. Normalizes `shipmentType` → `REGULAR | RETURN | EXCHANGE` (default: `REGULAR`)
2. Normalizes `serviceType` → `STANDARD | EXPRESS | SAME_DAY` (default: `STANDARD`)
3. Enriches address: if city/region/village IDs are missing, calls `getVillages(search)` to look them up
4. Submits to `POST /ship/request/by-email`
5. **Duplicate detection:** If carrier returns a DUPLICATE_SHIPMENT error (detected via Arabic/English regex), sets `error.code = 'DUPLICATE_SHIPMENT'` — the booking service can then recover by calling `getStatus()` + `getLabel()` to retrieve the existing booking

### getTracking()

1. Calls `GET /guests/packages/status?barcode={trackingNumber}`
2. Maps `events` array or `deliveryRoute` array
3. Returns normalized events

> **Known limitation (TODO in code):** Response schema is not fully documented by LogesTechs. The mapper is deliberately conservative. Schema changes from the provider may silently break tracking.

---

## Aramex Adapter

**File:** `backend/src/adapters/AramexAdapter.js`  
**Status:** Development mock — NOT production-ready

Contains `console.log()` statements, artificial `setTimeout` delays, and hardcoded fake responses. Should not be assigned to real users. Exists as a placeholder for when the real Aramex integration is built.

---

## FedEx Adapter

**File:** `backend/src/adapters/FedexAdapter.js`  
**Status:** Placeholder — all methods throw `"Not Implemented"`

Kept intentionally as a client-visible placeholder for the upcoming FedEx integration. **Disabled in CarrierFactory** (`active: false`). Should not be assigned to any users. When integration is ready, the three methods (`getRates`, `createShipment`, `getTracking`) need to be implemented before enabling.

Expected env vars when implemented:
```
FEDEX_KEY
FEDEX_SECRET
FEDEX_ENDPOINT_URL
FEDEX_ACCOUNT_NUMBER
```

---

## Data Flow: Quote → Create → Track → Documents

```
User requests quote
  │
  ▼
CarrierRateService.getQuotes(shipmentData, user)
  │   ├─ Validates carrier access (org allowlist + user agentPolicy)
  │   ├─ CarrierFactory.getAdapter(carrierCode)
  │   ├─ adapter.getRates(normalizedPayload)
  │   ├─ PricingService.resolveMarkup(user, org, carrierCode)
  │   └─ Returns rates[] with markups applied

User selects service and confirms booking
  │
  ▼
ShipmentBookingService.bookShipment(trackingNumber, carrierCode, optionalServiceCodes)
  │   ├─ Load shipment from DB
  │   ├─ Re-validate carrier access
  │   ├─ Validate/refresh pricing snapshot
  │   ├─ Credit gate: price > org.creditLimit → set financeHold, reject
  │   ├─ Idempotency: check for active pending booking attempt
  │   ├─ Create booking attempt record (UUID)
  │   ├─ CarrierFactory.getAdapter(carrierCode)
  │   ├─ adapter.createShipment(payload, serviceCode)
  │   │     ├─ On DUPLICATE_SHIPMENT: recover via getStatus() + getLabel()
  │   │     └─ On success: returns { trackingNumber, labelUrl, awbUrl, invoiceUrl }
  │   ├─ CarrierDocumentService: upload PDFs to storage
  │   ├─ Update shipment: status→'booked', dhlConfirmed, dhlTrackingNumber, documents
  │   ├─ Mark booking attempt 'succeeded'
  │   └─ financeLedgerService.createLedgerEntry(DEBIT, SHIPMENT_CHARGE, amount)

Tracking update
  │
  ▼
adapter.getTracking(dhlTrackingNumber)
  │   ├─ DGR: deduplicates events by minute-bucket
  │   ├─ OTE: maps events or deliveryRoute array
  │   └─ Returns { status, events: [{ statusCode, description, timestamp, location }] }

Merge with platform history
  └─ buildDisplayHistory(): deduplicates + collapses repeated events at same location
```

---

## Webhook Dispatcher

**File:** `backend/src/services/WebhookDispatcher.js`

The infrastructure for outbound webhooks is built — `WebhookSubscription` and `WebhookEvent` tables exist in the schema, and the dispatcher class is fully written.

**Current state: never called.** As of this writing, `WebhookDispatcher.dispatch()` has zero call sites in the codebase. No controller or service triggers it. The webhook system is ready to be wired in, but is not yet connected to any shipment or status change events.

**When wired in, the dispatch call would look like:**
```javascript
await WebhookDispatcher.dispatch('shipment.status_updated', organizationId, {
  trackingNumber, status, description, carrierCode, events
});
```

**Delivery mechanism:**
1. Finds all active `WebhookSubscription` records for the org
2. Filters by event name match or wildcard `*`
3. Creates a `WebhookEvent` record per matching subscription
4. Calls `_deliver()` fire-and-forget (no retry — see audit report for risk)
5. Signs payload with HMAC-SHA256: header `X-Webhook-Signature-256`
6. 5-second timeout per delivery

**The `WebhookDispatcher` is for org-level HTTP callbacks only — it is separate from the Chatwoot WhatsApp notification system.** See [docs/modules/notifications.md](notifications.md) for the Chatwoot integration, which is fully built and live. `WebhookDispatcher.dispatch()` itself still has zero call sites as of 2026-05-02.

---

## Carrier Log

Every request/response to a carrier API is logged to the `CarrierLog` table:

```
carrierCode      — 'DGR', 'OTE', etc.
requestType      — 'quote', 'book', 'track'
requestPayload   — sanitized (passwords/secrets stripped)
responsePayload  — full response
statusCode       — HTTP status
durationMs       — round-trip time
trackingNumber   — associated shipment
organizationId   — tenant context
```

This table provides a complete audit trail of all carrier API activity and is the primary tool for debugging carrier failures.
