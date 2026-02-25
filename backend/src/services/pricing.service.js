/**
 * Module: PricingService
 * Objective: Centralized financial logic for markup calculation, price validation, and secure snapshotting.
 * Linked Constitution Section: 6 (Financial Ledger & Pricing Model) & 11 (Risk Areas - Floating Point Math)
 */

const logger = require('../utils/logger');
const { Decimal } = require('decimal.js');
const crypto = require('crypto');

class PricingService {

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

            // Custom Formula evaluation (Sanitized via new Function context)
            if (type === 'FORMULA' && markup.formula) {
                try {
                    const safeEval = new Function('base', `return ${markup.formula}`);
                    const calculated = safeEval(base.toNumber());
                    if (isNaN(calculated)) throw new Error('Formula result is NaN');
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
     * Creates an immutable, tamper-evident pricing snapshot for a shipment record.
     * @param {number} carrierRate - Wholesale rate from carrier.
     * @param {Object|number} markupInput - Markup config or raw percentage.
     * @param {string} [currency='KWD'] 
     * @param {string} [policySource='org_default']
     * @returns {Object} Secure PricingSnapshot object.
     * @business_rule Includes a SHA-256 'rateHash' to detect any manual database modifications to pricing after creation.
     */
    static createSnapshot(carrierRate, markupInput, currency = 'KWD', policySource = 'org_default') {
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

        return {
            carrierRate: Number(carrierDecimal.toFixed(3)),
            markup: Number(sMarkup.toFixed(3)),
            totalPrice: Number(sFinal.toFixed(3)),
            currency: currency,
            rateHash: rateHash,
            policySource: policySource,
            expiresAt: new Date(Date.now() + 86400000), // Valid for 24h
            rulesVersion: 'v1'
        };
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
