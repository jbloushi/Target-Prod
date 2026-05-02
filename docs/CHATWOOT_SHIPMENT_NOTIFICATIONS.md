# Chatwoot Shipment WhatsApp Notifications

Target-Prod can send operational shipment messages through a Chatwoot WhatsApp inbox using Chatwoot account APIs.

## Environment

Add these values to `backend/.env`:

```env
CHATWOOT_ENABLED=true
CHATWOOT_BASE_URL=https://chatwoot.example.com
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_INBOX_ID=1
CHATWOOT_API_ACCESS_TOKEN=replace-with-chatwoot-api-access-token
PUBLIC_TRACKING_BASE_URL=https://target-kw.com
SUPPORT_WHATSAPP_PHONE=96597691271
CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK=true
CHATWOOT_TEMPLATE_CONFIG=
```

`CHATWOOT_API_ACCESS_TOKEN` is sent as an `api_access_token` header and is never persisted in notification logs.
`PUBLIC_TRACKING_BASE_URL` controls the shipment tracking link. `SUPPORT_WHATSAPP_PHONE` controls the `wa.me` support link embedded in fallback messages.

## Event Matrix

| Event | Sender | Receiver | Trigger |
| --- | --- | --- | --- |
| `shipment_created` | yes | yes | shipment creation |
| `on_hold_customs_issue` | yes | yes | `exception` status with customs/clearance/hold text |
| `documents_needed` | yes | yes | `exception` status with document/invoice/paperwork text |
| `delivery_attempt` | no | yes | `exception` status with attempt/unavailable/no answer text |
| `out_for_delivery` | no | yes | `out_for_delivery` status |

## WhatsApp Templates

Outside the WhatsApp 24-hour customer service window, configure approved WhatsApp Business Manager templates in Chatwoot. `CHATWOOT_TEMPLATE_CONFIG` is a JSON map keyed by event name, or by `event:recipientRole`.

Example:

```env
CHATWOOT_TEMPLATE_CONFIG={"shipment_created":{"name":"target_shipment_created","category":"UTILITY","language":"en_US"},"documents_needed":{"name":"target_documents_needed","category":"UTILITY","language":"en_US"},"on_hold_customs_issue":{"name":"target_customs_hold","category":"UTILITY","language":"en_US"},"delivery_attempt:receiver":{"name":"target_delivery_attempt","category":"UTILITY","language":"en_US"},"out_for_delivery:receiver":{"name":"target_out_for_delivery","category":"UTILITY","language":"en_US"}}
```

The service sends `template_params` with shipment values:

1. tracking number
2. carrier name/code
3. origin to destination
4. estimated delivery date
5. current status
6. current status datetime
7. public tracking link
8. WhatsApp support link or reply-to-WhatsApp support instruction
9. recipient name

Submitted Meta WhatsApp utility templates:

| Event | Template | Language | Category |
| --- | --- | --- | --- |
| `shipment_created` | `target_shipment_created` | `en_US` | `UTILITY` |
| `documents_needed` | `target_documents_needed` | `en_US` | `UTILITY` |
| `on_hold_customs_issue` | `target_customs_hold` | `en_US` | `UTILITY` |
| `delivery_attempt:receiver` | `target_delivery_attempt` | `en_US` | `UTILITY` |
| `out_for_delivery:receiver` | `target_out_for_delivery` | `en_US` | `UTILITY` |

If this Chatwoot installation rejects `template_params`, the failed response is saved in `ShipmentNotificationLog.responseJson`. Confirm the installed Chatwoot version and WhatsApp inbox template setup, then adjust the template config or payload shape.

## Logging And Deduplication

Every attempted target is persisted in `ShipmentNotificationLog` with `submitted`, `failed`, `skipped`, or `pending` status. `submitted` means Chatwoot accepted the API request; delivery confirmation should come from WhatsApp/Meta status webhooks. The unique dedupe key is:

```text
shipmentId + eventType + recipientRole + provider
```

The same event is not sent twice to the same shipment recipient role unless `force=true` is used by the test endpoint. Phone numbers are masked in app logs and stored masked in notification logs.

## Test Message

Authenticate as a platform operations user with `VIEW_ALL_SHIPMENTS`, then send a real Chatwoot message from existing shipment data:

```bash
curl -X POST "$API_BASE_URL/api/integrations/chatwoot/test-message" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "TRK123",
    "eventType": "shipment_created",
    "recipientRole": "receiver",
    "force": true
  }'
```

Send to both sender and receiver by omitting `recipientRole`:

```bash
curl -X POST "$API_BASE_URL/api/integrations/chatwoot/test-message" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "TRK123",
    "eventType": "shipment_created",
    "force": true
  }'
```

Preview the message body without sending:

```bash
curl "$API_BASE_URL/api/integrations/chatwoot/shipments/TRK123/preview?eventType=shipment_created&recipientRole=receiver" \
  -H "Authorization: Bearer $JWT"
```

Check logs with Prisma or SQL:

```sql
SELECT trackingNumber, eventType, recipientRole, status, errorMessage, createdAt
FROM ShipmentNotificationLog
ORDER BY createdAt DESC
LIMIT 20;
```
