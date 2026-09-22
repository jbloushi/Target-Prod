const { Decimal } = require('decimal.js');
const logger = require('../utils/logger');
const { prisma } = require('../config/database');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Standard GCC and Global baseline FX rates relative to 1 unit of foreign currency in KWD
const DEFAULT_RATES_TO_KWD = {
    KWD: 1.0,
    USD: 0.3080,
    AED: 0.0839,
    SAR: 0.0821,
    QAR: 0.0846,
    BHD: 0.8170,
    OMR: 0.8000,
    EUR: 0.3350,
    GBP: 0.3920
};

class CurrencyRateService {
    constructor() {
        this.inMemoryRates = { ...DEFAULT_RATES_TO_KWD };
    }

    /**
     * Get all active exchange rates relative to KWD
     */
    async getRates() {
        try {
            // Attempt to load custom rates from systemSettings if stored
            const settings = await prisma.systemSettings.findFirst({
                where: { key: 'EXCHANGE_RATES' }
            }).catch(() => null);

            if (settings?.value) {
                const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value;
                this.inMemoryRates = { ...DEFAULT_RATES_TO_KWD, ...parsed };
            }
        } catch (e) {
            // fallback to memory
        }

        return {
            baseCurrency: 'KWD',
            updatedAt: new Date().toISOString(),
            rates: this.inMemoryRates
        };
    }

    /**
     * Update exchange rates in system settings
     */
    async updateRates(ratesObj, userId) {
        if (!ratesObj || typeof ratesObj !== 'object') {
            throw new Error('Invalid exchange rates object');
        }

        const cleanRates = {};
        for (const [curr, rate] of Object.entries(ratesObj)) {
            const code = String(curr).trim().toUpperCase();
            const val = parseFloat(rate);
            if (code && !isNaN(val) && val > 0) {
                cleanRates[code] = val;
            }
        }
        cleanRates.KWD = 1.0;

        this.inMemoryRates = { ...DEFAULT_RATES_TO_KWD, ...cleanRates };

        await prisma.systemSettings.upsert({
            where: { key: 'EXCHANGE_RATES' },
            create: {
                key: 'EXCHANGE_RATES',
                value: JSON.stringify(this.inMemoryRates),
                description: 'Multi-currency exchange rates relative to KWD'
            },
            update: {
                value: JSON.stringify(this.inMemoryRates)
            }
        }).catch(err => {
            logger.warn(`[CurrencyRateService] Could not persist rates to DB: ${err.message}`);
        });

        logger.info(`[CurrencyRateService] Exchange rates updated by user ${userId || 'SYSTEM'}`);
        return {
            baseCurrency: 'KWD',
            rates: this.inMemoryRates
        };
    }

    /**
     * Convert an amount between any two supported currencies
     * @param {number|string|Decimal} amount
     * @param {string} fromCurrency
     * @param {string} toCurrency
     * @returns {Decimal} converted amount
     */
    convert(amount, fromCurrency = 'KWD', toCurrency = 'KWD') {
        const from = String(fromCurrency || 'KWD').trim().toUpperCase();
        const to = String(toCurrency || 'KWD').trim().toUpperCase();

        if (from === to) return new Decimal(amount || 0);

        const fromRateToKwd = new Decimal(this.inMemoryRates[from] || DEFAULT_RATES_TO_KWD[from] || 1.0);
        const toRateToKwd = new Decimal(this.inMemoryRates[to] || DEFAULT_RATES_TO_KWD[to] || 1.0);

        // Convert from source currency to KWD, then from KWD to target currency
        const inKwd = new Decimal(amount || 0).times(fromRateToKwd);
        const converted = inKwd.dividedBy(toRateToKwd);

        return converted;
    }

    /**
     * Calculate realized FX Gain / Loss
     * @param {number} billedAmount - Amount in foreign currency (e.g. 100 USD)
     * @param {number} bookingRate - Rate to KWD when booked (e.g. 0.305)
     * @param {number} settlementRate - Rate to KWD when settled (e.g. 0.308)
     */
    computeRealizedGainLoss(billedAmount, bookingRate, settlementRate) {
        const amt = new Decimal(billedAmount || 0);
        const originalKwd = amt.times(new Decimal(bookingRate));
        const settledKwd = amt.times(new Decimal(settlementRate));

        // Gain is positive if received more KWD, loss if received less
        const varianceKwd = settledKwd.minus(originalKwd);
        return {
            gainLossKwd: Number(varianceKwd.toFixed(4)),
            isGain: varianceKwd.greaterThan(0),
            isLoss: varianceKwd.lessThan(0)
        };
    }
}

module.exports = new CurrencyRateService();
