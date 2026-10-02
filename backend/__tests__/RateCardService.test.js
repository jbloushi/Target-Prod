const RateCardService = require('../src/services/RateCardService');
const PricingService = require('../src/services/pricing.service');

describe('DHL Zone Pricing and Contract Rate Cards (5535 - Amani)', () => {
    describe('RateCardService & Zone Resolution', () => {
        it('lists registered rate card 5535_AMANI', () => {
            const cards = RateCardService.listRateCards('DGR');
            expect(cards.some(c => c.id === '5535_AMANI')).toBe(true);
            const amani = cards.find(c => c.id === '5535_AMANI');
            expect(amani.currency).toBe('KWD');
            expect(amani.pricingMode).toBe('SELLING_PRICE');
            expect(amani.isSellingPrice).toBe(true);
        });

        it('correctly maps countries across all 9 DHL zones', () => {
            expect(RateCardService.resolveZone('DGR', 'AE')).toBe(1); // UAE (GCC)
            expect(RateCardService.resolveZone('DGR', 'SA')).toBe(2); // Saudi Arabia
            expect(RateCardService.resolveZone('DGR', 'BD')).toBe(3); // Bangladesh
            expect(RateCardService.resolveZone('DGR', 'GB')).toBe(4); // UK (Western Europe)
            expect(RateCardService.resolveZone('DGR', 'DE')).toBe(4); // Germany
            expect(RateCardService.resolveZone('DGR', 'PL')).toBe(5); // Poland (Eastern Europe)
            expect(RateCardService.resolveZone('DGR', 'US')).toBe(6); // USA
            expect(RateCardService.resolveZone('DGR', 'CA')).toBe(6); // Canada
            expect(RateCardService.resolveZone('DGR', 'AU')).toBe(7); // Australia (APAC)
            expect(RateCardService.resolveZone('DGR', 'JP')).toBe(7); // Japan (APAC)
            expect(RateCardService.resolveZone('DGR', 'BR')).toBe(8); // Brazil (Rest of World)
            expect(RateCardService.resolveZone('DGR', 'CN')).toBe(9); // China
            expect(RateCardService.resolveZone('DGR', 'HK')).toBe(9); // Hong Kong
        });

        it('resolves unmapped international countries to Zone 8 default', () => {
            expect(RateCardService.resolveZone('DGR', 'UNKNOWN_LAND')).toBe(8);
        });
    });

    describe('Rate Calculation & Critical Fix Verification', () => {
        it('verifies the confirmed fix for Zone 7 at 3.0 kg is exactly 23.000 KWD', () => {
            const result = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'AU', // Zone 7
                weight: 3.0
            });

            expect(result.zone).toBe(7);
            expect(result.rate).toBe(23.0);
            expect(result.totalPrice).toBe(23.0);
            expect(result.currency).toBe('KWD');
            expect(result.isSellingPrice).toBe(true);
        });

        it('calculates standard weight tiers for Zone 1 (GCC)', () => {
            // 0.5 kg = 6.5 KWD
            const r05 = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'AE',
                weight: 0.5
            });
            expect(r05.rate).toBe(6.5);

            // 1.5 kg = 10.5 KWD
            const r15 = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'AE',
                weight: 1.5
            });
            expect(r15.rate).toBe(10.5);

            // 30.0 kg = 124.5 KWD
            const r30 = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'AE',
                weight: 30.0
            });
            expect(r30.rate).toBe(124.5);
        });

        it('calculates flat per-kg rate for shipments exceeding 30.0 kg', () => {
            // Zone 1: 30kg is 124.5 KWD + 5kg * 4.0 KWD = 144.5 KWD
            const r35_z1 = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'AE', // Zone 1
                weight: 35.0
            });
            expect(r35_z1.excessWeight).toBe(5.0);
            expect(r35_z1.excessPerKgRate).toBe(4.0);
            expect(r35_z1.totalPrice).toBe(144.5);

            // Zone 7: 30kg is 149.5 KWD + 2.5kg * 4.8 KWD = 161.5 KWD
            const r325_z7 = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'AU', // Zone 7
                weight: 32.5
            });
            expect(r325_z7.excessWeight).toBe(2.5);
            expect(r325_z7.excessPerKgRate).toBe(4.8);
            expect(r325_z7.totalPrice).toBe(161.5);
        });

        it('accounts for volumetric weight divisor 5000', () => {
            // 30 x 30 x 30 cm = 27000 cm3 / 5000 = 5.4 kg (actual = 1 kg)
            // Billable weight = 5.4 kg -> rounds to 5.5 kg bracket in Zone 6 (USA)
            // 5.5 kg in Zone 6 = 30.0 KWD
            const result = RateCardService.calculateRate({
                rateCardId: '5535_AMANI',
                countryCode: 'US',
                packages: [{ weight: 1.0, length: 30, width: 30, height: 30 }]
            });

            expect(result.actualWeight).toBe(1.0);
            expect(result.volumetricWeight).toBe(5.4);
            expect(result.billableWeight).toBe(5.4);
            expect(result.rate).toBe(30.0);
            expect(result.zone).toBe(6);
        });
    });

    describe('PricingService Integration', () => {
        const rateCardUser = {
            carrierConfig: {
                pricingByCarrier: {
                    DGR: {
                        pricingModel: 'RATE_CARD',
                        rateCardId: '5535_AMANI',
                        currency: 'KWD'
                    }
                }
            }
        };

        it('resolves carrier pricing policy with rateCardId and pricingModel', () => {
            const policy = PricingService.resolveCarrierPricingPolicy(rateCardUser, 'DGR');
            expect(policy).toEqual({
                pricingModel: 'RATE_CARD',
                rateCardId: '5535_AMANI',
                fixedFee: null,
                currency: 'KWD'
            });
        });

        it('sets markup to 0 flat with source contract_rate_card for selling price rate cards', () => {
            const { markup, source } = PricingService.resolveMarkup(rateCardUser, {}, 'DGR');
            expect(source).toBe('contract_rate_card');
            expect(markup).toEqual({ type: 'FLAT', flatValue: 0, percentageValue: 0 });

            const calculation = PricingService.calculateFinalPrice(23.0, markup, 'KWD');
            expect(calculation.finalPrice).toBe(23.0);
            expect(calculation.markupAmount).toBe(0);
        });

        it('calculates contract rate in applyCarrierBasePricePolicy when shipment context is provided', () => {
            const price = PricingService.applyCarrierBasePricePolicy(50.0, rateCardUser, 'DGR', {
                countryCode: 'AU',
                weight: 3.0
            });
            // Should ignore the 50.0 mock rate and evaluate 23.0 from the rate card
            expect(price).toBe(23.0);
        });

        it('preserves tamper-detection snapshot with rate card metadata', () => {
            const snapshot = PricingService.createSnapshot(23.0, { type: 'FLAT', flatValue: 0 }, 'KWD', 'contract_rate_card', {
                rateCardId: '5535_AMANI',
                zone: 7,
                billableWeight: 3.0,
                pricingMode: 'SELLING_PRICE'
            });

            expect(snapshot.carrierRate).toBe(23.0);
            expect(snapshot.markup).toBe(0);
            expect(snapshot.totalPrice).toBe(23.0);
            expect(snapshot.rateCardId).toBe('5535_AMANI');
            expect(snapshot.zone).toBe(7);
            expect(snapshot.billableWeight).toBe(3.0);
            expect(snapshot.rateHash).toBeDefined();
            expect(PricingService.validateSnapshot(snapshot)).toBe(true);
        });
    });

    describe('Rate Card Template & Management Lifecycle', () => {
        const fs = require('fs');
        const path = require('path');

        it('has a pre-generated downloadable Excel sample template file', () => {
            const templatePath = path.resolve(__dirname, '../src/constants/rateCards/templates/rate_card_template_sample.xlsx');
            expect(fs.existsSync(templatePath)).toBe(true);
            const stats = fs.statSync(templatePath);
            expect(stats.size).toBeGreaterThan(1000);
        });

        it('imports a rate card from base64 excel and deletes it cleanly', async () => {
            const templatePath = path.resolve(__dirname, '../src/constants/rateCards/templates/rate_card_template_sample.xlsx');
            const fileBase64 = fs.readFileSync(templatePath).toString('base64');

            // 1. Import
            const imported = await RateCardService.importRateCardFromBase64({
                id: '9999_TEST_LIFECYCLE',
                name: '9999 - Test Lifecycle Card',
                carrierCode: 'DGR',
                currency: 'KWD',
                pricingMode: 'SELLING_PRICE',
                fileBase64
            });

            expect(imported.id).toBe('9999_TEST_LIFECYCLE');
            expect(imported.name).toBe('9999 - Test Lifecycle Card');
            expect(imported.totalBrackets).toBe(60);

            // Verify in memory list
            const found = RateCardService.getRateCard('9999_TEST_LIFECYCLE');
            expect(found).not.toBeNull();
            expect(found.brackets.length).toBe(60);

            // 2. Prevent deletion of default system card
            expect(() => RateCardService.deleteRateCard('5535_AMANI')).toThrow(/Cannot delete default/i);

            // 3. Delete the imported card
            const deleted = RateCardService.deleteRateCard('9999_TEST_LIFECYCLE');
            expect(deleted).toBe(true);
            expect(RateCardService.getRateCard('9999_TEST_LIFECYCLE')).toBeNull();
        });
    });
});

