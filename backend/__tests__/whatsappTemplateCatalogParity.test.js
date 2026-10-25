/**
 * WhatsApp Meta Template Catalog Bidirectional Parity Test
 * File: backend/__tests__/whatsappTemplateCatalogParity.test.js
 *
 * Verifies:
 * 1. Catalog Document Integrity (docs/whatsapp-template-catalog.md):
 *    - Exactly 17 templates present
 *    - Machine-readable JSON specification valid and parseable
 *    - Bilingual (en_US and ar) bodies present for all templates
 *    - Sequential {{1}}..{{N}} variable numbering without gaps
 * 2. Code-to-Catalog Parity:
 *    - Scans backend services (whatsappIntegration.service.js, chatwootNotificationService.js, whatsAppConfig.service.js)
 *    - Asserts every template referenced in code exists in the catalog or maps to an approved legacy alias
 * 3. Catalog-to-Code Parity:
 *    - Asserts every template in the catalog is known, dispatchable, and mapped to platform events/actions
 * 4. Component Structure & Variable Indexing:
 *    - Verifies catalog specification structure (variables, headers, buttons)
 *    - Validates template mapping across event triggers
 */

const fs = require('fs');
const path = require('path');
const whatsappService = require('../src/services/whatsappIntegration.service');

// Canonical list of 17 approved templates
const EXPECTED_TEMPLATE_NAMES = [
    'target_shipment_created',
    'target_pickup_scheduled',
    'target_received_at_hub',
    'target_verified_dispatched',
    'target_shipment_out_for_delivery',
    'target_delivery_attempt',
    'target_shipment_delivered',
    'target_customs_exception_hold',
    'target_documents_needed',
    'target_payment_confirmed',
    'target_rto_in_transit',
    'target_shipment_returned',
    'payment_request_v1',
    'location_request_v1',
    'customer_inquiry_start',
    'return_portal_v1',
    'otptargetlogin'
];

// Approved legacy aliases mapped to their canonical equivalents
const LEGACY_TEMPLATE_ALIASES = {
    'shipment_confirmation_2': 'target_shipment_created',
    'new_shipment_created': 'target_shipment_created',
    'pickup_alert_v1': 'target_pickup_scheduled',
    'target_customs_hold': 'target_customs_exception_hold',
    'target_out_for_delivery': 'target_shipment_out_for_delivery',
    'shipment_tracking_quick': 'target_shipment_created',
    'account_statement_v1': null, // Finance statement notice
    'invoice_notification_v1': null, // Finance invoice notice
    'hello_world': null // Meta Cloud API developer test template
};

// Helper: Extract JSON specification from docs/whatsapp-template-catalog.md
function loadTemplateCatalogDoc() {
    const catalogPath = path.resolve(__dirname, '../../docs/whatsapp-template-catalog.md');
    if (!fs.existsSync(catalogPath)) {
        throw new Error(`Catalog documentation not found at: ${catalogPath}`);
    }
    const content = fs.readFileSync(catalogPath, 'utf8');

    // Extract JSON block between ```json and ```
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
        throw new Error('Machine-readable JSON specification block not found in docs/whatsapp-template-catalog.md');
    }

    const catalogJson = JSON.parse(jsonMatch[1]);
    return { content, catalogJson };
}

// Helper: Scan source files or code snippets for template name strings
function extractTemplatesFromCode(filePathsOrSnippets) {
    const foundTemplates = new Set();
    const explicitPatterns = [
        /templateName:\s*['"]([a-zA-Z0-9_]+)['"]/g,
        /chosenTemplate\s*=\s*['"]([a-zA-Z0-9_]+)['"]/g,
        /targetTemplateName\s*===\s*['"]([a-zA-Z0-9_]+)['"]/g,
        /templateName\s*===\s*['"]([a-zA-Z0-9_]+)['"]/g,
        /tmpl\s*===\s*['"]([a-zA-Z0-9_]+)['"]/g
    ];
    const loosePatterns = [
        /\?\s*['"]([a-zA-Z0-9_]+)['"]\s*:/g
    ];

    const sources = Array.isArray(filePathsOrSnippets) ? filePathsOrSnippets : [filePathsOrSnippets];

    sources.forEach(item => {
        let code = '';
        if (typeof item === 'string') {
            const fullPath = path.isAbsolute(item) ? item : path.resolve(__dirname, '../..', item);
            if (fs.existsSync(fullPath)) {
                code = fs.readFileSync(fullPath, 'utf8');
            } else {
                code = item;
            }
        }

        // 1. Explicit template property / comparison assignments:
        // Do NOT pre-filter with candidate.startsWith('target_'). Capture ALL explicit candidates
        // so fictitious or uncatalogued template names are strictly flagged.
        explicitPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                foundTemplates.add(match[1]);
            }
        });

        // 2. Loose ternary expressions: Filter to avoid capturing unrelated boolean/string literals
        loosePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const candidate = match[1];
                if (
                    candidate.startsWith('target_') ||
                    candidate.endsWith('_v1') ||
                    candidate.endsWith('_v2') ||
                    candidate in LEGACY_TEMPLATE_ALIASES ||
                    EXPECTED_TEMPLATE_NAMES.includes(candidate)
                ) {
                    foundTemplates.add(candidate);
                }
            }
        });
    });

    return Array.from(foundTemplates);
}

describe('WhatsApp Meta Template Catalog Parity & Schema Parity', () => {
    let catalogDoc;
    let catalogJson;

    beforeAll(() => {
        const loaded = loadTemplateCatalogDoc();
        catalogDoc = loaded.content;
        catalogJson = loaded.catalogJson;
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Catalog Document Integrity & Specifications
    // ─────────────────────────────────────────────────────────────
    describe('1. Catalog Document Structure & JSON Integrity', () => {
        test('catalog contains exactly 17 templates in the JSON specification', () => {
            expect(catalogJson).toBeDefined();
            expect(Array.isArray(catalogJson.templates)).toBe(true);
            expect(catalogJson.templates.length).toBe(17);
        });

        test('every canonical template name matches expected inventory', () => {
            const namesInCatalog = catalogJson.templates.map(t => t.name).sort();
            const expectedSorted = [...EXPECTED_TEMPLATE_NAMES].sort();
            expect(namesInCatalog).toEqual(expectedSorted);
        });

        test('every template specifies valid category (UTILITY or AUTHENTICATION)', () => {
            catalogJson.templates.forEach(template => {
                expect(['UTILITY', 'AUTHENTICATION']).toContain(template.category);
                if (template.name === 'otptargetlogin') {
                    expect(template.category).toBe('AUTHENTICATION');
                } else {
                    expect(template.category).toBe('UTILITY');
                }
            });
        });

        test('every template provides complete bilingual en_US and ar bodies', () => {
            catalogJson.templates.forEach(template => {
                expect(template.languages).toEqual(expect.arrayContaining(['en_US', 'ar']));
                expect(template.en_US).toBeDefined();
                expect(template.ar).toBeDefined();
                expect(typeof template.en_US.body).toBe('string');
                expect(typeof template.ar.body).toBe('string');
                expect(template.en_US.body.trim().length).toBeGreaterThan(15);
                expect(template.ar.body.trim().length).toBeGreaterThan(15);
            });
        });

        test('variable numbering in body text starts at {{1}} and has no missing index gaps', () => {
            catalogJson.templates.forEach(template => {
                ['en_US', 'ar'].forEach(lang => {
                    const body = template[lang].body;
                    const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10));
                    if (matches.length > 0) {
                        const maxIndex = Math.max(...matches);
                        for (let i = 1; i <= maxIndex; i++) {
                            expect(matches).toContain(i);
                        }
                    }
                });
            });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Bidirectional Parity: Code to Catalog
    // ─────────────────────────────────────────────────────────────
    describe('2. Code-to-Catalog Parity (Code References -> Catalog)', () => {
        test('every template referenced in backend services exists in catalog or approved legacy alias table', () => {
            const backendFilesToScan = [
                'backend/src/services/whatsappIntegration.service.js',
                'backend/src/services/chatwootNotificationService.js',
                'backend/src/services/whatsAppConfig.service.js',
                'backend/src/controllers/adminWhatsAppLogs.controller.js',
                'backend/src/controllers/shipment-ops.controller.js',
                'backend/src/controllers/shipment-public.controller.js'
            ];

            const codeTemplates = extractTemplatesFromCode(backendFilesToScan);
            expect(codeTemplates.length).toBeGreaterThan(0);

            const catalogNameSet = new Set(catalogJson.templates.map(t => t.name));

            codeTemplates.forEach(templateName => {
                const isDirectMatch = catalogNameSet.has(templateName);
                const isLegacyAlias = templateName in LEGACY_TEMPLATE_ALIASES;

                if (!isDirectMatch && !isLegacyAlias) {
                    throw new Error(`Template referenced in code "${templateName}" is neither in the official catalog nor in LEGACY_TEMPLATE_ALIASES.`);
                }

                if (isLegacyAlias && LEGACY_TEMPLATE_ALIASES[templateName]) {
                    const canonical = LEGACY_TEMPLATE_ALIASES[templateName];
                    expect(catalogNameSet.has(canonical)).toBe(true);
                }
            });
        });

        test('extractTemplatesFromCode strictly captures uncatalogued explicit template names regardless of prefix', () => {
            const testSnippet = "const config = { templateName: 'completely_fictitious_template' };";
            const extracted = extractTemplatesFromCode([testSnippet]);
            expect(extracted).toContain('completely_fictitious_template');
        });

        test('parity verification strictly rejects uncatalogued explicit template references', () => {
            const catalogNameSet = new Set(catalogJson.templates.map(t => t.name));
            const testSnippet = "const item = { templateName: 'unapproved_custom_template' };";
            const extracted = extractTemplatesFromCode([testSnippet]);

            expect(() => {
                extracted.forEach(templateName => {
                    const isDirectMatch = catalogNameSet.has(templateName);
                    const isLegacyAlias = templateName in LEGACY_TEMPLATE_ALIASES;
                    if (!isDirectMatch && !isLegacyAlias) {
                        throw new Error(`Template referenced in code "${templateName}" is neither in the official catalog nor in LEGACY_TEMPLATE_ALIASES.`);
                    }
                });
            }).toThrow('unapproved_custom_template');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Bidirectional Parity: Catalog to Code
    // ─────────────────────────────────────────────────────────────
    describe('3. Catalog-to-Code Parity (Catalog Templates -> Code)', () => {
        test('every catalog template is mapped to a backend event, action, or dispatch payload builder', () => {
            const chatwootServicePath = path.resolve(__dirname, '../src/services/chatwootNotificationService.js');
            const whatsappServicePath = path.resolve(__dirname, '../src/services/whatsappIntegration.service.js');
            const codeCombined = fs.readFileSync(chatwootServicePath, 'utf8') + fs.readFileSync(whatsappServicePath, 'utf8');

            catalogJson.templates.forEach(template => {
                const name = template.name;
                // Template must appear in code either directly or via an alias/event representation
                const foundDirectly = codeCombined.includes(name);
                const hasAliasInCode = Object.entries(LEGACY_TEMPLATE_ALIASES).some(
                    ([alias, canonical]) => canonical === name && codeCombined.includes(alias)
                );
                const hasMappedEvents = template.events && template.events.some(evt => codeCombined.includes(evt));

                expect(foundDirectly || hasAliasInCode || hasMappedEvents).toBe(true);
            });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Component Structure & Variable Indexing Consistency
    // ─────────────────────────────────────────────────────────────
    describe('4. Component Structure & Payload Consistency', () => {
        test('target_shipment_out_for_delivery specification has header, 5 body params and URL button with token', () => {
            const outForDelivery = catalogJson.templates.find(t => t.name === 'target_shipment_out_for_delivery');
            expect(outForDelivery).toBeDefined();
            expect(outForDelivery.header).toBeDefined();
            expect(outForDelivery.header.type).toBe('TEXT');
            expect(outForDelivery.variables.length).toBe(5);
            expect(outForDelivery.en_US.button).toBeDefined();
            expect(outForDelivery.en_US.button.type).toBe('URL');
            expect(outForDelivery.en_US.button.url).toContain('{{1}}');
            expect(outForDelivery.ar.button).toBeDefined();
            expect(outForDelivery.ar.button.type).toBe('URL');
            expect(outForDelivery.ar.button.url).toContain('{{1}}');
        });

        test('language resolution code in whatsappIntegration.service supports bilingual en_US and ar codes', () => {
            const whatsappServicePath = path.resolve(__dirname, '../src/services/whatsappIntegration.service.js');
            const serviceCode = fs.readFileSync(whatsappServicePath, 'utf8');

            // Verify getTemplateLanguage logic exists and maps target_ and otptargetlogin to en_US and ar to ar
            expect(serviceCode).toContain("if (userLang === 'ar') return 'ar';");
            expect(serviceCode).toContain("if (templateName && templateName.startsWith('target_')) return 'en_US';");
            expect(serviceCode).toContain("if (templateName === 'otptargetlogin') return 'en_US';");
        });

        test('all 17 templates in catalog define structured variable mappings', () => {
            catalogJson.templates.forEach(template => {
                expect(Array.isArray(template.variables)).toBe(true);
                expect(template.variables.length).toBeGreaterThan(0);
                template.variables.forEach((variable, idx) => {
                    expect(variable.index).toBe(idx + 1);
                    expect(typeof variable.field).toBe('string');
                    expect(typeof variable.description).toBe('string');
                });
            });
        });

        test('target_customs_exception_hold payload passes exactly 4 body parameters matching catalog', () => {
            const payload = whatsappService.buildMetaMessagePayload(
                '+96599112233',
                'on_hold_customs_issue',
                {
                    trackingNumber: 'TRG-TEST-HOLD-001',
                    recipientName: 'Ahmed Al-Sabah',
                    customsReason: 'Civil ID verification required',
                    customsAction: 'Submit Civil ID front and back'
                },
                'target_customs_exception_hold'
            );

            expect(payload).toBeDefined();
            expect(payload.template.name).toBe('target_customs_exception_hold');

            const bodyComponent = payload.template.components.find(c => c.type === 'body');
            expect(bodyComponent).toBeDefined();
            // Must have exactly 4 parameters, matching catalog variables (no extra trackingUrl in body)
            expect(bodyComponent.parameters.length).toBe(4);
            expect(bodyComponent.parameters[0].text).toBe('TRG-TEST-HOLD-001');
            expect(bodyComponent.parameters[1].text).toBe('Ahmed Al-Sabah');
            expect(bodyComponent.parameters[2].text).toBe('Civil ID verification required');
            expect(bodyComponent.parameters[3].text).toBe('Submit Civil ID front and back');
        });

        test('payment_request_v1 payload aligns parameter order with catalog and includes dynamic URL button', () => {
            const payload = whatsappService.buildMetaMessagePayload(
                '+96599112233',
                'payment_link_ready',
                {
                    trackingNumber: 'TRG-PAY-999',
                    recipientName: 'Fatima Al-Kandari',
                    amountDue: '12.500 KWD',
                    updatedAt: '2026-10-24T18:00:00Z',
                    publicPaymentLink: 'https://target.ottu.com/checkout/tok_test_123'
                },
                'payment_request_v1'
            );

            expect(payload).toBeDefined();
            expect(payload.template.name).toBe('payment_request_v1');

            const bodyComponent = payload.template.components.find(c => c.type === 'body');
            expect(bodyComponent).toBeDefined();
            expect(bodyComponent.parameters.length).toBe(4);
            // 1: Recipient Name, 2: Tracking Number, 3: Amount Due, 4: Issue Date
            expect(bodyComponent.parameters[0].text).toBe('Fatima Al-Kandari');
            expect(bodyComponent.parameters[1].text).toBe('TRG-PAY-999');
            expect(bodyComponent.parameters[2].text).toBe('12.500 KWD');
            expect(bodyComponent.parameters[3].text).toBeDefined();

            const buttonComponent = payload.template.components.find(c => c.type === 'button');
            expect(buttonComponent).toBeDefined();
            expect(buttonComponent.sub_type).toBe('url');
            expect(buttonComponent.index).toBe('0');
            expect(buttonComponent.parameters[0].text).toBe('https://target.ottu.com/checkout/tok_test_123');
        });
    });
});
