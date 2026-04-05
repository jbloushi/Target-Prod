# Target Logistics — Client API Guide (v2.0)

Welcome to the Target Logistics Developer API. This guide covers everything you need to integrate shipment creation, real-time tracking, rate quotation, pickup requests, and address management into your own systems.

---

## 1. Quick Start

Create your first shipment in under a minute:

```bash
curl -X POST https://api.target-logistics.com/api/v1/shipments \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "sender": {
      "company": "My Warehouse",
      "contactPerson": "Ahmed Al-Rashid",
      "phone": "96512345678",
      "phoneCountryCode": "+965",
      "email": "warehouse@mycompany.com",
      "countryCode": "KW",
      "city": "Kuwait City",
      "postalCode": "13001",
      "streetLines": ["Industrial Area, Block 4, Street 12"]
    },
    "receiver": {
      "contactPerson": "Sara Al-Mutairi",
      "phone": "96598765432",
      "phoneCountryCode": "+965",
      "email": "sara@gmail.com",
      "countryCode": "KW",
      "city": "Salmiya",
      "postalCode": "22001",
      "streetLines": ["Block 12, Building 45, Apartment 3"]
    },
    "parcels": [{ "weight": 2.5, "length": 30, "width": 20, "height": 10 }],
    "items": [{ "description": "Electronics", "quantity": 1, "unitValue": 150, "currency": "KWD", "countryOfOrigin": "KW" }]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "draft",
    "price": 4.500,
    "currency": "KWD",
    "carrier": "DGR"
  }
}
```

---

## 2. Authentication

All API requests (except public tracking) **must** include your API key in the request header:

| Header | Value |
|--------|-------|
| `x-api-key` | `YOUR_API_KEY` |

**Key format:** `{userId}.{randomBytes}` — e.g. `42.a7f3bc9d12e045f8`

> **How to get your API key:** Log in to your dashboard → **Settings** → **General & API** → click **Generate Key**. Store it securely in your server-side environment variables (`.env`). Never expose it in frontend JavaScript.

---

## 3. Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:8899/api` |
| Production  | `https://api.target-logistics.com/api` |

All endpoint paths below are relative to the base URL (e.g. `/v1/shipments` = `https://api.target-logistics.com/api/v1/shipments`).

---

## 4. Rate Limiting

API keys are limited to **30 requests per minute**.

When exceeded, you receive:

```json
HTTP 429 Too Many Requests
{
  "success": false,
  "error": "Too many requests, please slow down."
}
```

Implement exponential backoff when you receive 429 responses.

---

## 5. Error Format

All errors follow this consistent shape:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": ["Optional array of validation errors"]
}
```

**Common HTTP status codes:**

| Code | Meaning |
|------|---------|
| `400` | Bad request — missing or invalid fields |
| `401` | Unauthorized — missing or invalid API key |
| `404` | Resource not found |
| `409` | Conflict — idempotency key collision |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## 6. Idempotency

For `POST /client/pickups`, include an `Idempotency-Key` header to safely retry requests without creating duplicates:

```
Idempotency-Key: unique-key-per-request-uuid-here
```

- Use a UUID or other unique string per logical operation
- Keys are valid for **24 hours**
- If a request with the same key is already being processed:

```json
HTTP 409 Conflict
{
  "success": false,
  "error": "A request with this Idempotency-Key is currently being processed."
}
```

---

## 7. Endpoints

---

### 7.1 Shipments

---

#### `POST /v1/shipments` — Create Shipment

Creates a new shipment in `draft` status. The shipment is not yet booked with a carrier.

**Headers:** `x-api-key` (required)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sender` | object | ✅ | Origin address (see Address Object below) |
| `receiver` | object | ✅ | Destination address |
| `parcels` | array | ✅ | One or more parcel objects |
| `items` | array | ✅ | Shipment contents/commodities |
| `carrierCode` | string | — | `"DGR"` (default) or `"DHL"` |
| `serviceCode` | string | — | Service type (e.g. `"P"` for express). Default: `"P"` |
| `shipmentDate` | string | — | ISO 8601 date (e.g. `"2026-04-10"`) |
| `currency` | string | — | Default: `"KWD"` |

**Address Object fields:**

| Field | Type | Required |
|-------|------|----------|
| `company` | string | ✅ |
| `contactPerson` | string | ✅ |
| `phone` | string | ✅ |
| `phoneCountryCode` | string | ✅ (e.g. `"+965"`) |
| `email` | string | ✅ |
| `countryCode` | string | ✅ (ISO 2-letter, e.g. `"KW"`) |
| `city` | string | ✅ |
| `postalCode` | string | ✅ |
| `streetLines` | string[] | ✅ |
| `state` | string | — |
| `taxId` | string | — |
| `eoriNumber` | string | — |
| `vatNumber` | string | — |

**Parcel Object:**

| Field | Type | Required |
|-------|------|----------|
| `weight` | number | ✅ (kg) |
| `length` | number | ✅ (cm) |
| `width` | number | ✅ (cm) |
| `height` | number | ✅ (cm) |

**Item Object:**

| Field | Type | Required |
|-------|------|----------|
| `description` | string | ✅ |
| `quantity` | number | ✅ |
| `unitValue` | number | ✅ |
| `currency` | string | ✅ |
| `countryOfOrigin` | string | ✅ (ISO 2-letter) |

**Success Response `201`:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "draft",
    "price": 4.500,
    "currency": "KWD",
    "carrier": "DGR"
  }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `400` | Validation failed (missing required fields) |
| `500` | Internal server error |

---

#### `PUT /v1/shipments/:trackingNumber` — Update Shipment

Update a shipment's details. Only allowed when status is `draft`, `pending`, or `created`.

**Headers:** `x-api-key` (required)

**URL Param:** `:trackingNumber` — e.g. `DGR-AB12CD34`

**Request Body** (all fields optional, provide only what you want to change):

| Field | Type |
|-------|------|
| `sender` | object |
| `receiver` | object |
| `parcels` | array |
| `items` | array |
| `serviceCode` | string |
| `currency` | string |
| `incoterm` | string |
| `reference` | string |
| `remarks` | string |

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "draft",
    "price": 5.250,
    "updatedAt": "2026-04-10T08:30:00.000Z"
  }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `400` | Cannot update shipment in current status |
| `404` | Shipment not found |

---

#### `GET /v1/tracking/:trackingNumber` — Track Shipment

Get the current status and history of a shipment.

**Headers:** `x-api-key` (required)

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "in_transit",
    "carrier": "DGR",
    "estimatedDelivery": "2026-04-11T00:00:00.000Z",
    "history": [
      {
        "status": "picked_up",
        "description": "Shipment collected from sender",
        "location": "Kuwait City Gateway",
        "timestamp": "2026-04-10T09:00:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `404` | Shipment not found |

---

### 7.2 Quotes

---

#### `POST /v1/quotes` — Get Rate Quote

Fetch live shipping rates for a given origin/destination and package size. Rates include your organization's markup. Does **not** create a shipment.

**Headers:** `x-api-key` (required)

**Request Body:** Same structure as Create Shipment — `sender`, `receiver`, `parcels`, `items`. Optionally `carrierCode`.

**Success Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "serviceName": "EXPRESS WORLDWIDE",
      "serviceCode": "P",
      "carrier": "DGR",
      "totalPrice": 4.500,
      "currency": "KWD",
      "estimatedDelivery": "2026-04-11T00:00:00.000Z"
    },
    {
      "serviceName": "EXPRESS 9:00",
      "serviceCode": "9",
      "carrier": "DGR",
      "totalPrice": 7.200,
      "currency": "KWD",
      "estimatedDelivery": "2026-04-11T00:00:00.000Z"
    }
  ]
}
```

---

### 7.3 Address Book

---

#### `GET /v1/addresses` — List Saved Addresses

Returns all addresses saved in your account's address book.

**Headers:** `x-api-key` (required)

**Success Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "addr_01abc",
      "label": "Main Warehouse",
      "company": "My Warehouse Co.",
      "contactPerson": "Ahmed Al-Rashid",
      "phone": "96512345678",
      "email": "warehouse@mycompany.com",
      "streetLines": ["Industrial Area, Block 4"],
      "city": "Kuwait City",
      "postalCode": "13001",
      "countryCode": "KW",
      "taxId": null,
      "vatNumber": null,
      "eoriNumber": null
    }
  ]
}
```

---

#### `POST /v1/addresses` — Add Address

**Headers:** `x-api-key` (required)

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `label` | string | ✅ (e.g. `"Main Warehouse"`) |
| `company` | string | ✅ |
| `contactPerson` | string | ✅ |
| `phone` | string | ✅ |
| `email` | string | ✅ |
| `streetLines` | string[] | ✅ |
| `city` | string | ✅ |
| `postalCode` | string | ✅ |
| `countryCode` | string | ✅ |
| `state` | string | — |
| `taxId` | string | — |
| `vatNumber` | string | — |
| `eoriNumber` | string | — |

**Success Response `201`:**
```json
{
  "success": true,
  "data": { "id": "addr_02xyz", "label": "Main Warehouse", "..." : "..." }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `400` | Failed to add address |

---

#### `PUT /v1/addresses/:id` — Update Address

**Headers:** `x-api-key` (required)

**URL Param:** `:id` — address ID or label

**Request Body:** Any address fields to update (partial update supported).

**Success Response `200`:**
```json
{
  "success": true,
  "data": { "id": "addr_02xyz", "label": "Main Warehouse", "city": "Hawalli", "..." : "..." }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `404` | Address not found |

---

### 7.4 Pickups

---

#### `POST /client/pickups` — Request a Pickup

Request a driver pickup from your location.

**Headers:**

| Header | Required |
|--------|----------|
| `x-api-key` | ✅ |
| `Idempotency-Key` | Recommended |

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `sender` | object | ✅ (pickup origin address) |
| `receiver` | object | ✅ (delivery destination) |
| `parcels` | array | ✅ |
| `requestedPickupDate` | string | ✅ (ISO 8601, e.g. `"2026-04-12"`) |
| `serviceCode` | string | — |
| `pickupInstructions` | string | — (e.g. `"Call on arrival"`) |

**Success Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "pickup_88abc",
    "status": "REQUESTED",
    "trackingNumber": null,
    "createdAt": "2026-04-10T10:00:00.000Z"
  }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `400` | Missing required fields |
| `409` | Idempotency key collision (retry with new key) |

---

#### `GET /client/pickups/:id` — Get Pickup Status

Check the status of a previously submitted pickup request.

**Headers:** `x-api-key` (required)

**URL Param:** `:id` — pickup request ID returned from `POST /client/pickups`

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "pickup_88abc",
    "status": "APPROVED",
    "rejectionReason": null,
    "shipment": {
      "trackingNumber": "DGR-AB12CD34",
      "status": "pending",
      "labelUrl": "https://...",
      "awbUrl": "https://...",
      "invoiceUrl": "https://..."
    },
    "createdAt": "2026-04-10T10:00:00.000Z"
  }
}
```

**Error Responses:**

| Code | Error |
|------|-------|
| `404` | Pickup request not found |

---

### 7.5 Shipment Status (Client)

---

#### `GET /client/shipments/:trackingNumber` — Get Shipment Status

**Headers:** `x-api-key` (required)

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "in_transit",
    "currentLocation": {
      "address": "Ardiya Gateway, Kuwait",
      "updatedAt": "2026-04-10T14:00:00.000Z"
    },
    "estimatedDelivery": "2026-04-11T00:00:00.000Z",
    "dhlTrackingNumber": null,
    "history": []
  }
}
```

---

#### `GET /client/shipments/:trackingNumber/tracking` — Unified Tracking

Returns merged tracking events from both internal system and carrier (DGR/DHL), sorted chronologically.

**Headers:** `x-api-key` (required)

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "in_transit",
    "events": [
      {
        "status": "picked_up",
        "description": "Shipment collected",
        "location": "Kuwait City",
        "timestamp": "2026-04-10T09:00:00.000Z",
        "source": "INTERNAL"
      },
      {
        "status": "in_transit",
        "description": "Departed origin facility",
        "location": "Kuwait Airport",
        "timestamp": "2026-04-10T13:00:00.000Z",
        "source": "DGR"
      }
    ]
  }
}
```

---

### 7.6 Public Tracking (No Auth Required)

---

#### `GET /public/shipments/:trackingNumber` — Public Shipment Tracking

No API key required. Share this endpoint directly with your end customers.

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "in_transit",
    "currentLocation": {
      "address": "Ardiya Gateway, Kuwait",
      "updatedAt": "2026-04-10T14:00:00.000Z"
    }
  }
}
```

---

## 8. Status Reference

### Shipment Statuses

| Status | Description |
|--------|-------------|
| `draft` | Created but not yet booked with carrier |
| `pending` | Awaiting pickup |
| `picked_up` | Collected from sender |
| `in_transit` | Moving through the network |
| `out_for_delivery` | With local courier for final delivery |
| `delivered` | Successfully delivered |
| `exception` | Delay or issue requiring attention |
| `cancelled` | Shipment cancelled |

### Pickup Request Statuses

| Status | Description |
|--------|-------------|
| `REQUESTED` | Submitted, awaiting review |
| `APPROVED` | Approved, driver assigned |
| `REJECTED` | Rejected (see `rejectionReason`) |
| `COLLECTED` | Picked up by driver |

---

## 9. Security Best Practices

> ⚠️ **Your API key grants full access to create shipments in your name. Protect it carefully.**

- **Never** expose your API key in client-side JavaScript (React, Vue, etc.)
- Store it in server-side environment variables (`.env`) only
- **Never** commit it to version control
- If compromised, regenerate immediately via **Settings → General & API → Regenerate Key**
- Use `Idempotency-Key` on all `POST /client/pickups` calls to prevent duplicate pickups
- Rotate your key periodically as a security best practice

---

*Target Logistics Developer API v2.0 — For support contact your account manager.*
