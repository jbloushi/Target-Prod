#!/usr/bin/env node
/**
 * Batch User Creation Script
 * 
 * This script creates multiple users at once from a JSON file or inline array.
 * Useful for initial production setup without affecting existing data.
 * 
 * Usage:
 *   node scripts/batch-create-users.js users.json
 *   
 * Or define users inline by editing the USERS array below.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment variables
// Load environment variables if not already provided (e.g., local dev)
if (!process.env.MONGO_URI) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const User = require('../src/models/user.model');
const Organization = require('../src/models/organization.model');

// Default users to create if no file is provided
const DEFAULT_USERS = [
    {
        name: 'System Admin',
        email: 'admin@demo.com',
        password: 'password123',
        role: 'admin',
        phone: '96511111111'
    },
    {
        name: 'Operations Staff',
        email: 'staff@demo.com',
        password: 'password123',
        role: 'staff',
        phone: '96522222222'
    },
    {
        name: 'Default Client',
        email: 'client@demo.com',
        password: 'password123',
        role: 'org_agent',
        phone: '96533333333'
    },
    {
        name: 'Delivery Driver',
        email: 'driver@demo.com',
        password: 'password123',
        role: 'driver',
        phone: '96544444444'
    }
];

async function connectDB() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/target-logistics';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        return false;
    }
}

async function loadUsers(filePath) {
    if (!filePath) {
        console.log('ℹ️  No file specified, using default users');
        return DEFAULT_USERS;
    }

    try {
        const fullPath = path.resolve(filePath);
        if (!fs.existsSync(fullPath)) {
            console.error(`❌ File not found: ${fullPath}`);
            console.log('Using default users instead...');
            return DEFAULT_USERS;
        }

        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const users = JSON.parse(fileContent);

        if (!Array.isArray(users)) {
            throw new Error('JSON file must contain an array of user objects');
        }

        console.log(`✅ Loaded ${users.length} users from ${filePath}`);
        return users;
    } catch (error) {
        console.error(`❌ Error loading file: ${error.message}`);
        console.log('Using default users instead...');
        return DEFAULT_USERS;
    }
}

async function createUsers(users) {
    const results = {
        created: [],
        updated: [],
        skipped: [],
        failed: []
    };

    // Get default organization for clients
    const defaultOrg = await Organization.findOne({ type: 'internal' });

    for (const userDetails of users) {
        try {
            // Validate required fields
            if (!userDetails.email || !userDetails.password || !userDetails.name) {
                console.log(`⚠️  Skipping user - missing required fields:`, userDetails);
                results.skipped.push({ email: userDetails.email || 'unknown', reason: 'Missing required fields' });
                continue;
            }

            const email = userDetails.email.toLowerCase();

            // Check if user exists
            const existingUser = await User.findOne({ email });

            if (existingUser) {
                console.log(`⚠️  User already exists: ${email}`);

                // Update existing user
                existingUser.name = userDetails.name;
                existingUser.password = userDetails.password;
                existingUser.role = userDetails.role || existingUser.role;
                if (userDetails.phone) existingUser.phone = userDetails.phone;

                await existingUser.save();
                results.updated.push({
                    email: existingUser.email,
                    role: existingUser.role
                });
                console.log(`   ✅ Updated: ${email} (${existingUser.role})`);
            } else {
                // Create new user
                const userData = {
                    name: userDetails.name,
                    email: email,
                    password: userDetails.password,
                    role: userDetails.role || 'org_agent'
                };

                if (userDetails.phone) {
                    userData.phone = userDetails.phone;
                }

                // Add organization for clients
                if (userData.role === 'org_agent' && defaultOrg) {
                    userData.organization = defaultOrg._id;
                    userData.carrierConfig = {
                        preferredCarrier: 'DHL',
                        traderType: 'business'
                    };
                }

                const newUser = await User.create(userData);

                // Add to organization members
                if (userData.role === 'org_agent' && defaultOrg && !defaultOrg.members.includes(newUser._id)) {
                    defaultOrg.members.push(newUser._id);
                    await defaultOrg.save();
                }

                results.created.push({
                    email: newUser.email,
                    role: newUser.role,
                    id: newUser._id
                });
                console.log(`   ✅ Created: ${email} (${newUser.role})`);
            }
        } catch (error) {
            console.error(`   ❌ Failed to create/update ${userDetails.email}:`, error.message);
            results.failed.push({
                email: userDetails.email,
                error: error.message
            });
        }
    }

    return results;
}

function printSummary(results) {
    console.log('\n📊 Summary');
    console.log('==========\n');
    console.log(`✅ Created: ${results.created.length}`);
    if (results.created.length > 0) {
        results.created.forEach(u => console.log(`   - ${u.email} (${u.role})`));
    }

    console.log(`\n🔄 Updated: ${results.updated.length}`);
    if (results.updated.length > 0) {
        results.updated.forEach(u => console.log(`   - ${u.email} (${u.role})`));
    }

    console.log(`\n⚠️  Skipped: ${results.skipped.length}`);
    if (results.skipped.length > 0) {
        results.skipped.forEach(u => console.log(`   - ${u.email}: ${u.reason}`));
    }

    console.log(`\n❌ Failed: ${results.failed.length}`);
    if (results.failed.length > 0) {
        results.failed.forEach(u => console.log(`   - ${u.email}: ${u.error}`));
    }

    console.log(`\n📈 Total processed: ${results.created.length + results.updated.length + results.skipped.length + results.failed.length}`);
}

async function main() {
    try {
        console.log('\n🚀 Batch User Creation Script\n');

        const connected = await connectDB();
        if (!connected) {
            process.exit(1);
        }

        // Get file path from command line args
        const filePath = process.argv[2];

        const users = await loadUsers(filePath);

        if (users.length === 0) {
            console.log('❌ No users to create');
            process.exit(0);
        }

        console.log(`\n📝 Processing ${users.length} users...\n`);

        const results = await createUsers(users);

        printSummary(results);

    } catch (error) {
        console.error('\n❌ Unexpected error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB\n');
    }
}

// Run the script
main();
