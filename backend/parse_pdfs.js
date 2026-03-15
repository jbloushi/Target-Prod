const fs = require('fs');

async function parse() {
    try {
        const pdf = require('pdf-parse'); // Try to load if available, or we install it
        const modes = ['outbound', 'inbound', 'both'];
        for (const mode of modes) {
            const dataBuffer = fs.readFileSync(`invoice_${mode}.pdf`);
            const data = await pdf(dataBuffer);

            const matchOB = data.text.match(/OB:[\s\S]*?33079000/);
            const matchIB = data.text.match(/IB:[\s\S]*?33079000/);

            let result = 'NO_PREFIX_FOUND';
            if (matchOB) result = 'OB:';
            else if (matchIB) result = 'IB:';
            else if (data.text.includes('OB:')) result = 'OB: (found elsewhere)';
            else if (data.text.includes('IB:')) result = 'IB: (found elsewhere)';
            else if (data.text.includes('33079000')) result = 'NO_PREFIX_BUT_CODE_FOUND';

            console.log(`MODE: ${mode} -> RESULT: ${result}`);
        }
    } catch (e) {
        console.error("PDF Parse failed:", e.message);
    }
}
parse();
