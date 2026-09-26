require('dotenv').config();
const { prisma } = require('../src/config/database');
const { hashPassword } = require('../src/utils/security');

async function ensureAdmin() {
  console.log('👑 Ensuring Superadmin Accounts...');
  await prisma.$connect();

  // 1. Ensure primary internal organization exists
  let org = await prisma.organization.findFirst({
    where: { 
      OR: [
        { name: 'Target Logistics' }, 
        { type: 'internal' }
      ] 
    }
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Target Logistics',
        type: 'internal',
        currency: 'KWD',
        creditLimit: 100000,
        active: true,
        billingEmail: 'admin@target-kw.com',
        billingContactName: 'Operations Command',
        billingWhatsappNumber: '+96590001000'
      }
    });
    console.log(`✓ Created Primary Organization: "${org.name}" (${org.id})`);
  }

  // 2. Upsert admin@target-kw.com (Password: TargetAdmin2026!)
  const targetAdminPassword = await hashPassword('TargetAdmin2026!');
  const admin1 = await prisma.user.upsert({
    where: { email: 'admin@target-kw.com' },
    update: {
      password: targetAdminPassword,
      role: 'admin',
      active: true,
      organizationId: org.id
    },
    create: {
      email: 'admin@target-kw.com',
      password: targetAdminPassword,
      name: 'System Administrator',
      role: 'admin',
      phone: '+965 9000 0001',
      active: true,
      organizationId: org.id,
      creditLimit: 100000
    }
  });
  console.log(`✅ [Active] User: ${admin1.email} | Role: ${admin1.role}`);

  // 3. Upsert admin@demo.com (Password: password123)
  const demoAdminPassword = await hashPassword('password123');
  const admin2 = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {
      password: demoAdminPassword,
      role: 'admin',
      active: true,
      organizationId: org.id
    },
    create: {
      email: 'admin@demo.com',
      password: demoAdminPassword,
      name: 'Showcase Superadmin',
      role: 'admin',
      phone: '+965 9000 0002',
      active: true,
      organizationId: org.id,
      creditLimit: 100000
    }
  });
  console.log(`✅ [Active] User: ${admin2.email} | Role: ${admin2.role}`);

  console.log('\n======================================================');
  console.log('🎉 Superadmin accounts verified and ready for login:');
  console.log('   1) admin@target-kw.com  / TargetAdmin2026!');
  console.log('   2) admin@demo.com       / password123');
  console.log('======================================================\n');
}

if (require.main === module) {
  ensureAdmin()
    .catch((err) => {
      console.error('❌ Failed ensuring admin accounts:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { ensureAdmin };
