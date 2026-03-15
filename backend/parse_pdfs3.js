const fs = require('fs');
const PDFParser = require("pdf2json");

async function parsePdf(file) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(this, 1);
        pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
            resolve(pdfParser.getRawTextContent().replace(/\s+/g, ' '));
        });
        pdfParser.loadPDF(file);
    });
}

async function run() {
    for (const mode of ['outbound', 'inbound', 'both']) {
        try {
            const file = `invoice_${mode}.pdf`;
            const text = await parsePdf(file);
            let result = 'NO_PREFIX_FOUND';
            if (text.includes('OB: 33079') || text.includes('OB:33079') || text.includes('OB:  33079')) {
                result = 'OB: (Outbound)';
            } else if (text.includes('IB: 33079') || text.includes('IB:33079') || text.includes('IB:  33079')) {
                result = 'IB: (Inbound)';
            } else {
                const parts = text.split('33079000');
                if (parts.length > 1) {
                    result = `Found code with prefix: "${parts[0].slice(-25)}"`;
                }
            }
            console.log(`[${mode}] -> Result: ${result}`);
        } catch (e) {
            console.log(`[${mode}] -> Error:`, e.message);
        }
    }
}
run();
