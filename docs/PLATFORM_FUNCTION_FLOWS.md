# Target Logistics Platform Function Flows

This document is the operational map for shipment creation, carrier booking, tracking, delivery, and the supporting platform functions. Mermaid diagrams render in GitHub and other Mermaid-compatible documentation viewers.

## 1. Platform overview

```mermaid
flowchart LR
    Actors[Clients / Staff / Drivers / API partners] --> Auth[Authentication and RBAC]
    Auth --> UI[Web application]
    Auth --> API[REST API]
    UI --> Ship[Shipment domain]
    API --> Ship
    Ship --> Rate[Rating and pricing]
    Ship --> Book[Carrier booking]
    Book --> Adapters[Carrier adapters]
    Adapters --> DGR[DGR / DHL]
    Adapters --> OTE[OTE / LogesTechs]
    Adapters --> Internal[Internal fleet]
    Ship --> Track[Tracking and checkpoints]
    Track --> Notify[Chatwoot / WhatsApp / webhooks]
    Ship --> Finance[Ledger, invoices, carrier payables]
    Track --> POD[Proof of delivery]
    POD --> Returns[Return eligibility and return waybill]
    Ship --> Docs[AWB, label, invoice, manifest, POD]
```

## 2. Client API creation and delivery lifecycle

```mermaid
flowchart TD
    A[POST /api/v1/shipments] --> B[Validate API key, capability, idempotency]
    B --> C[Load API user and assigned shipping access]
    C --> D{Domestic or INTERNAL?}
    D -- Yes --> E[Create internal draft and label]
    D -- No --> F[Enforce assigned carrier and service]
    F --> G{Credit account and autoBook not true?}
    G -- Yes --> H[Create ready_for_pickup shipment]
    G -- No --> I[Normalize and carrier-validate payload]
    I --> J[Create shipment through carrier adapter]
    J --> K[Persist booked shipment, AWB, history, pricing]
    E --> L[201 response with tracking number]
    H --> L
    K --> L
    L --> M[GET /api/v1/tracking/:number]
    M --> N[Carrier sync, webhook, or staff status updates]
    N --> O[picked_up]
    O --> P[received_at_hub]
    P --> Q[verified]
    Q --> R[in_transit]
    R --> S[out_for_delivery]
    S --> T[Driver captures recipient and signature/photo POD]
    T --> U[delivered]
    U --> V[Notify customer, expose POD, start return window]
```

**API contract notes**

- An API client cannot override its assigned carrier/service policy.
- Carrier-booked shipments persist the carrier tracking identifier and initial `booked` event.
- Credit-account shipments can enter the pickup/approval path instead of immediate external booking.
- API tracking returns the canonical status, carrier, service, history, COD fields, and ETA.

## 3. UI shipment wizard

```mermaid
flowchart TD
    A[Open Create Shipment] --> B[Origin / shipper]
    B --> C[Destination / consignee]
    C --> D[Packages, items, declared value, dangerous goods]
    D --> E[Request rates and choose carrier/service/add-ons]
    E --> F[Customs, Incoterm, invoice details]
    F --> G[Review price and validation summary]
    G --> H{Save draft?}
    H -- Yes --> I[POST shipment with isDraft]
    H -- No --> J[POST shipment for operational review]
    I --> K[Open shipment detail]
    J --> K
    K --> L{External carrier?}
    L -- No, internal --> M[Internal dispatch workflow]
    L -- Yes --> N[Staff reviews and books carrier]
    N --> O[AWB / invoice available]
    M --> P[Pickup and tracking lifecycle]
    O --> P
    P --> Q[POD and delivered]
```

The UI sends both normalized `origin`/`destination` and package/item data, preserves the selected `carrierCode` and `serviceCode`, and navigates to the created shipment using the tracking number returned by the API.

## 4. Staff creation and carrier booking

```mermaid
sequenceDiagram
    actor Staff
    participant UI as Staff UI
    participant Draft as ShipmentDraftService
    participant Booking as ShipmentBookingService
    participant Carrier as Carrier Adapter
    participant DB as Database
    participant Notify as Notifications/Webhooks

    Staff->>UI: Select client/org, carrier, service, cargo
    UI->>Draft: Create shipment on behalf of client
    Draft->>DB: Persist owner, pricing snapshot, status, history
    DB-->>UI: Tracking number
    Staff->>UI: Review and Approve & Book Carrier
    UI->>Booking: Book with selected carrier and add-ons
    Booking->>DB: Lock/create booking attempt
    Booking->>Carrier: Validate and create shipment
    Carrier-->>Booking: Carrier ID, tracking, AWB/invoice
    Booking->>DB: Persist booked state and documents
    Booking->>Notify: shipment.booked
    Booking-->>UI: Booking result
```

Staff may select the carrier because platform roles are not constrained like client accounts; booking still applies organization/user policy, pricing snapshots, supported carrier capabilities, and idempotent booking attempts.

## 5. Operational status and delivery flow

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> pending
    pending --> pending_approval
    pending --> ready_for_pickup
    pending_approval --> booked: Staff approves carrier
    ready_for_pickup --> picked_up
    booked --> picked_up
    picked_up --> received_at_hub
    received_at_hub --> verified
    verified --> in_transit
    in_transit --> out_for_delivery
    out_for_delivery --> delivered: POD captured
    pending --> cancelled
    booked --> exception
    in_transit --> exception
    out_for_delivery --> exception
    exception --> in_transit: Issue resolved
    exception --> out_for_delivery: Issue resolved
    exception --> returned
    returned --> [*]
    delivered --> [*]
```

All persisted platform statuses use lowercase canonical values. Carrier-specific values are normalized before they update the shipment. A POD delivery adds a `delivered` history event and stores recipient, driver, time, signature/photo, location, notes, and COD collection data.

## 6. Tracking, notifications, and documents

```mermaid
flowchart TD
    A[Scheduled sync / webhook / manual checkpoint] --> B[Carrier adapter tracking]
    B --> C[Normalize carrier event]
    C --> D[Merge and deduplicate history]
    D --> E[Resolve forward status or healed exception]
    E --> F[Persist shipment]
    F --> G[Invalidate/update tracking cache]
    F --> H[Chatwoot / WhatsApp notification]
    F --> I[Outbound customer webhook]
    F --> J[Public and authenticated tracking]
    K[Carrier booking] --> L[AWB / label / invoice]
    M[Staff dispatch] --> N[Carrier handover manifest]
    O[Driver delivery] --> P[POD document data]
    L --> Q[Secure shipment document endpoints]
    N --> Q
    P --> Q
```

## 7. Finance and returns

```mermaid
flowchart LR
    A[Quote] --> B[Carrier base rate]
    B --> C[Organization/user markup]
    C --> D[Pricing snapshot]
    D --> E[Shipment charge / customer ledger]
    D --> F[Carrier payable]
    G[Shipment edit] --> H{Critical pricing change?}
    H -- Yes --> I[Re-rate and ledger adjustment]
    J[delivered] --> K{Within return window?}
    K -- Yes --> L[Create return shipment/waybill]
    K -- No --> M[Reject expired return]
```

## 8. Verification checklist

| Path | Expected result |
| --- | --- |
| Client API creation | `201`, assigned carrier/service enforced, tracking number returned |
| UI creation | Shipment persists wizard addresses, cargo, carrier/service, pricing, and history |
| Staff on-behalf creation | Owner/organization visibility is correct and selected carrier is retained |
| Staff carrier booking | Carrier adapter receives the selected carrier and add-ons; AWB/tracking persist |
| Status lifecycle | Each operational status appends history and uses canonical lowercase values |
| Delivery | POD is stored and final shipment/history status is `delivered` |
| Tracking | API/UI/public views show current status and deduplicated history |
| Notifications | Creation, booking, movement, exception, and delivery events dispatch as configured |
| Finance | Charge, markup, adjustments, COD, and carrier payable remain traceable |
| Returns | Only delivered shipments inside the configured window can create a return |
