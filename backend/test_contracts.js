const fs = require('fs');
require('dotenv').config();
const DgrAdapter = require('./src/adapters/DgrAdapter');
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

async function runTest() {
    const adapter = new DgrAdapter();
    const baseId = '5f8d0a4c0c1bdea3a9d91f24';

    const baseShipment = {
        _id: baseId,
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
            number: `INV-TEST-CN-${Date.now()}`,
            date: new Date().toISOString().split('T')[0]
        }
    };

    const scenarios = [
        { name: 'sender_only', senderContractNumber: 'SENDER-CN-111', receiverContractNumber: null },
        { name: 'receiver_only', senderContractNumber: null, receiverContractNumber: 'RECEIVER-ANT-222' },
        { name: 'both', senderContractNumber: 'SENDER-CN-333', receiverContractNumber: 'RECEIVER-ANT-444' }
    ];

    const finalResults = {};

    for (const test of scenarios) {
        console.log(`\n\n=== RUNNING TEST: ${test.name} ===`);
        const payload = JSON.parse(JSON.stringify(baseShipment));
        payload.reference = `TEST-${Date.now()}`;
        payload.invoice.number = `INV-${payload.reference}`.substring(0, 35);

        if (test.senderContractNumber) payload.senderContractNumber = test.senderContractNumber;
        if (test.receiverContractNumber) payload.receiverContractNumber = test.receiverContractNumber;

        try {
            const res = await adapter.createShipment(payload);
            console.log(`✅ SUCCESS - Tracking: ${res.trackingNumber}`);

            finalResults[test.name] = {
                status: 'success',
                trackingNumber: res.trackingNumber,
                invoiceGenerated: !!res.invoiceUrl
            };

            // Download & Parse Invoice to check if they printed
            let allText = '';
            if (res.invoiceUrl) {
                const bufInv = Buffer.from(res.invoiceUrl.replace(/^data:application\/pdf;base64,/, ""), 'base64');
                allText += await parsePdf(bufInv) + '\n';
            }
            if (res.awbUrl) {
                const bufAwb = Buffer.from(res.awbUrl.replace(/^data:application\/pdf;base64,/, ""), 'base64');
                allText += await parsePdf(bufAwb) + '\n';
            }
            if (res.labelUrl) {
                const bufLab = Buffer.from(res.labelUrl.replace(/^data:application\/pdf;base64,/, ""), 'base64');
                allText += await parsePdf(bufLab) + '\n';
            }

            if (test.senderContractNumber) {
                const printedSender = allText.includes(test.senderContractNumber);
                console.log(`Sender Contract (${test.senderContractNumber}) Printed: ${printedSender}`);
                finalResults[test.name].senderContractPrinted = printedSender;
            }
            if (test.receiverContractNumber) {
                const printedReceiver = allText.includes(test.receiverContractNumber);
                console.log(`Receiver Contract (${test.receiverContractNumber}) Printed: ${printedReceiver}`);
                finalResults[test.name].receiverContractPrinted = printedReceiver;
            }

        } catch (error) {
            console.error(`❌ FAILED`);
            finalResults[test.name] = { status: 'failed', error: error.message };
            if (error.response?.data) {
                console.error(JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error);
            }
        }
    }

    fs.writeFileSync('test_contract_results.json', JSON.stringify(finalResults, null, 2));
    console.log(`\nAll done. Results saved to test_contract_results.json`);
}

runTest();
