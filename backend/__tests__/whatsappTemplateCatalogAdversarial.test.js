/**
 * WhatsApp Template Catalog & Parity Adversarial Challenge Suite
 * File: backend/__tests__/whatsappTemplateCatalogAdversarial.test.js
 *
 * Authored by: Milestone 1 Challenger 2 (m1_challenger2)
 *
 * Adversarially challenges:
 * 1. Completeness, linguistic validity, and placeholder integrity of all 17 bilingual templates.
 * 2. Resistance of the parity test (whatsappTemplateCatalogParity.test.js) to false negatives
 *    when fictitious/unregistered template names are referenced in code.
 * 3. Parameter count and type parity between caller payload builders (buildMetaMessagePayload)
 *    and the official catalog specifications.
 */

const fs = require('fs');
const path = require('path');

// Extract JSON catalog from docs/whatsapp-template-catalog.md
function loadCatalog() {
    const catalogPath = path.resolve(__dirname, '../../docs/whatsapp-template-catalog.md');
    expect(fs.existsSync(catalogPath)).toBe(true);
    const content = fs.readFileSync(catalogPath, 'utf8');
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    expect(jsonMatch).not.toBeNull();
    return { content, catalogJson: JSON.parse(jsonMatch[1]) };
}

describe('Adversarial Challenge: Template Catalog & Parity Verification', () => {
    let catalogContent;
    let catalogJson;

    beforeAll(() => {
        const loaded = loadCatalog();
        catalogContent = loaded.content;
        catalogJson = loaded.catalogJson;
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Rigorous Audit of all 17 Templates
    // ─────────────────────────────────────────────────────────────
    describe('1. Rigorous Audit of all 17 Bilingual Templates', () => {
        test('catalog defines exactly 17 templates', () => {
            expect(catalogJson.templates.length).toBe(17);
        });

        test('every template has non-empty, genuine Kuwait/Gulf Arabic translation', () => {
            const arabicRegex = /[\u0600-\u06FF]/;

            catalogJson.templates.forEach(t => {
                expect(t.languages).toContain('ar');
                expect(t.ar).toBeDefined();
                expect(typeof t.ar.body).toBe('string');
                expect(t.ar.body.trim().length).toBeGreaterThan(20);
                expect(arabicRegex.test(t.ar.body)).toBe(true);

                // Button translation check
                if (t.ar.button) {
                    expect(t.ar.button.text).toBeDefined();
                    expect(arabicRegex.test(t.ar.button.text)).toBe(true);
                }
            });
        });

        test('parameter mapping strictly matches between en_US and ar with zero gaps', () => {
            catalogJson.templates.forEach(t => {
                const enMatches = [...t.en_US.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10));
                const arMatches = [...t.ar.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10));

                const enUnique = [...new Set(enMatches)].sort((a, b) => a - b);
                const arUnique = [...new Set(arMatches)].sort((a, b) => a - b);

                // 1. Both languages must reference the exact same set of placeholders
                expect(arUnique).toEqual(enUnique);

                // 2. Variable indexing must start at 1 and have no gaps
                if (enUnique.length > 0) {
                    expect(enUnique[0]).toBe(1);
                    const maxVal = enUnique[enUnique.length - 1];
                    for (let i = 1; i <= maxVal; i++) {
                        expect(enUnique).toContain(i);
                    }
                }

                // 3. Variable count must match declared variables array
                expect(t.variables.length).toBe(enUnique.length);
            });
        });

        test('dynamic URL buttons specify variable parameter {{1}}', () => {
            const dynamicButtonTemplates = catalogJson.templates.filter(
                t => t.en_US.button?.type === 'URL' && t.en_US.button?.url.includes('{{1}}')
            );
            expect(dynamicButtonTemplates.length).toBeGreaterThan(0);
            dynamicButtonTemplates.forEach(t => {
                expect(t.ar.button.url).toContain('{{1}}');
            });
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Parity Test Blind Spot Challenge (Fictitious Templates)
    // ─────────────────────────────────────────────────────────────
    describe('2. Adversarial Challenge: Parity Test Blind Spot on Fictitious Templates', () => {
        function originalExtractTemplatesFromCode(codeSnippet) {
            const foundTemplates = new Set();
            const regexPatterns = [
                /templateName:\s*['"]([a-zA-Z0-9_]+)['"]/g,
                /chosenTemplate\s*=\s*['"]([a-zA-Z0-9_]+)['"]/g,
                /targetTemplateName\s*===\s*['"]([a-zA-Z0-9_]+)['"]/g,
                /templateName\s*===\s*['"]([a-zA-Z0-9_]+)['"]/g,
                /tmpl\s*===\s*['"]([a-zA-Z0-9_]+)['"]/g,
                /\?\s*['"]([a-zA-Z0-9_]+)['"]\s*:/g
            ];

            const EXPECTED_TEMPLATE_NAMES = [
                'target_shipment_created', 'target_pickup_scheduled', 'target_received_at_hub',
                'target_verified_dispatched', 'target_shipment_out_for_delivery', 'target_delivery_attempt',
                'target_shipment_delivered', 'target_customs_exception_hold', 'target_documents_needed',
                'target_payment_confirmed', 'target_rto_in_transit', 'target_shipment_returned',
                'payment_request_v1', 'location_request_v1', 'customer_inquiry_start',
                'return_portal_v1', 'otptargetlogin'
            ];

            const LEGACY_TEMPLATE_ALIASES = {
                'shipment_confirmation_2': 'target_shipment_created',
                'new_shipment_created': 'target_shipment_created',
                'pickup_alert_v1': 'target_pickup_scheduled',
                'target_customs_hold': 'target_customs_exception_hold',
                'target_out_for_delivery': 'target_shipment_out_for_delivery',
                'shipment_tracking_quick': 'target_shipment_created',
                'account_statement_v1': null,
                'invoice_notification_v1': null
            };

            regexPatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(codeSnippet)) !== null) {
                    const candidate = match[1];
                    // Vulnerable whitelist filter in worker test:
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

            return Array.from(foundTemplates);
        }

        test('CRITICAL FINDING: worker parity test drops fictitious template names that lack target_ prefix or _v1 suffix', () => {
            const testCodePrefixed = "const x = { templateName: 'target_fictitious_template' };";
            const testCodeUnprefixed = "const x = { templateName: 'completely_fictitious_template' };";

            const extractedPrefixed = originalExtractTemplatesFromCode(testCodePrefixed);
            const extractedUnprefixed = originalExtractTemplatesFromCode(testCodeUnprefixed);

            // target_ prefixed template is extracted
            expect(extractedPrefixed).toContain('target_fictitious_template');

            // BUT unprefixed fictitious template is completely missed!
            expect(extractedUnprefixed).not.toContain('completely_fictitious_template');
            expect(extractedUnprefixed.length).toBe(0);
        });

        test('CRITICAL FINDING: hello_world exists in whatsappIntegration.service.js:56 but was silently missed by worker parity test', () => {
            const servicePath = path.resolve(__dirname, '../src/services/whatsappIntegration.service.js');
            const serviceCode = fs.readFileSync(servicePath, 'utf8');

            // Line 56 contains hello_world
            expect(serviceCode).toContain("templateName === 'hello_world'");

            // When scanned by worker parity test extraction logic:
            const extracted = originalExtractTemplatesFromCode(serviceCode);

            // hello_world is NOT in extracted list due to the whitelist filter
            expect(extracted).not.toContain('hello_world');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Caller Parameter Count & Semantic Consistency (Remediated)
    // ─────────────────────────────────────────────────────────────
    describe('3. Adversarial Challenge: Caller Parameter Count vs Catalog', () => {
        test('VERIFIED REMEDIATION: target_customs_exception_hold in whatsappIntegration.service.js sends exactly 4 body parameters matching catalog', () => {
            const servicePath = path.resolve(__dirname, '../src/services/whatsappIntegration.service.js');
            const serviceCode = fs.readFileSync(servicePath, 'utf8');

            // In catalog, target_customs_exception_hold has 4 body variables:
            const holdTemplate = catalogJson.templates.find(t => t.name === 'target_customs_exception_hold');
            expect(holdTemplate.variables.length).toBe(4);

            // In whatsappIntegration.service.js:
            const holdBlockMatch = serviceCode.match(/targetTemplateName === 'target_customs_exception_hold'[\s\S]*?type:\s*'body'[\s\S]*?parameters:\s*\[([\s\S]*?)\]/);
            expect(holdBlockMatch).not.toBeNull();

            const textParamMatches = holdBlockMatch[1].match(/\{\s*type:\s*'text'/g);
            expect(textParamMatches).not.toBeNull();

            // Code now passes exactly 4 parameters, adhering strictly to the catalog!
            expect(textParamMatches.length).toBe(4);
            expect(holdBlockMatch[1]).not.toContain('trackingUrl');
        });

        test('VERIFIED REMEDIATION: payment_request_v1 in whatsappIntegration.service.js has parameter ordering aligned with catalog and includes button', () => {
            const servicePath = path.resolve(__dirname, '../src/services/whatsappIntegration.service.js');
            const serviceCode = fs.readFileSync(servicePath, 'utf8');

            const paymentTemplate = catalogJson.templates.find(t => t.name === 'payment_request_v1');
            expect(paymentTemplate.variables.map(v => v.field)).toEqual([
                'recipientName',
                'trackingNumber',
                'amountDue',
                'issueDate'
            ]);

            // In whatsappIntegration.service.js:
            // Param 1: recipientName, Param 2: displayTracking, Param 3: amountDue, Param 4: dateFormatted
            const paymentBlockMatch = serviceCode.match(/targetTemplateName === 'payment_request_v1'[\s\S]*?type:\s*'body'[\s\S]*?parameters:\s*\[([\s\S]*?)\]/);
            expect(paymentBlockMatch).not.toBeNull();
            expect(paymentBlockMatch[1]).toContain('displayTracking');
            expect(paymentBlockMatch[1]).toContain('context.amountDue');
            expect(paymentBlockMatch[1]).not.toContain('context.publicPaymentLink'); // link moved to dynamic button component

            // Dynamic URL button component is present
            const buttonMatch = serviceCode.match(/targetTemplateName === 'payment_request_v1'[\s\S]*?type:\s*'button'[\s\S]*?sub_type:\s*'url'/);
            expect(buttonMatch).not.toBeNull();
        });
    });
});
