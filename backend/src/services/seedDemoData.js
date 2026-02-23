const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const User = require('../models/user.model');
const Organization = require('../models/organization.model');
const Shipment = require('../models/shipment.model'); // Added Shipment
const logger = require('../utils/logger');
const financeLedgerService = require('./financeLedger.service');

// Load env vars
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const CITIES = [
    { city: 'Kuwait City', code: 'KW' },
    { city: 'Riyadh', code: 'SA' },
    { city: 'Dubai', code: 'AE' },
    { city: 'Doha', code: 'QA' },
    { city: 'Manama', code: 'BH' },
    { city: 'Muscat', code: 'OM' },
    { city: 'London', code: 'GB' },
    { city: 'New York', code: 'US' },
    { city: 'Mumbai', code: 'IN' },
    { city: 'Cairo', code: 'EG' }
];

const STATUSES = ['draft', 'pending', 'ready_for_pickup', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception'];

// Helper for random date in usage
const getRandomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const seedDemoData = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            await connectDB();
            console.log('Connected to DB for seeding...');
        }

        // 1. Create Internal Organization (Platform Owner)
        const internalOrgName = 'Internal Logistics Org';
        let internalOrg = await Organization.findOne({ name: internalOrgName });

        if (!internalOrg) {
            internalOrg = await Organization.create({
                name: internalOrgName,
                type: 'internal',
                creditLimit: 0,
                currency: 'KWD',
                markup: { type: 'PERCENTAGE', percentageValue: 0 },
                addresses: [{
                    label: 'Main HQ',
                    company: 'Internal Logistics',
                    contactPerson: 'Ops Director',
                    streetLines: ['Main St, Tower 1'],
                    city: 'Kuwait City',
                    countryCode: 'KW',
                    phone: '96511111111',
                    isDefault: true
                }]
            });
            console.log(`Created Internal Organization: ${internalOrgName}`);
        }

        // 2. Create Client Organization
        const clientOrgName = 'Elite Electronics';
        let clientOrg = await Organization.findOne({ name: clientOrgName });

        if (!clientOrg) {
            clientOrg = await Organization.create({
                name: clientOrgName,
                type: 'client',
                creditLimit: 10000,
                currency: 'KWD',
                currency: 'KWD',
                // markup: { type: 'PERCENTAGE', percentageValue: 20 }, // Removed as per request
                addresses: [{
                    label: 'Warehouse A',
                    company: 'Elite Electronics Co',
                    contactPerson: 'Sarah Ahmed',
                    streetLines: ['Sharq Industrial, Block 1'],
                    city: 'Kuwait City',
                    countryCode: 'KW',
                    phone: '96522222222',
                    isDefault: true
                }]
            });
            console.log(`Created Client Organization: ${clientOrgName}`);
        }

        // Seed Balance for Client Org
        const seedBalance = 5000;
        const existingBalance = await financeLedgerService.getOrganizationBalance(clientOrg._id);
        if (existingBalance === 0) {
            await financeLedgerService.createLedgerEntry(clientOrg._id, {
                sourceRepo: 'Adjustment',
                sourceId: clientOrg._id,
                amount: seedBalance,
                entryType: 'CREDIT',
                category: 'ADJUSTMENT',
                description: 'Initial credit line'
            });
        }

        // 3. Define Users
        const users = [
            // Platform Users (Internal Org)
            { name: 'System Admin', email: 'admin@demo.com', role: 'admin', password: 'password123', organization: internalOrg._id },
            { name: 'Operations Staff', email: 'staff@demo.com', role: 'staff', password: 'password123', organization: internalOrg._id },
            { name: 'Ops Manager', email: 'manager@demo.com', role: 'manager', password: 'password123', organization: internalOrg._id },
            { name: 'Lead Accountant', email: 'accounting@demo.com', role: 'accounting', password: 'password123', organization: internalOrg._id },
            { name: 'Delivery Driver', email: 'driver@demo.com', role: 'driver', password: 'password123', organization: internalOrg._id },

            // Organization Users (Client Org)
            { name: 'Org Manager', email: 'orgmanager@demo.com', role: 'org_manager', password: 'password123', organization: clientOrg._id },
            { name: 'Org Agent', email: 'orgagent@demo.com', role: 'org_agent', password: 'password123', organization: clientOrg._id },
            {
                name: 'Legacy Client', email: 'client@demo.com', role: 'client', password: 'password123', organization: clientOrg._id,
                markup: { type: 'FLAT', flatValue: 5 } // Added Flat 5 as requested
            }
        ];

        let targetClientUser = null;

        for (const u of users) {
            let existing = await User.findOne({ email: u.email });
            if (!existing) {
                existing = await User.create(u);
                console.log(`Created User: ${u.email} (${u.role})`);
            } else {
                existing.password = u.password;
                existing.role = u.role;
                existing.organization = u.organization;
                await existing.save();
                console.log(`Updated User: ${u.email}`);
            }

            // Reference the org correctly
            const org = u.organization.toString() === internalOrg._id.toString() ? internalOrg : clientOrg;
            if (!org.members.includes(existing._id)) {
                org.members.push(existing._id);
            }

            if (u.role === 'client' || u.role === 'org_manager') targetClientUser = existing;
        }
        await internalOrg.save();
        await clientOrg.save();

        // 3. Generate Random Shipments
        if (targetClientUser) {
            const currentCount = await Shipment.countDocuments({ user: targetClientUser._id });
            const TARGET_COUNT = 50;

            if (currentCount < TARGET_COUNT) {
                console.log(`Generating ${TARGET_COUNT - currentCount} random shipments...`);

                const shipmentsToCreate = [];
                for (let i = 0; i < (TARGET_COUNT - currentCount); i++) {
                    const origin = CITIES[Math.floor(Math.random() * CITIES.length)];
                    let dest = CITIES[Math.floor(Math.random() * CITIES.length)];
                    while (dest.city === origin.city) dest = CITIES[Math.floor(Math.random() * CITIES.length)];

                    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];

                    // Date distribution: last 6 months
                    const createdAt = getRandomDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), new Date());

                    const tn = `TRK-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;

                    shipmentsToCreate.push({
                        trackingNumber: tn,
                        user: targetClientUser._id,
                        organization: clientOrg._id,
                        status: status,
                        serviceCode: Math.random() > 0.5 ? 'EXPRESS' : 'STANDARD',
                        carrier: 'DGR',
                        origin: {
                            company: 'Sender Co',
                            contactPerson: 'Sender Name',
                            streetLines: ['Street 1'],
                            city: origin.city,
                            countryCode: origin.code,
                            phone: '12345678'
                        },
                        destination: {
                            company: 'Receiver Co',
                            contactPerson: 'Receiver Name',
                            streetLines: ['Street 2'],
                            city: dest.city,
                            countryCode: dest.code,
                            phone: '87654321'
                        },
                        currentLocation: {
                            streetLines: ['Warehouse'],
                            city: origin.city,
                            countryCode: origin.code,
                            contactPerson: 'Warehouse Staff',
                            phone: '96599999999'
                        },
                        createdAt: createdAt,
                        updatedAt: createdAt,
                        estimatedDelivery: new Date(createdAt.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days after creation
                        paid: Math.random() > 0.7,
                        price: Math.floor(Math.random() * 100) + 10,
                        customer: {
                            name: 'Demo Customer',
                            email: 'customer@demo.com'
                        },
                        items: [{ description: 'Box', weight: 5, quantity: 1, value: 50 }]
                    });
                }

                if (shipmentsToCreate.length > 0) {
                    await Shipment.insertMany(shipmentsToCreate);
                    console.log(`Created ${shipmentsToCreate.length} shipments.`);
                }
            } else {
                console.log(`Shipments already exist (${currentCount}). Skipping generation.`);
            }
        }

        console.log('Seeding completed successfully');
        return true;
    } catch (error) {
        console.error('Seeding failed:', error);
        return false;
    }
};

module.exports = seedDemoData;
