const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

async function run() {
    const dhlUrl = process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi/test';
    const auth = {
        username: process.env.DHL_API_KEY,
        password: process.env.DHL_API_SECRET
    };

    const payload = {
        plannedShippingDateAndTime: new Date(Date.now() + 86400000).toISOString(),
        pickup: { isRequested: false },
        productCode: 'P',
        accounts: [{ typeCode: 'shipper', number: process.env.DHL_ACCOUNT_NUMBER || '451012315' }],
        outputImageProperties: {
            encodingFormat: 'pdf',
            imageOptions: [{ typeCode: 'label', isRequested: true }, { typeCode: 'invoice', isRequested: true }]
        },
        customerDetails: {
            shipperDetails: {
                postalAddress: { postalCode: '123', cityName: 'City', countryCode: 'KW', addressLine1: 'Test St' },
                contactInformation: { companyName: 'Test', fullName: 'Test', phone: '+965123456', email: 'x@x.com' },
                typeCode: 'business'
            },
            receiverDetails: {
                postalAddress: { postalCode: '100', cityName: 'City', countryCode: 'FR', addressLine1: 'Test St' },
                contactInformation: { companyName: 'Recv', fullName: 'Recv', phone: '+33123456', email: 'y@y.com' },
                typeCode: 'business'
            }
        },
        content: {
            packages: [{ weight: 5, dimensions: { length: 40, width: 30, height: 20 }, description: 'Box' }],
            isCustomsDeclarable: true,
            description: 'Perfume boxes',
            incoterm: 'DAP',
            unitOfMeasurement: 'metric',
            declaredValue: 500,
            declaredValueCurrency: 'USD',
            exportDeclaration: {
                lineItems: [{
                    number: 1,
                    description: 'Perfume boxes',
                    price: 500,
                    priceCurrency: 'USD',
                    quantity: { value: 1, unitOfMeasurement: 'PCS' },
                    commodityCodes: [{ typeCode: 'outbound', value: '33030000' }], // The original code
                    manufacturerCountry: 'KW', // This is what DHL maps to "country Of Origin" for the item
                    weight: { netValue: 5, grossValue: 5 },
                    exportReasonType: 'permanent'
                }],
                invoice: {
                    number: 'INV-123', date: '2026-03-02', signatureName: 'Test', signatureTitle: 'Sender',
                    instructions: ['Test']
                },
                exportReason: 'Sale',
                exportReasonType: 'permanent' // The user also mentioned exportReasonType: 'permanent' 
            }
        }
    };

    try {
        const res = await axios.post(`${dhlUrl}/shipments`, payload, {
            auth, headers: { 'Message-Reference': 'test-123', 'Content-Type': 'application/json' }
        });
        console.log("SUCCESS:", res.status);
    } catch (err) {
        fs.writeFileSync('dhl_err5.json', JSON.stringify(err.response?.data, null, 2));
        console.log("ERROR written to dhl_err5.json");
    }
}
run();
