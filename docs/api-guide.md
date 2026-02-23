# 3PL Logistics Client API Guide

Welcome to the 3PL Logistics API. This guide explains how to authenticate, create shipments, and query tracking statuses programmatically from your own systems.

## Base URL
All requests should be routed to the base domain of your platform instance:
`https://api.yourdomain.com/external`

---

## Authentication
Every request to the API must include your organization's API Key.
You can generate and copy this key exactly once from your **Developer Settings** dashboard.

**Header:**
`X-API-Key: your_generated_api_key_here`

*Note: The API key grants full access to your organization's ledger and shipments. Keep it secure.*

---

## 1. Create a Pickup Request (Draft Shipment)
Creates a new `draft` shipment in the system. The platform will automatically hold this until you approve and book it, or you may configure your account to auto-book via the API.

**Endpoint:** `POST /pickups`

### Request Profile (Idempotency)
You **must** include an `Idempotency-Key` header with a unique UUID for every new pickup request. If your network drops and you retry the exact same request, our system will recognize the UUID and return the original success response instead of charging your ledger twice.

**Header:**
`Idempotency-Key: a-unique-uuid-v4-string`

### JSON Body Example
```json
{
  "sender": {
    "name": "Acme Corp",
    "phone": "+1234567890",
    "address": "123 Main St",
    "city": "New York",
    "countryCode": "US"
  },
  "receiver": {
    "name": "John Doe",
    "phone": "+0987654321",
    "address": "456 Market St",
    "city": "Toronto",
    "countryCode": "CA"
  },
  "parcels": [
    {
      "weight": 5.5,
      "dimensions": {
        "length": 10,
        "width": 10,
        "height": 10
      }
    }
  ],
  "serviceCode": "P",
  "requestedPickupDate": "2024-02-25T10:00:00Z",
  "pickupInstructions": "Ring the bell at the loading dock"
}
```

### Success Response (201 Created)
```json
{
  "success": true,
  "pickupId": "65ab37d8...",
  "trackingNumber": "3PL-123456789",
  "status": "draft"
}
```

---

## 2. Check Pickup Status
Retrieve the immediate status of your draft or active shipment.

**Endpoint:** `GET /pickups/:pickupId`

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "65ab37d8...",
    "status": "ready_for_pickup",
    "trackingNumber": "3PL-123456789"
  }
}
```

---

## 3. Get Unified Tracking History
Retrieve the full chronological history of events (including underlying carrier sweeps like DHL).

**Endpoint:** `GET /shipments/:pickupId/tracking`

### Success Response (200 OK)
```json
{
  "success": true,
  "trackingNumber": "3PL-123456789",
  "carrierTracking": "1234567890", 
  "status": "in_transit",
  "history": [
    {
      "status": "picked_up",
      "description": "Shipment picked up by courier.",
      "timestamp": "2024-02-21T08:00:00Z"
    },
    {
      "status": "in_transit",
      "description": "Arrived at Sort Facility",
      "timestamp": "2024-02-21T12:00:00Z"
    }
  ]
}
```

### Error Codes
*   **401 Unauthorized**: Missing or invalid `X-API-Key`.
*   **409 Conflict**: A request with this `Idempotency-Key` is currently executing. Wait and retry.
*   **400 Bad Request**: Invalid JSON payload (missing required addresses or weights).
*   **404 Not Found**: The requested ID does not belong to your organization.
