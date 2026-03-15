const fs = require('fs');
require('dotenv').config();
const DgrAdapter = require('./src/adapters/DgrAdapter');
const { buildDgrShipmentPayload } = require('./src/services/dgr-payload-builder');
const PDFParser = require("pdf2json");

async function parsePdf(buffer) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(this, 1);
        pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
            resolve(pdfParser.getRawTextContent().replace(/\s+/g, ' '));
        });
        pdfParser.parseBuffer(buffer);
    });
}

async function run() {
    const adapter = new DgrAdapter();

    const baseShipment = {
        _id: '5f8d0a4c0c1bdea3a9d91f24',
        trackingNumber: `DRAFT-${Date.now()}`,
        status: 'ready_for_pickup',
        dhlConfirmed: false,
        user: '5f8d0a4c0c1bdea3a9d91f25',
        organization: '5f8d0a4c0c1bdea3a9d91f26',
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
            countryCode: 'US',
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
        hsCodeType: 'outbound',
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

    console.log(`Starting DHL API Phone Number Test...`);

    const testShipment = JSON.parse(JSON.stringify(baseShipment));
    testShipment.reference = `TEST-PHONE-${Date.now()}`;
    testShipment.invoice.number = `INV-${testShipment.reference}`;

    try {
        const activeConfig = await adapter._getResolvedConfig();
        const res = await adapter.createShipment(testShipment);

        console.log(`✅ SUCCESS! Tracking Number: ${res.trackingNumber}`);

        if (res.labelUrl) {
            console.log(`Parsing Label PDF...`);
            const base64Data = res.labelUrl.replace(/^data:application\/pdf;base64,/, "");
            const buf = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(`test_label.pdf`, buf);
            const text = await parsePdf(buf);

            const results = {};
            if (text.includes("96590000002")) {
                results.senderLabel = true;
            } else {
                results.senderLabel = false;
            }
            if (text.includes("61200000")) {
                results.receiverLabel = true;
            } else {
                results.receiverLabel = false;
            }
            if (res.awbUrl) {
                const base64DataAwb = res.awbUrl.replace(/^data:application\/pdf;base64,/, "");
                const bufAwb = Buffer.from(base64DataAwb, 'base64');
                fs.writeFileSync(`test_awb.pdf`, bufAwb);
                const textAwb = await parsePdf(bufAwb);
                if (textAwb.includes("96590000002")) {
                    results.senderAWB = true;
                } else {
                    results.senderAWB = false;
                }
                if (textAwb.includes("61200000")) {
                    results.receiverAWB = true;
                } else {
                    results.receiverAWB = false;
                }
            }
            fs.writeFileSync('test_phone_results.json', JSON.stringify(results, null, 2));
            console.log(JSON.stringify(results, null, 2));

        }
    } catch (error) {
        console.error(`❌ FAILED:`);
        if (error.response?.data) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error);
        }
    }
}
run();
