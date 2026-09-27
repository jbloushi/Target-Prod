/**
 * Target Logistics Global — WhatsApp Multi-Destination Cloudflare Webhook Router
 * Worker Name: targert-whatsapp-router
 * Production URL: https://whatsapp-webhook.mawthook.io/ (or custom domain on target-kw.com)
 *
 * Responsibilities:
 * 1. Handles Meta WhatsApp Cloud API GET challenge verification (hub.challenge / hub.verify_token).
 * 2. Receives Meta WhatsApp Cloud API POST webhooks (delivery receipts: sent, delivered, read, failed & customer inbound messages).
 * 3. Fans out / broadcasts the webhook concurrently to:
 *    - Target Platform: https://target-kw.com/api/whatsapp/webhook
 *    - Message Microservice: https://msg.target-kw.com/api/webhook
 *    - Chatwoot Support Inbox: (configured in env)
 * 4. Responds immediately (200 OK) to Meta within <20ms using ctx.waitUntil.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─────────────────────────────────────────────────────────────
    // 1. GET Handshake Verification (Meta Hub Challenge)
    // ─────────────────────────────────────────────────────────────
    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // Accepted verify tokens across the system
      const validTokens = [
        env.META_VERIFY_TOKEN,
        env.META_VERIFY_TOKEN_96569656563,
        'target_logistics_meta_verify_secret_2026',
        'change-me-verify-token',
      ].filter(Boolean);

      if (mode === 'subscribe' && token && validTokens.includes(token)) {
        console.log(`[Meta Webhook] Successfully verified hub challenge (token: ${token})`);
        return new Response(challenge || '', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      console.warn(`[Meta Webhook] Verification rejected. Token supplied: "${token}"`);
      return new Response('Verification token mismatch', { status: 403 });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Health & Status Check
    // ─────────────────────────────────────────────────────────────
    if (request.method === 'HEAD' || (request.method === 'GET' && !url.searchParams.has('hub.mode'))) {
      return new Response(
        JSON.stringify({
          status: 'online',
          service: 'Target WhatsApp Webhook Router',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 3. POST Webhook Delivery & Status Fan-Out
    // ─────────────────────────────────────────────────────────────
    if (request.method === 'POST') {
      const signature = request.headers.get('x-hub-signature-256') || '';
      const rawBody = await request.text();

      let payload = {};
      try {
        payload = JSON.parse(rawBody);
      } catch (e) {
        console.error('[Meta Webhook] Invalid JSON payload received:', e.message);
        return new Response('Invalid JSON', { status: 400 });
      }

      // Extract phone number from WhatsApp payload metadata if available
      const displayPhone =
        payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number ||
        '96569656563';
      const cleanPhone = String(displayPhone).replace(/\D/g, '');

      // Resolve destination endpoints
      // 1. Target Main Platform (Audit Cockpit & Telemetry DB)
      const targetPlatformUrl =
        env[`TARGET_WEBHOOK_URL_${cleanPhone}`] ||
        env.TARGET_WEBHOOK_URL ||
        'https://target-kw.com/api/whatsapp/webhook';

      // 2. WhatsApp Microservice (msg.target-kw.com) - checks existing SHIPMENT_WEBHOOK_URL as well
      const microserviceUrl =
        env[`MICROSERVICE_WEBHOOK_URL_${cleanPhone}`] ||
        env.MICROSERVICE_WEBHOOK_URL ||
        env[`SHIPMENT_WEBHOOK_URL_${cleanPhone}`] ||
        env.SHIPMENT_WEBHOOK_URL ||
        'https://msg.target-kw.com/api/webhook';

      // 3. Chatwoot Support Inbox
      const chatwootUrl =
        env[`CHATWOOT_WEBHOOK_URL_${cleanPhone}`] ||
        env.CHATWOOT_WEBHOOK_URL ||
        null;

      // Collect all downstream targets (deduplicated)
      const targets = [
        targetPlatformUrl,
        microserviceUrl,
        chatwootUrl,
      ].filter((u, idx, arr) => u && typeof u === 'string' && u.startsWith('http') && arr.indexOf(u) === idx);

      console.log(`[Meta Webhook Router] Ingested event. Fan-out to ${targets.length} targets:`, targets);

      // Perform non-blocking fan-out in the background so Meta receives immediate 200 OK
      const dispatchPromise = Promise.allSettled(
        targets.map(async (targetUrl) => {
          try {
            const res = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature,
                'X-Forwarded-From': 'cloudflare-whatsapp-router',
                'X-Display-Phone': cleanPhone,
              },
              body: rawBody,
            });
            console.log(`[Webhook Fan-out] ${targetUrl} -> HTTP ${res.status}`);
          } catch (err) {
            console.error(`[Webhook Fan-out Error] ${targetUrl} -> ${err.message}`);
          }
        })
      );

      // If execution context supports waitUntil, use it so worker stays alive until fetch finishes
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(dispatchPromise);
      } else {
        await dispatchPromise;
      }

      // Instant 200 OK acknowledgment to Meta WhatsApp Gateway
      return new Response(JSON.stringify({ status: 'EVENT_RECEIVED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
