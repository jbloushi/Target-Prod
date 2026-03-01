#!/usr/bin/env node
/**
 * Interactive User Creation Script
 *
 * This script allows you to create a single user via the command line.
 * Usage: node scripts/create-user.js
 *
 * You can also set environment variables for non-interactive use:
 * USER_NAME="Admin" USER_EMAIL="admin@demo.com" USER_PASSWORD="password123" USER_ROLE="admin" node scripts/create-user.js
 */

const mongoose = require('mongoose');
const path = require('path');
const readline = require('readline');

// Load environment variables
if (!process.env.MONGO_URI) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const User = require('../src/models/user.model');
const Organization = require('../src/models/organization.model');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    try {
        console.log('\n🚀 Create System User\n');

        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/target-logistics';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Check for ENV variables first
        let name = process.env.USER_NAME;
        let email = process.env.USER_EMAIL;
        let password = process.env.USER_PASSWORD;
        let role = process.env.USER_ROLE;
        let phone = process.env.USER_PHONE;

        // If not provided in ENV, ask interactively
        if (!name) name = await question('👤 Full Name: ');
        if (!email) email = await question('📧 Email Address: ');
        if (!password) password = await question('🔑 Password: ');

        if (!role) {
            console.log('\nAvailable Roles:');
            console.log('1. admin       (Full system control)');
            console.log('2. staff       (Manage shipments/finance)');
            console.log('3. org_manager (Manage organization & agents)');
            console.log('4. org_agent   (Regular user)');
            console.log('5. driver      (Delivery staff)');
            console.log('6. accounting  (View/Manage finances)');

            const roleChoice = await question('\nSelect Role (1-6) [4]: ');
            const roles = ['admin', 'staff', 'org_manager', 'org_agent', 'driver', 'accounting'];
            role = roles[parseInt(roleChoice) - 1] || 'org_agent';
        }

        if (!phone) phone = await question('📱 Phone (Optional): ');

        console.log(`\nCreating ${role}: ${email}...`);

        // Check if user exists
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            const update = await question('⚠️  User already exists. Update password? (y/n) [n]: ');
            if (update.toLowerCase() === 'y') {
                existing.password = password;
                existing.name = name;
                existing.role = role;
                if (phone) existing.phone = phone;
                await existing.save();
                console.log('✅ User updated successfully!');
            } else {
                console.log('❌ Operation cancelled.');
            }
        } else {
            // Find default organization for non-internal users
            let organization;
            if (['org_agent', 'org_manager'].includes(role)) {
                const defaultOrg = await Organization.findOne({ type: 'internal' });
                if (defaultOrg) organization = defaultOrg._id;
            }

            const newUser = await User.create({
                name,
                email: email.toLowerCase(),
                password,
                role,
                phone: phone || undefined,
                organization,
                markup: {
                    type: 'PERCENTAGE',
                    percentageValue: 15,
                    flatValue: 0
                }
            });

            console.log(`✅ User created successfully! (ID: ${newUser._id})`);

            // If it's a client user, add to organization members if possible
            if (organization) {
                const org = await Organization.findById(organization);
                if (org && !org.members.includes(newUser._id)) {
                    org.members.push(newUser._id);
                    await org.save();
                    console.log(`🔗 Linked to organization: ${org.name}`);
                }
            }
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        rl.close();
        console.log('👋 Disconnected\n');
    }
}

main();
