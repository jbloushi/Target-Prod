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

        // 2. Create External Organization
        const extOrgName = 'Elite Electronics Group';
        let extOrg = await Organization.findOne({ name: extOrgName });

        if (!extOrg) {
            extOrg = await Organization.create({
                name: extOrgName,
                type: 'client', // Internal type stays 'client' in model but label is Organization
                creditLimit: 10000,
                currency: 'KWD',
                addresses: [{
                    label: 'Main Warehouse',
                    company: 'Elite Electronics Group W.L.L.',
                    contactPerson: 'Sarah Ahmed',
                    streetLines: ['Sharq Industrial, Block 1'],
                    city: 'Kuwait City',
                    countryCode: 'KW',
                    phone: '96522222222',
                    isDefault: true
                }]
            });
            console.log(`Created External Organization: ${extOrgName}`);
        }

        // Seed Balance for External Org
        const seedBalance = 5000;
        const existingBalance = await financeLedgerService.getOrganizationBalance(extOrg._id);
        if (existingBalance === 0) {
            await financeLedgerService.createLedgerEntry(extOrg._id, {
                sourceRepo: 'Organization',
                sourceId: extOrg._id,
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

            // Organization Agents (External Org)
            { name: 'Org Manager', email: 'orgmanager@demo.com', role: 'org_manager', password: 'password123', organization: extOrg._id },
            { name: 'Lead Agent', email: 'orgagent@demo.com', role: 'org_agent', password: 'password123', organization: extOrg._id },
            {
                name: 'Field Agent', email: 'agent@demo.com', role: 'org_agent', password: 'password123', organization: extOrg._id,
                markup: { type: 'FLAT', flatValue: 5 }
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
            const org = u.organization.toString() === internalOrg._id.toString() ? internalOrg : extOrg;
            if (!org.members.includes(existing._id)) {
                org.members.push(existing._id);
            }

            if (u.role === 'org_agent' || u.role === 'org_manager') targetClientUser = existing;
        }
        await internalOrg.save();
        await extOrg.save();

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
                        organization: extOrg._id,
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
