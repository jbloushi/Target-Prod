const { getSystemSettings, updateSystemSettings } = require('../src/services/systemSettings.service');
const CarrierFactory = require('../src/services/CarrierFactory');

describe('SystemSettings and Carrier Branding', () => {
    it('returns default carrier branding configuration', () => {
        const settings = getSystemSettings();
        expect(settings).toBeDefined();
        expect(settings.carrierBranding).toBeDefined();
        expect(settings.carrierBranding.OTE.name).toBe('Target GCC Express (OTE)');
        expect(settings.carrierBranding.DGR.name).toBe('Target International Air (DHL DGR)');
        expect(settings.carrierBranding.INTERNAL.name).toBe('Target Local Fleet');
    });

    it('injects system branding dynamically into CarrierFactory', () => {
        const carriers = CarrierFactory.getAvailableCarriers();
        const ote = carriers.find(c => c.code === 'OTE');
        expect(ote).toBeDefined();
        expect(ote.name).toBe('Target GCC Express (OTE)');
        expect(ote.badge).toBe('GCC Express');
    });

    it('updates carrier branding dynamically and updates factory output', () => {
        const customName = 'Target Gulf FastRoad (OTE)';
        updateSystemSettings({
            carrierBranding: {
                OTE: {
                    name: customName,
                    description: 'Custom express GCC ground service',
                    badge: 'Gulf Express',
                    active: true
                }
            }
        });

        const updatedSettings = getSystemSettings();
        expect(updatedSettings.carrierBranding.OTE.name).toBe(customName);

        const updatedCarriers = CarrierFactory.getAvailableCarriers();
        const updatedOte = updatedCarriers.find(c => c.code === 'OTE');
        expect(updatedOte.name).toBe(customName);
        expect(updatedOte.badge).toBe('Gulf Express');

        // Reset to default
        updateSystemSettings({
            carrierBranding: {
                OTE: {
                    name: 'Target GCC Express (OTE)',
                    description: 'Cross-border road & express distribution across GCC states',
                    badge: 'GCC Express',
                    active: true
                }
            }
        });
    });
});
