/**
 * Module: PricingService
 * Objective: Centralized financial logic for markup calculation, price validation, and secure snapshotting.
 * Linked Constitution Section: 6 (Financial Ledger & Pricing Model) & 11 (Risk Areas - Floating Point Math)
 */

const logger = require('../utils/logger');
const { Decimal } = require('decimal.js');
const crypto = require('crypto');
const { evaluate } = require('mathjs');

class PricingService {
    static resolveCarrierPricingPolicy(user, carrierCode, fallbackCurrency = 'KWD') {
        const normalizedCarrier = String(carrierCode || '').toUpperCase();
        const carrierConfigPricing = user?.carrierConfig?.pricingByCarrier || {};
        const agentPolicyPricing = user?.agentPolicy?.carrierPricing || {};
        const byCarrier = {
            ...agentPolicyPricing,
            ...carrierConfigPricing
        };
        const carrierPolicy = byCarrier?.[normalizedCarrier] || {};

        const defaultPolicy = normalizedCarrier === 'OTE'
            ? { pricingModel: 'FIXED_FEE', fixedFee: 25, currency: 'AED' }
            : { pricingModel: 'STANDARD', fixedFee: null, currency: fallbackCurrency || 'KWD' };

        const rateCardId = carrierPolicy.rateCardId ? String(carrierPolicy.rateCardId).trim().toUpperCase() : null;
        const pricingModel = carrierPolicy.pricingModel
            || (rateCardId ? 'RATE_CARD' : (carrierPolicy.fixedFee !== undefined && carrierPolicy.fixedFee !== null ? 'FIXED_FEE' : defaultPolicy.pricingModel));

        const hasFixedFee = carrierPolicy.fixedFee !== undefined && carrierPolicy.fixedFee !== null && carrierPolicy.fixedFee !== '';
        const parsedFixedFee = hasFixedFee ? Number(carrierPolicy.fixedFee) : NaN;
        const fixedFee = Number.isFinite(parsedFixedFee) && parsedFixedFee >= 0
            ? parsedFixedFee
            : defaultPolicy.fixedFee;

        const policyCurrency = String(carrierPolicy.currency || defaultPolicy.currency || fallbackCurrency || 'KWD')
            .trim()
            .toUpperCase()
            .substring(0, 3);

        const res = {
            fixedFee,
            currency: policyCurrency || 'KWD'
        };

        if (rateCardId) {
            res.rateCardId = rateCardId;
            res.pricingModel = 'RATE_CARD';
        } else if (carrierPolicy.pricingModel) {
            res.pricingModel = carrierPolicy.pricingModel;
        }

        return res;
    }

    static applyCarrierBasePricePolicy(basePrice, user, carrierCode, shipmentContext = {}) {
        const normalizedCarrier = String(carrierCode || '').toUpperCase();
        const normalizedBasePrice = Number(basePrice || 0);

        const policy = this.resolveCarrierPricingPolicy(user, normalizedCarrier);

        if (policy.pricingModel === 'RATE_CARD' && policy.rateCardId) {
            try {
                const RateCardService = require('./RateCardService');
                const countryCode = shipmentContext.countryCode
                    || shipmentContext.receiver?.countryCode
                    || shipmentContext.receiver?.country
                    || shipmentContext.destinationCountry;

                if (countryCode) {
                    const calculation = RateCardService.calculateRate({
                        rateCardId: policy.rateCardId,
                        carrierCode: normalizedCarrier,
                        countryCode,
                        weight: shipmentContext.weight,
                        packages: shipmentContext.packages
                    });
                    return Number(calculation.totalPrice);
                }
            } catch (err) {
                logger.warn(`RateCard calculation failed for ${policy.rateCardId}: ${err.message}`);
            }
        }

        if (normalizedCarrier === 'OTE') {
            if (policy.fixedFee !== null && policy.fixedFee !== undefined) {
                return Number(policy.fixedFee);
            }
        }

        return normalizedBasePrice;
    }

    static normalizeMarkupConfig(markup) {
        if (!markup || typeof markup !== 'object') return null;
        if (!markup.type) return null;
        if (markup.percentageValue === undefined && markup.flatValue === undefined && markup.value === undefined && !markup.formula) return null;
        return markup;
    }


    /**
     * Calculates the final price for a shipment by applying markup rules to the base carrier rate.
     * @param {number} basePrice - The wholesale rate returned by the carrier API.
     * @param {Object} markupConfig - Configuration object (type, percentageValue, flatValue, formula).
     * @param {string} [currency='KWD'] - Currency code for descriptive labels.
     * @returns {Object} { finalPrice, markupAmount, surchargeLabel, markupUsed }
     * @business_rule Supports PERCENTAGE, FLAT, COMBINED, and custom FORMULA markups. 
     * @business_rule Standardizes all financial outputs to 3 decimal places (KWD precision).
     */
    static calculateFinalPrice(basePrice, markupConfig, currency = 'KWD') {
        const base = new Decimal(basePrice || 0);
        let finalPrice = base;
        let surchargeLabel = '0%';

        // Default Fallback if config is missing
        const markup = markupConfig || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };

        try {
            let type = markup.type;
            // Legacy Support: Assume percentage if type is missing but values exist
            if (!type && (markup.value !== undefined || markup.percentageValue !== undefined)) {
                type = 'PERCENTAGE';
            }

            if (type === 'PERCENTAGE' || type === 'COMBINED') {
                const val = markup.percentageValue !== undefined ? markup.percentageValue : markup.value;
                const pct = new Decimal(val || 0);
                finalPrice = finalPrice.plus(base.times(pct.dividedBy(100)));
                surchargeLabel = `${pct.toNumber()}%`;
            }

            if (type === 'FLAT' || type === 'COMBINED') {
                const val = markup.flatValue !== undefined ? markup.flatValue : markup.value;
                const flat = new Decimal(val || 0);
                finalPrice = finalPrice.plus(flat);
                surchargeLabel += (surchargeLabel !== '0%' ? ` + ${flat.toNumber()} ${currency}` : `${flat.toNumber()} ${currency} Flat`);
            }

            // Cleanup label if it was combined
            if (surchargeLabel.startsWith('0% +')) surchargeLabel = surchargeLabel.replace('0% + ', '');

            // Custom Formula evaluation (sandboxed via mathjs — no access to process/require/fs)
            if (type === 'FORMULA' && markup.formula) {
                try {
                    // mathjs only evaluates mathematical expressions.
                    // It CANNOT access process, fs, require, or any Node globals.
                    const cleanFormula = markup.formula.replace(/base/g, String(base.toNumber()));
                    const calculated = evaluate(cleanFormula);
                    
                    if (typeof calculated !== 'number' || isNaN(calculated) || !isFinite(calculated)) {
                        throw new Error('Formula result must be a finite number');
                    }
                    finalPrice = new Decimal(calculated);
                    surchargeLabel = 'Custom Formula';
                } catch (e) {
                    logger.error(`Markup Formula Execution Failed: ${markup.formula}`, e.message);
                    finalPrice = base.times(1.15); // Safety Fallback: 15%
                    surchargeLabel = 'Error (Fallback 15%)';
                }
            }
        } catch (error) {
            logger.error('Critical Pricing Calculation Error:', error);
            finalPrice = base.times(1.15);
            surchargeLabel = 'System Fallback';
        }

        return {
            finalPrice: Number(finalPrice.toFixed(3)),
            markupAmount: Number(finalPrice.minus(base).toFixed(3)),
            surchargeLabel,
            markupUsed: markup
        };
    }

    /**
     * Validates a client-submitted price against the server-calculated price with a percentage tolerance.
     * @param {number} clientPrice - The price sent by the UI.
     * @param {number} serverPrice - The current price calculated by the backend.
     * @param {number} [tolerancePercent=0.5] - Allowable floating point drift.
     * @returns {boolean} True if price is within tolerance.
     * @business_rule Prevents "Price Injection" attacks where a user modifies the POST body to pay less.
     */
    static validatePrice(clientPrice, serverPrice, tolerancePercent = 0.5) {
        try {
            const client = new Decimal(clientPrice || 0);
            const server = new Decimal(serverPrice || 0);

            if (client.equals(server)) return true;

            const diff = client.minus(server).abs();
            const toleranceAmount = server.times(new Decimal(tolerancePercent).dividedBy(100));

            if (diff.greaterThan(toleranceAmount)) {
                logger.warn(`Price Validation Violation: Diff ${diff.toNumber()} exceeds tolerance ${toleranceAmount.toNumber()}`);
                return false;
            }

            return true;
        } catch (error) {
            logger.error('Price Validation Logic Error:', error);
            return false;
        }
    }

    /**
     * Resolves the effective markup by following the firm's precedence hierarchy.
     * @param {Object} user - The user requesting the shipment.
     * @param {Object} organization - The organization owning the shipment.
     * @param {string} carrierCode - The carrier code (DGR, FEDEX, etc).
     * @returns {Object} { markup, source }
     * @business_rule Hierarchy: 1. Agent-Carrier Override > 2. Agent Default > 3. Org-Carrier Override > 4. Org Default > 5. System Fallback (15%).
     */
    static resolveMarkup(user, organization, carrierCode) {
        const normalizedCarrier = String(carrierCode || '').toUpperCase();

        // 0. Contract Rate Card Override (If selling price rate card is active, markup is 0)
        const carrierPricing = user?.carrierConfig?.pricingByCarrier?.[normalizedCarrier]
            || user?.agentPolicy?.carrierPricing?.[normalizedCarrier]
            || organization?.markup?.carrierPricing?.[normalizedCarrier];

        if (carrierPricing?.rateCardId || carrierPricing?.pricingModel === 'RATE_CARD') {
            try {
                const RateCardService = require('./RateCardService');
                const card = RateCardService.getRateCard(carrierPricing.rateCardId);
                if (card?.pricingMode === 'SELLING_PRICE' || card?.isSellingPrice) {
                    return {
                        markup: { type: 'FLAT', flatValue: 0, percentageValue: 0 },
                        source: 'contract_rate_card'
                    };
                }
            } catch (_) {}
        }

        // 1. Agent Carrier Override
        if (user?.agentPolicy?.markupByCarrier?.[carrierCode]) {
            const m = user.agentPolicy.markupByCarrier[carrierCode];
            if (m.type && (m.percentageValue || m.flatValue)) return { markup: m, source: 'agent_carrier' };
        }

        // 2. Agent Default
        if (user?.agentPolicy?.markupOverride) {
            const m = user.agentPolicy.markupOverride;
            if (m.type && (m.percentageValue || m.flatValue || m.formula)) return { markup: m, source: 'agent_default' };
        }

        // 3. User/Client Markup (Legacy/Direct)
        if (user?.markup && user.markup.type && (user.markup.percentageValue || user.markup.flatValue || user.markup.value)) {
            return { markup: user.markup, source: 'user_default' };
        }

        // 4. Org Carrier Override
        if (organization?.markup?.byCarrier?.[carrierCode]) {
            const m = organization.markup.byCarrier[carrierCode];
            if (m.type && (m.percentageValue || m.flatValue)) return { markup: m, source: 'org_carrier' };
        }

        // 5. Org Default
        if (organization?.markup) return { markup: organization.markup, source: 'org_default' };

        // 6. System Default Fallback
        return {
            markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
            source: 'platform_default'
        };
    }

    /**
     * Resolve markup policy for an optional service (currently insurance II).
     * Hierarchy mirrors shipment markup where possible.
     */
    static resolveOptionalServiceMarkup(user, organization, carrierCode, serviceCode) {
        const normalizedCode = String(serviceCode || '').toUpperCase();
        if (!normalizedCode) return { markup: null, source: 'none' };

        const userPolicy = user?.agentPolicy?.optionalServiceMarkup || {};
        const orgPolicy = organization?.markup?.optionalServiceMarkup || {};

        // 1) User carrier+service override
        const userCarrier = userPolicy?.byCarrier?.[String(carrierCode || '').toUpperCase()];
        const userCarrierService = this.normalizeMarkupConfig(userCarrier?.[normalizedCode]);
        if (userCarrierService) return { markup: userCarrierService, source: 'agent_optional_carrier' };

        // 2) User service default
        const userService = this.normalizeMarkupConfig(userPolicy?.[normalizedCode] || userPolicy?.insurance);
        if (userService) return { markup: userService, source: 'agent_optional_default' };

        // 3) Organization carrier+service override
        const orgCarrier = orgPolicy?.byCarrier?.[String(carrierCode || '').toUpperCase()];
        const orgCarrierService = this.normalizeMarkupConfig(orgCarrier?.[normalizedCode]);
        if (orgCarrierService) return { markup: orgCarrierService, source: 'org_optional_carrier' };

        // 4) Organization service default
        const orgService = this.normalizeMarkupConfig(orgPolicy?.[normalizedCode] || orgPolicy?.insurance);
        if (orgService) return { markup: orgService, source: 'org_optional_default' };

        return { markup: null, source: 'none' };
    }

    /**
     * Creates an immutable, tamper-evident pricing snapshot for a shipment record.
     * @param {number} carrierRate - Wholesale rate from carrier.
     * @param {Object|number} markupInput - Markup config or raw percentage.
     * @param {string} [currency='KWD'] 
     * @param {string} [policySource='org_default']
     * @returns {Object} Secure PricingSnapshot object.
     * @business_rule Includes a SHA-256 'rateHash' to detect any manual database modifications to pricing after creation.
     */
    static createSnapshot(carrierRate, markupInput, currency = 'KWD', policySource = 'org_default', extraMeta = {}) {
        const carrierDecimal = new Decimal(carrierRate || 0);
        const mConfig = typeof markupInput === 'number' ? { type: 'PERCENTAGE', percentageValue: markupInput } : markupInput;

        const { finalPrice, markupAmount } = this.calculateFinalPrice(carrierRate, mConfig, currency);

        const sMarkup = new Decimal(markupAmount);
        const sFinal = new Decimal(finalPrice);

        // Tamper detection hash: binds rates to currency
        const rateHash = crypto
            .createHash('sha256')
            .update(`${carrierDecimal.toFixed(3)}-${sMarkup.toFixed(3)}-${sFinal.toFixed(3)}-${currency}`)
            .digest('hex');

        const snapshot = {
            carrierRate: Number(carrierDecimal.toFixed(3)),
            markup: Number(sMarkup.toFixed(3)),
            totalPrice: Number(sFinal.toFixed(3)),
            currency: currency,
            rateHash: rateHash,
            policySource: policySource,
            expiresAt: new Date(Date.now() + 86400000), // Valid for 24h
            rulesVersion: 'v1'
        };

        if (extraMeta && typeof extraMeta === 'object') {
            if (extraMeta.rateCardId) snapshot.rateCardId = extraMeta.rateCardId;
            if (extraMeta.zone !== undefined) snapshot.zone = extraMeta.zone;
            if (extraMeta.billableWeight !== undefined) snapshot.billableWeight = extraMeta.billableWeight;
            if (extraMeta.actualWeight !== undefined) snapshot.actualWeight = extraMeta.actualWeight;
            if (extraMeta.volumetricWeight !== undefined) snapshot.volumetricWeight = extraMeta.volumetricWeight;
            if (extraMeta.pricingMode) snapshot.pricingMode = extraMeta.pricingMode;
            if (extraMeta.excessWeight !== undefined) snapshot.excessWeight = extraMeta.excessWeight;
            if (extraMeta.excessPerKgRate !== undefined) snapshot.excessPerKgRate = extraMeta.excessPerKgRate;
        }

        return snapshot;
    }

    /**
     * Checks if a pricing snapshot is still valid (not expired).
     * @param {Object} snapshot 
     * @returns {boolean}
     */
    static validateSnapshot(snapshot) {
        if (!snapshot || !snapshot.expiresAt) return false;
        return new Date() < new Date(snapshot.expiresAt);
    }

    /**
     * Casts a value to a 3-decimal precision number safely.
     * @param {number|string} amount 
     * @returns {number}
     */
    static normalizeAmount(amount) {
        if (amount === null || amount === undefined) return 0;
        try {
            return Number(new Decimal(amount).toFixed(3));
        } catch (e) {
            return 0;
        }
    }
}

module.exports = PricingService;
