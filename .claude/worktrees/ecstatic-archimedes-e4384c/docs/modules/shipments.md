# Shipments Module

> **Real implementation documentation.** Based on source code as of 2026-05-02.

---

## Overview

Shipments are the core entity of the platform. Each shipment moves through a defined status pipeline from `draft` to `delivered`. Shipment data is a mix of relational columns (financials, carrier codes, status) and JSON blobs (addresses, checkpoints, history, pricing snapshot, documents).

**Key files:**
```
backend/src/
  controllers/
    shipment-crud.controller.js       — List, get, create, delete
    shipment-booking.controller.js    — Quote, booking options, book with carrier
    shipment-ops.controller.js        — Status update, warehouse scan, pickup
    shipment-tracking.controller.js   — Location updates, tracking history
    shipment-checkpoint.controller.js — Checkpoint CRUD
    shipment-public.controller.js     — Public tracking endpoint
    shipment.helpers.js               — Shared helper functions
  services/
    ShipmentDraftService.js           — Draft creation, initial pricing
    ShipmentBookingService.js         — Carrier booking orchestration
  constants/
    statusConstants.js                — Status enum, transition rules, label map
  routes/
    shipment.routes.js
    shipment-public.routes.js
```

---

## Status Pipeline

Statuses are ordered. Transitions are **forward-only** except for `exception` which is a lateral state.

```
draft → pending → booked → ready_for_pickup → picked_up → in_transit → out_for_delivery → delivered
                                                    ↕
                                                exception  (can enter/exit from most statuses)
                                                    ↕
                                                cancelled  (terminal)
```

| Status | Label | Meaning |
|---|---|---|
| `draft` | Draft | Created, not yet submitted |
| `pending` | Pending Review | Under review by platform staff |
| `booked` | Booked | Confirmed with carrier |
| `ready_for_pickup` | Ready for Pickup | Awaiting driver collection |
| `picked_up` | Picked Up | Driver has collected from shipper |
| `in_transit` | In Transit | Moving through carrier network |
| `out_for_delivery` | Out for Delivery | Last-mile delivery in progress |
| `delivered` | Delivered | Received by consignee |
| `exception` | Exception | Problem with shipment (lateral — not a forward step) |
| `cancelled` | Cancelled | Shipment cancelled (terminal) |

**Key functions in `statusConstants.js`:**
- `getStatusIndex(status)` — returns 0-based pipeline position
- `isStatusAhead(a, b)` — true if `b` is a forward step from `a`
- `normalizeStatus(legacyStatus)` — maps old status names to current ones (e.g. `created` → `booked`, `updated` → `pending`)

**Manual shipment statuses** use the same enum but restricted transitions. Manual shipments (carrier code `MANUAL`) follow the same pipeline but are never submitted to an external carrier.

---

## Shipment Data Model

**Table:** `Shipment` in Prisma schema.

### Scalar columns

| Field | Type | Notes |
|---|---|---|
| `trackingNumber` | String (unique) | Platform-generated internal tracking ID |
| `userId` | FK → User | Creator / owner |
| `organizationId` | FK → Organization (nullable) | Tenant org; null = solo shipper |
| `assignedStaffId` | FK → User (nullable) | Internal staff assignment |
| `assignedDriverId` | FK → User (nullable) | Driver assigned for pickup |
| `status` | String | Default: `'draft'` |
| `estimatedDelivery` | DateTime (nullable) | |
| `carrierCode` | String | Default: `'DGR'` |
| `serviceCode` | String (nullable) | Carrier-specific service (e.g. `P`, `D`) |
| `shipmentType` | String | `'package'` or `'documents'`, default `'package'` |
| `dhlTrackingNumber` | String (nullable) | Carrier's tracking number (used for DHL/OTE) |
| `dhlConfirmed` | Boolean | Whether carrier booking was confirmed, default `false` |
| `carrierShipmentId` | String (nullable) | Carrier's internal ID |
| `labelUrl` | String (nullable) | Shipping label PDF URL |
| `awbUrl` | String (nullable) | Air waybill PDF URL |
| `invoiceUrl` | String (nullable) | Invoice PDF URL |
| `price` | Decimal(18,4) | Final customer price |
| `costPrice` | Decimal(18,4) | Carrier's base rate |
| `markupAmount` | Decimal(18,4) | Markup applied |
| `currency` | String | Default: `'KWD'` |
| `paid` | Boolean | Payment fully settled, default `false` |
| `totalPaid` | Decimal | Running total paid |
| `remainingBalance` | Decimal | Outstanding amount |
| `packagingType` | String | Default: `'user'` |
| `incoterm` | String | Default: `'DAP'` |

### JSON blob fields

| Field | Contents |
|---|---|
| `origin` | Sender address (company, contactPerson, email, phone, streetLines, city, countryCode, postalCode), plus carrier-specific: `shipperAccount`, `payerOfVat`, `gstPaid`, `dangerousGoods`, `insuredValue`, `incoterm`, `packagingType`, `labelSettings` |
| `destination` | Receiver address (contactPerson, phone, streetLines, city, countryCode, postalCode) |
| `customer` | Customer name, email, phone (derived from origin if not provided) |
| `currentLocation` | Latest known location: `{ formattedAddress, city, longitude, latitude, timestamp }` |
| `checkpoints` | Array of planned route checkpoints (see Checkpoints section) |
| `history` | Array of status change events (see History section) |
| `parcels` | Array of `{ weight: { value }, dimensions: { length, width, height }, quantity, description }` |
| `items` | Array of `{ sku, description, quantity, weight, value, hsCode, countryOfOrigin }` |
| `pricingSnapshot` | Frozen rate quote at time of creation (see Pricing section) |
| `bookingAttempts` | Array of booking attempt records (see Booking section) |
| `documents` | Array of `{ type, url, uploadedAt }` |
| `financeHold` | `{ status: bool, reason, checkedAt, availableCredit, requiredAmount }` — populated if booking rejected for credit |

---

## Creating a Shipment (Draft)

**Route:** `POST /api/shipments`  
**Service:** `ShipmentDraftService.createDraft(data, user)`

1. **Payload normalization:** `sanitizePayload()` — normalizes address format, validates origin/destination are present
2. **Carrier access check:** Verifies user/org has access to the requested `carrierCode`
3. **Pricing:** Calls `CarrierRateService.getQuotes()` → applies user/org markup → stores as `pricingSnapshot`
4. **Manual shipments** (`MANUAL` carrier): price comes from the request body, no carrier call
5. **DB insert:** Shipment created with `status: 'draft'` (or `'ready_for_pickup'` for manual)
6. **Initial history entry:** Records draft creation event in `history` JSON blob

**Carrier enforcement:** If the user's `agentPolicy.allowedCarriers` is set, the carrier must be in that list. If the org's `allowedCarriers` is set, same check applies.

---

## Booking a Shipment

**Route:** `POST /api/shipments/:trackingNumber/book`  
**Permission:** `BOOK_CARRIERS` capability required  
**Service:** `ShipmentBookingService.bookShipment()`

Full flow:

1. Load shipment + user + org from DB
2. Validate carrier access
3. **Pricing refresh:** If `pricingSnapshot` is stale or invalid, re-quotes from carrier
4. **Credit gate:** `price > org.creditLimit` → writes `financeHold` JSON blob, returns error (bypassed for admin/staff/accounting roles)
5. **Idempotency:** Checks `bookingAttempts` array for an active attempt (< 60 seconds old) — prevents double-submission
6. Creates new booking attempt with UUID, status `'pending'`
7. Calls `adapter.createShipment(payload, serviceCode)`
8. **Duplicate recovery:** If carrier returns `DUPLICATE_SHIPMENT` → calls `adapter.getStatus()` + `adapter.getLabel()` to retrieve the existing booking instead of failing
9. On success:
   - Stores carrier tracking number in `dhlTrackingNumber`
   - Sets `dhlConfirmed: true`, `status: 'booked'`
   - Uploads label/AWB/invoice via `CarrierDocumentService`
   - Appends document URLs to `documents` JSON blob
   - Marks booking attempt as `'succeeded'`
   - Posts finance ledger debit (`SHIPMENT_CHARGE`)

**Booking attempt record** (stored in `bookingAttempts[]`):
```javascript
{
  attemptId: UUID,
  status: 'pending' | 'succeeded' | 'failed',
  createdAt, updatedAt,
  carrierShipmentId,
  error  // populated on failure
}
```

---

## Status Changes

### By staff/admin — manual update
**Route:** `PATCH /api/shipments/:trackingNumber/status`  
**Controller:** `shipment-ops.controller.js → updateShipmentStatus()`

- Admin/staff/manager/accounting can set any status
- Standard users limited to their own shipments and restricted transitions
- All status changes append a `history` entry

### By driver — pickup scan
**Route:** `POST /api/shipments/:trackingNumber/pickup`  
**Auth:** Driver, staff, or admin only  
**Precondition:** Status must be one of `draft`, `pending`, `booked`, `ready_for_pickup`  
**Result:** Status → `picked_up`

### By warehouse — inbound scan
**Route:** `POST /api/shipments/:trackingNumber/warehouse/scan`  
**Auth:** Staff or admin only  
**Precondition:** Status must be `picked_up`, `booked`, or `ready_for_pickup`  
**Result:** Status → `in_transit`  
**Side effect:** If new weight/dimensions provided and delta > 0.05 kg, updates parcel data

### History entry format (written on every status change)
```javascript
{
  status: string,
  description: string,
  source: 'platform' | 'carrier',
  timestamp: ISO8601,
  location: { formattedAddress, city, longitude, latitude },
  localTimestamp?: ISO8601,
  timezoneOffset?: string
}
```

---

## Tracking Flow

### Internal (platform history)
Every status change, location update, and checkpoint event writes an entry to the `history` JSON blob on the shipment.

### Carrier tracking (live)
When tracking is requested for a carrier-booked shipment, the platform calls the carrier adapter:
```
adapter.getTracking(dhlTrackingNumber)
  → { status, events: [{ statusCode, description, timestamp, location }] }
```

DHL-specific: events are deduplicated by 1-minute bucket (DHL replays the same event from multiple data sources — the adapter collapses these).

### Public tracking merge
When the public tracking endpoint is called, platform history and carrier events are merged by `buildDisplayHistory()`:
- Deduplicates events by canonical status + location + time bucket
- Collapses repeated events at the same location into one entry with `collapsedCount`
- Infers origin location from first departure/pickup event
- Sorts chronologically

---

## Checkpoints

Checkpoints are planned route waypoints stored in the `checkpoints` JSON blob.

```javascript
{
  id: UUID,
  name: string,
  location: {
    type: 'Point',
    coordinates: [longitude, latitude],   // GeoJSON order
    address: string,
    timestamp: DateTime
  },
  estimatedArrival: DateTime,
  reached: boolean,
  notes: string
}
```

**Routes:**
```
POST   /api/shipments/:trackingNumber/checkpoints
PATCH  /api/shipments/:trackingNumber/checkpoints/:checkpointId
DELETE /api/shipments/:trackingNumber/checkpoints/:checkpointId
```

---

## Pricing Snapshot

When a shipment is created or re-quoted, the rate is frozen into `pricingSnapshot`:

```javascript
{
  carrierRate: Decimal,         // Carrier's raw rate
  markup: Decimal,              // Absolute markup amount
  markupPercentage: Decimal,    // Percentage applied
  totalPrice: Decimal,          // carrierRate + markup + optionalServicesTotal
  currency: string,
  billingCurrency: string,
  declaredCurrency: string,
  policySource: string,         // Where markup came from: 'platform_default' | 'org_default' | 'org_carrier' | 'user_default' | 'agent_default'
  estimatedShipmentCost: Decimal,
  optionalServices: [{
    serviceCode, serviceName,
    totalPrice, carrierAmount, markupAmount, currency
  }],
  optionalServicesTotal: Decimal,
  insuredValue?: Decimal
}
```

`pricingSnapshot.totalPrice` is the authoritative charge amount used by the finance ledger. If `pricingSnapshot` is absent, the ledger falls back to `shipment.price`.

---

## Public Tracking API

**Routes (no auth required):**
```
GET   /api/public/shipments/:trackingNumber
PATCH /api/public/shipments/:trackingNumber/location
```

**What is exposed:**
- Tracking number, carrier code, status, shipment type
- Origin and destination: city, country, formatted address only
- Current location, estimated delivery
- Parcels: weight and dimensions (no item values or prices)
- Unified event history
- `allowPublicLocationUpdate` flag

**What is hidden:**
- Pricing, cost, financial data
- Internal user IDs, staff assignments
- Full address details (street-level)
- Documents (label, invoice, AWB)
- Booking attempt records

**Public location update** (`PATCH .../location`):
- Only allowed when `shipment.allowPublicLocationUpdate = true`
- Receiver can update their delivery address once
- After update, flag is set to `false` (one-time use)

---

## All Shipment Routes

```
GET    /api/shipments                              — List (paginated, filterable, sortable)
GET    /api/shipments/stats                        — Status counts + monthly volume
GET    /api/shipments/nearby                       — Nearby shipments (lon/lat query)
POST   /api/shipments                              — Create draft
GET    /api/shipments/:trackingNumber              — Get single shipment
PATCH  /api/shipments/:trackingNumber              — General field update
DELETE /api/shipments/:trackingNumber              — Delete (admin, MANAGE_USERS cap)

POST   /api/shipments/quote                        — Get rate quotes with markup
GET    /api/shipments/carriers                     — List carriers accessible to user
GET    /api/shipments/:trackingNumber/booking-options  — Rate options at booking time
POST   /api/shipments/:trackingNumber/book         — Book with carrier (BOOK_CARRIERS)

GET    /api/shipments/:trackingNumber/history      — Status change log
GET    /api/shipments/:trackingNumber/eta          — Estimated arrival
GET    /api/shipments/:trackingNumber/distance     — Route distance
PATCH  /api/shipments/:trackingNumber/location     — Manual location update
PATCH  /api/shipments/:trackingNumber/status       — Status change

POST   /api/shipments/:trackingNumber/checkpoints
PATCH  /api/shipments/:trackingNumber/checkpoints/:checkpointId
DELETE /api/shipments/:trackingNumber/checkpoints/:checkpointId

GET    /api/shipments/:trackingNumber/label        — Generate HTML label
GET    /api/shipments/:trackingNumber/documents/:filename  — Download document PDF
POST   /api/shipments/:trackingNumber/pickup       — Driver pickup scan
POST   /api/shipments/:trackingNumber/warehouse/scan  — Warehouse inbound scan
PATCH  /api/shipments/:trackingNumber/public-settings — Toggle public update flags
```

---

## Access Control Summary

| Role | Access |
|---|---|
| `admin` / `staff` | All shipments, all operations |
| `manager` / `accounting` | All shipments in system, no deletion |
| `org_manager` | All shipments within their org |
| `org_agent` | Own shipments only |
| `client` | Own shipments only (via API key or login) |
| `driver` | Only shipments assigned to them; pickup operation only |

Tenant isolation is enforced at the query level — non-platform roles have `organizationId` or `userId` hard-scoped into every DB query.
