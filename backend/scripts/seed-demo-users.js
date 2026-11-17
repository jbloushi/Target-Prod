require('dotenv').config();
const { prisma } = require('../src/config/database');
const { hashPassword, generateUserApiKey } = require('../src/utils/security');

const DEFAULT_PASSWORD = 'TargetDemo2026!';

async function seedDemoUsers() {
    console.log('🚀 Seeding comprehensive Demo Users & API Keys...');
    await prisma.$connect();

    const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

    // 1. Ensure Target Logistics internal org exists
    let internalOrg = await prisma.organization.findFirst({
        where: { OR: [{ name: 'Target Logistics' }, { type: 'internal' }] }
    });
    if (!internalOrg) {
        internalOrg = await prisma.organization.create({
            data: {
                name: 'Target Logistics',
                type: 'internal',
                currency: 'KWD',
                creditLimit: 100000,
                active: true,
                billingEmail: 'admin@target-kw.com'
            }
        });
    }

    // 2. Create / Upsert Demo Organizations
    const orgConfigs = [
        {
            name: 'Demo DHL Express Corp',
            type: 'BUSINESS',
            currency: 'KWD',
            creditLimit: 0,
            allowedCarriers: { allowed: ['DGR'], defaultCarrier: 'DGR' }
        },
        {
            name: 'Demo Domestic Delivery Ltd',
            type: 'BUSINESS',
            currency: 'KWD',
            creditLimit: 0,
            allowedCarriers: { allowed: ['INTERNAL'], defaultCarrier: 'INTERNAL', defaultServiceCode: 'DOM' }
        },
        {
            name: 'Demo Manual Logistics Co',
            type: 'BUSINESS',
            currency: 'KWD',
            creditLimit: 0,
            allowedCarriers: { allowed: ['MANUAL'], defaultCarrier: 'MANUAL' }
        },
        {
            name: 'Demo Corporate Credit Org',
            type: 'CREDIT',
            currency: 'KWD',
            creditLimit: 2500,
            balance: 0,
            unappliedBalance: 0
        },
        {
            name: 'Demo B2B Merchant Corp',
            type: 'BUSINESS',
            currency: 'KWD',
            creditLimit: 500,
            balance: 0,
            unappliedBalance: 0
        }
    ];

    const orgMap = {};
    for (const conf of orgConfigs) {
        const org = await prisma.organization.upsert({
            where: { name: conf.name },
            update: {
                type: conf.type,
                currency: conf.currency,
                creditLimit: conf.creditLimit,
                allowedCarriers: conf.allowedCarriers || undefined,
                active: true
            },
            create: {
                name: conf.name,
                type: conf.type,
                currency: conf.currency,
                creditLimit: conf.creditLimit,
                balance: conf.balance || 0,
                unappliedBalance: conf.unappliedBalance || 0,
                allowedCarriers: conf.allowedCarriers || undefined,
                active: true
            }
        });
        orgMap[conf.name] = org;
    }

    // 3. Define Demo User Profiles
    const userDefinitions = [
        // --- API Test Suite Profiles ---
        {
            email: 'demo_carrier@target-kw.com',
            name: 'Demo Carrier Shipper (DHL Only)',
            role: 'client',
            phone: '+96590001011',
            organizationId: orgMap['Demo DHL Express Corp'].id,
            agentPolicy: {
                shippingAccess: { mode: 'carrier', carrierCode: 'DGR', serviceCode: 'P' }
            },
            needsApiKey: true,
            apiKeyVar: 'CARRIER_KEY'
        },
        {
            email: 'demo_domestic@target-kw.com',
            name: 'Demo Domestic Shipper (Local Only)',
            role: 'client',
            phone: '+96590001012',
            organizationId: orgMap['Demo Domestic Delivery Ltd'].id,
            agentPolicy: {
                shippingAccess: { mode: 'internal', carrierCode: 'INTERNAL', serviceCode: 'DOM' }
            },
            needsApiKey: true,
            apiKeyVar: 'DOMESTIC_KEY'
        },
        {
            email: 'demo_manual@target-kw.com',
            name: 'Demo Manual Shipper (Custom Fleet)',
            role: 'client',
            phone: '+96590001013',
            organizationId: orgMap['Demo Manual Logistics Co'].id,
            agentPolicy: {
                shippingAccess: { mode: 'manual', carrierCode: 'MANUAL', serviceCode: null }
            },
            needsApiKey: true,
            apiKeyVar: 'MANUAL_KEY'
        },
        {
            email: 'demo_credit@target-kw.com',
            name: 'Demo Corporate Credit Shipper',
            role: 'client',
            phone: '+96590001014',
            organizationId: orgMap['Demo Corporate Credit Org'].id,
            agentPolicy: {},
            needsApiKey: true,
            apiKeyVar: 'CREDIT_KEY'
        },

        // --- UI Role Testing Profiles ---
        {
            email: 'demo_superadmin@target-kw.com',
            name: 'Demo Platform Superadmin',
            role: 'admin',
            phone: '+96590001021',
            organizationId: internalOrg.id,
            needsApiKey: false
        },
        {
            email: 'demo_accountant@target-kw.com',
            name: 'Demo Finance Accountant',
            role: 'accounting',
            phone: '+96590001022',
            organizationId: internalOrg.id,
            needsApiKey: false
        },
        {
            email: 'demo_opsmanager@target-kw.com',
            name: 'Demo Operations Manager',
            role: 'manager',
            phone: '+96590001023',
            organizationId: internalOrg.id,
            needsApiKey: false
        },
        {
            email: 'demo_driver@target-kw.com',
            name: 'Demo Fleet Courier Driver',
            role: 'driver',
            phone: '+96590001024',
            organizationId: internalOrg.id,
            needsApiKey: false
        },
        {
            email: 'demo_orgmanager@target-kw.com',
            name: 'Demo Corporate Company Manager',
            role: 'org_manager',
            phone: '+96590001025',
            organizationId: orgMap['Demo B2B Merchant Corp'].id,
            needsApiKey: false
        },
        {
            email: 'demo_orgagent@target-kw.com',
            name: 'Demo Corporate Branch Agent',
            role: 'org_agent',
            phone: '+96590001026',
            organizationId: orgMap['Demo B2B Merchant Corp'].id,
            needsApiKey: false
        },
        {
            email: 'demo_shipper@target-kw.com',
            name: 'Demo Self-Service Shipper',
            role: 'client',
            phone: '+96590001027',
            organizationId: null,
            needsApiKey: false
        }
    ];

    const generatedKeys = {};
    const createdUsers = [];

    for (const u of userDefinitions) {
        // Upsert user record
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: {
                name: u.name,
                role: u.role,
                phone: u.phone,
                password: hashedPassword,
                organizationId: u.organizationId,
                agentPolicy: u.agentPolicy || undefined,
                active: true
            },
            create: {
                email: u.email,
                name: u.name,
                role: u.role,
                phone: u.phone,
                password: hashedPassword,
                organizationId: u.organizationId,
                agentPolicy: u.agentPolicy || undefined,
                active: true
            }
        });

        // Generate and assign API key if required
        if (u.needsApiKey) {
            const { fullKey, hash, last4 } = generateUserApiKey(user.id);
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    apiKeyHash: hash,
                    apiKeyLast4: last4
                }
            });
            generatedKeys[u.apiKeyVar] = fullKey;
        }

        createdUsers.push(user);
    }

    console.log('\n======================================================');
    console.log('✅ ALL DEMO USERS & ORGANIZATIONS SEEDED SUCCESSFULLY!');
    console.log('======================================================\n');

    console.log('🔑 API Keys for api_cycle.sh (all profiles covered):');
    console.log('------------------------------------------------------');
    for (const [envVar, key] of Object.entries(generatedKeys)) {
        console.log(`export ${envVar}="${key}"`);
    }

    console.log('\n🖥️ UI Test Logins (Password for all accounts: ' + DEFAULT_PASSWORD + '):');
    console.log('----------------------------------------------------------------------');
    console.log('Role         | Email                         | Scope');
    console.log('-------------|-------------------------------|------------------------');
    console.log('Superadmin   | demo_superadmin@target-kw.com | Full platform control');
    console.log('Accounting   | demo_accountant@target-kw.com | GL, AP, Treasury, Invoices');
    console.log('Operations   | demo_opsmanager@target-kw.com | Dispatch, SLA, Tracking');
    console.log('Courier      | demo_driver@target-kw.com     | Driver Run, Mobile POD');
    console.log('Org Manager  | demo_orgmanager@target-kw.com | Corporate B2B Account Lead');
    console.log('Org Agent    | demo_orgagent@target-kw.com   | Corporate Branch Booking');
    console.log('Shipper      | demo_shipper@target-kw.com    | Self-Service Client Portal');
    console.log('======================================================\n');

    await prisma.$disconnect();
}

seedDemoUsers().catch((err) => {
    console.error('❌ Failed to seed demo users:', err);
    process.exit(1);
});
