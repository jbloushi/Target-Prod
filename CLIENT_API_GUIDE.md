# Target Logistics Client API Guide

Version: 2.1
Audience: client developers integrating server-to-server shipment workflows.

## Core Rule

Each client API key belongs to one platform user. That user is assigned exactly one shipping access option by Target Logistics:

- A carrier plus one service, for example `DGR` with service `P`.
- Manual Shipment, stored as `carrierCode: MANUAL` with no service code.

Client integrations should not send `carrierCode` or `serviceCode`. The backend derives both from the API key owner. If a request includes a carrier or service that does not match the assigned access, the API returns `403`.

This keeps the client API simple and prevents the wrong carrier rate or service from being selected.

## Base URLs

| Environment | Base URL |
| --- | --- |
| Local | `http://localhost:8899/api` |
| Production | `https://api.target-logistics.com/api` |

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

## Shipment Creation

### `POST /v1/shipments`

Creates a shipment for the API key owner.

For carrier-backed users, the shipment is submitted through the assigned carrier/service and returned as booked when carrier booking succeeds.

For manual users, the shipment is created as a Manual Shipment draft and is not registered with a 3PL carrier.

Do not include `carrierCode` or `serviceCode` in normal client requests.

```bash
curl -X POST http://localhost:8899/api/v1/shipments \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "sender": {
      "company": "Client Warehouse",
      "contactPerson": "Ahmed Ali",
      "phone": "96512345678",
      "phoneCountryCode": "+965",
      "email": "warehouse@example.com",
      "countryCode": "KW",
      "city": "Kuwait City",
      "postalCode": "13001",
      "streetLines": ["Industrial Area, Block 4"]
    },
    "receiver": {
      "company": "Receiver Co",
      "contactPerson": "Sara Saleh",
      "phone": "971555555555",
      "phoneCountryCode": "+971",
      "email": "receiver@example.com",
      "countryCode": "AE",
      "city": "Dubai",
      "postalCode": "00000",
      "streetLines": ["Business Bay"]
    },
    "shipmentType": "package",
    "parcels": [
      { "weight": 2.5, "length": 30, "width": 20, "height": 10 }
    ],
    "items": [
      { "description": "Documents", "quantity": 1, "unitValue": 10, "currency": "KWD", "countryOfOrigin": "KW" }
    ],
    "currency": "KWD"
  }'
```

Success response for a carrier-backed user:

```json
{
  "success": true,
  "data": {
    "trackingNumber": "DGR-AB12CD34",
    "carrier": "DGR",
    "serviceCode": "P",
    "status": "booked",
    "price": 4.5,
    "currency": "KWD"
  }
}
```

Success response for a manual user:

```json
{
  "success": true,
  "data": {
    "trackingNumber": "MAN-AB12CD34",
    "carrier": "MANUAL",
    "serviceCode": null,
    "status": "draft",
    "price": 0,
    "currency": "KWD"
  }
}
```

### Shipment Types

Only these shipment types are supported:

| API value | Label |
| --- | --- |
| `package` | Standard Package |
| `documents` | Document Express |

Legacy aliases such as `standard`, `standard_package`, `document`, and `document_express` are normalized internally, but new integrations should use `package` or `documents`.

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

## Quotes

### `POST /v1/quotes`

Returns the quote for the API key owner's assigned carrier/service. Clients should not send carrier or service selection fields.

Manual Shipment users receive a manual quote placeholder:

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

Carrier-backed users receive only the assigned service rate after organization/user markup is applied.

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
| `phoneCountryCode` | Yes | Example: `+965` |
| `email` | Yes | Contact email |
| `countryCode` | Yes | ISO 2-letter code |
| `city` | Yes | City |
| `postalCode` | Yes | Postal code |
| `streetLines` | Yes | Array of street lines |
| `state` | No | Region/state |
| `taxId` | No | Tax id |
| `eoriNumber` | No | EORI value |
| `vatNumber` | No | VAT value |

## Pickup Requests

### `POST /client/pickups`

Creates an external pickup request. Include an `Idempotency-Key` header for safe retries.

```http
Idempotency-Key: unique-operation-id
```

### `GET /client/pickups/:id`

Returns pickup request status.

Pickup status values used by the external flow include `pending`, `assigned`, `completed`, and `cancelled`. Some approval flows may return uppercase operational states while legacy data is being normalized.

## Client Shipment Status

### `GET /client/shipments/:trackingNumber`

Returns private shipment status for the API key owner.

### `GET /client/shipments/:trackingNumber/tracking`

Returns internal and carrier tracking events in chronological order.

## Public Tracking

Public tracking does not require an API key.

### `GET /public/shipments/:trackingNumber`

Returns public shipment details and tracking history for customer-facing pages.

## Status Reference

Canonical shipment statuses:

| Status | Meaning |
| --- | --- |
| `draft` | Shipment is being prepared |
| `pending` | Pending review or processing |
| `booked` | Booked in the platform/carrier flow |
| `ready_for_pickup` | Ready for pickup |
| `picked_up` | Picked up by driver/courier |
| `in_transit` | Received into movement/warehouse network |
| `out_for_delivery` | Out for final delivery |
| `delivered` | Delivered |
| `exception` | Issue requiring attention |
| `cancelled` | Cancelled |

Manual status changes inside the platform are limited to `admin`, `manager`, and `accounting`. Client API callers cannot set status directly.

## Security Checklist

- Store API keys server-side only.
- Rotate keys if exposed.
- Use idempotency keys for pickup creation retries.
- Do not send carrier/service fields unless Target Logistics explicitly tells you to test access enforcement.
- Treat tracking numbers and labels as customer data.
