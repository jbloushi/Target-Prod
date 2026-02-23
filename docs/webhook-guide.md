# 3PL Logistics Webhook Guide

Instead of repeatedly polling the API to check if a shipment has been delivered, you can register a **Webhook Subscription**. Our platform will push real-time HTTP events directly to your server the moment a shipment's status changes.

## 1. Registering a Webhook
You can register a webhook destination via your **Developer Settings** dashboard.
You must provide:
1.  **Target URL**: A public `HTTPS` endpoint on your server (e.g., `https://your-app.com/api/webhooks/logistics`).
2.  **Events**: The specific events you want to listen to (or `*` for all).

Upon registration, the dashboard will provide you with a **Webhook Secret**. You must save this secret to verify incoming payloads.

---

## 2. Verifying the Payload Signature
To prevent malicious actors from sending fake delivery events to your server, every valid webhook request contains a cryptographic signature in the headers.

**Header:** `X-Webhook-Signature-256`

You must calculate an `HMAC SHA-256` hash of the raw JSON request body using your **Webhook Secret**, and ensure it exactly matches the header.

### Node.js Verification Example
```javascript
const crypto = require('crypto');

app.post('/api/webhooks/logistics', express.raw({type: 'application/json'}), (req, res) => {
    const signature = req.headers['x-webhook-signature-256'];
    const WEBHOOK_SECRET = process.env.MY_WEBHOOK_SECRET;

    // Calculate the expected hash
    const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(req.body) // Note: Must use raw buffered body, not parsed JSON object
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).send('Invalid Signature!');
    }

    // Parse JSON safely now
    const event = JSON.parse(req.body);
    console.log(`Received event: ${req.headers['x-webhook-event']}`);
    
    res.sendStatus(200); // Acknowledge receipt immediately
});
```
*Note: You must respond with a `2xx` status code within 5 seconds. If you don't, our system will assume the delivery failed and may attempt to retry.*

---

## 3. Webhook Events & Payloads

The event type is always specified in the header:
**Header:** `X-Webhook-Event`

### Event: `shipment.created`
Triggered immediately when a draft or live shipment is inserted into the system database.

**Payload Layout:**
The payload will contain the complete `Shipment` object JSON representation, including:
```json
{
    "_id": "65b...",
    "trackingNumber": "3PL-123456789",
    "status": "draft",
    "origin": { "city": "New York", "countryCode": "US", "address": "...", "name": "..." },
    "destination": { "city": "Toronto", "countryCode": "CA", "address": "...", "name": "..." },
    "createdAt": "2024-02-21T08:00:00Z",
    "parcels": [...],
    "items": [...]
}
```

### Event: `shipment.status_updated`
Triggered whenever the shipment lifecycle transitions (e.g., `ready_for_pickup` -> `in_transit` -> `delivered`).

**Payload Layout:**
The payload will contain the completely updated `Shipment` object JSON representation, including any newly generated carrier tracking metrics:
```json
{
    "_id": "65b...",
    "trackingNumber": "3PL-123456789",
    "status": "delivered",
    "dhlTrackingNumber": "9876543210",
    "history": [...],
    "estimatedDelivery": "2024-02-23T17:00:00Z",
    "updatedAt": "2024-02-23T14:30:00Z"
}
```

### Valid Statuses
Your system should be prepared to handle the following string constants in the payload's `status` field:
*   `draft`: Setup initiated, not yet booked.
*   `created`: Booked successfully with the carrier.
*   `ready_for_pickup`: Awaiting driver dispatch.
*   `picked_up`: Intercepted by local driver.
*   `in_transit`: Scanning through carrier network.
*   `out_for_delivery`: Final mile delivery initiated.
*   `delivered`: Journey complete.
*   `exception`: Halted (Customs, bad address, etc).
