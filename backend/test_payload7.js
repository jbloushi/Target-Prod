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
        plannedShippingDateAndTime: '2026-03-03T17:10:09 GMT+02:00', // FIXED DATE FORMAT
        pickup: { isRequested: false },
        productCode: 'P',
        accounts: [{ typeCode: 'shipper', number: process.env.DHL_ACCOUNT_NUMBER || '451012315' }],
        outputImageProperties: {
            encodingFormat: 'pdf',
            imageOptions: [{ typeCode: 'label', isRequested: true }, { typeCode: 'invoice', isRequested: true }]
        },
        customerDetails: {
            shipperDetails: {
                postalAddress: { postalCode: '12345', cityName: 'City', countryCode: 'KW', addressLine1: 'Test St' },
                contactInformation: { companyName: 'Test', fullName: 'Test', phone: '+965123456', email: 'x@x.com' },
                typeCode: 'business'
            },
            receiverDetails: {
                postalAddress: { postalCode: '10001', cityName: 'New York', countryCode: 'US', addressLine1: 'Test St' }, // Changed to US so we don't hit EU specific customs errors
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
                    commodityCode: '33030000', // TRYING SINGULAR COMMODITY CODE AGAIN WITH CORRECT PAYLOAD
                    manufacturerCountry: 'KW',
                    weight: { netValue: 5, grossValue: 5 },
                    exportReasonType: 'permanent'
                }],
                invoice: {
                    number: 'INV-123', date: '2026-03-02', signatureName: 'Test', signatureTitle: 'Sender',
                    instructions: ['Test']
                },
                exportReason: 'Sale',
                exportReasonType: 'permanent'
            }
        }
    };

    try {
        const res = await axios.post(`${dhlUrl}/shipments`, payload, {
            auth, headers: { 'Message-Reference': 'test-123', 'Content-Type': 'application/json' }
        });
        console.log("SUCCESS:", res.status);
        fs.writeFileSync('success_res.json', JSON.stringify(res.data, null, 2));
    } catch (err) {
        fs.writeFileSync('dhl_err7.json', JSON.stringify(err.response?.data, null, 2));
        console.log("ERROR written to dhl_err7.json");
    }
}
run();
