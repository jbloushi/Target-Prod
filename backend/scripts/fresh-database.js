require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const { prisma } = require('../src/config/database');
const { hashPassword } = require('../src/utils/security');
const { seedAccounting } = require('../src/scripts/seedAccounting');

const args = process.argv.slice(2);
const isConfirmed = args.includes('--confirm') || args.includes('-y') || args.includes('--force');
const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1] || (args.includes('--clean') ? 'clean' : (args.includes('--clear-only') ? 'clear-only' : 'demo'));

async function main() {
  console.log('================================================================');
  console.log('🔄 TARGET LOGISTICS - DATABASE RESET & SEED TOOL');
  console.log('================================================================');
  console.log(`Target Mode: [${modeArg.toUpperCase()}]`);

  if (!isConfirmed) {
    console.error('\n⚠️  SAFETY WARNING: This operation will completely drop and recreate all database tables.');
    console.error('All existing shipments, users, invoices, and audit logs will be PERMANENTLY ERASED.\n');
    console.error('To proceed, re-run this command with the --confirm flag:');
    console.error('  node scripts/fresh-database.js --confirm');
    console.error('  node scripts/fresh-database.js --confirm --mode=clean    (Clean production slate)');
    console.error('  node scripts/fresh-database.js --confirm --mode=demo     (Full showcase seed dump)');
    console.error('  node scripts/fresh-database.js --confirm --mode=clear-only (Empty tables only)\n');
    process.exit(1);
  }

  console.log('\n[1/3] 🧨 Wiping schema and recreating empty tables via Prisma...');
  try {
    execSync('npx prisma db push --force-reset --accept-data-loss', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('✓ Database schema successfully recreated fresh.');
  } catch (err) {
    console.error('❌ Failed to reset database tables via prisma db push:', err.message);
    process.exit(1);
  }

  if (modeArg === 'clear-only') {
    console.log('\n🎉 Database wiped and tables recreated empty (--mode=clear-only). No seed data inserted.');
    return;
  }

  if (modeArg === 'clean') {
    console.log('\n[2/3] 🏢 Initializing Clean Production Baseline...');
    await prisma.$connect();

    // 1. Create Internal Organization
    const internalOrg = await prisma.organization.create({
      data: {
        name: 'Target Logistics',
        type: 'internal',
        currency: 'KWD',
        creditLimit: 100000,
        active: true,
        billingContactName: 'Operations Command',
        billingEmail: process.env.ADMIN_EMAIL || 'ops@target-kw.com',
        billingWhatsappNumber: '+96590001000'
      }
    });
    console.log(`✓ Created Primary Organization: "${internalOrg.name}" (${internalOrg.id})`);

    // 2. Create Superadmin User
    const adminEmail = process.env.ADMIN_INITIAL_EMAIL || 'admin@target-kw.com';
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'TargetAdmin2026!';
    const hashedPassword = await hashPassword(adminPassword);

    const superAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'System Administrator',
        role: 'admin',
        phone: '+965 9000 0001',
        organizationId: internalOrg.id,
        creditLimit: 100000,
        active: true
      }
    });
    console.log(`✓ Created Superadmin User: ${superAdmin.email}`);

    // 3. Seed Accounting
    console.log('\n[3/3] 🏛️  Seeding Enterprise Chart of Accounts & Banking...');
    await seedAccounting();

    console.log('\n================================================================');
    console.log('✅ CLEAN PRODUCTION DATABASE READY!');
    console.log(`   Admin Login:    ${adminEmail}`);
    console.log(`   Admin Password: ${adminPassword}`);
    console.log('   All 23 Chart of Accounts initialized (1010-7010).');
    console.log('   Zero test consignments or dummy invoices created.');
    console.log('================================================================\n');
  } else {
    // Demo Mode (Default): Run showcase demo seed
    console.log('\n[2/3] 📦 Running Showcase Demo Seeder (prisma-seed.js)...');
    try {
      execSync('node prisma-seed.js', {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (err) {
      console.error('❌ Failed running prisma-seed.js:', err.message);
      process.exit(1);
    }

    console.log('\n================================================================');
    console.log('✅ FRESH DATABASE RESET & SEED DUMP RESTORED SUCCESSFULLY!');
    console.log('   All 8 demo roles active with password: password123');
    console.log('   Demo consignments, tracking numbers & invoices restored.');
    console.log('   Enterprise Chart of Accounts (COA) & NBK Banking seeded.');
    console.log('   Showcase manifest exported to: backend/dumps/showcase_demo_dump.json');
    console.log('================================================================\n');
  }
}

main()
  .catch((err) => {
    console.error('❌ Fatal error during fresh database setup:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
