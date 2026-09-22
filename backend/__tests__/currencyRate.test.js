const currencyRateService = require('../src/services/currencyRate.service');
const { prisma } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
    prisma: {
        systemSettings: {
            findFirst: jest.fn(),
            upsert: jest.fn()
        }
    }
}));

describe('CurrencyRateService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns default exchange rates when no settings are in the DB', async () => {
        prisma.systemSettings.findFirst.mockResolvedValue(null);
        const result = await currencyRateService.getRates();

        expect(result.baseCurrency).toBe('KWD');
        expect(result.rates.KWD).toBe(1.0);
        expect(result.rates.USD).toBe(0.3080);
        expect(result.rates.AED).toBe(0.0839);
    });

    it('converts correctly between currencies using KWD base', () => {
        // 100 USD at 0.3080 = 30.800 KWD
        const inKwd = currencyRateService.convert(100, 'USD', 'KWD');
        expect(Number(inKwd.toFixed(3))).toBe(30.800);

        // 30.800 KWD to USD = 100 USD
        const backToUsd = currencyRateService.convert(30.800, 'KWD', 'USD');
        expect(Number(backToUsd.toFixed(2))).toBe(100.00);

        // Same currency conversion returns exact amount
        const same = currencyRateService.convert(50, 'USD', 'USD');
        expect(Number(same.toFixed(2))).toBe(50.00);
    });

    it('computes realized FX Gain and Loss on currency movements', () => {
        // Booked at 0.300 KWD per USD, settled at 0.308 KWD per USD (Gain of 0.800 KWD on 100 USD)
        const gain = currencyRateService.computeRealizedGainLoss(100, 0.300, 0.308);
        expect(gain.gainLossKwd).toBe(0.800);
        expect(gain.isGain).toBe(true);
        expect(gain.isLoss).toBe(false);

        // Booked at 0.310 KWD per USD, settled at 0.305 KWD per USD (Loss of 0.500 KWD on 100 USD)
        const loss = currencyRateService.computeRealizedGainLoss(100, 0.310, 0.305);
        expect(loss.gainLossKwd).toBe(-0.500);
        expect(loss.isGain).toBe(false);
        expect(loss.isLoss).toBe(true);
    });

    it('persists and updates exchange rates', async () => {
        prisma.systemSettings.upsert.mockResolvedValue({ id: 'set-1' });

        const newRates = { USD: 0.3095, AED: 0.0842 };
        const result = await currencyRateService.updateRates(newRates, 'admin-1');

        expect(result.rates.USD).toBe(0.3095);
        expect(result.rates.AED).toBe(0.0842);
        expect(result.rates.KWD).toBe(1.0);
        expect(prisma.systemSettings.upsert).toHaveBeenCalled();
    });
});
