const fs = require('fs');

async function run() {
    try {
        const pdfModule = require('pdf-parse');
        const pdf = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;

        for (const mode of ['outbound', 'inbound', 'both']) {
            const file = `invoice_${mode}.pdf`;
            if (!fs.existsSync(file)) {
                console.log(`[${mode}] MISSING ${file}`);
                continue;
            }
            const buf = fs.readFileSync(file);
            const data = await pdf(buf);
            const text = data.text.replace(/\s+/g, ' ');

            let result = 'NO_PREFIX_FOUND';
            if (text.includes('OB: 33079000') || text.includes('OB:33079000')) {
                result = 'OB: (Outbound)';
            } else if (text.includes('IB: 33079000') || text.includes('IB:33079000')) {
                result = 'IB: (Inbound)';
            } else {
                // Just find the context around it
                const parts = text.split('33079000');
                if (parts.length > 1) {
                    result = `Found code with prefix: "${parts[0].slice(-6)}"`;
                }
            }
            console.log(`[${mode}] -> Result: ${result}`);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
