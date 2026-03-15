const axios = require('axios');
require('dotenv').config();

async function run() {
    const dhlUrl = process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi/test';
    const auth = {
        username: process.env.DHL_API_KEY,
        password: process.env.DHL_API_SECRET
    };

    const { buildDgrShipmentPayload } = require('./src/services/dgr-payload-builder');

    const mockOrder = {
        sender: { company: 'Test', contactPerson: 'Test', city: 'City', countryCode: 'US', postalCode: '123', phone: '123' },
        receiver: { company: 'Recv', contactPerson: 'Recv', city: 'City', countryCode: 'KW', postalCode: '100', phone: '123' },
        items: [{ description: 'Test', hsCode: '123456', countryOfOrigin: 'US', quantity: 1, value: 10 }],
        packages: [{ weight: { value: 1, unit: 'kg' }, dimensions: { length: 1, width: 1, height: 1, unit: 'cm' } }],
        currency: 'USD', serviceCode: 'P', shipperAccount: process.env.DHL_ACCOUNT_NUMBER || '123',
        plannedShippingDateAndTime: new Date(Date.now() + 86400000).toISOString()
    };

    const payload = buildDgrShipmentPayload(mockOrder);

    // Experiment 3: Omit commodityCodes completely
    delete payload.content.exportDeclaration.lineItems[0].commodityCodes;

    try {
        const res = await axios.post(`${dhlUrl}/shipments`, payload, {
            auth,
            headers: { 'Message-Reference': 'test-123', 'Content-Type': 'application/json' }
        });
        console.log("Omit commodityCodes SUCCESS", res.status);
    } catch (err) {
        console.log("Omit commodityCodes ERROR:\n", JSON.stringify(err.response?.data, null, 2));
    }
}

run();
