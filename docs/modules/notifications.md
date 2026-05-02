# Notifications Module

> **Real implementation documentation.** Based on source code as of 2026-05-02.

---

## Overview

Shipment notifications are sent via **Chatwoot** as WhatsApp messages. The service is fully implemented and wired to four trigger points in the backend. It uses the `ShipmentNotificationLog` table to track every send attempt per shipment per recipient.

**Status as of 2026-05-02:**
- Service built and wired: ✅
- Chatwoot API accepting messages: ✅ (SUBMITTED)
- Meta/WhatsApp actually delivering to phones: ⚠ **unconfirmed** (see Delivery Gap below)
- WhatsApp templates approved by Meta: ⏳ PENDING review
- Delivery status callbacks (delivered/read/failed): ❌ not implemented

---

## Key Files

```
backend/src/services/chatwootNotificationService.js   — 630-line service (the entire integration)
backend/src/controllers/integration.controller.js     — Manual test/preview API
backend/src/routes/integration.routes.js              — Admin-only test routes
backend/prisma/schema.prisma                          — ShipmentNotificationLog model
backend/prisma/migrations/20260502120000_*            — Migration that created the table
```

**Wired trigger points (auto-fire):**
- `backend/src/controllers/shipment-crud.controller.js:107` — fires `shipment_created` on new shipment
- `backend/src/controllers/shipment-crud.controller.js:562` — fires status-mapped event on shipment update
- `backend/src/controllers/shipment-ops.controller.js:53` — fires status-mapped event on status change
- `backend/src/controllers/shipment-tracking.controller.js:46` — fires status-mapped event on tracking update

All four use `.triggerShipmentNotification()` which is **non-blocking fire-and-forget** — a notification failure never interrupts the shipment operation.

---

## Configuration

All Chatwoot settings come from environment variables via `config.chatwoot`:

```
CHATWOOT_ENABLED=true                    # Required — false = all notifications skipped silently
CHATWOOT_BASE_URL=https://inbox.mawthook.com
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_INBOX_ID=1                      # The WhatsApp inbox ID in Chatwoot
CHATWOOT_API_ACCESS_TOKEN=...            # Chatwoot user API token (not inbox token)
CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK=true  # false = requires approved template; true = sends plain text if no template
CHATWOOT_TEMPLATE_CONFIG={"shipment_created":{"name":"target_shipment_created",...}}

PUBLIC_TRACKING_BASE_URL=https://app.yourdomain.com   # Used in notification links
SUPPORT_WHATSAPP_PHONE=96597691271                    # Support number embedded in messages
```

`isConfigured()` checks all five Chatwoot vars are non-empty. If any are missing, notifications are logged as `skipped` with reason `not_configured`.

---

## Event Types and Recipients

| Event | Who gets it | Auto-trigger condition |
|---|---|---|
| `shipment_created` | Sender + Receiver | On shipment creation |
| `out_for_delivery` | Receiver only | Status = `out_for_delivery` |
| `on_hold_customs_issue` | Sender + Receiver | Status = `exception` + description matches customs/clearance/hold |
| `documents_needed` | Sender + Receiver | Status = `exception` + description matches document/invoice/paperwork/kyc |
| `delivery_attempt` | Receiver only | Status = `exception` + description matches attempt/unavailable/no answer/failed delivery |

**Status → event mapping** (`mapStatusToNotificationEvent(status, description)`):
```javascript
'out_for_delivery' status               → 'out_for_delivery'
'exception' + /customs|clearance|hold/  → 'on_hold_customs_issue'
'exception' + /document|invoice|kyc/    → 'documents_needed'
'exception' + /attempt|unavailable/     → 'delivery_attempt'
everything else                         → null (no notification)
```

---

## Message Flow

```
Trigger point (controller) calls triggerShipmentNotification(eventType, shipment)
  │
  ▼
sendShipmentNotification(eventType, shipment)
  │
  ├─ CHATWOOT_ENABLED=false → log as 'skipped', return
  ├─ isConfigured()=false   → log as 'skipped', return
  │
  ▼
For each target (sender and/or receiver based on event type):
  │
  ├─ Extract phone: shipment.origin.phone / shipment.destination.phone
  │   + normalizePhone() — handles country code prefix, strips leading 0
  │   Target skipped if no phone resolved
  │
  ├─ Deduplication: createLog() with @@unique[shipmentId, eventType, recipientRole, provider]
  │   If duplicate → skip silently, return
  │
  ├─ Build message:
  │   ├─ If CHATWOOT_TEMPLATE_CONFIG has template for this event → use template + processed_params
  │   └─ Fallback (CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK=true) → plain WhatsApp markdown text
  │
  ├─ findOrCreateContact(target)
  │   ├─ Search Chatwoot contacts by phone number
  │   └─ Create if not found, with shipment custom_attributes
  │
  ├─ findOrCreateConversation(contact, target)
  │   ├─ Check ShipmentNotificationLog for existing conversation ID (reuse across shipments)
  │   ├─ Search Chatwoot contact conversations for open/active in this inbox
  │   └─ Create new conversation only if none found
  │   Note: one conversation per contact per inbox — all shipment messages go into the same chat
  │
  ├─ sendMessage(conversationId, payload)
  │   POST /api/v1/accounts/{id}/conversations/{convId}/messages
  │
  └─ Update log: status = 'submitted', chatwootContactId, chatwootConversationId, sentAt
       (OR status = 'failed', errorMessage if any step throws)
```

---

## Notification Log (Database)

**Table:** `ShipmentNotificationLog`

| Field | Notes |
|---|---|
| `shipmentId` | FK → Shipment |
| `trackingNumber` | Denormalized for easy querying |
| `eventType` | `shipment_created`, `out_for_delivery`, etc. |
| `recipientRole` | `sender` or `receiver` |
| `recipientPhone` | Masked: `+20***289` |
| `provider` | Always `'chatwoot'` |
| `chatwootAccountId` | Chatwoot account ID used |
| `chatwootInboxId` | WhatsApp inbox ID |
| `chatwootContactId` | Chatwoot contact ID (populated on success) |
| `chatwootConversationId` | Chatwoot conversation ID (populated on success) |
| `templateName` | Template used, or null for plain text |
| `payloadJson` | Exact payload sent to Chatwoot |
| `responseJson` | Full Chatwoot API response (contact + conversation + message objects) |
| `status` | `pending` → `submitted` / `failed` / `skipped` |
| `errorMessage` | Error text if failed |
| `sentAt` | Timestamp when Chatwoot accepted the message |

**Unique constraint:** One log entry per `(shipmentId, eventType, recipientRole, provider)` — prevents duplicate sends unless `force: true` is passed.

---

## WhatsApp Templates

Five templates were submitted to Meta for approval via the WhatsApp Cloud API:

| Template name | Event | Language | Status |
|---|---|---|---|
| `target_shipment_created` | `shipment_created` | en_US | ⏳ PENDING META APPROVAL |
| `target_documents_needed` | `documents_needed` | en_US | ⏳ PENDING META APPROVAL |
| `target_customs_hold` | `on_hold_customs_issue` | en_US | ⏳ PENDING META APPROVAL |
| `target_delivery_attempt` | `delivery_attempt` | en_US | ⏳ PENDING META APPROVAL |
| `target_out_for_delivery` | `out_for_delivery` | en_US | ⏳ PENDING META APPROVAL |

**Template parameters (9 values in order):**
1. Tracking number
2. Carrier name / code (e.g. `DHL / DGR`)
3. Route: `Origin City, Country → Destination City, Country`
4. Estimated delivery date
5. Current status label
6. Status update timestamp
7. Public tracking link
8. Support WhatsApp link (or support instruction)
9. Recipient name

Until Meta approves templates, messages use plain-text WhatsApp markdown fallback (if `CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK=true`). Plain-text messages may only be sent within the 24-hour customer service window.

**To activate templates after Meta approves:**
```
CHATWOOT_TEMPLATE_CONFIG={"shipment_created":{"name":"target_shipment_created","category":"UTILITY","language":"en_US"},"documents_needed":{"name":"target_documents_needed","category":"UTILITY","language":"en_US"},"on_hold_customs_issue":{"name":"target_customs_hold","category":"UTILITY","language":"en_US"},"delivery_attempt:receiver":{"name":"target_delivery_attempt","category":"UTILITY","language":"en_US"},"out_for_delivery:receiver":{"name":"target_out_for_delivery","category":"UTILITY","language":"en_US"}}
```

---

## The Delivery Gap: SUBMITTED ≠ DELIVERED

This is the most important limitation to understand.

**What "submitted" means:** Our app sent the message to Chatwoot via its API, and Chatwoot accepted it and created an outgoing message record. Chatwoot returned internal message IDs.

**What we cannot confirm from this:** Whether Meta's WhatsApp infrastructure actually delivered the message to the recipient's device. There is no `delivered`, `read`, or `failed` status in the current implementation.

The full status lifecycle that Meta provides (but we don't yet capture):

```
submitted (Chatwoot accepted)
    ↓
sent (Meta accepted from Chatwoot)
    ↓
delivered (Meta confirmed device receipt)
    ↓
read (recipient opened)
    ↓
failed (Meta error: bad number, template rejected, opt-out, etc.)
```

**To complete the delivery loop**, a Meta webhook handler is needed:

```
1. Configure a webhook endpoint in Meta Business Manager / WhatsApp Cloud API settings
   URL: POST /api/integrations/chatwoot/webhook/meta-status (does not exist yet)

2. Meta posts status updates to this endpoint:
   { "statuses": [{ "id": "wamid.xxx", "status": "delivered", "recipient_id": "+201..." }] }

3. Backend looks up ShipmentNotificationLog by Chatwoot message ID → wamid mapping
   (requires storing the wamid returned by Chatwoot on send)

4. Updates log status: submitted → sent → delivered / read / failed
```

Until this is built, the UI correctly shows **SUBMITTED** (not SENT) to reflect that we only know Chatwoot accepted the message.

---

## Admin Test & Preview API

Two routes exist for staff to test the integration without waiting for a real shipment event:

```
POST /api/integrations/chatwoot/test-message
  Body: { trackingNumber, eventType, recipientRole?, force? }
  Auth: VIEW_ALL_SHIPMENTS capability
  — Sends a real notification for an existing shipment

GET  /api/integrations/chatwoot/shipments/:trackingNumber/preview
  Query: ?eventType=shipment_created&recipientRole=receiver
  Auth: VIEW_ALL_SHIPMENTS capability
  — Returns preview of what would be sent (phone masked, payload shown) without actually sending
```

The `force: true` flag on test-message bypasses the duplicate prevention (upserts the log instead of skipping).

---

## Phone Number Normalization

`normalizePhone(phone, dialCode)` handles the multi-source phone formats in this system:

- Strips non-digit characters
- If phone already starts with `+`, keeps it as-is (re-strips non-digits)
- If `dialCode` is provided (e.g. `'20'` for Egypt), prepends it
- Removes leading `0` from local number when combining with country code (Egyptian convention: `01040957289` → `+201040957289`)
- `maskPhone()` returns `+20***289` format for logging — never logs full numbers

---

## Conversation Reuse Logic

The service tries hard to put all messages for the same contact into one Chatwoot conversation, preventing a new conversation being opened for every shipment. Priority order:

1. Check `ShipmentNotificationLog` for an existing `chatwootConversationId` for this contact+inbox
2. Call `GET /api/v1/accounts/{id}/contacts/{contactId}/conversations` — find open/non-resolved conversation in this inbox
3. If none found → create new conversation

This means a sender who has received any previous notification will get all future messages in the same WhatsApp chat thread.

---

## What Is Not Implemented

| Feature | Status | Notes |
|---|---|---|
| Meta delivery/read callbacks | ❌ Missing | Needs webhook endpoint + wamid storage |
| Bulk/batch sending | ❌ Missing | No batch send endpoint |
| Opt-out / unsubscribe handling | ❌ Missing | No mechanism to honour STOP requests |
| Arabic language templates | ❌ Missing | All templates English only |
| Manual resend from UI | Partial | Admin can use test-message API; no UI button yet |
| Notification settings per org | ❌ Missing | On/off is global (CHATWOOT_ENABLED) |
| Template approval monitoring | Manual | Must check Meta Business Manager manually |

---

## No WebhookDispatcher Connection

The `WebhookDispatcher` (for outbound org webhooks — separate from Chatwoot) is still not called anywhere. The `ShipmentNotificationLog` is the Chatwoot-specific log. These are two separate systems:

| System | Purpose | Status |
|---|---|---|
| `chatwootNotificationService` | WhatsApp messages to shippers/receivers | ✅ Live |
| `WebhookDispatcher` | HTTP callbacks to org's own systems | ❌ Still not wired |
