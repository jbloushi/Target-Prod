/**
 * Cloudflare WhatsApp Router Test Suite (Standalone Mirror)
 * File: cloudflare-worker/__tests__/whatsappRouter.test.js
 *
 * Verifies:
 * 1. GET Handshake Challenge Verification with valid tokens and rejection of invalid tokens
 * 2. HEAD and GET status health checks
 * 3. POST Webhook delivery and 3-way fan-out to Target, Microservice, and Chatwoot
 * 4. Default Chatwoot URL fallback: https://inbox.mawthook.io/webhooks/whatsapp/+96569656563 when env is empty
 * 5. Preservation of raw body, signature headers, X-Forwarded-From, and X-Display-Phone
 * 6. Non-blocking error isolation across downstream targets
 */

const path = require('path');
const { pathToFileURL } = require('url');

describe('Cloudflare WhatsApp Webhook Router (whatsapp-router.js)', () => {
    let router;
    let originalFetch;
    let fetchCalls;

    beforeAll(async () => {
        // Load worker safely in Node / Jest environment (with fallback for Jest VM without experimental-vm-modules)
        const workerPath = path.resolve(__dirname, '../whatsapp-router.js');
        try {
            const dynamicImport = new Function('url', 'return import(url)');
            const mod = await dynamicImport(pathToFileURL(workerPath).href);
            router = mod.default || mod;
        } catch (err) {
            const fs = require('fs');
            const rawCode = fs.readFileSync(workerPath, 'utf8');
            const transformed = rawCode.replace(/export\s+default\s+/, 'return ');
            router = new Function(transformed)();
        }
    });

    beforeEach(() => {
        fetchCalls = [];
        originalFetch = global.fetch;
        global.fetch = jest.fn(async (url, options) => {
            fetchCalls.push({ url, options });
            return {
                status: 200,
                json: async () => ({ success: true })
            };
        });
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    // ─────────────────────────────────────────────────────────────
    // 1. GET Handshake Verification (Meta Hub Challenge)
    // ─────────────────────────────────────────────────────────────
    describe('GET Verification Handshake', () => {
        const DEFAULT_ENV = {
            META_VERIFY_TOKEN: 'test_meta_token_abc',
            META_VERIFY_TOKEN_96569656563: 'test_token_965'
        };

        test('returns 200 and echoes challenge with valid env token', async () => {
            const req = new Request('https://router.local/?hub.mode=subscribe&hub.verify_token=test_meta_token_abc&hub.challenge=CHALLENGE_ACCEPTED_123', {
                method: 'GET'
            });

            const res = await router.fetch(req, DEFAULT_ENV, {});
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('text/plain');
            const text = await res.text();
            expect(text).toBe('CHALLENGE_ACCEPTED_123');
        });

        test('returns 200 with phone-specific verify token', async () => {
            const req = new Request('https://router.local/?hub.mode=subscribe&hub.verify_token=test_token_965&hub.challenge=PHONE_CHALLENGE_456', {
                method: 'GET'
            });

            const res = await router.fetch(req, DEFAULT_ENV, {});
            expect(res.status).toBe(200);
            const text = await res.text();
            expect(text).toBe('PHONE_CHALLENGE_456');
        });

        test('returns 200 with hardcoded fallback token target_logistics_meta_verify_secret_2026', async () => {
            const req = new Request('https://router.local/?hub.mode=subscribe&hub.verify_token=target_logistics_meta_verify_secret_2026&hub.challenge=SECRET_CHALLENGE_789', {
                method: 'GET'
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            const text = await res.text();
            expect(text).toBe('SECRET_CHALLENGE_789');
        });

        test('returns 403 Forbidden on invalid verify token', async () => {
            const req = new Request('https://router.local/?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=EVIL_ATTEMPT', {
                method: 'GET'
            });

            const res = await router.fetch(req, DEFAULT_ENV, {});
            expect(res.status).toBe(403);
            const text = await res.text();
            expect(text).toBe('Verification token mismatch');
        });

        test('returns 403 when mode is not subscribe', async () => {
            const req = new Request('https://router.local/?hub.mode=publish&hub.verify_token=test_meta_token_abc&hub.challenge=XYZ', {
                method: 'GET'
            });

            const res = await router.fetch(req, DEFAULT_ENV, {});
            expect(res.status).toBe(403);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Health & Status Checks
    // ─────────────────────────────────────────────────────────────
    describe('Health & Status Check', () => {
        test('HEAD request returns 200 online', async () => {
            const req = new Request('https://router.local/', { method: 'HEAD' });
            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('application/json');
            const data = await res.json();
            expect(data.status).toBe('online');
            expect(data.service).toBe('Target WhatsApp Webhook Router');
        });

        test('GET request without hub.mode returns 200 online', async () => {
            const req = new Request('https://router.local/', { method: 'GET' });
            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('online');
        });

        test('unsupported method (PUT, DELETE) returns 405 Method Not Allowed', async () => {
            const req = new Request('https://router.local/', { method: 'DELETE' });
            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(405);
            const text = await res.text();
            expect(text).toBe('Method Not Allowed');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. POST Webhook Delivery & Fan-out
    // ─────────────────────────────────────────────────────────────
    describe('POST Webhook Fan-Out', () => {
        const samplePayload = {
            object: 'whatsapp_business_account',
            entry: [
                {
                    id: 'WABA_123456789',
                    changes: [
                        {
                            value: {
                                messaging_product: 'whatsapp',
                                metadata: {
                                    display_phone_number: '96569656563',
                                    phone_number_id: '10987654321'
                                },
                                messages: [
                                    {
                                        from: '96599112233',
                                        id: 'wamid.ABGG123',
                                        timestamp: '1729792800',
                                        text: { body: 'Where is my order?' },
                                        type: 'text'
                                    }
                                ]
                            },
                            field: 'messages'
                        }
                    ]
                }
            ]
        };

        test('rejects malformed non-JSON body with 400 Bad Request', async () => {
            const req = new Request('https://router.local/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not a valid json string'
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(400);
            const text = await res.text();
            expect(text).toBe('Invalid JSON');
            expect(fetchCalls.length).toBe(0);
        });

        test('fans out to Chatwoot, Target Platform, and Microservice with default Chatwoot URL when env is empty', async () => {
            const rawBody = JSON.stringify(samplePayload);
            const waitUntilPromise = jest.fn();
            const ctx = { waitUntil: waitUntilPromise };

            const req = new Request('https://router.local/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-hub-signature-256': 'sha256=test_signature_hex_123'
                },
                body: rawBody
            });

            // Empty env - must fall back to canonical defaults
            const res = await router.fetch(req, {}, ctx);

            // 1. Meta receives immediate 200 OK
            expect(res.status).toBe(200);
            const resBody = await res.json();
            expect(resBody).toEqual({ status: 'EVENT_RECEIVED' });

            // 2. ctx.waitUntil was called
            expect(waitUntilPromise).toHaveBeenCalledTimes(1);

            // 3. Exactly 3 downstream fan-out destinations
            expect(fetchCalls.length).toBe(3);

            const urls = fetchCalls.map(c => c.url);
            expect(urls).toContain('https://target-kw.com/api/whatsapp/webhook');
            expect(urls).toContain('https://msg.target-kw.com/api/webhook');
            expect(urls).toContain('https://inbox.mawthook.io/webhooks/whatsapp/+96569656563');

            // 4. Headers and raw body forwarded accurately
            fetchCalls.forEach(call => {
                expect(call.options.method).toBe('POST');
                expect(call.options.body).toBe(rawBody);
                expect(call.options.headers['Content-Type']).toBe('application/json');
                expect(call.options.headers['X-Hub-Signature-256']).toBe('sha256=test_signature_hex_123');
                expect(call.options.headers['X-Forwarded-From']).toBe('cloudflare-whatsapp-router');
                expect(call.options.headers['X-Display-Phone']).toBe('96569656563');
            });
        });

        test('respects custom env URL overrides when provided', async () => {
            const customEnv = {
                TARGET_WEBHOOK_URL: 'https://staging.target-kw.com/webhook',
                MICROSERVICE_WEBHOOK_URL: 'https://dev-msg.target-kw.com/webhook',
                CHATWOOT_WEBHOOK_URL: 'https://inbox.mawthook.io/webhooks/whatsapp/+96511111111'
            };

            const req = new Request('https://router.local/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(samplePayload)
            });

            const res = await router.fetch(req, customEnv, {});
            expect(res.status).toBe(200);

            const urls = fetchCalls.map(c => c.url);
            expect(urls).toContain('https://staging.target-kw.com/webhook');
            expect(urls).toContain('https://dev-msg.target-kw.com/webhook');
            expect(urls).toContain('https://inbox.mawthook.io/webhooks/whatsapp/+96511111111');
        });

        test('resilience: handles downstream network rejection without failing response to Meta', async () => {
            // Simulate 1 target failing with network error and 1 target failing with 500
            global.fetch = jest.fn(async (url) => {
                if (url.includes('msg.target-kw.com')) {
                    throw new Error('Connection refused');
                }
                if (url.includes('mawthook.io')) {
                    return { status: 502, json: async () => ({ error: 'Bad Gateway' }) };
                }
                return { status: 200, json: async () => ({ success: true }) };
            });

            const req = new Request('https://router.local/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(samplePayload)
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('EVENT_RECEIVED');
        });
    });
});
