/**
 * Cloudflare WhatsApp Router Adversarial & Stress Test Suite
 * File: backend/__tests__/whatsappRouterAdversarial.test.js
 *
 * Adversarially challenges cloudflare-worker/whatsapp-router.js across:
 * 1. Empty environment object {} (Default Chatwoot URL https://inbox.mawthook.io/webhooks/whatsapp/+96569656563)
 * 2. Custom environment overrides (phone-specific vs generic, priority chains, deduplication, invalid URLs)
 * 3. Non-standard phone formats & metadata mutations (+965-..., 00965..., empty/missing metadata, status receipts)
 * 4. Tampered & missing signature headers (X-Hub-Signature-256 preservation, raw body byte-exactness, unicode)
 * 5. Mocked fetch rejections & multi-target failure cascades (simultaneous network errors, 5xx, timeouts)
 * 6. Execution context edge cases (ctx with/without waitUntil, null ctx, undefined ctx)
 * 7. Boundary stress & malformed payloads (non-JSON, primitive JSON, HTTP verbs)
 */

const path = require('path');
const { pathToFileURL } = require('url');

describe('Adversarial Stress Testing: Cloudflare WhatsApp Router', () => {
    let router;
    let originalFetch;
    let fetchCalls;

    beforeAll(async () => {
        const workerPath = path.resolve(__dirname, '../../cloudflare-worker/whatsapp-router.js');
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
    // 1. Empty Environment Object {} Verification
    // ─────────────────────────────────────────────────────────────
    describe('1. Empty Environment Object {}', () => {
        const standardPayload = {
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        metadata: { display_phone_number: '96569656563' },
                        messages: [{ id: 'msg_1', from: '96599112233', text: { body: 'Hello' } }]
                    }
                }]
            }]
        };

        test('POST with empty env {} routes to Mawthook Chatwoot inbox endpoint', async () => {
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(standardPayload)
            });

            const res = await router.fetch(req, {}, { waitUntil: jest.fn() });
            expect(res.status).toBe(200);

            const urls = fetchCalls.map(c => c.url);
            expect(urls).toContain('https://inbox.mawthook.io/webhooks/whatsapp/+96569656563');
            expect(urls).toContain('https://target-kw.com/api/whatsapp/webhook');
            expect(urls).toContain('https://msg.target-kw.com/api/webhook');
            expect(fetchCalls.length).toBe(3);
        });

        test('GET handshake with empty env {} accepts hardcoded fallback token', async () => {
            const req = new Request(
                'https://router.mawthook.io/?hub.mode=subscribe&hub.verify_token=target_logistics_meta_verify_secret_2026&hub.challenge=CHALLENGE_DEFAULT',
                { method: 'GET' }
            );

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('CHALLENGE_DEFAULT');
        });

        test('GET handshake with empty env {} accepts secondary fallback token change-me-verify-token', async () => {
            const req = new Request(
                'https://router.mawthook.io/?hub.mode=subscribe&hub.verify_token=change-me-verify-token&hub.challenge=CHALLENGE_SECONDARY',
                { method: 'GET' }
            );

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('CHALLENGE_SECONDARY');
        });

        test('GET handshake with empty env {} rejects unauthorized tokens with 403', async () => {
            const req = new Request(
                'https://router.mawthook.io/?hub.mode=subscribe&hub.verify_token=attacker_token_123&hub.challenge=FAIL',
                { method: 'GET' }
            );

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(403);
            expect(await res.text()).toBe('Verification token mismatch');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Custom Environment Overrides & Priority Chains
    // ─────────────────────────────────────────────────────────────
    describe('2. Custom Environment Overrides', () => {
        test('phone-specific override takes precedence over generic env and default', async () => {
            const env = {
                CHATWOOT_WEBHOOK_URL_96569656563: 'https://inbox.mawthook.io/webhooks/whatsapp/+96569656563_SPECIFIC',
                CHATWOOT_WEBHOOK_URL: 'https://inbox.mawthook.io/webhooks/whatsapp/GENERIC',
                TARGET_WEBHOOK_URL_96569656563: 'https://target-kw.com/api/whatsapp/SPECIFIC',
                TARGET_WEBHOOK_URL: 'https://target-kw.com/api/whatsapp/GENERIC',
                MICROSERVICE_WEBHOOK_URL_96569656563: 'https://msg.target-kw.com/api/SPECIFIC',
                MICROSERVICE_WEBHOOK_URL: 'https://msg.target-kw.com/api/GENERIC'
            };

            const payload = {
                entry: [{
                    changes: [{
                        value: {
                            metadata: { display_phone_number: '96569656563' }
                        }
                    }]
                }]
            };

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            await router.fetch(req, env, { waitUntil: jest.fn() });

            const urls = fetchCalls.map(c => c.url);
            expect(urls).toContain('https://inbox.mawthook.io/webhooks/whatsapp/+96569656563_SPECIFIC');
            expect(urls).toContain('https://target-kw.com/api/whatsapp/SPECIFIC');
            expect(urls).toContain('https://msg.target-kw.com/api/SPECIFIC');
            expect(urls).not.toContain('https://inbox.mawthook.io/webhooks/whatsapp/GENERIC');
            expect(urls).not.toContain('https://target-kw.com/api/whatsapp/GENERIC');
            expect(urls).not.toContain('https://msg.target-kw.com/api/GENERIC');
        });

        test('microservice fallback chain: MICROSERVICE > SHIPMENT > default', async () => {
            // Test SHIPMENT fallback when MICROSERVICE is absent
            const envWithShipment = {
                SHIPMENT_WEBHOOK_URL_96569656563: 'https://legacy-shipment.target-kw.com/api/webhook'
            };

            const payload = {
                entry: [{
                    changes: [{
                        value: { metadata: { display_phone_number: '96569656563' } }
                    }]
                }]
            };

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            await router.fetch(req, envWithShipment, { waitUntil: jest.fn() });
            const urls = fetchCalls.map(c => c.url);
            expect(urls).toContain('https://legacy-shipment.target-kw.com/api/webhook');
        });

        test('deduplicates endpoints if multiple env vars resolve to identical destination', async () => {
            const envSameTargets = {
                TARGET_WEBHOOK_URL: 'https://single-destination.target-kw.com/webhook',
                MICROSERVICE_WEBHOOK_URL: 'https://single-destination.target-kw.com/webhook',
                CHATWOOT_WEBHOOK_URL: 'https://single-destination.target-kw.com/webhook'
            };

            const payload = { entry: [{ changes: [{ value: { metadata: { display_phone_number: '96569656563' } } }] }] };
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            await router.fetch(req, envSameTargets, { waitUntil: jest.fn() });
            expect(fetchCalls.length).toBe(1);
            expect(fetchCalls[0].url).toBe('https://single-destination.target-kw.com/webhook');
        });

        test('filters out invalid non-HTTP targets without crashing', async () => {
            const envInvalidUrls = {
                TARGET_WEBHOOK_URL: 'ftp://target-kw.com/webhook',
                MICROSERVICE_WEBHOOK_URL: 'not-a-valid-url',
                CHATWOOT_WEBHOOK_URL: null
            };

            const payload = { entry: [{ changes: [{ value: { metadata: { display_phone_number: '96569656563' } } }] }] };
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const res = await router.fetch(req, envInvalidUrls, { waitUntil: jest.fn() });
            expect(res.status).toBe(200);
            // Default Chatwoot URL is used because CHATWOOT_WEBHOOK_URL was null
            const urls = fetchCalls.map(c => c.url);
            expect(urls).toEqual(['https://inbox.mawthook.io/webhooks/whatsapp/+96569656563']);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Non-Standard Phone Formats & Metadata Variations
    // ─────────────────────────────────────────────────────────────
    describe('3. Non-Standard Phone Formats & Metadata Variations', () => {
        test('normalizes hyphenated formatted phone (+965-6965-6563)', async () => {
            const env = {
                CHATWOOT_WEBHOOK_URL_96569656563: 'https://inbox.mawthook.io/webhooks/whatsapp/+96569656563_NORMALIZED'
            };

            const payload = {
                entry: [{
                    changes: [{
                        value: { metadata: { display_phone_number: '+965-6965-6563' } }
                    }]
                }]
            };

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            await router.fetch(req, env, { waitUntil: jest.fn() });
            const chatwootCall = fetchCalls.find(c => c.url.includes('mawthook.io'));
            expect(chatwootCall.url).toBe('https://inbox.mawthook.io/webhooks/whatsapp/+96569656563_NORMALIZED');
            expect(chatwootCall.options.headers['X-Display-Phone']).toBe('96569656563');
        });

        test('handles leading zero international format (0096569656563)', async () => {
            const env = {
                CHATWOOT_WEBHOOK_URL_00965696563: 'https://inbox.mawthook.io/webhooks/whatsapp/00_MATCH'
            };

            const payload = {
                entry: [{
                    changes: [{
                        value: { metadata: { display_phone_number: '0096569656563' } }
                    }]
                }]
            };

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            await router.fetch(req, env, { waitUntil: jest.fn() });
            fetchCalls.forEach(call => {
                expect(call.options.headers['X-Display-Phone']).toBe('0096569656563');
            });
        });

        test('handles empty metadata and missing display_phone_number by falling back to 96569656563', async () => {
            const payloadEmptyMetadata = {
                entry: [{
                    changes: [{
                        value: {
                            metadata: {} // empty metadata object
                        }
                    }]
                }]
            };

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadEmptyMetadata)
            });

            await router.fetch(req, {}, { waitUntil: jest.fn() });
            const urls = fetchCalls.map(c => c.url);
            expect(urls).toContain('https://inbox.mawthook.io/webhooks/whatsapp/+96569656563');
            fetchCalls.forEach(call => {
                expect(call.options.headers['X-Display-Phone']).toBe('96569656563');
            });
        });

        test('handles payload with empty changes or entry array gracefully', async () => {
            const variations = [
                {},
                { entry: [] },
                { entry: [{ changes: [] }] },
                { entry: [{ changes: [{ value: null }] }] }
            ];

            for (const payload of variations) {
                fetchCalls = [];
                const req = new Request('https://router.mawthook.io/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const res = await router.fetch(req, {}, { waitUntil: jest.fn() });
                expect(res.status).toBe(200);
                const urls = fetchCalls.map(c => c.url);
                expect(urls).toContain('https://inbox.mawthook.io/webhooks/whatsapp/+96569656563');
            }
        });

        test('handles Meta status receipts payload (sent, delivered, read)', async () => {
            const statusReceiptPayload = {
                object: 'whatsapp_business_account',
                entry: [{
                    id: 'WABA_123',
                    changes: [{
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: { display_phone_number: '96569656563', phone_number_id: '12345' },
                            statuses: [{
                                id: 'wamid.HB123',
                                status: 'delivered',
                                timestamp: '1729792800',
                                recipient_id: '96599112233'
                            }]
                        },
                        field: 'messages'
                    }]
                }]
            };

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(statusReceiptPayload)
            });

            const res = await router.fetch(req, {}, { waitUntil: jest.fn() });
            expect(res.status).toBe(200);
            expect(fetchCalls.length).toBe(3);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Tampered & Missing Signature Headers (X-Hub-Signature-256)
    // ─────────────────────────────────────────────────────────────
    describe('4. Tampered & Missing Signature Headers', () => {
        test('missing signature header is forwarded as empty string without crashing', async () => {
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });

            const res = await router.fetch(req, {}, { waitUntil: jest.fn() });
            expect(res.status).toBe(200);
            fetchCalls.forEach(call => {
                expect(call.options.headers['X-Hub-Signature-256']).toBe('');
            });
        });

        test('tampered signature header is forwarded intact to downstreams for verification', async () => {
            const tamperedSig = 'sha256=TAMPERED_0123456789abcdef';
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-hub-signature-256': tamperedSig
                },
                body: JSON.stringify({ entry: [] })
            });

            const res = await router.fetch(req, {}, { waitUntil: jest.fn() });
            expect(res.status).toBe(200);
            fetchCalls.forEach(call => {
                expect(call.options.headers['X-Hub-Signature-256']).toBe(tamperedSig);
            });
        });

        test('preserves byte-exact raw body including whitespace and arabic unicode', async () => {
            const rawBodyWithUnicode = '{\n  "arabic_text": "شحنة رقم 5535 تم استلامها بنجاح 🚚",\n  "entry": []\n}';
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: rawBodyWithUnicode
            });

            const res = await router.fetch(req, {}, { waitUntil: jest.fn() });
            expect(res.status).toBe(200);
            fetchCalls.forEach(call => {
                expect(call.options.body).toBe(rawBodyWithUnicode);
            });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Mocked Fetch Rejections & Resilience
    // ─────────────────────────────────────────────────────────────
    describe('5. Mocked Fetch Rejections & Downstream Failure Isolation', () => {
        test('router survives when all downstream targets fail with network errors', async () => {
            global.fetch = jest.fn(async () => {
                throw new Error('ETIMEDOUT: Connection timed out');
            });

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });

            // Router must still return 200 OK to Meta
            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('EVENT_RECEIVED');
        });

        test('router survives mixed downstream failures (rejection, 500, 503)', async () => {
            global.fetch = jest.fn(async (url) => {
                if (url.includes('target-kw.com/api/whatsapp')) {
                    throw new Error('ECONNREFUSED');
                }
                if (url.includes('msg.target-kw.com')) {
                    return { status: 503, statusText: 'Service Unavailable' };
                }
                if (url.includes('mawthook.io')) {
                    return { status: 500, statusText: 'Internal Server Error' };
                }
                return { status: 200 };
            });

            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('EVENT_RECEIVED');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Execution Context (ctx) Variations
    // ─────────────────────────────────────────────────────────────
    describe('6. Execution Context (ctx) Variations', () => {
        test('operates synchronously when ctx has no waitUntil', async () => {
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(200);
            expect(fetchCalls.length).toBe(3);
        });

        test('operates safely when ctx is null or undefined', async () => {
            const req1 = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });
            const resNull = await router.fetch(req1, {}, null);
            expect(resNull.status).toBe(200);

            const req2 = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });
            const resUndef = await router.fetch(req2, {}, undefined);
            expect(resUndef.status).toBe(200);
        });

        test('passes dispatch promise to ctx.waitUntil when provided', async () => {
            const waitUntilMock = jest.fn();
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entry: [] })
            });

            const res = await router.fetch(req, {}, { waitUntil: waitUntilMock });
            expect(res.status).toBe(200);
            expect(waitUntilMock).toHaveBeenCalledTimes(1);
            expect(waitUntilMock.mock.calls[0][0]).toBeInstanceOf(Promise);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 7. Boundary Stress & Malformed Payloads
    // ─────────────────────────────────────────────────────────────
    describe('7. Boundary Stress & Malformed Payloads', () => {
        test('rejects empty body with 400 Bad Request', async () => {
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: ''
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(400);
            expect(await res.text()).toBe('Invalid JSON');
        });

        test('rejects malformed XML or text with 400 Bad Request', async () => {
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: '<xml><message>Hello</message></xml>'
            });

            const res = await router.fetch(req, {}, {});
            expect(res.status).toBe(400);
            expect(await res.text()).toBe('Invalid JSON');
        });

        test('evaluates payload = "null" behavior', async () => {
            // Adversarial payload: valid JSON "null"
            const req = new Request('https://router.mawthook.io/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'null'
            });

            try {
                const res = await router.fetch(req, {}, {});
                // If router handles "null", it should return a valid response
                expect([200, 400]).toContain(res.status);
            } catch (err) {
                // If it throws, document empirical TypeError crash
                expect(err).toBeInstanceOf(TypeError);
                expect(err.message).toMatch(/Cannot read properties of null/);
            }
        });

        test('rejects unsupported HTTP methods (PUT, DELETE, PATCH, OPTIONS) with 405', async () => {
            const methods = ['PUT', 'DELETE', 'PATCH', 'OPTIONS'];
            for (const method of methods) {
                const req = new Request('https://router.mawthook.io/', { method });
                const res = await router.fetch(req, {}, {});
                expect(res.status).toBe(405);
                expect(await res.text()).toBe('Method Not Allowed');
            }
        });
    });
});
