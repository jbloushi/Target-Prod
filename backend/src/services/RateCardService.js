const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const dhlZones = require('../constants/dhlZones.json');

class RateCardService {
    constructor() {
        this.rateCards = new Map();
        this.loadRateCards();
    }

    /**
     * Loads all rate card definitions from constants/rateCards
     */
    loadRateCards() {
        try {
            const rateCardsDir = path.join(__dirname, '../constants/rateCards');
            if (!fs.existsSync(rateCardsDir)) {
                return;
            }

            const files = fs.readdirSync(rateCardsDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const filePath = path.join(rateCardsDir, file);
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    if (content?.id) {
                        this.rateCards.set(String(content.id).toUpperCase(), content);
                    }
                } catch (err) {
                    logger.error(`Failed to load rate card file ${file}:`, err.message);
                }
            }
            logger.info(`Loaded ${this.rateCards.size} rate cards into RateCardService`);
        } catch (error) {
            logger.error('Error initializing RateCardService rate cards:', error.message);
        }
    }

    /**
     * List all available rate cards, optionally filtered by carrier
     * @param {string} [carrierCode]
     * @returns {Array<Object>}
     */
    listRateCards(carrierCode) {
        const cards = Array.from(this.rateCards.values());
        if (!carrierCode) return cards.map(c => this._summarizeCard(c));
        const normalized = String(carrierCode).trim().toUpperCase();
        return cards
            .filter(c => String(c.carrierCode || '').toUpperCase() === normalized)
            .map(c => this._summarizeCard(c));
    }

    _summarizeCard(card) {
        return {
            id: card.id,
            name: card.name,
            carrierCode: card.carrierCode,
            currency: card.currency || 'KWD',
            pricingMode: card.pricingMode || 'SELLING_PRICE',
            isSellingPrice: card.pricingMode === 'SELLING_PRICE',
            maxBracketWeight: card.maxBracketWeight || 30.0,
            weightStep: card.weightStep || 0.5
        };
    }

    /**
     * Get a specific rate card by ID
     * @param {string} rateCardId
     * @returns {Object|null}
     */
    getRateCard(rateCardId) {
        if (!rateCardId) return null;
        return this.rateCards.get(String(rateCardId).trim().toUpperCase()) || null;
    }

    /**
     * Resolve destination country to carrier zone
     * @param {string} carrierCode - e.g. 'DGR' or 'DHL'
     * @param {string} countryInput - ISO-2 code (e.g. 'US', 'SA') or country name
     * @returns {number|null} Zone number (1 to 9) or default fallback zone
     */
    resolveZone(carrierCode, countryInput) {
        const normalizedCarrier = String(carrierCode || 'DGR').trim().toUpperCase();
        const input = String(countryInput || '').trim().toUpperCase();
        if (!input) return null;

        if (normalizedCarrier === 'DGR' || normalizedCarrier === 'DHL') {
            // 1. Direct ISO code match
            if (dhlZones.codeToZone?.[input]) {
                return Number(dhlZones.codeToZone[input]);
            }

            // 2. Direct Country Name match
            if (dhlZones.nameToZone?.[input]) {
                return Number(dhlZones.nameToZone[input]);
            }

            // 3. Partial / case-insensitive search
            const nameEntries = Object.entries(dhlZones.nameToZone || {});
            const found = nameEntries.find(([name]) => name.includes(input) || input.includes(name));
            if (found) {
                return Number(found[1]);
            }

            // Default fallback for international destinations if unmapped: Zone 8 (Rest of the World)
            return 8;
        }

        return null;
    }

    /**
     * Calculate billable weight for a shipment:
     * Billable Weight = max(actual weight, (L x W x H) / 5000)
     * @param {Object|Array} packagesOrShipment
     * @returns {Object} { billableWeight, actualWeight, volumetricWeight }
     */
    calculateBillableWeight(packagesOrShipment) {
        let packages = [];
        if (Array.isArray(packagesOrShipment)) {
            packages = packagesOrShipment;
        } else if (Array.isArray(packagesOrShipment?.packages)) {
            packages = packagesOrShipment.packages;
        } else if (packagesOrShipment?.weight !== undefined) {
            packages = [packagesOrShipment];
        }

        let totalActualWeight = 0;
        let totalVolumetricWeight = 0;

        for (const pkg of packages) {
            const actual = Number(pkg.weight?.value || pkg.weight || 0) || 0;
            totalActualWeight += actual;

            // Dimensions in cm
            const length = Number(pkg.dimensions?.length || pkg.length || 0) || 0;
            const width = Number(pkg.dimensions?.width || pkg.width || 0) || 0;
            const height = Number(pkg.dimensions?.height || pkg.height || 0) || 0;

            if (length > 0 && width > 0 && height > 0) {
                // Volumetric divisor standard: 5000
                const volWeight = (length * width * height) / 5000;
                totalVolumetricWeight += volWeight;
            }
        }

        // Fallback if weight wasn't specified: minimum 0.5 kg
        if (totalActualWeight <= 0 && totalVolumetricWeight <= 0) {
            totalActualWeight = 0.5;
        }

        const billableWeight = Math.max(totalActualWeight, totalVolumetricWeight);

        return {
            billableWeight: Number(billableWeight.toFixed(3)),
            actualWeight: Number(totalActualWeight.toFixed(3)),
            volumetricWeight: Number(totalVolumetricWeight.toFixed(3))
        };
    }

    /**
     * Calculate rate for given rateCardId and shipment criteria
     * @param {Object} params
     * @param {string} params.rateCardId - e.g. '5535_AMANI'
     * @param {string} [params.carrierCode='DGR']
     * @param {string} params.countryCode - Destination country code/name
     * @param {number} [params.weight] - Optional explicit weight in kg
     * @param {Array} [params.packages] - Optional shipment packages
     * @returns {Object} Pricing calculation result
     */
    calculateRate({ rateCardId, carrierCode = 'DGR', countryCode, weight, packages }) {
        const card = this.getRateCard(rateCardId);
        if (!card) {
            throw new Error(`Rate card '${rateCardId}' not found.`);
        }

        const zone = this.resolveZone(card.carrierCode || carrierCode, countryCode);
        if (!zone) {
            throw new Error(`Could not resolve shipping zone for country '${countryCode}'.`);
        }

        // Calculate weights
        let weights;
        if (packages && packages.length > 0) {
            weights = this.calculateBillableWeight(packages);
        } else {
            const parsedWeight = Number(weight || 0.5);
            weights = {
                billableWeight: parsedWeight > 0 ? parsedWeight : 0.5,
                actualWeight: parsedWeight > 0 ? parsedWeight : 0.5,
                volumetricWeight: 0
            };
        }

        const billable = weights.billableWeight;
        const maxBracket = card.maxBracketWeight || 30.0;
        const step = card.weightStep || 0.5;
        let baseRate = 0;
        let excessWeight = 0;
        let excessPerKgRate = 0;

        if (billable <= maxBracket) {
            // Round up to nearest 0.5 bracket
            const bracketWeight = Math.min(maxBracket, Math.max(step, Math.ceil(billable / step) * step));
            // Find bracket
            const matchedBracket = card.brackets.find(b => Math.abs(b.weight - bracketWeight) < 0.01);
            if (!matchedBracket || matchedBracket.rates[String(zone)] === undefined) {
                throw new Error(`Rate tier not found for weight ${bracketWeight} kg in zone ${zone}.`);
            }
            baseRate = Number(matchedBracket.rates[String(zone)]);
        } else {
            // Above 30 kg: Flat per-kg addition
            const bracket30 = card.brackets.find(b => Math.abs(b.weight - maxBracket) < 0.01);
            if (!bracket30 || bracket30.rates[String(zone)] === undefined) {
                throw new Error(`Base 30kg rate not found for zone ${zone}.`);
            }
            const rateAt30 = Number(bracket30.rates[String(zone)]);
            excessWeight = Number((billable - maxBracket).toFixed(3));
            excessPerKgRate = Number(card.over30KgPerKgRate?.[String(zone)] || 4.0);

            // Weight over 30kg is calculated per excess kg (or fractional kg rounded to 0.5)
            // User requested flat per-kg calculated
            baseRate = rateAt30 + (excessWeight * excessPerKgRate);
        }

        const finalRate = Number(baseRate.toFixed(3));

        return {
            rateCardId: card.id,
            rateCardName: card.name,
            carrierCode: card.carrierCode,
            currency: card.currency || 'KWD',
            pricingMode: card.pricingMode || 'SELLING_PRICE',
            isSellingPrice: card.pricingMode === 'SELLING_PRICE',
            zone,
            actualWeight: weights.actualWeight,
            volumetricWeight: weights.volumetricWeight,
            billableWeight: weights.billableWeight,
            rate: finalRate,
            totalPrice: finalRate,
            excessWeight: excessWeight > 0 ? excessWeight : 0,
            excessPerKgRate: excessWeight > 0 ? excessPerKgRate : 0
        };
    }
}

module.exports = new RateCardService();
