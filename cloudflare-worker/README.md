# Cloudflare Worker WhatsApp Multi-Destination Webhook Router

This worker receives incoming WhatsApp Cloud API events (delivery receipts: `sent`, `delivered`, `read`, `failed`, and incoming customer messages) and fans them out to:
1. **Target Logistics Platform (`target-kw.com`)**: Updates `ShipmentNotificationLog` with `DELIVERED` and `READ` statuses.
2. **WhatsApp Bulk Sender (`msg.target-kw.com`)**: Updates `messages.json` analytics and dashboard.
3. **Chatwoot Customer Support**: For live conversations with customers.

---

## 1. Deploying the Worker Code

1. In the Cloudflare Dashboard, open your worker:  
   **[Workers & Pages → targert-whatsapp-router](https://dash.cloudflare.com/f6f42ebd6505d3b24f1d3b4b995986c5/workers/services/view/targert-whatsapp-router/production)**
2. Click **Edit code** (top right).
3. Replace the entire contents of `worker.js` (or `index.js`) with the code in [`cloudflare-worker/whatsapp-router.js`](./whatsapp-router.js).
4. Click **Deploy**.

---

## 2. Environment Variables Configuration

In Cloudflare Worker → **Settings** → **Variables and Secrets**, ensure the following variables are set:

| Variable Name | Value | Purpose |
|---|---|---|
| `META_VERIFY_TOKEN_96569656563` | `target_logistics_meta_verify_secret_2026` | Meta Webhook GET verification handshake |
| `SHIPMENT_WEBHOOK_URL_96569656563` | `https://target-kw.com/api/whatsapp/webhook` | Delivers receipts to Target Admin Cockpit & Database |
| `MICROSERVICE_WEBHOOK_URL_96569656563` | `https://msg.target-kw.com/api/webhook` | Delivers receipts to msg.target-kw.com dashboard |
| `CHATWOOT_WEBHOOK_URL_96569656563` | `https://inbox.mawthook.io/...` | Mirrors messages to Chatwoot (optional) |
| `META_APP_SECRET_96569656563` | *(Your Meta App Secret)* | Optional HMAC verification |

---

## 3. Adding a Custom Domain for `target-kw.com` (Optional)

If you'd like the worker to also be accessible directly under your `target-kw.com` zone:
1. In Cloudflare Dashboard, go to **Workers & Pages** → **targert-whatsapp-router** → **Settings** → **Domains & Routes**.
2. Click **Add** → **Custom Domain**.
3. Enter: `whatsapp-webhook.target-kw.com` (or `webhook.target-kw.com`).
4. Click **Add Custom Domain**. Cloudflare will automatically provision the SSL certificate.

---

## 4. Meta Developer Portal Webhook Setup

1. Open [developers.facebook.com](https://developers.facebook.com) → Your App → **WhatsApp** → **Configuration**.
2. In the **Webhook** section, click **Edit**:
   - **Callback URL**: `https://whatsapp-webhook.mawthook.io/` (or your new domain `https://whatsapp-webhook.target-kw.com/`)
   - **Verify Token**: `target_logistics_meta_verify_secret_2026`
3. Click **Verify and Save**. (The worker will respond with HTTP 200 and echo the challenge).
4. In the **Webhook Fields** table below, find **`messages`** and click **Subscribe**.
