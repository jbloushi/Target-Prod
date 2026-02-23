const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user.model');
const Organization = require('../models/organization.model');

// Load env vars
dotenv.config({ path: `${__dirname}/../../.env` });

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shipment-tracker', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to DB');

        const users = await User.find({ role: 'client' });
        console.log(`Found ${users.length} clients to migrate.`);

        for (const user of users) {
            // 1. Check if user already has an org (idempotency)
            if (user.organization) {
                console.log(`Skipping ${user.email} - Already in Org`);
                continue;
            }

            // 2. Create Personal Organization
            const orgName = user.name || user.email;
            console.log(`Creating Org for ${user.email}...`);

            // Safely check addresses (handle undefined)
            const userAddresses = user.addresses || [];

            const newOrg = await Organization.create({
                name: orgName,
                type: 'client',
                balance: user.balance || 0,
                creditLimit: user.creditLimit || 0,
                currency: 'KWD',
                members: [user._id],
                addresses: userAddresses, // Copy addresses to Org
                markup: {
                    type: 'PERCENTAGE',
                    percentageValue: (user.markup && user.markup.value) ? user.markup.value : 15,
                    flatValue: 0
                }
            });

            // 3. Update User
            user.organization = newOrg._id;
            await user.save();
            console.log(`✅ Migrated ${user.email} -> Org: ${newOrg.name} (${newOrg._id})`);
        }

        console.log('Migration Complete.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
};

migrate();
