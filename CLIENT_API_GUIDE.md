# Target Logistics Client API Guide

Version: 2.2
Audience: client developers integrating server-to-server shipment workflows.

## Core Rule

Each client API key belongs to one platform user. That user is assigned exactly one shipping access mode by Target Logistics:

- **Carrier mode** — locked to a carrier such as `DGR`, with an optional default/assigned service.
- **Manual mode** — stored as `carrierCode: MANUAL` with no carrier service code.

## Important Integration Pattern

There are **two supported API flows**:

### 1) Carrier-backed flow
Use this when the API key belongs to a carrier-backed user.

Recommended sequence:

1. `POST /v1/quotes`
2. Read the returned `serviceCode`
3. `POST /v1/shipments` using that service code

**Do not assume a service like `P` works for every route.**
Carrier product availability is route/account dependent.

### 2) Manual flow
Use this when the API key belongs to a manual user.

Manual flow:

1. `POST /v1/shipments`
2. Shipment is created internally as `carrierCode: MANUAL`
3. No carrier quote, no carrier booking, no DHL call

---

## Base URLs

| Environment | Base URL |
| --- | --- |
| Local | `http://localhost:8899/api` |
| Production | `https://3pl-api.mawthook.io/api` |

All `/v1` paths below are relative to the base URL.

## Authentication

Send the API key in every private API request:

```http
x-api-key: YOUR_API_KEY
```

API keys are generated from the user Settings page in the platform. Store keys server-side only. Do not expose API keys in browser JavaScript or mobile apps.

## Rate Limits

External API traffic is rate limited. A limited request returns:

```json
{
  "success": false,
  "error": "Too many requests, please slow down."
}
```

Use retry backoff for `429` responses.

## Error Shape

```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": ["Optional validation details"]
}
```

Common status codes:

| Code | Meaning |
| --- | --- |
| `400` | Invalid request or validation failure |
| `401` | Missing or invalid API key |
| `403` | Request conflicts with assigned carrier/service access |
| `404` | Resource not found |
| `409` | Idempotency collision |
| `429` | Rate limit exceeded |
| `500` | Server error |

---

## Quotes

### `POST /v1/quotes`

Returns quotes for the API key owner.

### Carrier-backed users
For carrier-backed users, this endpoint returns the live rate(s) available to the API user for the submitted route.

**Best practice:** quote first, then create the shipment using the returned `serviceCode`.

### Manual users
Manual Shipment users receive a manual placeholder quote:

```json
{
  "success": true,
  "data": [
    {
      "serviceName": "Manual Shipment",
      "serviceCode": null,
      "carrier": "MANUAL",
      "totalPrice": 0,
      "currency": "KWD",
      "estimatedDelivery": null
    }
  ]
}
```

### Live-verified carrier quote example
The following route was verified live:
- Origin: `KW`
- Destination: `AE`
- Returned service: `P`

```bash
curl -X POST https://3pl-api.mawthook.io/api/v1/quotes \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "sender": {
      "company": "My Warehouse Co.",
      "contactPerson": "Ahmed Al-Rashid",
      "phone": "96512345678",
      "phoneCountryCode": "+965",
      "email": "warehouse@mycompany.com",
      "countryCode": "KW",
      "city": "Kuwait City",
      "postalCode": "13001",
      "streetLines": ["Industrial Area, Block 4"]
    },
    "receiver": {
      "contactPerson": "Sara Al-Mutairi",
      "phone": "96598765432",
      "phoneCountryCode": "+965",
      "email": "sara@gmail.com",
      "countryCode": "AE",
      "city": "Dubai",
      "postalCode": "00000",
      "streetLines": ["Dubai Marina, Tower 5"]
    },
    "parcels": [
      { "weight": 5.0, "length": 40, "width": 30, "height": 20, "description": "Clothing Box" }
    ],
    "items": [
      {
        "description": "Clothing",
        "quantity": 3,
        "unitValue": 50,
        "currency": "KWD",
        "countryOfOrigin": "KW",
        "hsCode": "610910",
        "weight": 5.0
      }
    ],
    "currency": "KWD"
  }'
```

Live-verified response:

```json
{
  "success": true,
  "data": [
    {
      "serviceName": "EXPRESS WORLDWIDE",
      "serviceCode": "P",
      "carrier": "DGR",
      "totalPrice": 18.576,
      "currency": "KWD"
    }
  ]
}
```

### Notes
- `hsCode` is required for customs-declarable carrier quotes.
- `unitValue` is supported in API payloads.
- Some services are route-dependent. For example, `P` was rejected for the tested `KW -> KW` route under the same account.

---

## Shipment Creation

### `POST /v1/shipments`

Creates a shipment for the API key owner.

### Carrier-backed shipment flow
For carrier-backed users, the shipment is submitted through the carrier and returned as booked when booking succeeds.

**Recommended flow:**
1. Quote first
2. Use the returned `serviceCode`
3. Create shipment

### Manual shipment flow
For manual users, the shipment is created as a Manual Shipment draft and is not registered with a 3PL carrier.

### Live-verified carrier shipment example
The following route was verified live:
- Origin: `KW`
- Destination: `AE`
- `carrierCode: DGR`
- `serviceCode: P`

```bash
curl -X POST https://3pl-api.mawthook.io/api/v1/shipments \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "carrierCode": "DGR",
    "serviceCode": "P",
    "sender": {
      "company": "My Warehouse Co.",
      "contactPerson": "Ahmed Al-Rashid",
      "phone": "96512345678",
      "phoneCountryCode": "+965",
      "email": "warehouse@mycompany.com",
      "countryCode": "KW",
      "city": "Kuwait City",
      "postalCode": "13001",
      "streetLines": ["Industrial Area, Block 4"]
    },
    "receiver": {
      "contactPerson": "Sara Al-Mutairi",
      "phone": "96598765432",
      "phoneCountryCode": "+965",
      "email": "sara@gmail.com",
      "countryCode": "AE",
      "city": "Dubai",
      "postalCode": "00000",
      "streetLines": ["Dubai Marina, Tower 5"]
    },
    "parcels": [
      { "weight": 5.0, "length": 40, "width": 30, "height": 20, "description": "Clothing Box" }
    ],
    "items": [
      {
        "description": "Clothing",
        "quantity": 3,
        "unitValue": 50,
        "currency": "KWD",
        "countryOfOrigin": "KW",
        "hsCode": "610910",
        "weight": 5.0
      }
    ],
    "currency": "KWD",
    "incoterm": "DAP",
    "exportReason": "Sale",
    "remarks": "Handle with care",
    "reference": "ORDER-2026-001"
  }'
```

Live-verified response:

```json
{
  "success": true,
  "data": {
    "trackingNumber": "2042595203",
    "labelUrl": null,
    "invoiceUrl": null,
    "carrier": "DGR",
    "serviceCode": "P",
    "status": "booked"
  }
}
```

### Live-verified manual shipment example
This was also verified live with the same client API path after switching the API user to manual mode:

```bash
curl -X POST https://3pl-api.mawthook.io/api/v1/shipments \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "sender": {
      "company": "My Warehouse Co.",
      "contactPerson": "Ahmed Al-Rashid",
      "phone": "96512345678",
      "email": "warehouse@mycompany.com",
      "countryCode": "KW",
      "city": "Kuwait City",
      "postalCode": "13001",
      "streetLines": ["Industrial Area, Block 4, Street 12"]
    },
    "receiver": {
      "contactPerson": "Sara Al-Mutairi",
      "phone": "96598765432",
      "email": "sara@gmail.com",
      "countryCode": "KW",
      "city": "Salmiya",
      "postalCode": "22001",
      "streetLines": ["Block 12, Building 45, Apartment 3"]
    },
    "parcels": [
      {
        "weight": 2.5,
        "length": 30,
        "width": 20,
        "height": 10,
        "description": "Manual shipment box"
      }
    ],
    "items": [
      {
        "description": "Manual shipment item",
        "quantity": 1,
        "unitValue": 25,
        "currency": "KWD"
      }
    ],
    "currency": "KWD",
    "reference": "MANUAL-ORDER-001",
    "remarks": "Create internal shipment only"
  }'
```

Live-verified response:

```json
{
  "success": true,
  "data": {
    "trackingNumber": "MAN-OYXH39LR",
    "carrier": "MANUAL",
    "serviceCode": null,
    "status": "draft",
    "price": "0",
    "currency": "KWD"
  }
}
```

### Notes
- Carrier-backed shipments should generally be quoted first.
- Manual shipments do not require quote or carrier booking.
- `hsCode` is required for customs-declarable carrier shipments.

### Shipment Types

Supported shipment types:

| API value | Label |
| --- | --- |
| `package` | Standard Package |
| `documents` | Document Express |

Legacy aliases such as `standard`, `standard_package`, `document`, and `document_express` are normalized internally, but new integrations should use `package` or `documents`.

---

## Shipment Update

### `PUT /v1/shipments/:trackingNumber`

Updates editable shipment details for shipments owned by the API key owner.

Editable while the shipment is in `draft`, `pending`, `booked`, `ready_for_pickup`, or `exception`.

Allowed fields:

- `origin`
- `destination`
- `items`
- `parcels`
- `incoterm`
- `currency`
- `dangerousGoods`
- `customer`
- `reference`
- `remarks`

Status changes are not part of the client API. Status is managed by platform roles, carrier updates, booking, pickup scans, and warehouse scans.

---

## Tracking

### `GET /v1/tracking/:trackingNumber`

Returns tracking for a shipment owned by the API key owner.

```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "status": "in_transit",
    "carrier": "DGR",
    "serviceCode": "P",
    "estimatedDelivery": "2026-04-17T00:00:00.000Z",
    "history": []
  }
}
```

---

## Address Book

### `GET /v1/addresses`

Returns saved addresses for the API key owner.

### `POST /v1/addresses`

Creates an address.

### `PUT /v1/addresses/:id`

Updates an address by id or label.

Address object fields:

| Field | Required | Notes |
| --- | --- | --- |
| `label` | For saved addresses | Friendly address name |
| `company` | Yes | Company or location name |
| `contactPerson` | Yes | Main contact |
| `phone` | Yes | Local phone number |
| `phoneCountryCode` | Recommended | Example: `+965` |
| `email` | Yes | Contact email |
| `countryCode` | Yes | ISO 2-letter code |
| `city` | Yes | City |
| `postalCode` | Yes | Postal code |
| `streetLines` | Yes | Array of street lines |

---

## Public Tracking

### `GET /public/shipments/:trackingNumber`

Returns public tracking information without authentication.

Use this in customer-facing experiences only when the tracking number is intended to be public.
