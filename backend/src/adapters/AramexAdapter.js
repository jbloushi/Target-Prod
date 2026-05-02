/**
 * Aramex Carrier Adapter (Mock Implementation)
 * Provides simulated rating and booking for development and testing.
 */
class AramexAdapter {
    constructor(config = {}) {
        this.config = config;
        this.name = 'Aramex';
        this.code = 'ARAMEX';
    }

    /**
     * Rate a shipment (Mock)
     * @param {Object} payload 
     */
    async rate(payload) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Simulate validation
        if (!payload.destination?.country) {
            throw new Error('Aramex: Destination country is required for rating');
        }

        // Mock response
        return {
            carrier: 'ARAMEX',
            services: [
                {
                    code: 'EPX',
                    name: 'Aramex Economy Parcel Express',
                    rate: 12.500,
                    currency: 'KWD',
                    estimatedDays: '3-5'
                },
                {
                    code: 'PPX',
                    name: 'Aramex Priority Parcel Express',
                    rate: 18.750,
                    currency: 'KWD',
                    estimatedDays: '1-2'
                }
            ],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Book/Create a shipment (Mock)
     * @param {Object} payload 
     */
    async book(payload) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mock success
        const trackingId = `ARM${Math.floor(Math.random() * 1000000000)}`;
        
        return {
            success: true,
            trackingId,
            carrier: 'ARAMEX',
            labelUrl: 'https://example.com/mock-aramex-label.pdf',
            bookingReference: `REF-${Date.now()}`,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Track a shipment (Mock)
     * @param {string} trackingNumber 
     */
    async track(trackingNumber) {
        return {
            trackingNumber,
            status: 'IN_TRANSIT',
            events: [
                { time: new Date().toISOString(), location: 'Dubai, UAE', description: 'Shipment picked up by Aramex' },
                { time: new Date().toISOString(), location: 'Kuwait City, KW', description: 'Arrived at local hub' }
            ]
        };
    }
}

module.exports = AramexAdapter;
