
const mongoose = require('mongoose');
const { connectDB } = require('./src/config/database');
const User = require('./src/models/user.model');
const Organization = require('./src/models/organization.model');
const Shipment = require('./src/models/shipment.model');
const Payment = require('./src/models/payment.model');

async function seed() {
    await connectDB();
    console.log('Connected to DB');

    // 1. Find or create Admin
    let admin = await User.findOne({ email: 'admin@demo.com' });
    if (!admin) {
        // Find or create Internal Org
        let org = await Organization.findOne({ name: 'Internal Logistics Org' });
        if (!org) {
            org = await Organization.create({ name: 'Internal Logistics Org', type: 'internal' });
        }
        admin = await User.create({
            name: 'System Admin',
            email: 'admin@demo.com',
            password: 'password123',
            role: 'admin',
            organization: org._id
        });
    }

    const orgId = admin.organization;

    // 2. Create Unpaid Shipment
    const shipment = await Shipment.create({
        organization: orgId,
        user: admin._id,
        trackingNumber: `TEST-TRK-${Date.now()}`,
        status: 'pending',
        price: 50,
        paid: false,
        origin: {
            contactPerson: 'Tester',
            company: 'Test Org',
            phone: '12345678',
            streetLines: ['Origin St'],
            city: 'Kuwait',
            countryCode: 'KW'
        },
        destination: {
            contactPerson: 'Receiver',
            company: 'Recv Org',
            phone: '87654321',
            streetLines: ['Dest St'],
            city: 'Dubai',
            countryCode: 'AE'
        }
    });
    console.log(`✅ Created Shipment: ${shipment.trackingNumber}`);

    // 3. Create Payment
    const payment = await Payment.create({
        organization: orgId,
        amount: 100,
        status: 'UNAPPLIED',
        method: 'manual',
        reference: `TEST-PAY-${Date.now()}`
    });
    console.log(`✅ Created Payment: ${payment.reference}`);

    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
