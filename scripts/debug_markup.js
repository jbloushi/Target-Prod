const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const Organization = require(path.join(__dirname, '../backend/src/models/organization.model'));

async function debugMarkup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // Find "Retail KW" (from screenshot)
        let org = await Organization.findOne({ name: 'Retail KW' });

        if (!org) {
            console.log('Retail KW not found, finding first org...');
            org = await Organization.findOne({});
        }

        if (org) {
            console.log(`\nOrganization: ${org.name}`);
            console.log('--- Markup Configuration ---');
            console.log(JSON.stringify(org.markup, null, 2));

            // Check what Mongoose returns for byCarrier
            if (org.markup.byCarrier) {
                console.log('\n--- byCarrier Object ---');
                console.log(JSON.stringify(org.markup.byCarrier, null, 2));
            } else {
                console.log('\n--- byCarrier is missing/empty ---');
            }
        } else {
            console.log('No organization found.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

debugMarkup();
