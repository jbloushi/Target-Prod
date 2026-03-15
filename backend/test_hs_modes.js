const fs = require('fs');
require('dotenv').config();

// Initialize the DHL Adapter directly
const DgrAdapter = require('./src/adapters/DgrAdapter');
const { buildDgrShipmentPayload } = require('./src/services/dgr-payload-builder');

async function run() {
    const adapter = new DgrAdapter();

    // Create an in-memory standardized shipment object mimicking Mongoose
    const baseShipment = {
        _id: 'dummy_draft_id_123',
        trackingNumber: `DRAFT-${Date.now()}`,
        status: 'ready_for_pickup',
        dhlConfirmed: false,
        user: 'dummy_user_id',
        organization: 'dummy_org_id',
        sender: {
            contactPerson: 'Retail KW',
            company: 'Target-Prod',
            phone: '+96590000002',
            email: 'retail@test.kw',
            city: 'KUWAIT',
            postalCode: '70051',
            countryCode: 'KW',
            streetLines: ['Retail Hub', 'Gate 3 Mall of Kuwait'],
            vatNumber: 'KW-VAT-888',
            traderType: 'business'
        },
        receiver: {
            contactPerson: 'Sam S',
            company: 'AU Shop',
            phone: '+61200000',
            email: 'au@test.au',
            city: 'NEW YORK',
            postalCode: '10001',
            countryCode: 'US', // Using US to avoid generic issues
            streetLines: ['1 George St', 'New York Trade Center'],
            traderType: 'business'
        },
        shipmentDate: new Date(Date.now() + 86400000 * 2),
        serviceCode: 'P',
        currency: 'USD',
        isDocument: false,
        shipmentType: 'package',
        declaredValue: 80,
        exportReason: 'Sale',
        incoterm: 'DAP',
        payerOfVat: 'receiver',
        gstPaid: false,
        items: [{
            description: 'Small box',
            quantity: 1,
            value: 80,
            currency: 'USD',
            netWeight: 1,
            hsCode: '33079000',
            countryOfOrigin: 'US',
            unitOfMeasurement: 'PCS'
        }],
        packages: [{
            weight: { value: 1, unit: 'kg' },
            dimensions: { length: 15, width: 10, height: 10, unit: 'cm' },
            description: 'Box'
        }],
        invoice: {
            number: `INV-${Date.now()}`,
            date: new Date().toISOString().split('T')[0]
        }
    };

    console.log(`Starting DHL API HS Code Type A/B Tests...`);
    console.log(`Origin Country: ${baseShipment.sender.countryCode}, Destination: ${baseShipment.receiver.countryCode}`);

    const modes = ['outbound', 'inbound', 'both'];
    const results = {};

    for (const mode of modes) {
        console.log(`\n============================`);
        console.log(`Testing hsCodeType = '${mode}'`);
        console.log(`============================`);

        const testShipment = JSON.parse(JSON.stringify(baseShipment));
        testShipment.hsCodeType = mode;
        testShipment.reference = `TEST-${mode.toUpperCase()}-${Date.now()}`;
        testShipment.invoice.number = `INV-${testShipment.reference}`;

        let payload;
        try {
            // Fetch credentials
            const activeConfig = await adapter._getResolvedConfig();

            // Build the exact payload that the app uses naturally
            payload = buildDgrShipmentPayload(testShipment, { accountNumber: activeConfig.accountNumber }, 1);

            console.log(`Generated commodityCodes array:`);
            console.log(JSON.stringify(payload.content.exportDeclaration.lineItems[0].commodityCodes, null, 2));

            // Execute the POST request internally
            const res = await adapter.createShipment(testShipment);

            console.log(`✅ SUCCESS for mode: ${mode}`);
            console.log(`Tracking Number: ${res.trackingNumber}`);

            results[mode] = {
                status: 'SUCCESS',
                trackingNumber: res.trackingNumber,
                hasInvoice: !!res.invoiceUrl
            };

            if (res.invoiceUrl) {
                const base64Data = res.invoiceUrl.replace(/^data:application\/pdf;base64,/, "");
                fs.writeFileSync(`invoice_${mode}.pdf`, base64Data, 'base64');
                console.log(`Saved invoice to invoice_${mode}.pdf`);
            }
        } catch (error) {
            console.error(`❌ FAILED for mode: ${mode}`);
            const errDetail = error.message.substring(0, 500); // Truncate long errors
            console.error(`Error: ${errDetail}...`);

            results[mode] = { status: 'FAILED', error: errDetail };

            if (errDetail.includes('420504')) {
                console.log(`\n⚠️ ENCOUNTERED 420504 error. Printing Origin details:`);
                if (payload) {
                    console.log(JSON.stringify(payload.customerDetails.shipperDetails, null, 2));
                }
            }
        }
    }

    console.log(`\n--- FINAL RESULTS ---`);
    const resultsJson = JSON.stringify(results, null, 2);
    console.log(resultsJson);
    fs.writeFileSync('test_hs_modes_results.json', resultsJson);
    process.exit(0);
}

run();
